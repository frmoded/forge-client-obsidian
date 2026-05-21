import { ItemView, Menu, WorkspaceLeaf, MarkdownView, Notice, TFile, setTooltip } from 'obsidian';
import {
  Chip,
  ChipPaletteGroup,
  CHIPS_NO_ENGLISH_SECTION,
  insertChipText,
} from './chips-core';
import { ChipsManifest, loadChipsForActiveVault, resolveSnippetPath } from './chips';

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
        // Re-render so the active-file gating (chips vs "open an
        // action snippet" placeholder) reflects the new file.
        void this.render();
        const v = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (v && v.file?.path === file?.path) this.lastMarkdownView = v;
      }));
  }

  getViewType() { return CHIPS_VIEW_TYPE; }
  getDisplayText() { return 'Forge chips'; }
  getIcon() { return 'puzzle'; }

  async onOpen() {
    this.host.registerView(this);
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

    for (const group of this.groups) {
      const section = root.createDiv({ cls: 'forge-chips-group' });
      section.createEl('h4', {
        text: group.sourceName,
        cls: 'forge-chips-group-header',
      });

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
        if (sub.label) {
          section.createEl('h5', {
            text: sub.label,
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
            void this.onChipClick(chip.insertion);
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

  private async onChipClick(insertion: string) {
    // Re-resolve at click time, with the tracked-view fallback so
    // the pane stealing focus doesn't leave us without a target.
    const live = this.app.workspace.getActiveViewOfType(MarkdownView);
    const view = live ?? this.lastMarkdownView;
    const file = view?.file;
    if (!file) {
      new Notice('Forge chips: click into an action snippet first, ' +
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
      new Notice('Chips only insert into action snippets.');
      return;
    }

    await this.insertViaVault(file, insertion);
  }

  /** Write the insertion through vault.process so the change is
   *  atomic and reading-mode-safe. The editor refreshes via
   *  Obsidian's modify event handler — no editor.replaceRange
   *  dispatch, so the readOnlyFacetFilter never gets a chance to
   *  silently drop the edit. */
  private async insertViaVault(file: TFile, insertion: string) {
    let outcome: 'ok' | 'no-english' | 'unchanged' = 'unchanged';
    await this.app.vault.process(file, (content) => {
      const result = insertChipText(content, insertion);
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
      new Notice(`Forge chips: inserted "${insertion}".`);
    } else if (outcome === 'no-english') {
      new Notice('Snippet has no # English section to insert into.');
    }
  }
}

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
