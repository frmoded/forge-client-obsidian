// v0.2.102 Item A — auto-fold the YAML frontmatter block on snippet
// file-open. Tamar's cohort smoke surfaced "overwhelm" signals: the
// frontmatter block (type/inputs/edit_mode/...) was the first thing
// students saw, gating actual snippet content (`# English`).
//
// Behavior:
//  - On file-open for a snippet (frontmatter has `type: action` or
//    `type: data`), fold the `---`-delimited frontmatter region.
//  - Plain notes (no `type: action|data`): no change.
//  - User can expand by clicking the fold-triangle on the opening
//    `---` line. Subsequent ViewUpdates DO NOT re-fold (same shape
//    as facet-mutex's initial-state-apply: once per file-open).
//
// Per the v0.2.85-89 retrospective: NEVER dispatch from inside a
// ViewUpdate. We use queueMicrotask in the constructor (initial
// view mount) + setTimeout(0) on file-change for the dispatch.
//
// Scope: source mode only. Live preview / reading mode handle
// frontmatter visibility via Obsidian's Properties view natively.

import type { App, TFile } from 'obsidian';
import { ViewPlugin, type ViewUpdate, type EditorView } from '@codemirror/view';
import { foldEffect } from '@codemirror/language';

/** Minimal callback interface back to the ForgePlugin singleton. */
export interface FrontmatterFoldHost {
  app: App;
  /** Resolve the active snippet file + whether its frontmatter
   *  qualifies for auto-fold. Returns null if not a snippet. */
  getActiveSnippetForFold(): { file: TFile } | null;
}

/** Locate the YAML frontmatter range in the document — start of the
 *  opening `---` line through the END of the closing `---` line.
 *  Returns null when the document doesn't start with a frontmatter
 *  delimiter or has no closing delimiter (malformed).
 *
 *  Pure-core extraction: pulled out for unit testing without a
 *  live EditorView. */
export function computeFrontmatterFoldRange(
  doc: string,
): { from: number; to: number } | null {
  const lines = doc.split('\n');
  if (lines.length < 2) return null;
  if (lines[0].trim() !== '---') return null;
  // Find the closing `---` after line 0.
  let closeLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeLine = i;
      break;
    }
  }
  if (closeLine === -1) return null;
  // CM6 fold ranges are character positions in the doc text.
  //   `from` = end of line 0 (the opening `---`, length 3) so the
  //   first line stays visible with a fold-triangle attached.
  //   `to`   = end of the closing `---` line so everything from the
  //   newline-after-line-0 through the closing `---` is folded.
  // Pure arithmetic on line lengths + (closeLine) newlines between
  // them. Don't include the newline after `to` (would fold the
  // first blank line of the body).
  const from = lines[0].length;
  let to = 0;
  for (let i = 0; i <= closeLine; i++) {
    to += lines[i].length;
    if (i < closeLine) to += 1;  // newline between this line and the next
  }
  return { from, to };
}

export function makeFrontmatterFoldViewPlugin(
  getHost: () => FrontmatterFoldHost | null,
) {
  return ViewPlugin.fromClass(class {
    private view: EditorView;
    private foldedForFilePath: string | null = null;
    private destroyed = false;

    constructor(view: EditorView) {
      this.view = view;
      // Initial state after a microtask so Obsidian has associated
      // the editor with its file by the time we read frontmatter.
      queueMicrotask(() => {
        if (this.destroyed) return;
        try { this.maybeFold(); }
        catch (e) { console.warn('Forge frontmatter-fold initial failed', e); }
      });
    }

    update(u: ViewUpdate) {
      if (this.destroyed) return;
      // Cheap check: when the editor swaps documents (file open),
      // the active file pointer changes. Refold once per file.
      const host = getHost();
      if (!host) return;
      const active = host.getActiveSnippetForFold();
      if (!active) {
        this.foldedForFilePath = null;
        return;
      }
      if (active.file.path === this.foldedForFilePath) {
        return;  // already folded this file
      }
      // Defer dispatch — v0.2.85-89 lesson: NEVER dispatch from
      // inside a ViewUpdate. setTimeout(0) schedules onto the next
      // task tick.
      void u;
      setTimeout(() => {
        if (this.destroyed) return;
        try { this.maybeFold(); }
        catch (e) { console.warn('Forge frontmatter-fold deferred failed', e); }
      }, 0);
    }

    destroy() {
      this.destroyed = true;
    }

    private maybeFold() {
      const host = getHost();
      if (!host) return;
      const active = host.getActiveSnippetForFold();
      if (!active) return;
      if (active.file.path === this.foldedForFilePath) return;

      const doc = this.view.state.doc.toString();
      const range = computeFrontmatterFoldRange(doc);
      if (!range) {
        // No frontmatter to fold — record the file so we don't keep
        // re-scanning on every update.
        this.foldedForFilePath = active.file.path;
        return;
      }
      // Bounds check against document length (defensive — race vs.
      // pending edits).
      const docLen = this.view.state.doc.length;
      if (range.from < 0 || range.to > docLen || range.from >= range.to) {
        this.foldedForFilePath = active.file.path;
        return;
      }
      try {
        this.view.dispatch({
          effects: foldEffect.of(range),
        });
        this.foldedForFilePath = active.file.path;
      } catch (e) {
        console.warn('Forge frontmatter-fold dispatch failed', e);
      }
    }
  });
}
