import { App, Modal, Notice, Setting } from 'obsidian';

type SnippetType = 'action' | 'data';

const TEMPLATES: Record<SnippetType, (name: string) => string> = {
  action: (name) => [
    '---',
    'type: action',
    `description: ${name}`,
    'inputs: []',
    '---',
    '',
    '# English',
    '',
    '',
    '',
    '---',
    '',
    '# Python',
    '',
    'def run(context):',
    '  pass',
    '',
  ].join('\n'),

  data: (name) => [
    '---',
    'type: data',
    `description: ${name}`,
    '---',
    '',
    '# Parameters',
    '',
    '',
  ].join('\n'),
};

export class ForgeSnippetModal extends Modal {
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
