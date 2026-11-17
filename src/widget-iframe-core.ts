// 2026-11-17-1000: the widget iframe builder, moved out of html-embed-view.ts UNCHANGED (pure-core convention: no `obsidian` import, so a test can call the production
// function). html-embed-view.ts re-exports it, so every caller's import is the same as before.

/**
 * The ONE place a vault-authored .html widget gets its iframe: a `blob:` URL of the file's content, sandboxed with `allow-scripts`
 * ONLY — never `allow-same-origin` (see the SANDBOXING note at the top of this file) — no wider flags. Extracted
 * (Beat-as-data Phase 5, drain 2026-10-05-2100) so the "Edit rhythm in Rhythm Box" view hosts the widget through the SAME code
 * instead of building a second iframe with its own, possibly looser, settings. Behaviour of the html-embed processor is unchanged.
 * The caller owns revoking `blobUrl` when its host goes away.
 */
export function createSandboxedWidgetIframe(
  parent: HTMLElement,
  html: string,
  heightCss: string,
): { iframe: HTMLIFrameElement; blobUrl: string } {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  // 2026-11-17-1000 — ORDER MATTERS (measured in real Chrome 157): a sandbox attribute governs the NEXT navigation, so an iframe that is attached and given its
  // `src` first loads the widget UNSANDBOXED (origin = the app's, parent.document reachable, localStorage usable) even though `sandbox="allow-scripts"` is on the
  // element a moment later. Obsidian's `parent.createEl` attaches at once, so it cannot be used here. Build the iframe detached, give it its sandbox and every
  // other attribute, then its src, and attach LAST: the first (and only) navigation is already sandboxed.
  const iframe = parent.ownerDocument.createElement('iframe');
  iframe.className = 'forge-html-embed-iframe';
  iframe.sandbox.add('allow-scripts');
  // Drain 2026-10-14-0900 §6 — NOT 'allow-same-origin': with it the widget is same-origin with the app (see the note at the top of html-embed-view.ts).
  iframe.style.height = heightCss;
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.src = blobUrl;
  parent.appendChild(iframe);
  return { iframe, blobUrl };
}
