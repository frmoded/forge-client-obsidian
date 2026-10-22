// score_first_experiment M1 (drain 2026-10-21-1100) — "New bar": the one-minute fast path from an empty score-first vault to a first bar you can hear and see.
//
// The Obsidian-coupled half (the decisions are in score-first-core.ts, the gate in vault-profile-core.ts). In a vault that is NOT score-first NOTHING is registered that a
// person can see: no "New bar" command and no ribbon button are registered. The vault's profile is a constant, so both are added once, when the workspace is ready; a forge.toml
// edited mid-session to ADD the profile takes effect on the next load.

import { Notice, TFile, type Plugin } from 'obsidian';
import { isScoreFirstVault } from './vault-profile-core.ts';
import { BAR_FOLDER, createNewBar, isFileExistsError, newBarAvailable, scorePanelPlan } from './score-first-core.ts';
import { messageDelivery } from './score-first-messages-core.ts';
import { musicEdition } from './music-edition-selected.ts';
import { PHRASE_FOLDER, PHRASE_VIEW_TYPE, createNewPhrase, isPhrasePath, newPhraseAvailable } from './phrase-core.ts';
import { PhraseView, openPhrase, openPhraseHere } from './phrase-view.ts';

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
  const refresh = async () => { scoreFirst = await isScoreFirstVault(app.vault); messageDelivery.setScoreFirst(scoreFirst); };
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
      plugin.registerView(PHRASE_VIEW_TYPE, (leaf) => new PhraseView(leaf, plan));
      plugin.addCommand({
        id: NEW_PHRASE_COMMAND_ID,
        name: NEW_PHRASE_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!newPhraseAvailable({ scoreFirst, activePath: activePath() })) return false;
          if (!checking) void createPhrase();
          return true;
        },
      });
      plugin.addCommand({
        id: OPEN_PHRASE_COMMAND_ID,
        name: OPEN_PHRASE_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          const file = app.workspace.getActiveFile();
          if (!scoreFirst || !file || !isPhrasePath(file.path)) return false;
          if (!checking) void openPhraseHere(app, file);
          return true;
        },
      });
    });
  });
}
