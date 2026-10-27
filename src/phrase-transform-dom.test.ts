// 2026-10-27-1030: the strip of a TRANSFORM tab (plain DOM, no obsidian import). A transform has no controls in this slice (the notebook makes and unmakes it): the strip names the source phrase (a button that opens it) and lists the ops
// in words, read-only. A transform the tab cannot read says so. Same group and status line as the other strips, so the tab looks like its siblings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountTransformStrip } from './phrase-transform-dom.ts';
import type { PhraseParams } from './phrase-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const T: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }, { op: 'double_up', first: 7, last: 9, grid: 16 }] };

function rig() {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const opened: string[] = [];
  const h = mountTransformStrip(parent, { openSource: (id) => opened.push(id) });
  return { parent, h, opened, q: (s: string) => parent.querySelector(s) as any };
}

test('what the strip shows: a group named Phrase, the source phrase as a button, the ops in words one per line, no controls', () => {
  const r = rig();
  r.h.set(T);
  assert.equal(r.h.el.className, 'forge-phrase-controls forge-transform-strip');
  assert.equal(r.h.el.getAttribute('role'), 'group');
  assert.equal(r.h.el.getAttribute('aria-label'), 'Phrase');
  assert.equal(r.q('.forge-transform-label').textContent, 'Transform of');
  const source = r.q('button.forge-phrase-source');
  assert.equal(source.textContent, 'phrase_006');
  assert.equal(source.getAttribute('aria-label'), 'Open phrase_006');
  assert.equal(source.type, 'button');
  assert.deepEqual([...r.parent.querySelectorAll('.forge-transform-ops li')].map((li: any) => li.textContent), [
    'thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats',
    'double up bars 7 to 9: every hit gets a second one a step later',
  ]);
  assert.equal(r.parent.querySelectorAll('input, select, textarea').length, 0, 'read-only: no controls');
  assert.equal(r.q('.forge-phrase-status').getAttribute('role'), 'status');
});

test('the source button opens the source phrase note; a set() with another transform replaces the ops; a phrase of another kind or none says it cannot be read', () => {
  const r = rig();
  r.h.set(T);
  r.q('button.forge-phrase-source').click();
  assert.deepEqual(r.opened, ['phrases/phrase_006']);
  r.h.set({ kind: 'transform', source: 'phrases/phrase_009', ops: [{ op: 'double_up', first: 1, last: 1, grid: 8 }] });
  assert.equal(r.q('button.forge-phrase-source').textContent, 'phrase_009');
  assert.deepEqual([...r.parent.querySelectorAll('.forge-transform-ops li')].map((li: any) => li.textContent), ['double up bar 1: every hit gets a second one a step later (grid 8)']);
  r.h.set(null);
  assert.equal(r.q('.forge-transform-label').textContent, 'This transform could not be read.');
  assert.equal(r.parent.querySelector('button.forge-phrase-source'), null);
  assert.equal(r.parent.querySelectorAll('.forge-transform-ops li').length, 0);
});

test('the status line shows what it is told and clears; dispose takes the strip out; a strip made without an opener has a source that does nothing', () => {
  const r = rig();
  r.h.set(T);
  r.h.setStatus('Not saved: x');
  assert.equal(r.q('.forge-phrase-status').textContent, 'Not saved: x');
  r.h.setStatus('');
  assert.equal(r.q('.forge-phrase-status').textContent, '');
  r.h.dispose();
  assert.equal(r.parent.querySelector('.forge-transform-strip'), null);
  const parent = win.document.createElement('div');
  const bare = mountTransformStrip(parent, {});
  bare.set(T);
  assert.doesNotThrow(() => (parent.querySelector('button.forge-phrase-source') as any).click());
});
