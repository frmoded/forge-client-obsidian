// CM6 integration — facet-copy extension. Drain 2026-07-23-1100
// (attempt 2). Per the CM6-extension HARD RULE: every new CM6
// extension mounts against createIntegrationHarness() and asserts
// behavior through the real EditorView, not just the pure core.
//
// happy-dom's ClipboardEvent carries no clipboardData, so the copy
// event is synthesized as a plain Event with a stubbed clipboardData —
// the handler reads only setData/preventDefault, which the stub
// provides. What this proves that the unit tests cannot: the handler
// actually RECEIVES the event through CM6's domEventHandlers plumbing
// on contentDOM, reads the live EditorState selection, and
// preventDefaults. What it cannot prove: that Obsidian's own copy
// handler yields — that is the one L43-rehearsal-only invariant,
// flagged in FEEDBACK.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorSelection } from '@codemirror/state';
import { createIntegrationHarness } from './test-helpers/cm6-harness.ts';
import {
  makeFacetCopyExtension,
  isLivePreviewView,
} from './facet-copy-view-extension.ts';

const V2A_DOC = [
  '---',
  'type: action',
  '---',
  '',
  '# Description',
  '',
  'Say hello.',
  '',
  '# Recipe',
  '',
  'Return "hello".',
  '',
].join('\n');

const PLAIN_DOC = 'Just a plain note.\nNo frontmatter, no facets.\n';

interface CapturedClipboard {
  data: Record<string, string>;
  prevented: boolean;
}

/** Dispatch a synthetic `copy` event at the view's contentDOM and
 *  report what the handler wrote. */
function fireCopy(view: { contentDOM: HTMLElement }): CapturedClipboard {
  const captured: CapturedClipboard = { data: {}, prevented: false };
  // The Event constructor must come from the SAME happy-dom realm the
  // editor lives in — happy-dom's dispatchEvent rejects Node's own
  // global Event class.
  const win = view.contentDOM.ownerDocument.defaultView as unknown as {
    Event: typeof Event;
  };
  const event = new win.Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      setData(type: string, value: string) { captured.data[type] = value; },
      getData() { return ''; },
    },
  });
  const origPrevent = event.preventDefault.bind(event);
  Object.defineProperty(event, 'preventDefault', {
    value: () => { captured.prevented = true; origPrevent(); },
  });
  view.contentDOM.dispatchEvent(event);
  return captured;
}

function selectSpan(doc: string, needle: string) {
  const from = doc.indexOf(needle);
  assert.ok(from >= 0);
  return EditorSelection.single(from, from + needle.length);
}

test('CM6 integration: copy over Recipe body writes augmented text/plain + preventDefault', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2A_DOC, [makeFacetCopyExtension(() => true)]);
    await harness.flush();
    view.dispatch({ selection: selectSpan(V2A_DOC, 'Return "hello".') });

    const got = fireCopy(view);
    assert.equal(got.prevented, true, 'default copy suppressed');
    assert.equal(got.data['text/plain'], '# Recipe\n\nReturn "hello".');
    assert.ok(!('text/html' in got.data), 'plain-only by design (rationale in FEEDBACK)');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: Cmd-A shaped selection round-trips the source byte-for-byte', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2A_DOC, [makeFacetCopyExtension(() => true)]);
    await harness.flush();
    view.dispatch({ selection: EditorSelection.single(0, view.state.doc.length) });

    const got = fireCopy(view);
    assert.equal(got.prevented, true);
    assert.equal(got.data['text/plain'], view.state.doc.toString());
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: empty selection falls through (no setData, no preventDefault)', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2A_DOC, [makeFacetCopyExtension(() => true)]);
    await harness.flush();
    // Fresh mount: cursor at 0, empty selection.
    const got = fireCopy(view);
    assert.equal(got.prevented, false);
    assert.deepEqual(got.data, {});
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: non-V2a note falls through even with a selection', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(PLAIN_DOC, [makeFacetCopyExtension(() => true)]);
    await harness.flush();
    view.dispatch({ selection: selectSpan(PLAIN_DOC, 'plain note') });

    const got = fireCopy(view);
    assert.equal(got.prevented, false, 'default copy untouched on plain markdown');
    assert.deepEqual(got.data, {});
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: ineligible view (not Live Preview) falls through', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2A_DOC, [makeFacetCopyExtension(() => false)]);
    await harness.flush();
    view.dispatch({ selection: selectSpan(V2A_DOC, 'Say hello.') });

    const got = fireCopy(view);
    assert.equal(got.prevented, false);
    assert.deepEqual(got.data, {});
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: the DEFAULT eligibility predicate keys off Obsidian DOM classes', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2A_DOC, [makeFacetCopyExtension()]);
    await harness.flush();

    // No Obsidian ancestor → not eligible.
    assert.equal(isLivePreviewView(view), false);

    // Wrap the editor in Obsidian's Live Preview container classes.
    const doc = view.dom.ownerDocument;
    const wrap = doc.createElement('div');
    wrap.className = 'markdown-source-view is-live-preview';
    view.dom.parentElement?.insertBefore(wrap, view.dom);
    wrap.appendChild(view.dom);
    assert.equal(isLivePreviewView(view), true);

    // And the handler now fires end-to-end through the default gate.
    view.dispatch({ selection: selectSpan(V2A_DOC, 'Return "hello".') });
    const got = fireCopy(view);
    assert.equal(got.prevented, true);
    assert.equal(got.data['text/plain'], '# Recipe\n\nReturn "hello".');

    // Source mode (same container, no is-live-preview) falls through.
    wrap.className = 'markdown-source-view';
    const got2 = fireCopy(view);
    assert.equal(got2.prevented, false);
  } finally {
    harness.destroy();
  }
});
