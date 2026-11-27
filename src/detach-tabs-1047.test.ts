// 2026-11-26-1047 (prompt stack, stage 5): DETACH on the real tabs of the real plugin: the command, the confirm modal, then the banner, the controls off, no composer, and no command left for a custom note.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { musicTabsWorld, realMusicPlugin, type MusicTabsWorld } from './test-support/music-tabs-world.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { newArrangementNote } from './arrangement-core.ts';
import { asCustom, isCustomNote, pythonTextOf, withLinks } from './phrase-notes-core.ts';
import { DEFAULT_UI_FLAGS } from './ui-flags-core.ts';
import type { RealPlugin } from './test-support/bundle-real-plugin.ts';

const PHRASE = 'phrases/phrase_001.md', ARR = 'arrangements/arr_001.md', COMMAND = 'detach-to-custom-python';
const EXTEND = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 5 } as PhraseParams;
let real: RealPlugin;
before(async () => { real = await realMusicPlugin(); });
after(() => { /* the bundle is per process */ });
/** The input strips of a tab are in the document only with `Show legacy controllers` on: the test turns it on to read that they are off. */
const withControls = (): void => { real.registerUiFlagsSource(() => ({ ...DEFAULT_UI_FLAGS, showLegacyControllers: true })); };

const msg = (v: any): string => v.contentEl.querySelector('.forge-description-message')?.textContent ?? '';
const barButtons = (v: any): number => v.contentEl.querySelectorAll('.forge-description-button').length;
const modalButton = (x: MusicTabsWorld, label: string): HTMLElement => [...x.modals.at(-1).contentEl.querySelectorAll('button')].find((b: any) => b.textContent === label) as HTMLElement;

test('1047 the command `Detach` on a phrase tab: it asks in a modal (Cancel writes nothing); Detach makes the note custom, and the tab shows the banner, every control off, no composer; the command is gone', async () => {
  const x = await musicTabsWorld(real);
  try {
    withControls();
    const command = x.plugin.commands.get(COMMAND)! as { name?: string; checkCallback: (checking: boolean) => boolean };
    assert.equal(command.name, 'Detach');
    assert.equal(x.plugin.commands.has('revert-custom-python'), false, 'the old command is gone');
    const view = x.viewOf(await x.restoreTab('forge-phrase', PHRASE));
    const start = x.store.get(PHRASE)!;
    assert.ok(x.field(view), 'a generated note has its composer');
    assert.equal(view.contentEl.querySelector('.forge-phrase-bars').disabled, false);
    assert.equal(command.checkCallback(true), true);
    command.checkCallback(false); await x.settle(60);
    assert.equal(x.modals.length, 1);
    assert.equal(x.modals[0].titleEl.textContent, 'Detach');
    assert.match(x.modals[0].contentEl.textContent, /This cannot be undone\./);
    modalButton(x, 'Cancel').click(); await x.settle(800);
    assert.equal(x.store.get(PHRASE), start); assert.deepEqual(x.writes, []);
    command.checkCallback(false); await x.settle(60);
    modalButton(x, 'Detach').click(); await x.settle(1500);
    const done = x.store.get(PHRASE)!;
    assert.equal(done, withLinks(asCustom(start), ['bar_007']));
    assert.deepEqual(x.writes, [PHRASE]);
    assert.equal(msg(view), 'Custom Python: the controls are off for this note.'); assert.equal(barButtons(view), 0);
    for (const sel of ['.forge-phrase-bars', '.forge-phrase-style']) assert.equal(view.contentEl.querySelector(sel).disabled, true, `${sel} is off`);
    assert.equal(x.field(view), null, 'no composer');
    assert.equal(command.checkCallback(true), false, 'a custom note cannot be detached again');
  } finally { real.registerUiFlagsSource(null); x.done(); }
});

test('1047 a hand-edited Python on an arrangement tab: the one line with `Detach` and `OK`; Detach keeps the Python as typed, and the tab has its controls off', async () => {
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] });
  const x = await musicTabsWorld(real, { [ARR]: arr });
  try {
    withControls();
    const view = x.viewOf(await x.restoreTab('forge-arrangement-view', ARR));
    await x.handEdit(ARR, (t) => t.replace('  return bars\n', '  bars = bars + phrase_002()\n  return bars\n'));
    const typed = x.store.get(ARR)!;
    assert.equal(isCustomNote(typed), false);
    assert.equal(msg(view), 'This Recipe/Python is generated. Edit the Description, or Detach.');
    const buttons = [...view.contentEl.querySelectorAll('.forge-description-button')] as HTMLElement[];
    assert.deepEqual(buttons.map((b) => b.textContent), ['Detach', 'OK']);
    buttons[0].click(); await x.settle(60);
    modalButton(x, 'Detach').click(); await x.settle(1500);
    const done = x.store.get(ARR)!;
    assert.equal(isCustomNote(done), true);
    assert.equal(pythonTextOf(done), pythonTextOf(typed));
    assert.match(done, /- "\[\[phrase_001\]\]"\n {2}- "\[\[phrase_002\]\]"/);
    assert.equal(msg(view), 'Custom Python: the controls are off for this note.');
    const controls = [...view.contentEl.querySelectorAll('.forge-arr-control input, .forge-arr-control button')] as Array<HTMLInputElement>;
    assert.ok(controls.length > 0, 'the arrangement tab has controls');
    assert.deepEqual(controls.filter((c) => !c.disabled), [], 'all off');
  } finally { real.registerUiFlagsSource(null); x.done(); }
});
