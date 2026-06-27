import { ItemView, Menu, WorkspaceLeaf, MarkdownView, Notice, TFile, setTooltip } from 'obsidian';
import {
  Chip,
  ChipPaletteGroup,
  CHIPS_NO_ENGLISH_SECTION,
  applySelectionToChip,
  insertChipText,
  insertChipTextAtLine,
  shouldRenderSubgroupHeader,
} from './chips-core.ts';
import { initialExpandedLibraries } from './chip-folding-core.ts';
import { ChipsManifest, loadChipsForActiveVault, resolveSnippetPath } from './chips.ts';
import { findFallbackMarkdownView } from './find-fallback-markdown-view-core.ts';
import type {
  MarkdownLeafLike,
  MarkdownViewLike,
} from './find-fallback-markdown-view-core.ts';
import { forgeNotice } from './forge-notice.ts';
import { isV2Shape } from './v2-note-core.ts';

export const CHIPS_VIEW_TYPE = 'forge-chips';

/** Surface the chip view needs from the plugin. Kept narrow so this
 *  module doesn't import main.ts and create a cycle. */
export interface ChipsHost {
  // Current vault manifest snapshot (vault name + declared domains).
  // Fresh-read per loadChipsForActiveVault call.
  getManifest(): ChipsManifest;
  // Hook for reload events (e.g. "Refresh chip palette" command can
  // reach into the view via this).
  registerView(view: ChipsView): void;
  unregisterView(view: ChipsView): void;
}

export class ChipsView extends ItemView {
  private lastMarkdownView: MarkdownView | null = null;
  private groups: ChipPaletteGroup[] = [];
  // v0.2.112 Item A — per-session library section expansion state.
  // null = haven't computed defaults yet for this session; first
  // render computes from active file path. After that, user manual
  // toggles override; we don't re-compute defaults on subsequent
  // file-opens (would clobber the user's manual choices mid-session).
  private expandedLibraries: Set<string> | null = null;

  constructor(leaf: WorkspaceLeaf, private host: ChipsHost) {
    super(leaf);
    // file-open is the ONLY re-render trigger. We deliberately do NOT
    // listen on active-leaf-change — clicking a chip shifts the
    // active leaf to this side pane, and an active-leaf-change
    // re-render would empty contentEl mid-click and eat the click.
    // (Lessons from the v1 POC; see b6c6fa9.) file-open is safe
    // because clicking the side pane doesn't open a file.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        // v0.2.67 — file-open now triggers a full `refresh()` (not just
        // a render) so v3.1 walk-up sees the new active file path
        // (threaded through `host.getManifest()`) and re-computes the
        // per-chapter palette. Pre-v0.2.67 this called only `render()`,
        // which left `this.groups` stale across file switches.
        void this.refresh();
        const v = this.app.workspace.getActiveViewOfType(MarkdownView);
        // v0.2.69 — loosened from the strict
        // `v.file?.path === file?.path` equality check. The strict
        // check missed workspace-boot races where v is set but its
        // file hasn't synced to the file-open arg yet. Any v with a
        // file is a valid snapshot. Bug 2 partial fix.
        if (v && v.file) this.lastMarkdownView = v;
      }));
  }

  getViewType() { return CHIPS_VIEW_TYPE; }
  getDisplayText() { return 'Forge chips'; }
  getIcon() { return 'puzzle'; }

  async onOpen() {
    this.host.registerView(this);
    // v0.2.69 — eagerly snapshot any currently-active markdown view
    // so chip clicks work when the plugin enabled with a file already
    // open (Path A install workflow, where Obsidian restores last
    // workspace state). Pre-v0.2.69 lastMarkdownView stayed null
    // until the next file-open event fired; clicking a chip while
    // still inside the restored file triggered the guard Notice.
    // Bug 2 fix.
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active && active.file) this.lastMarkdownView = active;
    await this.refresh();
  }

  async onClose() {
    this.host.unregisterView(this);
  }

  /** Reload from disk and re-render. Called on view open and from
   *  the "Forge: Refresh chip palette" command. */
  async refresh() {
    try {
      this.groups = await loadChipsForActiveVault(
        this.app, this.host.getManifest());
    } catch (e) {
      console.error('Forge chips: load failed', e);
      this.groups = [];
    }
    this.render();
  }

  /** Resolve a file's frontmatter `type` robustly. Tries Obsidian's
   *  metadataCache first (synchronous, usually correct); falls back
   *  to a direct vault.cachedRead + frontmatter regex when the cache
   *  has no usable answer. metadataCache occasionally fails to parse
   *  frontmatter containing literal-block YAML (e.g. multi-line
   *  `generation_notes: |` blocks on go.md), which would otherwise
   *  cause the action-snippet gate to spuriously reject the file. */
  private async fileType(file: TFile): Promise<string | null> {
    const cached = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (cached && typeof cached.type === 'string') return cached.type;
    try {
      const content = await this.app.vault.cachedRead(file);
      if (!content.startsWith('---')) return null;
      const end = content.indexOf('\n---', 4);
      if (end === -1) return null;
      const fm = content.slice(0, end);
      const m = fm.match(/^type:\s*["']?(\w+)["']?\s*$/m);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  // ------ V3: refs-driven hover preview + right-click navigate ------

  /** Pre-attach a hover tooltip to a chip button with the
   *  description(s) of its referenced snippet(s). Resolves each ref
   *  via A4 (root shadow wins over library subdir); pulls the
   *  description from frontmatter, falling back to the English
   *  facet's first non-Inputs line (~80 chars), then to a
   *  "No description available." sentinel. Chips without `refs` or
   *  with all refs broken get no tooltip. Fire-and-forget — the
   *  first hover after render shows the result. */
  private async preloadChipTooltip(btn: HTMLElement, chip: Chip) {
    if (!chip.refs || chip.refs.length === 0) return;
    const manifest = this.host.getManifest();
    const lines: string[] = [];
    for (const ref of chip.refs) {
      const path = resolveSnippetPath(this.app, ref, manifest);
      if (!path) {
        lines.push(`${ref} — Snippet not found.`);
        continue;
      }
      const desc = await this.readSnippetDescription(path);
      lines.push(chip.refs.length > 1 ? `${ref} — ${desc}` : desc);
    }
    if (lines.length > 0) setTooltip(btn, lines.join('\n'));
  }

  private async readSnippetDescription(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return 'No description available.';
    let content: string;
    try {
      content = await this.app.vault.cachedRead(file);
    } catch {
      return 'No description available.';
    }
    const fmDesc = extractFrontmatterDescription(content);
    if (fmDesc) return fmDesc;
    const englishLead = extractEnglishLead(content);
    if (englishLead) return englishLead;
    return 'No description available.';
  }

  /** Right-click context menu on a chip: one "Go to <ref>" item per
   *  resolvable ref. Clicking opens the snippet in the active
   *  editor (Obsidian's openLinkText handles the file resolution
   *  including shadow vs library). If no refs resolve, the menu
   *  doesn't show — silent — rather than surfacing a dead menu. */
  private showRefsContextMenu(chip: Chip, e: MouseEvent) {
    const manifest = this.host.getManifest();
    const menu = new Menu();
    let hasItems = false;
    for (const ref of chip.refs ?? []) {
      const path = resolveSnippetPath(this.app, ref, manifest);
      if (!path) continue;
      hasItems = true;
      menu.addItem(item =>
        item.setTitle(`Go to ${ref}`).setIcon('arrow-up-right')
          .onClick(() => {
            this.app.workspace.openLinkText(ref, '', false);
          }));
    }
    if (!hasItems) return;
    menu.showAtMouseEvent(e);
  }

  private async render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('forge-chips-view');

    const header = root.createDiv({ cls: 'forge-chips-header' });
    header.createEl('h3', { text: 'Forge chips' });
    const refreshBtn = header.createEl('button', {
      text: 'Refresh',
      cls: 'forge-chips-refresh',
    });
    refreshBtn.addEventListener('click', () => { void this.refresh(); });

    if (this.groups.length === 0) {
      root.createEl('p', {
        cls: 'forge-chips-empty',
        text:
          'No chips defined. Add a `_chips.md` data snippet to your ' +
          'vault to surface authoring chips here.',
      });
      return;
    }

    // Active-file gate: show a placeholder ONLY when we positively
    // know the focused file isn't an action snippet (README,
    // _chips.md, plain note). When no markdown view is focused —
    // common right after a plugin reload, before the user clicks
    // back into the editor — default to SHOWING chips. The click
    // handler still enforces the action-snippet rule, so an early
    // chip click without focus just bounces with a Notice. Earlier
    // shape gated the pane in both cases, which trapped users
    // post-reload with "Open an action snippet" and no clear
    // recovery.
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    const target = active ?? this.lastMarkdownView;
    const targetFile = target?.file;
    if (targetFile) {
      const type = await this.fileType(targetFile);
      if (type !== 'action') {
        root.createEl('p', {
          cls: 'forge-chips-empty',
          text: 'Chips only insert into action snippets. Switch to an action snippet to use chips.',
        });
        return;
      }
    }

    // v0.2.112 Item A — compute initial library-section expansion
    // state. First render only; user manual toggles persist for
    // session after that. Uses pure-core `initialExpandedLibraries`.
    if (this.expandedLibraries === null) {
      const activePath = targetFile?.path ?? null;
      const allSources = this.groups.map(g => g.sourceName);
      this.expandedLibraries = initialExpandedLibraries(
        activePath, allSources);
    }

    for (const group of this.groups) {
      const section = root.createDiv({ cls: 'forge-chips-group' });
      const isExpanded = this.expandedLibraries.has(group.sourceName);
      // v0.2.112 — header is now a button so it's keyboard-focusable
      // and screen-reader-announced. Inline arrow ▶/▼ + chip count.
      const header = section.createEl('button', {
        cls: 'forge-chips-group-header',
      });
      header.setAttribute('aria-expanded', String(isExpanded));
      const arrow = header.createSpan({ cls: 'forge-chips-group-arrow' });
      arrow.setText(isExpanded ? '▼' : '▶');
      const label = header.createSpan({ cls: 'forge-chips-group-label' });
      label.setText(group.sourceName);
      const count = header.createSpan({ cls: 'forge-chips-group-count' });
      count.setText(` (${group.chips.length})`);
      header.addEventListener('click', () => {
        if (!this.expandedLibraries) return;
        if (this.expandedLibraries.has(group.sourceName)) {
          this.expandedLibraries.delete(group.sourceName);
        } else {
          this.expandedLibraries.add(group.sourceName);
        }
        // Light re-render — we re-render via the full render() path
        // to stay consistent with the rest of the view's lifecycle.
        void this.render();
      });

      if (!isExpanded) {
        // Collapsed: skip emitting the sub-group + chip-row DOM.
        continue;
      }

      // Sub-group by chip.group field. First-appearance order
      // preserves the author's intended sequence in `_chips.md`.
      // Chips with no `group` cluster under an unlabeled sub-section
      // at the top, matching the v1 flat rendering when no chip
      // declares a group.
      const subGroups: Array<{ label: string | null; chips: typeof group.chips }> = [];
      const seen = new Map<string, number>();
      for (const chip of group.chips) {
        const key = chip.group ?? '';
        let idx = seen.get(key);
        if (idx === undefined) {
          idx = subGroups.length;
          seen.set(key, idx);
          subGroups.push({ label: chip.group ?? null, chips: [] });
        }
        subGroups[idx].chips.push(chip);
      }

      for (const sub of subGroups) {
        // v0.2.54 — gate the h5 sub-header on shouldRenderSubgroupHeader.
        // v2 per-library groups have sub.label === group.sourceName
        // (e.g. both "Setup") because mergeChipsWithOverrides sets
        // chip.group to the group id and the source name to its
        // display label; the h4 already conveys the identity. The
        // helper suppresses the redundant h5 in that case while
        // preserving sub-headers for v1 vault-root _chips.md files
        // (where chips inside one source can declare distinct group
        // values).
        if (shouldRenderSubgroupHeader(sub.label, group.sourceName)) {
          section.createEl('h5', {
            text: sub.label as string,
            cls: 'forge-chips-subgroup-header',
          });
        }
        const row = section.createDiv({ cls: 'forge-chip-row' });
        for (const chip of sub.chips) {
          const btn = row.createEl('button', {
            text: chip.label,
            cls: 'forge-chip',
          });
          btn.setAttribute('aria-label', chip.insertion);
          btn.addEventListener('click', () => {
            // v0.2.203 — V2 syntax migration: pass the whole chip so
            // onChipClick can pick insertion vs insertionV2 based on
            // the target note's V2-shape. Pre-v0.2.203 the chip
            // palette always inserted V1 `Do [[X]](...)` even into
            // V2 # Recipe sections — cohort had to manually rewrite.
            void this.onChipClick(chip);
          });
          // V3: right-click → "Go to <ref>" context menu. Hover →
          // tooltip with referenced snippets' descriptions.
          btn.addEventListener('contextmenu', (e: MouseEvent) => {
            e.preventDefault();
            this.showRefsContextMenu(chip, e);
          });
          void this.preloadChipTooltip(btn, chip);
        }
      }
    }
  }

  private async onChipClick(chip: Chip) {
    // v0.2.69 — re-resolve via the pure-core fallback chain so chip
    // clicks land even when the plugin enabled with a file already
    // open (Path A install) AND the user hasn't switched files since.
    // Pre-v0.2.69 this was inline `live ?? this.lastMarkdownView`,
    // which returned null whenever both lastMarkdownView was unset
    // AND focus had moved to the chip side pane (the pane's own
    // active-view-of-type returns null for non-markdown views).
    // Bug 2 fix.
    const resolved = findFallbackMarkdownView(
      {
        getActiveMarkdownView: () =>
          this.app.workspace.getActiveViewOfType(MarkdownView) as
            unknown as MarkdownViewLike | null,
        getMarkdownLeaves: () =>
          this.app.workspace.getLeavesOfType('markdown') as
            unknown as MarkdownLeafLike[],
        getMostRecentLeaf: () =>
          this.app.workspace.getMostRecentLeaf() as
            unknown as MarkdownLeafLike | null,
      },
      this.lastMarkdownView as unknown as MarkdownViewLike | null,
    );
    const file = resolved?.file as TFile | undefined;
    if (!file) {
      void forgeNotice(this.app, 'Forge chips: click into an action snippet first, ' +
        'then click the chip.');
      return;
    }

    // Action-snippet gate (per spec): chips only insert into snippets
    // whose frontmatter declares type: action. Data snippets / plain
    // notes are off-limits. Uses the robust fileType helper so a
    // metadataCache mis-parse (e.g. on go.md's multi-line
    // generation_notes literal block) falls back to a direct file
    // read instead of trapping a real action snippet.
    const type = await this.fileType(file);
    if (type !== 'action') {
      void forgeNotice(this.app, 'Chips only insert into action snippets.');
      return;
    }

    // v0.2.113 — cursor-aware insertion. When the resolved view has
    // an editor with an active cursor inside the `# English` body,
    // insert at cursor+1; otherwise fall back to end-of-English (the
    // pre-v0.2.113 behavior). Reading the cursor from the resolved
    // view (which may be `lastMarkdownView` if no markdown view is
    // currently active) keeps the affordance working even after a
    // chip-pane focus dance.
    const resolvedAsAny = resolved as unknown as {
      editor?: {
        getCursor?: (which?: string) => { line: number; ch: number };
        getSelection?: () => string;
        replaceSelection?: (text: string) => void;
      };
    } | null;
    const cursor = resolvedAsAny?.editor?.getCursor
      ? resolvedAsAny.editor.getCursor('head')
      : null;
    const cursorLine = cursor?.line ?? -1;
    // v0.2.137 — selection-aware chip insertion. When the editor has
    // a non-empty selection, replace the FIRST <...> placeholder in
    // the chip body with the selection text BEFORE handing off to
    // insertChipTextAtLine. Chip bodies without a placeholder are
    // passed through unchanged (no silent wrap surprise).
    const selection = resolvedAsAny?.editor?.getSelection
      ? resolvedAsAny.editor.getSelection()
      : '';
    // v0.2.203 — V2 syntax migration. Pick the V2 insertion form when
    // the target note is V2-shape (has `# Description` + `# Recipe`
    // H1 headings) AND the chip carries a `insertionV2` template
    // (auto-derived for action + data; absent when an explicit
    // _chips.md override pinned a literal V1 string). Otherwise fall
    // through to the V1 `chip.insertion` — preserves back-compat for
    // V1 notes (` # English`) and for chips authored with a hard-
    // coded V1 insertion in _chips.md.
    let chosenInsertion = chip.insertion;
    if (chip.insertionV2) {
      try {
        const body = await this.app.vault.read(file);
        if (isV2Shape(body)) {
          chosenInsertion = chip.insertionV2;
        }
      } catch (e) {
        console.error('chips-view: V2-shape detection failed; falling back to V1 insertion', e);
      }
    }
    const finalInsertion = applySelectionToChip(chosenInsertion, selection);
    await this.insertViaVault(file, finalInsertion, cursorLine);
  }

  /** Write the insertion through vault.process so the change is
   *  atomic and reading-mode-safe. The editor refreshes via
   *  Obsidian's modify event handler — no editor.replaceRange
   *  dispatch, so the readOnlyFacetFilter never gets a chance to
   *  silently drop the edit.
   *
   *  v0.2.113 — `cursorLine` (0-based, matching Obsidian's
   *  editor.getCursor().line) drives cursor-aware insertion when it
   *  sits inside the # English body. Pass -1 to force the legacy
   *  end-of-section append. */
  private async insertViaVault(
    file: TFile,
    insertion: string,
    cursorLine: number,
  ) {
    let outcome: 'ok' | 'no-english' | 'unchanged' = 'unchanged';
    await this.app.vault.process(file, (content) => {
      const result = insertChipTextAtLine(content, insertion, cursorLine);
      if (result.ok) {
        outcome = 'ok';
        return result.body;
      }
      if (result.reason === CHIPS_NO_ENGLISH_SECTION) {
        outcome = 'no-english';
      }
      return content;
    });
    if (outcome === 'ok') {
      void forgeNotice(this.app, `Forge chips: inserted "${insertion}".`);
    } else if (outcome === 'no-english') {
      void forgeNotice(this.app, 'Snippet has no # English section to insert into.');
    }
  }
}

// Keep `insertChipText` re-exported through this module's import to
// stop tree-shake-vs-lint warnings: it's part of the cursor-aware
// helper's contract (fallback when cursor not in body).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _legacyInsert = insertChipText;

// ------ Pure helpers for V3 tooltip extraction ------

/** Extract the `description:` frontmatter field from a snippet's
 *  raw markdown body, if present. Tolerates quoted or unquoted
 *  values; returns the trimmed text or null when missing. */
function extractFrontmatterDescription(content: string): string | null {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return null;
  const fm = content.slice(0, end);
  const m = fm.match(/^description:\s*["']?([^"'\n]+?)["']?\s*$/m);
  return m ? m[1].trim() : null;
}

/** Pull the first usable English-facet line from a snippet body —
 *  used as a description fallback when frontmatter has none. Skips
 *  the `Inputs:` declaration; returns the first non-blank prose
 *  line, truncated to ~80 chars with an ellipsis when longer. */
function extractEnglishLead(content: string): string | null {
  const idx = content.search(/^# English\s*$/m);
  if (idx < 0) return null;
  const lines = content.slice(idx).split('\n').slice(1);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) break;            // next heading
    if (t.startsWith('---')) break;          // section break
    if (t.startsWith('Inputs:')) continue;   // skip frontmatter-like decl
    return t.length > 80 ? t.slice(0, 80) + '…' : t;
  }
  return null;
}
