// v0.2.213 — pure-core tests for the CM6-aware click-target resolver.
// Uses lightweight DOM fixtures (constructed via Object literals
// matching the Element subset we need) so the test runs under node
// --test without JSDOM.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { resolveLibraryNoteClickTarget } from './library-note-click-target-core.ts';

/** Minimal Element-like fixture; covers the methods our pure-core uses. */
function makeEl(
  cls: string,
  attrs: Record<string, string> = {},
  textContent = '',
  parent: any = null,
): any {
  const el: any = {
    classList: new Set(cls.split(/\s+/).filter(Boolean)),
    _attrs: { ...attrs },
    textContent,
    parentElement: parent,
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(this._attrs, name)
        ? this._attrs[name]
        : null;
    },
    closest(selector: string): any {
      // Mini-selector that matches the patterns our pure-core uses:
      //   'a.internal-link', '.cm-hmd-internal-link', '.cm-link'
      // Walks up parent chain looking for a node matching the
      // selector's class.
      const matchClass = selector.startsWith('a.')
        ? selector.slice(2)
        : selector.startsWith('.')
          ? selector.slice(1)
          : selector;
      const tagOnly = selector.startsWith('a.') ? 'a' : null;
      let cur: any = this;
      while (cur) {
        const tagMatch = tagOnly ? cur.tagName === 'A' : true;
        if (tagMatch && cur.classList.has(matchClass)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
  };
  if (cls.startsWith('a ') || cls === 'a' || selectorIsAnchorClass(cls)) {
    el.tagName = 'A';
  }
  return el;
}

function selectorIsAnchorClass(cls: string): boolean {
  // We tag elements as anchors by callers naming them with 'internal-link'
  // intent; the test exercises that case via explicit tagName='A' set
  // below where needed.
  return false;
}

describe('resolveLibraryNoteClickTarget', () => {
  test('reading-mode anchor with data-href → resolved', () => {
    const el = makeEl('internal-link', { 'data-href': 'play_at_offsets' });
    el.tagName = 'A';
    const out = resolveLibraryNoteClickTarget(el);
    assert.ok(out);
    assert.equal(out!.bare, 'play_at_offsets');
    assert.equal(out!.href, 'play_at_offsets');
  });

  test('CM6 source-mode .cm-hmd-internal-link with data-href → resolved', () => {
    const el = makeEl('cm-hmd-internal-link', { 'data-href': 'kick' });
    const out = resolveLibraryNoteClickTarget(el);
    assert.ok(out);
    assert.equal(out!.bare, 'kick');
  });

  test('CM6 .cm-link without data-href but with textContent → resolved via text', () => {
    const el = makeEl('cm-link', {}, 'play_at_beats');
    const out = resolveLibraryNoteClickTarget(el);
    assert.ok(out);
    assert.equal(out!.bare, 'play_at_beats');
  });

  test('CM6 textContent with surrounding [[ ]] → stripped', () => {
    const el = makeEl('cm-link', {}, '[[snare]]');
    const out = resolveLibraryNoteClickTarget(el);
    assert.ok(out);
    assert.equal(out!.bare, 'snare');
  });

  test('click on inner text → walks up via closest()', () => {
    const link = makeEl('cm-hmd-internal-link', { 'data-href': 'kick' });
    const text = makeEl('cm-hmd-internal-link-text', {}, 'kick', link);
    // Walk-up: text's closest('cm-hmd-internal-link') is text itself
    // because text also carries the class in this fixture; ensure
    // the fixture matches Obsidian where the inner text doesn't carry
    // the parent's class.
    text.classList = new Set(['cm-hmd-internal-link-text']);
    const out = resolveLibraryNoteClickTarget(text);
    assert.ok(out);
    assert.equal(out!.bare, 'kick');
  });

  test('wikilink with alias/heading → bare strips them', () => {
    const el = makeEl('cm-hmd-internal-link', { 'data-href': 'kick#args|the chip' });
    const out = resolveLibraryNoteClickTarget(el);
    assert.ok(out);
    assert.equal(out!.bare, 'kick');
    assert.equal(out!.href, 'kick#args|the chip');
  });

  test('null target → null', () => {
    assert.equal(resolveLibraryNoteClickTarget(null), null);
  });

  test('non-link element → null', () => {
    const el = makeEl('paragraph', {}, 'just text');
    assert.equal(resolveLibraryNoteClickTarget(el), null);
  });

  test('link element with empty data-href + empty text → null', () => {
    const el = makeEl('cm-link', { 'data-href': '' }, '');
    assert.equal(resolveLibraryNoteClickTarget(el), null);
  });
});
