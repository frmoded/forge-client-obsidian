// v0.2.206 — Custom Obsidian ItemView that renders an library note's
// Description + Recipe-signature + Python facets, structurally
// matching how vault notes display (per the library-note-as-note
// driver UX goal: "description, recipe and python. (Same throughout.)").
//
// Read-only: clicking Cmd-S or attempting to edit any facet is a
// no-op (this is an ItemView, not an editable MarkdownView). The
// `Library note — read-only` badge at the top says so explicitly.
//
// v0.2.229 — terminology rename (engine chip → library note) finally
// hit the user-facing strings; sections wrapped in <details>/<summary>
// for native foldability per drain 2026-07-02-1100.
//
// State persistence: setState/getState carry `chipName + domain` so
// reopening Obsidian restores the view if it was active.

import { ItemView, MarkdownRenderer, WorkspaceLeaf, Component } from 'obsidian';

import {
  type LibraryNote,
  synthesizeRecipeSignature,
} from './library-note-catalog-core.ts';

export const LIBRARY_NOTE_VIEW_TYPE = 'forge-library-note-view';

export interface LibraryNoteViewState {
  chipName: string;
  /** Domain key the chip was found in. Stored for restore;
   *  on collision (library note name matches a vault note in same
   *  vault), domain disambiguates. */
  domain?: string;
}

export class LibraryNoteView extends ItemView {
  private chip: LibraryNote | null = null;
  private chipName: string = '';
  private domain: string = '';
  /** Lookup callable so the view can re-resolve the chip from its
   *  saved state (chipName) on workspace restore. Wired by the
   *  plugin at registerView time. */
  static lookup: (name: string) => LibraryNote | null = () => null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return LIBRARY_NOTE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.chipName ? `Library note: ${this.chipName}` : 'Library note';
  }

  getIcon(): string {
    return 'cpu';
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    const s = (state ?? {}) as LibraryNoteViewState;
    this.chipName = s.chipName ?? '';
    this.domain = s.domain ?? '';
    this.chip = LibraryNoteView.lookup(this.chipName);
    await this.render();
    return super.setState(state, result as any);
  }

  getState(): Record<string, unknown> {
    return { chipName: this.chipName, domain: this.domain };
  }

  async onOpen() {
    // setState may not have been called yet if this view was opened
    // without state. Render either way.
    await this.render();
  }

  async onClose() {
    this.contentEl.empty();
  }

  private async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass('forge-library-note-view');

    // Read-only badge at the top: cohort must know they're looking
    // at engine source, not a vault note they can edit.
    const badge = container.createDiv({ cls: 'forge-library-note-readonly-badge' });
    badge.setText(
      'Library note (read-only) — edit `forge/<domain>/lib.py` in the engine '
        + 'repo to change behavior.',
    );

    if (!this.chip) {
      const msg = container.createDiv({ cls: 'forge-library-note-missing' });
      msg.setText(
        this.chipName
          ? `Library note "${this.chipName}" not found in the catalog. `
            + `It may have been removed from forge/<domain>/lib.py since this `
            + `view was last opened.`
          : 'No library note selected.',
      );
      return;
    }

    // v0.2.229 — sections wrapped in <details>/<summary> for native
    // foldability. Each section is open by default; cohort clicks
    // the summary to collapse. Per drain 2026-07-02-1100.

    // Description facet — markdown-rendered so backticks and bullets work.
    const descDetails = container.createEl('details', { cls: 'forge-library-note-section' });
    descDetails.setAttr('open', '');
    descDetails.createEl('summary', { text: 'Description' });
    const descBlock = descDetails.createDiv({ cls: 'forge-library-note-description' });
    const descTxt = this.chip.description || '(no docstring)';
    await MarkdownRenderer.render(
      this.app, descTxt, descBlock, '', this as Component,
    );

    // Recipe facet — synthetic signature line.
    const recipeDetails = container.createEl('details', { cls: 'forge-library-note-section' });
    recipeDetails.setAttr('open', '');
    recipeDetails.createEl('summary', { text: 'Recipe (signature)' });
    const sigBlock = recipeDetails.createEl('pre', { cls: 'forge-library-note-recipe' });
    sigBlock.createEl('code', { text: synthesizeRecipeSignature(this.chip) });

    // Python facet — raw source.
    const pyDetails = container.createEl('details', { cls: 'forge-library-note-section' });
    pyDetails.setAttr('open', '');
    pyDetails.createEl('summary', { text: 'Python' });
    const pyBlock = pyDetails.createEl('pre', { cls: 'forge-library-note-python' });
    pyBlock.createEl('code', {
      text: this.chip.pythonSource,
      cls: 'language-python',
    });
  }
}
