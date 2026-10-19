// Drain 2026-10-19-1500 §1/§2 — the Rhythm Box no longer has Clear, Random, Export JSON or the "…" menu that held them, and ONE "Open note" per
// embed (the host toolbar's, outside the iframe, which still works when the widget errors). Reset (embed) and Restore to last commit (tab) stay;
// the meter / add-row / remove-row confirm bar stays (it is not Random/Clear plumbing). These tests are the "gone" side; the "still there" side
// is non-vacuity so the removal cannot quietly take more than it should.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { loadWidget, ROCK, skip, widgetHtml, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';

const load = (mode?: string) => ({ type: 'forge-rhythm-load', data: ROCK, noteName: 'rhythm_pattern_test', ...(mode ? { mode } : {}) });
function pureCore(): any {
  const mod: { exports: any } = { exports: {} };
  new Function('module', widgetScript)(mod);
  return mod.exports;
}
async function mounted(mode?: 'playground'): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(mode));
  return h;
}

test('the Clear, Random and Export JSON buttons, their "…" menu, their message line and the export fallback are gone from the page', { skip }, async () => {
  for (const mode of [undefined, 'playground'] as const) {
    const h = await mounted(mode);
    for (const id of ['bRandom', 'bClear', 'bExport', 'moreMenu', 'exportMsg', 'exportFallback']) assert.ok(h.el(id) === null, `${id} (${mode ?? 'edit'}) is still on the page`);
    assert.ok(h.doc.querySelector('details') === null, 'no disclosure menu at all');
    const labels = [...h.doc.querySelectorAll('button')].map((b: any) => (b.textContent + ' ' + (b.getAttribute('title') ?? '') + ' ' + (b.getAttribute('aria-label') ?? '')).toLowerCase());
    for (const word of ['random', 'clear', 'export']) assert.equal(labels.some((l) => l.includes(word)), false, `no control mentions "${word}" (${mode ?? 'edit'})`);
  }
});

test('the widget has no "Open note" of its own any more (the host toolbar has the one), and never posts forge-rhythm-open-note', { skip }, async () => {
  const h = await mounted('playground');
  assert.ok(h.el('bOpenNote') === null, 'bOpenNote is still on the page');
  assert.deepEqual([...h.doc.querySelectorAll('button')].filter((b: any) => /open note/i.test(b.textContent)).length, 0);
  assert.doesNotMatch(widgetScript, /forge-rhythm-open-note/);
});

test('the dead code went with the buttons: no Random weights, no randomizer, no widget-side JSON serializer, and no CSS for the menu', { skip }, () => {
  const w = pureCore();
  for (const gone of ['randomizePattern', 'channelStepWeight', 'rhythmDataJson']) assert.equal(gone in w, false, `${gone} is not exported`);
  assert.doesNotMatch(widgetScript, /randomizePattern|channelStepWeight|rhythmDataJson|exportMsg|exportFallback|navigator\.clipboard/);
  assert.doesNotMatch(widgetHtml, /\.more-menu|\.export-msg|\.export-fallback/);
  // non-vacuity: what the buttons were built on and what must stay is still there
  for (const kept of ['buildRhythmData', 'emptyPattern', 'mirrorPattern', 'rotatePattern', 'moveRing', 'parseRhythmLoad']) assert.equal(typeof w[kept], 'function', kept);
});

test('NON-VACUITY: Reset (playground), Reload from note, Mirror, the rotate buttons and the Add instrument menu are all still on the page', { skip }, async () => {
  const h = await mounted('playground');
  for (const id of ['bReset', 'bReload', 'bMirrorGrid', 'bRotLeft', 'bRotRight', 'addInstrument', 'bPlay']) assert.ok(h.el(id), id);
});

test('the meter-change confirm bar survives: changing the time signature in a note still asks first, and Cancel keeps the pattern', { skip }, async () => {
  const h = await mounted();
  const sel = h.el('timeSig');
  assert.ok(sel, 'the meter menu is there');
  sel.value = '3/4';
  sel.dispatchEvent(new h.win.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.el('confirmBar').hidden, false, 'the question is asked');
  h.el('confirmCancel').click();
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(h.posted.filter((m) => m && m.type === 'forge-rhythm-save').length, 0, 'nothing was saved');
});

test('removing a row that has hits still asks first (the other whole-pattern confirm)', { skip }, async () => {
  const h = await mounted();
  h.doc.querySelector('[data-remove="snare"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.el('confirmBar').hidden, false);
});

test('the only question the confirm bar can still ask is about the meter or a row: no "Randomize" / "Clear the pattern" text remains', { skip }, () => {
  assert.doesNotMatch(widgetScript, /Randomize the pattern|Clear the pattern|kind === "random"|kind === "clear"|kind: "random"|kind: "clear"/);
});

test('rhythm_box.md no longer promises the removed buttons', () => {
  const candidates = [path.resolve(import.meta.dirname, '..', '..', 'music-theory', 'music_instruments', 'rhythm_box.md'), path.resolve(import.meta.dirname, '..', 'assets', 'vaults', 'music-theory', 'music_instruments', 'rhythm_box.md')];
  const md = process.env.RHYTHM_BOX_DOC_FILE ? fs.readFileSync(process.env.RHYTHM_BOX_DOC_FILE, 'utf8') : fs.readFileSync(candidates.find((f) => fs.existsSync(f))!, 'utf8');
  assert.doesNotMatch(md, /Export JSON|\*\*Random\*\*|\*\*Clear\*\*|⋯/);
});
