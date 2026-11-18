// 2026-11-17-1000: the widget iframe builder, moved out of html-embed-view.ts UNCHANGED (pure-core convention: no `obsidian` import, so a test can call the production
// function). html-embed-view.ts re-exports it, so every caller's import is the same as before.

/** Where the evidence lines go: Info level (a strict console stays clean), permanent. A test (or a caller) can pass its own. */
export type WidgetTrace = (line: string) => void;
const defaultTrace: WidgetTrace = (line) => { console.info(line); };
/** The first 8 characters of a blob URL's uuid: what the console's "Not allowed to load local resource: blob:..." names. Never the whole URL, never the widget's content. */
export function blobId(blobUrl: string): string { const m = /^blob:.*\/([0-9A-Za-z]{8})[0-9A-Za-z-]*$/.exec(blobUrl); return m ? m[1] : 'unknown'; }

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
  opts: { label?: string; trace?: WidgetTrace } = {},
): { iframe: HTMLIFrameElement; blobUrl: string } {
  const trace = opts.trace ?? defaultTrace;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const id = blobId(blobUrl);
  trace(`[forge-widget] blob ${id} created for ${opts.label ?? 'widget'} (${html.length} chars)`);

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
  if (typeof iframe.addEventListener === 'function') iframe.addEventListener('load', () => { trace(`[forge-widget] iframe ${id} loaded`); });
  parent.appendChild(iframe);
  trace(`[forge-widget] iframe ${id} attached (in the document: ${iframe.isConnected})`);
  return { iframe, blobUrl };
}

/**
 * Revoke a widget's blob URL and say so (2026-11-17-2100). Every revoke of a widget blob goes through here, so a console line `Not allowed to load local resource: blob:app://obsidian.md/<uuid>` can be matched by its first 8 characters to
 * the `[forge-widget] blob <id> created / attached / loaded / revoked` lines, including whether the iframe was still in the document when its blob was revoked. Behaviour is exactly `URL.revokeObjectURL`.
 */
export function releaseWidgetBlob(blobUrl: string, why: string, opts: { trace?: WidgetTrace; iframe?: { isConnected: boolean } | null } = {}): void {
  const trace = opts.trace ?? defaultTrace;
  trace(`[forge-widget] blob ${blobId(blobUrl)} revoked (${why}${opts.iframe ? `; its iframe is still in the document: ${opts.iframe.isConnected}` : ''})`);
  URL.revokeObjectURL(blobUrl);
}
