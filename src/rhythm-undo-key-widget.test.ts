// 2026-11-19-0996 - the Beat Box page (rhythm_box.html, the REAL page in happy-dom) posts `forge-rhythm-undo` / `forge-rhythm-redo` to its host on Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y (the host has understood both since 0993: a key
// pressed INSIDE the widget's iframe never reaches the tab's own listener). Written RED first against the page of HEAD (it listened to no key at all). Pinned:
//   * which key combination posts which message, and the EXACT message shape the host reads (`{ type }` and nothing else);
//   * it posts only when the focus is on the grid, the circle, a button, a range slider, a select or the page body - never inside a text-entry control (a text-like <input>, a <textarea>, contenteditable): that field keeps its own undo;
//   * `preventDefault` happens exactly when it posts;
//   * it posts only to a host that loaded a note in `edit` mode: a standalone page, a page whose load was refused, and a PLAYGROUND (the `forge-rhythm` embed in an ordinary note) post nothing and leave the key alone;
//   * P3: every OTHER widget page of the vault is byte for byte what it was (sha-256 pin; move a hash only on purpose).
// A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { buildLoadMessage } from './rhythm-edit-core.ts';
import { ROCK, WIDGET_FILE, loadWidget, skip, type Harness } from './test-support/rhythm-widget-harness.ts';

const UNDO = { type: 'forge-rhythm-undo' };
const REDO = { type: 'forge-rhythm-redo' };
const steps = (h: Harness) => h.posted.filter((m) => m && (m.type === 'forge-rhythm-undo' || m.type === 'forge-rhythm-redo'));

test('the Beat Box page (rhythm_box.html) is found, so none of the tests below can skip (a missing page is a failure, never a skip)', () => { assert.equal(skip, false, String(skip)); assert.ok(WIDGET_FILE); });

/** A page hosted as a bar's Beat Box tab would host it: a fake parent, then the host's load message (edit mode). */
async function hosted(mode: 'edit' | 'playground' = 'edit'): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(buildLoadMessage(ROCK as never, 'bar_001', mode, null, false, false, false, []));
  return h;
}
/** Press a key at `target`; returns whether the page prevented the browser's own action. */
function press(h: Harness, target: any, init: Record<string, unknown>): boolean {
  const e = new h.win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented as boolean;
}
const KEY = {
  cmdZ: { key: 'z', metaKey: true }, ctrlZ: { key: 'z', ctrlKey: true },
  shiftCmdZ: { key: 'Z', metaKey: true, shiftKey: true }, shiftCtrlZ: { key: 'Z', ctrlKey: true, shiftKey: true },
  ctrlY: { key: 'y', ctrlKey: true },
};

test('every key combination that means undo or redo posts exactly its message (the shape the host reads), from the grid, the page body and a button', async () => {
  const cases: Array<[string, Record<string, unknown>, object]> = [
    ['Cmd+Z', KEY.cmdZ, UNDO], ['Ctrl+Z', KEY.ctrlZ, UNDO],
    ['Shift+Cmd+Z', KEY.shiftCmdZ, REDO], ['Shift+Ctrl+Z', KEY.shiftCtrlZ, REDO], ['Ctrl+Y', KEY.ctrlY, REDO],
    ['Shift+Cmd+Z with the lower-case letter some keyboards report', { key: 'z', metaKey: true, shiftKey: true }, REDO],
    ['Ctrl+Y typed with caps lock (upper-case Y)', { key: 'Y', ctrlKey: true }, REDO],
  ];
  const h = await hosted();
  for (const [what, init, want] of cases) {
    for (const [where, target] of [['a grid cell', h.cell('kick', 1)], ['the page body', h.doc.body], ['the play button', h.el('bPlay')]] as Array<[string, any]>) {
      const before = steps(h).length;
      const prevented = press(h, target, init);
      assert.deepEqual(steps(h).slice(before), [want], `${what} on ${where} posts one ${(want as { type: string }).type}`);
      assert.equal(prevented, true, `${what} on ${where}: the page took the key (preventDefault), so the browser does not also act on it`);
    }
  }
});

test('keys that are not undo or redo post nothing and are left alone: plain Z, Cmd+Alt+Z, Cmd+X, Cmd+Y, Ctrl+Shift+Y, Ctrl+Alt+Y, Shift+Z, Cmd+Shift+X, Alt+Z', async () => {
  const h = await hosted();
  const none: Array<[string, Record<string, unknown>]> = [
    ['plain Z', { key: 'z' }], ['plain Shift+Z', { key: 'Z', shiftKey: true }], ['Cmd+Alt+Z (a modifier mix)', { key: 'z', metaKey: true, altKey: true }],
    ['Ctrl+Alt+Z', { key: 'z', ctrlKey: true, altKey: true }], ['Cmd+Shift+Alt+Z', { key: 'Z', metaKey: true, shiftKey: true, altKey: true }], ['Alt+Z', { key: 'z', altKey: true }],
    ['Cmd+X', { key: 'x', metaKey: true }], ['Cmd+Shift+X', { key: 'X', metaKey: true, shiftKey: true }],
    ['plain Y', { key: 'y' }], ['Cmd+Y (the browser\'s history on a Mac)', { key: 'y', metaKey: true }], ['Ctrl+Shift+Y', { key: 'Y', ctrlKey: true, shiftKey: true }], ['Ctrl+Alt+Y', { key: 'y', ctrlKey: true, altKey: true }],
    ['Cmd+Ctrl+Y', { key: 'y', metaKey: true, ctrlKey: true }],
    ['Enter, Space and the arrows (the grid\'s own keys)', { key: 'Enter' }], ['Space', { key: ' ' }], ['ArrowRight', { key: 'ArrowRight' }],
  ];
  for (const [what, init] of none) {
    const prevented = press(h, h.cell('kick', 1), init);
    assert.deepEqual(steps(h), [], `${what} posts nothing`);
    assert.equal(prevented, false, `${what}: not taken (preventDefault only when it posts)`);
  }
});

test('inside a text-entry control the key is the field\'s own: a text, number, search or email input, a textarea, contenteditable (also a child of one) post nothing and are not prevented', async () => {
  const h = await hosted();
  const make = (tag: string, attrs: Record<string, string> = {}) => { const el: any = h.doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); h.doc.body.appendChild(el); return el; };
  const editable = make('div', { contenteditable: 'true' }); const child = h.doc.createElement('span'); editable.appendChild(child);
  const targets: Array<[string, any]> = [
    ['a text input', make('input', { type: 'text' })], ['an input with no type (text)', make('input')], ['a number input', make('input', { type: 'number' })],
    ['a search input', make('input', { type: 'search' })], ['an email input', make('input', { type: 'email' })], ['a textarea', make('textarea')],
    ['a contenteditable div', editable], ['a span inside a contenteditable div', child], ['contenteditable="" (an empty value is "true")', make('div', { contenteditable: '' })],
    ['contenteditable="plaintext-only"', make('div', { contenteditable: 'plaintext-only' })],
  ];
  for (const [what, el] of targets) {
    for (const [name, init] of Object.entries(KEY)) {
      const prevented = press(h, el, init);
      assert.deepEqual(steps(h), [], `${what}: ${name} posts nothing`);
      assert.equal(prevented, false, `${what}: ${name} is left to the field`);
    }
  }
  const off = make('div', { contenteditable: 'false' });
  assert.equal(press(h, off, KEY.cmdZ), true, 'contenteditable="false" is not editable: the key posts'); assert.deepEqual(steps(h), [UNDO]);
});

test('the widget\'s OWN controls: a range slider (swing, volume) and a select (time signature, add instrument) have no text undo, so the key posts from them too; a mid-composition key (IME) never does', async () => {
  const h = await hosted();
  for (const id of ['swing', 'volume', 'timeSig', 'addInstrument']) {
    const el = h.el(id); assert.ok(el, id);
    const before = steps(h).length;
    assert.equal(press(h, el, KEY.cmdZ), true, `${id}: Cmd+Z`); assert.equal(press(h, el, KEY.shiftCmdZ), true, `${id}: Shift+Cmd+Z`);
    assert.deepEqual(steps(h).slice(before), [UNDO, REDO], id);
  }
  const before = steps(h).length;
  assert.equal(press(h, h.cell('kick', 1), { ...KEY.cmdZ, isComposing: true }), false); assert.equal(steps(h).length, before, 'an IME composition keeps its own keys');
});

test('the circle view: Cmd+Z with focus on the ring posts too, and the ring\'s own arrow keys are untouched', async () => {
  const h = await hosted();
  h.el('bViewCircle').click(); await new Promise((r) => setTimeout(r, 5));
  const ring = h.el('circle'); assert.ok(ring);
  assert.equal(press(h, ring, KEY.cmdZ), true); assert.deepEqual(steps(h), [UNDO]);
  assert.equal(press(h, ring, { key: 'ArrowRight' }), false, 'the ring\'s keydown handler (no focused cell here) is as it was; the new handler adds nothing to it');
});

test('a page that is not a bar tab\'s widget posts nothing and leaves the key alone: standalone (no host), before any load, after a REFUSED load, and a PLAYGROUND (the `forge-rhythm` embed in an ordinary note)', async () => {
  const alone = await loadWidget(false);
  for (const init of Object.values(KEY)) assert.equal(press(alone, alone.cell('kick', 1), init), false, 'standalone: the browser\'s own');
  assert.deepEqual(alone.posted, []);

  const unloaded = await loadWidget(true);                                                         // a host, but no load message yet
  for (const init of Object.values(KEY)) assert.equal(press(unloaded, unloaded.doc.body, init), false, 'before the load');
  assert.deepEqual(steps(unloaded), []);

  const refused = await loadWidget(true);
  await refused.send({ type: 'forge-rhythm-load', data: { not: 'rhythm data' }, noteName: 'x' });
  for (const init of Object.values(KEY)) assert.equal(press(refused, refused.doc.body, init), false, 'a refused load');
  assert.deepEqual(steps(refused), []);

  const play = await hosted('playground');
  for (const init of Object.values(KEY)) assert.equal(press(play, play.cell('kick', 1), init), false, 'a playground has no list to undo: the key is the browser\'s');
  assert.deepEqual(steps(play), []);
});

test('a later load (Reset, the note changed) keeps the key working, and a load that switches the mode to playground switches it off', async () => {
  const h = await hosted();
  await h.send(buildLoadMessage(ROCK as never, 'bar_001', 'edit', null, false, false, false, []));
  assert.equal(press(h, h.doc.body, KEY.cmdZ), true); assert.deepEqual(steps(h), [UNDO]);
  await h.send(buildLoadMessage(ROCK as never, 'bar_001', 'playground', null, false, false, false, []));
  assert.equal(press(h, h.doc.body, KEY.cmdZ), false); assert.deepEqual(steps(h), [UNDO], 'nothing more');
});

test('the page\'s own behaviour is untouched by the key handler: a click still toggles a step and posts ONE save, and a key press posts no save', async () => {
  const h = await hosted();
  const savesBefore = h.posted.filter((m) => m.type === 'forge-rhythm-save').length;
  press(h, h.cell('kick', 1), KEY.cmdZ); press(h, h.cell('kick', 1), KEY.shiftCmdZ);
  assert.equal(h.posted.filter((m) => m.type === 'forge-rhythm-save').length, savesBefore, 'a key never writes');
  h.cell('kick', 1).click(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.posted.filter((m) => m.type === 'forge-rhythm-save').length, savesBefore + 1);
});

// ---- P3: the other widget pages ----------------------------------------------------------------------------------------------------------------------------------------------------------------
const OTHER_WIDGET_SHA256: Record<string, string> = {
  'guitar_fretboard.html': '738f4de4c9fa209fbac8e8b530097790b1aa30a4d8d25968c8161711228bc897',
  'interval_ear_both_at_once.html': 'dea74c2a299faa211ddf6ef8e3516037f660d1a895dda60b7f1780e21fc7fd06',
  'interval_ear_one_after_the_other.html': '19056c1ef8e364f9cbcd91fb44de2332d3b66cd5d67c5617aa30962fdb29bf95',
  'interval_ear_triads.html': '5e8b4fbb08fc1a86c73b784f55fa5d0f5561e7cb4d6ba578b066c5099948e6c5',
  'interval_pair.html': '9f65796cdb753941e0f900e15ba5daaa44ba7ecc0810045c828e73e1fecad056',
  'interval_widget.html': 'e91619f32cf8da3c08140bbc175fa94eed2fdba2b4e2e42de235d02756438b47',
  'lute_fretboard.html': '40f5711da3cb2f3217ad97cbb51725d1baf4f5f725c7491965d326ae0fb5f111',
  'mandolin_fretboard.html': 'c67ef2a3007eadc6d831f24964c8cfd0fdb5b31b69f951bb4d7a18fc35a3272f',
  'monochord.html': '33de2ba75e9b7630765e1e68e480d67d7df4c5222236142f90f727d882e87a9e',
  'piano_keyboard.html': 'b95fcf273a1cd890574e57d85fbdb956ef0487bb1be5ab4575539e07a9a54195',
  'piano_keyboard_c_major_triad.html': 'f381df907d3b049446d6dbce26a21f1e3eb9c6ba7e14fdca4c9c815a42ff8ae1',
  'piano_voice_demo.html': '91cd81c9cdb220cda7c325bbc55fdb4fb165c13fd4cdd0fd5b95a97bf6e2b778',
  'piano_voice_lab.html': '67b4ca91dc376c3505906c92d5d0108ce6161de8880ef7ba20721c17e1f113f0',
  'plucked_voice_demo.html': '5e4b331cc745b230331db2e1262593d5ea4647a17678b70b32974e0431ab7d6c',
  'tune_shifter.html': '51fc8e5d3987c533855fb330c71e4ff0ae6393b2326cdb29267274fd408ab28d',
  'whole_half_steps.html': '44c81fa8910d8dd7c0b451d23aacc1cf085834f715d5f834e7277ba022e46fc1',
};

test('P3: every OTHER html widget of the vault (the 16 beside rhythm_box.html) is byte for byte what it was before 0996 (sha-256); a new or removed widget is a deliberate move of this table', { skip }, () => {
  const dir = path.dirname(WIDGET_FILE as string);
  const have = fs.readdirSync(dir).filter((n) => n.endsWith('.html') && n !== 'rhythm_box.html').sort();
  assert.deepEqual(have, Object.keys(OTHER_WIDGET_SHA256).sort(), 'the same set of widgets');
  for (const n of have) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, n))).digest('hex'), OTHER_WIDGET_SHA256[n], `${n} is byte for byte what it was`);
});
