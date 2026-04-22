import { App, PluginSettingTab, Setting } from 'obsidian';
import type ForgePlugin from './main';

export interface ForgeSettings {
  serverUrl: string;
  isPythonFacet: boolean;
}

export const DEFAULT_SETTINGS: ForgeSettings = {
  serverUrl: 'http://localhost:8000',
  isPythonFacet: false,
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
  }
}
