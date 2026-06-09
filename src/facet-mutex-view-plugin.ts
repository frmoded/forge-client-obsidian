// v0.2.84 Item A — CM6 ViewPlugin replacement for v0.2.83's 200ms
// setInterval polling. Reduces fold-gesture flip latency from up to
// 200ms to one CM frame (~16ms).
//
// The ViewPlugin lives PER EditorView. Each view gets its own per-
// view state (prevFold, ignoreFoldEventsUntil, lastFilePath). The
// per-plugin singleton lives on the ForgePlugin instance; the
// ViewPlugin calls back into it for `setEditModeForFile` (B8-drift-
// aware writes) + reads `app.metadataCache` for frontmatter.
//
// Per the v0.2.83 spike: `view.editor.cm` returns the underlying
// EditorView. CM6's `foldedRanges(state)` gives an IntervalSet of
// folded positions; we diff that across ViewUpdate callbacks to
// detect fold-state deltas.

import type { App, TFile, MarkdownView } from 'obsidian';
import { ViewPlugin, type ViewUpdate, type EditorView } from '@codemirror/view';
import { foldEffect, unfoldEffect, foldedRanges } from '@codemirror/language';
import {
  decideInitialState,
  decideOnFoldChange,
  type SnippetHeadings,
  type FoldState,
} from './facet-mutex-core';

/** Minimal callback interface back to the ForgePlugin singleton.
 *  Decoupled so this module doesn't pull the full main.ts type. */
export interface FacetMutexHost {
  app: App;
  /** Resolve a TFile's edit_mode + headings + active-snippet check.
   *  Returns null if the file isn't a snippet (action/data) — the
   *  ViewPlugin should no-op. */
  getActiveSnippet(): { file: TFile; mode: 'english' | 'python' } | null;
  setEditModeForFile(file: TFile, newMode: 'english' | 'python'): Promise<void>;
}

const FOLD_EVENT_IGNORE_WINDOW_MS = 300;

export function makeFacetMutexViewPlugin(getHost: () => FacetMutexHost | null) {
  return ViewPlugin.fromClass(class {
    private view: EditorView;
    private prevFold: FoldState = { englishFolded: false, pythonFolded: false };
    private ignoreFoldEventsUntil = 0;
    private lastFilePath: string | null = null;
    private destroyed = false;
    private pendingRafHandle: number | null = null;
    private pendingTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

    constructor(view: EditorView) {
      this.view = view;
      // Apply initial state after a microtask so Obsidian has settled
      // the editor + file association. Wrapped in try/catch — if the
      // plugin isn't ready (host == null), we silently no-op.
      queueMicrotask(() => {
        if (this.destroyed) return;
        try { this.maybeSyncInitialState(); }
        catch (e) { console.warn('Forge facet-mutex initial state failed', e); }
      });
    }

    update(u: ViewUpdate) {
      if (this.destroyed) return;
      // v0.2.87 three-tier defense for the Obsidian-async fold race:
      //   tier 1 — synchronous (catches the no-race case);
      //   tier 2 — requestAnimationFrame (~16ms; catches 1-frame race);
      //   tier 3 — 100ms setTimeout (catches longer Obsidian commit
      //            delays; matches v0.2.83's polling worst-case with
      //            a one-shot timer instead of a recurring interval).
      // v0.2.86 shipped tier 1 + tier 2 only and cohort smoke still
      // reported the mutex not firing on the # English auto-fold after
      // the user expands # Python — so the race exceeds 1 frame in
      // practice. tier 3 closes the gap at the cost of being up to
      // 100ms behind the gesture. v0.2.83's 200ms polling worked at
      // cohort-acceptable latency; tier 3 at 100ms is strictly better.
      // The cost is small: one extra processUpdate() call per CM
      // update which bails fast when no delta detected.
      this.processUpdate();
      if (typeof requestAnimationFrame === 'function') {
        this.pendingRafHandle = requestAnimationFrame(() => {
          if (this.destroyed) return;
          this.processUpdate();
        });
      }
      // Clear any in-flight setTimeout so we never accumulate handles.
      if (this.pendingTimeoutHandle !== null) {
        clearTimeout(this.pendingTimeoutHandle);
      }
      this.pendingTimeoutHandle = setTimeout(() => {
        this.pendingTimeoutHandle = null;
        if (this.destroyed) return;
        this.processUpdate();
      }, 100);
    }

    private processUpdate() {
      const host = getHost();
      if (!host) return;
      const active = host.getActiveSnippet();
      if (!active) {
        this.lastFilePath = null;
        return;
      }
      if (active.file.path !== this.lastFilePath) {
        this.lastFilePath = active.file.path;
        this.ignoreFoldEventsUntil =
          Date.now() + FOLD_EVENT_IGNORE_WINDOW_MS;
        try {
          this.applyInitialStateFor(active.mode);
          this.prevFold = this.readFoldState();
        } catch (e) {
          console.warn('Forge facet-mutex file-change reattach failed', e);
        }
        return;
      }
      const now = Date.now();
      const newFold = this.readFoldState();
      if (now < this.ignoreFoldEventsUntil) {
        this.prevFold = newFold;
        return;
      }
      if (newFold.englishFolded === this.prevFold.englishFolded
          && newFold.pythonFolded === this.prevFold.pythonFolded) {
        return;
      }
      const headings = this.readHeadings();
      const desired = decideOnFoldChange(
        this.prevFold, newFold, active.mode, headings);
      if (desired.newEditMode !== null) {
        this.ignoreFoldEventsUntil = now + FOLD_EVENT_IGNORE_WINDOW_MS;
        this.applyFoldDelta(headings, newFold, desired);
        void host.setEditModeForFile(active.file, desired.newEditMode);
      }
      this.prevFold = this.readFoldState();
    }

    destroy() {
      this.destroyed = true;
      if (this.pendingRafHandle !== null
          && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.pendingRafHandle);
        this.pendingRafHandle = null;
      }
      if (this.pendingTimeoutHandle !== null) {
        clearTimeout(this.pendingTimeoutHandle);
        this.pendingTimeoutHandle = null;
      }
    }

    private maybeSyncInitialState() {
      const host = getHost();
      if (!host) return;
      const active = host.getActiveSnippet();
      if (!active) return;
      this.lastFilePath = active.file.path;
      this.ignoreFoldEventsUntil = Date.now() + FOLD_EVENT_IGNORE_WINDOW_MS;
      this.applyInitialStateFor(active.mode);
      this.prevFold = this.readFoldState();
    }

    private applyInitialStateFor(mode: 'english' | 'python') {
      const headings = this.readHeadings();
      const desired = decideInitialState(mode, headings);
      this.applyFoldDelta(headings, this.readFoldState(), desired);
    }

    private readHeadings(): SnippetHeadings {
      const doc = this.view.state.doc;
      let englishLine: number | null = null;
      let pythonLine: number | null = null;
      for (let i = 1; i <= doc.lines; i++) {
        const text = doc.line(i).text.trim();
        if (/^#{1,6}\s+english\s*$/i.test(text) && englishLine === null) {
          englishLine = i;
        } else if (/^#{1,6}\s+python\s*$/i.test(text) && pythonLine === null) {
          pythonLine = i;
        }
      }
      return { englishLine, pythonLine };
    }

    private readFoldState(): FoldState {
      const out: FoldState = { englishFolded: false, pythonFolded: false };
      const headings = this.readHeadings();
      const folded = foldedRanges(this.view.state);
      if (headings.englishLine !== null) {
        const ln = this.view.state.doc.line(headings.englishLine);
        out.englishFolded = this.posInFoldedSet(folded, ln.to);
      }
      if (headings.pythonLine !== null) {
        const ln = this.view.state.doc.line(headings.pythonLine);
        out.pythonFolded = this.posInFoldedSet(folded, ln.to);
      }
      return out;
    }

    private posInFoldedSet(
      folded: { iter(): { value: unknown; from: number; to: number; next(): void } },
      pos: number,
    ): boolean {
      const it = folded.iter();
      while (it.value !== null) {
        if (pos >= it.from && pos <= it.to) return true;
        if (it.from > pos) return false;
        it.next();
      }
      return false;
    }

    private applyFoldDelta(
      headings: SnippetHeadings,
      current: FoldState,
      desired: { englishFolded: boolean; pythonFolded: boolean },
    ) {
      const effects: ReturnType<typeof foldEffect.of>[] = [];
      if (headings.englishLine !== null
          && current.englishFolded !== desired.englishFolded) {
        const ln = this.view.state.doc.line(headings.englishLine);
        const range = { from: ln.to, to: this.sectionEnd(headings.englishLine) };
        effects.push(
          desired.englishFolded ? foldEffect.of(range) : unfoldEffect.of(range));
      }
      if (headings.pythonLine !== null
          && current.pythonFolded !== desired.pythonFolded) {
        const ln = this.view.state.doc.line(headings.pythonLine);
        const range = { from: ln.to, to: this.sectionEnd(headings.pythonLine) };
        effects.push(
          desired.pythonFolded ? foldEffect.of(range) : unfoldEffect.of(range));
      }
      if (effects.length > 0) {
        this.view.dispatch({ effects });
      }
    }

    private sectionEnd(headingLine: number): number {
      const doc = this.view.state.doc;
      for (let i = headingLine + 1; i <= doc.lines; i++) {
        const text = doc.line(i).text.trim();
        if (/^#{1,6}\s+\S/.test(text)) {
          return doc.line(i - 1).to;
        }
      }
      return doc.length;
    }
  });
}
