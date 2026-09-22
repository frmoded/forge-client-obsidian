// Drain 2026-09-22-1840 — pure-core: decide whether to warn about the
// HTML-embed community plugin when a `.html` asset lands in the vault.
//
// Why this exists: `forge_create_asset` (drain 2026-09-21-0900) lets
// action notes write `.html` assets meant for embedding via a
// community plugin (`Local HTML Embed`, id `local-html-embed`) through
// its `html-embed` code-block syntax. Rendering requires the plugin to
// be BOTH installed AND enabled — a distinction that cost a full
// diagnostic round-trip this session: an embed silently failed to
// render, the asset file was confirmed present and correct, and the
// true cause (plugin installed but not enabled) was only found by
// reading `.obsidian/community-plugins.json` directly. Nothing
// proactively told the user that.
//
// Three states, not two, because the fix differs: "not installed"
// needs a Community Plugins SEARCH; "installed but disabled" needs a
// one-click TOGGLE in an already-open Community Plugins tab.
// Collapsing them into one generic message re-creates the exact
// ambiguity that caused the diagnostic round-trip.
//
// Pure-core captures the structural decision from two booleans
// main.ts derives from the real Obsidian internals
// (`app.plugins.manifests` / `app.plugins.getPlugin`, not part of the
// typed `obsidian` package — see main.ts's own read-site comment for
// how those were verified against BRAT's own bundled source). No
// Obsidian access here, no I/O — matches the stale-main-js-check-core
// / decideLibraryNoteClick separation-of-concerns convention.

export type HtmlEmbedPluginNoticeDecision =
  | { state: 'installed-enabled' }
  | { state: 'not-installed'; noticeMessage: string }
  | { state: 'installed-disabled'; noticeMessage: string };

const PLUGIN_DISPLAY_NAME = 'Local HTML Embed';

/** Pure decision for the html-embed plugin-state Notice.
 *
 *  Inputs:
 *  - installed: whether `pluginId` has a manifest under
 *    `app.plugins.manifests` (installed, regardless of enabled state).
 *  - enabled: whether `app.plugins.getPlugin(pluginId)` returns a
 *    truthy instance (loaded/enabled right now).
 *
 *  `enabled && !installed` is not a real Obsidian state (a plugin
 *  can't be enabled without being installed) — treated the same as
 *  `!installed` defensively rather than asserted unreachable, since
 *  the caller's two reads are not atomic with each other. */
export function decideHtmlEmbedPluginNotice(
  installed: boolean,
  enabled: boolean,
): HtmlEmbedPluginNoticeDecision {
  if (installed && enabled) {
    return { state: 'installed-enabled' };
  }
  if (installed) {
    return {
      state: 'installed-disabled',
      noticeMessage:
        `Forge: this .html asset needs the "${PLUGIN_DISPLAY_NAME}" plugin to render as an embed, `
        + 'and it is installed but not enabled. Settings → Community plugins → toggle it on.',
    };
  }
  return {
    state: 'not-installed',
    noticeMessage:
      `Forge: this .html asset needs the "${PLUGIN_DISPLAY_NAME}" plugin to render as an embed. `
      + `Settings → Community plugins → search "${PLUGIN_DISPLAY_NAME}" → install.`,
  };
}
