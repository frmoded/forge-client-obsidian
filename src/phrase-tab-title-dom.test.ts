// 2026-10-30-1010 (0900 item (e)) - the phrase surface tells its tab when the TITLE changes, and only then: a note that is (or becomes) a transform asks for a new title once, an extend never does, a transform whose source changes asks again.
// The tab\'s getDisplayText and the leaf\'s updateHeader are the view\'s (linked-panes-wiring.test.ts, on the real PhraseView); here the surface is on its own, in a DOM, with a fake vault.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase } from './phrase-dom.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const TRANSFORM = (source: string): PhraseParams => ({ kind: 'transform', source, ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 } as any] });
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 };

function rig(first: PhraseParams) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['phrases/phrase_011.md', noteContentFor('phrase_011', first)]]);
  let told = 0;
  const handle = mountPhrase(parent, {
    path: 'phrases/phrase_011.md', title: 'phrase_011', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => ({ ok: true }),
    compute: async () => { throw new Error('no engine in this rig'); },
    renderInto: () => true, stopPlayers: () => {}, setTimer: () => 0, clearTimer: () => {},
    titleChanged: () => { told++; },
  });
  return { handle, files, told: () => told, rewrite: async (p: PhraseParams) => { files.set('phrases/phrase_011.md', noteContentFor('phrase_011', p)); handle.noteModified('phrases/phrase_011.md'); await flush(); } };
}

test('a note that is a transform tells the tab once, and params() is what the note says', async () => {
  const r = rig(TRANSFORM('phrases/phrase_003'));
  assert.equal(r.handle.params(), null, 'nothing is known before the note is read');
  await r.handle.load(); await flush();
  assert.equal(r.told(), 1);
  assert.deepEqual(r.handle.params()?.kind, 'transform');
});

test('an extend never tells the tab anything: its title is its file name and stays so (no change for any phrase but a transform)', async () => {
  const r = rig(EXTEND);
  await r.handle.load(); await flush();
  assert.equal(r.told(), 0);
  await r.rewrite({ ...EXTEND, bars: 6 }); assert.equal(r.told(), 0);
  assert.equal(r.handle.params()?.kind, 'extend');
});

test('a transform that is read again with the same source tells nothing more; one whose source changes tells again; one that stops being a transform tells once more (back to its file name)', async () => {
  const r = rig(TRANSFORM('phrases/phrase_003'));
  await r.handle.load(); await flush();
  assert.equal(r.told(), 1);
  await r.rewrite(TRANSFORM('phrases/phrase_003')); assert.equal(r.told(), 1, 'the same title: nothing to refresh');
  await r.rewrite(TRANSFORM('phrases/phrase_005')); assert.equal(r.told(), 2, 'another source: another title');
  await r.rewrite(EXTEND); assert.equal(r.told(), 3, 'no longer a transform: the file name again');
  await r.rewrite(EXTEND); assert.equal(r.told(), 3);
});

test('a note that cannot be read leaves the title alone (params() is null, the tab keeps what it shows)', async () => {
  const r = rig(EXTEND);
  r.files.set('phrases/phrase_011.md', 'not a phrase');
  await r.handle.load(); await flush();
  assert.equal(r.handle.params(), null);
  assert.equal(r.told(), 0);
});
