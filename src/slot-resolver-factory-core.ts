// v0.2.69-design (Phase 1 §1.3) — pure-core for the plugin-side slot
// resolver factory. NOT YET WIRED into transpile orchestration; Phase
// 2 will connect this to the canonical-form compile path.
//
// The helper takes a snippet-scoped cache dict + a hosted-resolve-slot
// callable and returns an async function that:
//
//   1. Computes a stable cache key for the (slot_text, snippet_id,
//      surrounding_context) triple via the same algorithm used
//      server-side and engine-side (forge.core.slot_cache.compute_slot_cache_key
//      in Python). Tests below verify the key shape; the parallel
//      Python helper guarantees cross-language determinism by hashing
//      the same UTF-8 + null-byte payload.
//
//   2. Checks the cache; on hit, returns the cached python_expr
//      WITHOUT calling the hosted endpoint.
//
//   3. On miss, calls `hosted_resolve_slot(req)`, stores the response
//      in the cache by side-effect (so subsequent calls in the same
//      resolver instance are cache hits), and returns the python_expr.
//
//   4. Errors from `hosted_resolve_slot` propagate to the caller —
//      the transpile pipeline surfaces them as a Notice + error
//      envelope.
//
// Per the design's "two-pass cache-miss seam" (slot-resolution-design.md
// §D), the resolver returned here is what runs when the plugin's
// orchestration layer batches misses, calls /resolve-slot, writes the
// values into the snippet's # Slots heading, and re-fires the
// transpile. So the resolver factory shape is "cache only" plus a
// fallback to hosted_resolve_slot when wired into the engine-resolver
// equivalent. The plugin-side resolver IS the cache-only shape; the
// engine-side resolver IS the throw-on-miss shape. Both are tested
// here as helper variants in Phase 2 if needed.
//
// Pure-core extraction #28. No `obsidian` import; runs cleanly under
// `node --test`.

export interface SlotRequest {
  slot_text: string;
  snippet_id: string;
  surrounding_context: string;
}

export interface SlotResponse {
  python_expr: string;
  cache_key: string;
}

export interface HostedResolveSlot {
  (req: SlotRequest): Promise<SlotResponse>;
}

/** Stable cache key for a (slot_text, snippet_id, surrounding_context)
 *  triple. Hex-encoded sha256 over the UTF-8 + null-byte payload. Must
 *  match `forge.core.slot_cache.compute_slot_cache_key` byte-for-byte —
 *  the engine, plugin, and server all hash the same triple, so the
 *  cache key is a shared dictionary identifier across languages.
 *
 *  Uses Node/Web SubtleCrypto via the global `crypto` interface. The
 *  helper is async because SubtleCrypto.digest is async. Pyodide
 *  doesn't reach this code path (engine has its own Python helper). */
export async function computeSlotCacheKey(
  slot_text: string,
  snippet_id: string,
  surrounding_context: string = '',
): Promise<string> {
  if (typeof slot_text !== 'string') {
    throw new TypeError(`slot_text must be string, got ${typeof slot_text}`);
  }
  if (typeof snippet_id !== 'string') {
    throw new TypeError(
      `snippet_id must be string, got ${typeof snippet_id}`);
  }
  if (typeof surrounding_context !== 'string') {
    throw new TypeError(
      `surrounding_context must be string, got ${typeof surrounding_context}`);
  }

  const enc = new TextEncoder();
  const nul = new Uint8Array([0]);
  const a = enc.encode(slot_text);
  const b = enc.encode(snippet_id);
  const c = enc.encode(surrounding_context);

  // Concatenate: a || \x00 || b || \x00 || c
  const payload = new Uint8Array(a.length + 1 + b.length + 1 + c.length);
  let off = 0;
  payload.set(a, off); off += a.length;
  payload.set(nul, off); off += 1;
  payload.set(b, off); off += b.length;
  payload.set(nul, off); off += 1;
  payload.set(c, off);

  const digestBuf = await crypto.subtle.digest('SHA-256', payload);
  const bytes = new Uint8Array(digestBuf);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Build a slot resolver function with per-snippet cache + hosted-call
 *  fallback. Returns an async callable `(slot_text) => Promise<string>`
 *  whose return is the resolved Python expression.
 *
 *  - `snippet_id`: identifies the snippet this resolver was built for.
 *    Becomes part of the cache key for every slot it resolves.
 *  - `slot_cache`: mutable dict of cache_key → python_expr. Populated
 *    from the snippet's # Slots heading at construction time;
 *    mutated by-side-effect when the resolver hits the hosted call.
 *  - `hosted_resolve_slot`: callback for cache misses. Returns a
 *    `SlotResponse` containing the python_expr + the server-computed
 *    cache_key. The resolver verifies the server's cache_key matches
 *    its locally-computed key (defense against accidental server-side
 *    drift); mismatches raise.
 *
 *  The returned resolver does NOT include the surrounding_context arg
 *  in its public signature — by Phase 1 design it defaults to `''`.
 *  Phase 2 may expose it once the emitter carries source coordinates.
 *  When that happens, this helper's signature widens; existing callers
 *  continue to work because the default value lives at the engine side
 *  (Phase 2's resolver-factory wrapper supplies it). */
export function makeForgeSlotResolver(
  snippet_id: string,
  slot_cache: Record<string, string>,
  hosted_resolve_slot: HostedResolveSlot,
): (slot_text: string) => Promise<string> {
  return async (slot_text: string): Promise<string> => {
    const key = await computeSlotCacheKey(slot_text, snippet_id, '');
    if (key in slot_cache) {
      return slot_cache[key];
    }
    const resp = await hosted_resolve_slot({
      slot_text,
      snippet_id,
      surrounding_context: '',
    });
    if (resp.cache_key !== key) {
      throw new Error(
        `slot resolver: server cache_key ${resp.cache_key} does not ` +
        `match client-computed ${key} for slot_text=${JSON.stringify(slot_text)}`);
    }
    slot_cache[key] = resp.python_expr;
    return resp.python_expr;
  };
}
