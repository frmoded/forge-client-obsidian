// 2026-10-27-1015 — "New phrase from a sentence": the Obsidian Modal around sentence-plan-dom.ts (which is tested without Obsidian). Nothing but the frame lives here.
import { Modal, type App } from 'obsidian';
import type { SentencePlanner } from './sentence-plan-core.ts';
import { mountSentencePlan } from './sentence-plan-dom.ts';

export class SentencePlanModal extends Modal {
  private planner: SentencePlanner;
  private barNames: readonly string[];

  constructor(app: App, planner: SentencePlanner, barNames: readonly string[]) {
    super(app);
    this.planner = planner;
    this.barNames = barNames;
  }

  onOpen(): void {
    mountSentencePlan(this.contentEl, { planner: this.planner, barNames: this.barNames, close: () => { this.close(); } });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
