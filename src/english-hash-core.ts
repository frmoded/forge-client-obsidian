// v0.2.72 — TypeScript parallel of forge.core.slot_cache.compute_english_hash.
//
// B7.3 unified-cache contract: the plugin computes english_hash to
// write into the snippet's frontmatter alongside generated # Python.
// The engine recomputes the same hash on each compute and compares
// against the stored value to decide cache hit vs re-transpile.
//
// Cross-language byte-for-byte parity is the freeze contract:
//   computeEnglishHash(text)  in TypeScript
//   ===
//   compute_english_hash(text) in Python
// for every text. Pinned via a hardcoded-expectation test below.
//
// Normalization: trim trailing whitespace per line, strip leading
// and trailing fully-blank lines, preserve internal blank lines.
// Hash hex sha256 of the normalized UTF-8 bytes.
//
// Pure-core extraction #31. No `obsidian` import.

/** Stable hash of an English facet for B7.3 cache invalidation.
 *  Mirrors forge.core.slot_cache.compute_english_hash byte-for-byte.
 *
 *  Returns hex-encoded sha256 string (64 chars, lowercase). */
export async function computeEnglishHash(
  englishText: string | null | undefined,
): Promise<string> {
  if (englishText === null || englishText === undefined) {
    englishText = '';
  }
  if (typeof englishText !== 'string') {
    throw new TypeError(
      `englishText must be string or null, got ${typeof englishText}`);
  }

  // Trim trailing whitespace per line. Split on \n only; \r-trailing
  // is taken as trailing whitespace and stripped (parity with Python's
  // str.rstrip()).
  const rawLines = englishText.split('\n');
  // Python's str.rstrip() with no args strips trailing whitespace
  // including \r, \t, \v, \f, and \xA0 — match by stripping any
  // Unicode whitespace at end-of-line.
  const lines = rawLines.map((l) => l.replace(/[\s﻿\xA0]+$/g, ''));

  // Strip leading + trailing fully-blank lines.
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const normalized = lines.join('\n');

  // sha256 via SubtleCrypto.
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
