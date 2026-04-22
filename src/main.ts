import { Plugin, Notice, MarkdownView } from 'obsidian';
import { ForgeSettings, DEFAULT_SETTINGS, ForgeSettingTab } from './settings';
import {
  sectionPlugin,
  applyFacetClass,
  updateFacetButton,
  facetLabel,
  FACET_BTN_CLASS,
  FACET_ICON,
} from './facet';
import { ForgeSnippetModal } from './modal';
import { pingServer, ensureServerRunning } from './server';

const SNIPPET_BTN_CLASS = 'forge-snippet-btn';

export default class ForgePlugin extends Plugin {
  settings: ForgeSettings;
  private facetIconEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();

    this.registerEditorExtension([sectionPlugin]);

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.syncFacetButton())
    );

    // Apply saved state and button to any already-open views
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view instanceof MarkdownView) {
        applyFacetClass(leaf.view.containerEl, this.settings.isPythonFacet);
      }
    });
    this.syncFacetButton();

    this.addRibbonIcon('zap', 'Forge', () => {
      new Notice('Hello Forge TS1.');
    });

    this.addSettingTab(new ForgeSettingTab(this.app, this));

    this.addCommand({
      id: 'forge-toggle-facet',
      name: 'Toggle Facet (English/Python)',
      callback: () => { this.toggleFacet(); },
    });

    ensureServerRunning(this.settings.serverUrl);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Adds action buttons to the active MarkdownView if not already present.
  syncFacetButton() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    if (!view.containerEl.querySelector(`.${FACET_BTN_CLASS}`)) {
      const btn = view.addAction(
        this.settings.isPythonFacet ? FACET_ICON.python : FACET_ICON.english,
        facetLabel(this.settings.isPythonFacet),
        () => { this.toggleFacet(); }
      );
      btn.addClass(FACET_BTN_CLASS);
      this.facetIconEl = btn;
    }

    if (!view.containerEl.querySelector(`.${SNIPPET_BTN_CLASS}`)) {
      const snippetBtn = view.addAction('file-plus', 'New Snippet', () => { this.createNewSnippet(); });
      snippetBtn.addClass(SNIPPET_BTN_CLASS);
    }
  }

  toggleFacet() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice('No active note to toggle.');
      return;
    }

    this.settings.isPythonFacet = !this.settings.isPythonFacet;
    this.saveSettings();
    console.log(`Forge Facet Toggled. Current mode: ${this.settings.isPythonFacet ? 'Python' : 'English'}`);

    applyFacetClass(activeView.containerEl, this.settings.isPythonFacet);
    updateFacetButton(activeView, this.facetIconEl, this.settings.isPythonFacet);

    pingServer(this.settings.serverUrl);
  }

  private createNewSnippet() {
    new ForgeSnippetModal(this.app).open();
  }
}
