// 2026-11-19-0991 - the NAME dialog of New phrase / New arrangement / New composition, in happy-dom (new-note-name-dom.ts, no obsidian): what is on it, where the focus is, what the keyboard does, what is refused in words, and that Esc
// and Cancel MAKE NOTHING (the flow is never reached). Real Chrome measures the look: scripts/dev/measure-new-note-dialog.mjs (written, run by the supervisor). A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountNewNoteNameDialog, type MadeNote } from './new-note-name-dom.ts';
import { NEW_NOTE_KINDS, checkNewNoteName, defaultNewNoteName, type NewNoteKind } from './new-note-name-core.ts';
import { accessibleName, auditLabels } from './test-support/accessible-name.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const win: any = new Window({ url: 'http://localhost/' });
const doc = win.document;
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 5)); };

interface Rig { host: any; input: any; made: string[]; closed: () => number; lines: string[]; q: (sel: string) => any; type: (text: string) => void; key: (k: string, target?: any, extra?: object) => any; dispose: () => void; msg: () => string; vault: string[] }
/** One dialog on a FRESH host, over a vault that is a list of note paths; `create` records what it was asked to make, like the flow would, and can be told to answer another way. */
function rig(kind: NewNoteKind, vault: string[] = [], over: { create?: (name: string) => Promise<MadeNote> } = {}): Rig {
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const made: string[] = []; let closes = 0; const lines: string[] = [];
  const info = NEW_NOTE_KINDS[kind];
  const h = mountNewNoteNameDialog(host, {
    title: info.title, noun: info.noun, initial: defaultNewNoteName(kind, vault),
    check: (raw) => checkNewNoteName(kind, raw, vault),
    create: over.create ? (n) => { made.push(n); return over.create!(n); } : async (n) => { made.push(n); return { ok: true }; },
    close: () => { closes++; }, trace: (l) => { lines.push(l); },
  });
  const q = (sel: string) => host.querySelector(sel);
  return {
    host, input: h.input, made, closed: () => closes, lines, q, vault,
    type: (text) => { h.input.value = text; h.input.dispatchEvent(new win.Event('input', { bubbles: true })); },
    key: (k, target = h.input, extra = {}) => { const ev = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }); target.dispatchEvent(ev); return ev; },
    dispose: () => { h.dispose(); host.remove(); }, msg: () => q('.forge-newnote-message').textContent,
  };
}
const KINDS: NewNoteKind[] = ['phrase', 'arrangement', 'composition'];

/** The red things in one declaration (the same judgement by HUE as src/no-red-music-tabs.test.ts: that file is a test and cannot be imported without running it): the error tokens, named reds, and a colour literal whose hue is red. */
function redIn(decl: string): string[] {
  const out: string[] = [];
  const t = decl.match(/--text-error|--background-modifier-error|--color-red|\b(?:crimson|firebrick|darkred|indianred|tomato|maroon|red)\b/i); if (t) out.push(t[0]);
  const red = (r: number, g: number, b: number): boolean => { const [R, G, B] = [r, g, b].map((v) => v / 255) as [number, number, number]; const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn; if (d < 0.15 || mx < 0.25) return false; const h = (mx === R ? ((G - B) / d + 6) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60; return h <= 20 || h >= 340; };
  for (const m of decl.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) { let x = m[1]; if (x.length === 3) x = x.split('').map((c) => c + c).join(''); if (red(parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16))) out.push(m[0]); }
  for (const m of decl.matchAll(/\brgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/gi)) if (red(+m[1]!, +m[2]!, +m[3]!)) out.push(m[0]);
  return out;
}
test('CONTROL: the red detector of this file can fail (a red hex, rgb, a named red and an error token are found; a grey and a theme variable are not)', () => {
  assert.equal(redIn('color: #d0312d').length, 1); assert.equal(redIn('color: rgb(220, 38, 38)').length, 1); assert.equal(redIn('background: red').length, 1); assert.equal(redIn('color: var(--text-error)').length, 1);
  assert.deepEqual(redIn('color: var(--text-muted); background: #f6f6f6; border: 1px solid #8a7be0'), []);
});

test('the dialog for each action: its title, one text field, a Create and a Cancel button, a muted line; the field is FOCUSED, holds the default name and the WHOLE text is selected (typing replaces it)', () => {
  for (const kind of KINDS) {
    const r = rig(kind);
    assert.equal(r.q('h3').textContent, NEW_NOTE_KINDS[kind].title, `${kind}: the title`);
    assert.equal(r.host.querySelectorAll('input').length, 1, 'one field'); assert.equal(r.host.querySelectorAll('textarea, select').length, 0);
    const def = defaultNewNoteName(kind, []);
    assert.equal(r.input.value, def); assert.ok(def.length > 0);
    assert.ok(doc.activeElement === r.input, `${kind}: the field has the focus`);
    assert.equal(r.input.selectionStart, 0); assert.equal(r.input.selectionEnd, def.length, 'the whole text is selected');
    assert.deepEqual([...r.host.querySelectorAll('button')].map((b: any) => b.textContent), ['Create', 'Cancel']);
    assert.equal(r.q('.forge-newnote-create').disabled, false, 'valid: Create is on');
    assert.equal(r.msg(), `It will be made as ${NEW_NOTE_KINDS[kind].folder}/${def}.md`, 'the muted line says where the note will be made');
    assert.equal(r.q('.forge-newnote-message').getAttribute('role'), 'status');
    assert.deepEqual(r.made, [], 'nothing is made by opening it'); assert.equal(r.closed(), 0);
    r.dispose();
  }
});

test('the default shown is today\'s: comp_001 / arr_001 / phrase_001 in an empty vault, the next free one in a vault that has some', () => {
  const vault = ['phrases/phrase_001.md', 'phrases/phrase_002.md', 'arrangements/arr_001.md', 'compositions/comp_001.md', 'compositions/comp_002.md'];
  assert.deepEqual(KINDS.map((k) => rig(k).input.value), ['phrase_001', 'arr_001', 'comp_001']);
  assert.deepEqual(KINDS.map((k) => rig(k, vault).input.value), ['phrase_003', 'arr_002', 'comp_003']);
});

test('ENTER creates exactly the name in the field (the default as it stands, or what was typed), once; the dialog closes only after the flow said yes', async () => {
  for (const kind of KINDS) {
    const def = defaultNewNoteName(kind, []);
    const a = rig(kind); a.key('Enter'); await settle();
    assert.deepEqual(a.made, [def], `${kind}: Enter on the default makes exactly the default`); assert.equal(a.closed(), 1);
    const b = rig(kind); b.type('Sunrise'); b.key('Enter'); await settle();
    assert.deepEqual(b.made, ['Sunrise']); assert.equal(b.closed(), 1);
    const c = rig(kind); c.type('  padded name  '); c.key('Enter'); await settle();
    assert.deepEqual(c.made, ['padded name'], 'the spaces at the ends are not part of the name');
  }
  let release: (m: MadeNote) => void = () => {};
  const slow = rig('composition', [], { create: () => new Promise<MadeNote>((res) => { release = res; }) });
  slow.key('Enter'); slow.key('Enter'); slow.q('.forge-newnote-create').dispatchEvent(new win.Event('click', { bubbles: true })); await settle();
  assert.deepEqual(slow.made, ['comp_001'], 'a second Enter while the first is running makes nothing more'); assert.equal(slow.closed(), 0, 'not closed before the flow answers');
  release({ ok: true }); await settle(); assert.equal(slow.closed(), 1);
});

test('ESC and CANCEL make NOTHING: the flow is never asked, with the default as it stands, with a valid typed name, with a refused one; Esc anywhere in the dialog closes it', async () => {
  for (const kind of KINDS) {
    const a = rig(kind); a.key('Escape'); await settle(); assert.deepEqual(a.made, []); assert.equal(a.closed(), 1, `${kind}: Esc closes`);
    const b = rig(kind); b.type('Valid name'); b.key('Escape'); await settle(); assert.deepEqual(b.made, [], 'a valid name typed, then Esc: nothing'); assert.equal(b.closed(), 1);
    const c = rig(kind); c.type('Another'); c.q('.forge-newnote-cancel').dispatchEvent(new win.Event('click', { bubbles: true })); await settle(); assert.deepEqual(c.made, [], 'Cancel: nothing'); assert.equal(c.closed(), 1);
    const d = rig(kind); d.key('Escape', d.q('.forge-newnote-cancel')); await settle(); assert.deepEqual(d.made, [], 'Esc with the focus on a button'); assert.equal(d.closed(), 1);
    const e = rig(kind); e.type('a/b'); e.q('.forge-newnote-cancel').dispatchEvent(new win.Event('click', { bubbles: true })); await settle(); assert.deepEqual(e.made, []); assert.equal(e.closed(), 1);
  }
});

test('a name that is not valid is refused in plain words under the field, and Enter and Create do nothing until it is valid; the words change as the text changes', async () => {
  const vault = ['compositions/Intro.md', 'Welcome.md', 'phrases/phrase_001.md'];
  const r = rig('composition', vault);
  const create = r.q('.forge-newnote-create');
  const cases: Array<[string, string]> = [
    ['', 'Type a name for the new composition'],
    ['   ', 'Type a name for the new composition'],
    ['a/b', 'A name cannot contain / (none of / \\ : * ? " < > | is allowed)'],
    ['what?', 'A name cannot contain ? (none of / \\ : * ? " < > | is allowed)'],
    ['.hidden', 'A name cannot start with a dot'],
    ['Intro', 'A note called Intro already exists (compositions/Intro)'],
    ['intro', 'A note called Intro already exists (compositions/Intro)'],
    ['phrase_001', 'A note called phrase_001 already exists (phrases/phrase_001)'],
    ['Welcome', 'A note called Welcome already exists (at the top of the vault)'],
  ];
  for (const [typed, say] of cases) {
    r.type(typed); assert.equal(r.msg(), say, `typed ${JSON.stringify(typed)}`);
    assert.equal(create.disabled, true, 'Create is disabled'); assert.equal(r.q('.forge-newnote-message').getAttribute('data-valid'), 'false'); assert.equal(r.input.getAttribute('aria-invalid'), 'true');
    r.key('Enter'); create.dispatchEvent(new win.Event('click', { bubbles: true })); await settle();
    assert.deepEqual(r.made, [], `Enter and Create make nothing for ${JSON.stringify(typed)}`); assert.equal(r.closed(), 0, 'the dialog stays open');
  }
  r.type('Fresh'); assert.equal(create.disabled, false); assert.equal(r.msg(), 'It will be made as compositions/Fresh.md'); assert.equal(r.q('.forge-newnote-message').getAttribute('data-valid'), 'true'); assert.equal(r.input.getAttribute('aria-invalid'), 'false');
  r.key('Enter'); await settle(); assert.deepEqual(r.made, ['Fresh']);
});

test('the check reads the vault AS IT IS when the key is pressed: a note that appears while the dialog is open refuses the same name at once', () => {
  const vault: string[] = []; const r = rig('phrase', vault);
  r.type('Mine'); assert.equal(r.q('.forge-newnote-create').disabled, false);
  vault.push('somewhere/else/Mine.md'); r.type('Mine'); assert.equal(r.q('.forge-newnote-create').disabled, true); assert.equal(r.msg(), 'A note called Mine already exists (somewhere/else/Mine)');
});

test('a name the flow refuses AFTER Enter (taken in the meantime) is said in the same line, the dialog stays open with the field as it was, and Enter can try again; a flow that throws is said too (console.error)', async () => {
  let n = 0;
  const r = rig('arrangement', [], { create: async () => (++n === 1 ? { ok: false, message: 'A note called arr_001 already exists (arrangements/arr_001)' } : { ok: true }) });
  r.key('Enter'); await settle();
  assert.equal(r.msg(), 'A note called arr_001 already exists (arrangements/arr_001)'); assert.equal(r.closed(), 0); assert.equal(r.input.value, 'arr_001');
  assert.equal(r.q('.forge-newnote-create').disabled, false, 'Create is on again');
  r.key('Enter'); await settle(); assert.deepEqual(r.made, ['arr_001', 'arr_001']); assert.equal(r.closed(), 1);
  const seen: unknown[][] = []; const saved = console.error; console.error = (...a: unknown[]) => { seen.push(a); };
  try {
    const t = rig('phrase', [], { create: async () => { throw new Error('disk full'); } });
    t.key('Enter'); await settle();
    assert.equal(t.msg(), 'New phrase failed: disk full'); assert.equal(t.closed(), 0);
    assert.ok(seen.length === 1 && /mountNewNoteNameDialog/.test(String(seen[0][0])), 'a caught error is a console.error that names the function');
  } finally { console.error = saved; }
});

test('KEYBOARD ONLY: the field has the focus from the start; Enter on a valid name makes it, Esc leaves; Tab goes field, Create, Cancel and nothing else is focusable; an Enter inside an IME composition does nothing', async () => {
  const r = rig('composition');
  const order = [...r.host.querySelectorAll('input, button, select, textarea, a, [tabindex]')].map((e: any) => e.className.split(' ')[0]);
  assert.deepEqual(order, ['forge-newnote-name', 'forge-newnote-create', 'forge-newnote-cancel'], 'the tab order is the DOM order, three stops');
  assert.equal(r.host.querySelectorAll('[tabindex]').length, 0, 'no positive tabindex');
  const composing = r.key('Enter', r.input, { isComposing: true }); await settle();
  assert.deepEqual(r.made, [], 'Enter that confirms an IME candidate is not Enter'); assert.equal(composing.defaultPrevented, false);
  const ev = r.key('Enter'); await settle(); assert.equal(ev.defaultPrevented, true); assert.deepEqual(r.made, ['comp_001']);
  const s = rig('composition'); s.key('Escape'); await settle(); assert.deepEqual(s.made, []); assert.equal(s.closed(), 1);
});

test('NO TOOLTIPS and a NAME: the field names itself through a hidden label (no aria-label, no title anywhere), the buttons have visible words, and the label audit is clean; nothing reacts to the pointer resting', () => {
  for (const kind of KINDS) {
    const r = rig(kind);
    assert.deepEqual(auditLabels(r.host), [], 'no aria-label, no title, every aria-labelledby resolves');
    assert.equal(accessibleName(r.input), `Name of the new ${NEW_NOTE_KINDS[kind].noun}`);
    assert.equal(r.host.querySelectorAll('[title], [aria-label], [data-tooltip]').length, 0);
    for (const b of r.host.querySelectorAll('button')) assert.ok(accessibleName(b).length > 0);
    r.dispose();
  }
  const src = fs.readFileSync(path.join(ROOT, 'src/new-note-name-dom.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /mouseover|mouseenter|mouseleave|mouseout|pointerenter|pointerleave|pointerover|pointerout|\.title\s*=|setAttribute\(\s*['"]title|aria-label(?!ledby)|setTooltip/, 'the dialog\'s code has no pointer-rest handler and no tooltip');
});

test('NO RED: nothing in the dialog is styled red (the muted line is told apart by its words, never by a colour): the dialog\'s rules in styles.css and its code have no red, no error token, no :hover', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  let rules = 0;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/forge-newnote/.test(m[1])) continue;
    rules++;
    assert.deepEqual(m[2].split(';').flatMap((d) => redIn(d)), [], `${m[1].trim()}: no red`);
    assert.doesNotMatch(m[1] + m[2], /:hover|--text-error|--background-modifier-error|--color-red|--text-warning/, `${m[1].trim()}: no hover, no error token`);
  }
  assert.ok(rules >= 5, `non-vacuity: the dialog has its rules in styles.css (${rules})`);
  const ts = fs.readFileSync(path.join(ROOT, 'src/new-note-name-dom.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual(ts.split('\n').flatMap((l) => redIn(l)), []);
  const r = rig('phrase'); r.type('a/b');
  assert.equal(r.host.querySelectorAll('[style]').length, 0, 'no inline style at all (so no colour)'); assert.doesNotMatch(r.host.innerHTML, /color|error|red/i, 'no class or attribute of an alarm');
});

test('disposing removes the dialog; opening a second one on another host is independent (a fresh host each time)', () => {
  const a = rig('phrase'), b = rig('composition');
  a.type('x'); assert.equal(b.input.value, 'comp_001'); a.dispose(); assert.equal(a.host.querySelector('.forge-newnote-dialog'), null); assert.ok(b.host.querySelector('.forge-newnote-dialog') !== null);
});

test('the default is selected AGAIN a tick later when a host takes the focus after onOpen (Obsidian may); a field that the person already started to edit is left alone', async () => {
  const r = rig('composition'); r.input.blur(); doc.body.focus?.(); assert.ok(doc.activeElement !== r.input, 'the stand-in host took the focus away');
  await settle(); assert.ok(doc.activeElement === r.input, 'the field has it back'); assert.equal(r.input.selectionEnd, 8);
  const e = rig('composition'); e.type('typed'); e.input.blur(); await settle(); assert.ok(doc.activeElement !== e.input, 'a field already edited does not take the focus back'); assert.equal(e.input.value, 'typed');
});
