// Drain 2026-10-20-0900 §2 — the white strip under a `forge-rhythm` embed on hover in Live Preview. BUG-FIX TDD: these tests were written first and failed.
//
// Obsidian's Live Preview draws a hover frame around a code-block widget (`.markdown-source-view.mod-cm6 .cm-embed-block:not(...):hover` — box-shadow,
// border-radius and `overflow: hidden`, read out of the installed Obsidian 1.14.4's app.css). `overflow: hidden` makes the block a block-formatting
// context, so a child's margin that used to COLLAPSE OUT of the block now stays INSIDE it. The block's first child is our embed (`div.block-language-
// forge-rhythm`), which Obsidian then follows with `div.embed-actions` (the "</>" button; we only `display: none` it, it is still the last child), so
// `.markdown-rendered > :first-child { margin-top: 0 }` removes our top margin and nothing removes the bottom one: 16 px of paper-white appears under
// the embed, inside the frame, only while the pointer is over it. Reading view has no such frame. Measured in real Chromium with Obsidian's own css:
// prompts/feedback/2026-10-20-0900-layout-shots/ (`gapBottomHover` 16 -> 0 at every size).
//
// These pin the MECHANISM (a Live-Preview-scoped `margin: 0` on the embed); if Obsidian's hover rule changes, they SHOULD go red — re-run
// measure-embed.mjs in that folder and reassess, don't just rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const CSS = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((x) => x.trim()), body: m[2] }));
const rulesFor = (sel: string) => rules.filter((r) => r.selectors.includes(sel));
const decl = (body: string, prop: string) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim();

test('GAP (mechanism pin: the Live Preview rule exists): inside Obsidian\'s Live Preview widget the embed has NO margin of its own', () => {
  const lp = rulesFor('.cm-embed-block .forge-rhythm-embed');
  assert.equal(lp.length, 1, 'one rule, scoped to the Live Preview widget');
  assert.equal(decl(lp[0].body, 'margin'), '0', 'margin: 0');
});

test('GAP (the premise, so the rule cannot go stale): the base rule still has a bottom margin — Reading view keeps its spacing, and it is the reason the Live Preview rule exists', () => {
  const base = rulesFor('.forge-rhythm-embed');
  assert.ok(base.length >= 1);
  const margin = decl(base[0].body, 'margin');
  assert.ok(margin && /^\d+(?:px)? \d+(?:px)? \d+px$/.test(margin) && Number(/(\d+)px$/.exec(margin)![1]) > 0, `base margin "${margin}" has a bottom margin`);
});

test('GAP (scoping): the override is not applied to Reading view, where there is no hover frame and the spacing is wanted', () => {
  for (const r of rules) for (const s of r.selectors) {
    if (/forge-rhythm-embed$/.test(s) && decl(r.body, 'margin') === '0') {
      assert.match(s, /\.cm-embed-block/, `"${s}" removes the margin outside Live Preview`);
    }
  }
});

