// Beat-as-data Phase 5 (drain 2026-10-05-2100): wiring pins for rhythm-edit-view.ts. The view itself is Obsidian-coupled glue and, per
// this repo's convention (see html-embed-view.ts), is not unit-run — its decisions live in rhythm-edit-core.ts (tested). What CAN be
// pinned without an Obsidian instance is the safety-critical wiring: the sandbox, the message-source check, the atomic write, and
// that nothing else can write a note. These read the source, so a refactor that quietly weakens one of them fails the suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { RHYTHM_BOX_WIDGET_PATH } from './rhythm-edit-core.ts';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const view = read('src/rhythm-edit-view.ts');
const embed = read('src/html-embed-view.ts');
const main = read('src/main.ts');
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');   // comments out, so a pin cannot be satisfied by prose

test('sandbox: the shared iframe helper adds exactly allow-scripts and allow-same-origin — nothing wider', () => {
  const adds = [...code(embed).matchAll(/sandbox\.add\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(adds, ['allow-scripts', 'allow-same-origin']);
  assert.ok(!/sandbox\s*=|setAttribute\('sandbox'/.test(code(embed)), 'no other way of setting the sandbox');
  assert.match(code(embed), /setAttribute\('referrerpolicy', 'no-referrer'\)/);
});

test('sandbox: the Rhythm Box view hosts the widget through that helper and builds no iframe of its own', () => {
  assert.match(code(view), /createSandboxedWidgetIframe\(this\.contentEl, html, '100%'\)/);
  assert.ok(!/createEl\('iframe'|createElement\('iframe'|<iframe/.test(code(view)));
  assert.ok(!/sandbox/.test(code(view).replace(/createSandboxedWidgetIframe/g, '')), 'the view never touches sandbox flags itself');
});

test('sandbox: the html-embed processor still uses the same helper (behaviour unchanged by the extraction)', () => {
  assert.match(code(embed), /createSandboxedWidgetIframe\(el, html, `\$\{parsed\.heightPx\}px`\)/);
});

test('trust: only messages whose event.source is the view\'s own iframe are considered — checked BEFORE the payload is parsed', () => {
  const body = code(view);
  const source = body.indexOf('ev.source !== this.iframe.contentWindow');
  const parse = body.indexOf('parseWidgetMessage(ev.data)');
  assert.ok(source > 0 && parse > 0 && source < parse, 'source check precedes parseWidgetMessage');
  assert.match(body, /if \(!this\.iframe \|\| ev\.source !== this\.iframe\.contentWindow\) return;/);
});

test('trust: a malformed widget message is dropped with a warning and never reaches the write path', () => {
  const body = code(view);
  assert.match(body, /msg\.kind === 'malformed'[\s\S]*?console\.warn[\s\S]*?return;/);
  assert.match(body, /void this\.save\(msg\.data\)/);
  assert.equal([...body.matchAll(/this\.save\(/g)].length, 1, 'save() has exactly one caller');
});

test('write: the note is changed only through ONE atomic vault.process, whose callback validates (applySave) and aborts by throwing', () => {
  const body = code(view);
  assert.equal([...body.matchAll(/vault\.process\(/g)].length, 1);
  assert.match(body, /vault\.process\(file, \(current\) => \{\s*const result = applySave\(current, this\.fingerprint, payload\);\s*if \(result\.ok === false\) throw new RhythmSaveRefused\(result\.message\);/);
  for (const forbidden of ['vault.modify(', 'vault.create(', 'vault.append(', 'adapter.write(', 'adapter.append(', 'vault.delete(', 'vault.rename(', 'fileManager.processFrontMatter(']) {
    assert.ok(!body.includes(forbidden), `the view must not call ${forbidden}`);
  }
});

test('write: the fingerprint compared at save time is the one taken when the note was loaded, and is refreshed only by a load or a successful save', () => {
  const body = code(view);
  const assignments = [...body.matchAll(/this\.fingerprint = ([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(assignments, ['note.value.fingerprint', 'contentFingerprint(written)']);
});

test('write: a second save while one is in flight is ignored, and the flag is always released', () => {
  const body = code(view);
  assert.match(body, /if \(!this\.file \|\| this\.saving\) return;/);
  assert.match(body, /finally \{\s*this\.saving = false;/);
});

test('messages to the widget are built only by the core\'s builders', () => {
  const body = code(view);
  const posts = [...body.matchAll(/postMessage\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(posts.sort(), ['buildLoadMessage(note.value.data', 'buildSaveResultMessage(ok'].sort());
});

test('the editor is refused (with a Notice naming why) before any pane opens: read_only, wrong type, wrong body', () => {
  const body = code(view);
  assert.match(body, /const note = readRhythmNote\(await app\.vault\.read\(file\)\);\s*if \(note\.ok === false\) \{\s*new Notice\(`Edit rhythm: \$\{note\.message\}`, 8000\);\s*return;/);
});

test('registration: main.ts registers the view, command and menus once, via registerRhythmEdit', () => {
  assert.match(main, /import \{ registerRhythmEdit \} from '\.\/rhythm-edit-view\.ts';/);
  assert.equal([...code(main).matchAll(/registerRhythmEdit\(this\)/g)].length, 1);
  const body = code(view);
  assert.match(body, /id: 'edit-rhythm-in-rhythm-box'/);
  assert.match(body, /export const RHYTHM_EDIT_COMMAND_NAME = 'Edit rhythm in Rhythm Box';/);
  assert.match(body, /plugin\.registerView\(RHYTHM_EDIT_VIEW_TYPE/);
  assert.match(body, /app\.workspace\.on\('file-menu'/);
  assert.match(body, /app\.workspace\.on\('editor-menu'/);
});

test('availability: the command and both menu items are gated on isRhythmEditCandidate (type: data, content_type: json)', () => {
  const body = code(view);
  assert.match(body, /isRhythmEditCandidate\(app\.metadataCache\.getFileCache\(file\)\?\.frontmatter/);
  assert.match(body, /checkCallback: \(checking: boolean\) => \{\s*const file = app\.workspace\.getActiveFile\(\);\s*if \(!isCandidateFile\(app, file\)\) return false;/);
  assert.equal([...body.matchAll(/isCandidateFile\(/g)].length >= 4, true);   // definition + command + file-menu + editor-menu
});

test('the widget path the view loads is where the music-theory vault keeps it', () => {
  assert.equal(RHYTHM_BOX_WIDGET_PATH, 'music_instruments/resources/html/rhythm_box.html');
  const found = ['../music-theory', 'assets/vaults/music-theory'].some((base) => fs.existsSync(path.resolve(process.cwd(), base, RHYTHM_BOX_WIDGET_PATH)));
  assert.ok(found, 'rhythm_box.html exists at that path in the source vault or the bundled copy');
});
