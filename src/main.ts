import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';

interface ForgeSettings {
  serverUrl: string;
}

const DEFAULT_SETTINGS: ForgeSettings = {
  serverUrl: 'http://localhost:3000',
};

export default class ForgePlugin extends Plugin {
  settings: ForgeSettings;

  async onload() {
    await this.loadSettings();

    // Ribbon icon to trigger Forge action
    this.addRibbonIcon('zap', 'Forge', () => {
      new Notice('Forge is connected.');
    });

    this.addSettingTab(new ForgeSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
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
