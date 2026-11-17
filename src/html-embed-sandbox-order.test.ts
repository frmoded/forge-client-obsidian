// 2026-11-17-1000 (CCQA console finding): a widget iframe must be SANDBOXED when it first navigates. In real Chrome an iframe that is attached and given its `src` BEFORE
// `sandbox` is added loads the blob widget UNSANDBOXED (measured: origin = the app's, parent.document reachable, localStorage usable); the sandbox attribute only governs the NEXT
// navigation. So createSandboxedWidgetIframe must build the iframe detached, set sandbox (and the other attributes) first, then src, and attach last.
// The test calls the production function with a recording DOM (not a simulation of the order: the order IS what is asserted) and a real-Chrome probe backs it (scripts/dev/scratch).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSandboxedWidgetIframe } from './widget-iframe-core.ts';

function recordingParent() {
  const ops: string[] = [];
  const style: Record<string, string> = {};
  const iframe = {
    className: '',
    style,
    sandbox: { add: (flag: string) => { ops.push(`sandbox+${flag}`); } },
    setAttribute: (name: string, value: string) => { ops.push(`attr ${name}=${value}`); },
    set src(v: string) { ops.push('src'); },
    get src() { return ''; },
  };
  const parent = {
    ownerDocument: { createElement: (tag: string) => { ops.push(`create ${tag}`); return iframe; } },
    appendChild: (el: unknown) => { ops.push('attach'); return el; },
    // Obsidian's createEl creates AND attaches in one call: using it means the iframe is live before it is configured.
    createEl: (tag: string) => { ops.push(`createEl ${tag} (attached now)`); return iframe; },
  };
  return { parent, iframe, ops };
}

(globalThis as { URL: typeof URL }).URL.createObjectURL ??= () => 'blob:test-url';

test('the widget iframe has its sandbox BEFORE its src is set, and is attached only after both (so the first navigation is already sandboxed)', () => {
  const { parent, ops } = recordingParent();
  createSandboxedWidgetIframe(parent as unknown as HTMLElement, '<p>w</p>', '120px');
  const at = (what: string) => ops.findIndex((o) => o === what || o.startsWith(what));
  assert.ok(at('sandbox+allow-scripts') >= 0, `the sandbox flag is set: ${ops.join(' | ')}`);
  assert.ok(at('src') >= 0, `the src is set: ${ops.join(' | ')}`);
  assert.ok(at('sandbox+allow-scripts') < at('src'), `sandbox before src: ${ops.join(' | ')}`);
  const attach = ops.findIndex((o) => o === 'attach' || o.startsWith('createEl'));
  assert.ok(attach >= 0, 'the iframe is attached');
  assert.ok(attach > at('src'), `attached only after src and sandbox (a lazy or attached iframe navigates at once): ${ops.join(' | ')}`);
  assert.ok(!ops.some((o) => o.startsWith('createEl')), 'createEl attaches immediately: not used for the widget iframe');
});

test('only allow-scripts, and the attributes the embed always had (loading lazy, no referrer), all set before the iframe is attached', () => {
  const { parent, ops } = recordingParent();
  const { iframe } = createSandboxedWidgetIframe(parent as unknown as HTMLElement, '<p>w</p>', '120px') as unknown as { iframe: { className: string; style: Record<string, string> } };
  assert.deepEqual(ops.filter((o) => o.startsWith('sandbox+')), ['sandbox+allow-scripts'], 'no wider flag, never allow-same-origin');
  assert.ok(ops.includes('attr loading=lazy') && ops.includes('attr referrerpolicy=no-referrer'));
  const attach = ops.indexOf('attach');
  for (const o of ops.filter((x) => x.startsWith('attr '))) assert.ok(ops.indexOf(o) < attach, `${o} is set before the iframe is attached`);
  assert.equal(iframe.className, 'forge-html-embed-iframe');
  assert.equal(iframe.style.height, '120px');
});

test('the blob URL is returned for the caller to revoke, and the iframe is the one that was configured', () => {
  const { parent, iframe } = recordingParent();
  const r = createSandboxedWidgetIframe(parent as unknown as HTMLElement, '<p>w</p>', '50%');
  assert.equal(r.iframe as unknown, iframe);
  assert.equal(typeof r.blobUrl, 'string');
});
