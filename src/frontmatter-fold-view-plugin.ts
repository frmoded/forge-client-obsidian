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
      // v0.2.108 DEBUG — frontmatter-fold reported NOT firing on
      // cohort install (post-v0.2.106). ViewPlugin IS registered in
      // main.ts; the trace below pins which hypothesis is true:
      //   H2 stale main.js: never see any [ff-debug] lines.
      //   H3 range null: see "range computation returned null".
      //   H4 update not firing: see "constructor fired" but no
      //     "update fired" lines.
      //   H5 dispatch but no visual fold: see "dispatch attempted"
      //     followed by frontmatter still unfolded on screen.
      //   H6 host returns null: see "host getActiveSnippetForFold:
      //     null" repeatedly.
      console.log('[ff-debug v0.2.108] constructor fired');
      queueMicrotask(() => {
        if (this.destroyed) return;
        console.log('[ff-debug v0.2.108] queueMicrotask: maybeFold');
        try { this.maybeFold(); }
        catch (e) { console.warn('Forge frontmatter-fold initial failed', e); }
      });
    }

    update(u: ViewUpdate) {
      if (this.destroyed) return;
      const host = getHost();
      if (!host) {
        console.log('[ff-debug v0.2.108] update: host null');
        return;
      }
      const active = host.getActiveSnippetForFold();
      if (!active) {
        if (this.foldedForFilePath !== null) {
          console.log('[ff-debug v0.2.108] update: host getActiveSnippetForFold returned null; clearing cache');
        }
        this.foldedForFilePath = null;
        return;
      }
      if (active.file.path === this.foldedForFilePath) {
        return;
      }
      console.log(`[ff-debug v0.2.108] update fired; active=${active.file.path}, foldedForFilePath=${this.foldedForFilePath}; scheduling maybeFold`);
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
      if (!host) {
        console.log('[ff-debug v0.2.108] maybeFold: host null');
        return;
      }
      const active = host.getActiveSnippetForFold();
      if (!active) {
        console.log('[ff-debug v0.2.108] maybeFold: host returned null active snippet (frontmatter not type:action|data?)');
        return;
      }
      if (active.file.path === this.foldedForFilePath) {
        console.log('[ff-debug v0.2.108] maybeFold: already folded this file');
        return;
      }
      const doc = this.view.state.doc.toString();
      const range = computeFrontmatterFoldRange(doc);
      console.log(`[ff-debug v0.2.108] maybeFold: file=${active.file.path}, doc.length=${doc.length}, range=`, range);
      if (!range) {
        this.foldedForFilePath = active.file.path;
        console.log('[ff-debug v0.2.108] maybeFold: range computation returned null (no frontmatter delimiters?); marking file done');
        return;
      }
      const docLen = this.view.state.doc.length;
      if (range.from < 0 || range.to > docLen || range.from >= range.to) {
        this.foldedForFilePath = active.file.path;
        console.warn('[ff-debug v0.2.108] maybeFold: bounds check failed', { range, docLen });
        return;
      }
      try {
        console.log('[ff-debug v0.2.108] maybeFold: dispatch attempted; foldEffect.of', range);
        this.view.dispatch({
          effects: foldEffect.of(range),
        });
        // Inspect the actual folded ranges in the resulting state to
        // confirm the fold landed at the CM6 level (vs. being silently
        // discarded by a missing fold-state extension or Obsidian's
        // override).
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lang = require('@codemirror/language');
          const folded = lang.foldedRanges(this.view.state);
          const ranges: Array<{ from: number; to: number }> = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          folded.between(0, this.view.state.doc.length, (from: number, to: number) => {
            ranges.push({ from, to });
          });
          console.log('[ff-debug v0.2.108] post-dispatch foldedRanges:', ranges);
        } catch (probeErr) {
          console.warn('[ff-debug v0.2.108] foldedRanges probe failed', probeErr);
        }
        this.foldedForFilePath = active.file.path;
      } catch (e) {
        console.warn('[ff-debug v0.2.108] dispatch failed', e);
      }
    }
  });
}
