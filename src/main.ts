import { Plugin, Notice, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from './output-view';
import { ForgeThreeView, THREE_VIEW_TYPE } from './three-view';
import { ForgeEdgesView, EDGES_VIEW_TYPE } from './edges-view';
import { invalidateLibraryVaultCache } from './edges';
import { ForgeSettings, DEFAULT_SETTINGS, ForgeSettingTab } from './settings';
import { sectionPlugin } from './facet';
import { ForgeSnippetModal, ForgeRunModal, ForgeFreezeModal } from './modal';
import { ensureServerRunning, computeSnippet, connectVault, generateSnippet, freezeEdge } from './server';
import { runFirstRunCheck } from './welcome';
import { parseZapLine } from './zap';

function replacePythonSection(content: string, code: string): string {
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.trim() === '# Python');
  if (idx === -1) return content;
  const before = lines.slice(0, idx).join('\n');
  return `${before}\n# Python\n\n\`\`\`python\n${code}\n\`\`\`\n`;
}

const SNIPPET_BTN_CLASS = 'forge-snippet-btn';
const RUN_BTN_CLASS = 'forge-run-btn';
const HAMMER_BTN_CLASS = 'forge-hammer-btn';

export default class ForgePlugin extends Plugin {
  settings: ForgeSettings;
  private inputCache: Record<string, Record<string, string>> = {};
  private snippetInventory: Record<string, string[]> = {};
  private freezeCache: { caller?: string; callee?: string } = {};

  async onload() {
    await this.loadSettings();

    this.registerView(OUTPUT_VIEW_TYPE, leaf => new ForgeOutputView(leaf));
    this.registerView(THREE_VIEW_TYPE, leaf => new ForgeThreeView(leaf));
    this.registerView(EDGES_VIEW_TYPE, leaf => new ForgeEdgesView(leaf, () => this.settings.serverUrl));
    this.registerEditorExtension([sectionPlugin]);

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.syncButtons())
    );
    this.syncButtons();

    this.addRibbonIcon('zap', 'New Snippet', () => {
      this.createNewSnippet();
    });

    this.addRibbonIcon('git-branch', 'Forge Edges', () => {
      this.openEdgesView();
    });

    this.addSettingTab(new ForgeSettingTab(this.app, this));

    this.addCommand({
      id: 'forge-show-edges-panel',
      name: 'Show edges panel',
      callback: () => { this.openEdgesView(); },
    });

    this.addCommand({
      id: 'forge-open-3d',
      name: 'Open 3D View',
      callback: async () => {
        const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
        await leaf.setViewState({ type: THREE_VIEW_TYPE, active: true });
        this.app.workspace.revealLeaf(leaf);
      },
    });

    this.addCommand({
      id: 'forge-zap-line',
      name: 'Zap line',
      callback: () => { this.runZapLine(); },
    });

    this.addCommand({
      id: 'forge-freeze-edge',
      name: 'Freeze edge',
      callback: () => { this.openFreezeModal('frozen'); },
    });

    this.addCommand({
      id: 'forge-unfreeze-edge',
      name: 'Unfreeze edge',
      callback: () => { this.openFreezeModal('live'); },
    });

    await runFirstRunCheck(this.app);
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

    // Remove any stale Forge buttons from a previous plugin load before adding fresh ones.
    view.containerEl.querySelectorAll(
      `.${SNIPPET_BTN_CLASS}, .${RUN_BTN_CLASS}, .${HAMMER_BTN_CLASS}, .forge-forge-btn`
    ).forEach(el => el.remove());

    const snippetBtn = view.addAction('zap', 'New Snippet', () => { this.createNewSnippet(); });
    snippetBtn.addClass(SNIPPET_BTN_CLASS);

    const runBtn = view.addAction('play', 'Zap', () => { this.runZapLine(); });
    runBtn.addClass(RUN_BTN_CLASS);

    const hammerBtn = view.addAction('hammer', 'Hammer Snippet', () => { this.hammerSnippet(); });
    hammerBtn.addClass(HAMMER_BTN_CLASS);
  }

  private createNewSnippet() {
    new ForgeSnippetModal(this.app).open();
  }

  private async openEdgesView() {
    const existing = this.app.workspace.getLeavesOfType(EDGES_VIEW_TYPE)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
    await leaf.setViewState({ type: EDGES_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private openFreezeModal(state: 'frozen' | 'live') {
    new ForgeFreezeModal(this.app, state, this.freezeCache, async (caller, callee) => {
      this.freezeCache = { caller, callee };
      const vaultPath = (this.app.vault.adapter as any).basePath as string;
      const verb = state === 'frozen' ? 'freeze' : 'unfreeze';
      try {
        const res = await freezeEdge(this.settings.serverUrl, vaultPath, caller, callee, state);
        if (res.status === 200) {
          new Notice(`Forge: ${verb}d ${caller} → ${callee}`);
        } else if (res.status === 404) {
          new Notice(`Forge: no snapshot for ${caller} → ${callee}. Run the edge first.`);
        } else {
          const detail = res.json?.detail ?? `HTTP ${res.status}`;
          new Notice(`Forge: ${verb} failed — ${detail}`);
        }
      } catch (e) {
        console.error(`Forge ${verb} error:`, e);
        new Notice(`Forge: ${verb} failed — check console.`);
      }
    }).open();
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
      const connectRes = await connectVault(this.settings.serverUrl, vaultPath);
      this.snippetInventory = connectRes?.snippets ?? {};
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

  // Line-first Zap: if the cursor's line contains [[id]] (with optional args),
  // run that. Otherwise fall back to the legacy whole-note behavior.
  private async runZapLine() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note to zap.');
      return;
    }

    const editor = view.editor;
    const lineNum = editor.getCursor().line;
    const line = editor.getLine(lineNum);
    const parsed = parseZapLine(line);

    if (parsed) {
      const vaultPath = (this.app.vault.adapter as any).basePath as string;
      await this.computeSnippetWithArgs(vaultPath, parsed.snippetId, parsed.args, parsed.inputs);
      return;
    }

    // Fallback: run the whole note as a snippet (basename = snippet_id).
    await this.runSnippet();
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
        this.computeSnippetWithArgs(vaultPath, snippetId, [], kwargs as Record<string, unknown>);
      }).open();
    } else {
      await this.computeSnippetWithArgs(vaultPath, snippetId, [], {});
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

  private async computeSnippetWithArgs(
    vaultPath: string,
    snippetId: string,
    args: unknown[],
    inputs: Record<string, unknown>,
  ) {
    console.log('Forge Compute →', { serverUrl: this.settings.serverUrl, vaultPath, snippetId, args, inputs });

    try {
      const connectRes = await connectVault(this.settings.serverUrl, vaultPath);
      this.snippetInventory = connectRes?.snippets ?? {};
    } catch (e) {
      console.error('Forge Connect Error:', e);
      new Notice('Forge: Connect failed — check console.');
      return;
    }

    let res;
    try {
      res = await computeSnippet(this.settings.serverUrl, vaultPath, snippetId, args, inputs);
    } catch (e) {
      console.error('Forge Compute Error:', e);
      new Notice('Forge: Compute failed — check console.');
      return;
    }

    const outputView = await this.getOutputView();

    if (res.status >= 400) {
      const detail = res.json?.detail;
      const errorMsg = (detail && typeof detail === 'object' && detail.error)
        ? detail.error
        : (typeof detail === 'string' ? detail : `HTTP ${res.status}`);
      const stdout = (detail && typeof detail === 'object' && detail.stdout) ? detail.stdout : '';
      console.warn('Forge Compute non-2xx:', res.status, detail);
      outputView.appendError(snippetId, errorMsg, stdout);
      return;
    }

    const result = res.json;
    console.log('Forge Compute Result:', result);
    outputView.append(snippetId, result.stdout ?? '', result.result);

    // Surface install metadata to the debug log; the message is rendered to the user.
    if (snippetId === 'install' && result.result && typeof result.result === 'object') {
      console.log('Forge Install:', {
        vault_name: result.result.vault_name,
        version: result.result.version,
      });

      // Refresh inventory so newly installed snippets become visible.
      try {
        const refreshed = await connectVault(this.settings.serverUrl, vaultPath);
        this.snippetInventory = refreshed?.snippets ?? {};
        invalidateLibraryVaultCache();
        console.log('Forge inventory after install:', this.snippetInventory);
      } catch (e) {
        console.warn('Forge: post-install refresh failed', e);
      }
    }
  }
}
