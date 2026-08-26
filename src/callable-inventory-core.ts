// Drain 2026-08-24-1000 — the callable inventory.
//
// THE PROBLEM this exists to end. The driver's 2026-08-24 run: the
// model emitted `Call [[random_float]]`, the closure check rejected it
// AFTER generation, and the rejection text amounted to "you called
// something that isn't callable" — addressed to a model that had never
// been shown what IS. The model knows the engine chip catalog (it emits
// `# missing chip:` correctly), but it generates blind to the vault's
// own notes as vocabulary.
//
// THE CONTRACT (§8 of the drain, and the reason this module exists at
// all): the list the model is SHOWN and the list the closure check
// VALIDATES AGAINST are the same object, derived once. Not two
// computations that agree today. A closure failure must henceforth mean
// "the model ignored the list", never "the model wasn't told".
//
// Enforcement is structural: `buildCallableInventory` is the only
// producer, `callableNamesFrom` is the only way to get the validation
// set, and it takes the inventory as its argument. There is no path to
// a closure set that did not come from the payload's own list.
// `callable-inventory-core.test.ts` pins that with a test that fails
// when the two are computed independently.

/** One callable the model may reference as `[[name]]`.
 *
 *  `name` is what a Recipe writes. `qualified` is the registry id when
 *  it differs (a note in a subdirectory), kept so the closure check
 *  accepts either spelling — the LLM legitimately produces both, and
 *  v0.2.186 established that path-shaped wikilinks are valid output. */
export interface CallableEntry {
  name: string;
  qualified?: string;
  inputs: string[];
  summary: string;
  kind: 'note' | 'chip';
}

/** A vault action note as the registry reports it, plus the Description
 *  summary the Pyodide helper extracts. Structural, so the test can
 *  build one without a registry. */
export interface VaultNoteInput {
  id: string;
  type?: string;
  inputs?: string[];
  summary?: string;
}

/** An engine chip as `libraryNoteIndex` holds it. */
export interface LibraryChipInput {
  name: string;
  inputs?: string[];
  description?: string;
}

/** First sentence of a Description, for the one-line summary.
 *
 *  §8: "Don't send full Descriptions." Cuts at the first sentence
 *  terminator followed by whitespace, falls back to the first line, and
 *  hard-caps so one pathological note cannot dominate the inventory
 *  budget (§1c). Returns '' for empty/absent input rather than a
 *  placeholder — an entry with no summary still belongs in the list;
 *  its name and signature are the load-bearing parts. */
export function firstSentence(text: string | undefined, maxChars = 120): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const m = flat.match(/^(.*?[.!?])(\s|$)/);
  let out = (m ? m[1] : flat).trim();
  if (out.length > maxChars) out = out.slice(0, maxChars - 1).trimEnd() + '…';
  return out;
}

/** Build the inventory. THE single producer.
 *
 *  Vault notes first, then engine chips: a vault note shadows a
 *  same-named chip everywhere else in the system (A4, the registry's
 *  resolution order, the /generate dep-dedup), so the inventory the
 *  model reads must agree or it would be shown a chip that its own call
 *  would not reach.
 *
 *  Only `type: action` notes are callable, and only those are listed.
 *  Notes with no derivable signature still appear (§1d) — an empty
 *  `inputs` renders as a no-argument call, which is exactly what a note
 *  with no declared inputs is. */
export function buildCallableInventory(
  vaultNotes: readonly VaultNoteInput[],
  libraryChips: readonly LibraryChipInput[] = [],
): CallableEntry[] {
  const out: CallableEntry[] = [];
  const seen = new Set<string>();

  for (const note of vaultNotes) {
    if (!note.id) continue;
    if (note.type !== undefined && note.type !== 'action') continue;
    const bare = note.id.includes('/') ? (note.id.split('/').pop() ?? note.id) : note.id;
    if (seen.has(bare)) continue;
    seen.add(bare);
    out.push({
      name: bare,
      ...(bare === note.id ? {} : { qualified: note.id }),
      inputs: [...(note.inputs ?? [])],
      summary: firstSentence(note.summary),
      kind: 'note',
    });
  }

  for (const chip of libraryChips) {
    if (!chip.name || seen.has(chip.name)) continue;
    seen.add(chip.name);
    out.push({
      name: chip.name,
      inputs: [...(chip.inputs ?? [])],
      summary: firstSentence(chip.description),
      kind: 'chip',
    });
  }

  return out;
}

/** THE validation set — the closure check's only legitimate source.
 *
 *  Takes the inventory rather than recomputing from the registry, which
 *  is the whole point: whatever the model was shown is exactly what it
 *  is held to. Includes both spellings of a subdirectory note, since
 *  both are valid Recipe output. */
export function callableNamesFrom(
  inventory: readonly CallableEntry[],
): Set<string> {
  const names = new Set<string>();
  for (const entry of inventory) {
    names.add(entry.name);
    if (entry.qualified) names.add(entry.qualified);
  }
  return names;
}

/** One line per callable — the compact form (§1c: no retrieval, no
 *  filtering, one line each). Exported so the suite can measure the
 *  block's size against a real vault, and so the server's rendering can
 *  be compared against a canonical reference. */
export function renderCallableLine(entry: CallableEntry): string {
  const sig = entry.inputs.length
    ? `[[${entry.name}]] with ${entry.inputs.join(', ')}`
    : `[[${entry.name}]]`;
  return entry.summary ? `${sig} — ${entry.summary}` : sig;
}

export function renderCallableInventory(
  inventory: readonly CallableEntry[],
): string {
  return inventory.map(renderCallableLine).join('\n');
}

/** Drain 2026-08-26-1020 (§1) — mark the target's OWN entry as itself.
 *
 *  2360 removed the target from this list entirely. That stopped the
 *  mirror and, three drains later, produced the factorial/show_factorial
 *  mutual cycle: with self gone, the nearest callable was a sibling that
 *  called back. Re-including it as a plain entry would restore the
 *  original mirror, because the note's own summary describes exactly
 *  what the caller wants — so it is included LABELED, and the shape gate
 *  (recursion-shape-core) holds the mirror out by structure instead.
 *
 *  Labeling happens HERE, at the one producer, for drain 1000's
 *  one-object reason: the prompt payload, the closure check's
 *  accept-set and 2310's belt all see the same list. Self is a known id
 *  again for all three at once.
 */
export function labelSelfInInventory(
  entries: readonly CallableEntry[],
  targetSnippetId: string | undefined | null,
  label: (summary: string) => string,
): CallableEntry[] {
  if (!targetSnippetId) return [...entries];
  const targetBase = targetSnippetId.includes('/')
    ? (targetSnippetId.split('/').pop() ?? targetSnippetId)
    : targetSnippetId;
  return entries.map((e) => {
    const isSelf = e.name === targetBase
      || e.qualified === targetSnippetId
      || e.name === targetSnippetId;
    return isSelf ? { ...e, summary: label(e.summary) } : e;
  });
}
