import { App, PluginSettingTab, Setting } from 'obsidian';
import type ForgePlugin from './main';

export interface ForgeSettings {
  serverUrl: string;
  isPythonFacet: boolean;
  // V1 Phase 2: when true, the moda simulator iframe loads from the
  // Vite dev server (http://localhost:5173) for iterative iframe
  // development. Defaults to false (production: load the bundled
  // iframe from the plugin's installed assets/iframe/).
  useDevIframe: boolean;
}

export const DEFAULT_SETTINGS: ForgeSettings = {
  serverUrl: 'http://localhost:8000',
  isPythonFacet: false,
  useDevIframe: false,
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

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('URL of the Forge server.')
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
