// Drain 2026-09-23-1042 — tests for parseSvgMarkup, the `.innerHTML`
// replacement behind output-view.ts's renderSVG and the Verovio score
// mount. Two jobs: (1) the resulting DOM must be what `innerHTML` built
// (the zoom code + `.forge-verovio-pages` CSS depend on its shape);
// (2) it must not carry executable content.
//
// Rendered against happy-dom (same convention as input-widget-piano
// .test.ts). The old `innerHTML` result is built alongside as the
// equivalence oracle, so a divergence fails against the real baseline,
// not a hand-written expectation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { parseSvgMarkup } from './svg-markup-core.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

function setup() {
  const window = new Window();
  const document = window.document;
  const parser = new window.DOMParser() as unknown as {
    parseFromString(m: string, t: 'text/html'): Document;
  };
  const mount = (markup: string) => {
    const host = document.createElement('div');
    host.append(...(parseSvgMarkup(markup, parser) as unknown as Node[]) as never[]);
    return host;
  };
  const viaInnerHtml = (markup: string) => {
    const host = document.createElement('div');
    host.innerHTML = markup;
    return host;
  };
  return { window, document, mount, viaInnerHtml };
}

// Shaped like Verovio's real output: XML declaration, width in raw
// pixels, `.note` groups carrying ids, then a multi-page wrapper.
const PAGE = (n: number) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="no"?>`
  + `<svg xmlns="${SVG_NS}" width="2100px" height="2970px" viewBox="0 0 21000 29700">`
  + `<g class="page-margin"><g id="n${n}a" class="note"><path d="M0 0 L10 10"/></g>`
  + `<g id="n${n}b" class="note"><path d="M20 0 L30 10"/></g></g></svg>`;

const SINGLE = PAGE(1);
const MULTI = `<div class="forge-verovio-pages">${PAGE(1)}${PAGE(2)}</div>`;

for (const [label, markup] of [['single-page', SINGLE], ['multi-page wrapper', MULTI]] as const) {
  test(`parseSvgMarkup: ${label} score matches the innerHTML DOM shape the zoom code reads`, () => {
    const { mount, viaInnerHtml } = setup();
    const got = mount(markup);
    const want = viaInnerHtml(markup);

    const gotSvgs = Array.from(got.querySelectorAll('svg'));
    const wantSvgs = Array.from(want.querySelectorAll('svg'));
    assert.equal(gotSvgs.length, wantSvgs.length);
    assert.ok(gotSvgs.length >= 1);
    // What applyZoom's naturalWidths reads.
    assert.deepEqual(
      gotSvgs.map((s) => s.getAttribute('width')),
      wantSvgs.map((s) => s.getAttribute('width')),
    );
    assert.deepEqual(
      gotSvgs.map((s) => s.getAttribute('viewBox')),
      wantSvgs.map((s) => s.getAttribute('viewBox')),
    );
    // What click-to-play + attachScoreFollower read.
    assert.deepEqual(
      Array.from(got.querySelectorAll('.note')).map((n) => n.id),
      Array.from(want.querySelectorAll('.note')).map((n) => n.id),
    );
    // SVG-namespaced, not inert HTML-namespaced lookalikes.
    for (const s of gotSvgs) assert.equal(s.namespaceURI, SVG_NS);
  });
}

test('parseSvgMarkup: multi-page wrapper keeps the forge-verovio-pages class the page-stack CSS targets', () => {
  const { mount } = setup();
  const got = mount(MULTI);
  const wrapper = got.querySelector('.forge-verovio-pages');
  assert.ok(wrapper, 'wrapper class must survive — styles.css keys the flex column off it');
  assert.equal(wrapper!.querySelectorAll('svg').length, 2);
});

test('parseSvgMarkup: user-authored SVG renders (renderSVG path)', () => {
  const { mount } = setup();
  const got = mount(`<svg xmlns="${SVG_NS}" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>`);
  assert.equal(got.querySelectorAll('svg circle').length, 1);
});

test('parseSvgMarkup: <script> elements are stripped (HTML and SVG-namespaced)', () => {
  const { mount } = setup();
  // Legit content sits BEFORE the SVG-nested <script>: happy-dom's own
  // `innerHTML` parser drops whatever follows a <script> inside <svg>
  // (a happy-dom quirk, verified against the baseline — real Chromium
  // keeps it), so ordering keeps this test about the sanitizer.
  const markup =
    `<svg xmlns="${SVG_NS}"><rect width="1" height="1"/><script>window.pwned = 1</script></svg>`
    + `<script>window.pwned = 2</script>`;
  const { viaInnerHtml } = setup();
  assert.ok(viaInnerHtml(markup).querySelectorAll('script').length >= 1, 'baseline keeps scripts (non-vacuity)');

  const got = mount(markup);
  assert.equal(got.querySelectorAll('script').length, 0);
  assert.equal(got.querySelectorAll('rect').length, 1, 'legitimate content must survive');
});

test('parseSvgMarkup: on* handler attributes are stripped — and innerHTML would have kept them (non-vacuity)', () => {
  const { mount, viaInnerHtml } = setup();
  const markup = `<svg xmlns="${SVG_NS}" onload="x()"><rect onclick="x()" width="1" height="1"/></svg>`;

  // Baseline proves the assertion below can fail: the old path kept them.
  const baseline = viaInnerHtml(markup);
  assert.equal(baseline.querySelector('rect')!.getAttribute('onclick'), 'x()');

  const got = mount(markup);
  assert.equal(got.querySelector('rect')!.hasAttribute('onclick'), false);
  assert.equal(got.querySelector('svg')!.hasAttribute('onload'), false);
  assert.equal(got.querySelector('rect')!.getAttribute('width'), '1');
});

test('parseSvgMarkup: javascript: URLs are stripped, ordinary URLs kept', () => {
  const { mount } = setup();
  const got = mount(
    `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink">`
    + `<a href="javascript:alert(1)"><rect width="1" height="1"/></a>`
    + `<a href="  JaVa\tScRiPt:alert(2)"><rect width="1" height="1"/></a>`
    + `<a href="https://example.com/x"><rect width="1" height="1"/></a></svg>`,
  );
  const hrefs = Array.from(got.querySelectorAll('a')).map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, [null, null, 'https://example.com/x']);
});

test('parseSvgMarkup: a leading <style> (HTML parser hoists it to <head>) is kept', () => {
  const { mount } = setup();
  const got = mount(`<style>.a{fill:red}</style><svg xmlns="${SVG_NS}"><rect class="a" width="1" height="1"/></svg>`);
  assert.equal(got.querySelectorAll('style').length, 1);
  assert.equal(got.querySelectorAll('rect').length, 1);
});

test('parseSvgMarkup: empty / whitespace-only input yields no nodes', () => {
  const { window } = setup();
  const parser = new window.DOMParser() as unknown as { parseFromString(m: string, t: 'text/html'): Document };
  assert.deepEqual(parseSvgMarkup('', parser), []);
  assert.deepEqual(parseSvgMarkup('   \n\t ', parser), []);
});

test('parseSvgMarkup: malformed markup does not throw (matches the old render-what-parses behavior)', () => {
  const { mount } = setup();
  assert.doesNotThrow(() => mount(`<svg xmlns="${SVG_NS}"><g><rect width="1"`));
  assert.doesNotThrow(() => mount('not svg at all <<< &&&'));
});
