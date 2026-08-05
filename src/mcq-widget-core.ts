// MCQ display widget — pure core. Drain 2026-08-05-1300.
//
// `[[mcq]]` (forge.core.lib, drain 2026-08-03-1125) returns a plain
// string. The Forge Output panel renders it as text. This module parses
// that string back into its parts so the panel can render a card.
//
// VIEW-SIDE ONLY. Nothing here touches what the engine returns, what
// gets written to a note, or what git sees. If the cohort copies the
// output or commits the note, it is still the plain string. A parse
// failure is not an error — it means "this isn't an MCQ", and the panel
// falls through to its existing plain-text render.
//
// THE FORMAT, AS THE ENGINE ACTUALLY EMITS IT
// -------------------------------------------
//   correct: f"✓ Correct — {opts[correct_index]}."
//   wrong:   f"✗ Not quite. You picked {opts[guess]!r}; the correct "
//            f"answer is {opts[correct_index]!r}."
//   then:    f"{base} {explanation}" when explanation is non-empty
//
// The two branches are NOT symmetric, and the drain prompt's spec did
// not mention it: the correct branch interpolates the choice BARE, the
// wrong branch goes through Python's `!r` (repr). So the wrong branch's
// values arrive quoted — normally `'single'`, but Python switches to
// `"double"` when the value itself contains an apostrophe. A parser
// that assumed one quote style would silently fail on a choice like
// `it's major`, which is exactly the kind of string a music-theory
// question might contain.
//
// ON STRICTNESS
// -------------
// The prompt's §Don'ts warns against over-permissiveness, and it is the
// right worry: this parser runs against EVERY string a Recipe returns.
// A false positive would replace someone's ordinary text output with a
// quiz card. So the patterns are anchored at both ends of the diagnosis
// clause and require the full shape — a bare `✓`, or `✓ Correct`
// without ` — value.`, does not match.

/** One parsed MCQ result. */
export type McqRender = {
  verdict: 'correct' | 'wrong';
  /** The choice the cohort picked. */
  guessText: string;
  /** The right answer. Equals `guessText` on the correct branch. */
  correctText: string;
  /** Everything after the diagnosis sentence. May be empty. */
  explanation: string;
  /** Wikilink targets cited in the explanation, in order, deduped. */
  wikilinks: string[];
};

/** The minimal slice of `Document` the renderer needs.
 *
 *  Declared structurally rather than imported so this file stays free
 *  of both `obsidian` and `lib.dom` — the repo's pure-core convention.
 *  The real `document` satisfies it; tests pass a small fake. */
export interface McqElement {
  className: string;
  textContent: string | null;
  appendChild(child: McqElement): void;
  setAttribute(name: string, value: string): void;
  readonly tagName: string;
  readonly children: McqElement[];
}

export interface McqDocument {
  createElement(tag: string): McqElement;
}

// The correct branch. `—` is an em-dash, emitted literally by the
// engine. The value runs to the final period; `.+?` with the anchored
// `\.$` keeps a value containing a period from truncating early.
const CORRECT_RE = /^✓ Correct — (.+?)\.$/;

// The wrong branch's diagnosis sentence. Quotes are captured as a
// backreference so `'x'` and `"x"` both work while `'x"` does not.
const WRONG_RE = new RegExp(
  '^✗ Not quite\\. You picked (["\'])(.*?)\\1; '
  + 'the correct answer is (["\'])(.*?)\\3\\.',
);

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/** Wikilink targets in `text`, in order, deduped, alias-stripped.
 *
 *  `[[a|b]]` cites `a` — the alias is display text, not a target. */
export function extractWikilinks(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(WIKILINK_RE)) {
    const target = m[1].split('|')[0].trim();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}

/** Parse `[[mcq]]` output, or return null if `text` isn't MCQ output.
 *
 *  Null is the common case and is not a failure — see the header. */
export function parseMcqOutput(text: unknown): McqRender | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const correct = CORRECT_RE.exec(trimmed);
  if (correct) {
    const value = correct[1];
    return {
      verdict: 'correct',
      guessText: value,
      // On the correct branch the guess IS the answer. Reported rather
      // than left undefined so a caller can render both slots without
      // branching on verdict.
      correctText: value,
      // The engine appends no explanation on the correct branch — the
      // f-string has no slot for one. Empty, not "unknown".
      explanation: '',
      wikilinks: [],
    };
  }

  const wrong = WRONG_RE.exec(trimmed);
  if (!wrong) return null;
  const explanation = trimmed.slice(wrong[0].length).trim();
  return {
    verdict: 'wrong',
    guessText: wrong[2],
    correctText: wrong[4],
    explanation,
    wikilinks: extractWikilinks(explanation),
  };
}

/** Split `explanation` into text runs and wikilink runs, in order.
 *
 *  Exported for the renderer and for tests: getting the interleaving
 *  right is the part most likely to break, and it is easier to assert
 *  on a list of runs than on a DOM tree. */
export function splitExplanation(
  explanation: string,
): Array<{ kind: 'text' | 'link'; value: string }> {
  const runs: Array<{ kind: 'text' | 'link'; value: string }> = [];
  let cursor = 0;
  for (const m of explanation.matchAll(WIKILINK_RE)) {
    const at = m.index ?? 0;
    if (at > cursor) {
      runs.push({ kind: 'text', value: explanation.slice(cursor, at) });
    }
    runs.push({ kind: 'link', value: m[1].split('|')[0].trim() });
    cursor = at + m[0].length;
  }
  if (cursor < explanation.length) {
    runs.push({ kind: 'text', value: explanation.slice(cursor) });
  }
  return runs;
}

/** Build the card into `container`.
 *
 *  Wikilinks become `<a class="internal-link" data-href=...>`, which is
 *  what Obsidian's own click handler looks for — so they resolve the
 *  same way a link typed in a note does, without this module importing
 *  anything from `obsidian`.
 */
export function renderMcqCard(
  render: McqRender,
  container: McqElement,
  doc: McqDocument,
): void {
  const card = doc.createElement('div');
  card.className = `forge-mcq-card forge-mcq-${render.verdict}`;

  const verdict = doc.createElement('span');
  verdict.className = `forge-mcq-verdict forge-mcq-verdict-${render.verdict}`;
  verdict.textContent = render.verdict === 'correct' ? '✓ Correct' : '✗ Not quite';
  card.appendChild(verdict);

  const guess = doc.createElement('div');
  guess.className = 'forge-mcq-guess';
  guess.textContent = render.guessText;
  card.appendChild(guess);

  // Only the wrong branch shows the answer. On the correct branch the
  // guess line already IS the answer, and repeating it reads as though
  // two different things are being reported.
  if (render.verdict === 'wrong') {
    const answer = doc.createElement('div');
    answer.className = 'forge-mcq-answer';
    answer.textContent = `Correct answer: ${render.correctText}`;
    card.appendChild(answer);
  }

  if (render.explanation) {
    const body = doc.createElement('p');
    body.className = 'forge-mcq-explanation';
    for (const run of splitExplanation(render.explanation)) {
      if (run.kind === 'text') {
        const span = doc.createElement('span');
        span.textContent = run.value;
        body.appendChild(span);
      } else {
        const a = doc.createElement('a');
        a.className = 'internal-link forge-mcq-link';
        a.textContent = run.value;
        a.setAttribute('data-href', run.value);
        a.setAttribute('href', run.value);
        body.appendChild(a);
      }
    }
    card.appendChild(body);
  }

  container.appendChild(card);
}
