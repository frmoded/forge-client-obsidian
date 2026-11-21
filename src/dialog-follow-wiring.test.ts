// 2026-11-21-1011 - a note's chat history follows the note: the REAL plugin methods (the real bundle, a stand-in `obsidian`, in-memory settings), the lean edition's silence, and the pins on the wiring in main.ts. Written RED first.
//   (a) moveDialogHistory(file, oldPath)   the rename handler: the entry moves to the new path, carrying the file's own creation time
//   (b) dropDialogHistory(file)            the delete handler: the entry goes
//   (c) noteCtime(path)                    what the controller asks (a hook of registerScoreFirst) to tell a re-created note from the old one
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { append, fromOutcome, type DialogEntry } from './dialog-core.ts';
import { descriptionPortsFor } from './description-wiring.ts';

let real: RealPlugin; let lean: RealPlugin; let win: any;
before(async () => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  real = await bundleRealPlugin(process.cwd(), 'music');
  lean = await bundleRealPlugin(process.cwd(), 'lean');
});

const say = (text: string): DialogEntry[] => append([], fromOutcome({ type: 'you', text }), 1_700_000_000_000);
const tfile = (r: RealPlugin, p: string, ctime?: number): any => Object.assign(new r.TFile(), { path: p, extension: p.replace(/^.*\./, ''), basename: p.replace(/^.*\//, '').replace(/\.[^.]+$/, ''), ...(ctime === undefined ? {} : { stat: { ctime, mtime: ctime + 5, size: 10 } }) });
function pluginWith(r: RealPlugin, settings: Record<string, unknown>, files: any[] = []) {
  const t: any = Object.create(r.ForgePlugin.prototype); let saves = 0;
  t.settings = settings; t.saveDialogSoon = () => { saves++; };
  t.app = { vault: { getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null } };
  return { t, saves: () => saves };
}

test('(a) a rename: the plugin moves the history of the old path to the new one (with the file\'s own creation time), saves once, and leaves the other notes alone', () => {
  const settings: any = { dialogHistory: { 'phrases/phrase_016.md': say('Extend [[bar_007]].'), 'phrases/z.md': say('other') }, dialogCtime: { 'phrases/phrase_016.md': 111, 'phrases/z.md': 5 } };
  const { t, saves } = pluginWith(real, settings);
  t.moveDialogHistory(tfile(real, 'phrases/my groove.md', 222), 'phrases/phrase_016.md');
  assert.deepEqual(Object.keys(settings.dialogHistory).sort(), ['phrases/my groove.md', 'phrases/z.md']); assert.equal(settings.dialogHistory['phrases/my groove.md'][0].text, 'Extend [[bar_007]].');
  assert.deepEqual(settings.dialogCtime, { 'phrases/my groove.md': 222, 'phrases/z.md': 5 }); assert.equal(saves(), 1);
  t.moveDialogHistory(tfile(real, 'phrases/my groove.md', 222), 'phrases/phrase_016.md'); assert.equal(saves(), 1, 'a second event for the same move finds nothing and saves nothing');
});
test('(b) a delete: the plugin drops the history of the deleted note (and its time), saves once; a note with none saves nothing', () => {
  const settings: any = { dialogHistory: { 'arrangements/arr_002.md': say('yesterday'), 'arrangements/arr_003.md': say('keep') }, dialogCtime: { 'arrangements/arr_002.md': 1, 'arrangements/arr_003.md': 2 } };
  const { t, saves } = pluginWith(real, settings);
  t.dropDialogHistory(tfile(real, 'arrangements/arr_002.md')); assert.deepEqual(Object.keys(settings.dialogHistory), ['arrangements/arr_003.md']); assert.deepEqual(settings.dialogCtime, { 'arrangements/arr_003.md': 2 }); assert.equal(saves(), 1);
  t.dropDialogHistory(tfile(real, 'arrangements/arr_002.md')); t.dropDialogHistory(tfile(real, 'phrases/never.md')); assert.equal(saves(), 1);
});
test('(c) noteCtime(path): the creation time of the note at that path; undefined when there is no file, it is a folder, or the stat is unreadable (the history is then shown as before)', () => {
  const { t } = pluginWith(real, {}, [tfile(real, 'phrases/a.md', 1234), { path: 'phrases', children: [] }, tfile(real, 'phrases/nostat.md')]);
  assert.equal(t.noteCtime('phrases/a.md'), 1234); assert.equal(t.noteCtime('phrases/gone.md'), undefined); assert.equal(t.noteCtime('phrases'), undefined); assert.equal(t.noteCtime('phrases/nostat.md'), undefined);
});
test('P3: a vault with no history: a rename and a delete change nothing and save nothing (the settings object is the same string before and after)', () => {
  for (const settings of [{}, { dialogHistory: {} }, { dialogHistory: {}, dialogHeight: 112 }] as any[]) {
    const before = JSON.stringify(settings); const { t, saves } = pluginWith(real, settings);
    t.moveDialogHistory(tfile(real, 'phrases/b.md', 9), 'phrases/a.md'); t.dropDialogHistory(tfile(real, 'phrases/b.md')); assert.equal(saves(), 0); assert.equal(JSON.stringify(settings), before);
  }
});
test('lean: the same methods exist and do nothing (the history stays where it is, nothing is saved) and the creation time is not asked (the lean seam has none)', () => {
  const settings: any = { dialogHistory: { 'phrases/a.md': say('x') }, dialogCtime: { 'phrases/a.md': 1 } }; const keep = JSON.stringify(settings);
  const { t, saves } = pluginWith(lean, settings, [tfile(lean, 'phrases/a.md', 77)]);
  t.moveDialogHistory(tfile(lean, 'phrases/b.md', 9), 'phrases/a.md'); t.dropDialogHistory(tfile(lean, 'phrases/a.md'));
  assert.equal(JSON.stringify(settings), keep); assert.equal(saves(), 0); assert.equal(t.noteCtime('phrases/a.md'), undefined);
});
test('WIRING (source pins): main.ts calls the two methods from the vault\'s rename and delete handlers for a markdown note only, and hands the controller the creation time hook; descriptionPortsFor passes it on; the setting is plain data', () => {
  const main = fs.readFileSync(path.resolve(import.meta.dirname, 'main.ts'), 'utf8');
  assert.match(main, /this\.registerEvent\(this\.app\.vault\.on\('delete', \(f\) => \{[\s\S]*?if \(f instanceof TFile && f\.extension === 'md'\) \{[\s\S]*?this\.dropDialogHistory\(f\);/);
  assert.match(main, /this\.registerEvent\(this\.app\.vault\.on\('rename', \(f, oldPath\) => \{[\s\S]*?if \(f instanceof TFile && f\.extension === 'md'\) \{[\s\S]*?this\.moveDialogHistory\(f, oldPath\);/);
  assert.match(main, /dialogStore: settingsStore\(this\.settings, \(\) => \{ this\.saveDialogSoon\(\); \}\), noteCtime: \(p\) => this\.noteCtime\(p\) \}\);/);
  const env = { read: async () => '', process: async () => {}, basenamesIn: () => [], panes: () => [], setTimer: () => 0, clearTimer: () => {}, trace: () => {}, warn: () => {} }; const fn = (p: string) => (p === 'a.md' ? 5 : undefined);
  assert.equal(descriptionPortsFor(env, { noteCtime: fn }).noteCtime, fn); assert.equal(descriptionPortsFor(env, {}).noteCtime, undefined);
  const settings = fs.readFileSync(path.resolve(import.meta.dirname, 'settings.ts'), 'utf8'); assert.match(settings, /dialogCtime\?: Record<string, number>;/);
});
