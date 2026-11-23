// 2026-11-13-1211 - the description controller's PORTS as the score-first plugin builds them, in ONE place with no `obsidian` import: score-first.ts calls it with the vault and the workspace, and the test calls it with a vault
// stand-in, so the test runs the very mapping (settings -> askPlan / configured, folders -> bar and phrase names) the plugin runs, not a hand-built stand-in of it.
import type { DescriptionPorts } from './description-apply.ts';
import { BAR_FOLDER_NAME, PHRASE_FOLDER } from './phrase-core.ts';
import type { undoCopy } from './duplicate-undo-core.ts';
import { listModel } from './list-model-selected.ts';       // 2026-11-19-0997: Duplicate's cores come through the list-model seam (lean: stubs that refuse), not by import

/** What the plugin supplies from Obsidian (the vault, the workspace, window timers, the console, a modal). */
export interface DescriptionEnv {
  read(path: string): Promise<string>;
  process(path: string, fn: (current: string) => string): Promise<void>;
  /** basenames of the files under a vault folder (no README is removed here: the wiring does that, as it always did) */
  basenamesIn(folder: string): string[];
  panes: DescriptionPorts['panes'];
  setTimer: DescriptionPorts['setTimer'];
  clearTimer: DescriptionPorts['clearTimer'];
  trace(line: string): void;
  warn(line: string): void;
  confirm?: DescriptionPorts['confirm'];
  /** 2026-11-19-0992 (Duplicate): create a NEW note (rejects with Obsidian's "File already exists." rather than overwrite), whether a path exists, and whether an error is that refusal. All three present = the sentence can make copies; absent = it is refused in words. */
  create?(path: string, content: string): Promise<unknown>;
  exists?(path: string): boolean;
  isAlreadyExists?(e: unknown): boolean;
  /** 2026-11-19-0992a: move a note to the system trash (the plugin closes every tab that shows it first, then `vault.trash(file, true)`; it rejects when the note is still there). Absent = a copy is not an undo entry. */
  trash?(path: string): Promise<void>;
}
/** What the plugin's settings give (main.ts): the sentence service call, whether it is set up, the person's own key, the service version. */
export interface DescriptionHooks {
  askPlan?: DescriptionPorts['askPlan'];
  planConfigured?: () => boolean;
  ownKey?: () => string | undefined;
  serviceVersion?: () => Promise<string | null>;
  dialogStore?: DescriptionPorts['dialogStore'];
  /** 2026-11-21-1011: see DescriptionPorts.noteCtime. */
  noteCtime?: DescriptionPorts['noteCtime'];
  /** 2026-11-15-1217: is the status line under the box shown (the legacy view)? */
  showBoxStatus?: () => boolean;
  /** 2026-11-17-2001: the composer's switch (MUSIC_COMPOSER_AUTO_APPLY, default off) and its "+" menu. */
  composerAutoApply?: DescriptionPorts['composerAutoApply'];
  descriptionAtOnce?: DescriptionPorts['descriptionAtOnce'];          // 2026-11-23-1018
  composerMenu?: DescriptionPorts['composerMenu'];
  /** 2026-11-19-0992: the plugin's opener of a note by lineage id (a bar opens in the Beat Box): the links of the dialog use it. */
  openNote?: DescriptionPorts['openNote'];
  /** 2026-11-20-1004: the failed-prompt review queue's port (see DescriptionPorts). */
  failedPrompts?: DescriptionPorts['failedPrompts'];
}

export function descriptionPortsFor(env: DescriptionEnv, hooks: DescriptionHooks): DescriptionPorts {
  const folderNames = (folder: string): string[] => env.basenamesIn(folder).filter((n) => n !== 'README');
  const vault = () => ({ bars: folderNames(BAR_FOLDER_NAME), phrases: folderNames(PHRASE_FOLDER), arrangements: folderNames('arrangements'), compositions: folderNames('compositions'), kits: folderNames('kits') });
  const { create, exists, isAlreadyExists } = env;
  return {
    read: (p) => env.read(p),
    process: (p, fn) => env.process(p, fn),
    vault,
    barNames: () => folderNames(BAR_FOLDER_NAME), phraseNames: () => folderNames(PHRASE_FOLDER),
    setTimer: env.setTimer, clearTimer: env.clearTimer,
    trace: env.trace, warn: env.warn,
    panes: env.panes,
    askPlan: hooks.askPlan ? (payload) => hooks.askPlan!(payload) : undefined,
    configured: hooks.planConfigured,
    ownKey: () => hooks.ownKey?.(),
    serviceVersion: () => (hooks.serviceVersion ? hooks.serviceVersion() : Promise.resolve(null)),      // 2026-11-12-1206: an arrangement or composition sentence answered without a version asks /health once
    ...(hooks.dialogStore ? { dialogStore: hooks.dialogStore } : {}),
    ...(hooks.noteCtime ? { noteCtime: hooks.noteCtime } : {}),
    ...(hooks.showBoxStatus ? { showBoxStatus: hooks.showBoxStatus } : {}),
    ...(hooks.composerAutoApply ? { composerAutoApply: hooks.composerAutoApply } : {}),
    ...(hooks.descriptionAtOnce ? { descriptionAtOnce: hooks.descriptionAtOnce } : {}),
    ...(hooks.composerMenu ? { composerMenu: hooks.composerMenu } : {}),
    ...(env.confirm ? { confirm: env.confirm } : {}),
    ...(create && exists && isAlreadyExists ? { duplicate: (of: Parameters<NonNullable<DescriptionPorts['duplicate']>>[0]) => listModel.duplicate.duplicateNote({ read: (p) => env.read(p), listBasenames: (folder) => env.basenamesIn(folder), exists, create, isAlreadyExists, trace: (line) => env.trace(line) }, of, vault()) } : {}),
    ...(create && exists && isAlreadyExists && env.trash ? { undoCopy: (mark: Parameters<typeof undoCopy>[1]) => listModel.duplicate.undoCopy({ read: (p) => env.read(p), exists, trash: (p) => env.trash!(p) }, mark) } : {}),     // 2026-11-19-0992a: a copy is an undo entry only where the plugin can move it to the trash
    ...(hooks.openNote ? { openNote: hooks.openNote } : {}),
    failedPrompts: hooks.failedPrompts,
  };
}
