// 2026-10-23-0030 — the ONE answer to "does a click on an engraved note start playback here?": yes everywhere except a score-first vault. It reads the published profile flag (messageDelivery, the same
// flag the Forge output panel reads), at the moment of the click.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scoreClickPlays } from './score-click-policy.ts';
import { messageDelivery } from './score-first-messages-core.ts';

test('P3: outside a score-first vault (the flag is off, as it is until score-first.ts publishes it) a click plays', () => {
  messageDelivery.resetForTests();
  assert.equal(messageDelivery.isScoreFirst(), false);
  assert.equal(scoreClickPlays(), true);
});

test('in a score-first vault a click does not play, and the answer follows the flag live', () => {
  messageDelivery.resetForTests();
  messageDelivery.setScoreFirst(true);
  assert.equal(scoreClickPlays(), false);
  messageDelivery.setScoreFirst(false);
  assert.equal(scoreClickPlays(), true, 'a forge.toml that stops declaring the profile turns it off at once, like everything else that documents it');
  messageDelivery.resetForTests();
});
