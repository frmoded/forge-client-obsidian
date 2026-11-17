// Drain 2026-09-29-1030 — native replacement for the third-party
// "Local HTML Embed" community plugin (id `local-html-embed`), which
// every shipped gadget widget note (monochord, piano, guitar, lute,
// rhythm box) previously depended on to render its ```html-embed
// code block. See html-embed-view-core.ts for why the parsing is
// byte-for-byte compatible with the plugin being replaced, and this
// file's own comments below for the sandboxing and collision-handling
// decisions.
//
// SANDBOXING — a hard floor, not a nice-to-have (per this drain's
// prompt, §4/§8). The third-party plugin being replaced builds a `blob:`
// URL from the target .html file's content and sets BOTH
// `allow-scripts` and `allow-same-origin`. This processor used to match
// it; drain 2026-10-14-0900 §6 does NOT, on purpose, and sets
// `allow-scripts` ONLY.
//
// Why `allow-same-origin` goes: with both flags the framed document is
// SAME-ORIGIN with Obsidian itself (a blob URL takes its creator's
// origin), so a vault-authored widget could reach `window.parent` — in
// an Electron renderer that is the app, `require` and all — and the
// browser says so on every mount ("An iframe which has both
// allow-scripts and allow-same-origin for its sandbox attribute can
// escape its sandboxing"). Measured in real Chromium against the five
// shipped widgets (scripts/probe-widget-sandbox.mjs): with
// `allow-scripts` alone every widget still loads and runs, the Rhythm
// Box's host handshake + load + request-data round trip still works
// (postMessage with `'*'` and an `event.source === iframe.contentWindow`
// check never depended on origin), Web Audio still starts, and the
// host can no longer read the frame's document. What it does take away
// is storage (`localStorage` throws) and direct DOM access to the
// parent — neither of which any shipped widget uses (grep: none) and
// neither of which a widget should ever have.
//
// The old comment here called `allow-same-origin` "needed for the
// iframe's own JS to read/write its own document". It is not: an
// opaque-origin document reads and writes ITS OWN DOM freely.
//
// `allow-scripts` itself stays (every widget is vanilla JS + Web
// Audio). No broader flags are added (no `allow-top-navigation`,
// `allow-popups`, `allow-forms`, ...). The Clipboard API is refused to a
// cross-origin frame without a permissions-policy grant; the Rhythm
// Box's "Export JSON" already falls back to `execCommand('copy')`, so
// no `allow="clipboard-write"` is added.
//
// NOT reused: moda-view.ts's `iframeSrc()`/onOpen() pattern. Read it
// in full before designing this (see this drain's FEEDBACK §1) —
// it sets `iframe.src` directly with NO `sandbox` attribute at all,
// because it loads the plugin's own bundled, trusted iframe assets
// (or a local dev server), a different threat model from rendering
// arbitrary vault-authored .html content. Confirmed NOT a safe
// template for this use case, exactly as the prompt warned against
// assuming.
//
// COLLISION WITH THE THIRD-PARTY PLUGIN — investigated empirically
// against Obsidian's actual (non-typed-package) source this drain,
// not assumed. See this drain's FEEDBACK for the full citation; the
// short version: `Plugin.registerMarkdownCodeBlockProcessor` inserts
// into a plain `{ [language]: handler }` map keyed by the language
// string, and the underlying `registerCodeBlockPostProcessor` throws
// `Error("Code block postprocessor for language html-embed is
// already registered")` if that key is already taken — NOT silent
// last-wins, NOT both-run. Whichever plugin's `onload()` reaches this
// registration SECOND throws synchronously mid-onload. Wrapped in
// try/catch below so that scenario degrades to "ours doesn't
// register, the other plugin's still does" instead of crashing the
// rest of this plugin's onload().

import { TFile } from 'obsidian';
import { HTML_EMBED_LANGUAGE, parseHtmlEmbedSource } from './html-embed-view-core.ts';
import { resolveWidgetFile } from './bundled-widget-lookup.ts';
import { createSandboxedWidgetIframe } from './widget-iframe-core.ts';

/** Narrow structural slice of `Plugin` + `App` this file actually
 *  needs, per this repo's structural-adapter-type convention — keeps
 *  the glue file's own surface small and lets a test construct a stub
 *  without an Obsidian shim (the processor's async body itself is not
 *  unit-tested here, by design: it's a thin composition of already-
 *  tested parsing (html-embed-view-core.ts) + Obsidian vault/DOM APIs
 *  that only a real or L43-rehearsed Obsidian instance can meaningfully
 *  exercise — see this drain's FEEDBACK §5 for the real-Obsidian
 *  rehearsal that covers this file's actual behavior). */
export interface HtmlEmbedHostPlugin {
  registerMarkdownCodeBlockProcessor(
    language: string,
    handler: (source: string, el: HTMLElement, ctx: unknown) => Promise<unknown> | void,
  ): unknown;
  register(cb: () => void): void;
  app: {
    vault: {
      getAbstractFileByPath(path: string): unknown;
      read(file: unknown): Promise<string>;
    };
  };
}

export function registerHtmlEmbedProcessor(plugin: HtmlEmbedHostPlugin): void {
  try {
    plugin.registerMarkdownCodeBlockProcessor(HTML_EMBED_LANGUAGE, async (source, el) => {
      await renderHtmlEmbed(plugin, source, el);
    });
  } catch (e) {
    console.warn(
      '[forge] html-embed code-block processor did not register — another '
      + 'plugin (most likely "Local HTML Embed") has already claimed the '
      + '"html-embed" language. That plugin will keep rendering these embeds '
      + 'until it is disabled and Obsidian is reloaded.',
      e,
    );
  }
}

async function renderHtmlEmbed(
  plugin: HtmlEmbedHostPlugin,
  source: string,
  el: HTMLElement,
): Promise<void> {
  const parsed = parseHtmlEmbedSource(source);

  if (!parsed.path) {
    renderEmbedError(
      el,
      'html-embed: missing file path',
      'The first line of the code block must be a vault-relative path to an .html file, e.g.\n\nmusic_instruments/resources/html/piano_keyboard.html\n300',
    );
    return;
  }

  // Drain 2026-10-10-2100 (a): the path is relative to the BUNDLED library's root, which is the vault root only in the dev vault.
  // In a normal user vault the library is extracted as a subfolder, so look there too, then in the plugin's own inlined copy.
  const widget = await resolveWidgetFile(plugin.app, parsed.path);
  if (widget.ok === false) {
    renderEmbedError(el, 'html-embed: file not found', `Path: ${parsed.path}\n${widget.message}`);
    return;
  }
  if (!parsed.path.toLowerCase().endsWith('.html')) {
    renderEmbedError(el, 'html-embed: target is not an .html file', `Path: ${parsed.path}`);
    return;
  }
  const html = widget.html;

  // No caption/chrome — this is the actual point of the drain (the
  // driver dislikes the third-party plugin's unremovable "HTML Embed
  // · path · height" bar). The iframe is the entire rendered surface.
  // The one genuinely per-embed-instance style (parsed from the code
  // block's own source) is the height — everything static lives in
  // styles.css's .forge-html-embed-iframe rule instead, per this repo's
  // inline-styles convention (see styles.css's own comment at that rule).
  const { blobUrl } = createSandboxedWidgetIframe(el, html, `${parsed.heightPx}px`);

  // Matches the third-party plugin's own cleanup: revoke the blob URL
  // when this component unloads (note closed/re-rendered, plugin
  // unloaded) rather than leaking it for the life of the Obsidian
  // process.
  plugin.register(() => URL.revokeObjectURL(blobUrl));
}

// createSandboxedWidgetIframe (the ONE place a vault-authored .html widget gets its iframe) lives in widget-iframe-core.ts (2026-11-17-1000: no obsidian import, so it is unit-tested);
// re-exported here so every caller imports it from where it always did.
export { createSandboxedWidgetIframe };

function renderEmbedError(el: HTMLElement, title: string, detail: string): void {
  const box = el.createDiv({ cls: 'forge-html-embed-error' });
  box.createDiv({ cls: 'forge-html-embed-error-title', text: title });
  box.createDiv({ cls: 'forge-html-embed-error-detail', text: detail });
}
