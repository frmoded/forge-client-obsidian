import { ItemView, WorkspaceLeaf, MarkdownView, Notice, TFile } from 'obsidian';
import {
  ChipPaletteGroup,
  CHIPS_NO_ENGLISH_SECTION,
  insertChipText,
} from './chips-core';
import { ChipsManifest, loadChipsForActiveVault } from './chips';

export const CHIPS_VIEW_TYPE = 'forge-chips';

/** Surface the chip view needs from the plugin. Kept narrow so this
 *  module doesn't import main.ts and create a cycle. */
export interface ChipsHost {
  // Current vault manifest snapshot (vault name + declared domains).
  // Fresh-read per loadChipsForActiveVault call.
  getManifest(): ChipsManifest;
  // Hook for reload events (e.g. "Refresh chip palette" command can
  // reach into the view via this).
  registerView(view: ChipsView): void;
  unregisterView(view: ChipsView): void;
}

export class ChipsView extends ItemView {
  private lastMarkdownView: MarkdownView | null = null;
  private groups: ChipPaletteGroup[] = [];

  constructor(leaf: WorkspaceLeaf, private host: ChipsHost) {
    super(leaf);
    // file-open is the ONLY re-render trigger. We deliberately do NOT
    // listen on active-leaf-change — clicking a chip shifts the
    // active leaf to this side pane, and an active-leaf-change
    // re-render would empty contentEl mid-click and eat the click.
    // (Lessons from the v1 POC; see b6c6fa9.) file-open is safe
    // because clicking the side pane doesn't open a file.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        const v = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (v && v.file?.path === file?.path) this.lastMarkdownView = v;
      }));
  }

  getViewType() { return CHIPS_VIEW_TYPE; }
  getDisplayText() { return 'Forge chips'; }
  getIcon() { return 'puzzle'; }

  async onOpen() {
    this.host.registerView(this);
    await this.refresh();
  }

  async onClose() {
    this.host.unregisterView(this);
  }

  /** Reload from disk and re-render. Called on view open and from
   *  the "Forge: Refresh chip palette" command. */
  async refresh() {
    try {
      this.groups = await loadChipsForActiveVault(
        this.app, this.host.getManifest());
    } catch (e) {
      console.error('Forge chips: load failed', e);
      this.groups = [];
    }
    this.render();
  }

  private render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('forge-chips-view');

    const header = root.createDiv({ cls: 'forge-chips-header' });
    header.createEl('h3', { text: 'Forge chips' });
    const refreshBtn = header.createEl('button', {
      text: 'Refresh',
      cls: 'forge-chips-refresh',
    });
    refreshBtn.addEventListener('click', () => { void this.refresh(); });

    if (this.groups.length === 0) {
      root.createEl('p', {
        cls: 'forge-chips-empty',
        text:
          'No chips defined. Add a `_chips.md` data snippet to your ' +
          'vault to surface authoring chips here.',
      });
      return;
    }

    for (const group of this.groups) {
      const section = root.createDiv({ cls: 'forge-chips-group' });
      section.createEl('h4', {
        text: group.sourceName,
        cls: 'forge-chips-group-header',
      });
      const row = section.createDiv({ cls: 'forge-chip-row' });
      for (const chip of group.chips) {
        const btn = row.createEl('button', {
          text: chip.label,
          cls: 'forge-chip',
        });
        btn.setAttribute('aria-label', chip.insertion);
        btn.addEventListener('click', () => {
          void this.onChipClick(chip.insertion);
        });
      }
    }
  }

  private async onChipClick(insertion: string) {
    // Re-resolve at click time, with the tracked-view fallback so
    // the pane stealing focus doesn't leave us without a target.
    const live = this.app.workspace.getActiveViewOfType(MarkdownView);
    const view = live ?? this.lastMarkdownView;
    const file = view?.file;
    if (!file) {
      new Notice('Forge chips: click into an action snippet first, ' +
        'then click the chip.');
      return;
    }

    // Action-snippet gate (per spec): chips only insert into snippets
    // whose frontmatter declares type: action. Data snippets / plain
    // notes are off-limits.
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'action') {
      new Notice('Chips only insert into action snippets.');
      return;
    }

    await this.insertViaVault(file, insertion);
  }

  /** Write the insertion through vault.process so the change is
   *  atomic and reading-mode-safe. The editor refreshes via
   *  Obsidian's modify event handler — no editor.replaceRange
   *  dispatch, so the readOnlyFacetFilter never gets a chance to
   *  silently drop the edit. */
  private async insertViaVault(file: TFile, insertion: string) {
    let outcome: 'ok' | 'no-english' | 'unchanged' = 'unchanged';
    await this.app.vault.process(file, (content) => {
      const result = insertChipText(content, insertion);
      if (result.ok) {
        outcome = 'ok';
        return result.body;
      }
      if (result.reason === CHIPS_NO_ENGLISH_SECTION) {
        outcome = 'no-english';
      }
      return content;
    });
    if (outcome === 'ok') {
      new Notice(`Forge chips: inserted "${insertion}".`);
    } else if (outcome === 'no-english') {
      new Notice('Snippet has no # English section to insert into.');
    }
  }
}
