import { ItemView, WorkspaceLeaf } from 'obsidian';

export const MODA_VIEW_TYPE = 'forge-moda';

// TODO: surface the iframe URL as a plugin setting once forge-moda-client is
// hosted somewhere other than the local Vite dev server.
const MODA_CLIENT_URL = 'http://localhost:5173';

export class ForgeModaView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return MODA_VIEW_TYPE; }
  getDisplayText() { return 'MoDa simulation'; }
  getIcon() { return 'atom'; }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.style.padding = '0';
    container.style.overflow = 'hidden';

    const iframe = container.createEl('iframe');
    iframe.src = MODA_CLIENT_URL;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
  }

  async onClose() {
    this.contentEl.empty();
  }
}
