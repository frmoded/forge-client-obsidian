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
import { pingServer, ensureServerRunning, executeSnippet, connectVault, generateSnippet } from './server';

function replacePythonSection(content: string, code: string): string {
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.trim() === '# Python');
  if (idx === -1) return content;
  const before = lines.slice(0, idx).join('\n');
  return `${before}\n# Python\n\n\`\`\`python\n${code}\n\`\`\`\n`;
}

const SNIPPET_BTN_CLASS = 'forge-snippet-btn';
const RUN_BTN_CLASS = 'forge-run-btn';
const FORGE_BTN_CLASS = 'forge-forge-btn';
const HAMMER_BTN_CLASS = 'forge-hammer-btn';

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

  // Adds action buttons and syncs facet CSS class to the active MarkdownView.
  syncFacetButton() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    applyFacetClass(view.containerEl, this.settings.isPythonFacet);

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

    if (!view.containerEl.querySelector(`.${RUN_BTN_CLASS}`)) {
      const runBtn = view.addAction('play', 'Run Snippet', () => { this.runSnippet(); });
      runBtn.addClass(RUN_BTN_CLASS);
    }

    if (!view.containerEl.querySelector(`.${FORGE_BTN_CLASS}`)) {
      const forgeBtn = view.addAction('gavel', 'Forge Snippet (recursive)', () => { this.forgeSnippet(); });
      forgeBtn.addClass(FORGE_BTN_CLASS);
    }

    if (!view.containerEl.querySelector(`.${HAMMER_BTN_CLASS}`)) {
      const hammerBtn = view.addAction('hammer', 'Hammer Snippet (single)', () => { this.hammerSnippet(); });
      hammerBtn.addClass(HAMMER_BTN_CLASS);
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

  private async forgeSnippet() {
    await this.generate(true);
  }

  private async hammerSnippet() {
    await this.generate(false);
  }

  private async generate(recursive: boolean) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note to generate.');
      return;
    }

    const snippetId = view.file.basename;
    const vaultPath = (this.app.vault.adapter as any).basePath as string;

    try {
      await connectVault(this.settings.serverUrl, vaultPath);
    } catch (e) {
      console.error('Forge Connect Error:', e);
      new Notice('Forge: Connect failed — check console.');
      return;
    }

    try {
      new Notice(`Forge: Generating ${recursive ? '(recursive)' : '(single)'}…`);
      const result = await generateSnippet(this.settings.serverUrl, vaultPath, snippetId, recursive);
      console.log('Forge Generate Result:', result);
      await this.writeGeneratedCode(result.generated);
      new Notice(`Forge: ${Object.keys(result.generated).length} snippet(s) written.`);
    } catch (e) {
      console.error('Forge Generate Error:', e);
      new Notice('Forge: Generation failed — check console.');
    }
  }

  private async writeGeneratedCode(generated: Record<string, string>) {
    const files = this.app.vault.getMarkdownFiles();

    for (const [id, code] of Object.entries(generated)) {
      const file = files.find(f => f.basename === id);
      if (!file) {
        console.warn(`Forge: no file found for snippet '${id}'`);
        continue;
      }
      const content = await this.app.vault.read(file);
      const updated = replacePythonSection(content, code);
      await this.app.vault.modify(file, updated);
    }
  }

  private async runSnippet() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note to run.');
      return;
    }

    const snippetId = view.file.basename;
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    console.log('Forge Run →', { serverUrl: this.settings.serverUrl, vaultPath, snippetId });

    try {
      await connectVault(this.settings.serverUrl, vaultPath);
      console.log('Forge: vault connected');
    } catch (e) {
      console.error('Forge Connect Error:', e);
      new Notice('Forge: Connect failed — check console.');
      return;
    }

    try {
      const result = await executeSnippet(this.settings.serverUrl, vaultPath, snippetId);
      console.log('Forge Run Result:', result);
      const output = result.result ?? result.stdout?.trim() ?? '(no output)';
      new Notice(`Forge: ${snippetId} → ${output}`);
    } catch (e) {
      console.error('Forge Execute Error:', e);
      new Notice('Forge: Execute failed — check console.');
    }
  }
}
