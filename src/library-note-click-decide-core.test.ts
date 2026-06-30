// v0.2.206 — pure-core tests for the library-note click decision.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { decideLibraryNoteClick } from './library-note-click-decide-core.ts';

describe('decideLibraryNoteClick', () => {
  test('library note exists + no vault note → open-library-note', () => {
    const d = decideLibraryNoteClick('play_at_beats', false, true);
    assert.equal(d.action, 'open-library-note');
    assert.equal((d as any).chipName, 'play_at_beats');
  });

  test('vault note exists → defer to default (vault override wins)', () => {
    const d = decideLibraryNoteClick('play_at_beats', true, true);
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'vault-note-exists');
  });

  test('no chip match + no vault note → defer (Obsidian creates new)', () => {
    const d = decideLibraryNoteClick('newchip', false, false);
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'no-chip-match');
  });

  test('empty target → defer (defensive)', () => {
    const d = decideLibraryNoteClick('', false, true);
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'empty-target');
  });

  test('strips wikilink alias/heading before matching', () => {
    // `[[play_at_beats#args|the chip]]` should still resolve to the
    // bare `play_at_beats` chip.
    const d = decideLibraryNoteClick('play_at_beats#args|the chip', false, true);
    assert.equal(d.action, 'open-library-note');
    assert.equal((d as any).chipName, 'play_at_beats');
  });

  test('open-library-note carries shadowToCleanup=false by default', () => {
    // v0.2.212 — extended decision shape. When no vault shadow at all,
    // shadowToCleanup is explicitly false so the caller's cleanup
    // branch is unambiguously skipped.
    const d = decideLibraryNoteClick('play_at_beats', false, true);
    assert.equal(d.action, 'open-library-note');
    assert.equal((d as any).shadowToCleanup, false);
  });
});

describe('decideLibraryNoteClick — forensic-shadow heuristic (v0.2.212)', () => {
  test('forensic shadow + chip in catalog → open-library-note + shadowToCleanup=true', () => {
    // Empty `kick.md` at vault root — auto-created by Obsidian default
    // Cmd-click before v0.2.206 interceptor existed. Classifier says
    // forensic; caller should open LibraryNoteView AND trash the shadow.
    const d = decideLibraryNoteClick('kick', true, true, '');
    assert.equal(d.action, 'open-library-note');
    assert.equal((d as any).chipName, 'kick');
    assert.equal((d as any).shadowToCleanup, true);
  });

  test('forensic shadow with only matching heading → open-library-note', () => {
    const d = decideLibraryNoteClick('kick', true, true, '# kick\n');
    assert.equal(d.action, 'open-library-note');
    assert.equal((d as any).shadowToCleanup, true);
  });

  test('intentional shadow + chip in catalog → vault-note-exists (vault wins)', () => {
    // Cohort wrote real content under the chip name. Preserve.
    const d = decideLibraryNoteClick(
      'kick', true, true,
      '# kick\n\nWe use kick across forge-music.\n',
    );
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'vault-note-exists');
  });

  test('forensic shadow + chip NOT in catalog → vault-note-exists (defer; no engine alternative)', () => {
    // The shadow looks empty but there is no chip with this name. Fall
    // through to the original vault-wins rule (Obsidian opens the
    // existing empty file; no auto-cleanup since the cleanup decision
    // is gated on chip-exists in the caller).
    const d = decideLibraryNoteClick('orphan_basename', true, false, '');
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'vault-note-exists');
  });

  test('null raw content + chip + vault → vault wins (conservative when caller cannot read)', () => {
    // Caller couldn't read the file (vault adapter failure, etc.).
    // Default to vault-wins rather than guess.
    const d = decideLibraryNoteClick('kick', true, true, null);
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'vault-note-exists');
  });
});
