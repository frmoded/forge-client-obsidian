// [2026-08-06-0000-cw-plugin-inline-action-note-execution-tier-1]
// Inline action-note execution, Tier 1: a prose note embeds
// `[[<action-note-id> inline]]`; in rendered views the link becomes a
// play card that executes the target's Recipe headlessly and shows
// the output in place. Zero-input notes only — targets that declare
// inputs get an "Open note to run" fallback instead of a play button.
//
// Pure-core: no obsidian imports. DOM built through the same
// structural McqElement/McqDocument interfaces mcq-widget-core uses;
// execution orchestrated through a narrow adapter so the whole
// decision surface tests headlessly (L56).

import { parseMcqOutput } from './mcq-widget-core.ts';
import type {
  McqDocument,
  McqElement,
  McqRender,
} from './mcq-widget-core.ts';

export const INLINE_MODIFIER_SUFFIX = ' inline';

export interface InlineWikilinkParse {
  noteId: string;
  inline: boolean;
}

/** Parse the inner text of a wikilink. `foo inline` → inline widget
 *  on note `foo`. Anything else — including `foo bar` where the last
 *  word isn't exactly `inline` — is a plain link whose note id is the
 *  full text (note-ids may contain spaces; we only claim the exact
 *  ` inline` suffix). A wikilink whose ENTIRE text is `inline` is a
 *  plain link to a note named "inline". */
export function parseInlineWikilink(inner: string): InlineWikilinkParse {
  const text = inner.trim();
  if (text.endsWith(INLINE_MODIFIER_SUFFIX)) {
    const noteId = text.slice(0, -INLINE_MODIFIER_SUFFIX.length).trim();
    if (noteId.length > 0) return { noteId, inline: true };
  }
  return { noteId: text, inline: false };
}

/** Rendered wikilinks arrive in the post-processor as
 *  `a.internal-link` with the raw text in data-href. Returns the
 *  target note id when the href carries the inline modifier, else
 *  null (leave the link alone). */
export function inlineTargetFromHref(
  href: string | null | undefined,
): string | null {
  if (!href) return null;
  const parsed = parseInlineWikilink(href);
  return parsed.inline ? parsed.noteId : null;
}

/** Tier-1 gate: only zero-input targets get a live play button. */
export function decideInlinePlay(
  frontmatter: Record<string, unknown> | null | undefined,
): 'play' | 'open-note' {
  const inputs = frontmatter?.inputs;
  if (Array.isArray(inputs) && inputs.length > 0) return 'open-note';
  // Non-array truthy `inputs` (mapping form etc.) is still inputs.
  if (inputs && !Array.isArray(inputs)) return 'open-note';
  return 'play';
}

/** Cache-miss fallback for the Tier-1 gate: scan the raw frontmatter
 *  block for an `inputs:` declaration. Conservative — any declared
 *  inputs other than the literal empty list counts as has-inputs
 *  (worst case the cohort gets the safe "open note" fallback). */
export function hasInputsInRawFrontmatter(content: string): boolean {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return false;
  const line = fmMatch[1].match(/^inputs:\s*(.*)$/m);
  if (!line) return false;
  return line[1].trim() !== '[]';
}

export interface InlinePlayCardRefs {
  card: McqElement;
  playBtn: McqElement;
  outputEl: McqElement;
}

/** Build the card DOM (§Part 2 of the drain prompt). The caller wires
 *  the click listener on `playBtn` — event APIs stay outside the
 *  structural interface on purpose. */
export function renderInlinePlayCard(
  title: string,
  container: McqElement,
  doc: McqDocument,
): InlinePlayCardRefs {
  const card = doc.createElement('div');
  card.className = 'forge-inline-play-card';

  const titleEl = doc.createElement('span');
  titleEl.className = 'forge-inline-title';
  titleEl.textContent = title;
  card.appendChild(titleEl);

  const playBtn = doc.createElement('button');
  playBtn.className = 'forge-inline-play-btn';
  playBtn.textContent = '▶';
  card.appendChild(playBtn);

  const outputEl = doc.createElement('div');
  outputEl.className = 'forge-inline-output';
  card.appendChild(outputEl);

  container.appendChild(card);
  return { card, playBtn, outputEl };
}

export type InlinePlayOutcome =
  | { kind: 'not-found'; text: string }
  | { kind: 'open-note'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'output'; text: string };

export interface InlinePlayDeps {
  /** Resolve the target by PATH (`<noteId>.md` relative to vault
   *  root — the V1 snippet-id convention; no basename fallback). */
  resolveNote(noteId: string): Promise<
    { path: string; content: string; frontmatter: Record<string, unknown> | null } | null
  >;
  /** L29 — push fresh disk content into pyodide MEMFS pre-compute. */
  syncToEngine(path: string, content: string): Promise<void>;
  /** Derive the engine snippet id for a vault-relative path. */
  snippetIdForPath(path: string): string;
  /** Execute headlessly (computeViaEngine shape) → rendered text. */
  compute(snippetId: string): Promise<string>;
}

/** The play-click decision chain, engine-free for headless tests:
 *  resolve → Tier-1 input gate → MEMFS sync → compute. */
export async function runInlinePlay(
  deps: InlinePlayDeps,
  noteId: string,
): Promise<InlinePlayOutcome> {
  const target = await deps.resolveNote(noteId);
  if (!target) {
    return { kind: 'not-found', text: `Note not found: ${noteId}` };
  }
  if (decideInlinePlay(target.frontmatter) === 'open-note') {
    return { kind: 'open-note', text: 'Open note to run (has inputs).' };
  }
  try {
    await deps.syncToEngine(target.path, target.content);
    const text = await deps.compute(deps.snippetIdForPath(target.path));
    return { kind: 'output', text };
  } catch (e) {
    return {
      kind: 'error',
      text: `Run failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export type InlineOutputClassification =
  | { kind: 'mcq'; render: McqRender }
  | { kind: 'text' };

/** Inline output reuses the drain-1300 MCQ card when the text parses
 *  as an MCQ verdict; plain text otherwise. */
export function classifyInlineOutput(text: string): InlineOutputClassification {
  const render = parseMcqOutput(text);
  return render ? { kind: 'mcq', render } : { kind: 'text' };
}
