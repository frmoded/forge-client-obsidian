// CW-chip-drift-diagnostic tests. Verify the regex parser handles:
//   - both music + moda dicts
//   - comment lines (# v0.7.0 — ...)
//   - blank lines
//   - mixed whitespace
//   - version-drift scenarios (e.g. old executor without walking_bass_line)

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  formatChipInventoryFull,
  formatChipInventorySummary,
  parseChipInventory,
} from './chip-inventory-core.ts';

const V0_2_296_SHAPED_SOURCE = `
try:
  from forge.music import lib as _music_lib
  _FORGE_MUSIC_LIB_NAMES = {
    "bar": _music_lib.bar,
    "voices": _music_lib.voices,
    "voices_canonical": _music_lib.voices_canonical,
    # v2-spike — V2 high-level chips per v2-spec §16
    "play_at_beats": _music_lib.play_at_beats,
    # v0.7.0 — forge-music library notes promoted from engineer-mode
    "form": _music_lib.form,
    "drums_shuffle": _music_lib.drums_shuffle,
    # Drain 2026-07-10-1400 phase 1
    "walking_bass_line": _music_lib.walking_bass_line,
  }
except ImportError:
  _FORGE_MUSIC_LIB_NAMES = {}

try:
  from forge.moda import lib as _moda_lib
  _FORGE_MODA_LIB_NAMES = {
    "temperature_to_speed": _moda_lib.temperature_to_speed,
    "create_chamber": _moda_lib.create_chamber,
    "tick_range": _moda_lib.tick_range,
  }
except ImportError:
  _FORGE_MODA_LIB_NAMES = {}
`;

const V0_2_239_SHAPED_SOURCE = `
try:
  from forge.music import lib as _music_lib
  _FORGE_MUSIC_LIB_NAMES = {
    "bar": _music_lib.bar,
    "voices": _music_lib.voices,
    "voices_canonical": _music_lib.voices_canonical,
    "form": _music_lib.form,
    "drums_shuffle": _music_lib.drums_shuffle,
  }
except ImportError:
  _FORGE_MUSIC_LIB_NAMES = {}
`;

describe('parseChipInventory', () => {
  it('extracts both music + moda chip names from a v0.2.296-shaped executor', () => {
    const inv = parseChipInventory(V0_2_296_SHAPED_SOURCE);
    assert.deepEqual(inv.music, [
      'bar',
      'voices',
      'voices_canonical',
      'play_at_beats',
      'form',
      'drums_shuffle',
      'walking_bass_line',
    ]);
    assert.deepEqual(inv.moda, [
      'temperature_to_speed',
      'create_chamber',
      'tick_range',
    ]);
  });

  it('ignores comment lines and blank lines in the dict body', () => {
    const inv = parseChipInventory(V0_2_296_SHAPED_SOURCE);
    // Comments in the source above should NOT appear as chip names.
    assert.equal(inv.music.includes('v2-spike'), false);
    assert.equal(inv.music.includes('v0'), false);
    assert.equal(inv.music.includes('Drain'), false);
  });

  it('returns an empty array for a domain whose dict is not present', () => {
    const musicOnly = `
      _FORGE_MUSIC_LIB_NAMES = {
        "bar": _music_lib.bar,
      }
    `;
    const inv = parseChipInventory(musicOnly);
    assert.deepEqual(inv.music, ['bar']);
    assert.deepEqual(inv.moda, []);
  });

  it('returns empty arrays for empty source', () => {
    const inv = parseChipInventory('');
    assert.deepEqual(inv.music, []);
    assert.deepEqual(inv.moda, []);
  });

  it('catches version drift: v0.2.239-shaped source lacks walking_bass_line', () => {
    // Regression lock: the CW-f-shuffle-runtime-namerror scenario.
    // The v0.2.239 executor's chip dict has form/drums_shuffle but not
    // walking_bass_line. Parsing must reflect that — the whole point
    // of this diagnostic is to make the gap visible.
    const inv = parseChipInventory(V0_2_239_SHAPED_SOURCE);
    assert.equal(inv.music.includes('form'), true);
    assert.equal(inv.music.includes('drums_shuffle'), true);
    assert.equal(inv.music.includes('walking_bass_line'), false);
  });
});

describe('formatChipInventorySummary', () => {
  it('formats a compact one-line summary', () => {
    const summary = formatChipInventorySummary({
      music: ['a', 'b', 'c'],
      moda: ['x', 'y'],
    });
    assert.equal(summary, 'music: 3 chips, moda: 2 chips');
  });

  it('handles empty domains', () => {
    const summary = formatChipInventorySummary({ music: [], moda: [] });
    assert.equal(summary, 'music: 0 chips, moda: 0 chips');
  });
});

describe('formatChipInventoryFull', () => {
  it('emits a two-domain multi-line dump', () => {
    const full = formatChipInventoryFull({
      music: ['bar', 'voices'],
      moda: ['tick_range'],
    });
    assert.equal(
      full,
      'music (2):\n  bar, voices\nmoda (1):\n  tick_range',
    );
  });
});
