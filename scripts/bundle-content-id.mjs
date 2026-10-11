// Drain 2026-10-10-2100 (b) — the bundle's CONTENT IDENTITY: a hash of every inlined file's relative path and content.
//
// Baked into the plugin as BUNDLED_ASSETS_CONTENT_ID by inline-bundled-assets.mjs (computed once, there) and written to
// assets/.bundle-content-id from the same value. The runtime compares it — not just the plugin version, which is identical across
// many builds — to decide whether the plugin folder's restored assets and the vaults extracted from them are current.
import crypto from "node:crypto";

/**
 * @param {Iterable<[string, string]>} entries `[relativePath, content]` pairs
 * @returns {string} 16 lowercase hex chars (64 bits — an identity for change detection, not a security boundary)
 */
export function computeBundleContentId(entries) {
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const h = crypto.createHash("sha256");
  for (const [rel, content] of sorted) {
    // NUL separators: neither a path nor UTF-8 text content contains one, so ("ab","c") and ("a","bc") cannot collide.
    h.update(rel, "utf8");
    h.update("\0");
    h.update(content, "utf8");
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}
