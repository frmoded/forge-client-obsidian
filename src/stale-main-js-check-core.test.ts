// v0.2.131 — failing-first TDD tests for decideStaleMainJsCheck.
//
// Per the v0331 §3.3 split: the harness can't easily mock
// app.vault.adapter.read of manifest.json, so the structural
// decision lives in pure-core and the integration test deferral
// per v0.2.125 + v0.2.126 + v0.2.128 precedent. Pure-core covers
// the truth table; cohort smoke covers the I/O glue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideStaleMainJsCheck } from './stale-main-js-check-core.ts';

test('decideStaleMainJsCheck: matching versions → stale:false', () => {
  const r = decideStaleMainJsCheck('0.2.131', '0.2.131');
  assert.equal(r.stale, false);
});

test('decideStaleMainJsCheck: manifest ahead of build (THE cohort regression) → stale:true', () => {
  // The exact shape the driver hit: BRAT updated manifest.json
  // to 0.2.127 but kept the pre-v0.2.108 main.js.
  const r = decideStaleMainJsCheck('0.2.127', '0.2.107');
  assert.equal(r.stale, true);
  if (r.stale) {
    assert.equal(r.manifestVersion, '0.2.127');
    assert.equal(r.buildVersion, '0.2.107');
    assert.match(r.noticeMessage, /stale main\.js detected/);
    assert.match(r.noticeMessage, /0\.2\.127/);
    assert.match(r.noticeMessage, /0\.2\.107/);
    assert.match(r.noticeMessage, /Reinstall via BRAT/);
  }
});

test('decideStaleMainJsCheck: build ahead of manifest → stale:true', () => {
  // Pre-release / dev-install state where main.js was rebuilt
  // but manifest wasn't bumped. Still a stale-check failure.
  const r = decideStaleMainJsCheck('0.2.130', '0.2.131');
  assert.equal(r.stale, true);
});

test('decideStaleMainJsCheck: null manifest → stale:true with <missing>', () => {
  const r = decideStaleMainJsCheck(null, '0.2.131');
  assert.equal(r.stale, true);
  if (r.stale) {
    assert.equal(r.manifestVersion, '<missing>');
    assert.equal(r.buildVersion, '0.2.131');
  }
});

test('decideStaleMainJsCheck: undefined build → stale:true with <missing>', () => {
  // Defensive: if the generated module wasn't built, the
  // self-check surfaces it instead of false-passing.
  const r = decideStaleMainJsCheck('0.2.131', undefined);
  assert.equal(r.stale, true);
  if (r.stale) {
    assert.equal(r.buildVersion, '<missing>');
  }
});

test('decideStaleMainJsCheck: both null → stale:true', () => {
  const r = decideStaleMainJsCheck(null, null);
  assert.equal(r.stale, true);
});

test('decideStaleMainJsCheck: empty strings → stale:true', () => {
  const r = decideStaleMainJsCheck('', '');
  assert.equal(r.stale, true);
});

test('decideStaleMainJsCheck: whitespace-only manifest → stale:true (treats trim as empty)', () => {
  const r = decideStaleMainJsCheck('   ', '0.2.131');
  assert.equal(r.stale, true);
});

test('decideStaleMainJsCheck: leading/trailing whitespace tolerated on match', () => {
  // Defensive against JSON parsers that leave whitespace.
  const r = decideStaleMainJsCheck('  0.2.131  ', '0.2.131');
  assert.equal(r.stale, false);
});

test('decideStaleMainJsCheck: notice text mentions specific reinstall steps', () => {
  const r = decideStaleMainJsCheck('0.2.127', '0.2.107');
  assert.equal(r.stale, true);
  if (r.stale) {
    assert.match(r.noticeMessage, /BRAT.*Re-install/);
    assert.match(r.noticeMessage, /toggle.*off.*on/);
  }
});
