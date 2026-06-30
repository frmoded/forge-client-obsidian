// v0.2.230 — RewriteSuggestionModal (drain 2026-07-02-1400).
//
// When forge-transpile's /generate detects a procedural Description
// (proceduralness score above PROCEDURALNESS_THRESHOLD), the response
// carries a `pushback` field. The plugin opens this modal so cohort
// can:
//   - "Use as-is" — proceed with the Recipe that was generated from
//     the original Description.
//   - "Cancel" — dismiss; nothing happens, no Recipe lands.
//
// Non-blocking: the cohort can always override (use the original
// Description's Recipe). The modal teaches the intent-vs-procedure
// distinction through surfacing the score + the original prose.

import { App, Modal } from 'obsidian';

export interface RewriteSuggestionModalOptions {
  /** The proceduralness score from the service (0.0–1.0). */
  proceduralness: number;
  /** The original Description prose. */
  original: string;
  /** Called when cohort chooses to proceed with the original-Description
   *  Recipe. */
  onUseAsIs: () => void;
  /** Called when cohort dismisses (Cancel or Esc). */
  onCancel: () => void;
}

export class RewriteSuggestionModal extends Modal {
  private opts: RewriteSuggestionModalOptions;
  private decided = false;

  constructor(app: App, opts: RewriteSuggestionModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('Your Description reads like a Recipe');
    contentEl.empty();

    const intro = contentEl.createDiv({ cls: 'forge-rewrite-intro' });
    intro.createEl('p', {
      text: (
        'A good Description expresses intent ("a slow blues with vocal lead "'
        + 'and drums underneath"). Recipe is the structured plan; Python is '
        + 'compiled from Recipe. When the Description names individual chip '
        + 'calls or step sequences, the LLM has no interpretive work — it '
        + 'just transliterates prose into code.'
      ),
    });

    const scoreLine = contentEl.createDiv({ cls: 'forge-rewrite-score' });
    scoreLine.createEl('strong', { text: 'Proceduralness: ' });
    scoreLine.appendText(`${(this.opts.proceduralness * 100).toFixed(0)}%`);

    const originalLabel = contentEl.createEl('h4', { text: 'Your Description:' });
    void originalLabel;
    const originalBox = contentEl.createEl('pre', { cls: 'forge-rewrite-original' });
    originalBox.createEl('code', { text: this.opts.original });

    const tip = contentEl.createDiv({ cls: 'forge-rewrite-tip' });
    tip.createEl('p', {
      text: (
        'Tip: rewrite as intent-level prose — what you mean, what the '
        + 'output should feel like — and try generate again. The Recipe '
        + 'gets to do the structural work; your Description gets to '
        + 'carry the vibe.'
      ),
    });

    const btnRow = contentEl.createDiv({ cls: 'forge-rewrite-buttons' });
    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.decide(false);
      this.close();
    });
    const proceedBtn = btnRow.createEl('button', {
      text: 'Use as-is (Recipe already generated)',
      cls: 'mod-cta',
    });
    proceedBtn.addEventListener('click', () => {
      this.decide(true);
      this.close();
    });
  }

  onClose() {
    // Treat Esc / click-outside dismissal as Cancel.
    if (!this.decided) {
      this.decide(false);
    }
    this.contentEl.empty();
  }

  private decide(useAsIs: boolean) {
    if (this.decided) return;
    this.decided = true;
    if (useAsIs) {
      this.opts.onUseAsIs();
    } else {
      this.opts.onCancel();
    }
  }
}
