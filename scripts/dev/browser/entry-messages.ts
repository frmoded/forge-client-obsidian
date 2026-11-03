// 2026-11-03-1155-9 (PRIORITY): the REAL description bar and the REAL phrase tab (strip, live Score, notebook, inspector) in one pane in real Chrome - what a person triple-clicks, copies, and drags over. entry-phrase.ts mounts the phrase and its vault
// stand-in (this file only adds the bar and a clipboard stub, so the Copy button's click can be read).
import './entry-phrase.ts';
import { mountDescriptionBar } from '@client/description-bar-dom.ts';

(window as any).__clipWrites = [];
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => { (window as any).__clipWrites.push(t); } }, configurable: true });       // http://127.0.0.1 is not a secure context: the page has no clipboard of its own
(window as any).__mountBar = (pane: HTMLElement) => { const heard: string[] = ((window as any).__heard = []); (window as any).__bar = mountDescriptionBar(pane, (a) => heard.push(a)); };
