// score_first_experiment M1 (drain 2026-10-21-1100) — "New bar": the one-minute fast path from an empty score-first vault to a first bar you can hear and see.
//
// The Obsidian-coupled half (the decisions are in score-first-core.ts, the gate in vault-profile-core.ts). In a vault that is NOT score-first NOTHING is registered that a
// person can see: no "New bar" command and no ribbon button are registered. The vault's profile is a constant, so both are added once, when the workspace is ready; a forge.toml
// edited mid-session to ADD the profile takes effect on the next load.

import { MarkdownView, Notice, TFile, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { isScoreFirstVault } from './vault-profile-core.ts';
import { BAR_FOLDER, createNewBar, isFileExistsError, newBarAvailable, scorePanelPlan } from './score-first-core.ts';
import { messageDelivery } from './score-first-messages-core.ts';
import { musicEdition } from './music-edition-selected.ts';
import { PHRASE_FOLDER, PHRASE_VIEW_TYPE, createNewPhrase, isPhrasePath, newPhraseAvailable } from './phrase-core.ts';
import { PhraseView, openPhrase, openPhraseInLeaf } from './phrase-view.ts';
import { choosePhraseTarget, createPhraseHeaderSync } from './phrase-header-core.ts';
import { headerResync } from './header-resync.ts';

export const NEW_BAR_COMMAND_ID = 'new-bar';
export const NEW_BAR_COMMAND_NAME = 'New bar';
// score_first M5 (drain 2026-10-22-1850): phrases. Registered after the SAME gate as "New bar", never in another vault.
export const NEW_PHRASE_COMMAND_ID = 'new-phrase-from-bar';
export const NEW_PHRASE_COMMAND_NAME = 'New phrase from this bar';
export const OPEN_PHRASE_COMMAND_ID = 'open-phrase-as-score';
export const OPEN_PHRASE_COMMAND_NAME = 'Open phrase as Score';

export interface ScoreFirstHooks {
  /** Open a rhythm note in the Beat Box (the plugin's own opener: a tab already showing the note is reused, else a new tab). */
  openRhythmNote(file: TFile): Promise<void>;
}

export function registerScoreFirst(plugin: Plugin, hooks: ScoreFirstHooks): void {
  const app = plugin.app;
  let scoreFirst = false;
  // M4 (drain 2026-10-21-2010): the same answer tells the message router whether this vault keeps the Forge output panel closed. Asked at registration too (not only when the workspace is
  // ready), so the first messages of a session already follow the vault's profile.
  const refresh = async () => {
    scoreFirst = await isScoreFirstVault(app.vault);
    messageDelivery.setScoreFirst(scoreFirst);
    console.info(`[forge-profile] refresh: score_first=${scoreFirst}`);                // a permanent evidence line: a report that a score-first behaviour is missing arrives with the answer the plugin had
  };
  void refresh();

  const createBar = (): Promise<unknown> => createNewBar<TFile>({
    folderExists: () => app.vault.getAbstractFileByPath(BAR_FOLDER) !== null,
    createFolder: async () => { await app.vault.createFolder(BAR_FOLDER); },
    listBarBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${BAR_FOLDER}/`)).map((f) => f.basename),
    exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
    create: (p, content) => app.vault.create(p, content),
    open: (file) => hooks.openRhythmNote(file),
    notify: (message) => { new Notice(message); },
  });

  const activePath = (): string | null => app.workspace.getActiveFile()?.path ?? null;
  const createPhrase = (): Promise<unknown> => createNewPhrase<TFile>({
    activePath,
    folderExists: () => app.vault.getAbstractFileByPath(PHRASE_FOLDER) !== null,
    createFolder: async () => { await app.vault.createFolder(PHRASE_FOLDER); },
    listPhraseBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${PHRASE_FOLDER}/`)).map((f) => f.basename),
    exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
    create: (p, content) => app.vault.create(p, content),
    open: (file) => openPhrase(app, file),
    notify: (message) => { new Notice(message); },
    isAlreadyExists: isFileExistsError,
  });

  // The profile is a constant of the vault, so the command and the ribbon button are added ONCE, when the workspace is ready (the adapter is up) — and only if this vault is
  // score-first. In any other vault they are not registered at all: not in the palette, not in Settings -> Hotkeys, not in the ribbon. The command still asks the live answer
  // when run, so a forge.toml that stops declaring the profile mid-session turns it off at once.
  plugin.registerEvent(app.vault.on('modify', (f) => { if (f.path === 'forge.toml') void refresh(); }));
  app.workspace.onLayoutReady(() => {
    void refresh().then(() => {
      if (!newBarAvailable(scoreFirst)) return;
      plugin.addCommand({
        id: NEW_BAR_COMMAND_ID,
        name: NEW_BAR_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!newBarAvailable(scoreFirst)) return false;
          if (!checking) void createBar();
          return true;
        },
      });
      plugin.addRibbonIcon('plus-circle', NEW_BAR_COMMAND_NAME, () => { void createBar(); });
      // M5: the phrase tab (a control strip over a live Score) and its two commands. The view type is registered here, after the gate, so no other vault knows it exists. Both commands still ask
      // the live answer when offered, like "New bar".
      const plan = scorePanelPlan({ scoreFirst: true, edition: musicEdition.id });
      // M6: a lineage link names a note by its path without .md. A phrase opens as a phrase tab, a bar in the Beat Box; a note that is not there is a Notice naming it (the person just clicked it).
      const openNote = (noteId: string) => {
        const file = app.vault.getAbstractFileByPath(`${noteId}.md`);
        if (!(file instanceof TFile)) { new Notice(`Could not open ${noteId}: that note is not in this vault.`); return; }
        void (noteId.startsWith(`${PHRASE_FOLDER}/`) ? openPhrase(app, file) : hooks.openRhythmNote(file));
      };
      plugin.registerView(PHRASE_VIEW_TYPE, (leaf) => new PhraseView(leaf, plan, openNote));
      plugin.addCommand({
        id: NEW_PHRASE_COMMAND_ID,
        name: NEW_PHRASE_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!newPhraseAvailable({ scoreFirst, activePath: activePath() })) return false;
          if (!checking) void createPhrase();
          return true;
        },
      });
      // 2100: the way back. A phrase shown as text (a markdown tab) carries "Open as Score" in its header, for exactly as long as it shows a phrase. A markdown view is reused when its tab
      // navigates, so the set is re-synced on every event that can change the answer (the same events the Beat Box's header buttons use).
      const headers = createPhraseHeaderSync<MarkdownView>({
        isScoreFirst: () => scoreFirst || messageDelivery.hasBeenScoreFirst(),      // this code only runs after the gate said yes; a later failed re-read must not take the button away
        open: (view, path) => {
          const file = app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) void openPhraseInLeaf(app, view.leaf, file);
        },
      });
      const syncHeaders = (reason = 'event') => {
        const views: MarkdownView[] = [];
        for (const leaf of app.workspace.getLeavesOfType('markdown')) if (leaf.view instanceof MarkdownView) views.push(leaf.view);
        headers.sync(views);
        const shown = views.filter((v) => isPhrasePath(v.file?.path)).length;
        if (shown > 0) console.info(`[forge-header] phrase text tabs: ${shown}; header sync (${reason}); score-first now=${scoreFirst} ever=${messageDelivery.hasBeenScoreFirst()}`);
      };
      plugin.registerEvent(app.workspace.on('file-open', () => syncHeaders('file-open')));
      plugin.registerEvent(app.workspace.on('active-leaf-change', () => syncHeaders('active-leaf-change')));
      plugin.registerEvent(app.workspace.on('layout-change', () => syncHeaders('layout-change')));
      // the rhythm sync also listens to the metadata cache (a file's cache arriving after its tab did): the phrase's must too, or the two see different moments
      plugin.registerEvent(app.metadataCache.on('changed', () => syncHeaders('metadata-changed')));
      plugin.register(headerResync.subscribe((reason) => syncHeaders(reason)));
      plugin.register(messageDelivery.onScoreFirst(() => syncHeaders('profile-answer')));
      syncHeaders('registered');
      plugin.addCommand({
        id: OPEN_PHRASE_COMMAND_ID,
        name: OPEN_PHRASE_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          // 2105: act on the tab that SHOWS the phrase (the active markdown view's leaf, as the Beat Box's commands do), and never fail silently (a `void` on a rejected promise is invisible).
          const active = app.workspace.getActiveViewOfType(MarkdownView);
          const target = choosePhraseTarget<WorkspaceLeaf>({
            scoreFirst,
            activeMarkdown: active ? { path: active.file?.path, leaf: active.leaf } : null,
            markdownLeaves: app.workspace.getLeavesOfType('markdown').map((l) => ({ path: l.view instanceof MarkdownView ? l.view.file?.path : null, leaf: l })),
            activePath: app.workspace.getActiveFile()?.path ?? null,
          });
          if (!target) return false;
          if (!checking) {
            const file = app.vault.getAbstractFileByPath(target.path);
            if (!(file instanceof TFile)) { new Notice(`${OPEN_PHRASE_COMMAND_NAME} failed: ${target.path} is not in this vault.`); return true; }
            openPhraseInLeaf(app, target.leaf ?? app.workspace.getLeaf(false), file).catch((e) => {
              console.error('Open phrase as Score failed', e);
              new Notice(`${OPEN_PHRASE_COMMAND_NAME} failed: ${(e as Error)?.message ?? e}`);
            });
          }
          return true;
        },
      });
    });
  });
}
