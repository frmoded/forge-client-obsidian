// score_first_experiment M4 (drain 2026-10-21-2010) — the two things the Score panel shows for what used to pop the Forge output panel open:
//   * a MESSAGE LINE under the status line: an error stays until the next successful draw (or a newer message); a success / LLM / out-of-date line lasts a few seconds;
// (The quiet "Forge log (N)" button that used to sit under it is gone, 2026-11-03-1155-91: the palette command "Open Forge log" opens the panel; every error a run writes to the panel is also on this line.)
// Pure DOM: no `obsidian` import. It only exists in a score-first vault's Beat Box tab (the area is given `messages` only there), so no other vault's DOM contains it.
import { TRANSIENT_LINE_MS, type ScoreMessage } from './score-first-messages-core.ts';

export const SCORE_MESSAGE_CLASS = 'forge-rhythm-score-message';

export interface ScoreMessagePorts {
  onScoreMessage(f: (m: ScoreMessage) => void): () => void;
}
export interface ScoreMessageTimers { setTimer(fn: () => void, ms: number): unknown; clearTimer(handle: unknown): void }

export interface ScoreMessages {
  /** A score has been drawn successfully: an error line that waited for it goes. */
  drawSucceeded(): void;
  dispose(): void;
}

/** Insert the message line right after `anchor` (the status line). */
export function mountScoreMessages(anchor: HTMLElement, ports: ScoreMessagePorts, timers: ScoreMessageTimers): ScoreMessages {
  const doc = anchor.ownerDocument;
  const line = doc.createElement('div');
  line.className = SCORE_MESSAGE_CLASS;
  line.setAttribute('aria-live', 'polite');
  anchor.after(line);

  let untilDraw = false;
  let timer: unknown = null;
  const cancelTimer = () => { if (timer !== null) { timers.clearTimer(timer); timer = null; } };
  const clearLine = () => { cancelTimer(); untilDraw = false; line.textContent = ''; line.classList.remove('is-error'); };

  const offMessage = ports.onScoreMessage((m) => {
    clearLine();                                        // a newer message replaces the one on show
    line.textContent = m.text;
    line.classList.toggle('is-error', m.kind === 'error');
    if (m.line.persistence === 'until-next-draw') untilDraw = true;
    else timer = timers.setTimer(() => { timer = null; clearLine(); }, TRANSIENT_LINE_MS);
  });

  return {
    drawSucceeded() { if (untilDraw) clearLine(); },
    dispose() { offMessage(); cancelTimer(); line.remove(); },
  };
}
