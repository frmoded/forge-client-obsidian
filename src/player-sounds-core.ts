// 2026-10-31-1135 (CCQA smoke 10, A) - a failed soundfont fetch must not be an uncaught rejection that leaves the player on "!" until a reload. html-midi-player (the <midi-player> element) loads the samples as soon as a note sequence
// is set (`initPlayerNow`, run from a setTimeout), sets its own error state - the Play button DISABLED - and rethrows. This guards that one place: the failure is caught, ONE evidence line and ONE sentence are said, the Play button is
// usable again, and the next Play loads the sounds again (and plays when they came). Pure: the element is a structural type, the line and the sentence go to ports.

export const SOUNDS_FAILED_MESSAGE = 'Sounds could not be loaded (network). Press Play to try again.';
export const soundsFailedLine = (reason: string): string => `[forge-player] sounds could not be loaded: ${reason.split('\n')[0].trim() || 'unknown reason'}`;

/** The parts of the <midi-player> element the guard touches. */
export interface SoundsElement {
  initPlayerNow(...args: unknown[]): Promise<unknown>;
  start(): void;
  playButton: { disabled: boolean };
  controlPanel: { addEventListener(type: 'click', fn: (e: Event) => void, capture: boolean): void; removeEventListener(type: 'click', fn: (e: Event) => void, capture: boolean): void };
}
export interface SoundsPorts {
  /** The evidence line (Error level in the glue). */
  log(line: string): void;
  /** The sentence beside the player; `null` = take it away. */
  say(message: string | null): void;
}

export function guardPlayerSounds(el: SoundsElement, ports: SoundsPorts): { dispose(): void } {
  const original = el.initPlayerNow;
  let failed = false;
  let retrying: Promise<boolean> | null = null;
  /** One load, never rejecting: true = the sounds are there. */
  const load = async (args: unknown[]): Promise<boolean> => {
    try {
      await original.apply(el, args);
      if (failed) { failed = false; ports.say(null); }
      return true;
    } catch (e) {
      failed = true;
      ports.log(soundsFailedLine((e as Error)?.message ?? String(e)));
      ports.say(SOUNDS_FAILED_MESSAGE);
      el.playButton.disabled = false;                       // the library disabled it with its error state: a Play to press is how the next try starts
      return false;
    }
  };
  el.initPlayerNow = (...args: unknown[]) => load(args);
  // Capture phase on the control panel: it runs before the button's own handler (the library's start), so a click on a failed player is a retry, not a start of a player with no sounds.
  const onClick = (e: Event): void => {
    if (!failed) return;
    e.stopPropagation();
    if (retrying !== null) return;                           // a retry is already in flight
    retrying = load([]).then((ok) => { retrying = null; if (ok) el.start(); return ok; });
  };
  el.controlPanel.addEventListener('click', onClick, true);
  return { dispose() { el.controlPanel.removeEventListener('click', onClick, true); el.initPlayerNow = original; } };
}
