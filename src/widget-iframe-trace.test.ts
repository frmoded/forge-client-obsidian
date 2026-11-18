// 2026-11-17-2100 - CCQA found three "Not allowed to load local resource: blob:app://obsidian.md/<uuid>" console lines on a first start (no startup snapshot) and on a window brought forward. They could not be reproduced outside Obsidian
// (13 scenarios in headless Chrome: lazy offscreen, display:none, revoke before and after attach, reload after revoke, an opaque-origin widget fetching, framing or navigating to an app blob: none prints that message; Chromium only
// defers CROSS-origin iframes, so loading="lazy" never delays a same-origin blob iframe). So this drain ships EVIDENCE, not a guess: every widget blob and its iframe leaves Info-level `[forge-widget]` lines (the first 8 characters of
// the blob's uuid, which is what the console error names; never the widget's content), at creation, attach, load and revoke (with whether the iframe was still in the document when its blob was revoked). A CCQA first start then
// matches each error's uuid to the code that made and revoked it. The behaviour of the iframe is NOT changed (the 1000 order test still pins sandbox, src, attach).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createSandboxedWidgetIframe, releaseWidgetBlob, blobId } from './widget-iframe-core.ts';

const BLOB = 'blob:app://obsidian.md/720d0fb8-bb93-45c6-b23a-e46f6bd990ff';
(globalThis as { URL: typeof URL }).URL.createObjectURL = () => BLOB;
const revoked: string[] = [];
(globalThis as { URL: typeof URL }).URL.revokeObjectURL = (u: string) => { revoked.push(u); };

function fakeDom() {
  const listeners: Record<string, Array<() => void>> = {};
  const iframe: any = {
    className: '', style: {}, isConnected: false,
    sandbox: { add: () => {} }, setAttribute: () => {}, set src(_v: string) {}, get src() { return ''; },
    addEventListener: (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn); },
  };
  const parent: any = { ownerDocument: { createElement: () => iframe }, appendChild: (el: any) => { el.isConnected = true; return el; } };
  return { parent, iframe, fire: (type: string) => (listeners[type] ?? []).forEach((f) => f()) };
}

test('blobId is the first 8 characters of the uuid of a blob URL (what the console error names), and never anything else of the URL', () => {
  assert.equal(blobId(BLOB), '720d0fb8');
  assert.equal(blobId('blob:null/ABCDEF12-0000'), 'ABCDEF12');
  assert.equal(blobId('not a blob url'), 'unknown');
});

test('creating a widget iframe traces: the blob, the iframe attached (in the document or not), and its load; the labels name the caller; the widget\'s own content is never in a line', () => {
  const lines: string[] = []; const { parent, fire } = fakeDom();
  createSandboxedWidgetIframe(parent, '<p>SECRET-WIDGET-CONTENT</p>', '100px', { label: 'scales/resources/html/scale_player.html', trace: (l) => lines.push(l) });
  assert.deepEqual(lines, ['[forge-widget] blob 720d0fb8 created for scales/resources/html/scale_player.html (28 chars)', '[forge-widget] iframe 720d0fb8 attached (in the document: true)']);
  fire('load'); assert.equal(lines[2], '[forge-widget] iframe 720d0fb8 loaded');
  for (const l of lines) assert.doesNotMatch(l, /SECRET-WIDGET-CONTENT|app:\/\/obsidian\.md/, 'no content, no full URL');
});

test('an iframe attached to a parent that is NOT in the document yet says so (the case where the load waits for the page to insert it)', () => {
  const lines: string[] = []; const { iframe } = fakeDom();
  const parent: any = { ownerDocument: { createElement: () => iframe }, appendChild: (el: any) => el };           // does not connect
  createSandboxedWidgetIframe(parent, '<p>w</p>', '10px', { trace: (l) => lines.push(l) });
  assert.match(lines[0], /for widget \(/); assert.equal(lines[1], '[forge-widget] iframe 720d0fb8 attached (in the document: false)');
});

test('releasing a blob revokes it and traces who asked and whether the iframe was still in the document: the fact that tells a revoked-but-still-shown iframe from a clean release', () => {
  revoked.length = 0; const lines: string[] = [];
  releaseWidgetBlob(BLOB, 'rhythm embed unloaded', { trace: (l) => lines.push(l), iframe: { isConnected: true } as unknown as HTMLElement });
  releaseWidgetBlob(BLOB, 'plugin unload', { trace: (l) => lines.push(l) });
  assert.deepEqual(revoked, [BLOB, BLOB]);
  assert.deepEqual(lines, ['[forge-widget] blob 720d0fb8 revoked (rhythm embed unloaded; its iframe is still in the document: true)', '[forge-widget] blob 720d0fb8 revoked (plugin unload)']);
});

test('with no options nothing changes for the caller: no throw, the blob URL and the iframe come back as before, the default trace is console.info (never warn or error: strict consoles stay clean)', () => {
  const infos: string[] = []; const orig = { info: console.info, warn: console.warn, error: console.error };
  console.info = (...a: unknown[]) => { infos.push(a.join(' ')); }; console.warn = () => { throw new Error('warn'); }; console.error = () => { throw new Error('error'); };
  try { const { parent, iframe } = fakeDom(); const r = createSandboxedWidgetIframe(parent, '<p>w</p>', '10px'); assert.equal(r.blobUrl, BLOB); assert.equal(r.iframe as unknown, iframe); releaseWidgetBlob(BLOB, 'x'); }
  finally { console.info = orig.info; console.warn = orig.warn; console.error = orig.error; }
  assert.ok(infos.length >= 3 && infos.every((l) => l.startsWith('[forge-widget] ')), infos.join('\n'));
});

// ---- wiring: every place that makes or revokes a widget blob uses the traced calls (a mechanism pin: it says so) ------------------------------------------------------------------------------
const src = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
test('WIRING (a mechanism pin): the three callers name their widget in the creation call, and the three revoke sites go through releaseWidgetBlob (no bare URL.revokeObjectURL left for a widget blob)', () => {
  assert.match(src('html-embed-view.ts'), /createSandboxedWidgetIframe\(el, html, `\$\{parsed\.heightPx\}px`, \{ label: parsed\.path \}\)/);
  assert.match(src('rhythm-embed-view.ts'), /createSandboxedWidgetIframe\(this\.bodyEl, widget\.html, `\$\{heightPx\}px`, \{ label: RHYTHM_BOX_WIDGET_PATH \}\)/);
  assert.match(src('rhythm-edit-view.ts'), /createSandboxedWidgetIframe\(this\.contentEl, html, '100%', \{ label: /);
  for (const f of ['html-embed-view.ts', 'rhythm-embed-view.ts', 'rhythm-edit-view.ts']) {
    const text = src(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(text, /URL\.revokeObjectURL/, `${f}: a widget blob is revoked through releaseWidgetBlob`);
    assert.match(text, /releaseWidgetBlob\(/, `${f}: releases through releaseWidgetBlob`);
  }
  assert.match(src('rhythm-embed-view.ts'), /releaseWidgetBlob\(this\.blobUrl, [^)]*iframe: this\.iframe/);
  assert.match(src('rhythm-edit-view.ts'), /releaseWidgetBlob\(this\.blobUrl, [^)]*iframe: this\.iframe/);
});
