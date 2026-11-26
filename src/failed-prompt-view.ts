// 2026-11-20-1004 (THE FAILED-PROMPT REVIEW QUEUE, phase 1) - the OBSIDIAN side: the plugin tab that hosts the review DOM (failed-prompt-tab-dom.ts), the two commands (`Review unprocessed sentences`, `Copy the failure list`), and the queue's file
// adapter (the plugin's OWN folder, never data.json). Music edition only (reached through MusicEdition.registerReviewQueue; lean has none of it). No network: nothing here leaves the machine.
import { ItemView, type App, type Plugin, type TFile, type WorkspaceLeaf } from 'obsidian';
import { loggedNotice } from './logged-notice.ts';
import { mountReviewTab, type ReviewTab } from './failed-prompt-tab-dom.ts';
import { createReview, type FailedPromptsPort, type Review } from './failed-prompt-setup-core.ts';
import { readBarLines } from './bar-list-note-core.ts';
import { listOfNote } from './sentence-list-note-core.ts';
import { familyOfPath } from './note-family-core.ts';
import { BAR_FOLDER_NAME, PHRASE_FOLDER, isBarPath } from './phrase-core.ts';
import type { FailKind } from './failed-prompt-core.ts';
import type { GrammarVault } from './phrase-grammar-core.ts';
import { vaultListsOf } from './description-wiring.ts';

export const REVIEW_VIEW_TYPE = 'forge-review-queue';
export const REVIEW_COMMAND_ID = 'review-unprocessed-sentences';
export const FAILURE_LIST_COMMAND_ID = 'copy-failure-list';

export interface ReviewQueueSetup { enabled(): boolean; build(): string }
export interface ReviewQueueHandle { port: FailedPromptsPort; open(): Promise<void> }

const vaultOf = (app: App): GrammarVault => vaultListsOf(app, true);

class ReviewView extends ItemView {
  private tab: ReviewTab | null = null;
  constructor(leaf: WorkspaceLeaf, private readonly host: { review: Review; refreshActive(): Promise<void> }) { super(leaf); }
  getViewType(): string { return REVIEW_VIEW_TYPE; }
  getDisplayText(): string { return 'Unprocessed sentences'; }
  getIcon(): string { return 'inbox'; }
  async onOpen(): Promise<void> {
    await this.host.refreshActive();
    this.tab = mountReviewTab(this.contentEl, this.host.review.tabPorts);
    await this.tab.refresh();
    this.registerEvent(this.app.workspace.on('file-open', () => { void this.host.refreshActive(); }));
  }
  async onClose(): Promise<void> { this.tab?.destroy(); this.tab = null; }
}

export function registerReviewQueue(plugin: Plugin, setup: ReviewQueueSetup): ReviewQueueHandle {
  const app = plugin.app; const adapter = app.vault.adapter;
  const dir = plugin.manifest.dir ?? `${app.vault.configDir}/plugins/${plugin.manifest.id}`;
  let active: { path: string; kind: FailKind; lines: string[] } | null = null;
  const refreshActive = async (): Promise<void> => {
    const f: TFile | null = app.workspace.getActiveFile();
    if (f === null) { active = null; return; }
    try {
      const text = await app.vault.cachedRead(f);
      if (isBarPath(f.path)) { active = { path: f.path, kind: 'bar', lines: readBarLines(text)?.lines ?? [] }; return; }
      const family = familyOfPath(f.path);
      active = family === 'phrase' || family === 'arrangement' || family === 'composition' ? { path: f.path, kind: family, lines: listOfNote(text, family, vaultOf(app)).list } : null;
    } catch { active = null; }
  };
  const review: Review = createReview({
    adapter: { read: (p) => adapter.read(p), write: (p, t) => adapter.write(p, t), append: (p, t) => adapter.append(p, t), exists: (p) => adapter.exists(p) },
    dir, enabled: setup.enabled, build: setup.build, now: () => Date.now(), rand: () => Math.random(), warn: (l) => { console.warn(`[forge] ${l}`); }, vault: () => vaultOf(app),
    active: () => active, applyLines: async (path, lines) => {
      let added = 0;
      for (const line of lines) { const r = await review.appendLine(path, line); if (!r.ok) return { ok: false, message: `Stopped after ${added} line${added === 1 ? '' : 's'}: ${r.message}` }; added++; }
      return { ok: true, message: `Added ${added} line${added === 1 ? '' : 's'} to the open note.` };
    },
    copy: (t) => navigator.clipboard.writeText(t),
  });
  const open = async (): Promise<void> => {
    const existing = app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0];
    const leaf = existing ?? app.workspace.getLeaf('tab');
    if (existing === undefined) await leaf.setViewState({ type: REVIEW_VIEW_TYPE, active: true });
    void app.workspace.revealLeaf(leaf);
  };
  review.bindOpen(() => { void open(); });
  plugin.registerView(REVIEW_VIEW_TYPE, (leaf) => new ReviewView(leaf, { review, refreshActive }));
  plugin.addCommand({ id: REVIEW_COMMAND_ID, name: 'Review unprocessed sentences', callback: () => { void open(); } });
  plugin.addCommand({ id: FAILURE_LIST_COMMAND_ID, name: 'Copy the failure list', callback: () => { void review.copyFailureList().then(() => loggedNotice('The failure list is on the clipboard.'), (e) => loggedNotice(`Could not copy the failure list: ${(e as Error)?.message ?? e}`)); } });
  void review.store.refresh();
  return { port: review.port, open };
}
