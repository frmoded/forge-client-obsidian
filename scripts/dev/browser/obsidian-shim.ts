// Minimal stand-in for the `obsidian` package — enough for the REAL RhythmEditView (src/rhythm-edit-view.ts) to be mounted in a page. Measurement harness only.
export class TFile { path = ''; basename = ''; extension = 'md'; constructor(path = '') { this.path = path; this.basename = path.replace(/^.*\//, '').replace(/\.md$/, ''); } }
export class Notice { constructor(public message?: string) {} }
export class Plugin {}
export class MarkdownView {}
export class MarkdownRenderChild { containerEl: HTMLElement; constructor(el: HTMLElement) { this.containerEl = el; } registerEvent() {} onload() {} onunload() {} }
export class EditableFileView {
  app: any; leaf: any; file: TFile | null = null; contentEl: HTMLElement;
  constructor(leaf: any) { this.leaf = leaf; this.app = leaf.app; this.contentEl = leaf.contentEl; }
  addAction(_i: string, _t: string, _cb: () => void) { return document.createElement('div'); }
  registerEvent(_e: unknown) {}
  async onOpen() {} async onClose() {} async onLoadFile(_f: TFile) {} async onUnloadFile(_f: TFile) {}
  async setState() {}
}

// For the Forge output panel (entry-panel.ts): the part of Obsidian's ItemView the panel's own code touches.
export class ItemView {
  app: any; leaf: any; containerEl: HTMLElement; contentEl: HTMLElement;
  constructor(leaf: any) { this.leaf = leaf; this.app = leaf.app; this.containerEl = leaf.containerEl; this.contentEl = document.createElement('div'); this.containerEl.appendChild(this.contentEl); }
  registerEvent(_e: unknown) {}
  async onOpen() {} async onClose() {}
}
// Setting: every builder method is a chainable no-op (the strip's fields are not what the harness looks at).
export class Setting {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
    const proxy: any = new Proxy(this, { get: (t: any, k) => (k in t ? t[k] : (..._a: unknown[]) => proxy) });
    return proxy;
  }
}
