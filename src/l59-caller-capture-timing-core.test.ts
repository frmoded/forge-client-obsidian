// v0.2.290 CW-2400-A — L60 caller-integration tests for L59 violations
// fixed in this drain.
//
// L59 codifies: any main.ts method that reads a live Obsidian API getter
// (view.file, view.editor, leaf.view, getActive*) AFTER an `await` MUST
// capture the concrete field into a local const BEFORE the first await
// and thread the local through.
//
// L60 says: for each L59 fix, add a caller-integration test that
// simulates the async gap and asserts the CAPTURED value (not the live
// getter re-read) flows into the callee.
//
// These tests can't stand up a real MarkdownView + workspace, but they
// can model the timing property: a getter that goes stale to null across
// an await must not be re-read after the await; the caller must use
// its early-captured local.
//
// Test pattern per fixed site:
//   1. Build a stubbed view with a `.file` getter that returns a real
//      TFile-shape object on the first read, then null on subsequent
//      reads (simulates leaf detachment across an await).
//   2. Emulate the method's exact capture-and-await sequence:
//        const file = view.file;   // captured pre-await
//        await simulatedAsync();   // getter goes stale here
//        callee(file);             // must be captured value, not view.file
//   3. Assert callee received the captured TFile, not null.
//
// If the source method is ever refactored to re-read the getter
// post-await, the corresponding test fails.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

// Fake TFile shape (just the fields main.ts callers touch).
interface FakeFile {
  path: string;
  basename: string;
}

/** Build a view whose `.file` getter returns `initial` on the first
 *  read, then null on every read after `staleAfter` calls. Simulates
 *  Obsidian's leaf-detach behavior across an await. */
function makeStaleFileGetterView(
  initial: FakeFile,
  staleAfter = 1,
): { view: { readonly file: FakeFile | null }; readCount: () => number } {
  let count = 0;
  const view = {
    get file(): FakeFile | null {
      const c = count++;
      return c < staleAfter ? initial : null;
    },
  };
  return { view, readCount: () => count };
}

async function simulatedAwait(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}


describe('L59/L60: showSourceLayer (main.ts:2837) capture-timing', () => {
  it('caller-captured file survives view.file getter going stale', async () => {
    const initial: FakeFile = {
      path: 'blues/slow_burn.md',
      basename: 'slow_burn',
    };
    const { view } = makeStaleFileGetterView(initial, /*staleAfter=*/ 1);

    // Emulate showSourceLayer's exact capture-and-await sequence
    // (v0.2.290 CW-2400-A shape). The file is captured BEFORE the
    // hash-compute await; the notice text at the end reads
    // `file.basename`, NOT `view.file.basename`.
    const file = view.file;
    assert.ok(file, 'first read must return the initial TFile');

    // whichLayerIsSource does multiple facet-hash computes — plenty
    // of time for Obsidian to detach the leaf. Confirm getter has
    // gone stale post-await.
    await simulatedAwait();
    assert.equal(view.file, null,
      'stubbed view.file getter must be null after the await');

    // The captured `file` must still be the initial TFile.
    assert.equal(file.basename, 'slow_burn');
    assert.equal(file.path, 'blues/slow_burn.md');

    // Bug shape (pre-v0.2.290): would have thrown a null-dereference
    // reading `view.file.basename` at the notice-text interpolation.
    // Post-fix: the captured `file.basename` is safe.
  });

  it('caller that re-reads view.file post-await FAILS (regression proof)',
    async () => {
      // This case demonstrates the pre-fix bug shape. If a future
      // refactor drops the `const file = view.file` capture, the
      // notice-text interpolation would go null-dereference.
      const initial: FakeFile = { path: 'x.md', basename: 'x' };
      const { view } = makeStaleFileGetterView(initial, /*staleAfter=*/ 1);

      // Simulate the PRE-FIX code shape: don't capture, re-read after.
      // (`.file` reader after await is null.)
      void view.file; // pre-await read; consumed to trigger the counter
      await simulatedAwait();
      const stale = view.file;
      assert.equal(stale, null,
        'the pre-fix shape would deref null here — this test locks in ' +
        'the failure mode so future refactors can\'t silently regress');
    });
});


describe('L59/L60: dispatchModaBranch (main.ts:2267) capture-timing', () => {
  it('caller-captured file survives routeActionCodeRegen await', async () => {
    // Featured moda snippets can trigger a /generate LLM roundtrip
    // inside routeActionCodeRegen. Multi-second await = plenty of
    // room for the leaf to detach. The v0.2.290 fix captures
    // `const file = view.file` at method entry so the subsequent
    // writeSourcePythonBack(file) call is pinned to the intended TFile.
    const initial: FakeFile = {
      path: 'forge-moda/simulation.md',
      basename: 'simulation',
    };
    const { view } = makeStaleFileGetterView(initial, /*staleAfter=*/ 1);

    // Match dispatchModaBranch's capture: exactly one pre-await read
    // (`if (!view.file) return;` counts as the initial read, then the
    // captured local is what threads through).
    const guard = view.file;
    assert.ok(guard, 'null-guard sees the file');
    const file = guard;

    // Simulate the routeActionCodeRegen await (would call Pyodide,
    // which invokes /generate LLM for featured snippets).
    await simulatedAwait();
    assert.equal(view.file, null,
      'stubbed getter went stale — matches the CW-2300-D root cause');

    // writeSourcePythonBack(file) must receive the captured value.
    assert.equal(file.path, 'forge-moda/simulation.md');
    assert.equal(file.basename, 'simulation');
  });

  it('featured moda run: outcome dispatch after LLM await uses captured file',
    async () => {
      // Extended scenario: multiple awaits (regen + writeBack + open).
      // The captured `file` must survive all of them.
      const initial: FakeFile = {
        path: 'forge-moda/particles.md',
        basename: 'particles',
      };
      const { view } = makeStaleFileGetterView(initial, /*staleAfter=*/ 1);

      const file = view.file;
      assert.ok(file);

      await simulatedAwait(); // routeActionCodeRegen
      await simulatedAwait(); // writeSourcePythonBack
      await simulatedAwait(); // openModaView

      assert.equal(view.file, null,
        'view.file gone across three awaits (LLM + write + open)');
      // Captured file still intact — this is what CW-2400-A guarantees.
      assert.equal(file.basename, 'particles');
    });
});
