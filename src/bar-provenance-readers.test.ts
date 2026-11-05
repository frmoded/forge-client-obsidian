// 2026-11-05-1182 (M17a) - every reader of a bar still reads a MIGRATED bar. The vault is the playground's own, at its PINNED commit (sibling-pin.ts: never the working tree, never the moving HEAD; skipped visibly when the
// checkout or the commit is missing); every bar in it goes through the plugin's own "Refresh note links" function (refreshBarNoteText), and each reader is asked the same question of the original and of the migrated copy.
// The readers, as they are in the plugin: the Beat Box (open, and save), the phrase glue that draws every phrase from its bars on the REAL engine (what the strip, the inspector's provenance and the notebook's selections
// read), an arrangement (combine_tracks over phrases over bars), and the pairing of a Score with its notes pane (a path decision: it never reads a bar's text). A control: a migrated bar whose sections were damaged is
// refused by the same reader, so "equal" is not vacuous.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { exportPinnedSibling } from './test-support/sibling-pin.ts';
import { refreshBarNoteText } from './phrase-notes-core.ts';
import { keepBarProvenance, hasBarProvenance, barOriginOf } from './bar-provenance-core.ts';
import { applySave, buildLoadMessage, contentFingerprint, isRhythmEditCandidate, parseFrontmatter, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { barsOfPayload, noteContentFor, producePhraseNote, type PhraseParams } from './phrase-core.ts';
import { newKitNote } from './kit-core.ts';
import { newArrangementNote, produceArrangement } from './arrangement-core.ts';

const skipWheels = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const engineTest = (name: string, fn: (t: { skip: (reason: string) => void }) => Promise<void>) => baseTest(name, { skip: skipWheels, timeout: 600_000 }, fn as never);

interface Vault { original: Record<string, string>; migrated: Record<string, string> }
let cached: Vault | { skip: string } | null = null;
function playground(): Vault | { skip: string } {
  if (cached) return cached;
  const got = exportPinnedSibling('music-playground');
  if ('skip' in got) return (cached = got);
  const original: Record<string, string> = {};
  for (const folder of ['bars', 'phrases']) for (const f of fs.readdirSync(path.join(got.dir, folder))) if (f.endsWith('.md') && f !== 'README.md') original[`${folder}/${f}`] = fs.readFileSync(path.join(got.dir, folder, f), 'utf8');
  // the pinned playground has no fork yet: an OLD-form fork (what Edit this bar wrote before the lineage became wikilinks) is added, so the migration of a fork is read by every reader too
  const src = original['bars/bar_006.md'] ?? original[Object.keys(original).find((k) => k.startsWith('bars/'))!];
  original['bars/bar_099.md'] = src.replace(/^---\n[\s\S]*?\n---\n/, '---\ntype: data\ncontent_type: json\ndescription: "bar_099 — forked from phrases/phrase_006 bar 3 to edit by hand. The phrase shows this bar instead of the generated one."\nforked_from: "phrases/phrase_006 bar 3"\n---\n').replace(/\n\n(<!--[\s\S]*?)?(# Description[\s\S]*?)?(?=```json)/, '\n\n');
  const migrated: Record<string, string> = { ...original };
  for (const p of Object.keys(original).filter((k) => k.startsWith('bars/'))) {
    const r = refreshBarNoteText(original[p], path.basename(p, '.md'));
    if (r.ok === false) throw new Error(`${p}: ${r.message}`);
    migrated[p] = r.text;
  }
  return (cached = { original, migrated });
}
const bars = (v: Vault) => Object.keys(v.original).filter((k) => k.startsWith('bars/')).sort();
const phrases = (v: Vault) => Object.keys(v.original).filter((k) => k.startsWith('phrases/')).sort();
/** The engine stamps random ids into every MusicXML it makes (a part id `P` + 32 hex, an instrument id `I` + 32 hex), so two runs on the SAME bars differ; mask them and the rest must be equal (asserted below on the original alone). */
const stable = (payload: unknown): unknown => JSON.parse(JSON.stringify(payload).replace(/[PI][0-9a-f]{32}/g, 'ID'));
const dataOf = (text: string): RhythmData => { const r = readRhythmNote(text); assert.ok(r.ok, r.ok ? '' : r.message); return (r as { value: { data: RhythmData } }).value.data; };

baseTest('the pinned playground vault is there, its bars are migrated (sections above the fence, the fence byte for byte), and there are enough of them to mean something', (t) => {
  const v = playground();
  if ('skip' in v) { t.skip(v.skip); return; }
  assert.ok(bars(v).length >= 5, `bars: ${bars(v).join(', ')}`);
  for (const p of bars(v)) {
    assert.ok(hasBarProvenance(v.migrated[p]), `${p}: sections`);
    assert.ok(!hasBarProvenance(v.original[p]), `${p}: the original had none (non-vacuity)`);
    assert.equal(v.migrated[p].slice(v.migrated[p].indexOf('```json')), v.original[p].slice(v.original[p].indexOf('```json')), `${p}: the fence and everything after it`);
  }
  assert.ok(bars(v).some((p) => barOriginOf(v.migrated[p]).kind === 'fork'), 'there is a fork among them, so the origin sentence with a link is exercised');
});

baseTest('Beat Box OPEN: a migrated bar is the same rhythm data, an edit candidate, and the same load message as the original', (t) => {
  const v = playground();
  if ('skip' in v) { t.skip(v.skip); return; }
  for (const p of bars(v)) {
    assert.deepEqual(dataOf(v.migrated[p]), dataOf(v.original[p]), p);
    assert.equal(isRhythmEditCandidate(parseFrontmatter(v.migrated[p])?.fields), isRhythmEditCandidate(parseFrontmatter(v.original[p])?.fields), p);
    assert.deepEqual(buildLoadMessage(dataOf(v.migrated[p]), path.basename(p, '.md'), 'edit', null, true, false, true), buildLoadMessage(dataOf(v.original[p]), path.basename(p, '.md'), 'edit', null, true, false, true), p);
  }
});

baseTest('Beat Box SAVE: an unchanged save of a migrated bar writes the same bytes back (the sections are stable under keepBarProvenance); a changed one rewrites only the json and the sentence that counts hits', (t) => {
  const v = playground();
  if ('skip' in v) { t.skip(v.skip); return; }
  for (const p of bars(v)) {
    const text = v.migrated[p];
    const same = applySave(text, contentFingerprint(text), dataOf(text), keepBarProvenance);
    assert.ok(same.ok, p);
    if (same.ok) assert.equal(same.text, text, `${p}: a no-op save changes nothing`);
    const moved = { ...dataOf(text), tempo_bpm: 111 } as RhythmData;
    const r = applySave(text, contentFingerprint(text), moved, keepBarProvenance);
    assert.ok(r.ok, p);
    if (r.ok) { assert.equal(dataOf(r.text).tempo_bpm, 111, p); assert.deepEqual(barOriginOf(r.text), barOriginOf(text), `${p}: the origin is kept`); }
  }
});

baseTest('CONTROL: the same readers REFUSE a migrated bar whose sections were damaged (another heading above the fence), so "equal" above is not vacuous', (t) => {
  const v = playground();
  if ('skip' in v) { t.skip(v.skip); return; }
  const p = bars(v)[0];
  const damaged = v.migrated[p].replace('# Recipe', '# Recipe\n\nx\n\n# Python');
  assert.equal(readRhythmNote(damaged).ok, false);
  assert.equal(readRhythmNote(v.migrated[p]).ok, true);
});

engineTest('REAL ENGINE: every phrase of the vault draws the same Score from the migrated bars as from the original ones (what the strip, the inspector\'s provenance and the notebook\'s selections read)', async (t) => {
  const v = playground();
  if ('skip' in v) { t.skip(v.skip); return; }
  const py = await engine();
  const run = async (files: Record<string, string>, p: string) => {
    const deps = {
      readNote: async (q: string) => { const t = files[q]; if (t === undefined) throw new Error('File not found'); return t; },
      compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
    };
    return producePhraseNote(deps, files[p], path.basename(p, '.md'));
  };
  const first = phrases(v)[0];
  const x = await run(v.original, first), y = await run(v.original, first);
  assert.ok(x.kind === 'score' && y.kind === 'score' && JSON.stringify(x.payload) !== JSON.stringify(y.payload), 'NON-VACUITY: two runs on the same bars DO differ unmasked (random ids)');
  assert.deepEqual(stable((x as { payload: unknown }).payload), stable((y as { payload: unknown }).payload), 'and are equal once the ids are masked: the mask is exactly the noise');
  let drawn = 0;
  for (const p of phrases(v)) {
    const a = await run(v.original, p), b = await run(v.migrated, p);
    assert.equal(a.kind, b.kind, `${p}: ${a.kind} vs ${b.kind}${b.kind === 'error' ? ' ' + (b as { message: string }).message : ''}`);
    if (a.kind === 'score' && b.kind === 'score') { assert.deepEqual(stable(b.payload), stable(a.payload), p); drawn++; }
  }
  assert.ok(drawn >= 5, `phrases drawn: ${drawn} (non-vacuity)`);
});

engineTest('REAL ENGINE: an arrangement (combine_tracks over phrases over bars) is the same from migrated bars as from the original ones', async (t) => {
  const v = playground();
  if ('skip' in v) { t.skip(v.skip); return; }
  const py = await engine();
  const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
  const rockBar = fs.readFileSync(path.join(FIXTURES, 'bar_007.md'), 'utf8'), latinBar = fs.readFileSync(path.join(FIXTURES, 'bar_008.md'), 'utf8').replace('"tempo_bpm": 120', '"tempo_bpm": 100');
  const extend = (source: string, n: number): PhraseParams => ({ kind: 'extend', source, bars: n, style: 'repeat_with_fills', tempo_change_pct: 0 });
  const arrOf = (migrate: boolean): Record<string, string> => {
    const bar = (name: string, text: string) => (migrate ? (refreshBarNoteText(text, name) as { text: string }).text : text);
    return {
      'bars/bar_007.md': bar('bar_007', rockBar), 'bars/bar_008.md': bar('bar_008', latinBar),
      'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] }), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] }),
      'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', 4)), 'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)),
      'arrangements/arr_001.md': newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] }),
    };
  };
  const run = async (files: Record<string, string>) => produceArrangement({
    phrases: { readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; }, compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title) },
    compute: async (data: unknown, title: string) => computePhrase(py, data, { kind: 'arrangement' }, title),
  } as never, files['arrangements/arr_001.md'], 'arr_001');
  const a = await run(arrOf(false)), b = await run(arrOf(true));
  assert.equal(a.kind, 'score'); assert.equal(b.kind, 'score');
  if (a.kind === 'score' && b.kind === 'score') { assert.deepEqual(barsOfPayload(b.payload), barsOfPayload(a.payload)); assert.deepEqual(stable(b.payload), stable(a.payload)); }
  assert.ok(hasBarProvenance(arrOf(true)['bars/bar_007.md']), 'the migrated side really is migrated (non-vacuity)');
});

baseTest('PAIR: the pairing of a Score with its notes pane is a decision about paths and view types - it never reads a bar\'s text (so a migrated bar cannot change it)', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, 'linked-panes-core.ts'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/readRhythmNote|extractJsonBlock|vault\.read|readNote\(|\.read\(/.test(src), 'linked-panes-core reads no note text');
});
