// v0.2.184 — Notice-replacement helper.
//
// Driver request: replace all `new Notice(...)` toasts in the plugin
// with writes to the Forge output panel. Toasts pop ephemerally and
// can be missed; the panel persists, is selectable (Cmd-C works post-
// v0.2.178), and groups all plugin messages in one place.
//
// This module is the cross-file shim: every former Notice call site
// (modals, hover handlers, views) reaches the panel through here
// without needing direct access to the plugin instance.
//
// Behavior:
// - Find an existing ForgeOutputView leaf in the workspace.
// - If found, call its appendMessage(snippetId, text, kind).
// - If absent, open one via setViewState (single retry pattern matches
//   ForgePlugin.getOutputView).
// - On total failure, log to console.error — explicitly NO fallback
//   toast, per driver: no more toasts anywhere.

import type { App } from 'obsidian';
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from './output-view.ts';
import { GENERIC_ATTRIBUTION } from './output-entry-meta-core.ts';
import { classifyMessageSource, messageDelivery, routeMessage } from './score-first-messages-core.ts';

export async function forgeNotice(
  app: App,
  text: string,
  kind: 'info' | 'error' | 'success' = 'info',
  snippetId: string = GENERIC_ATTRIBUTION,
): Promise<void> {
  // score_first M4 (drain 2026-10-21-2010): in a score-first vault the panel does not open by itself. Everything below this block is what every OTHER vault has always run,
  // unchanged: `isScoreFirst()` is false there, so this block is skipped.
  if (messageDelivery.isScoreFirst()) {
    deliverSilently(app, text, kind, snippetId);
    return;
  }
  try {
    let leaf = app.workspace.getLeavesOfType(OUTPUT_VIEW_TYPE)[0];
    if (!leaf) {
      // No output view open — create one on the right sidebar.
      leaf = app.workspace.getRightLeaf(false) ?? app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: OUTPUT_VIEW_TYPE, active: true });
    }
    // Wait briefly for the view to materialize (deferred-view race;
    // same shape as ForgePlugin.getOutputView's polling loop).
    for (let i = 0; i < 10; i++) {
      if (leaf.view instanceof ForgeOutputView) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    if (!(leaf.view instanceof ForgeOutputView)) {
      console.error('forgeNotice: output view never materialized; message dropped:', text);
      return;
    }
    leaf.view.appendMessage(snippetId, text, kind);
    app.workspace.revealLeaf(leaf);
  } catch (e) {
    console.error('forgeNotice failed; message dropped:', text, e);
  }
}

/** Score-first delivery: append to the panel only if it already exists (no open, no reveal, no sidebar expand), otherwise keep the entry until the panel is first opened; and put a
 *  top-ranked message on the Score. The router decides; this function only performs. */
function deliverSilently(app: App, text: string, kind: 'info' | 'error' | 'success', snippetId: string): void {
  const route = routeMessage({ scoreFirst: true, kind, source: classifyMessageSource(text) });
  try {
    const view = app.workspace.getLeavesOfType(OUTPUT_VIEW_TYPE)[0]?.view;
    if (view instanceof ForgeOutputView) view.appendMessage(snippetId, text, kind);
    else messageDelivery.stash((sink) => { sink.appendMessage(snippetId, text, kind); });
  } catch (e) {
    console.error('forgeNotice (score-first) failed; message dropped:', text, e);
  }
  if (route.score) messageDelivery.postToScore({ text, kind, line: route.score });
}

/** Heuristic kind: 'error' if message text suggests failure. */
export function inferNoticeKind(text: string): 'info' | 'error' {
  const lower = text.toLowerCase();
  if (
    lower.includes('failed')
    || lower.includes('error')
    || lower.includes('could not')
  ) {
    return 'error';
  }
  return 'info';
}
