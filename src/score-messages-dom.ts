// score_first_experiment M4 (drain 2026-10-21-2010) — the two things the Score panel shows for what used to pop the Forge output panel open:
//   * a MESSAGE LINE under the status line: an error stays until the next successful draw (or a newer message); a success / LLM / out-of-date line lasts a few seconds;
//   * a quiet "Forge log (N)" button that opens the panel (a person's own gesture); N = messages that reached the panel since it was last open.
// Pure DOM: no `obsidian` import. It only exists in a score-first vault's Beat Box tab (the area is given `messages` only there), so no other vault's DOM contains either element.
import { TRANSIENT_LINE_MS, type ScoreMessage } from './score-first-messages-core.ts';

export const SCORE_MESSAGE_CLASS = 'forge-rhythm-score-message';
export const FORGE_LOG_CLASS = 'forge-rhythm-forge-log';
export const forgeLogLabel = (n: number) => `Forge log (${n})`;

export interface ScoreMessagePorts {
  onScoreMessage(f: (m: ScoreMessage) => void): () => void;
  onUnread(f: (n: number) => void): () => void;
  unreadCount(): number;
  openForgeLog(): void;
}
export interface ScoreMessageTimers { setTimer(fn: () => void, ms: number): unknown; clearTimer(handle: unknown): void }

export interface ScoreMessages {
  /** A score has been drawn successfully: an error line that waited for it goes. */
  drawSucceeded(): void;
  dispose(): void;
}

/** Insert the message line and the log button right after `anchor` (the status line). */
export function mountScoreMessages(anchor: HTMLElement, ports: ScoreMessagePorts, timers: ScoreMessageTimers): ScoreMessages {
  const doc = anchor.ownerDocument;
  const line = doc.createElement('div');
  line.className = SCORE_MESSAGE_CLASS;
  line.setAttribute('aria-live', 'polite');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = FORGE_LOG_CLASS;
  anchor.after(line, button);

  let untilDraw = false;
  let timer: unknown = null;
  const cancelTimer = () => { if (timer !== null) { timers.clearTimer(timer); timer = null; } };
  const clearLine = () => { cancelTimer(); untilDraw = false; line.textContent = ''; line.classList.remove('is-error'); };
  const paintCount = (n: number) => {
    button.textContent = forgeLogLabel(n);
    button.setAttribute('aria-label', n === 0 ? 'Open the Forge log' : `Open the Forge log, ${n} new message${n === 1 ? '' : 's'}`);
    button.title = 'Open the Forge panel (everything the plugin said is there)';
  };
  paintCount(ports.unreadCount());
  button.addEventListener('click', () => { console.log('[forge-log] Forge log button clicked'); ports.openForgeLog(); });

  const offMessage = ports.onScoreMessage((m) => {
    clearLine();                                        // a newer message replaces the one on show
    line.textContent = m.text;
    line.classList.toggle('is-error', m.kind === 'error');
    if (m.line.persistence === 'until-next-draw') untilDraw = true;
    else timer = timers.setTimer(() => { timer = null; clearLine(); }, TRANSIENT_LINE_MS);
  });
  const offUnread = ports.onUnread(paintCount);

  return {
    drawSucceeded() { if (untilDraw) clearLine(); },
    dispose() { offMessage(); offUnread(); cancelTimer(); line.remove(); button.remove(); },
  };
}
