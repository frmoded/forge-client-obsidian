// Drain 2026-10-14-0900 §6 — every vault-authored widget iframe is sandboxed with `allow-scripts` ONLY.
//
// Every embed/Beat Box mount logged "An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can
// escape its sandboxing." It was true: a blob URL takes its creator's origin, so with both flags the widget was SAME-ORIGIN with
// Obsidian and could reach `window.parent` — in an Electron renderer, the app itself. `allow-same-origin` was kept because the old
// comment said the widget's JS needed it "to read/write its own document"; it does not (measured, real Chromium, all five shipped
// widgets: scripts/probe-widget-sandbox.mjs).
//
// What this pins is the PROPERTY, not one spelling (I28): (1) no source file grants `allow-same-origin` in any way (add/assignment/
// attribute/template); (2) the helper grants exactly `allow-scripts`; (3) the HOST never reads a widget's document or location —
// the only thing that still works across an opaque origin is postMessage + an `event.source` check, which is all the host uses;
// (4) no shipped widget uses a thing an opaque origin takes away (storage, parent DOM). (4) is what makes the removal safe; if a
// widget starts using localStorage this goes red BEFORE a cohort member meets a SecurityError.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SRC = import.meta.dirname;
const ROOT = path.resolve(SRC, '..');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');
const productionSources = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.includes('.generated.'))
  .map((f) => ({ f, text: strip(fs.readFileSync(path.join(SRC, f), 'utf8')) }));

test('no production source grants allow-same-origin — in any spelling', () => {
  const offenders = productionSources.filter(({ text }) => /allow-same-origin/.test(text)).map(({ f }) => f);
  assert.deepEqual(offenders, []);
});

test('the one helper grants exactly allow-scripts', () => {
  const helper = productionSources.find((s) => s.f === 'html-embed-view.ts')!.text;
  const adds = [...helper.matchAll(/sandbox\.add\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(adds, ['allow-scripts']);
  // and every `<iframe` / createEl('iframe') in production code lives in that helper (or moda-view's own bundled-asset frame)
  const makers = productionSources.filter(({ text }) => /createEl\('iframe'|createElement\('iframe'|<iframe/.test(text)).map(({ f }) => f).sort();
  assert.deepEqual(makers, ['html-embed-view.ts', 'moda-view.ts']);
});

test('the HOST never reads into a widget frame: only contentWindow.postMessage and event.source checks', () => {
  const offenders = productionSources
    .filter(({ text }) => /\.contentDocument\b|contentWindow\.document|contentWindow\.location|contentWindow\.localStorage/.test(text))
    .map(({ f }) => f);
  assert.deepEqual(offenders, []);
});

/** Things an opaque origin removes: web storage, cookies, and any reach into the embedding window beyond postMessage. */
const ORIGIN_BOUND = /\b(localStorage|sessionStorage|indexedDB|document\.cookie|caches\.|window\.top\b|top\.document|parent\.document|parent\.require|window\.parent\.(?!postMessage|\w*\s*!==)|opener\b)/;

function widgetFiles(): { name: string; text: string }[] {
  const dirs = [
    path.resolve(ROOT, '../music-theory/music_instruments/resources/html'),
    path.join(ROOT, 'assets/vaults/music-theory/music_instruments/resources/html'),
  ];
  const dir = dirs.find((d) => fs.existsSync(d))!;
  return fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

test('NON-VACUITY: the detector fires on each origin-bound API it names', () => {
  for (const bad of ['localStorage.setItem("a","1")', 'sessionStorage.x', 'indexedDB.open("d")', 'document.cookie = "a=1"', 'window.top.location', 'parent.document.title', 'window.parent.require("fs")', 'window.opener.focus()']) {
    assert.match(bad, ORIGIN_BOUND, bad);
  }
  assert.doesNotMatch('window.parent.postMessage(m, "*")', ORIGIN_BOUND);
  assert.doesNotMatch('return window.parent && window.parent !== window ? window.parent : null;', ORIGIN_BOUND);
});

test('the shipped widgets use nothing an opaque origin takes away (the five gadget widgets)', () => {
  const widgets = widgetFiles();
  assert.ok(widgets.length >= 5, `expected the five widgets, found ${widgets.map((w) => w.name).join(', ')}`);
  const offenders = widgets
    .map((w) => ({ name: w.name, hit: ORIGIN_BOUND.exec(w.text.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, ''))?.[0] ?? null }))
    .filter((w) => w.hit !== null);
  assert.deepEqual(offenders, []);
});

// Drain 2026-10-19-1800: this used to pin the Rhythm Box's Export JSON button ("rejection falls back to execCommand"); the button was removed in drain
// 2026-10-19-1500 (it passed that drain only because the sibling checkout still held the old widget). The property it protected is general — a hosted
// widget lives in a cross-origin sandboxed frame, where navigator.clipboard is refused without a policy grant — so it now covers EVERY widget.
const usesClipboardWithoutFallback = (text: string) =>
  /navigator\.clipboard/.test(text) && !(/navigator\.clipboard\.writeText\([^)]*\)\.then\([\s\S]*?,\s*\w+\s*\)/.test(text) && /document\.execCommand\(["']copy["']\)/.test(text));

test('a widget that uses navigator.clipboard has a fallback — a cross-origin frame is refused it without a policy grant', () => {
  const offenders = widgetFiles().filter((w) => usesClipboardWithoutFallback(w.text)).map((w) => w.name);
  assert.deepEqual(offenders, []);
});

test('NON-VACUITY: the clipboard detector fires on a widget with no fallback and passes one that has it', () => {
  assert.equal(usesClipboardWithoutFallback('navigator.clipboard.writeText(json);'), true);
  assert.equal(usesClipboardWithoutFallback('navigator.clipboard.writeText(json).then(ok, legacyCopy); document.execCommand("copy");'), false);
  assert.equal(usesClipboardWithoutFallback('no clipboard here'), false);
});
