// Beat-as-data Phase 8 (drain 2026-10-10-2200) — wiring pins for the `forge-rhythm` embed's Obsidian-coupled half
// (rhythm-embed-view.ts), which cannot run headless. They read the shipped source with comments stripped, so prose cannot satisfy one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const view = code(read('src/rhythm-embed-view.ts'));
const core = code(read('src/rhythm-embed-core.ts'));
const editView = code(read('src/rhythm-edit-view.ts'));
const scoreView = code(read('src/rhythm-score-view.ts'));
const engine = code(read('src/rhythm-score-engine.ts'));

test('NO WRITES: the embed\'s host code path contains no vault or adapter write API at all', () => {
  for (const [name, text] of [['rhythm-embed-view.ts', view], ['rhythm-embed-core.ts', core]] as const) {
    for (const forbidden of [
      'vault.modify(', 'vault.create(', 'vault.createFolder(', 'vault.append(', 'vault.process(', 'vault.delete(', 'vault.rename(', 'vault.trash(',
      'adapter.', 'fileManager.', 'processFrontMatter', 'writeNote', 'applySave', 'RhythmNoteSession', 'createAutosavePipeline', 'MSG_SAVE',
    ]) {
      assert.ok(!text.includes(forbidden), `${name} must not contain ${forbidden}`);
    }
  }
});

test('the only thing the embed reads from the vault is the data note\'s text (vault.read of the resolved file)', () => {
  assert.equal([...view.matchAll(/vault\.read\(/g)].length >= 1, true);
  assert.match(view, /readNote: \(\) => this\.app\.vault\.read\(this\.file\)/);
});

test('trust: only OUR iframe\'s window is listened to, checked BEFORE the payload is parsed; a save is not even forwarded', () => {
  const src = view.indexOf('ev.source !== this.iframe.contentWindow');
  const parse = view.indexOf('onWidgetMessage(ev.data)');
  assert.ok(src > 0 && parse > src, 'the source check precedes the dispatch');
  assert.match(view, /window\.addEventListener\('message', this\.onMessage\)/);
  assert.match(view, /window\.removeEventListener\('message', this\.onMessage\)/);
  assert.ok(!/postMessage\(.*forge-rhythm-save/.test(view));
});

test('sandbox: the iframe comes from the shared helper (allow-scripts only); no iframe or sandbox flag of its own', () => {
  assert.match(view, /import \{ createSandboxedWidgetIframe \} from '\.\/html-embed-view\.ts'/);
  assert.match(view, /createSandboxedWidgetIframe\(this\.bodyEl, widget\.html, `\$\{options\.heightPx\}px`\)/);
  assert.ok(!/createEl\('iframe'|createElement\('iframe'|<iframe|sandbox/.test(view.replace(/createSandboxedWidgetIframe/g, '')));
});

test('no native dialogs: the sandbox blocks them, so there is no confirm / alert / prompt', () => {
  assert.ok(!/\b(window\.)?(confirm|alert|prompt)\(/.test(view));
});

test('the widget lookup is the previous drain\'s bundled-aware one, called — not copied', () => {
  assert.match(view, /import \{ resolveWidgetFile \} from '\.\/bundled-widget-lookup\.ts'/);
  assert.match(view, /await resolveWidgetFile\(this\.app, RHYTHM_BOX_WIDGET_PATH\)/);
  assert.ok(!/getAbstractFileByPath|BUNDLED_ASSETS|BUNDLED_VAULT_NAMES/.test(view), 'no second lookup');
  assert.match(view, /widgetMissingMessage\(widget\.message\)/);
});

test('link resolution is relative to the EMBEDDING note, through Obsidian\'s own resolver', () => {
  assert.match(view, /this\.app\.metadataCache\.getFirstLinkpathDest\(options\.target, this\.sourcePath\)/);
  assert.match(view, /ctx\.sourcePath/);
  assert.match(view, /ctx\.addChild\(/);
});

test('the block is registered for the `forge-rhythm` language through the code-block processor (Reading view and Live Preview)', () => {
  assert.match(view, /registerMarkdownCodeBlockProcessor\(RHYTHM_EMBED_LANGUAGE,/);
  assert.match(core, /export const RHYTHM_EMBED_LANGUAGE = 'forge-rhythm';/);
});

test('invalid data is checked BEFORE the widget is mounted, so a broken note shows an inline error with Open note, not a dead iframe', () => {
  const body = view.slice(view.indexOf('private async render('));
  const validate = body.indexOf('readRhythmNote(');
  const mount = body.indexOf('createSandboxedWidgetIframe(');
  assert.ok(validate > 0 && mount > validate);
  assert.match(view, /notRhythmMessage\(note\.message\)/);
  assert.match(view, /noteNotFoundMessage\(options\.target\)/);
});

test('the Score toggle exists only in the music edition and renders through the seam + the shared engine/score pipeline', () => {
  assert.match(view, /musicEdition\.id === 'music'/);
  assert.match(view, /musicEdition\.renderTaggedMusicXML\(/);
  assert.match(view, /computeScore: computeRhythmScoreViaEngine/);
  assert.match(view, /import \{ computeRhythmScoreViaEngine \} from '\.\/rhythm-score-engine\.ts'/);
  assert.match(view, /session\.currentScore\(\)/);
  assert.ok(!/from '\.\/verovio\.ts'|from 'verovio'|html-midi-player|music-edition\.full|midi-player-teardown/.test(view + core), 'lean must not reach Verovio or the MIDI player from here');
});

test('the Score view and the embed share ONE engine closure (the Score view calls the shared helper)', () => {
  assert.match(engine, /\(await host\.getInstance\(\)\)\.computeRhythmScore\(data, title\)/);
  assert.match(scoreView, /compute: computeRhythmScoreViaEngine,/);
});

test('one sound at a time: a module-level coordinator, every embed registers with a stop and unregisters on unload', () => {
  assert.match(view, /const coordinator = createPlaybackCoordinator\(\)/);
  assert.match(view, /coordinator\.register\(this\.id, \(\) => this\.session\?\.stop\(\)\)/);
  assert.match(view, /onPlaying: \(playing\) => coordinator\.setPlaying\(this\.id, playing\)/);
  assert.match(view, /onunload\(\): void \{[\s\S]*?coordinator\.unregister\(this\.id\)/);
});

test('unload cleans up: listener removed, session disposed, blob URL revoked, score players stopped', () => {
  const body = view.slice(view.indexOf('onunload(): void'));
  assert.match(body, /window\.removeEventListener\('message', this\.onMessage\)/);
  assert.match(body, /this\.session\?\.dispose\(\)/);
  assert.match(body, /URL\.revokeObjectURL\(this\.blobUrl\)/);
  assert.match(body, /musicEdition\.stopPlayers\(/);
});

test('freshness: modify events for the DATA note go to the session (never to a write)', () => {
  assert.match(view, /this\.registerEvent\(this\.app\.vault\.on\('modify', \(f\) => \{\s*if \(this\.file && f\.path === this\.file\.path\) void this\.session\?\.onNoteModified\(\);/);
});

test('Open note goes through the plugin\'s own Beat Box opener (new tab unless the note is already open; default Beat Box view)', () => {
  assert.match(view, /openNote: \(\) => \{ if \(this\.file\) this\.hooks\.openNote\(this\.file\); \}/);
  assert.match(editView, /registerRhythmEmbed\(plugin, \{ openNote: \(file\) => \{ void openRhythmEditor\(app, file, hooks, null\); \} \}\)/);
});

test('every error is inline and never throws out of the processor', () => {
  assert.match(view, /private showError\(message: string/);
  assert.match(view, /catch \(e\) \{[\s\S]*?this\.showError\(/);
  assert.match(view, /forge-rhythm-embed-error/);
});
