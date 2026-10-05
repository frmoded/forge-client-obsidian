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
// prompt, §4/§8). Read the actual installed third-party plugin's
// source directly (`.obsidian/plugins/local-html-embed/main.js`,
// confirmed this drain, not trusted secondhand from an earlier
// FEEDBACK citation) rather than assuming. It builds a `blob:` URL
// from the target .html file's content and sets:
//   iframe.sandbox.add('allow-scripts');
//   iframe.sandbox.add('allow-same-origin');
//   iframe.setAttribute('loading', 'lazy');
//   iframe.setAttribute('referrerpolicy', 'no-referrer');
// This processor matches all four exactly — `allow-scripts` (every
// widget is vanilla JS + Web Audio, needs script execution) and
// `allow-same-origin` (needed for the iframe's own JS to read/write
// its own document — without it a blob-URL iframe's scripts run in a
// unique opaque origin that breaks even same-document DOM access in
// some engines) are the same two flags the plugin being replaced
// uses; no broader flags are added (no `allow-top-navigation`,
// `allow-popups`, `allow-forms`, etc. — none of the five widgets need
// them, and adding them would be strictly weaker sandboxing than the
// thing this replaces, which §8 forbids).
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
import { parseHtmlEmbedSource } from './html-embed-view-core.ts';

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
    plugin.registerMarkdownCodeBlockProcessor('html-embed', async (source, el) => {
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

  const abstractFile = plugin.app.vault.getAbstractFileByPath(parsed.path);
  if (!(abstractFile instanceof TFile)) {
    renderEmbedError(el, 'html-embed: file not found', `Path: ${parsed.path}`);
    return;
  }
  if (!parsed.path.toLowerCase().endsWith('.html')) {
    renderEmbedError(el, 'html-embed: target is not an .html file', `Path: ${parsed.path}`);
    return;
  }

  let html: string;
  try {
    html = await plugin.app.vault.read(abstractFile);
  } catch (e) {
    renderEmbedError(el, 'html-embed: could not read file', `${parsed.path}\n${(e as Error)?.message ?? e}`);
    return;
  }
  if (!html.trim()) {
    renderEmbedError(el, 'html-embed: file is empty', `Path: ${parsed.path}`);
    return;
  }

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

/**
 * The ONE place a vault-authored .html widget gets its iframe: a `blob:` URL of the file's content, sandboxed with exactly
 * `allow-scripts` and `allow-same-origin` (see the SANDBOXING note at the top of this file) — no wider flags. Extracted
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

  const iframe = parent.createEl('iframe', { cls: 'forge-html-embed-iframe' });
  iframe.src = blobUrl;
  iframe.sandbox.add('allow-scripts');
  iframe.sandbox.add('allow-same-origin');
  iframe.style.height = heightCss;
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  return { iframe, blobUrl };
}

function renderEmbedError(el: HTMLElement, title: string, detail: string): void {
  const box = el.createDiv({ cls: 'forge-html-embed-error' });
  box.createDiv({ cls: 'forge-html-embed-error-title', text: title });
  box.createDiv({ cls: 'forge-html-embed-error-detail', text: detail });
}
