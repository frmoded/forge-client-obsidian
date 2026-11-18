// 2026-11-19-0800 - NOTHING appears, changes or opens because the pointer RESTS on something (driver 2026-11-18: "remove all hover behavior"). A source scan over the three places a hover can live in this repo: (1) the plugin's own code and
// styles.css, (2) every vault gadget the plugin bundles (assets/vaults/**/resources/html/*.html: the website embeds the same files), and (3) the plugin's DOM. theory-site's template has its own scan (theory-site/test/no-hover.test.mjs).
// What counts: a pointer-REST handler (mouseover / mouseenter / mouseleave / mouseout / pointerenter / pointerleave / pointerover / pointerout), a `:hover` selector, and a native `title` tooltip. What does NOT: keyboard focus
// (`:focus-visible`, focus / blur handlers), the pressed state (`:active`), and a move handler that only runs WHILE a button is held (a drag): mousemove / pointermove are allowed only where src/no-hover-allowlist.json lists them, each with
// the reason. The allow-list is ONE file, checked in both directions (an entry that matches nothing fails: remove the line; a finding that is not listed fails: add the line or remove the behaviour), and the scan itself is shown red by a
// synthetic file (control test below). Pins the MECHANISM (what the pointer cannot do), not today's spelling of the code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
interface Allowed { file: string; pattern: string; reason: string; }
const ALLOW: Allowed[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/no-hover-allowlist.json'), 'utf8')).allowed;

const REST_EVENT = /['"`](?:mouseover|mouseenter|mouseleave|mouseout|pointerenter|pointerleave|pointerover|pointerout)['"`]/;
const MOVE_EVENT = /['"`](?:mousemove|pointermove)['"`]/;
const ON_ATTR = /\bon(?:mouseover|mouseenter|mouseleave|mouseout|pointerenter|pointerleave|pointerover|pointerout)\s*=/i;
const HOVER_SELECTOR = /:hover\b/;
const TITLE_ATTR = [/setAttribute\(\s*['"`]title['"`]/, /setAttr\(\s*['"`]title['"`]/, /\.title\s*=[^=]/, /\battr\s*:\s*\{[^}]*\btitle\s*:/, /(?<![\w-])title\s*=\s*["'\\]/, /\bsetTooltip\(/, /\bdata-tooltip\b/];
const RULES: Array<[string, RegExp[]]> = [['pointer-rest handler', [REST_EVENT, ON_ATTR]], ['move handler (allowed only while a button is held: list it)', [MOVE_EVENT]], [':hover selector', [HOVER_SELECTOR]], ['native tooltip (title / setTooltip)', TITLE_ATTR]];

const stripComments = (text: string, kind: 'ts' | 'css' | 'html'): string => {
  let t = text;
  if (kind === 'css' || kind === 'html') t = t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (kind === 'ts') t = t.replace(/^\s*\/\*[\s\S]*?\*\//gm, ' ');          // a block comment that opens a line (a '/*' inside a string must not swallow the code after it)
  if (kind === 'ts' || kind === 'html') t = t.replace(/^\s*\/\/.*$/gm, ' ').replace(/([;{}),])\s*\/\/[^\n'"`]*$/gm, '$1');
  if (kind === 'html') t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  return t;
};

/** What the scan finds in one file's text: [rule, matched line]. Pure, so the control test can feed it a synthetic file. */
export function findHover(text: string, kind: 'ts' | 'css' | 'html'): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of stripComments(text, kind).split('\n')) for (const [name, res] of RULES) if (res.some((r) => r.test(line))) out.push([name, line.trim().slice(0, 140)]);
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
const GADGETS = walk(path.join(ROOT, 'assets/vaults'), (r) => /\/resources\/html\/[^/]+\.html$/.test(r));
const CSS = [path.join(ROOT, 'styles.css')];

function scan(files: string[], kind: 'ts' | 'css' | 'html'): { findings: string[]; used: Set<Allowed> } {
  const findings: string[] = []; const used = new Set<Allowed>();
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    for (const [rule, line] of findHover(fs.readFileSync(f, 'utf8'), kind)) { const a = allowed(rel, line); if (a) used.add(a); else findings.push(`${rel}: ${rule}: ${line}`); }
  }
  return { findings, used };
}
const results = { src: scan(SRC, 'ts'), css: scan(CSS, 'css'), gadgets: scan(GADGETS, 'html') };

test('the plugin\'s code has no pointer-rest handler and no native tooltip (a drag handler is listed with its reason)', () => {
  assert.ok(SRC.length > 100, `non-vacuity: walked ${SRC.length} source files`);
  assert.equal(results.src.findings.join('\n'), '');
});
test('styles.css has no :hover selector (focus-visible and active stay; a control looks clickable by its shape and cursor: pointer)', () => {
  assert.ok(fs.readFileSync(CSS[0], 'utf8').length > 50000, 'non-vacuity: styles.css was read');
  assert.equal(results.css.findings.join('\n'), '');
});
test('no bundled vault gadget has a :hover rule, a pointer-rest handler or a native title tooltip', () => {
  assert.ok(GADGETS.length >= 37, `non-vacuity: walked ${GADGETS.length} gadget files`);
  assert.equal(results.gadgets.findings.join('\n'), '');
});
test('the allow-list is honest: every entry still matches a line (a stale entry is removed), and every entry says why', () => {
  const used = new Set([...results.src.used, ...results.css.used, ...results.gadgets.used]);
  assert.deepEqual(ALLOW.filter((a) => !used.has(a)).map((a) => `${a.file}: ${a.pattern}`), [], 'entries that match nothing');
  for (const a of ALLOW) assert.ok(a.reason.length > 25 && /held|drag|clears|never|not a/i.test(a.reason), `${a.file}: the reason says what makes it not a hover`);
});
test('CONTROL: the scan can fail (a synthetic file with each kind of hover is found; focus, active and a plain click are not)', () => {
  const bad = `el.addEventListener('mouseenter', f);\nb.setAttribute('title', 'x');\nb:hover { color: red }\n<button title="Play">P</button>\nroot.onmouseover = f;\n`;
  assert.deepEqual(findHover(bad, 'ts').map(([r]) => r), ['pointer-rest handler', 'native tooltip (title / setTooltip)', ':hover selector', 'native tooltip (title / setTooltip)', 'pointer-rest handler']);
  const good = `el.addEventListener('focus', f); el.addEventListener('click', f);\nb:focus-visible { outline: 1px solid } b:active { color: red }\n// mouseenter in a comment\n/* b:hover { } */`;
  assert.deepEqual(findHover(good, 'ts'), []);
  assert.deepEqual(findHover('b:active { x } /* b:hover */', 'css'), []);
});
