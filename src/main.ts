import { Plugin, Notice, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from './output-view';
import { ForgeThreeView, THREE_VIEW_TYPE } from './three-view';
import { ForgeEdgesView, EDGES_VIEW_TYPE } from './edges-view';
import { invalidateLibraryVaultCache } from './edges';
import { attachEdgeHover } from './edges-hover';
import { ForgeSettings, DEFAULT_SETTINGS, ForgeSettingTab } from './settings';
import { sectionPlugin, readOnlyFacetFilter } from './facet';
import { ForgeSnippetModal, ForgeRunModal, ForgeFreezeModal, ForgeGenerationModal } from './modal';
import { ensureServerRunning, computeSnippet, connectVault, generateSnippet, freezeEdge, syncDependencies, canonicalizeSnippet } from './server';
import { runFirstRunCheck } from './welcome';
import { parseZapLine } from './zap';
import { extractDataBody } from './data-snippet';

function replacePythonSection(content: string, code: string): string {
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.trim() === '# Python');
  if (idx === -1) return content;
  const before = lines.slice(0, idx).join('\n');
  return `${before}\n# Python\n\n\`\`\`python\n${code}\n\`\`\`\n`;
}

// Plain-text content under a markdown heading (any level, case-insensitive),
// stopping at the next heading or `---` separator. Mirrors
// forge.core.executor.extract_section so the plugin can compute its own
// drift hash without a server round-trip.
function extractSection(content: string, heading: string): string {
  const re = new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i');
  const lines = content.split('\n');
  const out: string[] = [];
  let collecting = false;
  for (const line of lines) {
    if (re.test(line.trim())) { collecting = true; continue; }
    if (!collecting) continue;
    if (line.startsWith('#') || line.trim() === '---') break;
    out.push(line);
  }
  return out.join('\n').trim();
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Replace the body of the # English section. Keeps the heading line itself
// in place, swaps out everything between it and the next heading or `---`
// separator. Used by "Sync English ← Python" so we don't disturb the rest
// of the file (Python facet, Dependencies block, etc.).
function replaceEnglishSection(content: string, english: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex(l => /^#{1,6}\s+english\s*$/i.test(l.trim()));
  if (startIdx === -1) return content;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('#') || t === '---') {
      endIdx = i;
      break;
    }
  }
  const before = lines.slice(0, startIdx + 1).join('\n');
  const after = lines.slice(endIdx).join('\n');
  return `${before}\n\n${english.trim()}\n\n${after}`;
}

// Phase 6.5: edit_mode replaces the binary locked flag. `locked: true` is
// still accepted as a one-cycle alias for `edit_mode: python` so existing
// vaults work without migration.
type EditMode = 'english' | 'python';
function getEditMode(fm: any): EditMode {
  if (fm?.edit_mode === 'python') return 'python';
  if (fm?.locked === true) return 'python';
  return 'english';
}

const SNIPPET_BTN_CLASS = 'forge-snippet-btn';
// RUN_BTN_CLASS and HAMMER_BTN_CLASS are kept only so syncButtons() can sweep
// stale buttons left over by older plugin loads after the Run+Generate -> Forge
// consolidation. They are no longer attached to any new button.
const RUN_BTN_CLASS = 'forge-run-btn';
const HAMMER_BTN_CLASS = 'forge-hammer-btn';
const EDGES_BTN_CLASS = 'forge-edges-btn';
const FORGE_BTN_CLASS = 'forge-forge-btn';
const LOCK_BTN_CLASS = 'forge-lock-btn';
const MODE_BTN_CLASS = 'forge-mode-btn';

export default class ForgePlugin extends Plugin {
  settings: ForgeSettings;
  private inputCache: Record<string, Record<string, string>> = {};
  // Snapshot of the registry inventory from /connect. Shape per vault:
  //   [{id, type, inputs}, ...]
  // Used as a fallback for snippet metadata when the local .md doesn't carry
  // it (e.g., an empty stub overlaying a builtin).
  private snippetInventory: Record<string, Array<{ id: string; type: string; inputs: string[] }>> = {};
  private freezeCache: { caller?: string; callee?: string } = {};
  // Debounce handle for the file-modify hook that keeps the drift indicator
  // current. Editing the body fires modify on every keystroke; we coalesce
  // bursts so the lock button only re-renders once the user pauses.
  private modifyDebounceTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    this.registerView(OUTPUT_VIEW_TYPE, leaf => new ForgeOutputView(leaf));
    this.registerView(THREE_VIEW_TYPE, leaf => new ForgeThreeView(leaf));
    this.registerView(EDGES_VIEW_TYPE, leaf => new ForgeEdgesView(leaf, () => this.settings.serverUrl));
    this.registerEditorExtension([sectionPlugin, readOnlyFacetFilter]);

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.syncButtons())
    );

    // Body edits don't fire layout-change, so the drift indicator on the
    // lock button would never refresh as the user types. Hook vault.modify
    // and re-run syncButtons after a short pause — long enough that we're
    // not thrashing on every keystroke, short enough that the yellow dot
    // appears almost as soon as the user stops typing.
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || view.file.path !== file.path) return;
        if (this.modifyDebounceTimer !== null) {
          window.clearTimeout(this.modifyDebounceTimer);
        }
        this.modifyDebounceTimer = window.setTimeout(() => {
          this.modifyDebounceTimer = null;
          this.syncButtons();
        }, 300);
      }),
    );

    this.syncButtons();

    // Phase 2 — Render data-snippet bodies in the output panel when the user
    // navigates to one. Local parse (no /compute round-trip) and "replace"
    // semantics: the panel reflects the file currently being viewed.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => { this.maybePreviewDataSnippet(file); })
    );

    this.addRibbonIcon('zap', 'New Snippet', () => {
      this.createNewSnippet();
    });

    this.addSettingTab(new ForgeSettingTab(this.app, this));

    this.addCommand({
      id: 'forge-toggle-edges-panel',
      name: 'Toggle edges panel',
      callback: () => { this.toggleEdgesView(); },
    });

    this.addCommand({
      id: 'forge-sync-edges',
      name: 'Sync edges',
      callback: () => { this.syncEdgesForActive(); },
    });

    this.addCommand({
      id: 'forge-open-3d',
      name: 'Open 3D View',
      callback: async () => {
        const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
        await leaf.setViewState({ type: THREE_VIEW_TYPE, active: true });
        this.app.workspace.revealLeaf(leaf);
      },
    });

    this.addCommand({
      id: 'forge-zap-line',
      name: 'Zap line',
      callback: () => { this.runZapLine(); },
    });

    // Direct backend access for debugging. The Forge button calls /generate
    // then /run; these expose each leg on its own. Generate-only respects
    // edit mode — a Python-mode snippet shows a notice and bails rather
    // than burning LLM tokens that the server would skip anyway.
    this.addCommand({
      id: 'forge-generate-only',
      name: 'Generate only',
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file) {
          const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter;
          if (getEditMode(fm) === 'python') {
            new Notice(`Forge: ${view.file.basename} is in Python mode — switch to English mode to regenerate.`);
            return;
          }
        }
        this.generate(true);
      },
    });

    this.addCommand({
      id: 'forge-sync-english-from-python',
      name: 'Sync English ← Python',
      callback: () => { this.syncEnglishFromPython(); },
    });

    // The same action via the file/editor context menus — the spec wants
    // this off the toolbar because it's deliberate and infrequent. Two
    // event registrations cover the two right-click surfaces:
    //  - file-menu fires for right-click on a file tab or in the file
    //    explorer pane.
    //  - editor-menu fires for right-click inside the open editor body,
    //    which is where users naturally right-click while reading the
    //    snippet.
    const addSyncMenuItem = (menu: any, file: TFile) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.type !== 'action') return;
      menu.addItem((item: any) =>
        item.setTitle('Forge: Sync English ← Python')
          .setIcon('file-text')
          .onClick(() => { this.syncEnglishFromPython(file); }),
      );
    };

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        addSyncMenuItem(menu, file);
      }),
    );
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, _editor, info: any) => {
        const file = info?.file;
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        addSyncMenuItem(menu, file);
      }),
    );

    this.addCommand({
      id: 'forge-run-only',
      name: 'Run only (active snippet)',
      callback: () => { this.runSnippet(); },
    });

    this.addCommand({
      id: 'forge-freeze-edge',
      name: 'Freeze edge',
      callback: () => { this.openFreezeModal('frozen'); },
    });

    this.addCommand({
      id: 'forge-unfreeze-edge',
      name: 'Unfreeze edge',
      callback: () => { this.openFreezeModal('live'); },
    });

    const detachHover = attachEdgeHover(this.app, () => this.settings.serverUrl);
    this.register(detachHover);

    await runFirstRunCheck(this.app);
    ensureServerRunning(this.settings.serverUrl);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  syncButtons() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    // Remove any stale Forge buttons from a previous plugin load before adding fresh ones.
    // RUN_BTN_CLASS / HAMMER_BTN_CLASS / LOCK_BTN_CLASS are listed so users still get
    // their predecessors swept after the Run+Generate→Forge and lock→edit-mode
    // refactors.
    view.containerEl.querySelectorAll(
      `.${SNIPPET_BTN_CLASS}, .${RUN_BTN_CLASS}, .${HAMMER_BTN_CLASS}, .${EDGES_BTN_CLASS}, .${FORGE_BTN_CLASS}, .${LOCK_BTN_CLASS}, .${MODE_BTN_CLASS}, .forge-dag-btn`
    ).forEach(el => el.remove());

    const snippetBtn = view.addAction('zap', 'New Snippet', () => { this.createNewSnippet(); });
    snippetBtn.addClass(SNIPPET_BTN_CLASS);

    const forgeBtn = view.addAction('flame', 'Forge', () => { this.forgeSnippet(); });
    forgeBtn.addClass(FORGE_BTN_CLASS);

    // Edit-mode toggle for action snippets. English mode = LLM-driven,
    // Forge regenerates Python from English. Python mode = hand-tuned,
    // Forge skips generation and runs whatever's in the body.
    // Replaces the binary lock toggle from Phase 5 with the explicit
    // direction the user is editing. Data snippets stay on the lock
    // mechanism (different shape, different rename — see Phase 6.5 spec).
    const fm = view.file
      ? this.app.metadataCache.getFileCache(view.file)?.frontmatter
      : undefined;
    if (fm?.type === 'action') {
      const mode = getEditMode(fm);
      const modeBtn = view.addAction(
        mode === 'python' ? 'code' : 'pencil-line',
        mode === 'python'
          ? 'Editing: Python (click to switch to English mode — Forge will regenerate)'
          : 'Editing: English (click to switch to Python mode — Forge will skip regenerate)',
        () => { this.toggleEditMode(); },
      );
      modeBtn.addClass(MODE_BTN_CLASS);
      // Drift indicator: in Python mode, the English facet might have moved
      // since we switched. Hash and compare; yellow tint if it drifted.
      if (mode === 'python' && view.file) {
        this.markDriftAsync(view.file, modeBtn, fm.locked_english_hash);
      }
    }

    const edgesBtn = view.addAction('network', 'Forge: Toggle edges panel', () => { this.toggleEdgesView(); });
    edgesBtn.addClass(EDGES_BTN_CLASS);
  }

  private async markDriftAsync(file: TFile, btn: HTMLElement, storedHash: unknown) {
    try {
      const content = await this.app.vault.read(file);
      const english = extractSection(content, 'english');
      const currentHash = await sha256Hex(english);
      if (typeof storedHash !== 'string' || currentHash !== storedHash) {
        btn.addClass('is-drifted');
        const text =
          'Drifted from English: the English facet has changed since you switched to Python mode. Sync English ← Python to canonicalize, or switch back to English mode to regenerate.';
        // Set both aria-label (for screen readers / Obsidian's tooltip
        // helper) and the standard HTML `title` attribute so the
        // browser-native hover tooltip surfaces — Obsidian's tooltip
        // helper caches its text at element-creation time and ignores
        // later aria-label changes, so we'd otherwise see only the color
        // change with no hover hint.
        btn.setAttribute('aria-label', text);
        btn.setAttribute('title', text);
      }
    } catch (e) {
      console.warn('Forge: drift check failed', e);
    }
  }

  // Toggle between english (LLM-driven) and python (hand-tuned) edit modes.
  // Replaces toggleLock from Phase 5; semantics are the same but the field
  // name moves from `locked: true` to `edit_mode: python`. Reads either
  // form when computing current state, only writes the new form.
  private async toggleEditMode() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note.');
      return;
    }
    const file = view.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'action') {
      new Notice('Edit mode is only meaningful for action snippets.');
      return;
    }
    const current = getEditMode(fm);

    if (current === 'python') {
      await this.app.fileManager.processFrontMatter(file, (fm: any) => {
        delete fm.edit_mode;
        delete fm.locked;             // legacy alias — clean up while we're here
        delete fm.locked_english_hash;
      });
      new Notice(`Forge: ${file.basename} → English mode`);
    } else {
      // Snapshot the current English so we can detect drift later. The hash
      // field name stays `locked_english_hash` for one cycle so Phase-5
      // vaults don't lose their drift baseline; new writes use the same key.
      const content = await this.app.vault.read(file);
      const english = extractSection(content, 'english');
      const hash = await sha256Hex(english);
      await this.app.fileManager.processFrontMatter(file, (fm: any) => {
        fm.edit_mode = 'python';
        fm.locked_english_hash = hash;
        delete fm.locked;             // migrate off the legacy field
      });
      new Notice(`Forge: ${file.basename} → Python mode`);
    }
    this.syncButtons();
  }

  // Sync English ← Python: ask the backend's /canonicalize endpoint to
  // produce an English summary of the snippet's current python facet, then
  // overwrite the # English section with the result. Silent overwrite —
  // Cmd+Z is the safety net. Also re-snapshots `locked_english_hash` if the
  // snippet is in Python mode so the drift indicator clears immediately.
  private async syncEnglishFromPython(target?: TFile) {
    const file = target ?? this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    if (!file) {
      new Notice('No active note for sync.');
      return;
    }
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'action') {
      new Notice('Sync English ← Python is only for action snippets.');
      return;
    }

    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    const snippetId = file.basename;
    const modal = new ForgeGenerationModal(this.app, `Canonicalizing ${snippetId}…`);
    modal.open();

    let response;
    try {
      // Force-refresh the server's registry first. /canonicalize otherwise
      // 404s on freshly-authored snippets that the cached registry doesn't
      // know about yet (we saw this on a newly-created hello.md in
      // Phase-6.5 testing — server registry was loaded before the file
      // existed). connectVault sets force=true unconditionally; this is
      // just making sure we re-scan before resolving snippet_id.
      await connectVault(this.settings.serverUrl, vaultPath);
      response = await canonicalizeSnippet(this.settings.serverUrl, vaultPath, snippetId);
    } catch (e) {
      console.error('Forge canonicalize: network error', e);
      new Notice('Forge: canonicalize failed — check console.');
      modal.finish();
      return;
    } finally {
      modal.finish();
    }

    if (response.status !== 200 || typeof response.json?.english !== 'string') {
      const detail = response.json?.detail ?? `HTTP ${response.status}`;
      new Notice(`Forge: canonicalize failed — ${detail}`);
      console.error('Forge canonicalize:', response);
      return;
    }
    const newEnglish = response.json.english as string;

    try {
      const content = await this.app.vault.read(file);
      const updated = replaceEnglishSection(content, newEnglish);
      await this.app.vault.modify(file, updated);
    } catch (e) {
      console.error('Forge canonicalize: write failed', e);
      new Notice('Forge: canonicalize wrote the model output but the file write failed — check console.');
      return;
    }

    // If we're in Python mode, re-snapshot the english hash so the drift
    // indicator clears (the new English IS the canonical baseline now).
    if (getEditMode(fm) === 'python') {
      const hash = await sha256Hex(newEnglish.trim());
      await this.app.fileManager.processFrontMatter(file, (fm: any) => {
        fm.locked_english_hash = hash;
      });
    }
    new Notice(`Forge: synced English ← Python on ${snippetId}`);
    this.syncButtons();
  }

  private async createNewSnippet() {
    // Fetch content_types from /connect so the modal's data-snippet dropdown
    // stays in sync with the backend's deserialize_from_wire registry. If the
    // call fails (server offline, older backend), the modal falls back to a
    // hardcoded list — creation still works.
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    let contentTypes: string[] | undefined;
    try {
      const connectRes = await connectVault(this.settings.serverUrl, vaultPath);
      this.snippetInventory = connectRes?.snippets ?? {};
      contentTypes = connectRes?.content_types;
    } catch (e) {
      console.warn('Forge: connect failed before opening New Snippet modal; falling back to default content_types', e);
    }
    new ForgeSnippetModal(this.app, contentTypes).open();
  }

  private async toggleEdgesView() {
    const existing = this.app.workspace.getLeavesOfType(EDGES_VIEW_TYPE)[0];
    if (existing) {
      existing.detach();
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
    await leaf.setViewState({ type: EDGES_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private openFreezeModal(state: 'frozen' | 'live') {
    new ForgeFreezeModal(this.app, state, this.freezeCache, async (caller, callee) => {
      this.freezeCache = { caller, callee };
      const vaultPath = (this.app.vault.adapter as any).basePath as string;
      const verb = state === 'frozen' ? 'freeze' : 'unfreeze';
      try {
        const res = await freezeEdge(this.settings.serverUrl, vaultPath, caller, callee, state);
        if (res.status === 200) {
          new Notice(`Forge: ${verb}d ${caller} → ${callee}`);
        } else if (res.status === 404) {
          new Notice(`Forge: no snapshot for ${caller} → ${callee}. Run the edge first.`);
        } else {
          const detail = res.json?.detail ?? `HTTP ${res.status}`;
          new Notice(`Forge: ${verb} failed — ${detail}`);
        }
      } catch (e) {
        console.error(`Forge ${verb} error:`, e);
        new Notice(`Forge: ${verb} failed — check console.`);
      }
    }).open();
  }

  // The merged toolbar button: generate, then (on success) run.
  // Snippets in Python edit-mode skip the generate leg and run cached
  // python directly — same shape as the Phase-5 locked path.
  private async forgeSnippet() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note to forge.');
      return;
    }
    const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter;
    if (getEditMode(fm) === 'python') {
      // The server log won't show a "skipped (edit_mode=python)" line
      // because we don't call /generate at all in this branch — the
      // server-side guard is defense-in-depth, not the primary signal.
      // Log here so devs have explicit confirmation in the browser
      // console alongside the existing Notice.
      console.log(`Forge: skipping /generate, ${view.file.basename} is in Python mode`);
      new Notice(`Forge: ${view.file.basename} is in Python mode — running as-is (switch to English mode to regenerate).`);
      await this.runSnippet('Forge failed during execution');
      return;
    }
    const ok = await this.generate(true, 'Forge failed during generation');
    if (!ok) return;
    await this.runSnippet('Forge failed during execution');
  }

  // Returns true on success. When errorPrefix is set (forge flow), error
  // notices use the prefix and include the actual error message; the success
  // notice is suppressed so the caller can show its own. When errorPrefix is
  // unset (standalone command), notices follow the existing "check console"
  // convention.
  private async generate(recursive: boolean, errorPrefix?: string): Promise<boolean> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note to generate.');
      return false;
    }

    const snippetId = view.file.basename;
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    console.log('Forge: generate', { recursive, snippetId, vaultPath });

    const modal = new ForgeGenerationModal(
      this.app,
      recursive ? `Forging ${snippetId}…` : `Hammering ${snippetId}…`,
    );
    modal.open();

    try {
      try {
        const connectRes = await connectVault(this.settings.serverUrl, vaultPath);
        this.snippetInventory = connectRes?.snippets ?? {};
      } catch (e) {
        console.error('Forge Connect Error:', e);
        const detail = e instanceof Error ? e.message : String(e);
        new Notice(errorPrefix ? `${errorPrefix}: connect failed — ${detail}` : 'Forge: Connect failed — check console.');
        return false;
      }

      try {
        const result = await generateSnippet(this.settings.serverUrl, vaultPath, snippetId, recursive);
        console.log('Forge Generate Result:', result);
        await this.writeGeneratedCode(result.generated);
        if (!errorPrefix) {
          new Notice(`Forge: ${Object.keys(result.generated).length} snippet(s) written.`);
        }
        return true;
      } catch (e) {
        console.error('Forge Generate Error:', e);
        const detail = e instanceof Error ? e.message : String(e);
        new Notice(errorPrefix ? `${errorPrefix}: ${detail}` : 'Forge: Generation failed — check console.');
        return false;
      }
    } catch (outer) {
      console.error('Forge: unexpected error in generate', outer);
      const detail = outer instanceof Error ? outer.message : String(outer);
      new Notice(errorPrefix ? `${errorPrefix}: ${detail}` : 'Forge: unexpected error — check console.');
      return false;
    } finally {
      modal.finish();
    }
  }

  private async writeGeneratedCode(generated: Record<string, string>) {
    const files = this.app.vault.getMarkdownFiles();
    const vaultPath = (this.app.vault.adapter as any).basePath as string;

    for (const [id, code] of Object.entries(generated)) {
      const file = files.find(f => f.basename === id);
      if (!file) {
        console.warn(`Forge: no file found for snippet '${id}'`);
        continue;
      }
      const content = await this.app.vault.read(file);
      await this.app.vault.modify(file, replacePythonSection(content, code));

      // After writing the new Python, ask the BE to sync the # Dependencies
      // section so the body reflects the just-written code (B7).
      try {
        await syncDependencies(this.settings.serverUrl, vaultPath, id);
      } catch (e) {
        console.warn(`Forge: sync_dependencies failed for '${id}'`, e);
      }
    }
  }

  private async syncEdgesForActive() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active snippet to sync.');
      return;
    }
    const snippetId = view.file.basename;
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    const res = await syncDependencies(this.settings.serverUrl, vaultPath, snippetId);
    if (res.status === 200) {
      const deps: string[] = res.json?.dependencies ?? [];
      new Notice(`Forge: synced ${deps.length} dependenc${deps.length === 1 ? 'y' : 'ies'}.`);
    } else {
      const detail = res.json?.detail ?? `HTTP ${res.status}`;
      new Notice(`Forge: sync failed — ${detail}`);
      console.error('Forge sync_dependencies failed', res);
    }
  }

  // Line-first Zap: if the cursor's line contains [[id]] (with optional args),
  // run that. Otherwise fall back to the legacy whole-note behavior.
  private async runZapLine() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note to zap.');
      return;
    }

    const editor = view.editor;
    const lineNum = editor.getCursor().line;
    const line = editor.getLine(lineNum);
    const parsed = parseZapLine(line);

    if (parsed) {
      const vaultPath = (this.app.vault.adapter as any).basePath as string;
      await this.computeSnippetWithArgs(vaultPath, parsed.snippetId, parsed.args, parsed.inputs);
      return;
    }

    // Fallback: run the whole note as a snippet (basename = snippet_id).
    await this.runSnippet();
  }

  // errorPrefix forwards into computeSnippetWithArgs so the forge flow can
  // tag execution-side errors with "Forge failed during execution".
  private async runSnippet(errorPrefix?: string) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note to run.');
      return;
    }

    const snippetId = view.file.basename;
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    const frontmatter = this.app.metadataCache.getFileCache(view.file)?.frontmatter;

    // Local frontmatter is the source of truth when it exists. When it
    // doesn't (e.g., the user has an empty install.md stub over the builtin),
    // fall back to the inventory snapshot from /connect so we still ask for
    // the right inputs.
    const inputs: string[] = frontmatter
      ? (frontmatter.inputs ?? [])
      : (this.lookupInventoryInputs(snippetId) ?? []);

    if (inputs.length > 0) {
      const cached = this.inputCache[snippetId] ?? {};
      new ForgeRunModal(this.app, snippetId, inputs, cached, (kwargs, raw) => {
        this.inputCache[snippetId] = raw;
        this.computeSnippetWithArgs(vaultPath, snippetId, [], kwargs as Record<string, unknown>, errorPrefix);
      }).open();
    } else {
      await this.computeSnippetWithArgs(vaultPath, snippetId, [], {}, errorPrefix);
    }
  }

  // Walk the inventory to find a snippet's declared inputs. Resolution order
  // isn't carried over the wire, so the first match wins; the empty-stub
  // case (the only place the fallback fires) doesn't have an authoring entry
  // anyway.
  private lookupInventoryInputs(bareId: string): string[] | null {
    for (const vault of Object.values(this.snippetInventory)) {
      if (!Array.isArray(vault)) continue;
      for (const entry of vault) {
        if (entry?.id === bareId && Array.isArray(entry?.inputs)) {
          return entry.inputs;
        }
      }
    }
    return null;
  }

  // Triggered on every file-open. Cheap-checks frontmatter; only does real
  // work when the file is a hand-authored data snippet with a known
  // content_type. Binary data (content_ref present) goes to the asset-based
  // renderer; text data renders the body inline.
  private async maybePreviewDataSnippet(file: TFile | null) {
    if (!file) return;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'data') return;
    const contentType = fm.content_type as string | undefined;
    if (!contentType) return;

    const contentRef = fm.content_ref as string | undefined;
    if (contentRef) {
      try {
        const outputView = await this.getOutputView();
        await outputView.previewBinarySnippet(file.basename, contentType, contentRef);
      } catch (e) {
        console.error('Forge: binary data snippet preview failed', e);
      }
      return;
    }

    let content: string;
    try {
      content = await this.app.vault.read(file);
    } catch (e) {
      console.warn('Forge: could not read data snippet for preview', e);
      return;
    }
    const body = extractDataBody(content);

    try {
      const outputView = await this.getOutputView();
      await outputView.previewDataSnippet(file.basename, contentType, body, file.path);
    } catch (e) {
      console.error('Forge: data snippet preview failed', e);
    }
  }

  private async getOutputView(): Promise<ForgeOutputView> {
    const existing = this.app.workspace.getLeavesOfType(OUTPUT_VIEW_TYPE)[0];
    if (existing) return existing.view as ForgeOutputView;

    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
    await leaf.setViewState({ type: OUTPUT_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view as ForgeOutputView;
  }

  private async computeSnippetWithArgs(
    vaultPath: string,
    snippetId: string,
    args: unknown[],
    inputs: Record<string, unknown>,
    errorPrefix?: string,
  ) {
    console.log('Forge Compute →', { serverUrl: this.settings.serverUrl, vaultPath, snippetId, args, inputs });

    try {
      const connectRes = await connectVault(this.settings.serverUrl, vaultPath);
      this.snippetInventory = connectRes?.snippets ?? {};
    } catch (e) {
      console.error('Forge Connect Error:', e);
      const detail = e instanceof Error ? e.message : String(e);
      new Notice(errorPrefix ? `${errorPrefix}: connect failed — ${detail}` : 'Forge: Connect failed — check console.');
      return;
    }

    let res;
    try {
      res = await computeSnippet(this.settings.serverUrl, vaultPath, snippetId, args, inputs);
    } catch (e) {
      console.error('Forge Compute Error:', e);
      const detail = e instanceof Error ? e.message : String(e);
      new Notice(errorPrefix ? `${errorPrefix}: ${detail}` : 'Forge: Compute failed — check console.');
      return;
    }

    const outputView = await this.getOutputView();

    if (res.status >= 400) {
      const detail = res.json?.detail;
      const errorMsg = (detail && typeof detail === 'object' && detail.error)
        ? detail.error
        : (typeof detail === 'string' ? detail : `HTTP ${res.status}`);
      const stdout = (detail && typeof detail === 'object' && detail.stdout) ? detail.stdout : '';
      console.warn('Forge Compute non-2xx:', res.status, detail);
      // Always show the detailed error in the output view. When invoked from
      // the forge flow, also pop a notice so the user sees "during execution"
      // attribution without scanning the output panel.
      if (errorPrefix) {
        new Notice(`${errorPrefix}: ${errorMsg}`);
      }
      outputView.appendError(snippetId, errorMsg, stdout);
      return;
    }

    const result = res.json;
    console.log('Forge Compute Result:', result);
    outputView.append(snippetId, result.stdout ?? '', result.result);

    // Surface install metadata to the debug log; the message is rendered to the user.
    if (snippetId === 'install' && result.result && typeof result.result === 'object') {
      console.log('Forge Install:', {
        vault_name: result.result.vault_name,
        version: result.result.version,
      });

      // Refresh inventory so newly installed snippets become visible.
      try {
        const refreshed = await connectVault(this.settings.serverUrl, vaultPath);
        this.snippetInventory = refreshed?.snippets ?? {};
        invalidateLibraryVaultCache();
        console.log('Forge inventory after install:', this.snippetInventory);
      } catch (e) {
        console.warn('Forge: post-install refresh failed', e);
      }
    }
  }
}
