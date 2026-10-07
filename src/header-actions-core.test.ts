// Beat-as-data Phase 5c (drain 2026-10-07-0100): header parity. The Beat Box tab must behave like a note tab: every header action a
// markdown view gets is either present in the Beat Box view or deliberately absent, with a reason. This is the audit as data, and the
// tests keep it honest against the source (a new markdown-view action with no decision fails the suite).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  BEAT_BOX_ACTIONS,
  BEAT_BOX_ONLY_ACTIONS,
  COMMAND_AUDIT,
  MARKDOWN_HEADER_ACTIONS,
} from './header-actions-core.ts';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const main = code(read('src/main.ts'));
const view = code(read('src/rhythm-edit-view.ts'));

test('every markdown-view header action has an explicit decision with a reason', () => {
  assert.ok(MARKDOWN_HEADER_ACTIONS.length >= 5);
  for (const a of MARKDOWN_HEADER_ACTIONS) {
    assert.ok(a.beatBox === 'added' || a.beatBox === 'not-applicable', a.id);
    assert.ok(a.reason.length > 15, `${a.id} needs a real reason`);
  }
});

test('audit vs source: syncButtons() registers exactly the actions the audit lists (icon + tooltip)', () => {
  const sync = /syncButtons\(\) \{[\s\S]*?\n  \}\n/.exec(main)![0];
  const found = [...sync.matchAll(/view\.addAction\(\s*'([^']+)',\s*'([^']+)'/g)].map((m) => `${m[1]}|${m[2]}`).sort();
  const audited = MARKDOWN_HEADER_ACTIONS.map((a) => `${a.icon}|${a.title}`).sort();
  assert.deepEqual(found, audited, 'a markdown-view action was added or removed without updating src/header-actions-core.ts');
});

test('the Beat Box view\'s actions are exactly the audit\'s "added" ones plus the Beat-Box-only ones, in the same left-to-right order', () => {
  const added = MARKDOWN_HEADER_ACTIONS.filter((a) => a.beatBox === 'added').map((a) => a.id);
  assert.deepEqual(BEAT_BOX_ACTIONS.map((a) => a.id).filter((id) => !BEAT_BOX_ONLY_ACTIONS.some((o) => o.id === id)), added);
  assert.deepEqual(BEAT_BOX_ACTIONS.map((a) => a.id), ['new-forge-note', 'edges-toggle', 'restore-to-last-commit', 'open-as-json']);
});

test('the specific decisions: restore + new note + edges ADDED; library palette and the hammer NOT applicable', () => {
  const by = Object.fromEntries(MARKDOWN_HEADER_ACTIONS.map((a) => [a.id, a.beatBox]));
  assert.equal(by['restore-to-last-commit'], 'added');
  assert.equal(by['new-forge-note'], 'added');
  assert.equal(by['edges-toggle'], 'added');
  assert.equal(by['library-palette'], 'not-applicable');
  assert.equal(by['forge-this-note'], 'not-applicable');
});

test('the Beat Box view registers each of those actions, in order, with the same icon and tooltip as the markdown view', () => {
  // addAction PREPENDS, so the view adds them right-to-left: open-as-json first ... new-forge-note last (leftmost)
  const adds = [...view.matchAll(/this\.addAction\('([^']+)', ([A-Za-z_.']+)/g)].map((m) => m[1]);
  const expected = [...BEAT_BOX_ACTIONS].reverse().map((a) => a.icon);
  assert.deepEqual(adds, expected);
  for (const a of BEAT_BOX_ACTIONS) {
    assert.ok(view.includes(`BEAT_BOX_ACTION_BY_ID['${a.id}'].title`) || view.includes(a.title), `title wired for ${a.id}`);
  }
});

test('markdown-view icons and titles are reused verbatim for the shared actions (parity, not a lookalike)', () => {
  for (const a of BEAT_BOX_ACTIONS.filter((x) => !BEAT_BOX_ONLY_ACTIONS.some((o) => o.id === x.id))) {
    const md = MARKDOWN_HEADER_ACTIONS.find((m) => m.id === a.id)!;
    assert.equal(a.icon, md.icon);
    assert.equal(a.title, md.title);
  }
});

test('command audit: every command that binds to the active note has a decision, and the sources agree', () => {
  assert.ok(COMMAND_AUDIT.length >= 5);
  for (const c of COMMAND_AUDIT) assert.ok(c.reason.length > 15, c.id);
  // each audited command id still exists in main.ts
  for (const c of COMMAND_AUDIT) assert.ok(main.includes(`id: '${c.id}'`), `${c.id} exists`);
  // and no command that reads the active note is missing from the audit
  const ids = new Set(COMMAND_AUDIT.map((c) => c.id));
  for (const m of main.matchAll(/this\.addCommand\(\{\s*id: '([^']+)'([\s\S]*?)\n    \}\);/g)) {
    if (/getActiveFile\(|getActiveViewOfType\(MarkdownView\)|restoreActiveNoteToLastCommit/.test(m[2])) {
      assert.ok(ids.has(m[1]), `command ${m[1]} reads the active note but has no audit decision`);
    }
  }
});

test('the restore header action passes the Beat Box\'s own file explicitly (does not rely on the active-file lookup)', () => {
  assert.match(view, /restoreNoteToLastCommit\(this\.app, this\.file\)/);
});
