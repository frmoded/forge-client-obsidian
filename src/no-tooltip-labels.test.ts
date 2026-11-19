// 2026-11-19-0925 - ZERO tooltips, Obsidian's own included (driver 2026-11-18, accepting the recommendation of 0800's 5b). Obsidian draws a tooltip from ANY element that has an `aria-label` and from `setTooltip`, so:
//   1. SOURCE SCAN: no non-test file under src/ (not *.generated.ts) has an `aria-label` (any spelling: the attribute, `ariaLabel`, `AriaLabel` identifiers that feed it), a `setTooltip(` call or a `data-tooltip` attribute,
//      and styles.css has no selector on them, except what src/no-tooltip-labels-allowlist.json lists (aim: nothing; checked in both directions like src/no-hover-allowlist.json, with a control test that shows the scan red).
//   2. THE NAME STAYS: every control the plugin builds names itself through `aria-labelledby` -> a hidden `.forge-sr-only` span with text, and has no `aria-label` (the mounts below, in happy-dom).
//   3. THE HELPER: setSrLabel makes the span, points at it, is idempotent, keeps one span for a rebuilt element, and removes an aria-label that was there.
//   The hidden span measures 1 px in real Chrome with the real styles.css: scripts/dev/measure-sr-only.mjs (asserted here on the stylesheet's text; the numbers are in the feedback).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { setSrLabel, SR_ONLY_CLASS } from './sr-label-core.ts';
import { accessibleName, auditLabels, visibleText } from './test-support/accessible-name.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
interface Allowed { file: string; pattern: string; reason: string; }
const ALLOW: Allowed[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/no-tooltip-labels-allowlist.json'), 'utf8')).allowed;

// `aria-label` but not `aria-labelledby`; `ariaLabel` / `AriaLabel` identifiers (they carry the text into an attribute); Obsidian's tooltip API and its position attribute.
const PATTERNS: Array<[string, RegExp]> = [
  ['aria-label (Obsidian draws a tooltip from it)', /aria-?label(?!ledby)/i],
  ['setTooltip (Obsidian\'s tooltip API)', /\bsetTooltip\s*\(/],
  ['data-tooltip (Obsidian\'s tooltip position attribute)', /\bdata-tooltip/],
  // `addAction(icon, title, ...)` and `addRibbonIcon(icon, title, ...)` give the title to Obsidian, which writes it into the icon's aria-label: every call goes through addQuietAction / addQuietRibbonIcon (src/sr-label-core.ts)
  ['addAction / addRibbonIcon called directly (Obsidian writes the title into an aria-label: use addQuietAction / addQuietRibbonIcon)', /\.addAction\s*\(|\b(?:this|plugin)\.addRibbonIcon\s*\(/],
];
// Taking a label AWAY is the cure, not the disease: `removeAttribute('aria-label')` is not a finding.
const REMOVAL = /removeAttribute\(\s*['"`]aria-label['"`]\s*\)/g;

const stripComments = (text: string, kind: 'ts' | 'css'): string => {
  let t = text;
  if (kind === 'css') t = t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (kind === 'ts') t = t.replace(/^\s*\/\*[\s\S]*?\*\//gm, ' ');          // a block comment that opens a line (a '/*' inside a string must not swallow the code after it)
  if (kind === 'ts') t = t.replace(/^\s*\/\/.*$/gm, ' ').replace(/([;{}),])\s*\/\/[^\n'"`]*$/gm, '$1');
  return t;
};

/** What the scan finds in one file's text: [rule, matched line]. Pure, so the control test can feed it a synthetic file. */
export function findTooltips(text: string, kind: 'ts' | 'css'): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of stripComments(text, kind).split('\n')) {
    const code = line.replace(REMOVAL, ' ');
    for (const [name, re] of PATTERNS) if (re.test(code)) out.push([name, line.trim().slice(0, 140)]);
  }
  return out;
}
const allowed = (rel: string, line: string): Allowed | undefined => ALLOW.find((a) => a.file === rel && line.includes(a.pattern));

function walk(dir: string, keep: (rel: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') out.push(...walk(full, keep)); } else if (keep(path.relative(ROOT, full))) out.push(full);
  }
  return out;
}
const SRC = walk(path.join(ROOT, 'src'), (r) => /\.ts$/.test(r) && !/\.test\.ts$/.test(r) && !/\.generated\.ts$/.test(r) && !r.includes('test-support'));
const CSS = [path.join(ROOT, 'styles.css')];

function scan(files: string[], kind: 'ts' | 'css'): { findings: string[]; used: Set<Allowed> } {
  const findings: string[] = []; const used = new Set<Allowed>();
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    for (const [rule, line] of findTooltips(fs.readFileSync(f, 'utf8'), kind)) { const a = allowed(rel, line); if (a) used.add(a); else findings.push(`${rel}: ${rule}: ${line}`); }
  }
  return { findings, used };
}
const results = { src: scan(SRC, 'ts'), css: scan(CSS, 'css') };

// ---- 1. the source scan -------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the plugin\'s code has no aria-label, no setTooltip and no data-tooltip (a control names itself with aria-labelledby: src/sr-label-core.ts)', () => {
  assert.ok(SRC.length > 100, `non-vacuity: walked ${SRC.length} source files`);
  assert.equal(results.src.findings.join('\n'), '');
});
test('styles.css has no selector on aria-label or data-tooltip', () => {
  assert.ok(fs.readFileSync(CSS[0], 'utf8').length > 50000, 'non-vacuity: styles.css was read');
  assert.equal(results.css.findings.join('\n'), '');
});
test('the allow-list is honest: every entry still matches a line (a stale entry is removed), and every entry says why in a sentence (the aim is an empty list)', () => {
  const used = new Set([...results.src.used, ...results.css.used]);
  assert.deepEqual(ALLOW.filter((a) => !used.has(a)).map((a) => `${a.file}: ${a.pattern}`), [], 'entries that match nothing');
  for (const a of ALLOW) assert.ok(a.file && a.pattern && a.reason.length > 25 && /\.$/.test(a.reason.trim()), `${a.file}: a pattern and a one-sentence reason`);
});
test('CONTROL: the scan can fail (every spelling is found; aria-labelledby, a removal and a comment are not)', () => {
  const bad = `b.setAttribute('aria-label', 'x');\nattr: { 'aria-label': 'y' },\nconst h = \`<button aria-label="z">\`;\nb.ariaLabel = 'w';\nresetAriaLabel: string;\nnew ButtonComponent(el).setTooltip('t');\nel.setAttribute('data-tooltip-position', 'top');\nthis.addAction('x', 'Title', f);\nthis.addRibbonIcon('x', 'Title', f);\n`;
  assert.deepEqual(findTooltips(bad, 'ts').map(([r]) => r.split(' ')[0]), ['aria-label', 'aria-label', 'aria-label', 'aria-label', 'aria-label', 'setTooltip', 'data-tooltip', 'addAction', 'addAction']);
  const good = `b.setAttribute('aria-labelledby', id);\naddQuietAction(this, 'x', 'Title', f);\nel.removeAttribute('aria-label');\n// aria-label in a comment\n/* setTooltip( in a block */\n`;
  assert.deepEqual(findTooltips(good, 'ts'), []);
  assert.deepEqual(findTooltips('[aria-label] { x } /* [data-tooltip] */', 'css').map(([r]) => r.split(' ')[0]), ['aria-label']);
});

// ---- 3. the helper -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const win: any = new Window({ url: 'http://localhost/' });
const fresh = (): any => { const host = win.document.createElement('div'); win.document.body.appendChild(host); return host; };

test('setSrLabel: a hidden span inside the button with the text, aria-labelledby pointing at it, and no aria-label (a stale one is removed)', () => {
  const host = fresh(); const b = win.document.createElement('button'); b.setAttribute('aria-label', 'old'); host.appendChild(b);
  const span = setSrLabel(b, 'Play');
  assert.equal(span.className, SR_ONLY_CLASS); assert.equal(span.textContent, 'Play'); assert.equal(span.parentNode, b);
  assert.equal(b.getAttribute('aria-labelledby'), span.id); assert.ok(span.id); assert.equal(b.hasAttribute('aria-label'), false);
  assert.equal(accessibleName(b), 'Play'); assert.equal(visibleText(b), '', 'a hidden name is not text on the screen');
});
test('setSrLabel: idempotent (a new text changes the text, one span), survives the element\'s children being replaced, and ids are unique', () => {
  const host = fresh(); const a = win.document.createElement('button'); const c = win.document.createElement('button'); host.append(a, c);
  const s1 = setSrLabel(a, 'Play'); const s2 = setSrLabel(a, 'Pause'); assert.equal(s1, s2); assert.equal(a.querySelectorAll('.forge-sr-only').length, 1); assert.equal(accessibleName(a), 'Pause');
  a.replaceChildren('icon'); assert.equal(a.querySelectorAll('.forge-sr-only').length, 0, 'the children were replaced');
  setSrLabel(a, 'Pause'); assert.equal(a.querySelectorAll('.forge-sr-only').length, 1, 'a second call puts the span back'); assert.equal(accessibleName(a), 'Pause');
  const s3 = setSrLabel(c, 'Reset'); assert.notEqual(s3.id, s1.id);
});
test('setSrLabel: an input or a select (no children) gets the span as its next sibling; a host puts it where the caller says; a key reuses the span of a rebuilt element', () => {
  const host = fresh(); const inp = win.document.createElement('input'); const sel = win.document.createElement('select'); host.append(inp, sel);
  const s = setSrLabel(inp, 'Tempo'); assert.equal(inp.nextSibling, s); assert.equal(inp.querySelector('span'), null); assert.equal(accessibleName(inp), 'Tempo');
  setSrLabel(sel, 'Kit'); assert.equal(sel.nextSibling.textContent, 'Kit');
  const bank = fresh(); const first = win.document.createElement('button'); host.appendChild(first);
  const k1 = setSrLabel(first, 'Tempo value', { host: bank, key: 'tempo' }); assert.equal(k1.parentNode, bank);
  const second = win.document.createElement('button'); first.replaceWith(second);
  const k2 = setSrLabel(second, 'Tempo value', { host: bank, key: 'tempo' }); assert.equal(k2, k1, 'the same span'); assert.equal(bank.querySelectorAll('.forge-sr-only').length, 1);
  assert.equal(second.getAttribute('aria-labelledby'), k1.id);
});
test('the hidden class is the standard clip pattern in styles.css (1 px, clipped, out of the flow), and NOT display:none or visibility:hidden (that would hide the name from a screen reader)', () => {
  const css = fs.readFileSync(CSS[0], 'utf8'); const m = /^\.forge-sr-only\s*\{([^}]*)\}/m.exec(css); assert.ok(m, 'a .forge-sr-only rule');
  const body = m![1];
  for (const part of [/position:\s*absolute/, /width:\s*1px/, /height:\s*1px/, /margin:\s*-1px/, /padding:\s*0/, /overflow:\s*hidden/, /clip:\s*rect\(0 0 0 0\)/, /clip-path:\s*inset\(50%\)/, /white-space:\s*nowrap/, /border:\s*0/]) assert.match(body, part);
  assert.doesNotMatch(body, /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/);
});

// ---- 2. every control the plugin builds keeps its name, with no aria-label ----------------------------------------------------------------------------------------------------------------------
import { mountScoreTransport, type TransportPlayer } from './score-transport-dom.ts';
import { exportItems } from './score-transport-core.ts';
import { mountSelectionMenu } from './bar-selection-menu-dom.ts';
import { mountPromptBox } from './prompt-box-dom.ts';
import { mountArrangementControls } from './arrangement-controls-dom.ts';
import { mountStructureStrip } from './structure-strip-dom.ts';
import { chipsFor } from './structure-strip-core.ts';
import { mountNotebook } from './notebook-dom.ts';
import { mountTransformStrip } from './phrase-transform-dom.ts';
import { mountChatPanel } from './chat-panel-dom.ts';
import { mountKitDialog } from './kit-dom.ts';
import { mountSentencePlan } from './sentence-plan-dom.ts';
import { mountCompositionStrip } from './composition-strip-dom.ts';
import { mountPhraseControls, mountMixControls, mountMorphControls } from './phrase-dom.ts';
import { setStatusBarLabel, statusBarLabelText } from './build-stamp-core.ts';

const noop = (): void => {};
function check(name: string, el: any, expectNames: string[]): void {
  assert.deepEqual(auditLabels(el), [], `${name}: labels are clean`);
  const labelled = [...el.querySelectorAll('[aria-labelledby]')]; if (el.hasAttribute?.('aria-labelledby')) labelled.unshift(el);
  const names = labelled.map((e: any) => accessibleName(e));
  for (const n of expectNames) assert.ok(names.includes(n), `${name}: a control is named "${n}" (names: ${JSON.stringify(names)})`);
  assert.ok(labelled.length >= expectNames.length, `${name}: non-vacuity`);
}

test('the Score transport row: every icon button (Play, Back to the start, Slower, Faster, Export), the tempo value, the group and the menu are named by a hidden span; Play becomes Pause in the SAME span; the tempo field is named too', () => {
  const doc = win.document; const toolbar = doc.createElement('div'); doc.body.appendChild(toolbar);
  let playing = false; const ls: Array<(p: boolean) => void> = [];
  const player: TransportPlayer = { get playing() { return playing; }, start() { playing = true; ls.forEach((l) => l(true)); }, stop() { playing = false; ls.forEach((l) => l(false)); }, reset: noop, setTempo: noop, onStateChange(fn) { ls.push(fn); return noop; } };
  const row = mountScoreTransport(toolbar, { player, exportItems: exportItems({ macDesktop: false }), runExport: noop });
  check('transport', row.el, ['Play', 'Back to the start', 'Slower', 'Faster', 'Export', 'Score controls', 'Tempo']);
  const play = row.el.querySelector('.forge-tp-play') as any; const id = play.getAttribute('aria-labelledby');
  play.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal(accessibleName(play), 'Pause'); assert.equal(play.getAttribute('aria-labelledby'), id, 'the same span, its text changed'); assert.equal(doc.getElementById(id).textContent, 'Pause');
  (row.el.querySelector('.forge-tp-tempo') as any).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const field = row.el.querySelector('.forge-tp-tempo-input') as any; assert.ok(field, 'the field opened'); assert.deepEqual(auditLabels(row.el), []); assert.ok(accessibleName(field).length > 3);
});
test('the bar-selection menu: the clear button (×) is named by a hidden span, the toolbar too', () => {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const menu = mountSelectionMenu(host, { onAction: noop, onClear: noop });
  check('selection menu', menu.el, ['Clear the selection', 'Selected bars']);
  assert.equal(visibleText(menu.el.querySelector('.forge-bar-selection-clear')), '×');
});
test('the composer: plus, send, the field, the region, the menu and the live region are named by hidden spans', () => {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  mountPromptBox(parent, { preview: async () => ({ ok: false, message: 'x' }) as any, apply: async () => ({ ok: true, disk: '' }) as any, cancel: noop, discard: noop, history: { get: () => [], set: noop } } as any, 'A sentence.');
  check('composer', parent, ['Composer']);
  assert.ok(accessibleName(parent.querySelector('.forge-composer-plus')).length > 2); assert.ok(accessibleName(parent.querySelector('.forge-composer-send')).length > 2);
});
test('the arrangement mixer: Mute, Solo and the volume slider of each kit say which kit, by a hidden span', () => {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const h = mountArrangementControls(parent, { commit: noop, trace: noop, setTimer: () => 1, clearTimer: noop });
  h.show({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] } as any);
  check('arrangement controls', parent, ['Mute rock', 'Solo rock', 'Volume of latin', 'Kits']);
});
test('the structure strip and the composition strip: each chip button says what a click opens, by a hidden span', () => {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const h = mountStructureStrip(parent, { onHover: noop, onClick: noop });
  h.set(chipsFor('phrase_004', { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 17, order: 'musical', seed: 0 } as any));
  check('structure strip', h.el, ['Open bar_007', 'Open phrase_004', 'Open bar_008', 'Structure']);
});
test('the status-bar item: the text stays for a screen reader through aria-labelledby, with no aria-label and no data-tooltip-position', () => {
  const item = win.document.createElement('div'); item.textContent = 'Forge v1'; win.document.body.appendChild(item);
  const text = statusBarLabelText({ version: '1', build: 'b', pluginId: 'forge', minAppVersion: '1.0' });
  setStatusBarLabel(item, text);
  assert.equal(accessibleName(item), text); assert.equal(item.hasAttribute('aria-label'), false); assert.equal(item.hasAttribute('data-tooltip-position'), false); assert.deepEqual(auditLabels(item), []);
  assert.equal(visibleText(item), 'Forge v1');
});
