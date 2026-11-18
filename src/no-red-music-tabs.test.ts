// 2026-11-18 (R1, item 1) - NO RED in the music tabs' dialog and composer (driver: "no red text anywhere ... the error stays recognisable by its wording and by a small neutral '!' glyph, not by colour"). A source scan over the
// styles of the music-tab components (every styles.css rule whose selector names the chat panel, the composer, the prompt box, the Score toolbar and transport, the description bar) and over their TypeScript, for the error colour
// tokens (`--text-error`, `--background-modifier-error`, `--color-red`), named reds and red colour literals (hex, rgb, hsl: judged by HUE, so `#f00`, `#d33`, `#d0312d`, `rgb(220,38,38)` are all found). The allow-list file
// src/no-red-music-tabs-allowlist.json is the ONE place a legitimate use would be written down, with its reason; it is checked in BOTH directions like src/no-hover-allowlist.json (an entry that matches nothing fails; a finding
// that is not listed fails) and the scan itself is proved by a synthetic file (control test). The components outside the music tabs (the Forge output panel, the Score's own message line, the playing-note highlight) are NOT in scope here:
// they keep their colours (P3), pinned by chat-panel-look.test.ts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
interface Allowed { file: string; pattern: string; reason: string; }
const ALLOW: Allowed[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/no-red-music-tabs-allowlist.json'), 'utf8')).allowed;

/** The music tabs' components: selectors in styles.css, and the TypeScript files that draw the dialog, the composer and their lines. */
export const SELECTOR_SCOPE = /\.forge-(?:chat-|composer|prompt-box|score-toolbar|score-transport|tp-|description-bar|description-message|description-buttons|description-preview)/;
export const TS_SCOPE = ['chat-panel-dom.ts', 'prompt-box-dom.ts', 'composer-core.ts', 'dialog-core.ts', 'relative-time-core.ts', 'chat-layout-core.ts', 'score-transport-dom.ts', 'description-bar-dom.ts', 'prompt-box-core.ts'];

const TOKEN = /--text-error|--background-modifier-error|--color-red|\b(?:crimson|firebrick|darkred|indianred|tomato|maroon)\b|\bcolor\s*:\s*red\b|\b(?:border|background|outline|fill|stroke)(?:-[a-z]+)*\s*:[^;{}]*\bred\b/i;
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi;
const RGB = /\brgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/gi;
const HSL = /\bhsla?\(\s*(-?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/gi;
const hueRed = (r: number, g: number, b: number): boolean => {
  const [R, G, B] = [r, g, b].map((v) => v / 255) as [number, number, number]; const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  if (d < 0.15 || mx < 0.25) return false;
  const h = (mx === R ? ((G - B) / d + 6) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60;
  return h <= 20 || h >= 340;
};
const hexRed = (h: string): boolean => {
  let x = h.slice(1); if (x.length === 3 || x.length === 4) x = x.split('').map((c) => c + c).join('');
  return hueRed(parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16));
};
/** The red things in one line of CSS or TypeScript (comments are removed by the caller). */
export function redIn(line: string): string[] {
  const out: string[] = [];
  const t = line.match(TOKEN); if (t) out.push(t[0]);
  for (const m of line.matchAll(HEX)) if (hexRed(m[0])) out.push(m[0]);
  for (const m of line.matchAll(RGB)) if (hueRed(+m[1]!, +m[2]!, +m[3]!)) out.push(m[0]);
  for (const m of line.matchAll(HSL)) { const h = ((+m[1]! % 360) + 360) % 360, s = +m[2]! / 100, l = +m[3]! / 100; if (s >= 0.35 && l > 0.1 && l < 0.9 && (h <= 20 || h >= 340)) out.push(m[0]); }
  return out;
}
const stripCss = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
const stripTs = (t: string): string => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/([;{}),])\s*\/\/[^\n'"`]*$/gm, '$1');

/** Findings of a stylesheet: [selector, declaration, what]. Only rules whose selector is in scope. */
export function cssFindings(css: string, scope: RegExp = SELECTOR_SCOPE): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const m of stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim().replace(/\s+/g, ' ');
    if (!scope.test(selector)) continue;
    for (const decl of m[2]!.split(';')) for (const what of redIn(decl)) out.push([selector, decl.trim().replace(/\s+/g, ' '), what]);
  }
  return out;
}
export function tsFindings(ts: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of stripTs(ts).split('\n')) for (const what of redIn(line)) out.push([line.trim().slice(0, 140), what]);
  return out;
}

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const listed = (rel: string, line: string): Allowed | undefined => ALLOW.find((a) => a.file === rel && line.includes(a.pattern));
const used = new Set<Allowed>(); const found: string[] = [];
for (const [sel, decl, what] of cssFindings(css)) { const a = listed('styles.css', `${sel} { ${decl} }`); if (a) used.add(a); else found.push(`styles.css: ${sel} { ${decl} }  [${what}]`); }
for (const f of TS_SCOPE) {
  const rel = `src/${f}`; assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} exists (the scan's scope names real files)`);
  for (const [line, what] of tsFindings(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) { const a = listed(rel, line); if (a) used.add(a); else found.push(`${rel}: ${line}  [${what}]`); }
}

test('the music tabs\' styles and code have no red: no error colour token, no named red, no red literal (a legitimate use goes in the allow-list with its reason)', () => {
  const rules = [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => SELECTOR_SCOPE.test(m[1]!)).length;
  assert.ok(rules > 60, `non-vacuity: the scan looked at ${rules} rules of the music-tab components`);
  assert.ok(css.length > 50000, 'non-vacuity: styles.css was read');
  assert.equal(found.join('\n'), '');
});
test('the allow-list is honest: every entry still matches a finding (a stale entry is removed), and every entry says why', () => {
  assert.deepEqual(ALLOW.filter((a) => !used.has(a)).map((a) => `${a.file}: ${a.pattern}`), [], 'entries that match nothing');
  for (const a of ALLOW) assert.ok(a.reason.length > 25 && /not (?:an? )?(?:error|text|dialog|composer)|highlight|never/i.test(a.reason), `${a.file}: the reason says why it is not an error colour`);
});
test('CONTROL: the scan can fail (each kind of red is found in a synthetic stylesheet and file; the greys, the accent and the muted colours are not)', () => {
  const bad = `.forge-chat-msg.is-refused { color: var(--text-error); }\n.forge-composer-error { color: red; }\n.forge-chat-bang { border: 1px solid #d33; }\n.forge-chat-x { background: #ff000020; }\n.forge-prompt-box-state { color: rgb(220, 38, 38); }\n.forge-chat-y { color: hsl(0, 70%, 50%); }\n.forge-chat-z { border-color: var(--background-modifier-error); }\n.forge-tp-btn { color: crimson; }`;
  assert.equal(cssFindings(bad).length, 8, JSON.stringify(cssFindings(bad)));
  const fine = `.forge-chat-msg.is-refused { color: var(--text-normal); }\n.forge-chat-bang { border: 1px solid var(--text-muted); color: #5c5c5c; }\n.forge-chat-a { background: #f0f0f0; color: #222; }\n.forge-chat-b { color: var(--interactive-accent); border-color: hsl(250, 60%, 60%); }\n.forge-chat-c { color: var(--text-warning, #c80); }`;
  assert.deepEqual(cssFindings(fine), []);
  assert.equal(cssFindings('.forge-output-error { color: var(--text-error); }').length, 0, 'a rule outside the music tabs is out of scope');
  assert.equal(cssFindings('@container (max-width: 420px) {\n .forge-chat-x { color: #f00; }\n}').length, 1, 'a rule inside an @container block is found');
  assert.equal(tsFindings("el.style.color = 'var(--text-error)';\nconst c = '#fb464c';\n// color: red in a comment\nconst ok = 'var(--text-muted)';").length, 2);
});
test('the neutral "!" glyph is muted, and the tokens the refusal lines use are the text tokens (the rule text itself)', () => {
  const rule = (sel: string): string => { const m = stripCss(css).match(new RegExp(`${sel.replace(/[.\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`)); assert.ok(m, `rule ${sel}`); return m![1]!; };
  assert.match(rule('.forge-chat-bang'), /color:\s*var\(--text-muted\)/);
  assert.match(rule('.forge-chat-msg.is-rejected, .forge-chat-msg.is-refused, .forge-chat-msg.is-failed'), /color:\s*var\(--text-normal\)/);
  assert.match(rule('.forge-composer-error'), /color:\s*var\(--text-muted\)/);
});
