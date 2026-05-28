import { App, PluginSettingTab, Setting } from 'obsidian';
import type ForgePlugin from './main';

export interface ForgeSettings {
  serverUrl: string;
  // v0.2.9: isPythonFacet removed — dead field, never read after
  // Phase 6.5 moved facet mode into snippet frontmatter
  // (edit_mode: english|python). Existing data.json copies of the
  // field are harmless: Object.assign in loadSettings drops unknowns
  // on first save.
  // V1 Phase 2: when true, the moda simulator iframe loads from the
  // Vite dev server (http://localhost:5173) for iterative iframe
  // development. Defaults to false (production: load the bundled
  // iframe from the plugin's installed assets/iframe/).
  useDevIframe: boolean;
  // V1 α (v0.2.4): hosted /generate endpoint. The plugin no longer
  // proxies to the local engine for transpilation — it POSTs to a
  // hosted service that holds the Anthropic key server-side. Single
  // shared secret per closed-beta cohort; per-user tokens are v1.1.
  transpileServiceUrl: string;
  transpileServiceToken: string;
  // v0.2.7: persisted across sessions via Obsidian's loadData/saveData.
  // Defaults to false so a fresh install fires the welcome notice once;
  // flipped to true immediately after the notice is shown. Migrating
  // users from v0.2.6 also get the notice once because the field
  // doesn't exist in their data.json — Object.assign keeps the
  // DEFAULT_SETTINGS value during loadSettings.
  seenWelcome: boolean;
}

export const DEFAULT_SETTINGS: ForgeSettings = {
  serverUrl: 'http://localhost:8000',
  useDevIframe: false,
  transpileServiceUrl: 'https://forge.thecodingarena.com',
  transpileServiceToken: '',
  seenWelcome: false,
};

export class ForgeSettingTab extends PluginSettingTab {
  plugin: ForgePlugin;

  constructor(app: App, plugin: ForgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // --- Transpile service (hosted /generate) ---------------------
    // First section — the token field is the one thing students must
    // configure post-install before /generate works.
    containerEl.createEl('h3', { text: 'Transpile service' });

    new Setting(containerEl)
      .setName('Transpile service URL')
      .setDesc(
        'Hosted /generate endpoint. Default is the seminar service. '
        + 'Change only if pointing at a different α instance '
        + '(e.g. http://localhost:8001 for local α dev).'
      )
      .addText(text =>
        text
          .setPlaceholder('https://forge.thecodingarena.com')
          .setValue(this.plugin.settings.transpileServiceUrl)
          .onChange(async (value) => {
            this.plugin.settings.transpileServiceUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Transpile service token')
      .setDesc(
        'Paste the auth token you received by email. Required for '
        + 'English → Python transpilation. Stored locally in this '
        + "vault's plugin data; never shared except as the "
        + 'Authorization header on /generate requests.'
      )
      .addText(text => {
        text
          .setPlaceholder('paste token here')
          .setValue(this.plugin.settings.transpileServiceToken)
          .onChange(async (value) => {
            this.plugin.settings.transpileServiceToken = value.trim();
            await this.plugin.saveSettings();
          });
        // Mask the input. The underlying element is a standard
        // HTMLInputElement; type='password' works directly.
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
        text.inputEl.spellcheck = false;
      });

    // --- Local engine (dev, secondary endpoints) ------------------
    containerEl.createEl('h3', { text: 'Local engine (dev)' });

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc(
        'URL of the local Forge engine. Used by /canonicalize and '
        + '/sync_dependencies (non-/generate endpoints). V1 plugin '
        + "uses Pyodide for compute and the transpile service above "
        + 'for /generate — this field only matters if you run the '
        + 'local engine for those secondary endpoints.'
      )
      .addText(text =>
        text
          .setPlaceholder('http://localhost:8000')
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Use dev iframe (localhost:5173)')
      .setDesc(
        'When enabled, the moda simulator loads from the Vite dev '
        + 'server at http://localhost:5173 for iframe iteration. '
        + 'Default (off) loads the iframe bundled with the plugin.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.useDevIframe)
          .onChange(async (value) => {
            this.plugin.settings.useDevIframe = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
