// 2026-10-31-1120 (M15c): the REAL description bar (description-bar-dom.ts) in real Chrome under Obsidian's own stylesheet, in a pane of a given width: the error sentence of a grammar error, the buttons that answer it, and the sentence
// service's preview. What is measured is what the stylesheet does to it: nothing overflows the pane, nothing is clipped, the buttons are real click targets and a REAL click reaches the owner.
import { mountDescriptionBar } from '@client/description-bar-dom.ts';

(window as any).__mount = (pane: HTMLElement) => {
  pane.innerHTML = '<p id="below" style="margin:0">the note below the bar</p>';
  const heard: string[] = ((window as any).__heard = []);
  const bar = mountDescriptionBar(pane, (a) => heard.push(a));
  (window as any).__bar = bar;
};
