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

export interface MusicEdition {
  readonly id: 'lean' | 'music';

  /** Register the music run-input widgets (piano / guitar fretboard / chord builder). Lean: no-op,
   *  so a widget type in frontmatter falls back to the plain text box plus a Notice naming it. */
  registerInputWidgets(): void;

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
  ): boolean;
}
