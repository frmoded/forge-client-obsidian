import { Plugin, Notice, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from './output-view';
import { ForgeThreeView, THREE_VIEW_TYPE } from './three-view';
import { ForgeSettings, DEFAULT_SETTINGS, ForgeSettingTab } from './settings';
import { sectionPlugin } from './facet';
import { ForgeSnippetModal, ForgeRunModal } from './modal';
import { ensureServerRunning, executeSnippet, connectVault, generateSnippet } from './server';

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
  private inputCache: Record<string, Record<string, string>> = {};

  async onload() {
    await this.loadSettings();

    this.registerView(OUTPUT_VIEW_TYPE, leaf => new ForgeOutputView(leaf));
    this.registerView(THREE_VIEW_TYPE, leaf => new ForgeThreeView(leaf));
    this.registerEditorExtension([sectionPlugin]);

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.syncButtons())
    );
    this.syncButtons();

    this.addRibbonIcon('zap', 'New Snippet', () => {
      this.createNewSnippet();
    });

    this.addSettingTab(new ForgeSettingTab(this.app, this));

    this.addCommand({
      id: 'forge-open-3d',
      name: 'Open 3D View',
      callback: async () => {
        const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
        await leaf.setViewState({ type: THREE_VIEW_TYPE, active: true });
        this.app.workspace.revealLeaf(leaf);
      },
    });

    ensureServerRunning(this.settings.serverUrl);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  syncButtons() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    if (!view.containerEl.querySelector(`.${SNIPPET_BTN_CLASS}`)) {
      const btn = view.addAction('zap', 'New Snippet', () => { this.createNewSnippet(); });
      btn.addClass(SNIPPET_BTN_CLASS);
    }

    if (!view.containerEl.querySelector(`.${RUN_BTN_CLASS}`)) {
      const btn = view.addAction('play', 'Run Snippet', () => { this.runSnippet(); });
      btn.addClass(RUN_BTN_CLASS);
    }

    if (!view.containerEl.querySelector(`.${FORGE_BTN_CLASS}`)) {
      const btn = view.addAction('gavel', 'Forge Snippet (recursive)', () => { this.forgeSnippet(); });
      btn.addClass(FORGE_BTN_CLASS);
    }

    if (!view.containerEl.querySelector(`.${HAMMER_BTN_CLASS}`)) {
      const btn = view.addAction('hammer', 'Hammer Snippet (single)', () => { this.hammerSnippet(); });
      btn.addClass(HAMMER_BTN_CLASS);
    }
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
    try {
    console.log('Forge: generate clicked v2', { recursive });
    new Notice(`Forge: ${recursive ? 'Forging' : 'Hammering'}…`);

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    console.log('Forge: view?', !!view, 'file?', !!view?.file);
    if (!view?.file) {
      new Notice('No active note to generate.');
      return;
    }

    const snippetId = view.file.basename;
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    console.log('Forge: snippetId, vaultPath →', snippetId, vaultPath);

    console.log('Forge: connecting to', this.settings.serverUrl, vaultPath);
    try {
      await connectVault(this.settings.serverUrl, vaultPath);
      console.log('Forge: connected');
    } catch (e) {
      console.error('Forge Connect Error:', e);
      new Notice('Forge: Connect failed — check console.');
      return;
    }

    try {
      console.log('Forge: calling /generate', { snippetId, recursive });
      new Notice(`Forge: Generating ${recursive ? '(recursive)' : '(single)'}…`);
      const result = await generateSnippet(this.settings.serverUrl, vaultPath, snippetId, recursive);
      console.log('Forge Generate Result:', result);
      await this.writeGeneratedCode(result.generated);
      new Notice(`Forge: ${Object.keys(result.generated).length} snippet(s) written.`);
    } catch (e) {
      console.error('Forge Generate Error:', e);
      new Notice('Forge: Generation failed — check console.');
    }
    } catch (outer) {
      console.error('Forge: unexpected error in generate', outer);
      new Notice('Forge: unexpected error — check console.');
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
      await this.app.vault.modify(file, replacePythonSection(content, code));
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
    const frontmatter = this.app.metadataCache.getFileCache(view.file)?.frontmatter;
    const inputs: string[] = frontmatter?.inputs ?? [];

    if (inputs.length > 0) {
      const cached = this.inputCache[snippetId] ?? {};
      new ForgeRunModal(this.app, snippetId, inputs, cached, (kwargs, raw) => {
        this.inputCache[snippetId] = raw;
        this.executeSnippetWithArgs(vaultPath, snippetId, kwargs);
      }).open();
    } else {
      await this.executeSnippetWithArgs(vaultPath, snippetId, {});
    }
  }

  private async getOutputView(): Promise<ForgeOutputView> {
    const existing = this.app.workspace.getLeavesOfType(OUTPUT_VIEW_TYPE)[0];
    if (existing) return existing.view as ForgeOutputView;

    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
    await leaf.setViewState({ type: OUTPUT_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view as ForgeOutputView;
  }

  private async executeSnippetWithArgs(vaultPath: string, snippetId: string, kwargs: Record<string, unknown>) {
    console.log('Forge Run →', { serverUrl: this.settings.serverUrl, vaultPath, snippetId, kwargs });

    try {
      await connectVault(this.settings.serverUrl, vaultPath);
    } catch (e) {
      console.error('Forge Connect Error:', e);
      new Notice('Forge: Connect failed — check console.');
      return;
    }

    try {
      const result = await executeSnippet(this.settings.serverUrl, vaultPath, snippetId, kwargs);
      console.log('Forge Run Result:', result);
      const outputView = await this.getOutputView();
      outputView.append(snippetId, result.stdout ?? '', result.result);
    } catch (e) {
      console.error('Forge Execute Error:', e);
      new Notice('Forge: Execute failed — check console.');
    }
  }
}
