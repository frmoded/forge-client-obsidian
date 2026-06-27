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

export async function forgeNotice(
  app: App,
  text: string,
  kind: 'info' | 'error' | 'success' = 'info',
  snippetId: string = 'Forge',
): Promise<void> {
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
