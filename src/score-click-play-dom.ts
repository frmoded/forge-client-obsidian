// 2026-10-23-0030 — the Score's click-to-play, in plain DOM (no obsidian, no Verovio, no player library import) so a happy-dom test runs the very handler the music edition attaches: a click on an
// engraved note jumps the player to that note and starts it — unless `allowed()` says no, in which case NOTHING happens (no time lookup, no currentTime, no start) and the click is left alone: it is not
// stopped or cancelled, so every other listener on the Score (the inspector's pin) sees it exactly as before.

export interface ClickToPlayPlayer {
  currentTime: number;
  start(): unknown;
}

export interface ClickToPlayPorts {
  /** The time, in seconds on the PLAYER's timeline, of the engraved note with this element id. */
  timeFor(noteId: string): Promise<number>;
  /** Asked at EVERY click, before anything else. Absent = always (every vault that is not score-first). */
  allowed?(): boolean;
  onError(e: unknown): void;
}

export function attachClickToPlay(scoreWrap: HTMLElement, player: ClickToPlayPlayer, ports: ClickToPlayPorts): void {
  scoreWrap.addEventListener('click', async (ev) => {
    if (ports.allowed && !ports.allowed()) return;
    const target = ev.target as Element | null;
    const noteEl = target?.closest('.note') as Element | null;
    if (!noteEl?.id) return;
    try {
      player.currentTime = await ports.timeFor(noteEl.id);
      player.start();
    } catch (e) {
      ports.onError(e);
    }
  });
}
