// Drain 2026-10-18-1800 §3 — hide Obsidian's "</>" (Edit this block) button on `forge-rhythm` blocks, and only there.
//
// The class names are verified against the INSTALLED Obsidian (scripts/verify-obsidian-embed-classes.mjs reads the newest obsidian-<version>.asar),
// not memory. The finding worth knowing: the button belongs to Live Preview editor widgets (`addEditButton`); Reading view has none.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { findObsidianBundle, inspectBundle } from '../scripts/verify-obsidian-embed-classes.mjs';
import { RHYTHM_EMBED_LANGUAGE } from './rhythm-embed-core.ts';

const CSS = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((x) => x.trim()), body: m[2] }));
const touching = (re: RegExp) => rules.filter((r) => r.selectors.some((s) => re.test(s)));

test('the embed language the CSS is scoped to is the one the plugin registers', () => {
  assert.equal(RHYTHM_EMBED_LANGUAGE, 'forge-rhythm');
});

test('Live Preview: the actions container and the edit button inside a forge-rhythm widget are hidden', () => {
  const lang = RHYTHM_EMBED_LANGUAGE;
  const hidden = new Set<string>();
  for (const r of rules) if (/display:\s*none/.test(r.body)) for (const s of r.selectors) hidden.add(s);
  for (const sel of [
    `.cm-preview-code-block.cm-lang-${lang} .edit-block-button`, `.cm-preview-code-block.cm-lang-${lang} .embed-actions`,
    `.block-language-${lang} .edit-block-button`, `.block-language-${lang} .embed-actions`,
  ]) assert.ok(hidden.has(sel), `${sel} → display: none`);
});

test('non-vacuity of the scoping: EVERY rule that targets Obsidian\'s edit button or its actions container is scoped to the forge-rhythm language', () => {
  const rulesTouching = touching(/edit-block-button|embed-actions/);
  assert.ok(rulesTouching.length > 0, 'the premise: the rule exists');
  for (const r of rulesTouching) {
    for (const s of r.selectors) assert.match(s, /forge-rhythm/, `"${s}" would hide the button on OTHER code blocks`);
  }
});

test('the hiding is a plain `display: none` on a descendant of the widget — it does not touch the widget itself or the iframe', () => {
  for (const r of touching(/edit-block-button|embed-actions/)) {
    for (const s of r.selectors) assert.match(s, /(?:\.cm-preview-code-block\.cm-lang-forge-rhythm|\.block-language-forge-rhythm)\s+\.(?:edit-block-button|embed-actions)$/, s);
  }
});

// Verified against the installed Obsidian — skipped (visibly, with the reason) on a machine without one; the facts are in the FEEDBACK.
const bundle = findObsidianBundle();
test('the class names exist in the installed Obsidian, and Reading view has no edit button to hide', { skip: bundle ? false : 'no obsidian-<version>.asar under ~/Library/Application Support/obsidian — set OBSIDIAN_ASAR' }, () => {
  const facts = inspectBundle(fs.readFileSync(bundle!));
  assert.ok(facts.editBlockButton > 0, 'edit-block-button');
  assert.ok(facts.embedActions > 0, 'embed-actions');
  assert.ok(facts.previewCodeBlockRoot > 0, 'cm-preview-code-block … cm-lang-<language> (the Live Preview widget root)');
  assert.ok(facts.addEditButtonCalls > 0, 'addEditButton is called by editor widgets');
  assert.equal(facts.readingViewHasEditBlockButton, false, 'Reading view does not render the button, so there is nothing to hide there');
});
