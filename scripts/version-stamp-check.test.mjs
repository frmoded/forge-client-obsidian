// Drain 2026-08-14-0300 §5(a) — release preflight: main.js's baked version
// stamp must match manifest.json's version.
//
// Trigger: v0.2.357 shipped a main.js stamped 0.2.356. manifest.json was
// bumped but `npm run build` never ran, so main.js was never regenerated,
// and nothing stopped the zip being built and published.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkVersionStamp } from './version-stamp-check.mjs';

const stamped = (v) =>
  `var x=1;\nexport const PLUGIN_VERSION_AT_BUILD = "${v}";\nvar y=2;\n`;

test('checkVersionStamp: mismatch is reported with both versions', () => {
  const r = checkVersionStamp({
    manifestVersion: '0.2.357',
    mainJsSource: stamped('0.2.356'),
  });
  assert.equal(r.ok, false);
  assert.equal(r.stampedVersion, '0.2.356');
  assert.match(r.message, /0\.2\.356/);
  assert.match(r.message, /0\.2\.357/);
  // Must tell the operator the remedy, not just that something is wrong.
  assert.match(r.message, /npm run build/);
});

test('checkVersionStamp: matching versions pass', () => {
  const r = checkVersionStamp({
    manifestVersion: '0.2.357',
    mainJsSource: stamped('0.2.357'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.stampedVersion, '0.2.357');
});

test('checkVersionStamp: an unstamped main.js fails rather than passing', () => {
  // A main.js with no stamp at all must NOT be treated as "no mismatch
  // found, therefore fine" — that is the silent-pass failure mode this
  // whole check exists to prevent.
  const r = checkVersionStamp({
    manifestVersion: '0.2.357',
    mainJsSource: 'var x=1;\n// no stamp here\n',
  });
  assert.equal(r.ok, false);
  assert.equal(r.stampedVersion, null);
  assert.match(r.message, /no .*version stamp|could not find/i);
});

test('checkVersionStamp: tolerates single quotes and spacing variations', () => {
  // esbuild may re-quote or re-space the constant when bundling; the check
  // must not become a no-op because the emitted form shifted.
  for (const src of [
    `export const PLUGIN_VERSION_AT_BUILD='0.2.357';`,
    `PLUGIN_VERSION_AT_BUILD  =  "0.2.357"`,
    `var PLUGIN_VERSION_AT_BUILD="0.2.357",b=2;`,
  ]) {
    const r = checkVersionStamp({ manifestVersion: '0.2.357', mainJsSource: src });
    assert.equal(r.ok, true, `should have matched: ${src}`);
  }
});

test('checkVersionStamp: missing manifest version is an error, not a pass', () => {
  const r = checkVersionStamp({
    manifestVersion: undefined,
    mainJsSource: stamped('0.2.357'),
  });
  assert.equal(r.ok, false);
});
