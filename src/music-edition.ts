// Music-edition seam (music-edition project, Phase 1).
//
// One git history produces two builds: LEAN (the public / Community-Plugins default: no music21,
// no score rendering, no MIDI player, no music input widgets) and MUSIC (everything the lean
// strip, commit 787961d, removed). Every place the plugin touches a music-only feature goes
// through this interface, so the rest of the code never imports verovio, html-midi-player or the
// music input widgets directly.
//
// Two implementations: music-edition.lean.ts and music-edition.full.ts. A third file,
// music-edition-selected.ts, re-exports exactly one of them; scripts/build-main.mjs redirects
// that file to the full implementation when FORGE_EDITION=music. Because the lean build never
// reaches music-edition.full.ts, the music modules and their npm dependencies are UNREACHABLE
// from lean's entry point — which is checkable (a build test greps lean main.js for them) rather
// than depending on dead-code elimination.
//
// This file is types only: no runtime code, nothing to bundle.
import type { Plugin } from 'obsidian';

/** Per-render options. Absent = what every surface did before. */
export interface RenderOptions {
  /** Asked at every click on an engraved note: false = the click does not start playback (the Score's own Play control still does). Absent = a click plays. A score-first vault says no (score-click-policy.ts). */
  clickToPlay?: () => boolean;
  /** 2026-10-26-1100: the zoom a tab's Score is shown at, remembered across redraws (zoom-memory-core.ts). Absent = every render starts at 100%, as before. */
  zoom?: { get(): number; set(index: number): void; reset(): void };
  /** 2026-10-26-1100: where the playback follower's evidence lines go (score-follower-trace-core.ts). Absent = it says nothing. */
  trace?: (line: string) => void;
  /** 2026-11-05-1189 (score-first tabs only): the declutter. ONE toolbar row (the MIDI player, then the zoom buttons, then the Kit / multi-staff button, all in the player's own button style), no engraved title above the Score,
   *  and the Score never wider than its pane (a horizontal scrollbar inside it). Absent = what every other surface (the output panel, an embedded Beat Box, a vault that is not score-first) always had. */
  compact?: boolean;
}

export interface MusicEdition {
  readonly id: 'lean' | 'music';

  /** Register the music run-input widgets (piano / guitar fretboard / chord builder). Lean: no-op,
   *  so a widget type in frontmatter falls back to the plain text box plus a Notice naming it. */
  registerInputWidgets(): void;

  /** 2026-11-04-1170: register the Scale Explorer — the `forge-scale` code block, its side view and the command "Open Scale Explorer". Lean: no-op, so a lean vault sees no new block, view or command. */
  registerScaleExplorer(plugin: Plugin): void;

  /** Silence any playing MIDI players under `root` before the DOM is torn down (Clear, close,
   *  preview swap). Lean: no-op — there are no players. */
  stopPlayers(root: HTMLElement, onError: (message: string, e: unknown) => void): void;

  /** Render a MusicXML document (the body of a data-note preview). Returns false when this edition
   *  cannot — the caller then shows the source as text. */
  renderMusicXML(entry: HTMLElement, musicxml: string, snippetId: string): boolean;

  /** Render a tagged `musicxml` result object from the engine (single-XML, or the dual
   *  multi-staff + kit percussion shape). Returns false when this edition cannot — the caller then
   *  shows the payload's `content` as text. */
  renderTaggedMusicXML(
    entry: HTMLElement,
    result: Record<string, unknown>,
    snippetId: string,
    opts?: RenderOptions,
  ): boolean;
}

/**
 * 2026-11-19-0997: THE LIST MODEL's seam. The cores of the list model (a bar's list and its grammar, the Beat Box's host of it, the note writer of `lines:`, Duplicate) are music-composer code: the lean edition has no Score
 * and no composer to type them into, so its bundle must not carry them (the lean size cap and scripts/build-main.test.mjs say so). Every shared module that used one of them takes it from `listModel`
 * (src/list-model-selected.ts) instead of importing the core.
 *
 * THE DIRECTION IS THE REVERSE OF `music-edition-selected`, on purpose: that file is committed pointing at the LEAN implementation, so the 28 test files that drive description-apply.ts / description-wiring.ts
 * under `node --test` (no bundle: the committed selector is what they get) would run the lean stub and lose the list model they test. `list-model-selected.ts` is committed pointing at list-model.full.ts (tsc, node
 * --test and the music build see the real cores); scripts/build-main.mjs redirects it to list-model.lean.ts for the LEAN edition only, and src/test-support/bundle-real-plugin.ts does the same for its lean variant.
 *
 * The types come from the cores themselves (`typeof import(...)`, erased: no bundle weight); the lean stubs have the same shapes and answer what lean answered before the list model existed (no action sentence, no bar
 * list, no Beat Box host: the tab writes through its autosave).
 */
export interface ListModel {
  /** true for list-model.full.ts, false for the lean stub. */
  readonly present: boolean;
  /** The sentinel string of every core this implementation carries (`forge-list-model-core:<file>`); empty in lean. The build test greps the lean bundle for each. */
  readonly cores: readonly string[];
  /** bar-list-controller.ts: the BAR half of the description controller. Lean: an inert handle (every write refused in words, nothing evaluated, no undo). */
  createBarList: typeof import('./bar-list-controller.ts').createBarList;
  /** bar-box-host-core.ts: a bar's Beat Box tab turns the widget's messages into the bar's list. Lean: null (the tab then writes as it always did). */
  createBarBoxHost(...args: Parameters<typeof import('./bar-box-host-core.ts').createBarBoxHost>): ReturnType<typeof import('./bar-box-host-core.ts').createBarBoxHost> | null;
  /** bar-list-note-core.ts `withBarLines`: a NEW bar starts with an empty `lines:`. Lean: the text as it is (a bar with no list, as before the list model). */
  withBarLines: typeof import('./bar-list-note-core.ts').withBarLines;
  /** duplicate-sentence-core.ts, duplicate-note-core.ts, duplicate-undo-core.ts: the composer's action sentences and the bar words. Lean: no sentence is an action, nothing can be copied. */
  duplicate: {
    readActionText: typeof import('./duplicate-sentence-core.ts').readActionText;
    barWordVerb: typeof import('./duplicate-sentence-core.ts').barWordVerb;
    barNumberOf: typeof import('./duplicate-sentence-core.ts').barNumberOf;
    barInsertion: typeof import('./duplicate-sentence-core.ts').barInsertion;
    linkInsertion: typeof import('./duplicate-sentence-core.ts').linkInsertion;
    idParts: typeof import('./duplicate-sentence-core.ts').idParts;
    resolveDuplicateTarget: typeof import('./duplicate-sentence-core.ts').resolveDuplicateTarget;
    duplicatePreviewLine: typeof import('./duplicate-sentence-core.ts').duplicatePreviewLine;
    copyNoteText: typeof import('./duplicate-note-core.ts').copyNoteText;
    createdLine: typeof import('./duplicate-note-core.ts').createdLine;
    duplicateNote: typeof import('./duplicate-note-core.ts').duplicateNote;
    undoCopy: typeof import('./duplicate-undo-core.ts').undoCopy;
  };
}
