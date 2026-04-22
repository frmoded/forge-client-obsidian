import { App, Modal, Plugin, PluginSettingTab, Setting, Notice, MarkdownView, setIcon, requestUrl } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';

import { spawn } from 'child_process';

interface ForgeSettings {
  serverUrl: string;
  isPythonFacet: boolean;
}

const DEFAULT_SETTINGS: ForgeSettings = {
  serverUrl: 'http://localhost:8000',
  isPythonFacet: false,
};

function buildSectionDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const englishDeco = Decoration.line({ class: 'forge-english-line' });
  const pythonDeco = Decoration.line({ class: 'forge-python-line' });

  type Section = 'none' | 'frontmatter' | 'english' | 'python';
  let section: Section = 'none';

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const trimmed = line.text.trim();

    // Skip YAML frontmatter block
    if (n === 1 && trimmed === '---') { section = 'frontmatter'; continue; }
    if (section === 'frontmatter') {
      if (trimmed === '---') section = 'none';
      continue;
    }

    if (trimmed === '# English') {
      section = 'english';
      builder.add(line.from, line.from, englishDeco);
    } else if (trimmed === '# Python') {
      section = 'python';
      builder.add(line.from, line.from, pythonDeco);
    } else if (trimmed === '---') {
      section = 'none'; // horizontal rule between sections
    } else if (section === 'english') {
      builder.add(line.from, line.from, englishDeco);
    } else if (section === 'python') {
      builder.add(line.from, line.from, pythonDeco);
    }
  }

  return builder.finish();
}

const sectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildSectionDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildSectionDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations }
);

const FACET_BTN_CLASS = 'forge-facet-btn';
const SNIPPET_BTN_CLASS = 'forge-snippet-btn';

function facetLabel(isPython: boolean) {
  return isPython
    ? 'Current Facet: Code\nClick for English'
    : 'Current Facet: English\nClick for Code';
}

function applyFacetClass(el: HTMLElement, isPython: boolean) {
  el.classList.toggle('forge-facet-english', !isPython);
  el.classList.toggle('forge-facet-python', isPython);
}

const FACET_ICON = {
  english: 'laptop',
  python: 'user',
} as const;

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
      callback: () => {
        this.toggleFacet();
      },
    });
    this.ensureServerRunning();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Adds the action button to the active MarkdownView if not already present.
  syncFacetButton() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    // Avoid duplicates
    if (view.containerEl.querySelector(`.${FACET_BTN_CLASS}`)) return;

    const btn = view.addAction(
      this.settings.isPythonFacet ? FACET_ICON.python : FACET_ICON.english,
      facetLabel(this.settings.isPythonFacet),
      () => { this.toggleFacet(); }
    );
    btn.addClass(FACET_BTN_CLASS);
    this.facetIconEl = btn;

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

    // Swap icon and tooltip to reflect the new active facet
    if (this.facetIconEl) {
      setIcon(this.facetIconEl, this.settings.isPythonFacet ? FACET_ICON.python : FACET_ICON.english);
      this.facetIconEl.setAttribute('aria-label', facetLabel(this.settings.isPythonFacet));
    }

    this.pingServer();
  }

  private createNewSnippet() {
    new ForgeSnippetModal(this.app).open();
  }

  async pingServer() {
    try {
      const res = await requestUrl({ url: `${this.settings.serverUrl}/test`, method: 'GET' });
      console.log('Forge API Result:', res.json);
      new Notice('Forge: Data retrieved');
    } catch {
      console.log('Forge API Error: Server offline');
    }
  }

  private spawnForgeServer(url: string) {
    const port = new URL(url).port || '8000';
    // TODO: Make the Python path and working directory configurable
    const pythonPath = '/Users/odedfuhrmann/projects/forge/.venv/bin/python';
    const serverProcess = spawn(pythonPath, [
      '-m', 'uvicorn',
      'forge.api.server:app',
      '--host', '127.0.0.1',
      '--port', port
    ], {
      cwd: '/Users/odedfuhrmann/projects/forge',
      detached: true,
      stdio: 'ignore'
    });

    serverProcess.unref();

    console.log(`Forge: Spawning server on port ${port}...`);
    new Notice('Forge: Starting background server');
  }

  async ensureServerRunning() {
    try {
      // Heartbeat check on the established test endpoint
      const res = await requestUrl({ url: `${this.settings.serverUrl}/test`, method: 'GET' });
      if (res.status === 200) {
        console.log('Forge: Server heartbeat detected');
        return;
      }
    } catch (e) {
      console.log('Forge: Server offline, attempting to spawn...');
      this.spawnForgeServer(this.settings.serverUrl);
    }
  }
}



type SnippetType = 'action' | 'data';

const TEMPLATES: Record<SnippetType, (name: string) => string> = {
  action: (name) =>
    `---\ntype: action\ndescription: ${name}\n---\n\n# English\n\n\n\n---\n\n# Python\n\ndef run(context):\n  pass\n`,
  data: (name) =>
    `---\ntype: data\ndescription: ${name}\n---\n\n# Parameters\n\n\n`,
};

class ForgeSnippetModal extends Modal {
  private snippetName = '';
  private snippetType: SnippetType = 'action';

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'New Snippet' });

    new Setting(contentEl)
      .setName('Snippet Name')
      .addText(text =>
        text.setPlaceholder('my-snippet').onChange(v => { this.snippetName = v.trim(); })
      );

    new Setting(contentEl)
      .setName('Snippet Type')
      .addDropdown(drop =>
        drop
          .addOption('action', 'Action')
          .addOption('data', 'Data')
          .setValue(this.snippetType)
          .onChange(v => { this.snippetType = v as SnippetType; })
      );

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Create')
          .setCta()
          .onClick(() => this.submit())
      );
  }

  onClose() {
    this.contentEl.empty();
  }

  private async submit() {
    if (!this.snippetName) {
      new Notice('Forge: Snippet name is required.');
      return;
    }

    const path = `${this.snippetName}.md`;
    const content = TEMPLATES[this.snippetType](this.snippetName);

    try {
      await this.app.vault.create(path, content);
      new Notice(`Forge: Created ${path}`);
      this.close();
    } catch {
      new Notice(`Forge: Could not create file — does it already exist?`);
    }
  }
}

class ForgeSettingTab extends PluginSettingTab {
  plugin: ForgePlugin;

  constructor(app: App, plugin: ForgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('URL of the Forge server.')
      .addText(text =>
        text
          .setPlaceholder('http://localhost:3000')
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
