// v0.2.182 — Description-facet stable hash for V2 cache invalidation.
//
// Parallels english-hash-core.ts byte-for-byte. The V2 /generate flow
// computes this hash over the # Description body text after the LLM
// produces E-- and writes it back to frontmatter. On every Forge-click
// the plugin re-hashes the current Description and compares; mismatch
// = stale indicator + invitation to /generate again.
//
// Cross-language parity is NOT required here yet (V2 /generate runs
// entirely plugin-side; the engine doesn't recompute description_hash
// for cache hits the way it does for english_hash). But the hash
// function uses the same normalization shape so a future engine-side
// equivalent can be byte-for-byte identical without re-implementation.
//
// Normalization: trim trailing whitespace per line, strip leading
// and trailing fully-blank lines, preserve internal blank lines.
// Hash hex sha256 of the normalized UTF-8 bytes.
//
// Pure-core extraction. No `obsidian` import.

/** Stable hash of a Description facet for V2 cache invalidation.
 *  Returns hex-encoded sha256 string (64 chars, lowercase). */
export async function computeDescriptionHash(
  descriptionText: string | null | undefined,
): Promise<string> {
  if (descriptionText === null || descriptionText === undefined) {
    descriptionText = '';
  }
  if (typeof descriptionText !== 'string') {
    throw new TypeError(
      `descriptionText must be string or null, got ${typeof descriptionText}`);
  }

  const rawLines = descriptionText.split('\n');
  // Strip any trailing Unicode whitespace per line (matches Python rstrip()).
  const lines = rawLines.map((l) => l.replace(/[\s﻿\xA0]+$/g, ''));

  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const normalized = lines.join('\n');

  const enc = new TextEncoder();
  const payload = enc.encode(normalized);
  const digestBuf = await crypto.subtle.digest('SHA-256', payload);
  const bytes = new Uint8Array(digestBuf);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
