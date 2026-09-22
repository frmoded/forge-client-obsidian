import { ItemView, WorkspaceLeaf } from 'obsidian';

export const THREE_VIEW_TYPE = 'forge-three';

export class ForgeThreeView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return THREE_VIEW_TYPE; }
  getDisplayText() { return 'Forge 3D'; }
  getIcon() { return 'box'; }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass('forge-three-view-placeholder');
    container.createEl('span', { text: 'Forge 3D — coming soon' });
  }

  async onClose() {
    this.contentEl.empty();
  }
}
