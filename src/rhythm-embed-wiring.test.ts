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
  assert.match(view, /createSandboxedWidgetIframe\(this\.bodyEl, widget\.html, `\$\{heightPx\}px`\)/);
  assert.ok(!/createEl\('iframe'|createElement\('iframe'|<iframe|sandbox/.test(view.replace(/createSandboxedWidgetIframe/g, '')));
});

test('the block\'s view option reaches the session (and so every load, Reset included)', () => {
  assert.match(view, /view: options\.view,/);
});

test('the embed height: an explicit `height:` is used as written; otherwise the default follows the note\'s instrument count', () => {
  assert.match(view, /options\.heightExplicit \? options\.heightPx : embedHeightFor\(options\.view, Object\.keys\(note\.value\.data\.channels\)\.length\)/);
  assert.match(view, /createSandboxedWidgetIframe\(this\.bodyEl, widget\.html, `\$\{heightPx\}px`\)/);
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
  // pins the MECHANISM (the handler's shape). Drain 2026-10-18-1800 added the error-state branch in front of it: an embed with no session
  // (showing an inline error) re-renders instead; a live embed still hands the event to its session, as before.
  assert.match(view, /this\.registerEvent\(this\.app\.vault\.on\('modify', \(f\) => \{\s*if \(!this\.file \|\| f\.path !== this\.file\.path\) return;[\s\S]*?else void this\.session\?\.onNoteModified\(\);/);
  assert.ok(!/this\.session!?\.(write|save|process)/.test(view), 'and no write is reachable from the session');
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

// Drain 2026-10-18-1800 (driver clarification): a changed note reloads the embed even over local edits, and the embed says so.
// Drain 2026-10-19-1500: the label is timed by ATTENTION (updated-label-core.ts) so it is seen, and sits in the toolbar row.
test('mechanism pin: the embed view shows "Updated from note" in the toolbar, times it by attention, and tears every listener down', () => {
  const view = fs.readFileSync(path.resolve(import.meta.dirname, 'rhythm-embed-view.ts'), 'utf8');
  assert.match(view, /showUpdated: \(\) => \{ this\.flashUpdated\(\); \}/);
  assert.match(view, /this\.updatedEl = bar\.createSpan\(\{ cls: 'forge-rhythm-embed-updated forge-rhythm-embed-hidden', text: UPDATED_FROM_NOTE_LABEL, attr: \{ role: 'status', 'aria-live': 'polite' \} \}\)/, 'in the toolbar row, a polite live region');
  assert.match(view, /createUpdatedLabel\(\{\s*ms: UPDATED_FROM_NOTE_MS,/);
  assert.match(view, /isAttentive: \(\) => isLabelAttentive\(\{ windowFocused: document\.hasFocus\(\), pageVisible: document\.visibilityState === 'visible', onScreen: this\.onScreen \}\)/);
  assert.match(view, /new IntersectionObserver\(/);
  for (const ev of ['focus', 'blur']) {
    assert.match(view, new RegExp(`window\\.addEventListener\\('${ev}', this\\.onAttention\\)`));
    assert.match(view, new RegExp(`window\\.removeEventListener\\('${ev}', this\\.onAttention\\)`));
  }
  assert.match(view, /document\.addEventListener\('visibilitychange', this\.onAttention\)/);
  assert.match(view, /document\.removeEventListener\('visibilitychange', this\.onAttention\)/);
  assert.match(view, /this\.unloaded = true;\s*this\.releaseUpdatedLabel\(\);/);
  assert.doesNotMatch(view, /setStale|staleEl|forge-rhythm-embed-stale|updatedTimer/, 'neither the Phase 8 warning nor the old wall-clock timer is left');
  const css = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.forge-rhythm-embed-updated \{[^}]*border: 1px solid var\(--interactive-accent\)/, 'visible, calm: an accent outline, not an error colour');
});

// Drain 2026-10-19-1500 §2 — ONE "Open note" per embed: the host toolbar's (outside the iframe, so it works even when the widget errors).
// The widget's own button is gone; an OLDER widget file (a vault not yet updated) may still post `forge-rhythm-open-note`, so the host keeps
// answering it rather than silently dropping a click.
test('mechanism pin: the embed has exactly ONE Open note in its toolbar, wired to the plugin\'s opener; an older widget\'s message is still answered', () => {
  const view = fs.readFileSync(path.resolve(import.meta.dirname, 'rhythm-embed-view.ts'), 'utf8');
  const toolbar = view.slice(view.indexOf("const bar = this.containerEl.createDiv({ cls: 'forge-rhythm-embed-toolbar' })"));
  assert.equal((toolbar.slice(0, toolbar.indexOf('this.statusEl')).match(/text: 'Open note'/g) ?? []).length, 1, 'one Open note button in the toolbar');
  assert.match(toolbar, /openBtn\.addEventListener\('click', \(\) => \{ this\.hooks\.openNote\(this\.file\); \}\);/);
  const core = fs.readFileSync(path.resolve(import.meta.dirname, 'rhythm-embed-core.ts'), 'utf8');
  assert.match(core, /case 'open-note': deps\.openNote\(\); return;/, 'the session still answers the message an older widget posts');
});
