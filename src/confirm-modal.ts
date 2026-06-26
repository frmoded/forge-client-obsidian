// v0.2.205 — Implicit locking Phase 2.5 §2.2: confirmation modal
// over destructive overwrites. /generate over a hand-edited Recipe
// (or hand-edited Python that would re-derive on next Forge-click)
// must let cohort choose to abort vs proceed.
//
// Pre-Phase-2.5 the V2 /generate handler logged a forgeOutput info
// notice and proceeded. Cohort could miss the warning; the overwrite
// silently destroyed Recipe (or Python) hand-edits. Phase 2 §3.1
// closed the Forge-click side (Path Y); this modal closes the
// /generate side.

import { App, Modal } from 'obsidian';

export interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

/** Obsidian Modal subclass that resolves a Promise<boolean> when the
 *  user clicks confirm (true) or cancel (false) or closes the modal
 *  via Esc / click-outside (false, treated as cancel).
 *
 *  Usage:
 *    const ok = await new ConfirmModal(this.app, {
 *      title: 'Recipe was hand-edited',
 *      message: '/generate will overwrite. Continue?',
 *    }).openAndWait();
 *    if (!ok) return;
 */
export class ConfirmModal extends Modal {
  private resolved = false;
  private resolve!: (value: boolean) => void;
  private opts: ConfirmModalOptions;

  constructor(app: App, opts: ConfirmModalOptions) {
    super(app);
    this.opts = opts;
  }

  /** Open the modal and resolve once the user chooses. The modal
   *  closes itself before resolving. Repeated open calls are not
   *  supported — construct a new modal per dialog. */
  openAndWait(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.opts.title);
    contentEl.empty();
    contentEl.createEl('p', { text: this.opts.message });

    const btnRow = contentEl.createDiv({ cls: 'forge-confirm-modal-buttons' });
    // Cancel first (left), Confirm right — matches Obsidian's own
    // confirmation modal convention.
    const cancelBtn = btnRow.createEl('button', {
      text: this.opts.cancelText ?? 'Cancel',
    });
    cancelBtn.addEventListener('click', () => {
      this.resolveOnce(false);
      this.close();
    });

    const confirmBtn = btnRow.createEl('button', {
      text: this.opts.confirmText ?? 'Continue',
      cls: 'mod-cta',
    });
    confirmBtn.addEventListener('click', () => {
      this.resolveOnce(true);
      this.close();
    });
    confirmBtn.focus();
  }

  onClose() {
    // Esc / click-outside dismissal: treat as cancel.
    if (!this.resolved) {
      this.resolveOnce(false);
    }
    this.contentEl.empty();
  }

  private resolveOnce(value: boolean) {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(value);
  }
}
