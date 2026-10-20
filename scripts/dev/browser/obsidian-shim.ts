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
