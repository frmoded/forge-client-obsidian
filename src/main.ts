import { Plugin, Notice, MarkdownView, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from './output-view';
import { ForgeThreeView, THREE_VIEW_TYPE } from './three-view';
import { ForgeEdgesView, EDGES_VIEW_TYPE } from './edges-view';
import { ForgeModaView, MODA_VIEW_TYPE } from './moda-view';
import { ChipsView, CHIPS_VIEW_TYPE, ChipsHost } from './chips-view';
import { ChipsManifest, loadChipsForActiveVault, isChipsFilePath } from './chips';
import { ChipPaletteGroup } from './chips-core';
import { getFacetForm } from './facet-form-core';
import { isPythonBuiltin, bareWikilinkTarget } from './python-builtins-core';
import { invalidateLibraryVaultCache } from './edges';
// v0.2.44: attachEdgeHover removed — the hover popover read snapshot
// state from host disk via the vault adapter, but capture writes go to
// Pyodide's MEMFS (the documented persistence gap), so the popover
// always reported "no snapshot" with a disabled Freeze button — a
// false-negative affordance. The right-click freeze menu (v0.2.41 +
// v0.2.43 + v0.2.44 state-aware items) is now the single freeze
// surface; it reads MEMFS sync via PyodideHost.readSnapshotStateSync
// so the displayed state matches reality. Restoring the hover requires
// either the MEMFS-to-host-disk writeback drain (separately flagged)
// or routing the popover's snapshot read through Pyodide — both are
// out of scope for v0.2.44.
// import { attachEdgeHover } from './edges-hover';
import { ForgeSettings, DEFAULT_SETTINGS, ForgeSettingTab } from './settings';
import { sectionPlugin, readOnlyFacetFilter } from './facet';
import { ForgeSnippetModal, ForgeRunModal, ForgeFreezeModal, ForgeGenerationModal } from './modal';
import { computeSnippet, connectVault, generateSnippetAlpha, freezeEdge, syncDependencies, canonicalizeSnippet, setPyodideHost, resolveSlotsAlpha } from './server';
import type { AlphaGenerateRequest, SlotRequestPayload } from './server';
import { writePythonAndEnglishHash } from './python-cache-writer-core';
import { computeEnglishHash } from './english-hash-core';
import { syncFileToMemfsAfterWrite } from './post-write-memfs-sync-core';
import { PyodideHost, setPyodideHostSingleton, getPyodideHost } from './pyodide-host';
import { runFirstRunCheck } from './welcome';
import { restoreInlinedAssets } from './restore-inlined-assets';
import { parseZapLine } from './zap';
import { extractDataBody } from './data-snippet';
import { openForgeAction, ForgeHost } from './forge-action';
import { isNetRefusalError, welcomeMessage } from './closed-beta-ux';
import { shouldSkipForMemfsSync } from './memfs-sync-paths';
import { reconcileInputs } from './frontmatter-inputs-reconcile';
import { snippetIdFromPath } from './snippet-id-from-path';
import {
  decideWikilinkFreezeMenu,
  decideWikilinkFreezeMenuMulti,
  findWikilinkAtCursor,
  type SnippetRegistryLike,
  type SnippetRegistryLikeMulti,
} from './wikilink-freeze-menu-core';
import { replacePythonSection } from './replace-python-section-core';
import { shouldShowChipsToolbarButton } from './chip-toolbar-button-core';
import { forgeButtonShouldShow } from './forge-button-gate-core';
import { isBakPath, bakDedupKey, baseLibraryName } from './bak-path-core';
import { makeFacetMutexViewPlugin, type FacetMutexHost } from './facet-mutex-view-plugin';

// v0.2.42: replacePythonSection extracted to pure-core
// src/replace-python-section-core.ts so the trailing-content
// preservation can be tested under `node --test` without an
// obsidian shim. The inline version here (pre-v0.2.42) discarded
// everything after the `# Python` fence — silently wiping the
// `# Dependencies` block on every Forge-click. See the core file
// + freeze-menu drain for the user-visible regression history.

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

// Set a single scalar field in the YAML frontmatter block. Used by Sync
// English ← Python so we can update locked_english_hash inside the same
// vault.process call that rewrites the # English body — earlier this was a
// separate processFrontMatter() right after vault.modify(), and the two
// back-to-back writes raced against the open editor's pending refresh,
// leaving the editor view stuck on the old English even though disk had
// the new content. One atomic write avoids that race.
//
// Only handles plain `key: value` lines. The frontmatter we own here is
// flat scalars only (type, edit_mode, locked_english_hash, …) so a YAML
// parser would be overkill.
function setFrontmatterField(content: string, key: string, value: string): string {
  const lines = content.split('\n');
  if (lines[0] !== '---') return content;
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) return content;
  const re = new RegExp(`^${key}:\\s*`);
  const newLine = `${key}: ${value}`;
  for (let i = 1; i < endIdx; i++) {
    if (re.test(lines[i])) {
      lines[i] = newLine;
      return lines.join('\n');
    }
  }
  lines.splice(endIdx, 0, newLine);
  return lines.join('\n');
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

// Replace literal tab characters in the LEADING whitespace of every line
// inside the snippet's ```python code fence with 4 spaces. Obsidian's
// editor inserts a real `\t` on Tab when "Use tabs" is on (the default),
// so a user who Tab-indents inside the Python facet ends up with a body
// the Python parser rejects ("inconsistent use of tabs and spaces in
// indentation") the next time /compute runs. Returns the input unchanged
// if no leading-whitespace tab is present, so the caller can no-op skip
// the rewrite.
function sanitizePythonFacet(content: string): string {
  const lines = content.split('\n');
  const headingIdx = lines.findIndex(l => l.trim() === '# Python');
  if (headingIdx === -1) return content;
  let codeStart = -1;
  let codeEnd = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (codeStart === -1) {
      if (t.startsWith('```python')) codeStart = i + 1;
      else if (t.startsWith('#') || t === '---') return content;
    } else {
      if (t === '```') { codeEnd = i; break; }
    }
  }
  if (codeStart === -1) return content;
  if (codeEnd === -1) codeEnd = lines.length;

  let changed = false;
  for (let i = codeStart; i < codeEnd; i++) {
    const line = lines[i];
    const m = line.match(/^[\t ]+/);
    if (!m || !m[0].includes('\t')) continue;
    lines[i] = m[0].replace(/\t/g, '    ') + line.slice(m[0].length);
    changed = true;
  }
  return changed ? lines.join('\n') : content;
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
// Per-snippet chip toolbar icon. Retired in the chips-v2 follow-up
// (e4ed813) and restored in chips v2-full per the user's choice —
// some redundancy with the Forge-ribbon-menu "Open chips palette"
// entry, but the per-snippet location keeps the affordance close to
// where insertion lands. Gated on chipPalette.length > 0 so vaults
// without `_chips.md` don't see a dead icon.
const CHIPS_BTN_CLASS = 'forge-chips-btn';

// v0.2.83 → v0.2.84 — gestural-mutex controller migrated to a CM6
// ViewPlugin. v0.2.83 used 200ms setInterval polling on a per-leaf
// FacetMutexController instance; v0.2.84 hooks into ViewUpdate via
// registerEditorExtension so gestures flip on the next CM frame
// (~16ms). The pure-core decision logic in facet-mutex-core.ts is
// unchanged; the integration lives in facet-mutex-view-plugin.ts.


export default class ForgePlugin extends Plugin {
  settings: ForgeSettings;
  private inputCache: Record<string, Record<string, string>> = {};
  // Snapshot of the registry inventory from /connect. Shape per vault:
  //   [{id, type, inputs}, ...]
  // Used as a fallback for snippet metadata when the local .md doesn't carry
  // it (e.g., an empty stub overlaying a builtin).
  private snippetInventory: Record<string, Array<{ id: string; type: string; inputs: string[] }>> = {};
  private freezeCache: { caller?: string; callee?: string } = {};
  // v0.2.7: closed-beta polish. With no uvicorn running,
  // writeGeneratedCode's syncDependencies call hits ECONNREFUSED on
  // every Forge-click. The error is non-fatal (Python facet is already
  // written; only the B7 # Dependencies section refresh is missed),
  // but a yellow stack on every click worries students. Log an
  // info-level explainer exactly once per session via this flag; reset
  // by class re-instantiation on plugin reload.
  private b7SyncSkippedLogged = false;
  // v0.2.9: tracks whether the Python-mode discoverability Notice has
  // been shown this session. Once per session is enough — students
  // learn the toolbar / palette / right-click affordances fast.
  private pythonModeNoticeShown = false;
  // Debounce handle for the file-modify hook that keeps the drift indicator
  // current. Editing the body fires modify on every keystroke; we coalesce
  // bursts so the lock button only re-renders once the user pauses.
  private modifyDebounceTimer: number | null = null;
  // Separate, longer debounce for the Python-facet tab sanitizer. Longer
  // because rewriting the file mid-typing forces a setViewData refresh on
  // the open editor — fine when the user has actually paused, jarring
  // otherwise. Files we've just sanitized show up in the modify event
  // again from our own write; the sanitizer is idempotent so the second
  // pass is a no-op early-exit, but we still want to avoid re-debouncing
  // pointlessly.
  private sanitizeDebounceTimer: number | null = null;
  // Domain scoping (constitution B9). null = the vault declared no
  // `domains` in forge.toml (or it's unreadable) → back-compat: treat
  // as "all domains", register every command. A Set means the vault
  // declared `domains = [...]`; a command/ribbon for domain D registers
  // only if the set has D. Empty set = core-only (no domain commands).
  private activeDomains: Set<string> | null = null;
  // Two-vault refactor (constitution A5.1): library-subdir discovery
  // resolves synchronously from Obsidian's in-memory file index on
  // every call — no cache. The earlier cached-set + vault.on('create')
  // shape missed library subdirs that landed via the engine's install
  // path (Python file writes don't reliably trigger Obsidian's vault
  // events before the user right-clicks). The synchronous index walk
  // is cheap and always fresh.

  async onload() {
    await this.loadSettings();

    // v0.2.91 — restore inlined plugin assets to disk on first run.
    // BRAT downloads only main.js + manifest + styles + data; the
    // release.sh `assets/` directory never lands. We inline ~1 MB of
    // vault + engine + iframe + welcome content into main.js (via
    // scripts/inline-bundled-assets.mjs) and write any missing files
    // here so the existing ensureBundledVault / Pyodide MEMFS /
    // iframe loader paths work unchanged. Idempotent: dev install
    // sees all files already present and skips.
    try {
      const written = await restoreInlinedAssets(this.app, this.manifest.id);
      if (written > 0) {
        console.log(`Forge: restored ${written} inlined assets to plugin directory (BRAT-install support)`);
      }
    } catch (e) {
      console.error('Forge: restoreInlinedAssets failed', e);
    }

    // V1 Phase 1: wire the Pyodide host. Lazy init — actual Pyodide
    // load only happens on the first computeSnippet call for a
    // bundled-library snippet. Per V1 architecture, plugin (not
    // iframe) is the Pyodide host. Phase 2 also routes the iframe's
    // /moda/* and /compute requests through here via engine-request
    // postMessages (see moda-view.ts).
    const pyodideHost = new PyodideHost(this.app, this.manifest.id);
    setPyodideHost(pyodideHost);
    setPyodideHostSingleton(pyodideHost);

    // v0.2.84 (replaces v0.2.83 polling) — register the facet-mutex
    // ViewPlugin once at onload. CM6 instantiates the plugin per
    // EditorView; per-view state lives on the plugin instance, the
    // ForgePlugin singleton only serves callbacks via FacetMutexHost.
    this.registerEditorExtension([
      makeFacetMutexViewPlugin(() => this.facetMutexHost()),
    ]);

    this.registerView(OUTPUT_VIEW_TYPE, leaf => new ForgeOutputView(leaf));
    this.registerView(THREE_VIEW_TYPE, leaf => new ForgeThreeView(leaf));
    this.registerView(EDGES_VIEW_TYPE, leaf => new ForgeEdgesView(leaf, () => this.settings.serverUrl));
    this.registerView(MODA_VIEW_TYPE, leaf => new ForgeModaView(leaf, {
      getSettings: () => this.settings,
      pluginId: this.manifest.id,
    }));
    this.registerView(CHIPS_VIEW_TYPE, leaf =>
      new ChipsView(leaf, this.chipsHost()));
    this.registerEditorExtension([sectionPlugin, readOnlyFacetFilter]);

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.syncButtons())
    );

    // Body edits don't fire layout-change, so the drift indicator on the
    // lock button would never refresh as the user types. Hook vault.modify
    // and re-run syncButtons after a short pause — long enough that we're
    // not thrashing on every keystroke, short enough that the yellow dot
    // appears almost as soon as the user stops typing.
    //
    // Same hook also kicks the Python-facet tab sanitizer on its own
    // longer debounce — Obsidian inserts literal \t for Tab and that
    // breaks Python's indentation parser; rewriting leading tabs to 4
    // spaces here means /compute doesn't 422 on "inconsistent use of
    // tabs and spaces". See sanitizePythonFacet for the rewrite rules.
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

        if (file instanceof TFile && file.extension === 'md') {
          const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
          if (fm?.type === 'action') {
            if (this.sanitizeDebounceTimer !== null) {
              window.clearTimeout(this.sanitizeDebounceTimer);
            }
            this.sanitizeDebounceTimer = window.setTimeout(() => {
              this.sanitizeDebounceTimer = null;
              this.sanitizePythonTabs(file);
            }, 800);
          }
        }
      }),
    );

    this.syncButtons();

    // Phase 2 — Render data-snippet bodies in the output panel when the user
    // navigates to one. Local parse (no /compute round-trip) and "replace"
    // semantics: the panel reflects the file currently being viewed.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => { this.maybePreviewDataSnippet(file); })
    );

    // v0.2.82 Item B — `.bak.<version>/` directory cohort cue. v0.2.78
    // excluded these from snippet discovery, but Obsidian's file tree
    // still surfaces them; users clicking files there get confused. Fire
    // a one-shot Notice per `.bak.*` dir per session.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => { this.maybeNotifyBakOpen(file); })
    );

    // Single context-aware Forge entry point (constitution B9 / ribbon
    // spec). Dispatches by forge.toml state: absent → init wizard;
    // present-without-domains → legacy menu; declared → scoped action
    // menu. Distinct from the per-snippet flame button (generate+run).
    this.addRibbonIcon('package', 'Forge', (evt: MouseEvent) => {
      openForgeAction(this.forgeHost(), evt);
    });

    // Menu-cleanup PR: the New-Snippet and Open-MoDa ribbon icons are
    // gone — the Forge `package` icon is the single ribbon entry point.
    // The corresponding palette commands stay registered below so power
    // users keep them via Cmd+P; reach New Snippet via the per-note
    // toolbar action.

    // Domain scoping (B9): only register the MoDa palette commands in
    // a vault that declares the "moda" domain (or declares none —
    // back-compat).
    await this.loadActiveDomains();

    // Two-vault Customize / Reset affordances on the file-menu (right-
    // click on a file in the explorer or its tab). Library discovery
    // is synchronous via libraryDirNames() — fresh on every menu open.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile) this.addTwoVaultMenuItems(menu, file);
      })
    );
    // v0.2.45: per-domain command registration extracted into a
    // helper so EditVaultDomainsModal.applyDiff can re-fire it when
    // a domain is added mid-session (without requiring a full
    // Obsidian quit + reopen).
    if (this.isDomainActive('moda')) {
      this.registerDomainCommands('moda');
    }

    // Chips v2 is domain-agnostic: load once at activate, surface the
    // palette via the chips view. The "Forge: Open chips palette"
    // command and per-snippet icon stay available even when the
    // palette is empty — the view itself renders an explanatory
    // empty-state message.
    await this.reloadChipPalette();
    this.addCommand({
      id: 'forge-open-chips',
      name: 'Open chips palette',
      callback: () => { this.openChipsView(); },
    });
    this.addCommand({
      id: 'forge-refresh-chips',
      name: 'Refresh chip palette',
      callback: () => { this.reloadChipPalette(/*refreshOpenView=*/ true); },
    });

    // V3: auto-reload chip palette when any `_chips.md` is modified
    // on disk. The refresh button stays as an escape hatch (manual
    // reload when the watcher misses an edit or when the parser
    // cache needs a kick). Debounced to coalesce rapid saves and to
    // give Obsidian's metadata pipeline a moment to settle.
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && isChipsFilePath(file.path)) {
          if (this.chipsReloadTimer !== null) {
            window.clearTimeout(this.chipsReloadTimer);
          }
          this.chipsReloadTimer = window.setTimeout(() => {
            this.chipsReloadTimer = null;
            void this.reloadChipPalette(/*refreshOpenView=*/ true);
          }, 300);
        }
      }),
    );

    // v0.2.58: B7.2 — intercept wikilink-clicks whose target is a
    // recognized Python builtin. Without this, canonical snippets
    // that reference `[[print]]`, `[[len]]`, etc. would pollute the
    // user's vault with stray `print.md`, `len.md`, etc. on every
    // click (Obsidian's default "create unresolved file" behavior).
    //
    // Coverage: document-level click capture matches both reading-
    // mode (<a class="internal-link">) and live-preview (<span
    // class="cm-hmd-internal-link">) renders via the closest()
    // walk. Source-mode raw `[[...]]` has no rendered link and is
    // an accepted gap. capture=true fires before Obsidian's
    // default handler, so preventDefault stops the file-creation.
    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
      const target = evt.target as Element | null;
      if (!target) return;
      const linkEl =
        target.closest('a.internal-link') as HTMLElement | null
        ?? target.closest('.cm-hmd-internal-link, .cm-link') as HTMLElement | null;
      if (!linkEl) return;
      // Extract link target. Reading mode carries it on data-href;
      // live preview spans use innerText. Pattern from edges-hover.ts.
      const raw =
        linkEl.getAttribute('data-href')
        ?? (linkEl as HTMLElement).innerText
        ?? '';
      const bareTarget = bareWikilinkTarget(raw);
      if (!isPythonBuiltin(bareTarget)) return;
      evt.preventDefault();
      evt.stopPropagation();
      new Notice(`'${bareTarget}' is a Python builtin — no Forge snippet to navigate to.`);
    }, { capture: true });

    // v0.2.18: keep the Pyodide-mounted user vault in sync with
    // direct editor edits. v0.2.17 fixed the writeGeneratedCode →
    // next-compute path, but smoke surfaced that a user editing
    // an English facet in the Obsidian editor + saving → clicking
    // Forge still hit a stale-inventory bug on the FIRST click
    // (α saw pre-edit English; second click worked because the
    // first click's writeGeneratedCode triggered the explicit
    // sync). This hook closes that gap.
    //
    // Obsidian throttles vault.on('modify') to roughly autosave
    // cadence (~1s post-keystroke) plus an immediate fire on
    // explicit Cmd-S. No app-side debounce needed for interactive
    // editing. shouldSkipForMemfsSync filters .obsidian/, .forge/,
    // .trash/, and non-markdown paths so the hook stays quiet on
    // workspace-state churn.
    //
    // Non-fatal try/catch matches v0.2.17's writeGeneratedCode
    // sync — a failed MEMFS push doesn't lose the user's edit
    // (still on disk), just leaves the registry temporarily stale.
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (!(file instanceof TFile)) return;
        if (shouldSkipForMemfsSync(file.path)) return;
        try {
          const hostManager = getPyodideHost();
          if (!hostManager) return;
          const host = await hostManager.getInstance();
          const content = await this.app.vault.read(file);
          await host.syncUserVaultFile(file.path, content);
        } catch (e) {
          console.warn(`Forge: MEMFS sync on modify failed for '${file.path}'`, e);
        }
      }),
    );

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
        this.generate();
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

    // v0.2.41: right-click a wikilink in a snippet body → freeze /
    // unfreeze the edge directly, no modal. Bypasses the modal-typing
    // UX that surfaced its first real failure as the URGENT
    // 2026-06-03-0000 freeze-capture bug. Caller is the current file's
    // basename; callee is the wikilink target; both auto-qualify via
    // _forge_set_edge_state (v0.2.40). Decision logic lives in the
    // pure-core wikilink-freeze-menu-core helper for testability.
    //
    // v0.2.43: editor.getCursor() returns the editor's LAST cursor
    // position, not the right-click position. In live preview (Obsidian's
    // default mode), right-clicking on a rendered wikilink doesn't move
    // the cursor — so findWikilinkAtCursor ran against the wrong line
    // and silently returned null. Fix: capture the contextmenu event's
    // DOM coordinates via a document.body listener (capture phase, runs
    // before editor-menu), translate to a document offset via
    // CodeMirror's posAtCoords, store on the plugin instance, consume in
    // the editor-menu handler. Same DOM-walking pattern edges-hover.ts
    // uses for the hover popover (see edges-hover.ts:59-68 for the
    // reading-mode / live-preview / source-mode breakdown).
    let lastContextmenuPos: { line: number; ch: number } | null = null;
    const contextmenuHandler = (ev: MouseEvent) => {
      lastContextmenuPos = null;
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (activeView.editor as any).cm;
      if (!cm || typeof cm.posAtCoords !== 'function') return;
      const offset = cm.posAtCoords({ x: ev.clientX, y: ev.clientY }, false);
      if (typeof offset !== 'number' || offset < 0) return;
      lastContextmenuPos = activeView.editor.offsetToPos(offset);
    };
    document.body.addEventListener('contextmenu', contextmenuHandler, true);
    this.register(() => {
      document.body.removeEventListener('contextmenu', contextmenuHandler, true);
    });

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, info: any) => {
        const file = info?.file;
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        // v0.2.43: prefer the right-click-derived position over the
        // editor's last cursor position (which is wrong in live preview).
        const cursor = lastContextmenuPos ?? editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const target = findWikilinkAtCursor(lineText, cursor.ch);
        if (target === null) return;

        // Build a SnippetRegistryLike on top of Obsidian's metadata
        // cache. Returns the resolved file's basename for known
        // snippets, null otherwise. The auto-qualify in
        // _forge_set_edge_state (v0.2.40) translates basenames to
        // qualified IDs Python-side, so we don't need to construct
        // qualified strings here.
        const registry: SnippetRegistryLikeMulti = {
          qualifyBareId: (bareId: string): string | null => {
            const resolved = this.app.metadataCache.getFirstLinkpathDest(
              bareId, file.path,
            );
            if (!resolved) return null;
            const fm = this.app.metadataCache.getFileCache(resolved)?.frontmatter;
            if (!fm) return null;
            const t = (fm as any).type;
            if (t !== 'action' && t !== 'data' && t !== 'snapshot') return null;
            return resolved.basename;
          },
          // v0.2.84 Item B — walk every markdown file with matching
          // basename. Filter to snippet types. Returns ALL qualified
          // candidates (basenames) — engine-side _forge_qualify_snippet_id
          // does the further bare→qualified routing per file.
          qualifyBareIdAll: (bareId: string): string[] => {
            const out: string[] = [];
            for (const f of this.app.vault.getMarkdownFiles()) {
              if (f.basename !== bareId) continue;
              const fmm = this.app.metadataCache.getFileCache(f)?.frontmatter;
              if (!fmm) continue;
              const t = (fmm as any).type;
              if (t !== 'action' && t !== 'data' && t !== 'snapshot') continue;
              out.push(f.basename);
            }
            return out;
          },
        };

        // v0.2.84 — try the multi-match decision first. If single
        // match, falls through to the legacy single-callee path so
        // the existing menu copy stays identical for the dominant
        // case. Only multi-match adds per-candidate menu items.
        const multi = decideWikilinkFreezeMenuMulti(
          file.basename, target, registry);
        if (!multi.showMenu) return;
        const caller = multi.caller as string;
        const callees = multi.callees as string[];
        // Single-match: render one item exactly as v0.2.83 did.
        // Multi-match: render N items, each labeled with its qualified
        // target (e.g. "Forge: Freeze edge song → forge-music/blues/chorus").

        const fireFreezeForCallee = async (
          state: 'frozen' | 'live', targetCallee: string,
        ) => {
          const vaultPath = (this.app.vault.adapter as any).basePath as string;
          const verb = state === 'frozen' ? 'freeze' : 'unfreeze';
          try {
            const res = await freezeEdge(
              this.settings.serverUrl, vaultPath, caller, targetCallee, state,
            );
            if (res.status === 200) {
              new Notice(`Forge: ${verb}d ${caller} → ${targetCallee}`);
            } else if (res.status === 404) {
              new Notice(
                `Forge: no snapshot for ${caller} → ${targetCallee}. ` +
                `Forge-click ${caller} once to capture it.`,
              );
            } else {
              const detail = res.json?.detail ?? `HTTP ${res.status}`;
              new Notice(`Forge: ${verb} failed — ${detail}`);
            }
          } catch (e) {
            console.error(`Forge ${verb} error:`, e);
            new Notice(`Forge: ${verb} failed — check console.`);
          }
        };

        // v0.2.44: state-aware items. v0.2.84 — for multi-match, query
        // state per candidate so each item's enabled-state is accurate.
        const hostManager = getPyodideHost();
        const host = hostManager?.tryGetInstance();

        for (const targetCallee of callees) {
          const state: 'frozen' | 'live' | 'no-snapshot' | null =
            host ? host.readSnapshotStateSync(caller, targetCallee) : null;
          const freezeDisabled = state === 'frozen';
          const unfreezeDisabled = state !== 'frozen';
          menu.addItem((item) => {
            item.setTitle(`Forge: Freeze edge ${caller} → ${targetCallee}`)
              .setIcon('snowflake')
              .setDisabled(freezeDisabled)
              .onClick(() => { void fireFreezeForCallee('frozen', targetCallee); });
          });
          menu.addItem((item) => {
            item.setTitle(`Forge: Unfreeze edge ${caller} → ${targetCallee}`)
              .setIcon('flame')
              .setDisabled(unfreezeDisabled)
              .onClick(() => { void fireFreezeForCallee('live', targetCallee); });
          });
        }
      }),
    );

    this.addCommand({
      id: 'forge-run-only',
      name: 'Run only (active snippet)',
      callback: () => { this.runSnippet(); },
    });

    // v0.2.9: surface the edit-mode toggle in Cmd+P. Single command
    // (not two switch-to-X variants) because (a) it mirrors the
    // toolbar button's semantics exactly and (b) the Notice fired
    // inside toggleEditModeForFile already announces the new mode,
    // so "which direction" is never ambiguous post-invocation.
    this.addCommand({
      id: 'forge-toggle-edit-mode',
      name: 'Toggle Python/English editing mode',
      callback: () => { this.toggleEditMode(); },
    });

    // v0.2.9: right-click discoverability. Edit-mode entry on the
    // file-menu for any `forge` action snippet — target IS the
    // clicked file (toggleEditModeForFile), not the active view.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.type !== 'action') return;
        const current = getEditMode(fm);
        const target = current === 'python' ? 'English' : 'Python';
        menu.addItem((item) => {
          item.setTitle(`Forge: Switch to ${target} editing mode`)
            .setIcon(current === 'python' ? 'pencil-line' : 'code')
            .onClick(async () => {
              await this.toggleEditModeForFile(file);
            });
        });
      }),
    );

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

    // v0.2.44: hover popover removed — see import-site comment.
    // const detachHover = attachEdgeHover(this.app, () => this.settings.serverUrl);
    // this.register(detachHover);

    await runFirstRunCheck(this.app);

    // v0.2.8: ensureServerRunning() was called here in pre-V1 builds
    // to auto-spawn uvicorn from a hardcoded venv path. Pyodide makes
    // that obsolete — the plugin never starts an engine subprocess.
    // Local-uvicorn dev workflows manage their own server lifecycle.

    // v0.2.7: one-shot welcome notice. Persists `seenWelcome` so the
    // notice fires exactly once per (vault, plugin install) pair.
    // Migrating users from v0.2.6 → v0.2.7 also see it once because
    // the field doesn't exist in their data.json and Object.assign in
    // loadSettings preserves the DEFAULT_SETTINGS false. The token-
    // status branch handles both first-install paths cleanly.
    if (!this.settings.seenWelcome) {
      const hasToken = !!this.settings.transpileServiceToken?.trim();
      // 10-second timeout (vs Obsidian's 5s default) because closed-
      // beta students may be mid-other-task when Obsidian finishes
      // loading; 5s is too easy to miss.
      new Notice(welcomeMessage(hasToken), 10000);
      this.settings.seenWelcome = true;
      await this.saveSettings();
    }
  }

  async onunload() {
    // v0.2.7: reset the once-per-session b7-sync explainer flag so a
    // Cmd-R / disable-enable cycle re-fires the info line. The class
    // is also re-instantiated on plugin reload (which would reset the
    // field via the class-field initializer anyway), but the explicit
    // reset here documents the intent + protects against any future
    // pattern where Obsidian reuses the instance.
    this.b7SyncSkippedLogged = false;
    // v0.2.9: same once-per-session reset semantics for the Python-
    // mode discoverability Notice.
    this.pythonModeNoticeShown = false;
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
    this.syncShadowMarker(view);

    // Remove any stale Forge buttons from a previous plugin load before adding fresh ones.
    // RUN_BTN_CLASS / HAMMER_BTN_CLASS / LOCK_BTN_CLASS are listed so users still get
    // their predecessors swept after the Run+Generate→Forge and lock→edit-mode
    // refactors.
    view.containerEl.querySelectorAll(
      `.${SNIPPET_BTN_CLASS}, .${RUN_BTN_CLASS}, .${HAMMER_BTN_CLASS}, .${EDGES_BTN_CLASS}, .${FORGE_BTN_CLASS}, .${LOCK_BTN_CLASS}, .forge-chips-btn, .forge-dag-btn`
    ).forEach(el => el.remove());

    // v0.2.46: hoist the frontmatter lookup so the chip-toolbar
    // decision can use it. Previously fm was computed below for the
    // edit-mode toggle only. Moving it up keeps a single source of
    // truth + lets both toolbar buttons branch on the same data.
    const fm = view.file
      ? this.app.metadataCache.getFileCache(view.file)?.frontmatter
      : undefined;

    // Order matters: Obsidian's view.addAction PREPENDS — the most
    // recently added action renders leftmost. So to get the visual
    // left-to-right order [Forge, New Snippet, (mode), edges, chips]
    // we add them in REVERSE: chips first, then edges, mode,
    // New Snippet, and Forge LAST so it lands at the far left.
    //
    // v0.2.46: chip-toolbar visibility moved to the pure-core helper
    // shouldShowChipsToolbarButton. Pre-v0.2.46 gated on
    // `chipPalette.length > 0`, which hid the button in any vault
    // without a loaded _chips.md — a discoverability trap mirroring
    // the action-menu trap fixed in c3848d9. New gate: file type is
    // `action` (chip insertion is meaningful for action-snippet
    // authoring only; the chips view's empty-state messaging
    // handles the no-chips-yet discovery surface). See
    // src/chip-toolbar-button-core.ts for the decision logic +
    // src/chip-toolbar-button-core.test.ts for the 7 cases.
    if (shouldShowChipsToolbarButton({
      fileType: typeof fm?.type === 'string' ? fm.type : undefined,
      chipsCount: this.chipPalette.length,
    })) {
      const chipsBtn = view.addAction(
        'puzzle', 'Forge: Open chips palette',
        () => { this.openChipsView(); });
      chipsBtn.addClass(CHIPS_BTN_CLASS);
    }
    // v0.2.77 — gate the edges panel toggle on snippet-ness. Edges
    // are inherently per-snippet (caller→callee dependency graph);
    // toggling the edges panel from a plain note is meaningless.
    if (forgeButtonShouldShow({ type: typeof fm?.type === 'string' ? fm.type : undefined })) {
      const edgesBtn = view.addAction('network', 'Forge: Toggle edges panel', () => { this.toggleEdgesView(); });
      edgesBtn.addClass(EDGES_BTN_CLASS);
    }

    // v0.2.79 — edit-mode ribbon button REMOVED. Moves V1 toward V2's
    // gestural model: the primary cohort rarely flips between English
    // and Python mode, and the ribbon button was adding UI noise for a
    // power-user feature. The B8 edit_mode frontmatter contract,
    // locked_english_hash drift detection, and engine behavior are all
    // unchanged. Power users retain access via the command palette
    // (Cmd-P → "Toggle Python/English editing mode" — registered at
    // line 685-688) which preserves the toggleEditMode + drift-aware
    // markDriftAsync path. v0.2.84 — MODE_BTN_CLASS class declaration
    // removed; v0.2.83's gestural mutex permanently replaced the
    // ribbon-button surface, so the restoration option is off the table.

    const snippetBtn = view.addAction('file-plus', 'New Snippet', () => { this.createNewSnippet(); });
    snippetBtn.addClass(SNIPPET_BTN_CLASS);

    // v0.2.77 — Forge button only on snippet files (type: action|data).
    // Pre-v0.2.77 the button appeared on every markdown file; clicking
    // on a non-snippet (e.g. forge-tutorial/01-hello/Hello.md lesson
    // note) errored with no helpful feedback. Gate via the pure-core
    // predicate so non-snippet notes show no Forge button at all.
    // Added last → prepended first → leftmost (when shown).
    if (forgeButtonShouldShow({ type: typeof fm?.type === 'string' ? fm.type : undefined })) {
      const forgeBtn = view.addAction('flame', 'Forge', () => { this.forgeSnippet(); });
      forgeBtn.addClass(FORGE_BTN_CLASS);
    }
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
  //
  // v0.2.9: split into a TFile-taking helper so the right-click file-menu
  // entry can target a non-active file. toggleEditMode() preserves the
  // active-view semantics for the toolbar button + command palette callers.
  private async toggleEditMode() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note.');
      return;
    }
    await this.toggleEditModeForFile(view.file);
  }

  private async toggleEditModeForFile(file: TFile) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'action') {
      new Notice('Edit mode is only meaningful for action snippets.');
      return;
    }
    const current = getEditMode(fm);
    const target: 'english' | 'python' = current === 'python' ? 'english' : 'python';
    await this.setEditModeForFile(file, target);
  }

  /** v0.2.83 (from v0.2.80 prompt §3.3 + §3.5) — drift-aware
   *  edit_mode writer shared between the command-palette toggle path
   *  AND the new facet-mutex gesture path. Maintains B8 contract
   *  (`locked_english_hash` drift baseline).
   *
   *  §3.5 palette guard: when the caller wants `python` mode but the
   *  snippet has no `# Python` heading on disk (slot-free canonical
   *  that hasn't been transpiled yet), no-op + show an explanatory
   *  Notice instead of promising editability of nothing. Preferred
   *  path (a) per the prompt — does NOT auto-create a Python stub
   *  (that would risk stale-cache on user edits).
   */
  /** v0.2.84 — host adapter the facet-mutex ViewPlugin calls back
   *  into. Returns null when no active markdown snippet is in focus,
   *  in which case the ViewPlugin no-ops cleanly. */
  private facetMutexHost(): FacetMutexHost {
    return {
      app: this.app,
      getActiveSnippet: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return null;
        const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter;
        const t = typeof fm?.type === 'string' ? fm.type : undefined;
        if (t !== 'action' && t !== 'data') return null;
        const mode = getEditMode(fm) ?? 'english';
        return { file: view.file, mode: mode as 'english' | 'python' };
      },
      setEditModeForFile: (file, newMode) =>
        this.setEditModeForFile(file, newMode),
    };
  }

  public async setEditModeForFile(
    file: TFile, newMode: 'english' | 'python',
  ): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'action') {
      new Notice('Edit mode is only meaningful for action snippets.');
      return;
    }

    if (newMode === 'english') {
      // v0.2.90 — invalidate the english_hash cache when leaving
      // python mode. While in python mode the user may have hand-
      // edited `# Python`; switching back to english mode means
      // english is the source of truth again. Without this, the
      // engine's cache contract (english_hash matches current English
      // → return existing `# Python` verbatim) would return the user's
      // python-mode edits as if they were the canonical transpilation
      // — Forge-clicking from english mode wouldn't overwrite them.
      // Deleting english_hash forces a cache miss → re-transpile on
      // the next Forge-click. For canonical slot-bearing snippets
      // this triggers a /resolve-slot roundtrip, but server-side
      // resolution cache keeps it fast.
      await this.app.fileManager.processFrontMatter(file, (fm: any) => {
        delete fm.edit_mode;
        delete fm.locked;             // legacy alias — clean up while we're here
        delete fm.locked_english_hash;
        delete fm.english_hash;
      });
      new Notice(`Forge: ${file.basename} → English mode`);
      this.syncButtons();
      return;
    }

    // newMode === 'python'
    // §3.5 guard: refuse to flip to python mode when there's no
    // # Python heading at all. The palette toggle USED to promise
    // "Python is now editable" even on slot-free canonical snippets
    // where no Python facet existed (v0.2.79 smoke Step 5 UX bug).
    // We check heading PRESENCE (not just content) — a heading with
    // empty body is still editable; a missing heading isn't.
    const content = await this.app.vault.read(file);
    if (!/^#{1,6}\s+python\s*$/im.test(content)) {
      new Notice(
        `Forge: '${file.basename}' has no Python facet (slot-free ` +
        `canonical). Add slots and Forge-run to generate one, or ` +
        `stay in English mode.`,
        8000,
      );
      return;
    }

    // Snapshot the current English so we can detect drift later. The hash
    // field name stays `locked_english_hash` for one cycle so Phase-5
    // vaults don't lose their drift baseline; new writes use the same key.
    const english = extractSection(content, 'english');
    const hash = await sha256Hex(english);
    await this.app.fileManager.processFrontMatter(file, (fm: any) => {
      fm.edit_mode = 'python';
      fm.locked_english_hash = hash;
      delete fm.locked;             // migrate off the legacy field
    });
    new Notice(`Forge: ${file.basename} → Python mode`);
    // v0.2.9: discoverability nudge. The unlock affordances (toolbar
    // pencil, Cmd+P entry, right-click) were too easy to miss in
    // closed-beta smoke. Fire a longer explainer Notice the first
    // time the user enters Python mode this session.
    if (!this.pythonModeNoticeShown) {
      new Notice(
        'Python facet is now editable. To switch back, click the '
        + 'pencil icon in the toolbar, use Cmd+P → '
        + '"Forge: Toggle Python/English editing mode", or right-click '
        + 'the file.',
        12000,
      );
      this.pythonModeNoticeShown = true;
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
    // v0.2.26: qualified snippet_id for library subdir files.
    const snippetId = snippetIdFromPath(file.path, this.libraryDirNames());
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

    // Body update + (in Python mode) re-snapshot of locked_english_hash, in
    // a single atomic vault.process call. Splitting these into vault.modify +
    // processFrontMatter (the previous shape) raced against the open
    // editor's pending refresh: the second write read the editor's stale
    // CodeMirror state and put the old English back, so the visible editor
    // view never updated even though disk eventually settled on the new
    // text. One write, one editor refresh.
    const isPythonMode = getEditMode(fm) === 'python';
    const newHash = isPythonMode ? await sha256Hex(newEnglish.trim()) : null;
    let writtenContent: string | null = null;
    try {
      await this.app.vault.process(file, (content) => {
        let updated = replaceEnglishSection(content, newEnglish);
        if (newHash !== null) {
          updated = setFrontmatterField(updated, 'locked_english_hash', newHash);
        }
        writtenContent = updated;
        return updated;
      });
    } catch (e) {
      console.error('Forge canonicalize: write failed', e);
      new Notice('Forge: canonicalize wrote the model output but the file write failed — check console.');
      return;
    }

    // Obsidian's MarkdownView reload-on-modify handler is gated on
    // `!file.saving`. vault.process flips that flag to true for the duration
    // of the write, so the modify event fires while the gate is closed and
    // the editor view never picks up the new content. After the write the
    // flag is cleared but no second refresh is queued. Force the active
    // view to absorb the new content here.
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (writtenContent !== null && activeView?.file?.path === file.path) {
      activeView.setViewData(writtenContent, false);
    }

    new Notice(`Forge: synced English ← Python on ${snippetId}`);
    this.syncButtons();
  }

  // Rewrite leading-tab indentation in the snippet's Python facet to 4-
  // space indentation. Triggered from the modify-event hook on a long
  // debounce so it only fires after the user pauses. No-op exits early
  // when sanitizePythonFacet finds nothing to change, so the modify
  // event our own write fires doesn't recurse.
  private async sanitizePythonTabs(file: TFile) {
    let writtenContent: string | null = null;
    try {
      await this.app.vault.process(file, (content) => {
        const sanitized = sanitizePythonFacet(content);
        if (sanitized === content) return content;
        writtenContent = sanitized;
        return sanitized;
      });
    } catch (e) {
      console.warn('Forge sanitize: write failed', e);
      return;
    }
    if (writtenContent === null) return;
    // Same setViewData dance as syncEnglishFromPython — vault.process's
    // saving=true gate keeps the open editor from auto-reloading, so push
    // the rewritten content into the active view explicitly.
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file?.path === file.path) {
      view.setViewData(writtenContent, false);
    }
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

  // Adapter handed to the Forge ribbon action module so it never has to
  // import this class (avoids a cycle). Closes over `this`, so the
  // private openModaView / stepModaSimulation / loadActiveDomains stay
  // private to the plugin while still reachable from the action UI.
  private forgeHost(): ForgeHost {
    return {
      app: this.app,
      serverUrlOf: () => this.settings.serverUrl,
      vaultPathOf: () => (this.app.vault.adapter as any).basePath as string,
      reloadActiveDomains: () => this.loadActiveDomains(),
      openModaView: () => { this.openModaView(); },
      stepModaSimulation: () => { this.stepModaSimulation(); },
      openChipsView: () => { this.openChipsView(); },
      // v0.2.45: domain-activation plumbing for EditVaultDomainsModal.
      currentActiveDomains: () => this.currentActiveDomains(),
      registerDomainCommands: (domain: string) => { this.registerDomainCommands(domain); },
    };
  }

  // Read the vault's forge.toml `domains` once at load (constitution
  // B9). Obsidian is one-vault-per-window, so there's no in-session
  // vault switch to react to — a forge.toml change is picked up on the
  // next plugin reload. Minimal hand-parse (forge.toml is tiny and the
  // engine owns the authoritative parse); any miss falls back to
  // null = "all domains" so we never hide commands by accident.
  private async loadActiveDomains() {
    // Absent forge.toml is the common case for student vaults that
    // haven't run `Forge: install` — silent fall-through to back-compat
    // "all domains" without alarming Console noise. Distinguish from
    // "present but unreadable" below, which IS a real error worth logging.
    if (!(await this.app.vault.adapter.exists('forge.toml'))) {
      this.activeDomains = null;
      return;
    }
    try {
      const raw = await this.app.vault.adapter.read('forge.toml');
      // Match `domains = [ ... ]` (single- or multi-line array body).
      const m = raw.match(/^\s*domains\s*=\s*\[([\s\S]*?)\]/m);
      if (!m) {
        this.activeDomains = null; // field absent → back-compat "all"
        return;
      }
      const names = Array.from(m[1].matchAll(/["']([^"']+)["']/g)).map(x => x[1]);
      this.activeDomains = new Set(names); // possibly empty = core-only
    } catch (e) {
      // forge.toml present but read/parse failed → real error.
      console.warn('Forge: could not read forge.toml domains; registering all commands', e);
      this.activeDomains = null;
    }
  }

  // null (no declaration / unreadable) → every domain is "active"
  // (back-compat). Otherwise active iff the declared set contains it.
  private isDomainActive(domain: string): boolean {
    return this.activeDomains === null || this.activeDomains.has(domain);
  }

  // v0.2.45: snapshot of the current active-domain set (or null for
  // back-compat all-active). Returns a copy so the caller doesn't see
  // mutation from a subsequent reloadActiveDomains call.
  public currentActiveDomains(): Set<string> | null {
    return this.activeDomains === null ? null : new Set(this.activeDomains);
  }

  // v0.2.45: register the command-palette entries for a given domain.
  // Called from onload (for each domain active at boot) AND from
  // EditVaultDomainsModal.applyDiff (for each newly-added domain).
  // Obsidian's addCommand is idempotent on duplicate id (latest call
  // wins), so re-firing for an already-registered domain is safe.
  public registerDomainCommands(domain: string): void {
    if (domain === 'moda') {
      this.addCommand({
        id: 'forge-open-moda',
        name: 'Open MoDa simulation',
        callback: () => { this.openModaView(); },
      });
      this.addCommand({
        id: 'forge-step-moda',
        name: 'Step MoDa simulation',
        callback: () => { this.stepModaSimulation(); },
      });
    }
    // music has no commands today; flag DOMAIN_INVENTORY in
    // src/domain-activation-core.ts when music commands ship and add
    // the branch here.
  }

  // ------ Two-vault refactor: library subdir discovery + shadow helpers ------

  // Walk Obsidian's in-memory file index for top-level folders that
  // contain a forge.toml — those are library vaults installed under
  // this user vault (per A5.1). Synchronous, always reflects current
  // state. Called from isShadowedFile / libraryFileInfo on each menu
  // open / editor marker refresh, so the affordances appear
  // immediately after an install instead of waiting for a watcher.
  private libraryDirNames(): Set<string> {
    const out = new Set<string>();
    const root = this.app.vault.getRoot();
    for (const child of root.children) {
      if (!(child instanceof TFolder)) continue;
      if (child.name.startsWith('.')) continue;
      if (this.app.vault.getAbstractFileByPath(`${child.name}/forge.toml`)) {
        out.add(child.name);
      }
    }
    return out;
  }

  // A vault-root .md is "shadowed" when there's a same-basename .md
  // inside any library subdir. The root copy wins resolution per A4;
  // the library copy stays on disk. We surface this in the editor
  // (marker stripe) and in the file menu (Reset to library version).
  private isShadowedFile(file: TFile): { shadowed: true; libraryPath: string } | { shadowed: false } {
    if (file.extension !== 'md') return { shadowed: false };
    const parts = file.path.split('/');
    if (parts.length !== 1) return { shadowed: false };  // not at root
    const name = parts[0];
    for (const dir of this.libraryDirNames()) {
      const candidate = `${dir}/${name}`;
      if (this.app.vault.getAbstractFileByPath(candidate)) {
        return { shadowed: true, libraryPath: candidate };
      }
    }
    return { shadowed: false };
  }

  // A library-side .md is the inverse: it lives inside a library
  // subdir AND it's not already shadowed at root. These get the
  // "Customize (create editable copy at vault root)" affordance.
  private libraryFileInfo(file: TFile): { libraryDir: string; alreadyShadowed: boolean } | null {
    if (file.extension !== 'md') return null;
    const slash = file.path.indexOf('/');
    if (slash === -1) return null;
    const dir = file.path.slice(0, slash);
    if (!this.libraryDirNames().has(dir)) return null;
    const basename = file.path.slice(slash + 1);
    if (basename.includes('/')) return null;       // not directly under libdir
    const alreadyShadowed = this.app.vault.getAbstractFileByPath(basename) !== null;
    return { libraryDir: dir, alreadyShadowed };
  }

  // Add or remove the shadow marker on the active editor's container.
  // Called from syncButtons (same hook chain — layout-change /
  // file-open / debounced modify) so it's a static update tied to
  // discrete file events, never to active-leaf-change.
  private syncShadowMarker(view: MarkdownView) {
    const el = view.containerEl;
    el.removeClass('forge-shadow-file');
    if (view.file) {
      const info = this.isShadowedFile(view.file);
      if (info.shadowed) {
        el.addClass('forge-shadow-file');
        el.setAttribute('data-forge-shadow-of', info.libraryPath);
      } else {
        el.removeAttribute('data-forge-shadow-of');
      }
    }
  }

  // Right-click "Customize" / "Reset to library" affordances on the
  // file menu. Wired from the file-menu event registered in onload —
  // this method just builds the per-file items.
  private addTwoVaultMenuItems(menu: any, file: TFile) {
    const shadow = this.isShadowedFile(file);
    if (shadow.shadowed) {
      menu.addItem((item: any) =>
        item.setTitle('Forge: Reset to library version')
          .setIcon('undo-2')
          .onClick(() => this.resetToLibrary(file)));
      return;
    }
    const lib = this.libraryFileInfo(file);
    if (lib && !lib.alreadyShadowed) {
      menu.addItem((item: any) =>
        item.setTitle('Forge: Customize (create editable copy at vault root)')
          .setIcon('copy')
          .onClick(() => this.customizeFromLibrary(file)));
    }
  }

  private async resetToLibrary(file: TFile) {
    // Two-step confirmation via a tiny Modal would be the polished
    // path; for v1 we use the synchronous browser confirm so the
    // affordance ships in one PR. Polish later.
    const ok = window.confirm(
      `Reset ${file.path} to library version? This deletes the shadow ` +
      `file and discards your changes. The library version will be the ` +
      `one used by /compute and /generate afterward.`);
    if (!ok) return;
    try {
      await this.app.vault.delete(file);
      new Notice(`Forge: ${file.basename} reset — library version now active.`);
    } catch (e) {
      console.error('Forge: reset failed', e);
      new Notice(`Forge: reset of ${file.basename} failed — check console.`);
    }
  }

  private async customizeFromLibrary(file: TFile) {
    const targetPath = file.name;  // basename → vault root
    if (this.app.vault.getAbstractFileByPath(targetPath)) {
      new Notice(`Forge: ${targetPath} already exists at vault root.`);
      return;
    }
    try {
      const body = await this.app.vault.read(file);
      const created = await this.app.vault.create(targetPath, body);
      new Notice(`Forge: customized ${targetPath} — edit at vault root; ` +
        `your copy shadows the library version.`);
      // Open the new file so the user immediately lands on their copy.
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(created as TFile);
    } catch (e) {
      console.error('Forge: customize failed', e);
      new Notice(`Forge: customize of ${file.basename} failed — check console.`);
    }
  }

  private async openModaView() {
    const existing = this.app.workspace.getLeavesOfType(MODA_VIEW_TYPE)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: MODA_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /** v0.2.92 — is the file at this path a forge-moda library snippet?
   *  Detected by path-prefix match against the bundled-library
   *  convention. Used by forgeSnippet to auto-open the moda
   *  simulation tab before running, so `context.moda.draw(...)`
   *  posts particles into a visible iframe. */
  private isModaSnippet(filePath: string): boolean {
    return filePath.startsWith('forge-moda/');
  }

  // Chips v2. Domain-agnostic palette pane in the right sidebar. The
  // view reads `_chips.md` from the vault root + each declared-domain
  // subdir on open / on refresh; renders an empty-state message if
  // no chips are defined.
  private async openChipsView() {
    const existing = this.app.workspace.getLeavesOfType(CHIPS_VIEW_TYPE)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
    await leaf.setViewState({ type: CHIPS_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  // Cached merged palette. Drives the toolbar-icon visibility (only
  // shown when chips exist) and lets the open view ask the plugin
  // for a snapshot rather than re-reading disk per render. Reloaded
  // on plugin activate and on the explicit "Refresh chip palette"
  // command.
  private chipPalette: ChipPaletteGroup[] = [];
  private openChipsViews = new Set<ChipsView>();
  // V3 file-watch debounce: coalesce rapid `_chips.md` modify events
  // (e.g. a save flurry while typing in the data snippet) so we only
  // reload the palette once when the dust settles.
  private chipsReloadTimer: number | null = null;

  private async reloadChipPalette(refreshOpenView = false) {
    try {
      this.chipPalette = await loadChipsForActiveVault(
        this.app, this.chipsManifest());
    } catch (e) {
      console.error('Forge chips: load failed', e);
      this.chipPalette = [];
    }
    if (refreshOpenView) {
      for (const v of this.openChipsViews) {
        void v.refresh();
      }
    }
    // Toolbar icon's visibility depends on chipPalette.length — keep
    // it in sync after a refresh.
    this.syncButtons();
  }

  private chipsManifest(): ChipsManifest {
    // v0.2.67 — populate `activeFilePath` from the workspace so the
    // chip palette loader can run v3.1 walk-up against per-chapter
    // `_chips.md` files. Snapshot taken at manifest-read time so each
    // `loadChipsForActiveVault` invocation sees a coherent view of
    // "what file is active right now."
    const activeFile = this.app.workspace.getActiveFile();
    return {
      vaultName: this.app.vault.getName(),
      // v0.2.47: chip source discovery driven by on-disk installed
      // library subdirs (libraryDirNames), not by declared domains.
      // Pre-v0.2.47 used `domains: this.activeDomains` — which missed
      // forge-moda chips in vaults with `domains = ["music"]` even
      // though forge-moda is unconditionally extracted (welcome.ts:104).
      // The chip view's empty-state messaging discovered the gap
      // during v0.2.46 smoke when the user opened the chips palette
      // from forge-moda/simulation.md and saw nothing.
      libraryDirNames: Array.from(this.libraryDirNames()),
      activeFilePath: activeFile?.path ?? null,
    };
  }

  private chipsHost(): ChipsHost {
    return {
      getManifest: () => this.chipsManifest(),
      registerView: (v) => { this.openChipsViews.add(v); },
      unregisterView: (v) => { this.openChipsViews.delete(v); },
    };
  }

  // Advance every open MoDa view one tick by postMessage'ing the
  // embedded simulator. No backend involvement here — the React app's
  // handleStep does the single /moda/compute round-trip. Notice if
  // there's no MoDa view (or the iframe hasn't loaded yet).
  private stepModaSimulation() {
    const leaves = this.app.workspace.getLeavesOfType(MODA_VIEW_TYPE);
    let stepped = 0;
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof ForgeModaView && view.step()) stepped++;
    }
    if (stepped === 0) {
      new Notice('No MoDa view open — open one first (Forge: Open MoDa simulation).');
    }
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

    // v0.2.92 → v0.2.93 — Forge-click on a forge-moda snippet auto-
    // opens the moda simulation tab AND triggers featured-run inside
    // the iframe. v0.2.92 alone (auto-open only) wasn't enough:
    // Tamar's smoke showed "tab opens but simulation idle" because
    // the iframe waits for a user click on its in-iframe play button.
    // v0.2.93 sends `featured-run` to the iframe (via
    // ForgeModaView.requestFeaturedRun) which the iframe handles
    // by auto-triggering the featured snippet's compute pathway.
    // The plugin's Pyodide host receives the compute via the iframe's
    // engine-request route and the canvas renders.
    // Skip the local runSnippet path entirely for moda snippets —
    // the iframe owns the compute pathway here.
    if (this.isModaSnippet(view.file.path)) {
      await this.openModaView();
      const leaf = this.app.workspace.getLeavesOfType(MODA_VIEW_TYPE)[0];
      if (leaf?.view instanceof ForgeModaView) {
        leaf.view.requestFeaturedRun();
      }
      return;
    }

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
    // v0.2.55: Stage 2 — opt-in canonical E-- compile path.
    // `facet_form: canonical` snippets skip /generate entirely; the
    // engine's resolve_action_code (forge.core.executor) transpiles
    // the English facet via the vendored forge.e_minus_minus
    // package at runtime. No LLM call, deterministic compile.
    if (getFacetForm(fm) === 'canonical') {
      console.log(`Forge: skipping /generate, ${view.file.basename} is in canonical E-- mode`);
      await this.runSnippet('Forge failed during execution');
      return;
    }
    const ok = await this.generate('Forge failed during generation');
    if (!ok) return;
    await this.runSnippet('Forge failed during execution');
  }

  // v0.2.4 α swap: /generate now POSTs to the hosted transpile
  // service instead of the local engine. The plugin materializes the
  // snippet inventory via Pyodide (same resolver the engine uses) and
  // sends it in the body. Recursive walks are dropped — single
  // snippet per call; the plugin can be enhanced later to walk
  // dependencies client-side if needed.
  //
  // Returns true on success. errorPrefix is set by the Forge-button
  // flow (so notices read "Forge failed during generation: …" rather
  // than the standalone "check console" voice).
  private async generate(errorPrefix?: string): Promise<boolean> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active note to generate.');
      return false;
    }

    // v0.2.26: qualified snippet_id for library subdir files.
    const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
    const settings = this.settings;

    // Fail-fast on empty token: actionable Notice without spending a
    // network round-trip discovering a 401.
    if (!settings.transpileServiceToken) {
      const msg = 'Set your transpile token in Settings → Forge → Transpile token before using /generate.';
      new Notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
      return false;
    }

    console.log('Forge: generate (α)', {
      snippetId,
      serviceUrl: settings.transpileServiceUrl,
    });

    const modal = new ForgeGenerationModal(this.app, `Forging ${snippetId}…`);
    modal.open();

    try {
      // 1. Materialize the inventory via Pyodide. Same resolver path
      //    the local compute uses, so A4 shadows + A5.1 library subdirs
      //    are honored. Pyodide is lazy-init; first /generate call pays
      //    the ~1.5s warm-up cost.
      //
      // v0.2.19: pre-flight sync to close the vault.on('modify')
      // race. Cmd-S → modify event fires async → Forge-click within
      // ~100ms can beat the handler to /generate. Reading fresh disk
      // content + syncing to MEMFS synchronously here makes the
      // timing local to the Forge-click handler instead of dependent
      // on hook completion. v0.2.18's hook remains as belt-and-
      // suspenders for the between-clicks case.
      let payload: AlphaGenerateRequest;
      try {
        const pyodideHost = getPyodideHost();
        if (!pyodideHost) {
          throw new Error('Pyodide host not initialized');
        }
        const host = await pyodideHost.getInstance();

        // v0.2.19: pre-flight disk→MEMFS sync. Best-effort: if the
        // file can't be located or read, fall through to the
        // preflight inventory call which still refreshes from
        // whatever MEMFS currently contains.
        try {
          const file = this.app.vault.getAbstractFileByPath(`${snippetId}.md`);
          if (file instanceof TFile) {
            const freshContent = await this.app.vault.read(file);
            await host.syncUserVaultFile(file.path, freshContent);
          }
        } catch (e) {
          console.warn('Forge: pre-flight sync failed before /generate', e);
        }

        const inv = await host.preflightThenInventory(snippetId);
        payload = {
          snippet_id: inv.snippet_id,
          description: inv.description,
          english: inv.english,
          inputs: inv.inputs,
          generation_notes: inv.generation_notes,
          deps: inv.deps,
          // active_domains plumbs forge.toml's `domains` field
          // through to the system prompt. null = "all registered"
          // (back-compat for vaults without forge.toml); empty array
          // = core-only; specific list = that subset.
          active_domains:
            this.activeDomains === null ? null : Array.from(this.activeDomains),
        };
      } catch (e) {
        console.error('Forge: inventory materialization failed', e);
        const detail = e instanceof Error ? e.message : String(e);
        new Notice(errorPrefix ? `${errorPrefix}: inventory failed — ${detail}` : `Forge: inventory failed — ${detail}`);
        return false;
      }

      // 2. POST to the hosted service.
      let response;
      try {
        response = await generateSnippetAlpha(
          settings.transpileServiceUrl,
          settings.transpileServiceToken,
          payload,
        );
      } catch (e) {
        // Transport-level (DNS, TCP, TLS handshake). The hosted-α
        // path uses requestUrl + throw:false so HTTP non-2xx never
        // gets here — only true network failures.
        console.error('Forge Generate Error (transport):', e);
        const detail = e instanceof Error ? e.message : String(e);
        const msg = `Could not reach transpile service at ${settings.transpileServiceUrl}. Check your internet connection + Settings → Forge → Transpile service URL. (${detail})`;
        new Notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
        return false;
      }

      if (response.status === 200) {
        const code: string | undefined = response.json?.code;
        const returnedId: string = response.json?.snippet_id ?? snippetId;
        if (!code) {
          const msg = 'Service returned empty code field';
          new Notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg} — check console.`);
          console.error('Forge: empty α response', response.json);
          return false;
        }
        await this.writeGeneratedCode({ [returnedId]: code });
        if (!errorPrefix) {
          new Notice(`Forge: ${returnedId} written.`);
        }
        return true;
      }

      // Non-2xx path. Map status + detail shape to the right
      // actionable Notice. The α service preserves the engine's
      // Anthropic-error translation: {error, retryable,
      // upstream_status, kind} for 502/503; FastAPI's {detail:str}
      // for everything else (including 401).
      const detail = response.json?.detail;
      const status = response.status;
      console.error('Forge α Generate Error:', { status, detail });
      const noticeText = this.formatAlphaErrorNotice(
        status, detail, settings.transpileServiceUrl, errorPrefix);
      new Notice(noticeText);
      return false;
    } catch (outer) {
      console.error('Forge: unexpected error in generate', outer);
      const detail = outer instanceof Error ? outer.message : String(outer);
      new Notice(errorPrefix ? `${errorPrefix}: ${detail}` : 'Forge: unexpected error — check console.');
      return false;
    } finally {
      modal.finish();
    }
  }

  // Format the user-facing Notice for a non-2xx α /generate response.
  // - 401: token-side problem (rejected by the service).
  // - 502/503 with retryable flag: Anthropic upstream — translate per
  //   the retryable hint (transient → try again; terminal → escalate).
  // - 500: server-side misconfiguration (e.g., FORGE_TRANSPILE_SECRET
  //   not set). Surface the detail string for the service operator.
  // - Anything else: include the status + raw detail for visibility.
  private formatAlphaErrorNotice(
    status: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detail: any,
    serviceUrl: string,
    errorPrefix?: string,
  ): string {
    const prefix = errorPrefix ?? 'Forge: Generation failed';
    if (status === 401) {
      return `${prefix}: Transpile token rejected — check Settings → Forge → Transpile token, or contact the service operator (${serviceUrl}) if you believe it should be valid.`;
    }
    if (detail && typeof detail === 'object' && 'retryable' in detail) {
      const { error, retryable, kind } = detail;
      const tail = retryable
        ? 'transient — try again in a moment.'
        : 'not retryable — paste the error to the service operator.';
      return `${prefix}: ${error ?? `Anthropic ${kind}`} (${tail})`;
    }
    if (typeof detail === 'string') {
      return `${prefix}: ${detail}`;
    }
    return `${prefix}: HTTP ${status} — check console.`;
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
      const newContent = replacePythonSection(content, code);
      await this.app.vault.modify(file, newContent);

      // v0.2.17: keep Pyodide's MEMFS-mounted user vault in sync with
      // this disk write. The v0.2.16 diagnostic confirmed compute reads
      // from the pre-init MEMFS snapshot — without this sync, the next
      // Forge-click runs the PRE-write Python (stale "hello", not the
      // just-written "hello1"). Non-fatal: if the host isn't wired yet,
      // log + continue; defensive fallback because writeGeneratedCode
      // ran on the HTTP path before v0.2.6 routed compute to Pyodide.
      try {
        const hostManager = getPyodideHost();
        if (hostManager) {
          const host = await hostManager.getInstance();
          await host.syncUserVaultFile(file.path, newContent);
        }
      } catch (e) {
        console.warn(`Forge: MEMFS sync after write failed for '${id}'`, e);
      }

      // v0.2.24: reconcile frontmatter `inputs:` with the Python
      // signature we just wrote. Pre-v0.2.24 the frontmatter stayed
      // empty (or stale) while compute() carried new params; the
      // modal worked via signature inference (v0.2.20) but the file
      // looked self-contradictory to a student reader. Best-effort:
      // failure is non-fatal — frontmatter drift is a readability
      // concern, not a correctness one. Order matters: MEMFS sync
      // (above) MUST run first so getInputNames sees the just-
      // written Python; reconcile runs SECOND so the frontmatter
      // catches up; dependency-sync (below) runs THIRD.
      try {
        await this.reconcileFrontmatterInputs(file, id);
      } catch (e) {
        console.warn(`Forge: frontmatter reconciliation failed for '${id}'`, e);
      }

      // After writing the new Python, ask the BE to sync the # Dependencies
      // section so the body reflects the just-written code (B7).
      try {
        await syncDependencies(this.settings.serverUrl, vaultPath, id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isNetRefusalError(msg)) {
          // Closed-beta typical path: no uvicorn → ECONNREFUSED on every
          // Forge-click. Log the explainer once per session at info
          // level so dev console doesn't bloom yellow stacks.
          if (!this.b7SyncSkippedLogged) {
            console.info(
              'Forge: dependency sync skipped — no local engine reachable at '
              + `${this.settings.serverUrl}. This is expected in closed-beta; `
              + 'dependency-section refresh is engine-side only.',
            );
            this.b7SyncSkippedLogged = true;
          }
        } else {
          // Non-network failure — keep the warn so real bugs surface.
          console.warn(`Forge: sync_dependencies failed for '${id}'`, e);
        }
      }
    }
  }

  /** v0.2.24: glue between writeGeneratedCode and the pure-core
   *  reconcileInputs helper. Routes the three obsidian-coupled
   *  operations (getInputNames via Pyodide host, read current
   *  frontmatter via metadataCache, write new frontmatter via
   *  processFrontMatter) through the structural adapter so the
   *  decision-logic stays testable without an obsidian shim. */
  private async reconcileFrontmatterInputs(file: TFile, snippetId: string): Promise<void> {
    await reconcileInputs(snippetId, {
      getInferredInputs: async (id) => {
        const hostManager = getPyodideHost();
        if (!hostManager) throw new Error('Pyodide host not wired');
        const host = await hostManager.getInstance();
        return host.getInputNames(id);
      },
      readCurrentInputs: () => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        return Array.isArray(fm?.inputs)
          ? (fm!.inputs as unknown[]).map(String)
          : [];
      },
      writeInputs: async (next) => {
        await this.app.fileManager.processFrontMatter(file, (fm: any) => {
          fm.inputs = next;
        });
      },
    });
  }

  private async syncEdgesForActive() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('No active snippet to sync.');
      return;
    }
    // v0.2.26: qualified snippet_id for library subdir files.
    const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
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

    // v0.2.26: derive a qualified snippet_id when the file lives
    // inside a library-vault subdir (forge-music/blues/song.md →
    // "forge-music/blues/song"). Pre-v0.2.26 used view.file.basename
    // which produced bare "song" for any subdir file — invisible to
    // the registry, which indexes library subdir snippets under
    // qualified bare IDs like `blues/song`.
    const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    const frontmatter = this.app.metadataCache.getFileCache(view.file)?.frontmatter;

    // v0.2.20: Python signature is the source of truth for which
    // params compute() actually needs. Ask the engine for the
    // signature-augmented input names; fall back to frontmatter-
    // only if Pyodide isn't ready yet (early-Forge-click edge case
    // before host warm-up).
    let inputs: string[];
    try {
      const hostManager = getPyodideHost();
      if (!hostManager) throw new Error('Pyodide host not wired');
      const host = await hostManager.getInstance();
      inputs = await host.getInputNames(snippetId);
    } catch (e) {
      console.warn(
        `Forge: signature-inferred inputs unavailable for '${snippetId}', falling back to frontmatter`,
        e,
      );
      // Local frontmatter is the source of truth when it exists.
      // When it doesn't (e.g., empty install.md stub over the
      // builtin), fall back to the inventory snapshot from /connect
      // so we still ask for the right inputs.
      inputs = frontmatter
        ? (frontmatter.inputs ?? [])
        : (this.lookupInventoryInputs(snippetId) ?? []);
    }

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
  // v0.2.82 Item B — per-session dedup of `.bak.*` open Notices. Keyed
  // by the bak dir's path (per bakDedupKey); opening multiple files
  // inside the same backup dir fires the Notice once.
  private _bakNoticeSeenSet = new Set<string>();

  private maybeNotifyBakOpen(file: TFile | null) {
    if (!file) return;
    const path = file.path;
    if (!isBakPath(path)) return;
    const key = bakDedupKey(path);
    if (!key || this._bakNoticeSeenSet.has(key)) return;
    this._bakNoticeSeenSet.add(key);
    // The bak dir's basename is the last segment of the dedup key.
    const bakDirName = key.split('/').pop() ?? key;
    const liveName = baseLibraryName(bakDirName);
    new Notice(
      `Forge: '${bakDirName}' is a backup of an older library version. ` +
      `The live version is at '${liveName}/'. Backups are read-only ` +
      `by convention; running Forge on them is not recommended.`,
      8000,
    );
  }

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
    // v0.2.10: Obsidian sometimes parks a DeferredView placeholder on
    // the leaf right after setViewState resolves — the real view's
    // onload() hasn't run yet, so `leaf.view as ForgeOutputView` is a
    // structural lie and method calls (`append`, `appendError`) 404.
    // Symptom: "TypeError: outputView.append is not a function" on
    // the success path of a fresh Forge-click that opens the panel
    // for the first time. The same bug bit the iframe relay path in
    // V1 Phase 2 (fixed there); the plugin's own getOutputView still
    // had the naive cast.
    //
    // Fix: confirm the cast holds before returning. Poll up to ~10
    // microtask ticks (≈50ms wall clock); in practice the view
    // resolves within 1-2 ticks. If the cast still fails after the
    // budget, fall back to a second setViewState — Obsidian will
    // construct a fresh ForgeOutputView synchronously the second
    // time around.
    const waitForRealView = async (leaf: WorkspaceLeaf): Promise<ForgeOutputView> => {
      for (let i = 0; i < 10; i++) {
        if (leaf.view instanceof ForgeOutputView) return leaf.view;
        await new Promise(r => setTimeout(r, 5));
      }
      // Last-ditch — re-fire setViewState. Obsidian's deferred-view
      // logic resolves on the second call in the small handful of
      // real-world cases that get here.
      await leaf.setViewState({ type: OUTPUT_VIEW_TYPE, active: true });
      if (leaf.view instanceof ForgeOutputView) return leaf.view;
      throw new Error('Forge: output view failed to materialize after retry');
    };

    const existing = this.app.workspace.getLeavesOfType(OUTPUT_VIEW_TYPE)[0];
    if (existing) {
      // v0.2.11: also reveal when the leaf already exists. Without
      // this, an existing output leaf parked in the right sidebar
      // (e.g., persisted from a prior session) stays offscreen if the
      // sidebar is collapsed or focus is on a different tab — the
      // append succeeds but the user sees nothing happen.
      // v0.2.12: expand the containing sidebar first if collapsed.
      // revealLeaf alone activates the tab but does NOT unfold a
      // collapsed WorkspaceSplit in some Obsidian versions — the
      // leaf stays offscreen and the user sees nothing happen.
      // Cast through {collapsed?, expand?} because Obsidian's public
      // WorkspaceItem type doesn't surface those, but WorkspaceSplit
      // (the actual runtime type for sidebar roots) has both. The
      // typeof check covers the case where the leaf's root isn't a
      // sidebar at all (user dragged it into the main rootSplit).
      const root = existing.getRoot() as unknown as { collapsed?: boolean; expand?: () => void };
      if (root?.collapsed && typeof root.expand === 'function') {
        root.expand();
      }
      this.app.workspace.revealLeaf(existing);
      return waitForRealView(existing);
    }

    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
    await leaf.setViewState({ type: OUTPUT_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    return waitForRealView(leaf);
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

    // v0.2.72 — B7.3 unified cache. Engine surfaces SlotCacheMissError
    // when a canonical snippet's {{ }} slot can't be resolved. Plugin
    // batches missing slots into one /resolve-slot call, makes a
    // SECOND computeSnippet call with the resolutions inline (engine
    // splices them into the transpile output), writes the resulting
    // `# Python` + `english_hash` to disk, and returns the compute
    // result directly to the caller — no retry needed.
    if (res.status === 409 && Array.isArray(res.json?.slot_cache_miss)) {
      const result = await this.handleSlotCacheMiss(
        snippetId, res.json.slot_cache_miss as SlotRequestPayload[],
        vaultPath, args, inputs, errorPrefix);
      if (result === null) {
        // handleSlotCacheMiss surfaced a Notice on failure; abort.
        return;
      }
      // Repackage result to match the standard res envelope shape so
      // downstream code (Output panel rendering, install metadata
      // refresh) consumes it uniformly.
      res = { status: 200, json: result };
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

  /** v0.2.72 — handle a slot-cache miss via the B7.3 unified-cache
   *  contract:
   *
   *  1. Batch missing slots into one `/resolve-slot` call.
   *  2. Make a SECOND `computeViaEngineWithPython` call with the
   *     resolutions inline. Engine returns transpiled Python + the
   *     compute result.
   *  3. Write the Python to the snippet's `# Python` heading and
   *     `english_hash` to frontmatter via vault.process (strips any
   *     stale `# Slots` heading from v0.2.70/v0.2.71 in the same
   *     write).
   *  4. Sync the new file content into Pyodide MEMFS so future
   *     compute calls see the populated cache.
   *  5. Return the compute result to the caller.
   *
   *  Returns the compute result envelope on success; null on
   *  failure (after surfacing a Notice).
   */
  private async handleSlotCacheMiss(
    snippetId: string,
    missing: SlotRequestPayload[],
    _vaultPath: string,
    args: unknown[],
    inputs: Record<string, unknown>,
    errorPrefix?: string,
  ): Promise<any | null> {
    console.log('Forge: slot cache miss', { snippetId, missingCount: missing.length });

    const snippetPath = `${snippetId}.md`;
    let file = this.app.vault.getAbstractFileByPath(snippetPath);
    if (!(file instanceof TFile)) {
      const bare = snippetId.split('/').pop() ?? snippetId;
      file = this.app.vault.getAbstractFileByPath(`${bare}.md`);
    }
    if (!(file instanceof TFile)) {
      const msg = `slot cache write skipped — could not locate ${snippetId}.md in vault`;
      console.error('Forge:', msg);
      new Notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
      return null;
    }

    // 1. Batch /resolve-slot.
    const requests: SlotRequestPayload[] = missing.map((m) => ({
      slot_text: m.slot_text,
      snippet_id: m.snippet_id ?? snippetId,
      surrounding_context: m.surrounding_context ?? '',
      domain_hints: [],
    }));
    let resolved;
    try {
      resolved = await resolveSlotsAlpha(
        this.settings.transpileServiceUrl,
        this.settings.transpileServiceToken,
        requests,
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error('Forge slot resolution call failed:', e);
      new Notice(errorPrefix
        ? `${errorPrefix}: slot resolution failed — ${detail}`
        : `Forge: slot resolution failed — ${detail}`);
      return null;
    }

    if (resolved.status === 0) {
      const msg = resolved.json?.detail ?? 'Slot resolution requires a transpile token.';
      new Notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
      return null;
    }
    if (resolved.status >= 400) {
      const detail = resolved.json?.detail;
      const errorMsg = (detail && typeof detail === 'object' && detail.error)
        ? detail.error
        : (typeof detail === 'string' ? detail : `HTTP ${resolved.status}`);
      console.error('Forge slot resolution non-2xx:', resolved.status, detail);
      new Notice(errorPrefix
        ? `${errorPrefix}: slot resolution failed — ${errorMsg}`
        : `Forge: slot resolution failed — ${errorMsg}`);
      return null;
    }

    const responses = resolved.json?.responses ?? [];
    if (!Array.isArray(responses) || responses.length !== requests.length) {
      const msg = `slot resolution returned ${responses?.length ?? 0} responses for ${requests.length} requests; bailing`;
      console.error('Forge:', msg);
      new Notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
      return null;
    }

    // Build slot_resolutions dict for the second compute call.
    const slotResolutions: Record<string, string> = {};
    for (const r of responses) {
      slotResolutions[r.cache_key] = r.python_expr;
    }

    // 2. Second compute call with slot_resolutions inline. Returns
    //    the transpiled Python + result + stdout.
    const pyodideHost = getPyodideHost();
    if (!pyodideHost) {
      const msg = 'Pyodide host not ready for slot-resolution second pass';
      console.error('Forge:', msg);
      new Notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
      return null;
    }
    let host;
    let computeOut;
    try {
      host = await pyodideHost.getInstance();
      computeOut = await host.computeViaEngineWithPython(
        snippetId, args, inputs, slotResolutions);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error('Forge: second-pass compute failed', e);
      new Notice(errorPrefix
        ? `${errorPrefix}: slot resolution second pass failed — ${detail}`
        : `Forge: slot resolution second pass failed — ${detail}`);
      return null;
    }

    const python = computeOut.python;
    if (!python) {
      const msg = 'second-pass compute returned no Python source; cache not written';
      console.warn('Forge:', msg);
      // The compute SUCCEEDED — return the result envelope. The cache
      // write is best-effort; missing it means the next compute will
      // re-hit the LLM, not a correctness bug.
      return {
        type: 'action',
        result: computeOut.result,
        stdout: computeOut.stdout,
      };
    }

    // 3. Read the English facet to compute english_hash, then write
    //    # Python + english_hash to the snippet body.
    let body: string;
    try {
      body = await this.app.vault.read(file);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.warn('Forge: failed to read snippet for cache write', e);
      // Still return the compute result; caller renders output.
      return {
        type: 'action',
        result: computeOut.result,
        stdout: computeOut.stdout,
      };
    }
    const english = _extractEnglishFromBody(body) ?? '';
    const englishHash = await computeEnglishHash(english);

    try {
      await this.app.vault.process(file, (content) =>
        writePythonAndEnglishHash(content, {
          pythonCode: python,
          englishHash,
          stripStaleSlots: true,  // migration cleanup for v0.2.70/v0.2.71
        }));
    } catch (e) {
      console.warn('Forge: # Python / english_hash write failed', e);
      // Best-effort — the result is in hand.
    }

    // 4. Sync MEMFS so the next compute sees the populated cache.
    try {
      await syncFileToMemfsAfterWrite(
        file.path,
        { readPath: (path) => {
          const f = this.app.vault.getAbstractFileByPath(path);
          if (!(f instanceof TFile)) {
            return Promise.reject(new Error(`not a TFile: ${path}`));
          }
          return this.app.vault.read(f);
        } },
        { syncFileToMemfs: (relPath, content) =>
          host.syncUserVaultFile(relPath, content) },
      );
    } catch (e) {
      console.warn('Forge: post-write MEMFS sync failed', e);
    }

    console.log('Forge: slot cache write succeeded', { snippetId, count: responses.length });

    // 5. Return the compute envelope to the caller.
    return {
      type: 'action',
      result: computeOut.result,
      stdout: computeOut.stdout,
    };
  }
}

/** v0.2.72 — extract the # English section content from a snippet
 *  body. Used by handleSlotCacheMiss to compute english_hash on the
 *  current English facet before writing # Python + hash. */
function _extractEnglishFromBody(body: string): string | null {
  const lines = body.split('\n');
  let collecting = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^#\s+english\s*$/i.test(line.trim())) {
      collecting = true;
      continue;
    }
    if (collecting) {
      if (/^#\s+\S/.test(line) || line.trim() === '---') break;
      out.push(line);
    }
  }
  return collecting ? out.join('\n').trim() : null;
}
