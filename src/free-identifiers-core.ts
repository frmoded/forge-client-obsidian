// Drain 2026-08-24-2310 — the enforcement belt for `Input`.
//
// The driver's Description said "an input var scale"; the model wrote
// `scale` free, with no declaration — the second time in three live
// runs. Drain 2000's own live measurements put Input adherence at 3/3
// and Return adherence at 1/3 in one session: adherence WOBBLES, so
// prompt guidance cannot be the guarantee. Drain 0900 reached the same
// conclusion about the duplicated Return and built a postprocessor;
// this is the same move for a defect that cannot be repaired by
// rewriting, only by rejecting.
//
// Third layer: the prompt mandates `Input`, the sanitizer can no longer
// eat it (drain 1600), and now the generator cannot omit it.
//
// SCOPE — generated output ONLY (§(c)). Hand-authored Recipes keep
// legacy free-variable promotion; the generation path knows it is
// generating, so the belt lives there and nowhere else.
//
// WHY A LINE SCANNER AND NOT THE REAL PARSER. The engine's E-- parser
// lives in Python behind Pyodide; this check runs in the same
// synchronous stretch as the closure check, before anything is written.
// The scanner is deliberately CONSERVATIVE in the direction that
// matters: anything it cannot confidently classify as a reference is
// left out, so it under-reports rather than rejecting a good Recipe.
// A false rejection blocks authoring; a false pass merely leaves the
// pre-existing NameError, which is where we already were.

/** E-- keywords and literals — never user identifiers. */
const KEYWORDS: ReadonlySet<string> = new Set([
  'Let', 'Input', 'Return', 'Call', 'with', 'If', 'Otherwise',
  'For', 'each', 'in', 'Repeat', 'times',
  'True', 'False', 'None', 'and', 'or', 'not',
]);

/** Strip the parts of a line that can never contain a reference:
 *  `{{ slot prose }}`, `[[wikilinks]]`, quoted strings, and comments. */
function stripNonReferenceSpans(line: string): string {
  return line
    // Slots carry prose aimed at an LLM, not code. Flagging their words
    // would reject every slot-bearing Recipe — which is exactly the
    // shape the driver's note had.
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/#.*$/, ' ');
}

/** Identifiers referenced by an expression fragment.
 *
 *  Kwarg NAMES are dropped: in `Call [[go]] with state=start.` the left
 *  side of `=` names a parameter on the callee, and only the right side
 *  can be free. */
function referencesIn(expr: string): string[] {
  const withoutKwargNames = expr.replace(/\b[A-Za-z_]\w*\s*=(?!=)/g, ' ');
  return [...withoutKwargNames.matchAll(/[A-Za-z_]\w*/g)]
    .map((m) => m[0])
    .filter((name) => !KEYWORDS.has(name));
}

/**
 * Names a generated Recipe references but never declares.
 *
 * Declarations recognised: `Input NAME: ...`, `Let NAME = ...`, and a
 * `For each NAME in ...` loop variable. Callables come from the shared
 * inventory (drain 1000) — the SAME set the closure check validates
 * against, so the two cannot disagree about what is callable.
 *
 * Returns a sorted, de-duplicated list; empty means the Recipe is
 * closed over its own declarations.
 */
export function collectFreeIdentifiers(
  recipeBody: string,
  callables: ReadonlySet<string>,
): string[] {
  const declared = new Set<string>();
  const referenced: string[] = [];

  for (const rawLine of recipeBody.split('\n')) {
    const line = stripNonReferenceSpans(rawLine).trim();
    if (line === '') continue;

    // `Input NAME: TYPE = DEFAULT.` — declares NAME. Everything after
    // the colon is a type annotation and a literal default, neither of
    // which references anything.
    const input = line.match(/^Input\s+([A-Za-z_]\w*)\s*:/);
    if (input) { declared.add(input[1]); continue; }

    // `Let NAME = <expr>.` — declares NAME, scans the expression.
    // Declared BEFORE scanning so a self-referential `Let x = x + 1.`
    // reads as bound rather than free; that is a different defect and
    // not this belt's business.
    const let_ = line.match(/^Let\s+([A-Za-z_]\w*)\s*=(.*)$/);
    if (let_) {
      declared.add(let_[1]);
      referenced.push(...referencesIn(let_[2]));
      continue;
    }

    // `For each NAME in <expr>:` — the loop variable is bound by the
    // loop itself.
    const forEach = line.match(/^For\s+each\s+([A-Za-z_]\w*)\s+in\s+(.*):$/);
    if (forEach) {
      declared.add(forEach[1]);
      referenced.push(...referencesIn(forEach[2]));
      continue;
    }

    referenced.push(...referencesIn(line));
  }

  const free = new Set(
    referenced.filter((name) => !declared.has(name) && !callables.has(name)),
  );
  return [...free].sort();
}

/** The cohort-facing rejection message.
 *
 *  Mirrors the closure-failure voice: name what is wrong, then the
 *  shape of the repair. The Description almost always names the input in
 *  prose — that is how the driver hit this — so the message points back
 *  at the Description rather than blaming the note. */
export function freeIdentifierRejectionMessage(free: readonly string[]): string {
  const names = free.map((n) => `\`${n}\``).join(', ');
  const plural = free.length > 1;
  return (
    `The generated Recipe uses ${names} without declaring ${plural ? 'them' : 'it'}. `
    + `The Description mentions ${plural ? 'inputs' : 'an input'} the Recipe didn't declare — `
    + `expected ${free.map((n) => `\`Input ${n}: <type> = <default>.\``).join(' and ')}. `
    + `Your previous Recipe is preserved; run again, or name the ${plural ? 'inputs' : 'input'} `
    + `more explicitly in the Description.`
  );
}
