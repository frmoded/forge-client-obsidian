// Beat-as-data Phase 5 + 5b (drains 2026-10-05-2100, 2026-10-06-1200): wiring pins for rhythm-edit-view.ts. The view itself is Obsidian-coupled glue and, per
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
  assert.match(body, /this\.pipeline\?\.submit\(msg\.data\)/);
  assert.equal([...body.matchAll(/\.submit\(/g)].length, 1, 'the pipeline has exactly one producer: the widget message handler');
  assert.equal([...body.matchAll(/this\.writeNote\(/g)].length, 1, 'writeNote is called from one place — the pipeline\'s write dep');
});

test('write: the note is changed only through ONE atomic vault.process, whose callback validates (session.apply) and aborts by throwing', () => {
  const body = code(view);
  assert.equal([...body.matchAll(/vault\.process\(/g)].length, 1);
  assert.match(body, /vault\.process\(file, \(current\) => \{\s*const result = session\.apply\(current, payload\);\s*if \(result\.ok === false\) throw new RhythmSaveRefused\(result\.kind, result\.message\);/);
  for (const forbidden of ['vault.modify(', 'vault.create(', 'vault.append(', 'adapter.write(', 'adapter.append(', 'vault.delete(', 'vault.rename(', 'fileManager.processFrontMatter(']) {
    assert.ok(!body.includes(forbidden), `the view must not call ${forbidden}`);
  }
});

test('write: a successful write re-baselines the session (commit) and every failure rolls the expectation back', () => {
  const body = code(view);
  assert.match(body, /\}\);\s*session\.commit\(\);\s*return \{ ok: true \};/);
  assert.match(body, /catch \(e\) \{\s*session\.rollback\(\);/);
  assert.equal([...body.matchAll(/session\.rebaseline\(/g)].length, 1, 'the baseline moves only on a load (sendLoad) or our own successful write');
});

test('autosave: the pipeline is the 600 ms core with real timers injected; there is no Save path left in the view', () => {
  const body = code(view);
  assert.match(body, /createAutosavePipeline\(\{\s*setTimer: \(fn, ms\) => window\.setTimeout\(fn, ms\),\s*clearTimer: \(h\) => window\.clearTimeout\(h as number\),/);
  assert.ok(!/debounceMs/.test(body), 'the debounce interval is the core\'s default (600 ms), not overridden here');
  assert.ok(!/private async save\(|this\.save\(|this\.saving/.test(body));
});

test('flush: pending edits are written on view close, when switching back to JSON, when the pane moves to another note, and on plugin unload', () => {
  const body = code(view);
  assert.match(body, /async onClose\(\): Promise<void> \{\s*window\.removeEventListener\('message', this\.onMessage\);\s*await this\.flush\(\);\s*this\.pipeline\?\.dispose\(\);/);
  assert.match(body, /private async openAsJson\(\): Promise<void> \{[\s\S]*?await this\.flush\(\);[\s\S]*?setViewState/);
  assert.match(body, /private async mount\(filePath: string\): Promise<void> \{\s*await this\.flush\(\);/);
  assert.match(body, /plugin\.register\(\(\) => \{[\s\S]*?getLeavesOfType\(RHYTHM_EDIT_VIEW_TYPE\)[\s\S]*?\.flush\(\)/);
});

test('external changes: the view listens to vault modify for ITS note, classifies via the session, reloads or halts — never writes', () => {
  const body = code(view);
  assert.match(body, /this\.registerEvent\(this\.app\.vault\.on\('modify', \(f\) => \{\s*if \(this\.file && f\.path === this\.file\.path\) void this\.onNoteModified\(\);/);
  assert.match(body, /session\.classifyModify\(await this\.app\.vault\.read\(file\), pipeline\.busy\(\)\)/);
  assert.match(body, /if \(verdict === 'reload'\) await this\.sendLoad\(\);\s*else if \(verdict === 'conflict'\) pipeline\.halt\(EXTERNAL_CHANGE_MESSAGE\);/);
  assert.match(body, /private async reloadFromNote\(\): Promise<void> \{\s*this\.pipeline\?\.resume\(\);\s*await this\.sendLoad\(\);/);
});

test('messages to the widget are built only by the core\'s builders', () => {
  const body = code(view);
  const posts = [...body.matchAll(/postMessage\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(posts.sort(), ['buildLoadMessage(note.value.data', 'buildStatusMessage(s'].sort());
});

test('a note that stops matching shows the refusal message with an "Open as JSON" button — the pane is never left stuck or silently closed', () => {
  const body = code(view);
  assert.match(body, /private showRefusal\(message: string\): void \{[\s\S]*?createEl\('button', \{ text: OPEN_AS_JSON_TITLE \}\)[\s\S]*?this\.openAsJson\(\)/);
  assert.match(body, /if \(note\.ok === false\) return this\.showRefusal\(`Edit rhythm: \$\{note\.message\}`\);/);
  assert.match(body, /if \(note\.ok === false\) \{\s*this\.showRefusal\(`Edit rhythm: \$\{note\.message\}`\);/);
  // only a note that does not exist at all closes the pane
  assert.equal([...body.matchAll(/this\.fail\(|return this\.fail\(/g)].length, 1);
});

test('toggle: "Open as Beat Box" changes the note\'s OWN leaf — switchLeafToBeatBox never opens a tab', () => {
  const body = code(view);
  const fn = /export async function switchLeafToBeatBox[\s\S]*?\n\}\n/.exec(body)![0];
  assert.match(fn, /leaf\.setViewState\(\{ type: RHYTHM_EDIT_VIEW_TYPE, active: true, state: \{ filePath: file\.path \} \}\)/);
  assert.ok(!/getLeaf\(/.test(fn), 'no getLeaf anywhere on the toggle path');
  assert.equal([...body.matchAll(/getLeaf\('tab'\)/g)].length, 1, 'a new tab is opened in exactly one place: the command/menu fallback when no tab shows the note');
  const opener = /export async function openRhythmEditor[\s\S]*?\n\}\n/.exec(body)![0];
  assert.match(opener, /getLeavesOfType\('markdown'\)\.find\(\(l\) => l\.view instanceof MarkdownView && l\.view\.file\?\.path === file\.path\)/);
  assert.match(opener, /switchLeafToBeatBox\(app, own \?\? app\.workspace\.getLeaf\('tab'\), file\)/);
});

test('toggle: the header action on the markdown view switches view.leaf (the note\'s own tab) and the command passes the active markdown leaf', () => {
  const body = code(view);
  assert.match(body, /view\.addAction\('music', OPEN_AS_BEAT_BOX_TITLE, \(\) => \{\s*const file = view\.file;\s*if \(isCandidateFile\(app, file\)\) void switchLeafToBeatBox\(app, view\.leaf, file\);/);
  assert.match(body, /openRhythmEditor\(app, file, app\.workspace\.getActiveViewOfType\(MarkdownView\)\?\.leaf\)/);
});

test('header actions appear only for matching notes: added when the note is a candidate, removed when it is not, re-synced on every relevant event', () => {
  const body = code(view);
  assert.match(body, /const want = isCandidateFile\(app, view\.file\);\s*const have = headerActions\.get\(view\);\s*if \(want && !have\) \{/);
  assert.match(body, /\} else if \(!want && have\) \{\s*have\.remove\(\);\s*headerActions\.delete\(view\);/);
  for (const ev of ["'file-open'", "'active-leaf-change'", "'layout-change'"]) assert.ok(body.includes(`app.workspace.on(${ev}, syncHeaderActions)`), ev);
  assert.ok(body.includes("app.metadataCache.on('changed', syncHeaderActions)"));
});

test('toggle back: "Open as JSON" is a header action of the Beat Box view and returns the SAME leaf to markdown for the same file; no JSON editor of our own', () => {
  const body = code(view);
  assert.match(body, /this\.addAction\('braces', OPEN_AS_JSON_TITLE, \(\) => \{ void this\.openAsJson\(\); \}\);/);
  assert.match(body, /await this\.leaf\.setViewState\(\{ type: 'markdown', active: true, state: \{ file: filePath \} \}\);/);
  assert.ok(!/CodeMirror|EditorView|new Editor|createEl\('textarea'/.test(body), 'the view builds no editor of its own');
});

test('no per-file memory: nothing in the view persists a view preference', () => {
  const body = code(view);
  assert.ok(!/saveData|loadData|localStorage|sessionStorage/.test(body));
});

test('the editor is refused (with a Notice naming why) before any pane switches: read_only, wrong type, wrong body', () => {
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
  assert.equal([...body.matchAll(/isCandidateFile\(/g)].length >= 6, true);   // definition + command + file-menu + editor-menu + header sync + header click
});

test('the widget path the view loads is where the music-theory vault keeps it', () => {
  assert.equal(RHYTHM_BOX_WIDGET_PATH, 'music_instruments/resources/html/rhythm_box.html');
  const found = ['../music-theory', 'assets/vaults/music-theory'].some((base) => fs.existsSync(path.resolve(process.cwd(), base, RHYTHM_BOX_WIDGET_PATH)));
  assert.ok(found, 'rhythm_box.html exists at that path in the source vault or the bundled copy');
});
