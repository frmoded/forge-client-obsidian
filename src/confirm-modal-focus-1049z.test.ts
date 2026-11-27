// 2026-11-27-1049z: the Detach confirm puts focus on Cancel (`focusCancel`), so Enter does not detach (Detach cannot be undone). Every other ConfirmModal asks as before.
// ENTER: ConfirmModal has no key handler of its own and Obsidian's Modal scope binds Escape only, so Enter is the browser's own: it clicks the focused button.
// THE HOST (pins a MECHANISM, read from Obsidian's app.js 1.12.7 and 1.15.1, not run): Modal.open() calls onOpen() and THEN, with a physical keyboard, focuses the first focusable element of the dialog (here: Cancel). Without one, the focus onOpen set stays.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const win = new Window();
const doc = win.document as any;
const HP = win.HTMLElement.prototype as any;
HP.createEl = function (tag: string, o: { text?: string; cls?: string } = {}) { const e = doc.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; this.appendChild(e); return e; };
HP.createDiv = function (o?: { cls?: string }) { return this.createEl('div', o); };
HP.setText = function (t: string) { this.textContent = t; };
HP.empty = function () { this.textContent = ''; };

let physicalKeyboard = false;
class HostModal {
  containerEl: any = doc.createElement('div');
  modalEl: any = this.containerEl.createDiv({ cls: 'modal' });
  titleEl: any = this.modalEl.createDiv({ cls: 'modal-title' });
  contentEl: any = this.modalEl.createDiv({ cls: 'modal-content' });
  app: unknown;
  constructor(app: unknown) { this.app = app; }
  onOpen(): void {}
  onClose(): void {}
  open(): void {
    doc.body.appendChild(this.containerEl); this.onOpen();
    if (physicalKeyboard) this.modalEl.querySelector('a[href], button, input, select, textarea, [tabindex]')?.focus();
  }
  close(): void { this.containerEl.remove(); this.onClose(); }
}

let ConfirmModal: typeof import('./confirm-modal.ts').ConfirmModal;
before(async () => {
  (globalThis as any).__confirmHostModal = HostModal;
  const { build } = createRequire(path.join(SRC, '..', 'package.json'))('esbuild');
  const out = await build({
    entryPoints: [path.join(SRC, 'confirm-modal.ts')], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    plugins: [{ name: 'host-modal', setup: (b: any) => { b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' })); b.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: 'export const Modal = globalThis.__confirmHostModal;' })); } }],
  });
  ConfirmModal = (await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)).ConfirmModal;
});
after(async () => { await win.happyDOM.close(); });

/** Enter as the browser does it: the keydown goes to the focused element; unless a handler stops it, a focused button is clicked. */
const pressEnter = (d: any): void => {
  const target = d.activeElement;
  const KeyboardEvent = d.defaultView.KeyboardEvent;
  if (target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) && target.tagName === 'BUTTON') target.click();
};
/** Opens the dialog, says which button holds the focus, presses Enter, and says what the caller was answered. */
const openThenEnter = async (opts: { focusCancel?: boolean }): Promise<{ focused: string; answer: boolean | 'unanswered' }> => {
  const answer = new ConfirmModal({} as never, { title: 'T', message: 'M', confirmText: 'Go', cancelText: 'Cancel', ...opts }).openAndWait();
  const focused = doc.activeElement.textContent as string;
  pressEnter(doc);
  return { focused, answer: await Promise.race([answer, new Promise<'unanswered'>((r) => setImmediate(() => r('unanswered')))]) };
};

test('1049z `focusCancel`: Cancel holds the focus after open and Enter answers false', async () => {
  physicalKeyboard = false;
  assert.deepEqual(await openThenEnter({ focusCancel: true }), { focused: 'Cancel', answer: false });
});

test('1049z without `focusCancel` (absent or false): the dialog focuses its confirm button and Enter answers true, as before', async () => {
  physicalKeyboard = false;
  assert.deepEqual(await openThenEnter({}), { focused: 'Go', answer: true });
  assert.deepEqual(await openThenEnter({ focusCancel: false }), { focused: 'Go', answer: true });
});

test('1049z with a physical keyboard the host focuses the first button after onOpen (Cancel): `focusCancel` agrees with it', async () => {
  physicalKeyboard = true;
  assert.deepEqual(await openThenEnter({ focusCancel: true }), { focused: 'Cancel', answer: false });
  assert.deepEqual(await openThenEnter({}), { focused: 'Cancel', answer: false });
});

test('1049z the Detach dialog of the real plugin opens with the focus on Cancel: Enter writes nothing and closes it', async () => {
  const x = await musicTabsWorld(await realMusicPlugin());
  try {
    await x.restoreTab('forge-phrase', 'phrases/phrase_001.md');
    (x.plugin.commands.get('detach-to-custom-python') as { checkCallback: (checking: boolean) => boolean }).checkCallback(false); await x.settle(60);
    assert.equal(x.modals.length, 1);
    const d = x.modals[0].contentEl.ownerDocument;
    assert.equal(d.activeElement?.textContent, 'Cancel');
    pressEnter(d); await x.settle(800);
    assert.equal(x.modals[0].closed, true);
    assert.deepEqual(x.writes, []);
  } finally { x.done(); }
});
