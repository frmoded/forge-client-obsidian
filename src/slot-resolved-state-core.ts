// v0.2.210 — V2.1 Slot resolution Phase 3.5: pure-core for the
// "resolved vs unresolved" differentiation.
//
// Phase 3 (v0.2.202) highlighted ALL `{{...}}` in `# Recipe` with the
// same bright-yellow class. Phase 3.5 differentiates:
//   - Unresolved → bright yellow (existing class kept)
//   - Resolved   → muted green-ish + italic (new class)
//
// Resolution lives in the `slot_cache` frontmatter, keyed by
// sha256(slot_text, snippet_id, surrounding_context) per the
// v0.2.70 cross-language contract. The async hash is computed by
// computeSlotCacheKey in slot-resolver-factory-core.ts.
//
// This module isolates two pure helpers:
//   - extractSlotCacheKeys: read the `slot_cache:` block from a YAML
//     frontmatter as a Set<string> of cache-key hex digests
//   - matchSlotToResolution: given (slot text, snippet_id, cache key
//     set, async hasher), resolve the slot's status
//
// Both are pure — testable under `node --test` without an EditorView.
// The CM6 ViewPlugin orchestrates them off the main update loop.

/** Slot resolution status the ViewPlugin uses to pick a decoration
 *  class. `unknown` is the transitional state before the async
 *  hash settles. */
export type SlotResolutionState = 'resolved' | 'unresolved' | 'unknown';

/** Read the `slot_cache:` mapping from a YAML frontmatter block as a
 *  Set of cache-key hex digests. Each key is a 64-char lowercase hex
 *  string (sha256 hex). Defensive: if the frontmatter is missing,
 *  malformed, or `slot_cache` isn't a mapping, returns an empty set.
 *
 *  Doesn't parse the value side of the mapping (the cached resolved
 *  Python expression); the ViewPlugin only needs key presence.
 *
 *  Recognizes both block-mapping form (engine emits this):
 *      slot_cache:
 *        abc123...:
 *          resolved_expression: '"hello"'
 *          ts: '2026-06-29T...'
 *
 *  and the flat single-line form (compact future-proofing):
 *      slot_cache: { "abc123...": "...", ... }
 *
 *  Returns: Set of hex keys present in the cache. */
export function extractSlotCacheKeys(body: string): Set<string> {
  const out = new Set<string>();
  if (!body || !body.startsWith('---')) return out;
  // Find the closing `---` of the frontmatter block.
  const close = body.indexOf('\n---', 4);
  if (close === -1) return out;
  const fm = body.slice(4, close);
  // Locate `slot_cache:` line.
  const lines = fm.split('\n');
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^slot_cache:\s*/.test(lines[i])) { idx = i; break; }
  }
  if (idx === -1) return out;
  const header = lines[idx];
  // Flat single-line form: `slot_cache: { "key": ..., ... }`.
  const flatMatch = header.match(/^slot_cache:\s*\{(.*)\}\s*$/);
  if (flatMatch) {
    const keyRe = /["']([a-f0-9]{64})["']/g;
    let m;
    while ((m = keyRe.exec(flatMatch[1])) !== null) {
      out.add(m[1]);
    }
    return out;
  }
  // Block-mapping form: keys are indented children of `slot_cache:`.
  // A child key looks like `  abc123...:` (deeper indent than the
  // header). Stop at the first line whose indent matches the header
  // (next top-level key) or at end-of-frontmatter.
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    // Top-level (zero-indent) line ends slot_cache's mapping.
    if (!/^\s/.test(line)) break;
    const keyMatch = line.match(/^\s+([a-f0-9]{64}):/);
    if (keyMatch) out.add(keyMatch[1]);
  }
  return out;
}

/** Given a slot text, the note's snippet_id, and the cache-key set,
 *  hash the slot triple via the injected hasher (typically
 *  computeSlotCacheKey from slot-resolver-factory-core) and return
 *  whether the resulting key is in the cache. The async signature
 *  keeps the pure-core testable in isolation by mocking the hasher.
 *
 *  Returns 'resolved' iff the computed key appears in cacheKeys.
 *  Returns 'unresolved' iff the key is NOT in cacheKeys.
 *  The 'unknown' state isn't produced here; the orchestrator returns
 *  it before the async hash settles.
 */
export async function matchSlotToResolution(
  slotText: string,
  snippetId: string,
  cacheKeys: ReadonlySet<string>,
  hasher: (slotText: string, snippetId: string, surroundingContext?: string) => Promise<string>,
): Promise<SlotResolutionState> {
  const key = await hasher(slotText, snippetId, '');
  return cacheKeys.has(key) ? 'resolved' : 'unresolved';
}
