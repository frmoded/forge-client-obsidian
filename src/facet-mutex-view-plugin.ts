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
      const host = getHost();
      if (!host) return;
      const active = host.getActiveSnippet();

      // v0.2.85 SPIKE — REMOVE AFTER INVESTIGATION. Diagnostic logging
      // per prompt §1.7. Discharges H1-H6: timing, debounce window,
      // file-path identity, transaction effects, prevFold/newFold
      // delta, decideOnFoldChange result.
      try {
        const txEffects = u.transactions.flatMap(t =>
          (t.effects ?? []).map((e: any) =>
            e?.value?.constructor?.name ?? typeof e?.value ?? 'unknown'));
        const probedHeadings = this.readHeadings();
        const probedFold = this.readFoldState();
        console.log('Forge mutex spike:', {
          now: Date.now(),
          ignoreUntil: this.ignoreFoldEventsUntil,
          insideIgnoreWindow: Date.now() < this.ignoreFoldEventsUntil,
          active: active
            ? { path: active.file.path, mode: active.mode }
            : null,
          lastFilePath: this.lastFilePath,
          txCount: u.transactions.length,
          txEffects,
          docChanged: u.docChanged,
          prevFold: this.prevFold,
          probedHeadings,
          probedFold,
          foldsDiffer:
            probedFold.englishFolded !== this.prevFold.englishFolded
            || probedFold.pythonFolded !== this.prevFold.pythonFolded,
        });
      } catch (e) {
        console.warn('Forge mutex spike: log failed', e);
      }
      // END v0.2.85 SPIKE

      if (!active) {
        this.lastFilePath = null;
        return;
      }
      // File-change detection: if the active file's path changed since
      // last update, treat as a fresh attach — re-apply initial state.
      // Also resets prevFold so the new file's first delta doesn't
      // get treated as a gesture against the previous file's state.
      if (active.file.path !== this.lastFilePath) {
        this.lastFilePath = active.file.path;
        // Initial state apply needs the editor settled; defer.
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
      // Per-update fold-state diff. CM6 fires update() on every
      // transaction; foldedRanges read is O(folded-count) which is
      // tiny. Document changes (typing) also fire update(); we still
      // do the cheap fold-state read but the diff almost always
      // matches prevFold, so no work happens.
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
      // Fold-state delta. Route through pure-core.
      const headings = this.readHeadings();
      const desired = decideOnFoldChange(
        this.prevFold, newFold, active.mode, headings);

      // v0.2.85 SPIKE — log the decision input + output.
      console.log('Forge mutex spike: decideOnFoldChange', {
        prevFold: this.prevFold,
        newFold,
        mode: active.mode,
        headings,
        decision: desired,
      });
      // END v0.2.85 SPIKE

      if (desired.newEditMode !== null) {
        this.ignoreFoldEventsUntil = now + FOLD_EVENT_IGNORE_WINDOW_MS;
        this.applyFoldDelta(headings, newFold, desired);
        void host.setEditModeForFile(active.file, desired.newEditMode);
      }
      this.prevFold = this.readFoldState();
    }

    destroy() { this.destroyed = true; }

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
      // v0.2.85 SPIKE — log the fold dispatch.
      console.log('Forge mutex spike: applyFoldDelta', {
        headings, current, desired, effectCount: effects.length,
      });
      // END v0.2.85 SPIKE
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
