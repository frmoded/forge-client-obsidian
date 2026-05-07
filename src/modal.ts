import { App, Modal, Notice, Setting } from 'obsidian';

// Blocking modal shown during generation. Clicking outside, the X button, and
// pressing Escape all funnel through close(); we no-op those until the caller
// invokes finish() so the user can't interact with the workspace mid-LLM call.
export class ForgeGenerationModal extends Modal {
  private allowClose = false;

  constructor(app: App, private label: string) {
    super(app);
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass('forge-generation-modal');
    // Hide the default close button — there's no escape until generation completes.
    modalEl.querySelector('.modal-close-button')?.remove();

    const wrap = contentEl.createDiv({ cls: 'forge-generation-wrap' });
    const spinner = wrap.createDiv({ cls: 'forge-spinner' });
    spinner.createDiv({ cls: 'forge-spinner-ring' });
    wrap.createEl('p', { text: this.label, cls: 'forge-generation-label' });
  }

  close() {
    if (this.allowClose) super.close();
  }

  finish() {
    this.allowClose = true;
    super.close();
  }
}

export class ForgeFreezeModal extends Modal {
  private caller = '';
  private callee = '';

  constructor(
    app: App,
    private action: 'frozen' | 'live',
    private cached: { caller?: string; callee?: string },
    private onSubmit: (caller: string, callee: string) => void,
  ) {
    super(app);
    this.caller = cached.caller ?? '';
    this.callee = cached.callee ?? '';
  }

  onOpen() {
    const { contentEl } = this;
    const title = this.action === 'frozen' ? 'Freeze edge' : 'Unfreeze edge';
    contentEl.createEl('h2', { text: title });
    contentEl.createEl('p', {
      text: 'Identify the edge by qualified caller and callee snippet IDs (e.g. "authoring/foo", "forge-core/hello_registry").',
    });

    new Setting(contentEl)
      .setName('Caller')
      .addText(t => t.setValue(this.caller).setPlaceholder('authoring/caller_id').onChange(v => { this.caller = v.trim(); }));

    new Setting(contentEl)
      .setName('Callee')
      .addText(t => t.setValue(this.callee).setPlaceholder('authoring/callee_id').onChange(v => { this.callee = v.trim(); }));

    new Setting(contentEl).addButton(btn =>
      btn.setButtonText(this.action === 'frozen' ? 'Freeze' : 'Unfreeze').setCta().onClick(() => this.submit())
    );
  }

  onClose() {
    this.contentEl.empty();
  }

  private submit() {
    if (!this.caller || !this.callee) {
      new Notice('Forge: caller and callee are required.');
      return;
    }
    this.close();
    this.onSubmit(this.caller, this.callee);
  }
}

export class ForgeRunModal extends Modal {
  private values: Record<string, string> = {};

  constructor(
    app: App,
    private snippetId: string,
    private inputs: string[],
    private cached: Record<string, string>,
    private onRun: (kwargs: Record<string, unknown>, raw: Record<string, string>) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: `Run: ${this.snippetId}` });

    for (const name of this.inputs) {
      this.values[name] = this.cached[name] ?? '';
      new Setting(contentEl)
        .setName(name)
        .addText(text => {
          text.setValue(this.values[name])
            .setPlaceholder(name)
            .onChange(v => { this.values[name] = v; });
        });
    }

    new Setting(contentEl)
      .addButton(btn =>
        btn.setButtonText('Run').setCta().onClick(() => this.submit())
      );
  }

  onClose() {
    this.contentEl.empty();
  }

  private submit() {
    const kwargs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.values)) {
      try { kwargs[k] = JSON.parse(v); } catch { kwargs[k] = v; }
    }
    this.close();
    this.onRun(kwargs, { ...this.values });
  }
}

type SnippetType = 'action' | 'data';

// Used when /connect doesn't carry a content_types list (older backend, or
// connect failed). Keep aligned with forge.core.serialization.SUPPORTED_CONTENT_TYPES.
const FALLBACK_CONTENT_TYPES = ['json', 'text', 'markdown', 'musicxml', 'svg'];

// Fence language tag per content_type. Obsidian's preview renders these
// nicely; the Phase 2 rendering work will lean on the same mapping.
const FENCE_LANG: Record<string, string> = {
  json: 'json',
  text: 'text',
  markdown: 'markdown',
  musicxml: 'xml',
  svg: 'xml',
};

// Seed payload per content_type — short and instructive where possible,
// blank where any concrete seed would feel arbitrary.
const SEED: Record<string, string> = {
  json: '{}',
  text: '',
  markdown: '',
  musicxml: '<!-- Replace with valid MusicXML. Use music21 to export an example. -->',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"></svg>',
};

function actionTemplate(name: string): string {
  return [
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
    'def compute(context):',
    '  pass',
    '',
  ].join('\n');
}

function dataTemplate(name: string, contentType: string): string {
  const lang = FENCE_LANG[contentType] ?? 'text';
  const seed = SEED[contentType] ?? '';
  return [
    '---',
    'type: data',
    `content_type: ${contentType}`,
    `description: ${name}`,
    '---',
    '',
    '# English',
    '',
    'Describe what this data represents and how snippets that consume it should use it.',
    '',
    '# Body',
    '',
    '```' + lang,
    seed,
    '```',
    '',
  ].join('\n');
}

export class ForgeSnippetModal extends Modal {
  private snippetName = '';
  private snippetType: SnippetType = 'action';
  private contentType: string;
  private contentTypes: string[];
  private contentTypeSetting?: Setting;

  // contentTypes comes from /connect's response; the caller fetches it before
  // opening the modal. Falls back to a hardcoded list if absent (older backend
  // or /connect failed) so the modal still works without a live server.
  constructor(app: App, contentTypes?: string[]) {
    super(app);
    this.contentTypes = (contentTypes && contentTypes.length > 0)
      ? contentTypes
      : FALLBACK_CONTENT_TYPES;
    this.contentType = this.contentTypes[0];
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
          .onChange(v => {
            this.snippetType = v as SnippetType;
            this.updateContentTypeVisibility();
          })
      );

    this.contentTypeSetting = new Setting(contentEl)
      .setName('Content Type')
      .setDesc('Format of the data payload (only used for Data snippets)')
      .addDropdown(drop => {
        for (const ct of this.contentTypes) drop.addOption(ct, ct);
        drop.setValue(this.contentType).onChange(v => { this.contentType = v; });
      });

    this.updateContentTypeVisibility();

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

  private updateContentTypeVisibility() {
    if (!this.contentTypeSetting) return;
    this.contentTypeSetting.settingEl.style.display =
      this.snippetType === 'data' ? '' : 'none';
  }

  private async submit() {
    if (!this.snippetName) {
      new Notice('Forge: Snippet name is required.');
      return;
    }

    const path = `${this.snippetName}.md`;
    const content = this.snippetType === 'data'
      ? dataTemplate(this.snippetName, this.contentType)
      : actionTemplate(this.snippetName);

    let file;
    try {
      file = await this.app.vault.create(path, content);
    } catch {
      new Notice(`Forge: Could not create file — does it already exist?`);
      return;
    }

    new Notice(`Forge: Created ${path}`);
    this.close();

    // Open the new file so the user can immediately start authoring — the
    // whole point of the data snippet is the body content they're about to
    // paste, so saving them a second click matters.
    try {
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (e) {
      console.warn('Forge: could not open newly created snippet', e);
    }
  }
}
