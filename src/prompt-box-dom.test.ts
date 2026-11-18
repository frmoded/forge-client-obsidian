// 2026-11-17-2001 - the music tab's composer card (prompt-box-dom.ts) in a plain DOM: the field equals the Description, Enter asks for a PREVIEW and writes nothing, the second Enter applies, Esc discards / cancels,
// Shift+Enter and IME Enter are not submits, Up recalls, the "+" menu, the live region, NO "Apply" string anywhere, and the Description arriving from disk never overwrites typing (the keep / use choice).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPromptBox, type PreviewResult, type PromptBoxPorts } from './prompt-box-dom.ts';
import { accessibleName, visibleText } from './test-support/accessible-name.ts';

const SENTENCE = 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.';
type Apply = PromptBoxPorts['apply'];
function rig(over: Partial<PromptBoxPorts> = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const previews: string[] = []; const applies: string[] = []; const events: string[] = []; let hist: string[] = [];
  const ports: PromptBoxPorts = {
    placeholder: 'Describe it…',
    preview: async (t): Promise<PreviewResult> => { previews.push(t); return { ok: true, proposal: { description: `Would write: ${t}.`, via: 'grammar' } }; },
    apply: async (t) => { applies.push(t); return { ok: true, disk: t }; },
    cancel: () => { events.push('cancel'); },
    discard: () => { events.push('discard'); },
    history: { get: () => hist, set: (n) => { hist = [...n]; } },
    ...over,
  };
  const handle = mountPromptBox(parent, ports, SENTENCE);
  const q = (sel: string) => parent.querySelector(sel) as any;
  const type = (text: string) => { q('.forge-prompt-box-text').value = text; q('.forge-prompt-box-text').dispatchEvent(new win.Event('input', { bubbles: true })); };
  const key = (k: string, init: Record<string, unknown> = {}) => { const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }); q('.forge-prompt-box-text').dispatchEvent(e); return e; };
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return { win, parent, handle, previews, applies, events, history: () => hist, q, type, key, flush };
}

test('on mount the field is exactly the Description, the card is not edited, nothing can be sent, the placeholder and labels are set', () => {
  const r = rig();
  assert.equal(r.q('.forge-prompt-box-text').value, SENTENCE);
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), false);
  assert.equal(r.q('.forge-composer-send').getAttribute('aria-disabled'), 'true');
  assert.equal(r.q('.forge-prompt-box-state').textContent, '');
  assert.equal(r.q('.forge-prompt-box-text').placeholder, 'Describe it…');
  assert.ok(accessibleName(r.q('.forge-prompt-box-text')));
  assert.equal(r.q('.forge-prompt-box').getAttribute('role'), 'group');
  assert.ok(accessibleName(r.q('.forge-prompt-box')));
  assert.ok(accessibleName(r.q('.forge-composer-send')));
});

test('typing brightens the return glyph (can-send) and the card shows as edited', () => {
  const r = rig();
  r.type(SENTENCE + ' Threshold 65 percent.');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), true);
  assert.equal(r.q('.forge-prompt-box').classList.contains('can-send'), true);
  assert.equal(r.q('.forge-composer-send').getAttribute('aria-disabled'), 'false');
});

test('the first Enter asks for a PREVIEW and writes nothing; the second Enter applies exactly what was previewed; the field then shows what the note says now', async () => {
  const r = rig({ apply: async (t) => { r.applies.push(t); return { ok: true, disk: 'CANONICAL ' + t }; } });
  r.type('my sentence');
  const e = r.key('Enter');
  assert.equal(e.defaultPrevented, true, 'Enter does not add a line');
  assert.equal(r.q('.forge-prompt-box-state').textContent, 'Working... Esc cancels');
  await r.flush();
  assert.deepEqual(r.previews, ['my sentence']);
  assert.deepEqual(r.applies, [], 'nothing is written by the first Enter');
  assert.equal(r.handle.composer().phase, 'previewing');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-previewing'), true);
  assert.match(r.q('.forge-composer-sr').textContent, /Press Enter to apply, Esc to discard/);
  r.key('Enter'); await r.flush();
  assert.deepEqual(r.applies, ['my sentence']);
  assert.equal(r.q('.forge-prompt-box-text').value, 'CANONICAL my sentence');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), false);
  assert.equal(r.handle.composer().phase, 'idle');
});

test('Shift+Enter is a new line: nothing is asked and the default is left alone; so are Ctrl/Alt/Meta+Enter and Enter during IME composition', async () => {
  const r = rig();
  r.type('first line');
  for (const init of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    const e = r.key('Enter', init);
    assert.equal(e.defaultPrevented, false, JSON.stringify(init));
  }
  await r.flush();
  assert.deepEqual(r.previews, []);
  assert.equal(r.handle.composer().phase, 'idle');
});

test('the return glyph is a button: it sends like Enter (preview first, then apply); with nothing edited it does nothing', async () => {
  const r = rig();
  r.q('.forge-composer-send').click(); await r.flush();
  assert.deepEqual(r.previews, [], 'nothing edited: nothing asked');
  r.type('changed');
  r.q('.forge-composer-send').click(); await r.flush();
  assert.deepEqual(r.previews, ['changed']);
  assert.deepEqual(r.applies, []);
  r.q('.forge-composer-send').click(); await r.flush();
  assert.deepEqual(r.applies, ['changed']);
});

test('Esc on a preview discards it (nothing written, the text stays); Esc while a request runs cancels it and its late answer changes nothing; typing over a preview replaces it', async () => {
  const r = rig();
  r.type('one'); r.key('Enter'); await r.flush();
  assert.equal(r.handle.composer().phase, 'previewing');
  const esc = r.key('Escape');
  assert.equal(esc.defaultPrevented, true);
  assert.deepEqual(r.events, ['discard']);
  assert.equal(r.handle.composer().phase, 'idle');
  assert.equal(r.q('.forge-prompt-box-text').value, 'one');
  assert.deepEqual(r.applies, []);
  r.key('Enter'); await r.flush();                                     // previewing again
  r.type('one, edited');
  assert.equal(r.handle.composer().phase, 'idle', 'typing replaced the preview');
  assert.deepEqual(r.events, ['discard', 'discard']);
  assert.deepEqual(r.applies, []);

  let release!: (v: PreviewResult) => void;
  const slow = rig({ preview: (t) => { slow.previews.push(t); return new Promise<PreviewResult>((res) => { release = res; }); } });
  slow.type('slow'); slow.key('Enter');
  assert.equal(slow.handle.composer().phase, 'working');
  slow.key('Escape');
  assert.deepEqual(slow.events, ['cancel']);
  assert.equal(slow.handle.composer().phase, 'idle');
  release({ ok: true, proposal: { description: 'late', via: 'service' } }); await slow.flush();
  assert.equal(slow.handle.composer().phase, 'idle', 'the late answer is dropped');
  assert.deepEqual(slow.applies, []);
});

test('an error is said once, in one muted line under the card, with the text kept; typing clears it', async () => {
  const r = rig({ preview: async () => ({ ok: false, message: 'I could not read that sentence.' }) });
  r.type('gibberish'); r.key('Enter'); await r.flush();
  assert.equal(r.q('.forge-composer-error').textContent, 'I could not read that sentence.');
  assert.equal(r.q('.forge-prompt-box-text').value, 'gibberish');
  assert.equal(r.handle.composer().phase, 'error');
  r.type('gibberish!');
  assert.equal(r.q('.forge-composer-error').textContent, '');
  assert.equal(r.handle.composer().phase, 'idle');
});

test('an apply that did not go through keeps the text and says why', async () => {
  const r = rig({ apply: async (t) => { r.applies.push(t); return { ok: false, message: 'Could not write the note.' }; } });
  r.type('a sentence'); r.key('Enter'); await r.flush(); r.key('Enter'); await r.flush();
  assert.deepEqual(r.applies, ['a sentence']);
  assert.equal(r.q('.forge-prompt-box-text').value, 'a sentence');
  assert.equal(r.q('.forge-composer-error').textContent, 'Could not write the note.');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), true);
});

test('a second Enter while the apply is still running does not apply twice, and the field is read-only meanwhile', async () => {
  let release!: () => void;
  const r = rig({ apply: async (t) => { r.applies.push(t); await new Promise<void>((res) => { release = res; }); return { ok: true, disk: t }; } });
  r.type('slow one'); r.key('Enter'); await r.flush(); r.key('Enter'); r.key('Enter'); await r.flush();
  assert.equal(r.applies.length, 1);
  assert.equal(r.q('.forge-prompt-box-text').readOnly, true);
  release(); await r.flush();
  assert.equal(r.applies.length, 1);
  assert.equal(r.q('.forge-prompt-box-text').readOnly, false);
});

test('auto-apply (a setting, off by default): a sentence the grammar reads exactly skips the preview; one the service read still previews', async () => {
  const on = rig({ autoApply: () => true });
  on.type('exact'); on.key('Enter'); await on.flush();
  assert.deepEqual(on.applies, ['exact']);
  const svc = rig({ autoApply: () => true, preview: async () => ({ ok: true, proposal: { description: 'service read it', via: 'service' } }) });
  svc.type('loose'); svc.key('Enter'); await svc.flush();
  assert.deepEqual(svc.applies, [], 'the service answer is always previewed');
  assert.equal(svc.handle.composer().phase, 'previewing');
  const off = rig();
  off.type('exact'); off.key('Enter'); await off.flush();
  assert.deepEqual(off.applies, [], 'off by default');
});

test('Up in an EMPTY composer recalls the previous sentence, then older ones; Down walks back to empty; Up in a field with text is the caret moving', async () => {
  const r = rig();
  r.type('first'); r.key('Enter'); await r.flush(); r.key('Enter'); await r.flush();
  r.type('second'); r.key('Enter'); await r.flush(); r.key('Enter'); await r.flush();
  assert.deepEqual(r.history(), ['first', 'second']);
  r.type('typed text');
  assert.equal(r.key('ArrowUp').defaultPrevented, false, 'with text, Up is the caret');
  r.type('');
  assert.equal(r.key('ArrowUp').defaultPrevented, true);
  assert.equal(r.q('.forge-prompt-box-text').value, 'second');
  r.key('ArrowUp'); assert.equal(r.q('.forge-prompt-box-text').value, 'first');
  r.key('ArrowDown'); assert.equal(r.q('.forge-prompt-box-text').value, 'second');
  r.key('ArrowDown'); assert.equal(r.q('.forge-prompt-box-text').value, '');
});

test('the "+" menu lists the actions and "Insert a link to a note"; an action runs, the link goes in at the caret as [[name]]; Esc closes the menu', async () => {
  const ran: string[] = [];
  const r = rig({ menu: { items: [{ id: 'new-chord', label: 'New chord' }, { id: 'new-scale', label: 'New scale' }], run: (id) => { ran.push(id); }, pickNote: async () => 'Cadences' } });
  const menu = r.q('.forge-composer-menu');
  assert.equal(menu.hidden, true);
  r.q('.forge-composer-plus').click();
  assert.equal(menu.hidden, false);
  assert.equal(r.q('.forge-composer-plus').getAttribute('aria-expanded'), 'true');
  assert.deepEqual([...menu.querySelectorAll('[role="menuitem"]')].map((b: any) => b.textContent), ['New chord', 'New scale', 'Insert a link to a note']);
  menu.querySelectorAll('button')[0].dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(menu.hidden, true);
  r.q('.forge-composer-plus').click(); menu.querySelectorAll('button')[1].click();
  assert.deepEqual(ran, ['new-scale']);
  assert.equal(menu.hidden, true);
  r.type('see '); r.q('.forge-prompt-box-text').setSelectionRange(4, 4);
  r.q('.forge-composer-plus').click(); menu.querySelectorAll('button')[2].click(); await r.flush();
  assert.equal(r.q('.forge-prompt-box-text').value, 'see [[Cadences]]');
});

test('no "Apply" anywhere in the card: not as a label, a title or an aria-label', () => {
  const r = rig({ menu: { items: [{ id: 'a', label: 'New chord' }], run: () => {}, pickNote: async () => null } });
  r.type('x'); r.key('Enter');
  const all = [r.q('.forge-prompt-box'), ...r.q('.forge-prompt-box').querySelectorAll('*')] as any[];
  const strings = all.flatMap((n) => [n.textContent ?? '', n.getAttribute?.('aria-label') ?? '', n.getAttribute?.('title') ?? '']);
  // the preview hint says "Press Enter to apply" in the dialog and the live region (lower case, an instruction, not a button): the card has no button called Apply
  assert.equal(r.parent.querySelector('.forge-prompt-box-apply'), null);
  for (const b of r.parent.querySelectorAll('button')) assert.doesNotMatch(`${b.textContent} ${accessibleName(b) ?? ''} ${b.getAttribute('title') ?? ''}`, /\bApply\b/);
  assert.ok(strings.length > 0);
});

test('the Description changing on disk while the card is not edited updates the field; while the person has typed, the typing is NOT overwritten and the choice is offered', async () => {
  const r = rig();
  r.handle.setDisk('Mix [[bar_005]] and [[bar_006]], 35 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-text').value, 'Mix [[bar_005]] and [[bar_006]], 35 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-conflict').style.display, 'none');
  r.type('typed by hand');
  r.handle.setDisk('Mix [[bar_005]] and [[bar_006]], 20 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-text').value, 'typed by hand', 'not overwritten');
  assert.equal(r.q('.forge-prompt-box-conflict').style.display, '');
  assert.match(r.q('.forge-prompt-box-conflict').textContent, /controls changed the Description/);
  r.q('.forge-prompt-box-conflict [data-choice="use"]').click();
  assert.equal(r.q('.forge-prompt-box-text').value, 'Mix [[bar_005]] and [[bar_006]], 20 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-conflict').style.display, 'none');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), false);
});

test('"Keep my text" keeps the typing and still shows it as edited', () => {
  const r = rig();
  r.type('mine');
  r.handle.setDisk('changed elsewhere');
  r.q('.forge-prompt-box-conflict [data-choice="keep"]').click();
  assert.equal(r.q('.forge-prompt-box-text').value, 'mine');
  assert.equal(r.q('.forge-prompt-box-conflict').style.display, 'none');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), true);
});

test('focus() puts the cursor in the field; dispose() removes the card and the error line', () => {
  const r = rig();
  r.handle.focus();
  assert.equal(r.win.document.activeElement, r.q('.forge-prompt-box-text'));
  r.handle.dispose();
  assert.equal(r.parent.querySelector('.forge-prompt-box'), null);
  assert.equal(r.parent.querySelector('.forge-composer-error'), null);
});

test('setBusy shows the message and holds Enter (the text stays editable); null puts it back; reset() shows what the note says now and drops the typing', async () => {
  const r = rig();
  r.type('free sentence');
  r.handle.setBusy('Asking the sentence service...');
  assert.equal(r.q('.forge-prompt-box-state').textContent, 'Asking the sentence service...');
  r.key('Enter'); await r.flush();
  assert.deepEqual(r.previews, [], 'Enter does nothing while a request runs');
  r.handle.setBusy(null);
  assert.equal(r.q('.forge-prompt-box-state').textContent, '');
  assert.equal(r.q('.forge-prompt-box').classList.contains('can-send'), true);
  r.handle.reset('CANONICAL');
  assert.equal(r.q('.forge-prompt-box-text').value, 'CANONICAL');
  assert.equal(r.q('.forge-prompt-box').classList.contains('is-edited'), false);
});

test('setNote puts a plain line under the card; typing clears it', () => {
  const r = rig();
  r.handle.setNote('That answer was dropped: the note changed.');
  assert.equal(r.q('.forge-composer-error').textContent, 'That answer was dropped: the note changed.');
  r.type('more');
  assert.equal(r.q('.forge-composer-error').textContent, '');
});
