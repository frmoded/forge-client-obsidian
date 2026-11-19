// 2026-11-19-0938 (driver 2026-11-18, R4 and R5) - the scale exercises say "tonic" (never "home note", except in the one first-prompt line "Pick a tonic (home note).") and show a SHELF of twelve slots instead of the row of twelve chips:
// one slot per tonic, in a FIXED grid (4 x 3 at wide widths, 3 x 4 below 420 px: CSS only), under the build area. An unbuilt slot is a quiet dashed outline with the tonic's name; tapping it starts that tonic's build (as the chips did). A slot of a COMPLETED build
// (all notes found within the wrong taps) fills with a MINI SCORE: a small treble staff with the scale's notes, tonic up to tonic, the right accidentals, drawn by the SAME `drawStaff` as the main staff (the shared `scale view` block, only the width of the staff and the
// svg it draws into differ), with the name under it ("G major"). A failed build leaves its slot empty and tappable; a completed slot stays until Reset or reload (memory only) and is tappable (a fresh build of it); it survives starting another tonic. The room for the
// twelve slots is reserved from the start (a grid of twelve fixed-height slots), so the file has ONE height in every state at each width. The many-scale files show the twelve tonics of the CURRENTLY chosen scale; the completions of every scale are kept in memory.
// Pinned here, for all five build files unless said: the words (six files, in the page text, the labels, the announcements, the code and captions.json); the shelf's structure in every state; the slot that fills, its mini score spelled as the shared Scales core spells it for all
// twelve major and all twelve natural minor tonics (and every scale of the many-scale files); a failed build does not fill; survival; Reset; the shelf follows the scale; no hover, no tooltip, no aria-label on the new elements; the CSS that keeps one height; no second drawing code.
// Older pins that this one changed: the chips (src/scale-build-simple.test.ts, src/scale-exercise-completed.test.ts). How TALL the files are (one height at 800 and 360 px in every state, no vertical scroll, shots with the shelf empty / six / twelve filled) is
// measured in real Chrome: scripts/dev/measure-scale-build-simple.mjs and scripts/dev/measure-scale-exercises.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { EXERCISE_DIR } from './test-support/scale-exercise-dir.ts';
import { pureOf, seeded } from './test-support/interval-ear-core-checks.ts';

const DIR = EXERCISE_DIR;                                   // the bundled vault, or the vault source when SCALE_EXERCISE_VAULT is set
const CAPTIONS = path.join(DIR, '../../../captions.json');
const SIMPLE = ['scale_build_major.html', 'scale_build_natural_minor.html'];
const FULL = ['scale_build_modes_and_minor.html', 'scale_build_other_scales.html', 'scale_ear_build_the_scale.html'];
const FIVE = [...SIMPLE, ...FULL];
const SIX = [...FIVE, 'scale_player.html'];
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const same = (a: unknown, b: unknown, m?: string): void => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const block = (h: string, name: string): string => { const a = h.indexOf(`  // ==== ${name} BEGIN`), e = h.indexOf(`  // ==== ${name} END`); assert.ok(a > 0 && e > a, `no "${name}" block`); return h.slice(a, h.indexOf('\n', e)); };
/** the source without comments (the words are judged on what runs and what shows) */
const codeOf = (h: string): string => h.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/[^\n]*/g, '$1');
const HOME = /home[\s-]*notes?/i;
const playerCore = pureOf(scriptOf(read('scale_player.html')));
const ST = (() => { const m = /var ST = \{ half: ([\d.]+), top: (\d+), bottom: (-?\d+), left: (\d+), right: (\d+), width: (\d+), headRx: ([\d.]+)/.exec(block(read('scale_player.html'), 'scale view'))!; return { half: +m[1], top: +m[2], headRx: +m[7] }; })();
const ACC: Record<string, number> = { '♯': 1, '♭': -1, '×': 2, '♭♭': -2 };

// ---- the pages: real DOM, real clicks (one driver for both groups of files) ---------------------------------------------------------------------------------------------------------
function open(file: string) {
  const h = read(file); openedSource = h; const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(7);
  win.__schedule = () => 1; win.__unschedule = () => {};
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document, x = pureOf(m[1]); const simple = !doc.getElementById('levels');
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const sel = (id: string, v: string) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const key = (mm: number) => doc.querySelector(`.key[data-midi="${mm}"]`);
  const slots = (): any[] => [...doc.querySelectorAll('#shelf > *')];
  const scale = (): string => (simple ? x.SCALES[0] : doc.getElementById('scale').value);
  const tonicNow = (): number => (simple ? slots().findIndex((c: any) => c.classList.contains('current')) : +doc.getElementById('tonic').value);
  const model = () => x.exStart(tonicNow(), scale(), 'medium');
  const text = (id: string): string => doc.getElementById(id).textContent.trim();
  const p = {
    win, doc, errors, x, simple, click, sel, key, slots, scale, tonicNow, model, text, h,
    start: (t: number) => click(slots()[t]),
    finish: () => { for (const mm of x.exTargets(model())) { const k = key(mm); if (k && !k.classList.contains('lit')) click(k); } },
    /** the wrong taps that end the build (3 in the simple files and at the default level of the full ones) */
    fail: () => { const mo = model(); let n = 0; for (let k = mo.notes[0] + 1; k < mo.notes[mo.notes.length - 1] && n < 3; k++) if (mo.notes.indexOf(k) < 0) { click(key(k)); n++; } assert.equal(n, 3); },
    done: (): number[] => slots().map((c: any, i: number) => (c.classList.contains('done') ? i : -1)).filter((i: number) => i >= 0),
    heads: () => doc.querySelectorAll('#staff .head').length,
  };
  return p;
}
type Page = ReturnType<typeof open>;

/** What a mini score's staff says, read from its geometry the way the shared staff draws it: for every head its letter (from the line or space it sits on) and its accidental (the sign drawn at the place `drawStaff` puts it). */
let openedSource = '';                                       // the source of the page opened last (open() sets it): the mini staff's own geometry is read from it
function miniNotes(slot: any): string[] {
  const mini = /var MINI_ST = \{([^}]*)\}/.exec(openedSource)![1]; const top = +/top: (-?\d+)/.exec(mini)![1];   // the shared drawStaff is given a staff with its own width and its own top line; its half step, head size and accidental offset are the main staff's
  const svg = slot.querySelector('svg'); const heads = [...svg.querySelectorAll('.head')]; const accs = [...svg.querySelectorAll('.acc')];
  return heads.map((hd: any) => {
    const cx = +hd.getAttribute('cx'), cy = +hd.getAttribute('cy'); const pos = Math.round(top + 0.5 - cy / ST.half); const l = (((pos + 30) % 7) + 7) % 7;
    const a = accs.find((t: any) => Math.abs(+t.getAttribute('y') - (cy + 4.5)) < 1e-6 && Math.abs(+t.getAttribute('x') - (cx - ST.headRx - 9)) < 1e-6);
    return `${l}:${a ? ACC[a.textContent] : 0}`;
  });
}
const wantNotes = (t: number, scale: string): string[] => { const sp = playerCore.spellScale(t, scale, 'up').map((n: any) => `${n.l}:${n.a}`); sp.push(sp[0]); return sp; };
const mainNotes = (p: Page): string[] => { const heads = [...p.doc.querySelectorAll('#staff .head')], accs = [...p.doc.querySelectorAll('#staff .acc')]; return heads.map((hd: any) => { const cx = +hd.getAttribute('cx'), cy = +hd.getAttribute('cy'); const pos = Math.round(ST.top + 0.5 - cy / ST.half); const a = accs.find((t: any) => Math.abs(+t.getAttribute('y') - (cy + 4.5)) < 1e-6 && Math.abs(+t.getAttribute('x') - (cx - ST.headRx - 9)) < 1e-6); return `${(((pos + 30) % 7) + 7) % 7}:${a ? ACC[(a as any).textContent] : 0}`; }); };

// ---- 1. the word -------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the word: "home note" is gone from the six files and from their captions: the code of the five build files has it ONCE (the first-prompt line "Pick a tonic (home note)." of the two single-scale files), the player and the many-scale files not at all', () => {
  for (const f of SIX) {
    const code = codeOf(read(f)); const hits = code.split('\n').filter((l) => HOME.test(l));
    const want = SIMPLE.includes(f) ? 1 : 0;
    assert.equal(hits.length, want, `${f}: lines in the code (comments aside) that say home note: ${hits.map((l) => l.trim().slice(0, 120)).join(' | ')}`);
    if (want) assert.match(hits[0], /return "Pick a tonic \(home note\)\.";/, `${f}: the one hit is the first-prompt line`);
    // the whole text of the file (the caption block included; the comments too are said in the new word)
    assert.doesNotMatch(read(f).replace(/Pick a tonic \(home note\)\./g, ''), HOME, `${f}: no home note anywhere else, comments included`);
  }
  const caps = JSON.parse(fs.readFileSync(CAPTIONS, 'utf8'));
  for (const f of SIX) { const c = caps[`scales/resources/html/${f}`]; assert.ok(c, `${f}: a caption`); assert.doesNotMatch(`${c.title} ${c.line}`, HOME, `${f}: the caption says tonic`); assert.match(c.line, /\btonic\b/i, `${f}: the caption says tonic`); assert.doesNotMatch(c.line, /\.$/, `${f}: no final full stop`); }
});

test('the word in the pages: in every state the visible text, the labels, the descriptions and the announcement say "tonic"; "home note" shows ONLY in the first prompt of the two single-scale files (first open and after Reset)', () => {
  for (const f of SIX) {
    const p = open(f); same(p.errors, []);
    const seen = (): string => [p.doc.body.textContent, ...[...p.doc.querySelectorAll('[aria-label],[aria-description],[title],[aria-labelledby]')].map((e: any) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('aria-description') ?? ''} ${e.getAttribute('title') ?? ''}`), p.doc.getElementById('sr').textContent, ...[...p.doc.querySelectorAll('option')].map((o: any) => o.textContent)].join(' ');
    const hits = (): number => (seen().match(new RegExp(HOME.source, 'gi')) ?? []).length;
    // the caption block is part of the figure: its text is in the body
    if (f === 'scale_player.html') { assert.equal(hits(), 0, `${f}: the player`); continue; }
    if (p.simple) { assert.equal(p.text('prompt'), 'Pick a tonic (home note).', `${f}: first prompt`); assert.equal(hits(), 1, `${f}: fresh: only the prompt says home note`); } else assert.equal(hits(), 0, `${f}: fresh`);
    p.start(3); assert.equal(hits(), 0, `${f}: started`);
    const mo = p.model(); p.click(p.key(mo.notes[2])); assert.equal(hits(), 0, `${f}: one found`); p.fail(); assert.equal(hits(), 0, `${f}: failed`);
    p.start(5); p.finish(); assert.equal(hits(), 0, `${f}: completed`);
    p.click(p.doc.getElementById('reset')); assert.equal(hits(), p.simple ? 1 : 0, `${f}: after Reset`);
    if (p.simple) { assert.equal(p.text('prompt'), 'Pick a tonic (home note).'); assert.equal(p.text('sr'), 'Count cleared. Pick a tonic.', 'the announcement after Reset says tonic'); }
    if (p.simple) assert.match(p.doc.getElementById('shelf')!.getAttribute('aria-labelledby')!, /./);
  }
});

test('the pure words say tonic: the first prompt of the simple core, the completed line "Completed n of N (k scales, 12 tonics each)"', () => {
  for (const f of SIMPLE) assert.equal(pureOf(scriptOf(read(f))).exPrompt(null), 'Pick a tonic (home note).', f);
  const m = pureOf(scriptOf(read('scale_build_modes_and_minor.html'))); assert.equal(m.exCompletedText({}, m.SCALES), 'Completed 0 of 120 (10 scales, 12 tonics each)');
  const e = pureOf(scriptOf(read('scale_ear_build_the_scale.html'))); assert.equal(e.exCompletedText(e.exCompletedAdd({}, 2, 'dorian'), e.SCALES), 'Completed 1 of 84 (7 scales, 12 tonics each)');
});

// ---- 2. the shelf's structure -----------------------------------------------------------------------------------------------------------------------------------------------------------
for (const f of FIVE) {
  test(`${f}: the shelf is twelve slots (buttons) in the tonic order, below the build area, a group named by a hidden text; no chips row is left; each slot names itself with aria-labelledby (no aria-label, no title)`, () => {
    const p = open(f); same(p.errors, []); const shelf = p.doc.getElementById('shelf')!;
    assert.ok(shelf, 'the shelf'); assert.equal(p.doc.getElementById('homes'), null, 'no #homes any more'); assert.equal(p.doc.querySelectorAll('.home').length, 0, 'no chip left');
    assert.equal(shelf.getAttribute('role'), 'group'); assert.equal(shelf.hasAttribute('aria-label'), false); assert.equal(shelf.hasAttribute('title'), false);
    const name = p.doc.getElementById(shelf.getAttribute('aria-labelledby')!)!; assert.ok(name && /tonic/i.test(name.textContent) && name.classList.contains('sr'), 'the group is named by a hidden .sr text that says tonic');
    assert.equal(shelf.children.length, 12); const scale = p.scale();
    p.slots().forEach((s: any, t: number) => {
      assert.equal(s.tagName, 'BUTTON'); assert.equal(s.getAttribute('type'), 'button'); assert.ok(s.classList.contains('slot')); assert.equal(s.getAttribute('tabindex'), null, 'a native button');
      assert.equal(s.querySelector('.nm').textContent, p.x.tonicName(t, scale), `slot ${t}: the tonic's name as the page names it`);
      assert.equal(s.querySelectorAll('svg').length, 1, 'the mini score svg is always there (the room is reserved) and empty until built'); assert.equal(s.querySelector('svg').children.length, 0);
      for (const e of [s, ...s.querySelectorAll('*')]) { assert.equal(e.hasAttribute('aria-label'), false, `slot ${t}: no aria-label`); assert.equal(e.hasAttribute('title'), false, `slot ${t}: no title`); }
      const lab = p.doc.getElementById(s.getAttribute('aria-labelledby')!)!; assert.ok(lab && lab.classList.contains('sr') && s.contains(lab), `slot ${t}: named by its own hidden text`); assert.equal(lab.textContent, p.x.scaleWords(t, scale), `slot ${t}: the name said in full`);
    });
    same(p.slots().map((s: any) => s.querySelector('.nm').textContent), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((t) => p.x.tonicName(t, scale)), 'the tonic order of the chips: C, D-flat, D ... B');
    // the shelf is under the build area: the strip, the staff, the letters, Play and Reset come before it, and it is the last block of the wrap
    const html = p.h; const at = (id: string): number => html.indexOf(`id="${id}"`);
    for (const id of ['prompt', 'strip', 'staff', 'letters', 'completed', 'play', 'reset']) assert.ok(at(id) > 0 && at(id) < at('shelf'), `${f}: #${id} is above the shelf`);
    assert.ok(at('prompt') < at('strip'), 'the prompt is first now that the chips are gone from the top');
    assert.equal(p.doc.querySelector('.wrap')!.lastElementChild!.id, 'sr', 'only the hidden status span follows the shelf'); assert.equal(p.doc.getElementById('shelf')!.nextElementSibling!.id, 'sr');
  });

  test(`${f}: the shelf has the same twelve children and the same names in EVERY state (fresh, started, half built, failed, completed, a slot restarted, after Reset), one button per slot besides Play and Reset`, () => {
    const p = open(f); const snap = (): string => JSON.stringify(p.slots().map((s: any) => [s.tagName, s.querySelector('.nm') ? 1 : 0, s.querySelectorAll('svg').length, s.getAttribute('aria-labelledby')]));
    const base = snap(); const states: Array<[string, () => void]> = [
      ['started', () => p.start(4)], ['half built', () => p.click(p.key(p.model().notes[3]))], ['failed', () => p.fail()], ['restarted', () => p.start(4)], ['completed', () => p.finish()],
      ['another started', () => p.start(9)], ['another completed', () => p.finish()], ['a completed slot restarted', () => p.start(4)], ['Reset', () => p.click(p.doc.getElementById('reset'))],
    ];
    assert.equal(p.slots().length, 12);
    for (const [name, go] of states) { go(); assert.equal(p.slots().length, 12, `${f}: twelve slots ${name}`); assert.equal(snap(), base, `${f}: the same structure ${name}`); assert.equal(p.doc.querySelectorAll('#shelf > .slot').length, 12); assert.equal(p.doc.getElementById('homes'), null); }
    const buttons = [...p.doc.querySelectorAll('button')].filter((b: any) => !b.closest('#shelf')).map((b: any) => b.textContent.trim()); assert.ok(buttons.includes('Play') && buttons.includes('Reset'));
    assert.equal(p.doc.querySelectorAll('#shelf button').length, 12);
  });
}

// ---- 3. a completed build fills its slot with a mini score --------------------------------------------------------------------------------------------------------------------
for (const f of SIMPLE) {
  const scale = f === 'scale_build_major.html' ? 'major' : 'natural_minor';
  test(`${f}: a completed build fills exactly its slot with a mini score of the scale: for ALL twelve tonics the eight notes carry the letters and accidentals of the shared Scales core, and are the notes of the main staff; the name says "${scale === 'major' ? 'G major' : 'G natural minor'}" style`, () => {
    for (let t = 0; t < 12; t++) {
      const p = open(f); p.start(t); same(p.done(), [], `${t}: nothing is filled while it is built`); assert.equal(p.slots()[t].querySelector('svg').children.length, 0);
      p.finish(); same(p.done(), [t], `${scale} ${t}: exactly its own slot is filled`);
      const slot = p.slots()[t]; const svg = slot.querySelector('svg');
      assert.equal(svg.querySelectorAll('.head').length, 8, 'the eight notes: the tonic up to the tonic'); assert.equal(svg.querySelectorAll('.staffline').length, 5); assert.equal(svg.querySelectorAll('path').length, 1, 'the clef'); assert.equal(svg.querySelectorAll('.head.tonic').length, 2, 'the tonic and its octave');
      assert.equal(svg.querySelectorAll('.head.ghost, .head.sounding').length, 0);
      same(miniNotes(slot), wantNotes(t, scale), `${scale} from ${t}: the mini score spells the scale as the shared core does`);
      same(miniNotes(slot), mainNotes(p), `${scale} from ${t}: the mini score has the notes of the main staff`);
      assert.equal(new Set(miniNotes(slot).slice(0, 7).map((s) => s.split(':')[0])).size, 7, 'one letter per degree');
      assert.equal(slot.querySelector('.nm').textContent, p.x.scaleTitle(t, scale), 'the name under the mini score: "G major"'); assert.equal(slot.querySelector('.nm').textContent.split(' ')[1], scale === 'major' ? 'major' : 'natural');
      assert.ok(slot.classList.contains('done') && slot.classList.contains('current')); assert.equal(svg.getAttribute('aria-hidden'), 'true', 'the score is drawn, not read: the slot has its own name'); assert.equal(svg.hasAttribute('aria-label'), false, 'the staff code\'s label is removed: no aria-label on the shelf');
      assert.match(p.doc.getElementById(slot.getAttribute('aria-labelledby')).textContent, new RegExp(`^${p.x.scaleWords(t, scale)}, completed`), 'the slot says completed');
      for (let o = 0; o < 12; o++) if (o !== t) { assert.equal(p.slots()[o].querySelector('svg').children.length, 0, `slot ${o} stays empty`); assert.equal(p.slots()[o].querySelector('.nm').textContent, p.x.tonicName(o, scale)); }
      same(p.errors, []);
    }
    // non-vacuity: the accidentals are really read from the drawing (D major has two, G sharp natural minor six: the octave G sharp too)
    const q = open(f); q.start(scale === 'major' ? 2 : 8); q.finish(); const n = q.slots()[scale === 'major' ? 2 : 8].querySelectorAll('svg .acc').length; assert.equal(n, scale === 'major' ? 2 : 6);
    assert.deepEqual(miniNotes(q.slots()[scale === 'major' ? 2 : 8]).filter((v) => !v.endsWith(':0')).length, n);
  });
}

for (const f of FULL) {
  test(`${f}: a completed build fills exactly its slot for EVERY scale of the file on all twelve tonics: the mini score spells the scale as the shared core does (one letter per degree for the seven-note scales) and is the main staff's; the shelf follows the chosen scale`, () => {
    const p = open(f); let n = 0;
    for (const scale of p.x.SCALES) {
      p.sel('scale', scale); same(p.done(), [], `${scale}: a scale with nothing built shows an empty shelf`);
      same(p.slots().map((s: any) => s.querySelector('.nm').textContent), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((t) => p.x.tonicName(t, scale)), `${scale}: the shelf says the tonics of THIS scale`);
      for (let t = 0; t < 12; t++) {
        p.start(t); assert.equal(+p.doc.getElementById('tonic').value, t, 'a slot tap sets the tonic select'); p.finish();
        assert.ok(p.done().includes(t), `${scale} ${t}: its slot is filled`); const slot = p.slots()[t];
        same(miniNotes(slot), wantNotes(t, scale), `${scale} from ${t}`); same(miniNotes(slot), mainNotes(p), `${scale} from ${t}: the main staff's notes`);
        assert.equal(slot.querySelector('.nm').textContent, p.x.scaleTitle(t, scale)); assert.equal(slot.querySelector('svg').querySelectorAll('.head').length, p.x.scaleNotes(t, scale, 'up').length + 1);
        if (p.x.scScale(scale).steps.length === 7) assert.equal(new Set(miniNotes(slot).slice(0, 7).map((s) => s.split(':')[0])).size, 7, `${scale} from ${t}: one letter per degree`);
        n++;
      }
      same(p.done(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], `${scale}: twelve filled`);
    }
    assert.equal(n, p.x.SCALES.length * 12); assert.equal(p.text('completed'), `All ${n} built.`);
  });
}

// ---- 4. failing, surviving, restarting, Reset ----------------------------------------------------------------------------------------------------------------------------------------
for (const f of FIVE) {
  test(`${f}: a FAILED build leaves its slot empty and tappable; a completed slot survives starting another tonic, failing another one, and is tappable (a fresh build of it that keeps its mini score); a failed key built later fills`, () => {
    const p = open(f); const scale = p.scale();
    p.start(7); p.fail(); assert.match(p.text('prompt'), /^Exercise over/); same(p.done(), [], 'a failed build fills nothing'); assert.equal(p.slots()[7].querySelector('svg').children.length, 0); assert.ok(!p.slots()[7].classList.contains('done')); assert.equal(p.slots()[7].querySelector('.nm').textContent, p.x.tonicName(7, scale), 'the slot still says only the tonic');
    assert.equal(p.slots()[7].disabled, false, 'tappable'); p.start(7); assert.equal(p.heads(), 1, 'tapping the failed slot starts it fresh'); assert.match(p.text('prompt'), /^Exercise: build /);
    p.start(2); p.finish(); same(p.done(), [2]); const before = JSON.stringify(miniNotes(p.slots()[2])); assert.ok(before.length > 10);
    p.start(9); same(p.done(), [2], 'a completed slot survives starting another tonic'); same(miniNotes(p.slots()[2]), wantNotes(2, scale)); assert.ok(!p.slots()[2].classList.contains('current')); assert.ok(p.slots()[9].classList.contains('current'));
    p.fail(); same(p.done(), [2], 'and failing another one'); same(miniNotes(p.slots()[2]), wantNotes(2, scale));
    p.start(2); same(p.done(), [2], 'tapping a completed slot starts a FRESH build of it and keeps its fill'); assert.equal(p.heads(), 1); assert.match(p.text('prompt'), /^Exercise: build /); assert.equal(p.doc.querySelectorAll('.key.lit:not(.tonic)').length, 0); same(miniNotes(p.slots()[2]), wantNotes(2, scale), 'its mini score stays while it is built again');
    assert.ok(p.slots()[2].classList.contains('done') && p.slots()[2].classList.contains('current')); p.fail(); same(p.done(), [2], 'failing a completed key later does not uncount it'); same(miniNotes(p.slots()[2]), wantNotes(2, scale));
    p.start(7); p.finish(); same(p.done(), [2, 7], 'the failed key, built later, fills'); assert.equal(p.slots().filter((s: any) => s.querySelector('svg').children.length > 0).length, 2, 'exactly the two completed slots carry a mini score');
    same(p.errors, []);
  });

  test(`${f}: Reset clears the shelf (every mini score gone, the slots as quiet as at first, the line back to "Completed 0 of N") and the slots work again`, () => {
    const p = open(f); const scale = p.scale();
    for (const t of [1, 6, 10]) { p.start(t); p.finish(); } same(p.done(), [1, 6, 10]); assert.equal(p.slots().filter((s: any) => s.querySelector('svg').children.length > 0).length, 3);
    p.click(p.doc.getElementById('reset')); same(p.done(), []); for (const s of p.slots()) { assert.equal(s.querySelector('svg').children.length, 0); assert.ok(!s.classList.contains('done')); }
    assert.equal(p.slots().length, 12); assert.match(p.text('completed'), /^Completed 0 of /); same(p.slots().map((s: any) => s.querySelector('.nm').textContent), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((t) => p.x.tonicName(t, scale)));
    p.start(6); p.finish(); same(p.done(), [6]); same(miniNotes(p.slots()[6]), wantNotes(6, scale));
  });

  test(`${f}: the count line says "Completed n of N" and, when every pair is done, "All ... built."; it keeps counting with the shelf`, () => {
    const p = open(f); const x = p.x; const total = x.SCALES.length * 12; assert.match(p.text('completed'), new RegExp(`^Completed 0 of ${total}`));
    p.start(0); p.finish(); assert.match(p.text('completed'), new RegExp(`^Completed 1 of ${total}`)); p.start(5); p.finish(); assert.match(p.text('completed'), new RegExp(`^Completed 2 of ${total}`));
    if (!p.simple) assert.match(p.text('completed'), /\(\d+ scales, 12 tonics each\)$/);
  });
}

test('the many-scale shelf follows the chosen scale and REMEMBERS every scale: what is built in Dorian shows again when Dorian is chosen again; "Completed n of N" counts every scale\'s pairs', () => {
  const p = open('scale_build_modes_and_minor.html'); const D = 'dorian', P = 'phrygian';
  p.sel('scale', D); p.start(2); p.finish(); p.start(8); p.finish(); same(p.done(), [2, 8]); assert.equal(p.text('completed'), 'Completed 2 of 120 (10 scales, 12 tonics each)');
  p.sel('scale', P); same(p.done(), [], 'Phrygian has nothing built'); assert.equal(p.text('completed'), 'Completed 2 of 120 (10 scales, 12 tonics each)', 'the count keeps counting every pair');
  same(p.slots().map((s: any) => s.querySelector('.nm').textContent), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((t) => p.x.tonicName(t, P)));
  p.start(2); p.finish(); same(p.done(), [2]); same(miniNotes(p.slots()[2]), wantNotes(2, P)); assert.equal(p.slots()[2].querySelector('.nm').textContent, p.x.scaleTitle(2, P)); assert.equal(p.text('completed'), 'Completed 3 of 120 (10 scales, 12 tonics each)');
  p.sel('scale', D); same(p.done(), [2, 8], 'back to Dorian: its completions are there'); same(miniNotes(p.slots()[2]), wantNotes(2, D), 'with Dorian\'s own mini score, not Phrygian\'s'); same(miniNotes(p.slots()[8]), wantNotes(8, D)); assert.notDeepEqual(miniNotes(p.slots()[2]), wantNotes(2, P));
  assert.equal(p.slots()[2].querySelector('.nm').textContent, p.x.scaleTitle(2, D));
  p.sel('scale', P); same(p.done(), [2]); same(miniNotes(p.slots()[2]), wantNotes(2, P));
  // a tonic chosen with the select (not the shelf) still marks its slot current; Reset clears every scale's memory
  p.sel('tonic', '5'); assert.ok(p.slots()[5].classList.contains('current')); assert.equal(p.doc.querySelectorAll('#shelf [aria-current]').length, 1);
  p.click(p.doc.getElementById('reset')); same(p.done(), []); p.sel('scale', D); same(p.done(), [], 'Reset cleared the memory of every scale'); assert.equal(p.text('completed'), 'Completed 0 of 120 (10 scales, 12 tonics each)');
});

test('the many-scale shelf: a slot tap starts the tonic at the chosen level and scale (the level machinery is untouched); the other scales\' build rules still hold; Random does not break the shelf', () => {
  const p = open('scale_ear_build_the_scale.html'); p.click(p.doc.getElementById('level-hard')); p.start(4); assert.match(p.text('hint'), /1 wrong tap left/); assert.ok(p.slots()[4].classList.contains('current'));
  p.click(p.doc.getElementById('level-easy')); assert.match(p.text('hint'), /5 wrong taps left/); assert.ok(p.slots()[4].classList.contains('current'), 'a level change keeps the tonic');
  p.start(4); p.finish(); same(p.done(), [4]); assert.match(p.text('counter'), /^Easy: score 1 of 1 exercise$/);
  for (let i = 0; i < 12; i++) { p.click(p.doc.getElementById('random')); assert.equal(p.slots().length, 12); assert.equal(p.doc.querySelectorAll('#shelf [aria-current]').length, 1); assert.equal(p.slots().findIndex((s: any) => s.classList.contains('current')), +p.doc.getElementById('tonic').value); }
  p.click(p.doc.getElementById('again')); assert.equal(p.heads(), 1, 'New exercise still works');
});

test('the two single-scale files: the shelf fills one slot at a time, in any order, to twelve mini scores, then "All twelve built."; a later failure takes nothing back', () => {
  for (const f of SIMPLE) {
    const p = open(f); const scale = p.scale(); const order = [7, 0, 11, 3, 5, 9, 1, 10, 2, 8, 4, 6];
    order.forEach((t, i) => { assert.equal(p.text('completed'), `Completed ${i} of 12`); p.start(t); p.finish(); assert.equal(p.done().length, i + 1); same(miniNotes(p.slots()[t]), wantNotes(t, scale)); });
    assert.equal(p.text('completed'), 'All twelve built.'); assert.equal(p.slots().filter((s: any) => s.querySelector('svg').querySelectorAll('.head').length === 8).length, 12, 'twelve mini scores');
    p.start(0); p.fail(); assert.equal(p.text('completed'), 'All twelve built.'); assert.equal(p.done().length, 12);
  }
});

// ---- 5. no hover, no tooltip, one height, no second drawing code ------------------------------------------------------------------------------------------------------------------
test('no hover rule or handler, no tooltip, no network, no Forge word in the five files (the shelf added none); the words of the exercises hold in every shelf state', () => {
  const FORBIDDEN = /\b(tests?|quiz(zes)?|games?|questions?)\b/i;
  for (const f of FIVE) {
    const h = read(f);
    assert.doesNotMatch(h, /:hover|\btitle=|\.title\s*=|mouseover|mouseenter|mouseout|mouseleave|pointerover|pointerenter|pointermove|onmouse|\bonpointer|setAttribute\(\s*["']title|forge-sr-only/i, `${f}: nothing reacts to a resting pointer`);
    assert.doesNotMatch(h, /localStorage|sessionStorage|indexedDB|XMLHttpRequest|fetch\(|https?:\/\/(?!www\.w3\.org)/, `${f}: no storage, no network`); assert.doesNotMatch(h, /\bForge\b|forge-/i, `${f}: no Forge word`);
    assert.equal(codeOf(h).match(/<title>/g)!.length, 1);
    const p = open(f); const seen = (): string => [p.doc.body.textContent, ...[...p.doc.querySelectorAll('[aria-label],[aria-description],[title]')].map((e: any) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('aria-description') ?? ''}`), p.text('sr')].join(' ');
    assert.doesNotMatch(seen(), FORBIDDEN, `${f}: fresh`); p.start(3); p.finish(); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: a slot filled`); p.start(6); p.fail(); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: failed`);
    assert.doesNotMatch(seen(), /\bpassed\b/i); assert.equal(p.doc.querySelectorAll('[title]').length, 0);
    assert.equal(p.doc.querySelectorAll('#shelf [aria-label], #shelf [title]').length, 0);
  }
});

test('the room for the twelve slots is reserved by the stylesheet: a CSS grid of fixed-height slots (4 columns, 3 below 420 px), the mini score box of a fixed size, the same in every state; no JavaScript layout, no scroll box', () => {
  for (const f of FIVE) {
    const h = read(f); const css = /<style>([\s\S]*?)<\/style>/.exec(h)![1]; const rule = (sel: string): string => { const m = new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.#[\]()]/g, '\\$&')} \\{([^}]*)\\}`).exec(css); assert.ok(m, `${f}: a rule for ${sel}`); return m![1]; };
    assert.match(rule('#shelf'), /display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/); assert.match(css, /@media \(max-width: 419px\) \{ #shelf \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \} \}/);
    const slotH = /(?:^|[\s;])height: (\d+)px/.exec(rule('.slot')); assert.ok(slotH && +slotH[1] >= 56, `${f}: a fixed slot height`); const miniH = /(?:^|[\s;])height: (\d+)px/.exec(rule('.slot .mini')); assert.ok(miniH && +miniH[1] >= 30 && +miniH[1] < +slotH![1], `${f}: a fixed mini score height inside the slot`);
    assert.match(rule('.slot'), /display: flex; flex-direction: column;/); assert.doesNotMatch(css.split('\n').filter((l) => !/^\s*\.sr \{/.test(l)).join('\n'), /(?<![-\w])overflow\s*:|:hover/, `${f}: no scroll box (text-overflow of the scale select aside), no hover`);
    assert.match(css, /\.slot\.done \{/); assert.match(css, /\.slot\.current \{ border-color: var\(--accent\)/); assert.match(css, /\.slot \.mini \.staffline, \.slot \.mini \.ledger \{ vector-effect: non-scaling-stroke; \}/);
    // the slots are made once, never added or removed by the render
    const code = codeOf(h); assert.equal((code.match(/\$\("shelf"\)\.appendChild/g) ?? []).length, 1, `${f}: the twelve slots are built once, at start-up`);
    assert.doesNotMatch(code, /\$\("shelf"\)\.(textContent|innerHTML)\s*=/, `${f}: the shelf is never rebuilt`);
  }
});

test('the mini score is drawn by the SAME staff code as the main staff: one `drawStaff` (the shared block), no second spelling or drawing algorithm in the page\'s own code; the mini helper is the same text in both templates\' files', () => {
  const own = (h: string): string => codeOf(['scale core', 'piano voice', 'scale view'].reduce((t, n) => t.replace(block(h, n), ''), h));
  const helper = (h: string): string => { const a = h.indexOf('  function drawMini'); assert.ok(a > 0, 'drawMini'); return h.slice(a, h.indexOf('\n  }\n', a)); };
  const ref = helper(read(FIVE[0])); assert.match(ref, /drawStaff\(notes, midis\)/); assert.match(ref, /exMiniScore\(/); assert.ok(ref.length > 400, 'non-vacuity');
  for (const f of FIVE) {
    const h = read(f); assert.equal(h.split('function drawStaff(').length, 2, `${f}: one drawStaff`); assert.equal(helper(h), ref, `${f}: the mini helper`);
    assert.doesNotMatch(own(h), /"ellipse"|"line"|ledgersOf|staffPos|CLEF_D|CLEF_SCALE =|scHeptatonic|scTonicSpelling|SC_LETTER_PC/, `${f}: the page's own code draws nothing and spells nothing itself`);
    assert.doesNotMatch(helper(h), /spellScale|createElementNS|"ellipse"/, `${f}: the helper only points the shared drawStaff at the slot's svg`);
  }
  // the pure part that says WHAT to draw: spelled by the shared core, with the octave note, the same function text in all five
  const mini = (h: string): string => { const a = h.indexOf('  function exMiniScore'); assert.ok(a > 0); return h.slice(a, h.indexOf('\n', a)); };
  const m0 = mini(read(FIVE[0])); for (const f of FIVE) assert.equal(mini(read(f)), m0, `${f}: exMiniScore`);
  const x = pureOf(scriptOf(read(FIVE[0]))); for (const [t, sc] of [[0, 'major'], [6, 'major'], [3, 'natural_minor'], [8, 'natural_minor']] as Array<[number, string]>) { const r = x.exMiniScore(t, sc); same(r.notes.map((n: any) => `${n.l}:${n.a}`), wantNotes(t, sc)); same(r.midis, playerCore.scaleMidis(t, sc, 'up', 60)); assert.ok(!r.notes.some((n: any) => n.hidden || n.ghost)); }
});
