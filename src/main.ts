import { Plugin, Notice, MarkdownView, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import {
  isV2Shape,
  extractDescription,
  extractInputs,
  replaceRecipeSection,
  setFrontmatterField as setFmFieldV2,
  getFrontmatterField as getFmFieldV2,
  removeFrontmatterField as removeFmFieldV2,
} from './v2-note-core';
import { computeDescriptionHash } from './description-hash-core';
import { computeFacetHash, whichLayerIsCanonical } from './facet-hash-core';
import {
  extractPythonSection,
  replacePythonSection,
  extractRecipeSection,
} from './v2-note-core';
// v0.2.194 Path A — engineChipsForDomains import retired. The
// forge-transpile service introspects forge.<domain>.lib at /generate
// time via AST-walking vendored `engine_libs/*_lib.py` source files.
// Plugin sends ONLY vault notes; the service merges in engine chips.
// See forge-transpile/engine_chip_introspector.py.
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from './output-view';
import { ForgeThreeView, THREE_VIEW_TYPE } from './three-view';
import { ForgeEdgesView, EDGES_VIEW_TYPE } from './edges-view';
import { ForgeModaView, MODA_VIEW_TYPE } from './moda-view';
import { ChipsView, CHIPS_VIEW_TYPE, ChipsHost } from './chips-view';
import { ChipsManifest, loadChipsForActiveVault, isChipsFilePath } from './chips';
import { ChipPaletteGroup } from './chips-core';
// v0.2.121 — getFacetForm import removed; facet_form gate is gone.
// import { getFacetForm } from './facet-form-core';
import { routeActionCodeRegen, type RoutingDeps } from './route-action-code-regen-core';
import { decideModaDispatchOutcome } from './moda-dispatch-outcome-core';
import { decideStaleMainJsCheck } from './stale-main-js-check-core';
import {
  readExpandedState,
  writeExpandedState,
  toggleExpanded as togglePersistedBoth,
  toggleFrontmatter as togglePersistedFrontmatter,
  toggleDependencies as togglePersistedDependencies,
  type ExpandedState,
  type ExpandedStateStorage,
} from './expanded-state-core';
import { PLUGIN_VERSION_AT_BUILD } from './version-constant.generated';
import {
  decideForgeRouting,
  hasRoutingKeys,
  parseRoutingFrontmatter,
} from './forge-snippet-routing-core';
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
import type { AlphaGenerateRequest, AlphaDependencyInfo, SlotRequestPayload } from './server';
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
// v0.2.132: replaceOrInsertPythonHeading direct import retired —
// writeGeneratedCode now uses writePythonAndEnglishHash for unified
// english_hash stamping. replaceOrInsertPythonHeading still lives
// in python-cache-writer-core as an internal helper consumed by
// writePythonAndEnglishHash.
import { shouldShowChipsToolbarButton } from './chip-toolbar-button-core';
import { forgeButtonShouldShow } from './forge-button-gate-core';
import { isBakPath, bakDedupKey, baseLibraryName } from './bak-path-core';
import { makeFacetMutexViewPlugin, type FacetMutexHost } from './facet-mutex-view-plugin';
import { makeFrontmatterFoldViewPlugin, type FrontmatterFoldHost } from './frontmatter-fold-view-plugin';
import { slotHighlightViewPlugin } from './slot-highlight-view-plugin';
import { staleFacetViewPlugin } from './stale-facet-view-plugin';
import { ConfirmModal } from './confirm-modal';
import {
  canonicalLayerStatusLabel,
  canonicalLayerStatusTooltip,
} from './canonical-layer-status-bar-core';
import { makeDependenciesFoldExtension } from './dependencies-fold-view-plugin';
import { findDependenciesRange } from './dependencies-section-core';

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

// v0.2.102 — sha256Hex retired with locked_english_hash.
// english_hash (the v0.2.72 slot cache key) uses computeEnglishHash
// from english-hash-core, not this helper.

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
  /** v0.2.205 — Implicit locking Phase 2.5 §2.3 canonical-layer
   *  status bar item. Refreshed on active-leaf-change + file-open +
   *  vault.modify (active file only). Shows empty string when there's
   *  nothing meaningful to surface (non-V2 / synced). */
  private canonicalLayerStatusBarItem: HTMLElement | null = null;
  // Two-vault refactor (constitution A5.1): library-subdir discovery
  // resolves synchronously from Obsidian's in-memory file index on
  // every call — no cache. The earlier cached-set + vault.on('create')
  // shape missed library subdirs that landed via the engine's install
  // path (Python file writes don't reliably trigger Obsidian's vault
  // events before the user right-clicks). The synchronous index walk
  // is cheap and always fresh.

  async onload() {
    await this.loadSettings();

    // v0.2.131 — stale-main.js self-check. BRAT sometimes updates
    // manifest.json but fails to replace main.js, leaving cohort
    // users running old code that silently mismatches the version
    // they think they installed. Driver hit this exact mode on
    // v0.2.127 (manifest.json said 0.2.127 but main.js was pre-
    // v0.2.108 per the lingering "Action Shape" string). Compare
    // PLUGIN_VERSION_AT_BUILD (baked into main.js by
    // scripts/inline-plugin-version.mjs at build time) vs. the
    // on-disk manifest.json read here. Mismatch → Notice +
    // console.error with reinstall instructions. Plugin still
    // proceeds with onload — partial functionality is better
    // than nothing.
    try {
      const manifestJsonRaw = await this.app.vault.adapter.read(
        `${this.manifest.dir}/manifest.json`,
      );
      const manifestJson = JSON.parse(manifestJsonRaw);
      const check = decideStaleMainJsCheck(
        manifestJson?.version,
        PLUGIN_VERSION_AT_BUILD,
      );
      if (check.stale) {
        // 30-second Notice so the user can read the reinstall path.
        this.notice(check.noticeMessage, 30000);
        console.error(
          `Forge onload: stale main.js. manifestVersion=${check.manifestVersion}, mainJsVersion=${check.buildVersion}`,
        );
      }
    } catch (e) {
      // Per cc-prompt-queue.md HARD RULE #1 (v0.2.120).
      console.error('onload: stale-main-js self-check failed', e);
    }

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
    const pyodideHost = new PyodideHost(this.app, this.manifest.id, this.manifest.version);
    setPyodideHost(pyodideHost);
    setPyodideHostSingleton(pyodideHost);

    // v0.2.181 — Loud onload banner. Lets driver confirm at a glance
    // that BRAT's update actually took effect; cleanly separable from
    // any pyodide bootstrap state. Use console.warn so it shows up
    // yellow/highlighted in DevTools instead of mixing in with the
    // ~1000 routine console.log lines an Obsidian session generates.
    console.warn(
      `%c FORGE CLIENT v${this.manifest.version} LOADED `,
      'background: #4caf50; color: white; padding: 6px 10px; font-weight: bold; font-size: 13px;',
    );

    // v0.2.178 — surface the running plugin version in Obsidian's
    // bottom status bar. Cohort + driver shouldn't have to dig through
    // Settings → Community plugins to confirm which build is loaded
    // (especially after BRAT updates that don't show the version
    // anywhere else).
    // v0.2.179 — removed the click→Notice handler per driver: no
    // toast popups for version info. The status bar text + hover
    // tooltip already convey what cohort needs (id + minAppVersion
    // are settings-tab territory, not status-bar territory).
    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText(`Forge v${this.manifest.version}`);
    statusBarItem.title =
      `Forge Client v${this.manifest.version}\n`
      + `Plugin ID: ${this.manifest.id}\n`
      + `Min app version: ${this.manifest.minAppVersion}`;

    // v0.2.205 — Implicit locking Phase 2.5 §2.3: canonical-layer
    // status bar entry. Shows the active V2 note's canonical layer
    // ("Recipe canonical" / "Python canonical" / ...). Empty when:
    //   - no active markdown view
    //   - active file is V1 (not V2-shape)
    //   - active V2 file is `synced` (no hand-edits anywhere)
    // Click handler invokes the `forge-show-canonical-layer` command
    // for the verbose forgeOutput report.
    this.canonicalLayerStatusBarItem = this.addStatusBarItem();
    this.canonicalLayerStatusBarItem.setText('');
    this.canonicalLayerStatusBarItem.addClass('forge-canonical-layer-status');
    this.canonicalLayerStatusBarItem.addEventListener('click', () => {
      void this.showCanonicalLayer();
    });
    // Update on file-open + file-modify so the badge tracks the
    // active note's live state.
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
      void this.refreshCanonicalLayerStatusBar();
    }));
    this.registerEvent(this.app.workspace.on('file-open', () => {
      void this.refreshCanonicalLayerStatusBar();
    }));
    this.registerEvent(this.app.vault.on('modify', (file) => {
      // Debounce against active-file modifications only — saves on
      // unrelated files (autosave on another tab) shouldn't churn
      // the status bar.
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.file?.path === file.path) {
        void this.refreshCanonicalLayerStatusBar();
      }
    }));
    // Initial paint (file may already be open at plugin load).
    void this.refreshCanonicalLayerStatusBar();

    // v0.2.84 (replaces v0.2.83 polling) — register the facet-mutex
    // ViewPlugin once at onload. CM6 instantiates the plugin per
    // EditorView; per-view state lives on the plugin instance, the
    // ForgePlugin singleton only serves callbacks via FacetMutexHost.
    this.registerEditorExtension([
      makeFacetMutexViewPlugin(() => this.facetMutexHost()),
    ]);

    // v0.2.102 Item A — auto-fold YAML frontmatter on snippet
    // file-open so students see # English content first instead of
    // type/inputs/edit_mode noise. Gated on `type: action | data`
    // (plain notes unchanged).
    this.registerEditorExtension([
      makeFrontmatterFoldViewPlugin(() => this.frontmatterFoldHost()),
    ]);

    // v0.2.122 — source-mode hide of the `# Dependencies` section in
    // snippet files. CM6 line-decoration extension tags every line
    // inside the Dependencies section with `forge-deps-line`; CSS
    // in styles.css hides those lines when the editor's containerEl
    // has `.forge-snippet` (per v0.2.118 DOM-level tagging). The
    // existing v0.2.119 `forge-toggle-frontmatter` Cmd-P command
    // toggles `forge-expanded` which now reveals BOTH frontmatter
    // AND dependencies (single mental model per v0.2.122 §2.2 (a)).
    this.registerEditorExtension([
      makeDependenciesFoldExtension(),
    ]);

    // v0.2.202 — V2.1 Slot Phase 3: yellow-highlight unresolved
    // `{{...}}` slots inside the # Recipe section. Visual feedback
    // for LLM blanks — cohort sees what will resolve on the next
    // Forge-click. CSS lives in styles.css under
    // .forge-slot-unresolved. Per the prompt's CM6 HARD RULE, an
    // integration test against createIntegrationHarness covers the
    // class-application invariant.
    this.registerEditorExtension([
      slotHighlightViewPlugin,
    ]);

    // v0.2.205 — Implicit locking Phase 2.5 §2.1: CM6 stale-facet
    // visual indicator. Marks `# Description / # Recipe / # Python`
    // facet content with .forge-stale-facet (opacity 0.5 + italic)
    // when the facet's content doesn't match its stored hash. Cohort
    // sees at-a-glance which facets are out of sync.
    this.registerEditorExtension([
      staleFacetViewPlugin,
    ]);

    // v0.2.122 — Live Preview / Reading mode hide. Markdown post-
    // processor scans the rendered HTML for an `# Dependencies`
    // heading and wraps the heading + subsequent siblings (until
    // the next heading or container end) in a `<span class="forge-
    // deps-section">` so CSS can hide them.
    this.registerMarkdownPostProcessor((el) => {
      // Find the FIRST # Dependencies heading at any heading level.
      const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let depsHeading: Element | null = null;
      for (const h of Array.from(headings)) {
        if (h.textContent?.trim().toLowerCase() === 'dependencies') {
          depsHeading = h;
          break;
        }
      }
      if (!depsHeading) return;
      // Tag the heading itself.
      depsHeading.classList.add('forge-deps-section');
      // Walk forward through siblings, tagging each until the next
      // heading element (or end of container).
      let sibling: Element | null = depsHeading.nextElementSibling;
      while (sibling) {
        if (/^H[1-6]$/.test(sibling.tagName)) break;
        sibling.classList.add('forge-deps-section');
        sibling = sibling.nextElementSibling;
      }
    });
    // Touch findDependenciesRange so unused-import lint doesn't fire
    // when we depend on the pure-core export for tests but not
    // directly inside main.ts after this hookup.
    void findDependenciesRange;

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

    // v0.2.118 — frontmatter hide for Live Preview Properties widget.
    // v0.2.116's EditorView.editorAttributes facet puts `forge-snippet`
    // on `.cm-editor` (the CM6 root). But Obsidian's Properties widget
    // in Live Preview mode renders OUTSIDE the .cm-editor — it's a
    // sibling under the markdown view container. CSS targeting
    // `.forge-snippet .metadata-container` doesn't match because the
    // class is on a sibling, not an ancestor. Fix: also tag the
    // markdown view's containerEl with `.forge-snippet` on file-open
    // so CSS targeting `.markdown-source-view.forge-snippet .metadata-
    // container` resolves correctly.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => { this.tagSnippetViews(file); })
    );
    // Also tag on layout-change since opening a new pane or splitting
    // a view doesn't fire file-open for the new pane's existing file.
    this.registerEvent(
      this.app.workspace.on('layout-change', () => { this.tagSnippetViews(null); })
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
      this.notice(`'${bareTarget}' is a Python builtin — no Forge snippet to navigate to.`);
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
          console.error(`onload (modify handler): MEMFS sync on modify failed for '${file.path}'`, e);
        }
      }),
    );

    this.addSettingTab(new ForgeSettingTab(this.app, this));

    this.addCommand({
      id: 'forge-toggle-edges-panel',
      name: 'Toggle edges panel',
      callback: () => { this.toggleEdgesView(); },
    });

    // v0.2.119 — Cmd-P escape hatch for v0.2.118's frontmatter hide.
    // v0.2.122 — same toggle now ALSO reveals/hides the
    // `# Dependencies` section per §2.2 option (a) (single mental
    // model). The class flipped (`forge-expanded`) is shared by
    // both CSS rule groups in styles.css.
    this.addCommand({
      id: 'forge-toggle-frontmatter',
      name: 'Toggle frontmatter + dependencies visibility (active snippet)',
      callback: () => { this.toggleFrontmatterVisibility(); },
    });

    // v0.2.139 — granular per-section toggles per v0339 §2.2. Each
    // is independent + persistent. State persisted via the same
    // expanded-state-core (v0.2.138) the "both" toggle uses.
    this.addCommand({
      id: 'forge-toggle-frontmatter-only',
      name: 'Toggle frontmatter only (active snippet)',
      callback: () => { this.toggleFrontmatterOnly(); },
    });

    this.addCommand({
      id: 'forge-toggle-dependencies-only',
      name: 'Toggle dependencies only (active snippet)',
      callback: () => { this.toggleDependenciesOnly(); },
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
            this.notice(`Forge: ${view.file.basename} is in Python mode — switch to English mode to regenerate.`);
            return;
          }
        }
        this.generate();
      },
    });

    // v0.2.182 — V2 /generate Phase 2. New Cmd-P command that takes
    // the active V2 note's # Description, POSTs to the hosted service
    // with dialect="emm", and writes the returned Recipe into the
    // # Recipe section (creating it if absent). On success, computes +
    // stores `description_hash` in frontmatter so the editor's stale-
    // indicator check (deferred to Phase 3 per the prompt's SPLIT
    // GUIDANCE on §3.4) can detect Description edits later.
    this.addCommand({
      id: 'forge-generate-recipe-from-description',
      name: 'Forge: Generate Recipe from Description',
      callback: () => { this.generateEmmFromDescription(); },
    });

    // v0.2.196 — explicit lock commands retired. The implicit
    // 3-layer state machine (description / recipe / python +
    // facet-hash-core.whichLayerIsCanonical) supersedes them: a
    // hand-edited Recipe surfaces as "recipe canonical" via
    // recipe_hash mismatch, and /generate detects that via the same
    // mechanism. No frontmatter `lock:` field needed.

    this.addCommand({
      id: 'forge-toggle-python-visibility',
      name: 'Forge: Toggle Python visibility',
      callback: () => { this.togglePythonVisibility(); },
    });

    this.addCommand({
      id: 'forge-show-canonical-layer',
      name: 'Forge: Show canonical layer (which facet was last edited)',
      callback: () => { this.showCanonicalLayer(); },
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
            // v0.2.135 — basename audit (v0334 §1.2): safe-by-design.
            // This loop's PURPOSE is to find cross-domain basename
            // collisions so the multi-match menu can offer all
            // candidates. The engine handles disambiguation downstream.
            // The v0.2.104 unsafe-basename pattern doesn't apply here.
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
              this.notice(`Forge: ${verb}d ${caller} → ${targetCallee}`);
            } else if (res.status === 404) {
              this.notice(
                `Forge: no snapshot for ${caller} → ${targetCallee}. ` +
                `Forge-click ${caller} once to capture it.`,
              );
            } else {
              const detail = res.json?.detail ?? `HTTP ${res.status}`;
              this.notice(`Forge: ${verb} failed — ${detail}`);
            }
          } catch (e) {
            console.error(`Forge ${verb} error:`, e);
            this.notice(`Forge: ${verb} failed — check console.`);
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
      this.notice(welcomeMessage(hasToken), 10000);
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

  // v0.2.102 — markDriftAsync removed alongside locked_english_hash.
  // The drift indicator (toolbar button .is-drifted state) was already
  // dead code (no callers since the v0.2.79 ribbon button removal);
  // removing the body avoids confusion and the sha256Hex helper.

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
      this.notice('No active note.');
      return;
    }
    await this.toggleEditModeForFile(view.file);
  }

  private async toggleEditModeForFile(file: TFile) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'action') {
      this.notice('Edit mode is only meaningful for action snippets.');
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

  /** v0.2.102 — host adapter for the frontmatter-fold ViewPlugin.
   *  Returns the active snippet file (action/data) for fold-eligibility;
   *  null otherwise. Plain notes pass-through. */
  private frontmatterFoldHost(): FrontmatterFoldHost {
    return {
      app: this.app,
      getActiveSnippetForFold: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return null;
        const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter;
        const t = typeof fm?.type === 'string' ? fm.type : undefined;
        if (t !== 'action' && t !== 'data') return null;
        return { file: view.file };
      },
    };
  }

  public async setEditModeForFile(
    file: TFile, newMode: 'english' | 'python',
  ): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'action') {
      this.notice('Edit mode is only meaningful for action snippets.');
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
        delete fm.locked;                  // legacy alias — clean up while we're here
        delete fm.locked_english_hash;     // v0.2.102: retired field; clean up old vaults
        delete fm.english_hash;            // v0.2.90: invalidate cache on transition to english
      });
      this.notice(`Forge: ${file.basename} → English mode`);
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
      this.notice(
        `Forge: '${file.basename}' has no Python facet (slot-free ` +
        `canonical). Add slots and Forge-run to generate one, or ` +
        `stay in English mode.`,
        8000,
      );
      return;
    }

    // v0.2.102 — locked_english_hash retired. v0.2.90's cache
    // invalidation (delete english_hash on transition to english)
    // substitutes for drift detection: next Forge-click re-transpiles
    // and overwrites Python, so an in-place Python edit is preserved
    // until the user toggles back to english + Forges. We previously
    // wrote a snapshot here for a defunct drift ribbon button (v0.2.79
    // removed); the field is dead weight now.
    await this.app.fileManager.processFrontMatter(file, (fm: any) => {
      fm.edit_mode = 'python';
      delete fm.locked;                  // migrate off the legacy field
      delete fm.locked_english_hash;     // retired field; clean up
    });
    this.notice(`Forge: ${file.basename} → Python mode`);
    // v0.2.9: discoverability nudge. The unlock affordances (toolbar
    // pencil, Cmd+P entry, right-click) were too easy to miss in
    // closed-beta smoke. Fire a longer explainer Notice the first
    // time the user enters Python mode this session.
    if (!this.pythonModeNoticeShown) {
      this.notice(
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
  // Cmd+Z is the safety net. v0.2.102 — no longer re-snapshots
  // locked_english_hash (retired field).
  private async syncEnglishFromPython(target?: TFile) {
    const file = target ?? this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    if (!file) {
      this.notice('No active note for sync.');
      return;
    }
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== 'action') {
      this.notice('Sync English ← Python is only for action snippets.');
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
      this.notice('Forge: canonicalize failed — check console.');
      modal.finish();
      return;
    } finally {
      modal.finish();
    }

    if (response.status !== 200 || typeof response.json?.english !== 'string') {
      const detail = response.json?.detail ?? `HTTP ${response.status}`;
      this.notice(`Forge: canonicalize failed — ${detail}`);
      console.error('Forge canonicalize:', response);
      return;
    }
    const newEnglish = response.json.english as string;

    // v0.2.102 — write the new English in a single atomic vault.process
    // call. Previously also re-snapshotted locked_english_hash in the
    // same write to clear the drift indicator atomically; the field is
    // retired (drift detection via english_hash invalidation since
    // v0.2.90), so this is just the body update now.
    let writtenContent: string | null = null;
    try {
      await this.app.vault.process(file, (content) => {
        const updated = replaceEnglishSection(content, newEnglish);
        writtenContent = updated;
        return updated;
      });
    } catch (e) {
      console.error('Forge canonicalize: write failed', e);
      this.notice('Forge: canonicalize wrote the model output but the file write failed — check console.');
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

    this.notice(`Forge: synced English ← Python on ${snippetId}`);
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
      console.error('sanitizePythonTabs: write failed', e);
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
      console.error('createNewSnippet: connect failed before opening New Snippet modal; falling back to default content_types', e);
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
      console.error('loadActiveDomains: could not read forge.toml domains; registering all commands', e);
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
      this.notice(`Forge: ${file.basename} reset — library version now active.`);
    } catch (e) {
      console.error('Forge: reset failed', e);
      this.notice(`Forge: reset of ${file.basename} failed — check console.`);
    }
  }

  private async customizeFromLibrary(file: TFile) {
    const targetPath = file.name;  // basename → vault root
    if (this.app.vault.getAbstractFileByPath(targetPath)) {
      this.notice(`Forge: ${targetPath} already exists at vault root.`);
      return;
    }
    try {
      const body = await this.app.vault.read(file);
      const created = await this.app.vault.create(targetPath, body);
      this.notice(`Forge: customized ${targetPath} — edit at vault root; ` +
        `your copy shadows the library version.`);
      // Open the new file so the user immediately lands on their copy.
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(created as TFile);
    } catch (e) {
      console.error('Forge: customize failed', e);
      this.notice(`Forge: customize of ${file.basename} failed — check console.`);
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

  /** v0.2.92 — is the file the moda *featured* snippet, i.e. the
   *  entry point that should auto-open the simulation tab on
   *  Forge-click? v0.2.92 originally matched any path under
   *  forge-moda/ which was too greedy: Forge-clicking a LEAF moda
   *  snippet (create_ink_particles, set_ink_speed, etc.) for
   *  authoring would dispatch the iframe-open path instead of
   *  /generate, silently dropping every English→Python regen for
   *  leaf snippets. Cohort smoke (Tamar) on
   *  forge-moda/create_ink_particles after v0.2.105's diagnostic
   *  build surfaced this: NO `[forge-gen]` logs at all because
   *  forgeSnippet's moda branch returned before /generate.
   *
   *  v0.2.106 — narrow to `featured: true` in frontmatter so only
   *  the simulation entry point triggers the auto-open behavior.
   *  Leaf moda snippets fall through to the normal /generate path.
   */
  private isModaFeaturedSnippet(file: TFile): boolean {
    if (!file.path.startsWith('forge-moda/')) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return fm?.featured === true;
  }

  /** v0.2.123 — defensive frontmatter read for the forgeSnippet
   *  routing decision. If `cachedFm` (from metadataCache) already
   *  has the routing-critical fields (`featured` / `edit_mode`),
   *  use it as-is. Otherwise read the file from disk and parse
   *  the YAML inline.
   *
   *  Driver smoke against v0.2.122 surfaced the demotion: Forge-
   *  click on forge-moda/simulation.md fell to the english-mode
   *  branch because `app.metadataCache.getFileCache(file)?.
   *  frontmatter` returned undefined OR had `featured` absent at
   *  click-time. Likely cause: the just-opened file's
   *  metadataCache hadn't populated yet, OR a recent BRAT reload
   *  wiped the in-memory cache. Either way, this fallback reads
   *  the file directly so the routing always has authoritative
   *  data. Performance cost: one vault.read() per Forge-click —
   *  negligible vs. the user-facing routing correctness.
   *
   *  Parses only the routing-critical fields. Doesn't try to be a
   *  full YAML parser; we only need `featured: true|false` and
   *  `edit_mode: english|python`. */
  private async readFrontmatterForRouting(
    file: TFile,
    cachedFm: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown> | null> {
    // Fast path: cache has at least one routing-relevant key
    // (`featured` or `edit_mode`). Use cachedFm as-is.
    //
    // v0.2.125: the v0.2.124 fast-path check (`if (cachedFm)`) was
    // too permissive — a stale-but-non-null cache missing both
    // routing keys would short-circuit the disk fallback and the
    // routing decision would silently use the stale data. Closing
    // that gap per the forge-core v0124 review (the simulation
    // regression's prime suspect if the v0.2.124 null-cache
    // fallback wasn't sufficient).
    //
    // The genuinely-no-routing-keys case (an authoring snippet
    // with neither `featured` nor `edit_mode` in frontmatter)
    // falls through to the disk read. Cost: one vault.read per
    // such Forge-click — negligible — and the result is the same
    // routing decision (`english-mode`) the cache would have
    // produced. Correctness wins.
    //
    // Fast-path guard + inline YAML parse extracted to pure-core
    // (`forge-snippet-routing-core.ts`) so the structural logic
    // is testable without an Obsidian-shim build of the CM6
    // integration harness.
    if (hasRoutingKeys(cachedFm)) {
      return cachedFm as Record<string, unknown>;
    }
    // Slow path: read disk + inline-parse routing fields.
    try {
      const body = await this.app.vault.read(file);
      return parseRoutingFrontmatter(body);
    } catch (e) {
      // v0.2.125: per cc-prompt-queue.md HARD RULE #1 (v0.2.120),
      // caught runtime errors MUST use console.error with the
      // originating method name. Was console.warn pre-v0.2.125.
      console.error('readFrontmatterForRouting: vault.read failed', e);
      return null;
    }
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
      this.notice('No MoDa view open — open one first (Forge: Open MoDa simulation).');
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
          this.notice(`Forge: ${verb}d ${caller} → ${callee}`);
        } else if (res.status === 404) {
          this.notice(`Forge: no snapshot for ${caller} → ${callee}. Run the edge first.`);
        } else {
          const detail = res.json?.detail ?? `HTTP ${res.status}`;
          this.notice(`Forge: ${verb} failed — ${detail}`);
        }
      } catch (e) {
        console.error(`Forge ${verb} error:`, e);
        this.notice(`Forge: ${verb} failed — check console.`);
      }
    }).open();
  }

  // The merged toolbar button: generate, then (on success) run.
  // Snippets in Python edit-mode skip the generate leg and run cached
  // python directly — same shape as the Phase-5 locked path.
  private async forgeSnippet() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      this.notice('No active note to forge.');
      return;
    }
    const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter;

    // v0.2.102 — pre-flight disk→MEMFS sync at the TOP of forgeSnippet,
    // before any branch dispatch. Mirrors the v0.2.19 sync that was
    // wrapped inside generate() for the LLM path; the canonical, python,
    // and moda branches all bypassed it, so any Forge-click within
    // ~100ms of an English edit raced the vault.on('modify') handler
    // and the engine read the PRE-edit MEMFS content. Cohort smoke
    // (Tamar) on hello_world after the v0.2.101 canonical write-back
    // fix: "works, but only if I wait 0.5-2 seconds before clicking
    // Forge, otherwise need to Forge twice." Pulling the sync up here
    // makes the active file's fresh disk content visible to every
    // downstream branch without each branch having to remember.
    try {
      const hostManager = getPyodideHost();
      if (hostManager) {
        const host = await hostManager.getInstance();
        const freshContent = await this.app.vault.read(view.file);
        await host.syncUserVaultFile(view.file.path, freshContent);
      }
    } catch (e) {
      console.error('forgeSnippet: pre-flight disk→MEMFS sync failed', e);
    }

    // v0.2.123 — routing dispatch via pure-core decideForgeRouting.
    // Precedence: python-mode > moda > english-mode. metadataCache
    // may return null frontmatter when the file was just opened or
    // BRAT just reloaded the plugin; fall back to a direct disk
    // read + inline YAML parse so the routing doesn't silently
    // demote a moda featured snippet to the english-mode branch.
    // Cohort smoke (driver, 2026-06-10) on v0.2.122 surfaced the
    // demote: Forge-click on forge-moda/simulation.md fired
    // run_snippet('simulation') instead of opening the moda
    // simulator tab — symptom of metadataCache.featured being
    // undefined at click time.
    const fmForRouting = await this.readFrontmatterForRouting(
      view.file, fm,
    );
    const routing = decideForgeRouting(view.file.path, fmForRouting);
    if (routing.kind === 'moda') {
      await this.dispatchModaBranch(view);
      return;
    }

    if (routing.kind === 'python-mode') {
      // The server log won't show a "skipped (edit_mode=python)" line
      // because we don't call /generate at all in this branch — the
      // server-side guard is defense-in-depth, not the primary signal.
      // Log here so devs have explicit confirmation in the browser
      // console alongside the existing Notice.
      console.log(`Forge: skipping /generate, ${view.file.basename} is in Python mode`);
      this.notice(`Forge: ${view.file.basename} is in Python mode — running as-is (switch to English mode to regenerate).`);
      await this.runSnippet('Forge failed during execution');
      return;
    }

    // v0.2.201 — Phase 2 implicit locking §3.1: canonical-aware
    // routing for V2 notes. Pre-flight: if the note is V2-shape, probe
    // the canonical layer via the 3-layer hash state machine and
    // branch:
    //
    //   - 'python'      → hand-edited Python facet; run it DIRECTLY
    //                     without re-transpile. This is Path Y closure
    //                     for V2 — replaces the V1 `edit_mode: python`
    //                     workaround. Pre-Phase-2 the standard
    //                     transpile path always overwrote # Python on
    //                     Forge-click, silently destroying cohort
    //                     hand-edits. Driver acknowledged this gap in
    //                     the Phase 1 drain and chose Path Y.
    //   - 'description' → Description was hand-edited; Recipe is stale.
    //                     Abort with a notice pointing at /generate.
    //                     Re-transpiling stale Recipe would produce
    //                     stale Python — worse than failing fast.
    //   - 'recipe' or 'synced' → fall through to standard transpile
    //     path (Recipe → Python via routeActionCodeRegen).
    //
    // V1 notes (not V2-shape) skip this branch and inherit the legacy
    // transpile behavior — Path Y for V1 already exists via the
    // `edit_mode: python` frontmatter (python-mode routing above).
    const v2Body = await this.app.vault.read(view.file);
    if (isV2Shape(v2Body)) {
      let canonicalLayer: 'description' | 'recipe' | 'python' | 'synced' | null = null;
      try {
        canonicalLayer = await whichLayerIsCanonical(v2Body, {
          extractDescription,
          extractRecipeSection,
          extractPythonSection,
          getFrontmatterField: getFmFieldV2,
        });
      } catch (e) {
        console.error('forgeSnippet: canonical-layer probe failed', e);
        // Fall through to standard transpile path if the probe itself
        // throws — preserves pre-Phase-2 behavior on hash-helper bugs.
      }
      if (canonicalLayer === 'python') {
        console.log(
          `Forge: ${view.file.basename} is Python-canonical (V2 implicit lock) — running # Python directly without re-transpile`,
        );
        this.notice(
          `Forge: ${view.file.basename} → Python-canonical (hand-edited). Running as-is; no /generate, no transpile.`,
        );
        await this.runSnippet('Forge failed during execution');
        return;
      }
      if (canonicalLayer === 'description') {
        console.log(
          `Forge: ${view.file.basename} is Description-canonical (V2 implicit lock) — Recipe is stale; aborting Forge-click`,
        );
        await this.forgeOutput(
          `Forge: ${view.file.basename} → Description-canonical (hand-edited since last /generate). `
          + `Re-running Forge would transpile stale Recipe. Run "Forge: Generate Recipe from Description" first.`,
          'error',
        );
        return;
      }
      // 'recipe', 'synced', or null (probe failed): standard transpile
      // path. Logged so devs can correlate browser console with which
      // branch fired.
      console.log(
        `Forge: ${view.file.basename} V2 canonical = ${canonicalLayer ?? 'unknown'} → standard transpile path`,
      );
    }

    // v0.2.121 — Option C plugin-side routing. facet_form gate
    // removed; the engine's resolve_action_code always attempts E--
    // transpile and returns null on failure (free-text English).
    // Use routeActionCodeRegen to orchestrate: try E-- via the engine,
    // fall back to /generate (LLM) when E-- can't compile.
    void fm;
    const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
    const regenResult = await routeActionCodeRegen(snippetId, this.routingDeps());
    if (!regenResult.ok) {
      this.notice(`Forge: ${regenResult.message}`);
      return;
    }
    if (regenResult.via === 'e--') {
      // E-- succeeded → write back to # Python facet (matches the
      // v0.2.101 canonical write-back UX).
      try {
        await this.writeCanonicalPythonBack(view.file);
      } catch (e) {
        // v0.2.129 — per cc-prompt-queue.md HARD RULE #1 (v0.2.120),
        // caught runtime errors → console.error with originating
        // method name. Was console.warn pre-v0.2.129.
        console.error('forgeSnippet (english-mode): writeCanonicalPythonBack failed', e);
      }
    }
    await this.runSnippet('Forge failed during execution');
  }

  /** v0.2.126 — shared dependencies for routeActionCodeRegen. Both
   *  the english-mode branch (forgeSnippet) and the moda branch
   *  (dispatchModaBranch) regen English → Python via the same
   *  routing — DRY the deps construction. */
  private routingDeps(): RoutingDeps {
    return {
      resolveActionCode: async (id) => {
        const hostManager = getPyodideHost();
        if (!hostManager) return null;
        const host = await hostManager.getInstance();
        try {
          const code = await host.resolveActionCode(id);
          return code && code.trim().length > 0 ? code : null;
        } catch {
          return null;  // E-- couldn't compile; route to /generate
        }
      },
      hasToken: !!this.settings.transpileServiceToken,
      generate: async (_id) => {
        const ok = await this.generate('Forge failed during generation');
        if (!ok) throw new Error('generate failed');
        // generate() writes the new Python to disk + MEMFS via
        // writeGeneratedCode; subsequent runSnippet picks it up.
        // Return a sentinel; routing result.code is unused for the
        // /generate branch since the write already happened.
        return '<generate-write-completed>';
      },
    };
  }

  /** v0.2.126 — moda branch dispatch. Re-transpile English → Python
   *  BEFORE opening the iframe so the iframe's compute reads fresh
   *  Python. Fixes the v0.2.124 cohort regression where editing
   *  # English on a featured moda snippet (e.g. simulation.md) and
   *  Forge-clicking opened the simulator but ran the OLD cached
   *  Python — engine's resolve_action_code returned cached Python
   *  because canonical moda snippets have no english_hash in
   *  frontmatter (legacy preservation per B7.3).
   *
   *  Decision shape extracted to pure-core
   *  (`moda-dispatch-outcome-core.ts`). Ordering: regen FIRST
   *  (option (a) per v0326 §2.3) — correctness over perceived
   *  responsiveness. ~100-500ms additional wall-clock vs. the
   *  v0.2.124 immediate-open. */
  private async dispatchModaBranch(view: MarkdownView): Promise<void> {
    if (!view.file) return;
    const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
    // v0.2.128 — moda branch passes `force: true` to bypass the
    // engine's legacy `stored_hash is None → return cached` rule
    // that fires on canonical moda snippets without english_hash
    // in cohort state. Confirmed root cause of the v0.2.124-127
    // simulation regression (v0327 H2). Force flag retires when
    // forge-moda content backfill writes english_hash on every
    // snippet OR when V2's `source` field replaces this contract.
    const deps: RoutingDeps = {
      ...this.routingDeps(),
      resolveActionCode: async (id: string) => {
        const hostManager = getPyodideHost();
        if (!hostManager) return null;
        const host = await hostManager.getInstance();
        try {
          const code = await host.resolveActionCode(id, { force: true });
          return code && code.trim().length > 0 ? code : null;
        } catch {
          return null;
        }
      },
    };
    const regenResult = await routeActionCodeRegen(snippetId, deps);
    const outcome = decideModaDispatchOutcome(regenResult);
    if (outcome.kind === 'write-and-open') {
      try {
        await this.writeCanonicalPythonBack(view.file);
      } catch (e) {
        // Per cc-prompt-queue.md HARD RULE #1 (v0.2.120): caught
        // runtime errors → console.error with method name.
        console.error('dispatchModaBranch: writeCanonicalPythonBack failed', e);
      }
    } else if (outcome.kind === 'notice-and-open') {
      this.notice(outcome.notice, 5000);
    }
    // 'open' kind: /generate already wrote Python; nothing to do here.
    await this.openModaView();
    const leaf = this.app.workspace.getLeavesOfType(MODA_VIEW_TYPE)[0];
    if (leaf?.view instanceof ForgeModaView) {
      leaf.view.requestFeaturedRun();
    }
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
  /** v0.2.182 — V2 /generate handler.
   *  - Reads active V2-shape note's body.
   *  - Validates V2 shape + lock state.
   *  - Extracts Description + Inputs.
   *  - Walks vault for action-note descriptions → deps payload.
   *  - POSTs to hosted service with dialect="emm".
   *  - Writes returned Recipe into the # Recipe section.
   *  - Computes + stores description_hash in frontmatter.
   *
   *  Stale-indicator UI is a Phase 3 follow-up per the prompt's
   *  §8 SPLIT GUIDANCE. */
  private async generateEmmFromDescription(): Promise<void> {
    // v0.2.184 — instrument every step with console.warn so the next
    // smoke can pinpoint exactly which step is silently failing.
    console.warn('[Forge V2 /generate] command invoked');

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      console.warn('[Forge V2 /generate] no active markdown view → bailing');
      await this.forgeOutput('Forge V2 /generate: no active note. Open a markdown file first.', 'error');
      return;
    }
    const file = view.file;
    console.warn('[Forge V2 /generate] active file:', file.path);

    const body = await this.app.vault.read(file);
    console.warn('[Forge V2 /generate] body length:', body.length);

    if (!/^# Description\s*$/m.test(body)) {
      console.warn('[Forge V2 /generate] no # Description heading → bailing');
      await this.forgeOutput(
        'Forge V2 /generate: this note has no # Description heading. '
        + 'Add `# Description` with prose, then re-run /generate. '
        + 'For V1 notes, use "Generate only".',
        'error',
      );
      return;
    }

    // v0.2.205 — Implicit locking Phase 2.5 §2.2: confirmation modal.
    // The pre-Phase-2.5 forgeOutput notice was easy to miss; a modal
    // blocks the destructive overwrite until cohort explicitly opts
    // in. Skipped when canonical is `synced` or `description` (no
    // hand-edits to overwrite) — the no-op case shouldn't pester.
    try {
      const canonical = await whichLayerIsCanonical(body, {
        extractDescription,
        extractRecipeSection,
        extractPythonSection,
        getFrontmatterField: getFmFieldV2,
      });
      console.warn('[Forge V2 /generate] canonical layer:', canonical);
      if (canonical === 'recipe' || canonical === 'python') {
        const facetLabel = canonical === 'recipe' ? 'Recipe' : 'Python';
        const pythonNote = canonical === 'python'
          ? 'Your Python edits will ALSO be regenerated on the next Forge-click.'
          : '';
        const ok = await new ConfirmModal(this.app, {
          title: `${facetLabel} was hand-edited`,
          message:
            `Running /generate will overwrite the # Recipe section with a fresh `
            + `LLM transpile of the current # Description. ${pythonNote} `
            + `\n\nContinue and overwrite, or cancel and keep the hand-edits?`,
          confirmText: 'Overwrite',
          cancelText: 'Keep edits',
        }).openAndWait();
        if (!ok) {
          await this.forgeOutput(
            `Forge V2 /generate: cancelled — ${facetLabel} hand-edits preserved.`,
            'info',
          );
          return;
        }
      }
    } catch (e) {
      console.error('forge-generate: canonical-layer probe failed', e);
    }

    const settings = this.settings;
    if (!settings.transpileServiceToken) {
      console.warn('[Forge V2 /generate] no transpile token configured');
      await this.forgeOutput(
        'Forge V2 /generate: set your transpile token in Settings → Forge → Transpile token '
        + 'before using /generate.',
        'error',
      );
      return;
    }

    const description = extractDescription(body);
    console.warn('[Forge V2 /generate] description length:', description.length, '; first 80 chars:', description.slice(0, 80));
    if (!description.trim()) {
      await this.forgeOutput('Forge V2 /generate: # Description is empty — nothing to generate from.', 'error');
      return;
    }
    const inputs = extractInputs(body).map((d) => d.name);
    console.warn('[Forge V2 /generate] inputs:', inputs);
    const vaultDeps = await this.gatherVaultActionNoteDescriptions();
    const activeDomainsList =
      this.activeDomains === null ? null : Array.from(this.activeDomains);
    // v0.2.194 Path A — engine chips no longer merged plugin-side.
    // The forge-transpile service introspects forge.<domain>.lib at
    // /generate time and augments the deps payload server-side. This
    // unifies the catalog to a single source of truth (vendored
    // engine_libs/<domain>_lib.py source files in the service) and
    // retires src/v2-engine-chips.ts. Adding a new engine chip = engine
    // release + service redeploy; no plugin update needed.
    const deps = vaultDeps;
    console.warn(
      `[Forge V2 /generate] deps count: ${deps.length} (vault only — engine chips added server-side)`
    );
    const snippetId = snippetIdFromPath(file.path, this.libraryDirNames());
    console.warn('[Forge V2 /generate] snippetId:', snippetId);

    const payload: AlphaGenerateRequest = {
      snippet_id: snippetId,
      description,
      english: '',
      inputs,
      generation_notes: '',
      deps,
      active_domains: activeDomainsList,
      dialect: 'recipe',
    };

    await this.forgeOutput(`Forge V2 /generate: invoking service for "${file.basename}"…`, 'info', snippetId);
    console.warn('[Forge V2 /generate] POST to', settings.transpileServiceUrl + '/generate');

    let response;
    try {
      response = await generateSnippetAlpha(
        settings.transpileServiceUrl,
        settings.transpileServiceToken,
        payload,
      );
    } catch (e) {
      console.error('[Forge V2 /generate] transport error:', e);
      const detail = e instanceof Error ? e.message : String(e);
      await this.forgeOutput(`Forge V2 /generate: could not reach transpile service — ${detail}`, 'error', snippetId);
      return;
    }

    console.warn('[Forge V2 /generate] response status:', response.status);
    if (response.status !== 200) {
      console.error('[Forge V2 /generate] non-200:', response.status, response.json);
      const detail = response.json?.detail;
      const detailText = typeof detail === 'string'
        ? detail
        : JSON.stringify(detail);
      await this.forgeOutput(
        `Forge V2 /generate failed (HTTP ${response.status}): ${detailText}`,
        'error',
        snippetId,
      );
      return;
    }

    const code: string | undefined = response.json?.code;
    if (!code) {
      console.error('[Forge V2 /generate] empty code field:', response.json);
      await this.forgeOutput('Forge V2 /generate: service returned empty code field.', 'error', snippetId);
      return;
    }
    console.warn('[Forge V2 /generate] received code length:', code.length, '; first 120 chars:', code.slice(0, 120));

    // Write the E-- into the note + stamp description_hash AND
    // recipe_hash. v0.2.196 (implicit-locking 3-layer state machine):
    // recipe_hash captures the freshly-generated Recipe so subsequent
    // hand-edits to the Recipe facet surface as "recipe canonical" via
    // hash mismatch. Without stamping here, every newly /generated
    // note would read as recipe-canonical on the next click. Python
    // facet hash is stamped separately by writeCanonicalPythonBack
    // after Forge-click compiles it.
    const withEmm = replaceRecipeSection(body, code);
    const descHash = await computeDescriptionHash(description);
    const recipeHash = await computeFacetHash(code);
    const withDesc = setFmFieldV2(withEmm, 'description_hash', descHash);
    const withHash = setFmFieldV2(withDesc, 'recipe_hash', recipeHash);

    await this.app.vault.modify(file, withHash);
    console.warn('[Forge V2 /generate] file written; description_hash:', descHash, 'recipe_hash:', recipeHash);
    await this.forgeOutput(
      `Forge V2 /generate: E-- generated for ${file.basename}. Review + Forge-click to test.`,
      'success',
      snippetId,
    );
  }

  /** v0.2.182 — Walk the vault for `type: action` notes; extract each
   *  one's Description + Inputs for the /generate deps payload. The
   *  hosted service uses this to populate the few-shot Available-chips
   *  list in the system prompt so the LLM picks correct `[[name]]`
   *  references in its output.
   *
   *  v2.0 includes every action note in the vault. v2.1 will add
   *  RAG-style relevance filtering per spec §12.6 — defer.
   *
   *  Notes without a # Description (V1 vault notes) contribute an
   *  empty description string but their snippet_id + Inputs still
   *  reach the prompt, giving the LLM the callable surface.
   */
  private async gatherVaultActionNoteDescriptions(): Promise<AlphaDependencyInfo[]> {
    const out: AlphaDependencyInfo[] = [];
    const libraryDirs = this.libraryDirNames();
    const files = this.app.vault.getMarkdownFiles();
    for (const f of files) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.type !== 'action') continue;
      let body: string;
      try {
        body = await this.app.vault.read(f);
      } catch {
        continue;
      }
      const desc = extractDescription(body).trim();
      const inputs = extractInputs(body).map((d) => d.name);
      const id = snippetIdFromPath(f.path, libraryDirs);
      out.push({ snippet_id: id, description: desc, inputs });
    }
    return out;
  }

  /** v0.2.196 — Toggle the visibility of a V2 note's `# Python` facet.
   *
   *  This drain ships a body-level toggle (materialize/strip the
   *  section) rather than CSS-class gating (deferred to Phase 2 because
   *  it requires a CM6 ViewPlugin per HARD RULE). When the toggle is
   *  ON, transpile the current Recipe → Python and append a fenced
   *  `# Python` section; when OFF, excise the section entirely.
   *
   *  Editing the Python section while visible triggers a python_hash
   *  mismatch → `whichLayerIsCanonical === 'python'` → /generate +
   *  Forge-click surface that the Description + Recipe are stale.
   */
  private async togglePythonVisibility(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      this.notice('Forge: no active note to toggle Python visibility on.');
      return;
    }
    const body = await this.app.vault.read(view.file);
    const existingPython = extractPythonSection(body);
    if (existingPython !== null) {
      // Currently visible → excise. Don't lose the python_hash stamp
      // (the user may toggle back on later and expect the canonical
      // state machine to recognize the previously stamped baseline).
      const out = replacePythonSection(body, null);
      await this.app.vault.modify(view.file, out);
      this.notice(
        `Forge: ${view.file.basename} → Python facet hidden. Toggle again to show.`);
      return;
    }
    // Currently hidden → materialize. Compile from the current Recipe
    // via the same resolveActionCode the Forge-click path uses; if
    // it fails (e.g. Recipe syntax error), surface the error in the
    // output panel.
    const hostManager = getPyodideHost();
    if (!hostManager) {
      await this.forgeOutput(
        'Forge: Pyodide host unavailable — open the engine view first to initialize the runtime.',
        'error',
      );
      return;
    }
    const host = await hostManager.getInstance();
    const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
    let python: string | null = null;
    try {
      python = await host.resolveActionCode(snippetId, { force: true });
    } catch (e) {
      console.error('togglePythonVisibility: resolveActionCode failed', e);
      await this.forgeOutput(
        `Forge: cannot show Python — Recipe failed to transpile: ${e}`,
        'error',
      );
      return;
    }
    if (!python) {
      await this.forgeOutput(
        'Forge: cannot show Python — Recipe is empty or transpile produced no code.',
        'error',
      );
      return;
    }
    const withPython = replacePythonSection(body, python);
    const pythonHash = await computeFacetHash(python);
    const withHash = setFmFieldV2(withPython, 'python_hash', pythonHash);
    await this.app.vault.modify(view.file, withHash);
    this.notice(
      `Forge: ${view.file.basename} → Python facet shown. Hand-edits will mark Description + Recipe stale.`);
  }

  /** v0.2.205 — Implicit locking Phase 2.5 §2.3: refresh the status
   *  bar's canonical-layer badge for the currently active note.
   *  Called on active-leaf-change, file-open, and vault.modify of the
   *  active file. Resilient to: no active markdown view, V1 notes
   *  (cleared label), and probe failures (label says "probe failed"
   *  for discoverability).
   */
  private async refreshCanonicalLayerStatusBar(): Promise<void> {
    if (!this.canonicalLayerStatusBarItem) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      this.canonicalLayerStatusBarItem.setText('');
      this.canonicalLayerStatusBarItem.title = '';
      return;
    }
    try {
      const body = await this.app.vault.read(view.file);
      const isV2 = isV2Shape(body);
      let canonical: 'description' | 'recipe' | 'python' | 'synced' | null = null;
      if (isV2) {
        try {
          canonical = await whichLayerIsCanonical(body, {
            extractDescription,
            extractRecipeSection,
            extractPythonSection,
            getFrontmatterField: getFmFieldV2,
          });
        } catch (e) {
          console.error('refreshCanonicalLayerStatusBar: probe failed', e);
          canonical = null;
        }
      }
      this.canonicalLayerStatusBarItem.setText(
        canonicalLayerStatusLabel(isV2, canonical),
      );
      this.canonicalLayerStatusBarItem.title =
        canonicalLayerStatusTooltip(canonical);
    } catch (e) {
      console.error('refreshCanonicalLayerStatusBar: vault.read failed', e);
      this.canonicalLayerStatusBarItem.setText('');
      this.canonicalLayerStatusBarItem.title = '';
    }
  }

  /** v0.2.196 — Report the current canonical layer for the active
   *  note via forgeOutput. Diagnostic command for the implicit-locking
   *  state machine; Phase 2.5 also surfaces this in a status bar
   *  entry with live updates (see refreshCanonicalLayerStatusBar). */
  private async showCanonicalLayer(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      this.notice('Forge: no active note to probe.');
      return;
    }
    const body = await this.app.vault.read(view.file);
    try {
      const canonical = await whichLayerIsCanonical(body, {
        extractDescription,
        extractRecipeSection,
        extractPythonSection,
        getFrontmatterField: getFmFieldV2,
      });
      const msg = canonical === 'synced'
        ? `Forge: ${view.file.basename} → synced (all facets match their hashes).`
        : `Forge: ${view.file.basename} → ${canonical} canonical (last hand-edited).`;
      await this.forgeOutput(msg, 'info');
    } catch (e) {
      console.error('showCanonicalLayer: probe failed', e);
      await this.forgeOutput(
        `Forge: canonical-layer probe failed — ${e}`,
        'error',
      );
    }
  }

  private async generate(errorPrefix?: string): Promise<boolean> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      this.notice('No active note to generate.');
      return false;
    }

    // v0.2.26: qualified snippet_id for library subdir files.
    const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
    const settings = this.settings;

    // Fail-fast on empty token: actionable Notice without spending a
    // network round-trip discovering a 401.
    if (!settings.transpileServiceToken) {
      const msg = 'Set your transpile token in Settings → Forge → Transpile token before using /generate.';
      this.notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
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
      //
      // v0.2.133 — dual-path note (per v0.2.129 §2.3 audit + v0.2.133
      // §3 re-audit). `generate()` is called by TWO paths:
      //   1. forgeSnippet → routingDeps.generate (english-mode regen).
      //      forgeSnippet's v0.2.102 top-level pre-flight ALREADY
      //      syncs disk → MEMFS before this point, so for this path
      //      the sync below is redundant (idempotent — harmless).
      //   2. The 'forge-generate' command-palette callback (line ~680).
      //      No upstream sync; relies entirely on THIS pre-flight.
      // Decision: keep the in-generate() sync as defense-in-depth so
      // path 2 doesn't silently regress if forgeSnippet's pre-flight
      // ever moves or path 2 expands. By design, not duplication to
      // refactor away.
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
          console.error('generate: pre-flight sync failed before /generate', e);
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
        this.notice(errorPrefix ? `${errorPrefix}: inventory failed — ${detail}` : `Forge: inventory failed — ${detail}`);
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
        this.notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
        return false;
      }

      if (response.status === 200) {
        const code: string | undefined = response.json?.code;
        const returnedId: string = response.json?.snippet_id ?? snippetId;
        if (!code) {
          const msg = 'Service returned empty code field';
          this.notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg} — check console.`);
          console.error('Forge: empty α response', response.json);
          return false;
        }
        await this.writeGeneratedCode({ [returnedId]: code });
        if (!errorPrefix) {
          this.notice(`Forge: ${returnedId} written.`);
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
      this.notice(noticeText);
      return false;
    } catch (outer) {
      console.error('Forge: unexpected error in generate', outer);
      const detail = outer instanceof Error ? outer.message : String(outer);
      this.notice(errorPrefix ? `${errorPrefix}: ${detail}` : 'Forge: unexpected error — check console.');
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
      // v0.2.104 — qualified snippet_id fix. Path lookup first;
      // fall back to basename for root-level snippets.
      // v0.2.135 — basename audit (v0334 §1.2): the find-by-basename
      // fallback is reachable ONLY when `id` is a bare snippet name
      // (path lookup for `${id}.md` failed). Bare-id callers in the
      // current code paths are legacy root-level snippets (welcome.md,
      // greet.md) that don't collide cross-domain. If a future caller
      // passes a bare id that DOES collide, the first-match-wins
      // behavior may surface — at that point migrate the caller to
      // pass a qualified id (the v0.2.104 pattern).
      const pathLookup = this.app.vault.getAbstractFileByPath(`${id}.md`);
      const file = (pathLookup instanceof TFile)
        ? pathLookup
        : files.find(f => f.basename === id);
      if (!(file instanceof TFile)) {
        console.warn(`Forge: no file found for snippet '${id}'`);
        continue;
      }
      const content = await this.app.vault.read(file);
      // v0.2.99 — use replaceOrInsertPythonHeading (replaces existing
      // # Python OR inserts in canonical English→Python→Dependencies
      // order) instead of the legacy replacePythonSection (which
      // no-op'd on missing heading for welcome.md / greet.md).
      //
      // v0.2.132 — switched to writePythonAndEnglishHash so the
      // /generate (LLM) write path ALSO stamps english_hash into
      // frontmatter. Pre-v0.2.132, only the E-- branch wrote
      // english_hash (via writeCanonicalPythonBack); the /generate
      // path called replaceOrInsertPythonHeading directly, leaving
      // the hash absent. Driver smoke against v0.2.131 caught the
      // gap: moda branch's /generate fallback updated # Python but
      // simulation.md frontmatter still had no english_hash after
      // Forge-click. This unifies the write contract: every Python
      // write — whether from E-- transpile or /generate LLM —
      // stamps english_hash, satisfying the v0.2.128 self-heal
      // promise that "after one successful Forge-click, the snippet
      // has english_hash and the cache contract works going
      // forward."
      const english = _extractEnglishFromBody(content) ?? '';
      const englishHash = await computeEnglishHash(english);
      const newContent = writePythonAndEnglishHash(content, {
        pythonCode: code,
        englishHash,
        stripStaleSlots: false,
      });
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
        console.error(`writeGeneratedCode: MEMFS sync after write failed for '${id}'`, e);
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
        console.error(`writeGeneratedCode: frontmatter reconciliation failed for '${id}'`, e);
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
          console.error(`writeGeneratedCode: sync_dependencies failed for '${id}'`, e);
        }
      }
    }
  }

  /** v0.2.101 — persist the just-transpiled Python from a canonical-
   *  mode runSnippet back to the file's # Python section. The
   *  canonical (facet_form: canonical) path skips /generate and
   *  transpiles via E-- at runtime — the engine had the code in
   *  memory, but pre-v0.2.101 it was never written to disk, leaving
   *  the user-visible Python facet stale relative to its English.
   *
   *  Uses resolveActionCode (no re-execution; deterministic), then
   *  writePythonAndEnglishHash — same write contract as
   *  handleSlotCacheMiss. Best-effort: a failure is logged but does
   *  not surface to the user (the run already succeeded; this is
   *  cosmetic persistence). */
  private async writeCanonicalPythonBack(file: TFile): Promise<void> {
    const hostManager = getPyodideHost();
    if (!hostManager) return;
    const host = await hostManager.getInstance();
    const snippetId = snippetIdFromPath(file.path, this.libraryDirNames());
    // v0.2.128 — pass force: true so the cohort-state
    // simulation.md case (no english_hash → engine's legacy rule
    // returns cached Python) is bypassed here too. Without it,
    // the v0.2.126 moda branch's regen call could return fresh
    // code but this 2nd resolveActionCode call would still return
    // the stale # Python body, and writeCanonicalPythonBack would
    // write back the SAME stale content. With force, both calls
    // return fresh transpile output, and the freshly-written
    // english_hash self-heals the snippet's cache contract going
    // forward.
    const python = await host.resolveActionCode(snippetId, { force: true });
    if (!python) return;
    const body = await this.app.vault.read(file);
    const english = _extractEnglishFromBody(body) ?? '';
    const englishHash = await computeEnglishHash(english);
    // v0.2.196 — stamp python_hash on the V2 path so the implicit
    // 3-layer state machine has a baseline. Hand-edits to the Python
    // facet after this point surface as `python` canonical. Only stamp
    // if the body has a `# Python` section visible (toggle on) — when
    // hidden, the python_hash from the prior visibility cycle is left
    // in place (and a body-level toggle-on will refresh it).
    const pythonHash = await computeFacetHash(python);
    await this.app.vault.process(file, (content) => {
      let next = writePythonAndEnglishHash(content, {
        pythonCode: python,
        englishHash,
        stripStaleSlots: false,
      });
      // Only stamp python_hash if the resulting body actually has a
      // # Python section (V2 visible-mode). Avoids a stale baseline
      // for V1 notes whose # Python facet is written by the V1 cache
      // path but doesn't participate in the 3-layer state machine.
      if (extractPythonSection(next) !== null) {
        next = setFmFieldV2(next, 'python_hash', pythonHash);
      }
      return next;
    });
    // Keep MEMFS in sync for the next compute.
    try {
      const readBack = await this.app.vault.read(file);
      await host.syncUserVaultFile(file.path, readBack);
    } catch (e) {
      console.error('writeCanonicalPythonBack: MEMFS sync after canonical write failed', e);
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
      this.notice('No active snippet to sync.');
      return;
    }
    // v0.2.26: qualified snippet_id for library subdir files.
    const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    const res = await syncDependencies(this.settings.serverUrl, vaultPath, snippetId);
    if (res.status === 200) {
      const deps: string[] = res.json?.dependencies ?? [];
      this.notice(`Forge: synced ${deps.length} dependenc${deps.length === 1 ? 'y' : 'ies'}.`);
    } else {
      const detail = res.json?.detail ?? `HTTP ${res.status}`;
      this.notice(`Forge: sync failed — ${detail}`);
      console.error('Forge sync_dependencies failed', res);
    }
  }

  // Line-first Zap: if the cursor's line contains [[id]] (with optional args),
  // run that. Otherwise fall back to the legacy whole-note behavior.
  private async runZapLine() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      this.notice('No active note to zap.');
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
      this.notice('No active note to run.');
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

  /** v0.2.138 — get the host's localStorage (or null in headless
   *  tests). Wrapped so a future migration to vault-local config
   *  (V2 cross-device sync) swaps the backend at one site. */
  private expandedStateStorage(): ExpandedStateStorage | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ls = (globalThis as any).localStorage;
      if (ls && typeof ls.getItem === 'function'
          && typeof ls.setItem === 'function') {
        return ls as ExpandedStateStorage;
      }
    } catch {
      // SecurityError in some Obsidian sandboxing configurations.
    }
    return null;
  }

  /** v0.2.139 — apply a fully-computed ExpandedState to the active
   *  markdown view's containerEl. Sets the granular `forge-fm-
   *  expanded` / `forge-deps-expanded` classes; clears the legacy
   *  `forge-expanded` shorthand (CSS still honors it as "both
   *  visible" for any third-party styling that might key off it,
   *  but tagSnippetViews emits only granular classes). */
  private applyExpandedStateToView(
    containerEl: HTMLElement, state: ExpandedState,
  ): void {
    containerEl.classList.toggle('forge-fm-expanded', state.frontmatter);
    containerEl.classList.toggle('forge-deps-expanded', state.dependencies);
    // Legacy shorthand: keep mirroring both-true → forge-expanded so
    // any external CSS targeting `.forge-expanded` keeps working.
    containerEl.classList.toggle(
      'forge-expanded', state.frontmatter && state.dependencies,
    );
  }

  /** v0.2.119 → v0.2.138 → v0.2.139 — "Toggle both" command. Flips
   *  BOTH sections together per the v0339 §2.2 OR-of-current-states
   *  semantic: if EITHER section is currently hidden, show BOTH; if
   *  both are visible, hide BOTH. State persists per snippet path. */
  private toggleFrontmatterVisibility() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const containerEl = (view as unknown as { containerEl?: HTMLElement })?.containerEl;
    if (!containerEl) {
      this.notice('Forge: no active markdown view to toggle.');
      return;
    }
    if (!containerEl.classList.contains('forge-snippet')) {
      this.notice('Forge: this file is not a snippet — visibility is not managed here.');
      return;
    }
    const file = view?.file;
    if (!file) return;
    const next = togglePersistedBoth(this.expandedStateStorage(), file.path);
    this.applyExpandedStateToView(containerEl, next);
    const summary =
      next.frontmatter && next.dependencies ? 'shown' : 'hidden';
    this.notice(`Forge: frontmatter + dependencies ${summary}.`);
  }

  /** v0.2.139 — Toggle ONLY frontmatter visibility. Dependencies
   *  state preserved. */
  private toggleFrontmatterOnly() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const containerEl = (view as unknown as { containerEl?: HTMLElement })?.containerEl;
    if (!containerEl?.classList.contains('forge-snippet')) {
      this.notice('Forge: this file is not a snippet — frontmatter visibility is not managed here.');
      return;
    }
    const file = view?.file;
    if (!file) return;
    const next = togglePersistedFrontmatter(this.expandedStateStorage(), file.path);
    this.applyExpandedStateToView(containerEl, next);
    this.notice(`Forge: frontmatter ${next.frontmatter ? 'shown' : 'hidden'}.`);
  }

  /** v0.2.139 — Toggle ONLY dependencies visibility. Frontmatter
   *  state preserved. */
  private toggleDependenciesOnly() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const containerEl = (view as unknown as { containerEl?: HTMLElement })?.containerEl;
    if (!containerEl?.classList.contains('forge-snippet')) {
      this.notice('Forge: this file is not a snippet — dependencies visibility is not managed here.');
      return;
    }
    const file = view?.file;
    if (!file) return;
    const next = togglePersistedDependencies(this.expandedStateStorage(), file.path);
    this.applyExpandedStateToView(containerEl, next);
    this.notice(`Forge: dependencies ${next.dependencies ? 'shown' : 'hidden'}.`);
  }

  /** v0.2.118 — DOM-level frontmatter hide. Adds `forge-snippet`
   *  class to every snippet markdown view's containerEl so CSS
   *  targeting `.forge-snippet .metadata-container` (the Live
   *  Preview Properties widget) resolves correctly. The CM6 facet
   *  in frontmatter-fold-view-plugin.ts still tags the `.cm-editor`
   *  root for source-mode YAML line hiding; this is the sibling-
   *  case fix.
   *
   *  Sweeps ALL markdown views (not just the active one) on each
   *  event since layout-change can affect multiple panes. Idempotent:
   *  re-adding a class that exists is a no-op.
   *
   *  Param `_file` is ignored (event signature only); we sweep all
   *  views from the workspace API. */
  private tagSnippetViews(_file: TFile | null) {
    void _file;
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView;
      const f = view?.file;
      const containerEl = (view as unknown as { containerEl?: HTMLElement }).containerEl;
      if (!containerEl) continue;
      const fm = f ? this.app.metadataCache.getFileCache(f)?.frontmatter : null;
      const t = typeof fm?.type === 'string' ? fm.type : undefined;
      const isSnippet = t === 'action' || t === 'data';
      if (isSnippet) {
        containerEl.classList.add('forge-snippet');
        // v0.2.138 → v0.2.139 — apply persisted expanded state per
        // snippet path. localStorage-backed; defaults to collapsed
        // for snippets the user hasn't toggled. View-switches +
        // Obsidian restarts honor the user's previous per-section
        // choices.
        if (f) {
          const st = readExpandedState(this.expandedStateStorage(), f.path);
          this.applyExpandedStateToView(containerEl, st);
        }
      } else {
        containerEl.classList.remove('forge-snippet');
        containerEl.classList.remove('forge-expanded');
        containerEl.classList.remove('forge-fm-expanded');
        containerEl.classList.remove('forge-deps-expanded');
      }
    }
  }

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
    this.notice(
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
        console.error('maybePreviewDataSnippet: binary data snippet preview failed', e);
      }
      return;
    }

    let content: string;
    try {
      content = await this.app.vault.read(file);
    } catch (e) {
      console.error('maybePreviewDataSnippet: could not read data snippet for preview', e);
      return;
    }
    const body = extractDataBody(content);

    try {
      const outputView = await this.getOutputView();
      await outputView.previewDataSnippet(file.basename, contentType, body, file.path);
    } catch (e) {
      console.error('maybePreviewDataSnippet: data snippet preview failed', e);
    }
  }

  /** v0.2.184 — primary "user feedback" channel. Replaces `this.notice(...)`
   *  per driver preference: open (or reveal) the Forge output panel
   *  and write the message there. Failures fall back to console only
   *  (no toast) so a missing output panel can't suppress the message
   *  permanently — but the in-panel write is the expected path.
   *
   *  `kind`: 'info' (default) | 'error' | 'success'. 'error' styles
   *  the line red in the panel.
   *
   *  Use as: `await this.forgeOutput('Forge: token missing.', 'error');`
   *  No Notice; user sees the message in the dedicated panel.
   */
  public async forgeOutput(
    text: string,
    kind: 'info' | 'error' | 'success' = 'info',
    snippetId: string = 'Forge',
  ): Promise<void> {
    try {
      const view = await this.getOutputView();
      view.appendMessage(snippetId, text, kind);
    } catch (e) {
      // Output panel unavailable — log + bail silently per driver:
      // no toasts even when the panel is missing.
      console.error('Forge.forgeOutput: output panel unavailable; message dropped:', text, e);
    }
  }

  /** v0.2.184 — Notice-replacement shim used by bulk-rewritten call
   *  sites across this file. Single-arg + optional-timeout shape that
   *  matches `this.notice(text, timeout?)` so a regex rewrite is
   *  mechanical; the timeout is ignored (output-panel messages
   *  persist until cleared, which is fine — no more autodismissing
   *  toasts that the user might miss).
   *
   *  Kind defaults to 'info'. If the message text contains "failed",
   *  "error", or starts with "Forge:" + a verb that implies failure,
   *  the kind shifts to 'error' so red styling fires. Cheap heuristic;
   *  for finer control, callers should use forgeOutput() directly.
   */
  public notice(text: string, _timeout?: number): void {
    const lower = text.toLowerCase();
    const isError =
      lower.includes('failed') || lower.includes('error') || lower.includes('could not');
    void this.forgeOutput(text, isError ? 'error' : 'info');
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
      this.notice(errorPrefix ? `${errorPrefix}: connect failed — ${detail}` : 'Forge: Connect failed — check console.');
      return;
    }

    let res;
    try {
      res = await computeSnippet(this.settings.serverUrl, vaultPath, snippetId, args, inputs);
    } catch (e) {
      console.error('Forge Compute Error:', e);
      const detail = e instanceof Error ? e.message : String(e);
      // v0.2.183 — route long tracebacks to the output panel instead
      // of the toast.
      const shortMsg = detail.length < 120 && !detail.includes('\n')
        ? detail
        : 'see Forge output panel for details';
      // Best-effort show the detail in the output view (the view may not
      // have materialized yet if the failure was very early — fall back
      // silently to the toast if so).
      try {
        const outputView = await this.getOutputView();
        outputView.appendError(snippetId, detail, '');
      } catch { /* output panel unavailable; toast carries the brief msg */ }
      this.notice(errorPrefix ? `${errorPrefix}: ${shortMsg}` : `Forge: Compute failed — ${shortMsg}`);
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
      // v0.2.133 — log-level + method-name prefix fix (v0.2.130
      // Bundle B missed this site; driver flagged in 2026-06-11-1900
      // smoke Step 9 as a yellow icon next to a red engine stack).
      console.error('runSnippet: Forge Compute non-2xx:', res.status, detail);
      // v0.2.183 — driver feedback: don't dump the full Python traceback
      // into a toast. Long multi-line tracebacks in Notice were unreadable
      // and pushed other UI off-screen. Keep the brief attribution toast
      // (so the user sees a failure happened) but route the actual error
      // text to the output panel where it can be selected/copied (Cmd-C
      // works there post v0.2.178). For very short error messages we
      // still pop the message in the toast — it's only the multi-line
      // tracebacks that hurt.
      const shortMsg = errorMsg.length < 120 && !errorMsg.includes('\n')
        ? errorMsg
        : 'see Forge output panel for details';
      if (errorPrefix) {
        this.notice(`${errorPrefix}: ${shortMsg}`);
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
        console.error('computeSnippetWithArgs (post-install refresh): post-install refresh failed', e);
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
      this.notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
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
      this.notice(errorPrefix
        ? `${errorPrefix}: slot resolution failed — ${detail}`
        : `Forge: slot resolution failed — ${detail}`);
      return null;
    }

    if (resolved.status === 0) {
      const msg = resolved.json?.detail ?? 'Slot resolution requires a transpile token.';
      this.notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
      return null;
    }
    if (resolved.status >= 400) {
      const detail = resolved.json?.detail;
      const errorMsg = (detail && typeof detail === 'object' && detail.error)
        ? detail.error
        : (typeof detail === 'string' ? detail : `HTTP ${resolved.status}`);
      console.error('Forge slot resolution non-2xx:', resolved.status, detail);
      this.notice(errorPrefix
        ? `${errorPrefix}: slot resolution failed — ${errorMsg}`
        : `Forge: slot resolution failed — ${errorMsg}`);
      return null;
    }

    const responses = resolved.json?.responses ?? [];
    if (!Array.isArray(responses) || responses.length !== requests.length) {
      const msg = `slot resolution returned ${responses?.length ?? 0} responses for ${requests.length} requests; bailing`;
      console.error('Forge:', msg);
      this.notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
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
      this.notice(errorPrefix ? `${errorPrefix}: ${msg}` : `Forge: ${msg}`);
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
      this.notice(errorPrefix
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
      console.error('handleSlotCacheMiss: failed to read snippet for cache write', e);
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
      console.error('handleSlotCacheMiss: # Python / english_hash write failed', e);
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
      console.error('handleSlotCacheMiss: post-write MEMFS sync failed', e);
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
