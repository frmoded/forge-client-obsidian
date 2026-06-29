// v0.2.213 — pure-core: extract the click-target's wikilink href, with
// the CM6 fallback selector chain.
//
// Background: v0.2.206 introduced maybeInterceptEngineChipClick using
// only `closest('a.internal-link')`. In reading mode this works — the
// rendered note is a static HTML tree with anchor tags. In source mode
// and many live-preview shapes, Obsidian uses a CM6 ViewPlugin that
// decorates wikilinks as inline spans with class
// `.cm-hmd-internal-link` / `.cm-link`, with NO surrounding `<a>`
// element. The reading-mode-only selector missed those entirely, so
// the interceptor never fired in source mode → Obsidian default
// link-create reopened the forensic shadow even after v0.2.212's
// cleanup. v0.2.211 + v0.2.212 driver smokes surfaced this.
//
// This module isolates the selector + href extraction so it can be
// `node --test`-ed under JSDOM-style fixtures without an Obsidian
// runtime. Mirrors the pattern at main.ts:721-726 (forge-action
// click handler) and edges-hover.ts:65-67 which both already use
// the `??` fallback and work correctly across all render modes.

/** Result of resolving a click target to an engine-chip wikilink.
 *  `null` means the click wasn't on a wikilink we recognize. */
export interface ResolvedChipClickTarget {
  /** Bare wikilink target with `[[ ]]` stripped + alias/heading
   *  trimmed. Caller uses this for catalog lookup. */
  bare: string;
  /** The full href shape, suitable for downstream
   *  `metadataCache.getFirstLinkpathDest` resolution (preserves
   *  alias/heading metadata that bare strips). */
  href: string;
}

/** Resolve a click target to an engine-chip wikilink, with CM6
 *  fallback for source mode + live-preview decorated links.
 *
 *  Selector chain (in order):
 *    1. `a.internal-link`         — reading mode (real anchor)
 *    2. `.cm-hmd-internal-link`   — CM6 source mode (decorated span)
 *    3. `.cm-link`                — CM6 live-preview (broader)
 *
 *  Href extraction tries `data-href` then `href` then textContent
 *  (last-resort for CM6 elements that don't carry data-href; the
 *  text node holds the literal wikilink target).
 *
 *  Returns `null` when no wikilink is found or the resolved href is
 *  empty.
 */
export function resolveEngineChipClickTarget(
  target: Element | null,
): ResolvedChipClickTarget | null {
  if (!target) return null;
  const link = (target.closest('a.internal-link') as Element | null)
    ?? (target.closest('.cm-hmd-internal-link') as Element | null)
    ?? (target.closest('.cm-link') as Element | null);
  if (!link) return null;

  let href = link.getAttribute('data-href')
    ?? link.getAttribute('href')
    ?? '';
  if (!href) {
    // CM6 fallback: text content holds the literal wikilink target.
    // Some decorations include the surrounding `[[` `]]`; strip.
    href = (link.textContent ?? '').trim();
    if (href.startsWith('[[') && href.endsWith(']]')) {
      href = href.slice(2, -2);
    }
  }
  if (!href) return null;

  const bare = href.split(/[#|]/)[0].trim();
  if (!bare) return null;
  return { bare, href };
}
