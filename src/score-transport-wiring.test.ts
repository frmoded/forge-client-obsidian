// 2026-11-17-2000 - wiring pins for the Score's one gentle row: it exists ONLY in the compact Score (the score-first music tabs), every other Score keeps its player and its download links (P3: nothing
// changes outside music vaults); no progress / time element in the code; the styles are scoped to the row and use Obsidian's variables; the lean edition never reaches it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SRC = import.meta.dirname; const ROOT = path.resolve(SRC, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const edition = code(read('src/music-edition.full.ts'));

test('P3: the row, the hidden player and the Export menu exist only when the Score is compact; the old download links stay for every other Score', () => {
  assert.match(edition, /if \(!compact\) host\.appendChild\(makeDownloadBar\(snippetId, musicxml, midiBase64\)\);/);
  assert.match(edition, /if \(compact\) player\.classList\.add\('forge-midi-player-headless'\);/);
  assert.match(edition, /if \(compact && toolbar\) \{\s*mountScoreTransport\(toolbar,/);
  assert.equal((edition.match(/mountScoreTransport\(/g) ?? []).length, 1, 'one place builds the row');
  assert.match(edition, /function makeDownloadBar\(/); assert.match(edition, /text: 'MusicXML', cls: 'forge-output-download'/); assert.match(edition, /text: 'MIDI', cls: 'forge-output-download'/);
  assert.match(edition, /'Open in Garage Band'/, 'the old button keeps its words outside the compact Score');
});

test('P3: only the score-first tabs ask for the compact Score; the output panel and the lean edition do not', () => {
  const compactCallers = ['src/phrase-view.ts', 'src/kits-arrangements.ts', 'src/compositions.ts', 'src/rhythm-edit-view.ts'];
  for (const f of compactCallers) assert.match(read(f), /compact: true/, f);
  assert.doesNotMatch(code(read('src/output-view.ts')), /compact\s*:/, 'the output panel renders the plain Score');
  assert.doesNotMatch(read('src/music-edition.lean.ts'), /score-transport/, 'the lean edition never reaches the row');
  for (const f of ['src/score-transport-core.ts', 'src/score-transport-dom.ts', 'src/score-player-adapter.ts']) assert.doesNotMatch(code(read(f)), /from 'obsidian'/, `${f}: no obsidian import`);
});

test('no progress bar, time readout, slider or elapsed text is built by the row, and no createEl: plain DOM that a test can build', () => {
  for (const f of ['src/score-transport-dom.ts', 'src/score-transport-core.ts', 'src/score-player-adapter.ts']) {
    const c = code(read(f)); assert.doesNotMatch(c, /progress|elapsed|seek|type = 'range'|role="slider"|duration/i, f); assert.doesNotMatch(c, /\.createEl\(|createDiv\(|addClass\(/, `${f}: plain DOM`);
  }
});

const css = read('styles.css'); const block = css.slice(css.indexOf('/* 2026-11-17-2000 - the Score\'s ONE gentle row'), css.indexOf('/* the Score is never wider than its pane'));

test('the styles of the row are scoped to the toolbar, the row and its controls; every colour is an Obsidian variable (a variable\'s own fallback is allowed)', () => {
  assert.ok(block.length > 3000, 'non-vacuity: the whole block');
  const selectors = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@container[^{]*\{/g, '').split('{').slice(0, -1).map((chunk) => chunk.split('}').pop()!.trim()).filter(Boolean).flatMap((s) => s.split(',').map((x) => x.trim()));
  assert.ok(selectors.length > 30);
  for (const s of selectors) assert.match(s, /forge-score-toolbar|forge-score-transport|forge-tp-/, `unscoped selector: ${s}`);
  const stripped = block.replace(/var\(--shadow-s, 0 2px 8px rgba\(0, 0, 0, 0\.15\)\)/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(stripped, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, 'no fixed colour: Obsidian variables only');
  for (const v of ['--text-muted', '--text-normal', '--background-primary', '--background-modifier-hover', '--background-modifier-border', '--interactive-accent']) assert.ok(block.includes(v), v);
  assert.match(block, /\.forge-score-toolbar > \.forge-midi-player-headless \{ display: none; \}/);
  assert.match(block, /\.forge-score-toolbar \.forge-tp-btn,[\s\S]*?border: none;/, 'no button borders');
});
