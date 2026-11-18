// 2026-11-18 (R1, item 4) - the relative-time formatter at its boundaries (0 s, 59 s, 60 s, 119 s, 59 min, 60 min, 23 h, 24 h, 48 h, the future), the units after a day, and what an old entry without a timestamp shows.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS, TICK_MS, relativeTime } from './relative-time-core.ts';

const NOW = 1_800_000_000_000;
const ago = (ms: number): string => relativeTime(NOW - ms, NOW);

test('the boundaries the driver named: 0 s, 59 s, 60 s, 119 s', () => {
  assert.equal(ago(0), 'just now');
  assert.equal(ago(59 * SECOND_MS), 'just now');
  assert.equal(ago(60 * SECOND_MS), '1 minute ago');
  assert.equal(ago(119 * SECOND_MS), '1 minute ago');
  assert.equal(ago(120 * SECOND_MS), '2 minutes ago');
  assert.equal(ago(7 * MINUTE_MS + 20 * SECOND_MS), '7 minutes ago');
});
test('59 min, 60 min, 23 h, 24 h, 48 h', () => {
  assert.equal(ago(59 * MINUTE_MS), '59 minutes ago');
  assert.equal(ago(59 * MINUTE_MS + 59 * SECOND_MS), '59 minutes ago');
  assert.equal(ago(60 * MINUTE_MS), '1 hour ago');
  assert.equal(ago(119 * MINUTE_MS), '1 hour ago');
  assert.equal(ago(2 * HOUR_MS), '2 hours ago');
  assert.equal(ago(23 * HOUR_MS), '23 hours ago');
  assert.equal(ago(24 * HOUR_MS - 1), '23 hours ago');
  assert.equal(ago(24 * HOUR_MS), 'yesterday');
  assert.equal(ago(47 * HOUR_MS + 59 * MINUTE_MS), 'yesterday');
  assert.equal(ago(48 * HOUR_MS), '2 days ago');
});
test('a timestamp in the future clamps to "just now" (a clock that moved back, a log restored from another machine)', () => {
  assert.equal(relativeTime(NOW + 1, NOW), 'just now');
  assert.equal(relativeTime(NOW + 5 * DAY_MS, NOW), 'just now');
});
test('longer ago: days, months, years, singular and plural', () => {
  assert.equal(ago(29 * DAY_MS), '29 days ago');
  assert.equal(ago(30 * DAY_MS), '1 month ago');
  assert.equal(ago(75 * DAY_MS), '2 months ago');
  assert.equal(ago(365 * DAY_MS), '1 year ago');
  assert.equal(ago(800 * DAY_MS), '2 years ago');
});
test('an old entry that never had a time shows nothing (no counter), and so does a value that is not a time', () => {
  for (const bad of [0, -5, NaN, Infinity, undefined as unknown as number, '12' as unknown as number, null as unknown as number]) assert.equal(relativeTime(bad, NOW), '', String(bad));
  assert.equal(relativeTime(NOW, NaN), '');
});
test('CONTROL: the formatter can fail (the same entry reads differently as time passes)', () => {
  assert.notEqual(relativeTime(NOW, NOW), relativeTime(NOW, NOW + 3 * HOUR_MS));
});
test('the recount interval is 30 s (one timer per tab)', () => { assert.equal(TICK_MS, 30_000); });
