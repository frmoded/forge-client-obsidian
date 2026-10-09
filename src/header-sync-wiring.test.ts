// Drain 2026-10-09-2200: wiring pins for the header-action sync in main.ts (the Obsidian-coupled half; the decisions are in
// header-sync-core.ts and tested with a fake workspace). They read the shipped source, comments stripped.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const main = code(read('src/main.ts'));
const core = code(read('src/header-sync-core.ts'));
const syncBody = /  syncButtons\(target\?: MarkdownView\) \{[\s\S]*?\n  \}\n/.exec(main)![0];

test('onload installs the coalesced header sync through installHeaderSync, wired to workspace, metadataCache and layout-ready', () => {
  assert.match(main, /const headerSync = installHeaderSync\(\{\s*onWorkspace: \(ev, fn\) => \{\s*this\.registerEvent\(this\.app\.workspace\.on\(ev as 'layout-change', fn\)\);/);
  assert.match(main, /onMetadata: \(ev, fn\) => \{\s*this\.registerEvent\(this\.app\.metadataCache\.on\(ev as 'changed', fn\)\);/);
  assert.match(main, /onLayoutReady: \(fn\) => \{ this\.app\.workspace\.onLayoutReady\(fn\); \},/);
  assert.match(main, /sync: \(\) => this\.syncAllHeaderActions\(\),/);
  assert.match(main, /this\.register\(\(\) => headerSync\.dispose\(\)\);/);
});

test('the subscribed event set is exactly: layout-change, active-leaf-change, file-open (workspace) and resolved, changed (metadataCache)', () => {
  assert.match(core, /export const HEADER_SYNC_WORKSPACE_EVENTS = \['layout-change', 'active-leaf-change', 'file-open'\] as const;/);
  assert.match(core, /export const HEADER_SYNC_METADATA_EVENTS = \['resolved', 'changed'\] as const;/);
  assert.match(core, /for \(const ev of events\.workspace\) host\.onWorkspace\(ev, \(\) => scheduler\.request\(\)\);/);
  assert.match(core, /for \(const ev of events\.metadata\) host\.onMetadata\(ev, \(\) => scheduler\.request\(\)\);/);
  assert.match(core, /host\.onLayoutReady\(\(\) => \{\s*scheduler\.runNow\(\);\s*scheduler\.request\(\);\s*for \(const ms of HEADER_SYNC_CATCH_UP_MS\) catchUps\.push\(deps\.setTimer\(\(\) => scheduler\.runNow\(\), ms\)\);/);
  assert.match(core, /export const HEADER_SYNC_CATCH_UP_MS = \[300, 1200, 4000\] as const;/);
});

test('the sync walks EVERY open markdown view, skipping ones that are not loaded yet (a deferred leaf is picked up by the next event)', () => {
  assert.match(main, /private syncAllHeaderActions\(\): void \{\s*for \(const leaf of this\.app\.workspace\.getLeavesOfType\('markdown'\)\) \{\s*const v = leaf\.view;\s*if \(v instanceof MarkdownView\) this\.syncButtons\(v\);/);
});

test('idempotent: a view whose header is present and current is skipped; otherwise our actions are swept before being re-added (no duplicates)', () => {
  assert.match(syncBody, /if \(!needsHeaderSync\(\{ signature: sig, lastSignature: this\.headerSignatures\.get\(view\), actionsPresent: present \}\)\) return;/);
  assert.match(syncBody, /const present = view\.containerEl\.querySelector\(`\.\$\{RESTORE_BTN_CLASS\}`\) !== null;/);
  const guard = syncBody.indexOf('needsHeaderSync(');
  const sweep = syncBody.indexOf('.forEach(el => el.remove());');
  const firstAdd = syncBody.indexOf('view.addAction(');
  assert.ok(guard > 0 && sweep > guard && firstAdd > sweep, 'guard, then sweep, then add');
  assert.equal([...syncBody.matchAll(/RESTORE_BTN_CLASS\}`\s*\n?\s*\)\.forEach|\.forEach\(el => el\.remove\(\)\)/g)].length >= 1, true);
});

test('Restore and New Forge note stay UNGATED by type (the failure was not a gate evaluating false)', () => {
  const restore = /view\.addAction\(\s*'history'[\s\S]*?\);/.exec(syncBody)![0];
  const before = syncBody.slice(0, syncBody.indexOf(restore));
  assert.ok(!/if \(.*(forgeButtonShouldShow|edgesToggleShouldShow)/.test(before.slice(before.lastIndexOf('\n\n'))), 'restore is not inside a type gate');
  assert.match(syncBody, /const snippetBtn = view\.addAction\('file-plus', 'New Forge note'/);
  assert.ok(!/if \([^)]*\) \{\s*const snippetBtn/.test(syncBody));
});

test('the modify-debounced sync and the explicit mode-toggle syncs still exist (unchanged callers of syncButtons)', () => {
  assert.match(main, /this\.modifyDebounceTimer = window\.setTimeout\(\(\) => \{\s*this\.modifyDebounceTimer = null;\s*this\.syncButtons\(\);/);
});
