import { App, Modal, Notice, Setting } from 'obsidian';
import { forgeNotice } from './forge-notice.ts';
// v0.2.207 — Build-step hardening drain caught a missing import:
// `actionTemplate` was referenced at line 369 without being imported.
// This is exactly the bug class v0.2.197 hit with extractRecipeSection.
// Pre-tsc, this would have manifested at runtime as a ReferenceError
// when cohort created a non-data snippet via the modal. The branch
// may have been unreachable in practice (only the data path is
// exercised by current cohort flows), but the dead code path was
// still a landmine waiting for refactor.
import { actionTemplate } from './modal-templates-core.ts';

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
      void forgeNotice(this.app, 'Forge: caller and callee are required.');
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
const FALLBACK_CONTENT_TYPES = ['json', 'text', 'markdown', 'musicxml', 'svg', 'jpeg'];

// Fence language tag per content_type. Obsidian's preview renders these
// nicely; the Phase 2 rendering work will lean on the same mapping.
const FENCE_LANG: Record<string, string> = {
  json: 'json',
  text: 'text',
  markdown: 'markdown',
  musicxml: 'xml',
  svg: 'xml',
  jpeg: 'text',
};

// Seed payload per content_type — short and instructive where possible,
// blank where any concrete seed would feel arbitrary.
const SEED: Record<string, string> = {
  json: '{}',
  text: '',
  markdown: '',
  musicxml: '<!-- Replace with valid MusicXML. Use music21 to export an example. -->',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"></svg>',
  jpeg: '',
};

// v0.2.77 — action templates extracted to a pure-core module so they
// can be tested directly. modal.ts re-exports them for any external
// importers that already point at this file.
//
// v0.2.133 — re-exports retired per v0.2.129 §2.2 audit + v0.2.133 §2
// re-audit. Zero internal consumers; tests import directly from
// modal-templates-core. External consumers (if any) should switch to
// the same import path.

// When `content` is provided (e.g., from "Save as data snippet"), it replaces
// the per-content_type seed payload and lands inside the same fenced block.
export function dataTemplate(name: string, contentType: string, content?: string): string {
  const lang = FENCE_LANG[contentType] ?? 'text';
  const body = content ?? SEED[contentType] ?? '';
  return [
    '---',
    'type: data',
    `content_type: ${contentType}`,
    `description: ${name}`,
    '---',
    '',
    '```' + lang,
    body,
    '```',
    '',
  ].join('\n');
}

// Wrapper .md for a binary data snippet. The bytes live at content_ref; the
// body is intentionally empty (the backend rejects content_ref + body content
// in the same snippet).
function binaryTemplate(name: string, contentType: string, contentRef: string): string {
  return [
    '---',
    'type: data',
    `content_type: "${contentType}"`,
    `content_ref: ${contentRef}`,
    `description: ${name}`,
    '---',
    '',
  ].join('\n');
}

function isBinaryContentType(ct: string): boolean {
  return ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('video/') || ct === 'jpeg';
}

// Map a binary MIME content_type to a canonical file extension. Falls back to
// the dropped file's own extension when we don't have a preferred one.
function extensionFor(contentType: string, originalName: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'video/mp4': '.mp4',
    'jpeg': '.jpg',
  };
  if (map[contentType]) return map[contentType];
  const i = originalName.lastIndexOf('.');
  return i > 0 ? originalName.slice(i) : '';
}

// v0.2.108 — ActionShape selector removed. The free-english vs.
// canonical choice was a v0.2.77 authoring affordance but cohort
// signal (Tamar) reported it as noise on the New Snippet dialog.
// Default to free-english (English + LLM-generated Python). Users
// who want canonical compose can add `facet_form: canonical` in
// frontmatter post-create (or hand-author the snippet).
export class ForgeSnippetModal extends Modal {
  private snippetName = '';
  private snippetType: SnippetType = 'action';
  private contentType: string;
  private contentTypes: string[];
  private contentTypeSetting?: Setting;
  private dropSetting?: Setting;
  private dropZoneEl?: HTMLElement;
  // v0.2.236 drain 2026-07-02-2130 — inline validation error el.
  // Shown when Create hits a duplicate path or other pre-flight
  // failure; dialog stays open so cohort can change the name.
  private validationEl?: HTMLElement;
  // For binary content_types: the file the user dropped (or picked). Held in
  // memory until submit; on submit we write it to <vault>/_assets/<name><ext>
  // and emit a wrapper .md with content_ref pointing there.
  private droppedFile: File | null = null;

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

    // v0.2.108 — action shape selector removed.
    this.contentTypeSetting = new Setting(contentEl)
      .setName('Content Type')
      .setDesc('Format of the data payload (only used for Data snippets)')
      .addDropdown(drop => {
        for (const ct of this.contentTypes) drop.addOption(ct, ct);
        drop.setValue(this.contentType).onChange(v => {
          this.contentType = v;
          this.updateContentTypeVisibility();
        });
      });

    this.dropSetting = new Setting(contentEl)
      .setName('Asset file')
      .setDesc('Drop a file here (or click to browse). The bytes live in <vault>/_assets/, the .md just points at them.');
    this.dropZoneEl = this.dropSetting.controlEl.createDiv({ cls: 'forge-modal-drop' });
    this.dropZoneEl.setText('Drop file here, or click to choose');
    this.attachDropHandlers(this.dropZoneEl);

    this.updateContentTypeVisibility();

    // v0.2.236 drain 2026-07-02-2130 — inline validation area.
    // Rendered ABOVE the Create button so the error is visible right
    // where cohort will click next. Hidden by default; populated on
    // duplicate-name or other pre-flight failure.
    this.validationEl = contentEl.createEl('div', {
      cls: 'forge-modal-validation',
    });
    this.validationEl.style.display = 'none';
    this.validationEl.style.color = 'var(--text-error)';
    this.validationEl.style.marginTop = '8px';
    this.validationEl.style.marginBottom = '8px';

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

  /** v0.2.236 drain 2026-07-02-2130 — show an inline validation error.
   *  Keeps the dialog open so cohort can change the name and retry. */
  private showValidationError(message: string): void {
    if (!this.validationEl) return;
    this.validationEl.setText(message);
    this.validationEl.style.display = 'block';
  }

  private clearValidationError(): void {
    if (!this.validationEl) return;
    this.validationEl.setText('');
    this.validationEl.style.display = 'none';
  }

  private attachDropHandlers(el: HTMLElement) {
    el.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.onchange = () => {
        const f = inp.files?.[0];
        if (f) this.setDroppedFile(f);
      };
      inp.click();
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      el.addClass('is-active');
    });
    el.addEventListener('dragleave', () => { el.removeClass('is-active'); });
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.removeClass('is-active');
      const f = e.dataTransfer?.files?.[0];
      if (f) this.setDroppedFile(f);
    });
  }

  private setDroppedFile(f: File) {
    this.droppedFile = f;
    if (this.dropZoneEl) {
      this.dropZoneEl.empty();
      const kb = (f.size / 1024).toFixed(1);
      this.dropZoneEl.setText(`${f.name} — ${kb} KB`);
    }
  }

  private updateContentTypeVisibility() {
    if (!this.contentTypeSetting || !this.dropSetting) return;
    const isData = this.snippetType === 'data';
    const isBinary = isData && isBinaryContentType(this.contentType);
    this.contentTypeSetting.settingEl.style.display = isData ? '' : 'none';
    this.dropSetting.settingEl.style.display = isBinary ? '' : 'none';
  }

  private async submit() {
    this.clearValidationError();
    if (!this.snippetName) {
      this.showValidationError('Snippet name is required.');
      void forgeNotice(this.app, 'Note creation failed: name is required.', 'error');
      return;
    }

    if (this.snippetType === 'data' && isBinaryContentType(this.contentType)) {
      await this.submitBinary();
      return;
    }

    const path = `${this.snippetName}.md`;

    // v0.2.236 drain 2026-07-02-2130 — pre-flight duplicate check.
    // Path-scoped only (per §1.3 pushback): naming a note the same as
    // one in another subdirectory is fine — Forge resolves by path.
    // Only the EXACT PATH the new note would land at gets checked.
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) {
      this.showValidationError(
        `A note named "${this.snippetName}" already exists at ${path}. ` +
        `Choose a different name or open the existing note.`,
      );
      void forgeNotice(
        this.app,
        `Note creation failed: "${path}" already exists.`,
        'error',
      );
      return;
    }

    const content = this.snippetType === 'data'
      ? dataTemplate(this.snippetName, this.contentType)
      : actionTemplate(this.snippetName);

    let file;
    try {
      file = await this.app.vault.create(path, content);
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e);
      this.showValidationError(
        `Could not create "${path}" — ${cause}. Check the name and retry.`,
      );
      void forgeNotice(
        this.app,
        `Note creation failed: vault.create raised — ${cause}`,
        'error',
      );
      return;
    }

    void forgeNotice(
      this.app,
      `Created ${this.snippetType} note: ${path}`,
      'success',
    );
    this.close();

    // Open the new file so the user can immediately start authoring — the
    // whole point of the data snippet is the body content they're about to
    // paste, so saving them a second click matters.
    try {
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (e) {
      console.error('ForgeSnippetModal.submit: could not open newly created snippet', e);
    }
  }

  // Binary submit: copy the dropped bytes into <vault>/_assets/<name><ext>,
  // then write the wrapper .md with content_ref pointing at the asset.
  private async submitBinary() {
    this.clearValidationError();
    if (!this.droppedFile) {
      this.showValidationError(
        'Drop a file first — binary data snippets need an asset.',
      );
      void forgeNotice(
        this.app,
        'Note creation failed: binary data snippet needs an asset (no file dropped).',
        'error',
      );
      return;
    }

    const ext = extensionFor(this.contentType, this.droppedFile.name);
    const assetRel = `_assets/${this.snippetName}${ext}`;
    const mdRel = `${this.snippetName}.md`;

    // v0.2.236 drain 2026-07-02-2130 — pre-flight duplicate check
    // on both the wrapper .md AND the asset file. Either conflict
    // aborts + keeps dialog open.
    const existingMd = this.app.vault.getAbstractFileByPath(mdRel);
    if (existingMd) {
      this.showValidationError(
        `A note named "${this.snippetName}" already exists at ${mdRel}. ` +
        `Choose a different name.`,
      );
      void forgeNotice(
        this.app,
        `Note creation failed: "${mdRel}" already exists.`,
        'error',
      );
      return;
    }
    const existingAsset = this.app.vault.getAbstractFileByPath(assetRel);
    if (existingAsset) {
      this.showValidationError(
        `An asset already exists at ${assetRel}. Choose a different name.`,
      );
      void forgeNotice(
        this.app,
        `Note creation failed: asset "${assetRel}" already exists.`,
        'error',
      );
      return;
    }

    // Ensure the assets dir exists. createFolder throws if it already does;
    // we swallow that and continue.
    try {
      await this.app.vault.createFolder('_assets');
    } catch {
      /* dir already exists — fine */
    }

    let buf: ArrayBuffer;
    try {
      buf = await this.droppedFile.arrayBuffer();
    } catch (e) {
      console.error('Forge: failed to read dropped file bytes', e);
      const cause = e instanceof Error ? e.message : String(e);
      this.showValidationError(`Could not read dropped file — ${cause}.`);
      void forgeNotice(
        this.app,
        `Note creation failed: could not read dropped file — ${cause}`,
        'error',
      );
      return;
    }

    try {
      await this.app.vault.createBinary(assetRel, buf);
    } catch (e) {
      console.error('Forge: createBinary failed', e);
      const cause = e instanceof Error ? e.message : String(e);
      this.showValidationError(
        `Could not write asset ${assetRel} — ${cause}.`,
      );
      void forgeNotice(
        this.app,
        `Note creation failed: createBinary raised — ${cause}`,
        'error',
      );
      return;
    }

    let mdFile;
    try {
      const md = binaryTemplate(this.snippetName, this.contentType, assetRel);
      mdFile = await this.app.vault.create(mdRel, md);
    } catch (e) {
      console.error('Forge: create wrapper .md failed', e);
      const cause = e instanceof Error ? e.message : String(e);
      this.showValidationError(
        `Wrote ${assetRel} but could not create wrapper .md — ${cause}.`,
      );
      void forgeNotice(
        this.app,
        `Note creation failed: wrote ${assetRel} but wrapper .md — ${cause}`,
        'error',
      );
      return;
    }

    void forgeNotice(
      this.app,
      `Created data note: ${mdRel} + ${assetRel}`,
      'success',
    );
    this.close();
    try {
      await this.app.workspace.getLeaf(false).openFile(mdFile);
    } catch (e) {
      console.error('ForgeSnippetModal.submitBinary: could not open newly created snippet', e);
    }
  }
}

// Lightweight modal for the "Save as data snippet" output-panel button.
// Single name field; content_type is auto-detected upstream and shown as
// read-only context. Content is captured at click time and passed in via
// the onCreate callback, which writes the file and returns success.
export class ForgeSaveDataModal extends Modal {
  private name: string;

  constructor(
    app: App,
    suggestedName: string,
    private contentType: string,
    private onCreate: (name: string) => Promise<boolean>,
  ) {
    super(app);
    this.name = suggestedName;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Save as data snippet' });
    contentEl.createEl('p', {
      text: `content_type: ${this.contentType}  (auto-detected from result)`,
      cls: 'forge-modal-meta',
    });

    new Setting(contentEl)
      .setName('Snippet name')
      .addText(text => {
        text.setValue(this.name).onChange(v => { this.name = v.trim(); });
        // Pre-select so the suggested name is easy to overwrite.
        setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 0);
      });

    new Setting(contentEl).addButton(btn =>
      btn.setButtonText('Save').setCta().onClick(async () => {
        if (!this.name) {
          void forgeNotice(this.app, 'Forge: name is required.');
          return;
        }
        const ok = await this.onCreate(this.name);
        if (ok) this.close();
      }),
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
