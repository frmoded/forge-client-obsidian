import { App, Plugin, PluginSettingTab, Setting, Notice, MarkdownView, setIcon } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';

interface ForgeSettings {
  serverUrl: string;
  isPythonFacet: boolean;
}

const DEFAULT_SETTINGS: ForgeSettings = {
  serverUrl: 'http://localhost:3000',
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
      callback: () => this.toggleFacet(),
    });
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
  }

  toggleFacet() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice('No active note to toggle.');
      return;
    }

    this.settings.isPythonFacet = !this.settings.isPythonFacet;
    this.saveSettings();

    applyFacetClass(activeView.containerEl, this.settings.isPythonFacet);

    // Swap icon and tooltip to reflect the new active facet
    if (this.facetIconEl) {
      setIcon(this.facetIconEl, this.settings.isPythonFacet ? FACET_ICON.python : FACET_ICON.english);
      this.facetIconEl.setAttribute('aria-label', facetLabel(this.settings.isPythonFacet));
    }

    // new Notice(`Forge: Switched to ${this.settings.isPythonFacet ? 'Python' : 'English'} Facet`);
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
