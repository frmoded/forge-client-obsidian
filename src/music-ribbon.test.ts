// 2026-11-16-0901 - the four music ribbon buttons (New phrase, New arrangement, New composition, New bar) with icons of our own, and the "New phrase" command that never refuses. Pure cores with the plugin's API injected, plus pins on the wiring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { ICON_ARRANGEMENT, ICON_BAR, ICON_COMPOSITION, ICON_PHRASE, MUSIC_ICONS, MUSIC_RIBBON, iconIssues, registerMusicIcons, registerMusicRibbon } from './music-ribbon-core.ts';
import { NEW_COMPOSITION_COMMAND_ID } from './composition-flow-core.ts';
import { NEW_ARRANGEMENT_COMMAND_ID } from './kit-arrangement-flow-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f: string): string => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// ---- the icons
test('the four icons: the ids, an SVG content each that is clean (only currentColor and none, no wrapper, no image or link or script, every coordinate inside the 100 x 100 box), all different, original drawings', () => {
  assert.deepEqual(MUSIC_ICONS.map((i) => i.id), [ICON_PHRASE, ICON_ARRANGEMENT, ICON_COMPOSITION, ICON_BAR]);
  assert.deepEqual([ICON_PHRASE, ICON_ARRANGEMENT, ICON_COMPOSITION, ICON_BAR], ['forge-new-phrase', 'forge-new-arrangement', 'forge-new-composition', 'forge-new-bar']);
  for (const i of MUSIC_ICONS) { assert.deepEqual(iconIssues(i.svg), [], i.id); assert.match(i.svg, /currentColor/, `${i.id} follows the theme`); assert.ok(i.svg.length > 100 && i.what.length > 5, i.id); }
  assert.equal(new Set(MUSIC_ICONS.map((i) => i.svg)).size, 4, 'four different drawings');
});
test('the icon validator can fail: a wrapper, a fixed colour (name, hex, rgb), an image, a link, a script, a coordinate outside the box, a shape that runs out of it, an empty string', () => {
  const ok = '<line x1="8" y1="70" x2="92" y2="70" stroke="currentColor" fill="none"/>';
  assert.deepEqual(iconIssues(ok), []);
  for (const [bad, why] of [['<svg viewBox="0 0 100 100">' + ok + '</svg>', 'wrapper'], ['<circle cx="50" cy="50" r="9" fill="red"/>', 'a colour name'], ['<circle cx="50" cy="50" r="9" fill="#ff0000"/>', 'hex'], ['<circle cx="50" cy="50" r="9" stroke="rgb(1,2,3)"/>', 'rgb'],
    ['<image href="x.png"/>', 'an image'], ['<a href="x"><circle cx="5" cy="5" r="2"/></a>', 'a link'], ['<script>1</script>', 'a script'], ['<circle cx="120" cy="50" r="9"/>', 'outside the box'], ['<rect x="60" y="10" width="60" height="10"/>', 'runs out of the box'], ['', 'empty']] as const)
    assert.ok(iconIssues(bad).length > 0, why);
});
test('registerMusicIcons: each id is registered ONCE (a second call while they are registered adds nothing), the dispose takes them away with removeIcon and a later call registers them again; no removeIcon (an older Obsidian) is safe', () => {
  const added: string[] = [], removed: string[] = [];
  const api = { addIcon: (id: string, svg: string) => { assert.ok(svg.length > 0); added.push(id); }, removeIcon: (id: string) => { removed.push(id); } };
  const d1 = registerMusicIcons(api); assert.deepEqual(added, MUSIC_ICONS.map((i) => i.id));
  const d2 = registerMusicIcons(api); assert.equal(added.length, 4, 'registered once'); d2(); assert.equal(removed.length, 0, 'the second call owns nothing');
  d1(); assert.deepEqual(removed, added, 'every icon removed on unload');
  registerMusicIcons(api)(); assert.equal(added.length, 8, 'after an unload they register afresh'); assert.equal(removed.length, 8);
  const d3 = registerMusicIcons({ addIcon: () => {} }); assert.doesNotThrow(() => d3());
  const d4 = registerMusicIcons({ addIcon: () => {}, removeIcon: () => { throw new Error('boom'); } }); const saved = console.error; console.error = () => {}; try { assert.doesNotThrow(() => d4()); } finally { console.error = saved; }
});

// ---- the ribbon
test('the ribbon: four buttons in order New phrase, New arrangement, New composition, New bar, each with its own icon and the plain word as its tooltip; a click runs `<plugin id>:<command id>`; a command that is not offered says why in a notice', () => {
  const items: Array<{ icon: string; title: string; click: () => void }> = []; const ran: string[] = []; const said: string[] = []; let offered = true;
  registerMusicRibbon({ pluginId: 'forge', addRibbonIcon: (icon, title, click) => { items.push({ icon, title, click }); }, runCommand: (id) => { ran.push(id); return offered; }, notify: (m) => { said.push(m); } });
  assert.deepEqual(items.map((i) => [i.title, i.icon]), [['New phrase', ICON_PHRASE], ['New arrangement', ICON_ARRANGEMENT], ['New composition', ICON_COMPOSITION], ['New bar', ICON_BAR]]);
  items.forEach((i) => i.click()); assert.deepEqual(ran, ['forge:new-phrase', 'forge:new-arrangement', 'forge:new-composition', 'forge:new-bar']); assert.deepEqual(said, []);
  offered = false; items[1].click(); items[2].click(); assert.equal(said.length, 2); assert.deepEqual(said, ['New arrangement is not available right now.', 'New composition is not available right now.'], '2026-11-19-0960: no prerequisite is told: an empty note needs nothing first');
});
test('"the same as the palette entry": every ribbon command id is the id of a command the plugin registers, with the same name as the tooltip, and the command carries the same icon', () => {
  const sf = src('score-first.ts'), ka = src('kits-arrangements.ts'), co = src('compositions.ts');
  assert.equal(NEW_ARRANGEMENT_COMMAND_ID, MUSIC_RIBBON[1].commandId); assert.equal(NEW_COMPOSITION_COMMAND_ID, MUSIC_RIBBON[2].commandId);
  assert.match(sf, /export const NEW_PHRASE_ANYWHERE_COMMAND_ID = 'new-phrase';\nexport const NEW_PHRASE_ANYWHERE_COMMAND_NAME = 'New phrase';/); assert.equal(MUSIC_RIBBON[0].commandId, 'new-phrase');
  assert.match(sf, /export const NEW_BAR_COMMAND_ID = 'new-bar';/); assert.equal(MUSIC_RIBBON[3].commandId, 'new-bar');
  for (const [file, name, icon] of [[sf, 'NEW_BAR_COMMAND_NAME', 'ICON_BAR'], [sf, 'NEW_PHRASE_ANYWHERE_COMMAND_NAME', 'ICON_PHRASE'], [sf, 'NEW_PHRASE_COMMAND_NAME', 'ICON_PHRASE'], [ka, 'NEW_ARRANGEMENT_COMMAND_NAME', 'ICON_ARRANGEMENT'], [co, 'NEW_COMPOSITION_COMMAND_NAME', 'ICON_COMPOSITION']] as const)
    assert.match(file, new RegExp(`name: ${name},\\s*icon: ${icon},`), `${name} carries ${icon}`);
  const names = [MUSIC_RIBBON.map((i) => i.title).join()]; assert.equal(names[0], 'New phrase,New arrangement,New composition,New bar');
  assert.match(fs.readFileSync(path.join(ROOT, 'src/kit-arrangement-flow-core.ts'), 'utf8'), /NEW_ARRANGEMENT_COMMAND_NAME = 'New arrangement'/); assert.match(fs.readFileSync(path.join(ROOT, 'src/composition-flow-core.ts'), 'utf8'), /NEW_COMPOSITION_COMMAND_NAME = 'New composition'/);
});
test('WIRING (P3): the icons, the ribbon and the "New phrase" command are registered ONLY inside the score-first gate (a vault whose music tabs are off has none of it); the old plain "plus-circle" button is gone; the icons are taken away when the plugin unloads', () => {
  const sf = src('score-first.ts'); const gate = sf.indexOf('if (!newBarAvailable(scoreFirst)) return;'); assert.ok(gate > 0);
  const after = sf.slice(gate, sf.indexOf('M5: the phrase tab', gate));
  assert.match(after, /plugin\.register\(registerMusicIcons\(\{ addIcon, removeIcon \}\)\)/); assert.match(after, /registerMusicRibbon\(\{/); assert.match(after, /id: NEW_PHRASE_ANYWHERE_COMMAND_ID/); assert.match(after, /if \(!newBarAvailable\(scoreFirst\)\) return false;/);
  assert.doesNotMatch(sf, /addRibbonIcon\('plus-circle'/); assert.doesNotMatch(sf.slice(0, gate), /registerMusicIcons\(|registerMusicRibbon\(/, 'no call before the gate (the import line is not a call)');
  assert.match(after, /executeCommandById\(fullId\)/);
});

// ---- "New phrase" from any note
test('"New phrase" (2026-11-19-0960) makes an EMPTY phrase from any note: the command is the empty flow, it never looks at the note you are on, never asks for a bar and never makes one first (the bar-first flow, pickSourceBar and createPhraseAnywhere, is gone)', () => {
  const sf = src('score-first.ts');
  assert.match(sf, /const createEmptyPhraseNote = \(\): Promise<unknown> => createNewEmptyPhrase<TFile>\(\{/);
  assert.match(sf, /if \(!checking\) void createEmptyPhraseNote\(\);/);
  assert.doesNotMatch(sf, /createPhraseAnywhere|pickSourceBar|createBar: \(\) => createBar\(\)/);
});
test('"New phrase from this bar" is untouched: still asks for a bar (its availability and its message), and the flow behind it is createNewPhrase', () => {
  const sf = src('score-first.ts');
  assert.match(sf, /if \(!newPhraseAvailable\(\{ scoreFirst, activePath: activePath\(\) \}\)\) return false;\s*if \(!checking\) void createPhrase\(\);/);
  assert.match(sf, /const createPhrase = \(\): Promise<unknown> => phraseFrom\(activePath\);/);
  assert.match(fs.readFileSync(path.join(ROOT, 'src/phrase-core.ts'), 'utf8'), /New phrase: open a bar from \$\{BAR_FOLDER\}\/ first/);
});
