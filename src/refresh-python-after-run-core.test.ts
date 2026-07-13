// Drain 2530 — pure-core tests for the write-back gate.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { shouldRefreshPythonAfterRun } from './refresh-python-after-run-core.ts';

const FAKE_FILE = { path: 'forge-music/slow_burn/slow_burn.md' };

describe('shouldRefreshPythonAfterRun (drain 2530)', () => {
  it('successful run + caller opted in → fire the refresh', () => {
    assert.equal(shouldRefreshPythonAfterRun(200, FAKE_FILE), true);
  });

  it('successful run + caller did NOT opt in → skip', () => {
    // Other callers (forgeSnippet Forge-button flow) handle their
    // own write-back timing; only Cmd-P "Run only" passes a file
    // to trigger this refresh.
    assert.equal(shouldRefreshPythonAfterRun(200, undefined), false);
  });

  it('HTTP 400 (bad request) + caller opted in → skip refresh', () => {
    // Failed run — keep the note's # Python "out of date" so the
    // user has a visible signal that something went wrong.
    assert.equal(shouldRefreshPythonAfterRun(400, FAKE_FILE), false);
  });

  it('HTTP 422 (compute error) + caller opted in → skip refresh', () => {
    // Engine returned an execution failure (SnippetExecError); do
    // not clobber the # Python section.
    assert.equal(shouldRefreshPythonAfterRun(422, FAKE_FILE), false);
  });

  it('HTTP 500 (server error) + caller opted in → skip refresh', () => {
    assert.equal(shouldRefreshPythonAfterRun(500, FAKE_FILE), false);
  });

  it('null file → skip (treated same as undefined)', () => {
    assert.equal(shouldRefreshPythonAfterRun(200, null), false);
  });

  it('HTTP 200 exactly at the < 400 boundary → fire', () => {
    assert.equal(shouldRefreshPythonAfterRun(200, FAKE_FILE), true);
  });

  it('HTTP 399 → fire (edge case)', () => {
    assert.equal(shouldRefreshPythonAfterRun(399, FAKE_FILE), true);
  });
});
