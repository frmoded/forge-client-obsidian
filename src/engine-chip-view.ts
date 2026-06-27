// v0.2.206 — Custom Obsidian ItemView that renders an engine chip's
// Description + Recipe-signature + Python facets, structurally
// matching how vault notes display (per the engine-chip-as-note
// driver UX goal: "description, recipe and python. (Same throughout.)").
//
// Read-only: clicking Cmd-S or attempting to edit any facet is a
// no-op (this is an ItemView, not an editable MarkdownView). The
// `Engine chip — read-only` badge at the top says so explicitly.
//
// State persistence: setState/getState carry `chipName + domain` so
// reopening Obsidian restores the view if it was active.

import { ItemView, MarkdownRenderer, WorkspaceLeaf, Component } from 'obsidian';

import {
  type EngineChip,
  synthesizeRecipeSignature,
} from './engine-chip-catalog-core.ts';

export const ENGINE_CHIP_VIEW_TYPE = 'forge-engine-chip-view';

export interface EngineChipViewState {
  chipName: string;
  /** Domain key the chip was found in. Stored for restore;
   *  on collision (engine chip name matches a vault note in same
   *  vault), domain disambiguates. */
  domain?: string;
}

export class EngineChipView extends ItemView {
  private chip: EngineChip | null = null;
  private chipName: string = '';
  private domain: string = '';
  /** Lookup callable so the view can re-resolve the chip from its
   *  saved state (chipName) on workspace restore. Wired by the
   *  plugin at registerView time. */
  static lookup: (name: string) => EngineChip | null = () => null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return ENGINE_CHIP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.chipName ? `Engine chip: ${this.chipName}` : 'Engine chip';
  }

  getIcon(): string {
    return 'cpu';
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    const s = (state ?? {}) as EngineChipViewState;
    this.chipName = s.chipName ?? '';
    this.domain = s.domain ?? '';
    this.chip = EngineChipView.lookup(this.chipName);
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
    container.addClass('forge-engine-chip-view');

    // Read-only badge at the top: cohort must know they're looking
    // at engine source, not a vault note they can edit.
    const badge = container.createDiv({ cls: 'forge-engine-chip-readonly-badge' });
    badge.setText(
      'Engine chip (read-only) — edit `forge/<domain>/lib.py` in the engine '
        + 'repo to change behavior.',
    );

    if (!this.chip) {
      const msg = container.createDiv({ cls: 'forge-engine-chip-missing' });
      msg.setText(
        this.chipName
          ? `Engine chip "${this.chipName}" not found in the catalog. `
            + `It may have been removed from forge/<domain>/lib.py since this `
            + `view was last opened.`
          : 'No engine chip selected.',
      );
      return;
    }

    // Description facet — markdown-rendered so backticks and bullets work.
    container.createEl('h1', { text: 'Description' });
    const descBlock = container.createDiv({ cls: 'forge-engine-chip-description' });
    const descTxt = this.chip.description || '(no docstring)';
    await MarkdownRenderer.render(
      this.app, descTxt, descBlock, '', this as Component,
    );

    // Recipe facet — synthetic signature line.
    container.createEl('h1', { text: 'Recipe (signature)' });
    const sigBlock = container.createEl('pre', { cls: 'forge-engine-chip-recipe' });
    sigBlock.createEl('code', { text: synthesizeRecipeSignature(this.chip) });

    // Python facet — raw source.
    container.createEl('h1', { text: 'Python' });
    const pyBlock = container.createEl('pre', { cls: 'forge-engine-chip-python' });
    pyBlock.createEl('code', {
      text: this.chip.pythonSource,
      cls: 'language-python',
    });
  }
}
