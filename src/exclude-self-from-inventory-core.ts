// Drain 2026-08-24-2360 — a note is not its own vocabulary.
//
// CCQA generated `Let rand = Call ccqa_random_r2 with scale=1.0.` on a
// fresh note called `ccqa_random_r2`, and the run died with
// `maximum recursion depth exceeded`.
//
// The model did not hallucinate. Probed against a real registry, the
// callables array it was shown for that generation contained:
//
//     [[ccqa_random_r2]] with scale
//         Print a random number between 0 and 1 multpiied by an input var scale
//
// — an entry whose one-line summary is, word for word, the Description
// it had just been asked to implement. Of course it called it. From
// inside the prompt, the target note is indistinguishable from a
// library function that already does exactly the requested job.
//
// That makes this STRUCTURAL, not phrasing-specific: at /generate time
// the target always has a Description (that is the trigger), and the
// inventory is built from all vault action notes, so the mirror is
// present on EVERY generation. CCQA's "random"-flavoured wording was
// the trigger's costume.
//
// WHERE THIS RUNS. At `buildGenerateCallables`, the single producer —
// the same object that becomes the prompt payload, the closure check's
// accept-set (`callableNamesFrom`), and drain 2310's free-variable
// belt. Filtering in one consumer would leave the other two
// disagreeing, and it is precisely that agreement drain 1000 built.
// Excluding here also means the closure check stops accepting a
// self-call in the same motion, which is what converts a silent
// infinite recursion into a rejection the cohort can read.

import type { VaultNoteInput } from './callable-inventory-core.ts';

/** Last path segment of a snippet id. */
function basename(id: string): string {
  const i = id.lastIndexOf('/');
  return i === -1 ? id : id.slice(i + 1);
}

/**
 * Drop the note being generated FOR from the callable inventory.
 *
 * Matching is by id, and ALSO by basename. The basename arm is not
 * laziness — `snippetIdFromPath` falls back to the bare basename for a
 * note in a non-library subdirectory (the miss mode drain 2330
 * documented on `authoring/random_note`), so the target id and the
 * registry id genuinely disagree for the exact note shape the driver
 * has been running all week. Exact-only matching would let that note
 * straight back into its own inventory.
 *
 * KNOWN COST of the basename arm: a same-named note in a different
 * directory is excluded too. That is the right trade. A lost callable
 * costs the model one piece of vocabulary — it emits a
 * `# missing chip:` line or a slot, both visible and recoverable. A
 * self-call costs a `maximum recursion depth exceeded` crash. And a
 * bare `[[name]]` that matches two notes is already ambiguous to the
 * resolver, which has its own collision guard.
 *
 * An empty or absent `targetId` excludes NOTHING. Reading a missing id
 * as "matches everything" would hand /generate an empty inventory, and
 * the service treats a supplied inventory as authoritative (drain
 * 1000) — the model would lose the engine chips as well.
 */
export function excludeSelf<T extends VaultNoteInput>(
  notes: readonly T[],
  targetId: string | undefined | null,
): T[] {
  if (!targetId) return [...notes];
  const targetBase = basename(targetId);
  return notes.filter((n) => {
    const id = n.id ?? '';
    if (id === '') return true;
    if (id === targetId) return false;
    return basename(id) !== targetBase;
  });
}
