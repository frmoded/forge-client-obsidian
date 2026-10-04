// Pure-core: find every <midi-player> element under a given root and
// stop its audio.
//
// Cohort UX bug (driver 2026-07-01): a music snippet's audio kept
// playing when the user (a) clicked "Clear" on the output panel,
// (b) toggled between drum-kit and staff display modes, or (c)
// re-Forge-clicked the same snippet. html-midi-player's audio
// context lives beyond the DOM element's lifetime — removing the
// <midi-player> from the DOM doesn't dispose its scheduled notes.
//
// Fix shape: before any teardown that removes <midi-player>
// elements (outputEl.empty(), scoreHost.empty(), onClose), call
// `stopMidiPlayersIn(root)` to find every <midi-player> descendant
// and invoke `.stop()`. The element is then safe to remove.
//
// Lives in its own file so node --test can lock the lookup behavior
// (querySelectorAll + best-effort stop) without spinning up an
// Obsidian view.

/** Structural interface — captures the two API surfaces this helper
 *  touches. The real <midi-player> custom element implements both;
 *  any other player can be stopped this way too if it exposes them. */
export interface StoppablePlayer {
  stop?: () => void;
  pause?: () => void;
}

/** Structural element — captures querySelectorAll. The real HTMLElement
 *  is a superset; tests pass a stub. */
export interface QueryRoot {
  querySelectorAll: (selector: string) => ArrayLike<unknown>;
}

/** Find every `<midi-player>` element under `root` and try `stop()`,
 *  then `pause()`, on each. Returns the number of players touched.
 *
 *  Best-effort: a player that throws is logged and skipped so one
 *  broken instance doesn't strand siblings. Players without either
 *  method (shouldn't happen in practice — html-midi-player exposes
 *  both) are also skipped silently.
 *
 *  Selector hardcoded to `midi-player` since html-midi-player
 *  registers exactly that custom element name. */
export function stopMidiPlayersIn(
  root: QueryRoot | null | undefined,
  log: (msg: string, err: unknown) => void = () => {},
): number {
  if (!root) return 0;
  let touched = 0;
  let players: ArrayLike<unknown>;
  try {
    players = root.querySelectorAll('midi-player');
  } catch (e) {
    log('stopMidiPlayersIn: querySelectorAll failed', e);
    return 0;
  }
  for (let i = 0; i < players.length; i++) {
    const player = players[i] as StoppablePlayer;
    try {
      if (typeof player.stop === 'function') {
        player.stop();
        touched += 1;
      } else if (typeof player.pause === 'function') {
        player.pause();
        touched += 1;
      }
    } catch (e) {
      log('stopMidiPlayersIn: stop/pause failed on a player', e);
    }
  }
  return touched;
}
