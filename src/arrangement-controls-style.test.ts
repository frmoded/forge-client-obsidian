// 2026-10-30-1040 ("when I mute both, both appear as solo"). The data was never wrong: the real controls, the real note round trip and the real engine all say what the driver pressed (arrangement-controls-walk.test.ts, and
// scripts/dev/measure-arrangement-controls.ts in real Chrome). What was wrong is that the buttons carried NO pressed style at all - the plugin had no rule for `.forge-arr-mute` / `.forge-arr-solo` and Obsidian does not style
// `aria-pressed` - so in real Chrome a pressed button looked exactly like an unpressed one, and Mute looked exactly like Solo: the person could not see which kit was muted or solo. This pins the PROPERTY (a pressed
// Mute and a pressed Solo are drawn, and drawn differently from each other and from the unpressed buttons), reading the class names from the DOM module, not from a copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const dir = import.meta.dirname;
const css = fs.readFileSync(path.join(dir, '../styles.css'), 'utf8');
const dom = fs.readFileSync(path.join(dir, 'arrangement-controls-dom.ts'), 'utf8');
/** Every declaration block whose selector LIST holds `selector`, concatenated. */
const rule = (selector: string): string => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').some((x) => x.trim() === selector)).map((m) => m[2]).join('\n');
const declared = (block: string, prop: string): string | null => new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`).exec(block)?.[1].trim() ?? null;

test('the classes the stylesheet names are the classes the controls DOM builds (a rename cannot leave the style behind)', () => {
  for (const cls of ['forge-arr-mute', 'forge-arr-solo']) assert.ok(dom.includes(`'${cls}'`), `${cls} is a class of arrangement-controls-dom.ts`);
  assert.ok(/setAttribute\('aria-pressed'/.test(dom), 'the state is aria-pressed');
});

test('both buttons are drawn as buttons, a PRESSED Mute is drawn, a PRESSED Solo is drawn, and the two are drawn differently from each other and from an unpressed button', () => {
  const base = { mute: rule('.forge-arr-mute'), solo: rule('.forge-arr-solo') };
  for (const [name, block] of Object.entries(base)) {
    assert.match(block, /border:\s*1px solid/, `${name}: a border`);
    assert.match(block, /cursor:\s*pointer/, `${name}: a pointer`);
    assert.ok(declared(block, 'background') !== null, `${name}: an unpressed background`);
  }
  const pressed = { mute: rule('.forge-arr-mute[aria-pressed="true"]'), solo: rule('.forge-arr-solo[aria-pressed="true"]') };
  for (const [name, block] of Object.entries(pressed)) {
    assert.ok(declared(block, 'background') !== null, `${name}: a pressed background`);
    assert.notEqual(declared(block, 'background'), declared(base[name as 'mute'], 'background'), `${name}: pressed is not drawn like unpressed`);
    assert.ok(declared(block, 'color') !== null, `${name}: a pressed text colour (readable on the fill)`);
  }
  assert.notEqual(declared(pressed.mute, 'background'), declared(pressed.solo, 'background'), 'a muted kit and a solo kit are drawn in different colours');
});

test('the row lays out kit name, Mute, Solo, slider and value on one line, and the rows stack', () => {
  assert.match(rule('.forge-arr-controls'), /flex-direction:\s*column/);
  assert.match(rule('.forge-arr-control'), /display:\s*flex/);
  assert.match(rule('.forge-arr-control'), /align-items:\s*center/);
});
