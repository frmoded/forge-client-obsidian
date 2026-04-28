import { ItemView, WorkspaceLeaf } from 'obsidian';

export const OUTPUT_VIEW_TYPE = 'forge-output';

export class ForgeOutputView extends ItemView {
  private outputEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return OUTPUT_VIEW_TYPE; }
  getDisplayText() { return 'Forge Output'; }
  getIcon() { return 'zap'; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv({ cls: 'forge-output-header' });
    header.createEl('span', { text: 'Forge Output' });
    header.createEl('button', { text: 'Clear' }).onclick = () => {
      this.outputEl.empty();
    };

    this.outputEl = contentEl.createDiv({ cls: 'forge-output-body' });
  }

  async onClose() {
    this.contentEl.empty();
  }

  append(snippetId: string, stdout: string, result: unknown) {
    const entry = this.makeEntry(snippetId);

    if (stdout) {
      entry.createEl('pre', { text: stdout, cls: 'forge-output-stdout' });
    }

    // If result is an object with a `message` field, render the message verbatim
    // (e.g. install snippet's user-facing string). Otherwise stringify.
    if (isObjectWithMessage(result)) {
      entry.createEl('p', { text: result.message, cls: 'forge-output-message' });
    } else if (result !== null && result !== undefined) {
      entry.createEl('pre', {
        text: `→ ${JSON.stringify(result)}`,
        cls: 'forge-output-result',
      });
    }

    entry.scrollIntoView({ behavior: 'smooth' });
  }

  appendError(snippetId: string, errorMsg: string, stdout: string) {
    const entry = this.makeEntry(snippetId);
    entry.addClass('is-error');
    entry.createEl('p', { text: errorMsg, cls: 'forge-output-error' });
    if (stdout) {
      entry.createEl('pre', { text: stdout, cls: 'forge-output-stdout' });
    }
    entry.scrollIntoView({ behavior: 'smooth' });
  }

  private makeEntry(snippetId: string): HTMLElement {
    const entry = this.outputEl.createDiv({ cls: 'forge-output-entry' });
    const meta = entry.createDiv({ cls: 'forge-output-meta' });
    meta.createEl('span', { text: snippetId, cls: 'forge-output-id' });
    meta.createEl('span', { text: new Date().toLocaleTimeString(), cls: 'forge-output-time' });
    return entry;
  }
}

function isObjectWithMessage(v: unknown): v is { message: string } {
  return typeof v === 'object' && v !== null && typeof (v as any).message === 'string';
}
