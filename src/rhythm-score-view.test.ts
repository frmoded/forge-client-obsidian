// Beat-as-data Phase 6 (drain 2026-10-07-1600): wiring pins for the Score view and the three-mode plumbing — the Obsidian-coupled half, which
// cannot run headless. They read the shipped source (comments stripped, so prose cannot satisfy a pin).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const score = code(read('src/rhythm-score-view.ts'));
const sw = code(read('src/rhythm-mode-switch.ts'));
const edit = code(read('src/rhythm-edit-view.ts'));
const host = code(read('src/pyodide-host.ts'));

test('read-only: no vault write call anywhere in the Score view or the mode switch', () => {
  for (const [name, text] of [['rhythm-score-view.ts', score], ['rhythm-mode-switch.ts', sw]] as const) {
    for (const forbidden of ['vault.modify(', 'vault.create(', 'vault.append(', 'vault.process(', 'vault.delete(', 'vault.rename(',
      'adapter.write(', 'adapter.append(', 'fileManager.processFrontMatter(', 'createNote', 'content_type']) {
      assert.ok(!text.includes(forbidden), `${name} must not contain ${forbidden}`);
    }
  }
});

test('renders from the SAVED note: the only read of note text in the Score view is vault.read(file), handed to produceScore', () => {
  assert.match(score, /readNote: \(\) => this\.app\.vault\.read\(file\),/);
  assert.equal([...score.matchAll(/vault\.read\(/g)].length, 1);
  assert.ok(!/RhythmEditView|iframe|postMessage/.test(score), 'no dependency on a widget\'s in-memory state');
});

test('reuse, not duplication: the Score view renders through the music-edition seam and imports no Verovio / MIDI-player code', () => {
  assert.match(score, /import \{ musicEdition \} from '\.\/music-edition-selected\.ts';/);
  assert.match(score, /musicEdition\.renderTaggedMusicXML\(host, outcome\.payload, file\.basename\)/);
  assert.ok(!/from '\.\/verovio\.ts'|from 'verovio'|html-midi-player|music-edition\.full|midi-player-teardown/.test(score));
});

test('compute path: the host method sends the PARSED data to plugin-side Python that composes rhythm_data_to_stream + serialize_result', () => {
  assert.match(score, /\(await host\.getInstance\(\)\)\.computeRhythmScore\(data, title\);/);
  assert.match(host, /async computeRhythmScore\(data: unknown, title: string\): Promise<unknown> \{\s*this\.pyodide\.globals\.set\("_forge_rhythm_data_json", JSON\.stringify\(data\)\);/);
  const raw = read('src/pyodide-host.ts');
  assert.match(raw, /def _forge_rhythm_score_payload\(data_json: str, title: str\):/);
  assert.match(raw, /from forge\.music\.lib import rhythm_data_to_stream/);
  assert.match(raw, /return serialize_result\(score, \{"snippet_id": title, "meta": \{"title": title\}\}\)/);
});

test('playback is stopped on re-render, mode switch, unload, close and plugin unload', () => {
  assert.match(score, /private async render\(file: TFile\): Promise<void> \{\s*const seq = \+\+this\.renderSeq;\s*this\.stopAudio\(\);/);
  assert.match(score, /private async switchMode\(to: RhythmMode\): Promise<void> \{[\s\S]*?this\.stopAudio\(\);\s*await switchLeafToMode\(/);
  assert.match(score, /async onUnloadFile\(file: TFile\): Promise<void> \{[\s\S]*?this\.stopAudio\(\);/);
  assert.match(score, /async onClose\(\): Promise<void> \{\s*this\.stopAudio\(\);/);
  assert.match(score, /stopAudio\(\): void \{\s*musicEdition\.stopPlayers\(this\.contentEl, /);
  assert.match(edit, /getLeavesOfType\(RHYTHM_SCORE_VIEW_TYPE\)\) \{\s*if \(leaf\.view instanceof RhythmScoreView\) leaf\.view\.stopAudio\(\);/);
});

test('freshness: modify events for THIS note go to the debounced scheduler; the first render is immediate; a stale render draws nothing', () => {
  assert.match(score, /this\.registerEvent\(this\.app\.vault\.on\('modify', \(f\) => \{\s*if \(this\.file && f\.path === this\.file\.path\) this\.scheduler\?\.request\(\);/);
  assert.match(score, /this\.scheduler\.renderNow\(\);/);
  assert.match(score, /if \(seq !== this\.renderSeq\) return;/);
});

test('errors and refusals show a message with "Open as JSON"; the footer points back to the Beat Box (read-only hint)', () => {
  assert.match(score, /this\.panel\(outcome\.message, true\);/);
  assert.match(score, /const btn = box\.createEl\('button', \{ text: MODE_ACTIONS\.json\.title \}\);/);
  assert.match(score, /text: 'Edit in Beat Box'/);
});

test('mode switches: Score offers its header buttons from the pure table and switches the SAME leaf through the shared helper', () => {
  assert.match(score, /for \(const a of \[\.\.\.headerActionsFor\('score', musicEdition\.id\)\]\.reverse\(\)\) \{/);
  assert.match(score, /await switchLeafToMode\(this\.app, this\.leaf, file, 'score', to, this\.hooks\);/);
  assert.ok(!/getLeaf\(|setViewState/.test(score));
});

test('lean edition: the Score view type and its command are registered only when musicEdition.id is "music"; the mode table has no Score on lean', () => {
  assert.match(edit, /if \(edition === 'music'\) plugin\.registerView\(RHYTHM_SCORE_VIEW_TYPE, \(leaf\) => new RhythmScoreView\(leaf, hooks\)\);/);
  assert.match(edit, /if \(edition === 'music'\) \{\s*plugin\.addCommand\(\{\s*id: 'open-rhythm-note-as-score',/);
  assert.match(edit, /edition,\s*describe: \(leaf\) => describeLeaf\(app, leaf\),/);
});

test('the mode switch goes through the pure transition table (a refused transition does nothing)', () => {
  assert.match(sw, /const t = transition\(musicEdition\.id, from, to\);\s*if \(t\.ok === false\) return;/);
});
