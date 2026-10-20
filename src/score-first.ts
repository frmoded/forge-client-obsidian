// score_first_experiment M1 (drain 2026-10-21-1100) — "New bar": the one-minute fast path from an empty score-first vault to a first bar you can hear and see.
//
// The Obsidian-coupled half (the decisions are in score-first-core.ts, the gate in vault-profile-core.ts). In a vault that is NOT score-first NOTHING is registered that a
// person can see: no "New bar" command and no ribbon button are registered. The vault's profile is a constant, so both are added once, when the workspace is ready; a forge.toml
// edited mid-session to ADD the profile takes effect on the next load.

import { Notice, TFile, type Plugin } from 'obsidian';
import { isScoreFirstVault } from './vault-profile-core.ts';
import { BAR_FOLDER, createNewBar, newBarAvailable } from './score-first-core.ts';

export const NEW_BAR_COMMAND_ID = 'new-bar';
export const NEW_BAR_COMMAND_NAME = 'New bar';

export interface ScoreFirstHooks {
  /** Open a rhythm note in the Beat Box (the plugin's own opener: a tab already showing the note is reused, else a new tab). */
  openRhythmNote(file: TFile): Promise<void>;
}

export function registerScoreFirst(plugin: Plugin, hooks: ScoreFirstHooks): void {
  const app = plugin.app;
  let scoreFirst = false;
  const refresh = async () => { scoreFirst = await isScoreFirstVault(app.vault); };

  const createBar = (): Promise<unknown> => createNewBar<TFile>({
    folderExists: () => app.vault.getAbstractFileByPath(BAR_FOLDER) !== null,
    createFolder: async () => { await app.vault.createFolder(BAR_FOLDER); },
    listBarBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${BAR_FOLDER}/`)).map((f) => f.basename),
    exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
    create: (p, content) => app.vault.create(p, content),
    open: (file) => hooks.openRhythmNote(file),
    notify: (message) => { new Notice(message); },
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
    });
  });
}
