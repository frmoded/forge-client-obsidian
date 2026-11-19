// 2026-11-16-1102 (Part A) - "I do not see the four music ribbon buttons": what the plugin now SAYS about them. The trace line at registration (`[forge-music-ribbon] registered 4 buttons`, or the reason it did not), the status
// row in Settings -> Forge -> Music tabs (shown / hidden because ...), the probe of Obsidian's left ribbon behind it (read on the real internals Obsidian 1.15's app.js shows: `leftRibbon.items` with `id`, `hidden`, `buttonEl`), the "+ New"
// menu in the music tabs' header that does not depend on the ribbon, and the pins that hold the wiring. The gate itself (`newBarAvailable`) is what it was.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  MUSIC_RIBBON, RIBBON_TRACE, ribbonNotRegisteredLine, ribbonProbe, ribbonRegisteredLine, ribbonStatus, registerMusicRibbon, NOT_MUSIC_VAULT_REASON, type RibbonProbe,
} from './music-ribbon-core.ts';
import { newBarAvailable } from './score-first-core.ts';
import {
  NEW_MENU_ICON, NEW_MENU_TITLE, NEW_MENU_VIEW_TYPES, createNewMenuSync, newMenuItems, runNewMenuItem,
} from './new-menu-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { RHYTHM_EDIT_VIEW_TYPE } from './rhythm-edit-core.ts';
import { RHYTHM_SCORE_VIEW_TYPE } from './rhythm-mode-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';

const SRC = import.meta.dirname;

test('THE GATE: the buttons are made only in a music vault (the vault\'s forge.toml turns the music tabs on); in any other vault there are none', () => {
  assert.equal(newBarAvailable(true), true); assert.equal(newBarAvailable(false), false);
});

test('THE TRACE: registering the four buttons says so in one line (the number); not registering says why', () => {
  assert.equal(RIBBON_TRACE, '[forge-music-ribbon]');
  assert.equal(ribbonRegisteredLine(4), '[forge-music-ribbon] registered 4 buttons');
  assert.equal(ribbonNotRegisteredLine(NOT_MUSIC_VAULT_REASON), `[forge-music-ribbon] not registered: ${NOT_MUSIC_VAULT_REASON}`);
  assert.match(NOT_MUSIC_VAULT_REASON, /not a music vault/);
  const lines: string[] = []; const made: string[] = [];
  const n = registerMusicRibbon({ pluginId: 'forge-actions', addRibbonIcon: (_i, t) => { made.push(t); }, runCommand: () => true, notify: () => {}, trace: (l) => { lines.push(l); } });
  assert.equal(n, 4); assert.deepEqual(made, MUSIC_RIBBON.map((m) => m.title)); assert.deepEqual(lines, ['[forge-music-ribbon] registered 4 buttons']);
  const quiet = registerMusicRibbon({ pluginId: 'p', addRibbonIcon: () => {}, runCommand: () => true, notify: () => {} });
  assert.equal(quiet, 4, 'a caller without a trace still registers');
  const broke: string[] = [];
  const k = registerMusicRibbon({ pluginId: 'p', addRibbonIcon: (_i, t) => { if (t === 'New composition') throw new Error('boom'); }, runCommand: () => true, notify: () => {}, trace: (l) => { broke.push(l); } });
  assert.equal(k, 3); assert.match(broke.join('\n'), /registered 3 buttons/); assert.match(broke.join('\n'), /New composition.*boom/);
});

const P = (over: Partial<RibbonProbe> = {}): RibbonProbe => ({ id: 'forge-actions:New phrase', title: 'New phrase', present: true, hidden: false, shown: true, ...over });
const four = (over: Array<Partial<RibbonProbe>> = [{}, {}, {}, {}]): RibbonProbe[] => MUSIC_RIBBON.map((m, i) => P({ id: `forge-actions:${m.title}`, title: m.title, ...(over[i] ?? {}) }));

test('THE STATUS ROW, every state: shown; not a music vault; not known yet; not registered; turned off in Manage; the ribbon too short (and how many icons fit); could not be measured', () => {
  const s = (i: Parameters<typeof ribbonStatus>[0]) => ribbonStatus(i);
  assert.deepEqual(s({ musicVault: true, registered: true, probes: four() }), { state: 'shown', text: 'Music ribbon buttons: shown (4 of 4 are in the left ribbon).' });
  assert.equal(s({ musicVault: false, registered: false, probes: [] }).state, 'not-music-vault');
  assert.match(s({ musicVault: false, registered: false, probes: [] }).text, /^Music ribbon buttons: hidden because this vault is not a music vault \(its forge\.toml does not turn the music tabs on\)\.$/);
  assert.equal(s({ musicVault: null, registered: false, probes: [] }).state, 'loading');
  assert.match(s({ musicVault: null, registered: false, probes: [] }).text, /not known yet/);
  assert.equal(s({ musicVault: true, registered: false, probes: [] }).state, 'not-registered');
  assert.match(s({ musicVault: true, registered: false, probes: [] }).text, /hidden because they were not made .*\[forge-music-ribbon\]/);
  const off = s({ musicVault: true, registered: true, probes: four([{ hidden: true, shown: false }, { hidden: true, shown: false }, { hidden: true, shown: false }, { hidden: true, shown: false }]) });
  assert.equal(off.state, 'turned-off'); assert.match(off.text, /hidden because you turned them off in the ribbon's Manage list \(right-click the ribbon, Manage\)\.$/);
  const some = s({ musicVault: true, registered: true, probes: four([{ hidden: true, shown: false }, {}, {}, {}]) });
  assert.equal(some.state, 'turned-off'); assert.match(some.text, /1 of 4 .*turned off.*New phrase/);
  const clipped = s({ musicVault: true, registered: true, probes: four([{ shown: true }, { shown: true }, { shown: false }, { shown: false }]), fits: { fit: 9, total: 13 } });
  assert.equal(clipped.state, 'too-short'); assert.match(clipped.text, /^Music ribbon buttons: hidden because the ribbon is too short for them: only 9 of 13 icons fit\. Make the window taller, or turn off icons you do not use \(right-click the ribbon, Manage\)\.$/);
  const unknown = s({ musicVault: true, registered: true, probes: four([{ shown: null }, { shown: null }, { shown: null }, { shown: null }]) });
  assert.equal(unknown.state, 'unmeasured'); assert.match(unknown.text, /could not measure/);
  assert.equal(s({ musicVault: true, registered: true, probes: [] }).state, 'not-registered', 'registered but Obsidian lists none of them: said as not made');
});

test('THE PROBE reads the left ribbon the way Obsidian 1.15 keeps it (items with id, hidden and buttonEl; the box of the ribbon): a hidden one, a clipped one (below the box), a shown one, a missing one; it never throws', () => {
  const box = { top: 0, bottom: 300, height: 300, width: 40, left: 0, right: 40 };
  const btn = (top: number, h = 32) => ({ getBoundingClientRect: () => ({ top, bottom: top + h, height: h, width: 32, left: 4, right: 36 }) });
  const items = [
    { id: 'switcher:Open quick switcher', hidden: false, buttonEl: btn(10) },
    { id: 'forge-actions:New phrase', hidden: false, buttonEl: btn(250) },
    { id: 'forge-actions:New arrangement', hidden: false, buttonEl: btn(290) },
    { id: 'forge-actions:New composition', hidden: true, buttonEl: btn(0, 0) },
  ];
  const out = ribbonProbe({ items, containerEl: { getBoundingClientRect: () => box } }, 'forge-actions', MUSIC_RIBBON.map((m) => m.title));
  assert.deepEqual(out.probes.map((p) => [p.title, p.present, p.hidden, p.shown]), [['New phrase', true, false, true], ['New arrangement', true, false, false], ['New composition', true, true, false], ['New bar', false, false, null]]);
  assert.deepEqual(out.fits, { fit: 2, total: 3 }, 'icons that are shown and inside the box, of those not turned off: the switcher and New phrase fit; New arrangement is below');
  assert.deepEqual(ribbonProbe(null, 'p', ['a']).probes, [{ id: 'p:a', title: 'a', present: false, hidden: false, shown: null }]);
  assert.doesNotThrow(() => ribbonProbe({ items: [{ id: 'p:a', hidden: false, buttonEl: { getBoundingClientRect: () => { throw new Error('x'); } } }], containerEl: {} }, 'p', ['a']));
});

// ---- the "+ New" menu in the music tabs' header: it does not need the ribbon -----------------------------------------------------------------------------------------------------------
test('THE "+ NEW" MENU: the same four actions with the same icons, titles, commands and notices as the ribbon, in the same order', () => {
  assert.deepEqual(newMenuItems().map((m) => [m.title, m.icon, m.commandId]), MUSIC_RIBBON.map((m) => [m.title, m.icon, m.commandId]));
  assert.equal(NEW_MENU_TITLE, 'New'); assert.equal(NEW_MENU_ICON, 'plus');
  const ran: string[] = []; const said: string[] = [];
  runNewMenuItem(newMenuItems()[0], { pluginId: 'forge-actions', runCommand: (id) => { ran.push(id); return true; }, notify: (m) => said.push(m) });
  assert.deepEqual(ran, ['forge-actions:new-phrase']); assert.deepEqual(said, []);
  runNewMenuItem(newMenuItems()[1], { pluginId: 'forge-actions', runCommand: () => false, notify: (m) => said.push(m) });
  assert.equal(said[0], 'New arrangement is not available right now.', '2026-11-19-0960 (deliberate): a new arrangement needs no kit and no phrase any more (it is created EMPTY), so the notice no longer tells a prerequisite; it is the ribbon\'s own sentence');
});
test('THE MENU\'S TABS: the phrase, the bar (Beat Box and Score), the arrangement and the composition tab, each once', () => {
  assert.deepEqual([...NEW_MENU_VIEW_TYPES].sort(), [PHRASE_VIEW_TYPE, RHYTHM_EDIT_VIEW_TYPE, RHYTHM_SCORE_VIEW_TYPE, ARRANGEMENT_VIEW_TYPE, COMPOSITION_VIEW_TYPE].sort());
  assert.equal(new Set(NEW_MENU_VIEW_TYPES).size, NEW_MENU_VIEW_TYPES.length);
});
test('THE HEADER SYNC: every tab gets the button ONCE (a view Obsidian reuses is not given a second), only in a music vault, and a vault that stops being one adds none to new tabs', () => {
  const made: string[] = []; const shown: string[] = []; let music = true;
  const view = (name: string) => ({ name, addAction: (icon: string, title: string, cb: (e: unknown) => void) => { made.push(`${name}:${icon}:${title}`); (view as any)[name] = cb; return {} as HTMLElement; } });
  const sync = createNewMenuSync({ isMusicVault: () => music, show: (v: any) => { shown.push(v.name); } });
  const a = view('a'), b = view('b');
  assert.equal(sync.sync([a, b]), 2); assert.equal(sync.sync([a, b]), 0); assert.deepEqual(made, ['a:plus:New', 'b:plus:New']);
  (view as any).a({}); assert.deepEqual(shown, ['a'], 'the button opens the menu for ITS tab');
  music = false; assert.equal(sync.sync([view('c')]), 0, 'not a music vault: nothing is added');
  music = true; assert.equal(sync.sync([a, view('c')]), 1);
  assert.equal(sync.sync([{ addAction: () => { throw new Error('closed'); } } as any]), 0, 'a tab that cannot take it is skipped, not fatal');
  const errs: unknown[] = []; const was = console.error; console.error = (...a: unknown[]) => { errs.push(a); };
  try { assert.equal(sync.sync([{} as any, { addAction: undefined } as any]), 0, 'a tab with no header actions at all is skipped quietly'); } finally { console.error = was; }
  assert.deepEqual(errs, [], 'and says nothing: it is not an error');
});

// ---- the wiring --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const code = (f: string): string => fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
test('MECHANISM PIN 2026-11-16-1102 (if the design moves this SHOULD go red: reassess): score-first.ts traces the registration (the line, and the reason when the gate says no), installs the status for Settings and the header menu on layout-change and active-leaf-change, in a music vault only; settings.ts shows the row', () => {
  const sf = code('score-first.ts');
  assert.match(sf, /ribbonNotRegisteredLine\(NOT_MUSIC_VAULT_REASON\)/);
  assert.match(sf, /trace: \(line\) => \{ console\.info\(line\); \}/);
  assert.match(sf, /registerMusicRibbonStatus\(/);
  assert.match(sf, /createNewMenuSync<NewMenuView>\(/);
  assert.match(sf, /app\.workspace\.on\('layout-change', syncNewMenu\)/); assert.match(sf, /app\.workspace\.on\('active-leaf-change', syncNewMenu\)/);
  const st = code('settings.ts'); assert.match(st, /setName\('Music ribbon buttons'\)/); assert.match(st, /musicRibbonStatusText\(\)/);
});
