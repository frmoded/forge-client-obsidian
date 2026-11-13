// 2026-11-13-1211 - the description controller's PORTS as the score-first plugin builds them, in ONE place with no `obsidian` import: score-first.ts calls it with the vault and the workspace, and the test calls it with a vault
// stand-in, so the test runs the very mapping (settings -> askPlan / configured, folders -> bar and phrase names) the plugin runs, not a hand-built stand-in of it.
import type { DescriptionPorts } from './description-apply.ts';
import { BAR_FOLDER_NAME, PHRASE_FOLDER } from './phrase-core.ts';

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
}
/** What the plugin's settings give (main.ts): the sentence service call, whether it is set up, the person's own key, the service version. */
export interface DescriptionHooks {
  askPlan?: DescriptionPorts['askPlan'];
  planConfigured?: () => boolean;
  ownKey?: () => string | undefined;
  serviceVersion?: () => Promise<string | null>;
}

export function descriptionPortsFor(env: DescriptionEnv, hooks: DescriptionHooks): DescriptionPorts {
  const folderNames = (folder: string): string[] => env.basenamesIn(folder).filter((n) => n !== 'README');
  return {
    read: (p) => env.read(p),
    process: (p, fn) => env.process(p, fn),
    vault: () => ({ bars: folderNames(BAR_FOLDER_NAME), phrases: folderNames(PHRASE_FOLDER), arrangements: folderNames('arrangements'), compositions: folderNames('compositions'), kits: folderNames('kits') }),
    barNames: () => folderNames(BAR_FOLDER_NAME), phraseNames: () => folderNames(PHRASE_FOLDER),
    setTimer: env.setTimer, clearTimer: env.clearTimer,
    trace: env.trace, warn: env.warn,
    panes: env.panes,
    askPlan: hooks.askPlan ? (payload) => hooks.askPlan!(payload) : undefined,
    configured: hooks.planConfigured,
    ownKey: () => hooks.ownKey?.(),
    serviceVersion: () => (hooks.serviceVersion ? hooks.serviceVersion() : Promise.resolve(null)),      // 2026-11-12-1206: an arrangement or composition sentence answered without a version asks /health once
    ...(env.confirm ? { confirm: env.confirm } : {}),
  };
}
