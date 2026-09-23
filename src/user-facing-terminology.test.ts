// Drain 2026-09-23-1810 — "chip" retired from user-facing strings in
// favour of "library note" (standing terminology rule: "chip" is not
// user-facing vocabulary; the model concept is "library note").
//
// MECHANISM-PINNING (per the queue's docstring convention): these tests
// read the SHIPPED SOURCE and pin specific literals — that the retired
// wording is gone from the listed sites and that labels which must agree
// with each other actually do. If a label is intentionally reworded
// again this SHOULD go red — reassess, don't just rewrite. They are not a
// general "no user-facing 'chip' anywhere" guarantee: the plugin still has
// other user-visible 'chip' strings outside this drain's scope (see the
// drain FEEDBACK), so a blanket regex would be red today.
//
// Source is extracted at test time, not copied, so the guards cannot
// drift from what ships (queue rule: mirrors must load production source
// or carry a drift check).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

const MAIN = src('main.ts');
const FORGE_ACTION = src('forge-action.ts');
const CHIPS_VIEW = src('chips-view.ts');
const PARSE_ERR = src('recipe-parse-error-friendly.ts');

/** The `name:` of the addCommand registered under the given id. */
function commandName(mainSrc: string, id: string): string {
  const m = mainSrc.match(
    new RegExp(`id:\\s*'${id}',\\s*name:\\s*'([^']+)'`),
  );
  assert.ok(m, `command ${id} not found in main.ts — extractor is stale`);
  return m![1];
}

test('the parse-error message names the command that actually exists', () => {
  const name = commandName(MAIN, 'forge-refresh-chips');
  assert.equal(name, 'Refresh library note palette');
  // The exact drift drain 2026-08-14-0290 hit once: a message telling the
  // user to run a command that is not in the palette.
  assert.ok(
    PARSE_ERR.includes(`Cmd-P → '${name}'`),
    `recipe-parse-error-friendly.ts must reference the real command name '${name}'`,
  );
});

test("the 'open palette' label agrees across the toolbar button and the ribbon menu", () => {
  const toolbar = MAIN.match(/addAction\(\s*'puzzle',\s*'([^']+)'/);
  const menu = FORGE_ACTION.match(/setTitle\('([^']+)'\)\.setIcon\('puzzle'\)/);
  assert.ok(toolbar && menu, 'label extractors are stale');
  assert.equal(toolbar![1], menu![1]);
  assert.equal(menu![1], 'Open library note palette');
});

test('the palette view uses one name for itself (tab title, panel header)', () => {
  const tab = CHIPS_VIEW.match(/getDisplayText\(\)\s*\{\s*return '([^']+)'/);
  const header = CHIPS_VIEW.match(/createEl\('h3',\s*\{\s*text:\s*'([^']+)'\s*\}\)/);
  assert.ok(tab && header, 'extractors are stale');
  assert.equal(tab![1], 'Forge library notes');
  assert.equal(header![1], tab![1]);
});

test("the palette view's Notices use the new name, including the second half of the guard Notice", () => {
  assert.ok(CHIPS_VIEW.includes("'Forge library notes: click into an action snippet first, '"));
  assert.ok(CHIPS_VIEW.includes("'then click the library note.'"));
  assert.ok(CHIPS_VIEW.includes('`Forge library notes: inserted "${insertion}".`'));
});

test("the Recipe kwarg hint's grammar example no longer says [[chip]]", () => {
  assert.ok(PARSE_ERR.includes("'Call [[library-note]] with name=value'"));
});

test('retired wording is gone from the listed sites (non-vacuity: each was present before this drain)', () => {
  const retired: Array<[string, string]> = [
    ['main.ts', "'Refresh chip palette'"],
    ['main.ts', "'Open chips palette'"],
    ['forge-action.ts', "'Open chips palette'"],
    ['chips-view.ts', "'Forge chips'"],
    ['chips-view.ts', 'Forge chips: click into'],
    ['chips-view.ts', 'Forge chips: inserted'],
    ['chips-view.ts', "then click the chip."],
    ['recipe-parse-error-friendly.ts', "[[chip]] with name=value"],
    ['recipe-parse-error-friendly.ts', "Refresh chip palette"],
    ['recipe-parse-error-friendly.ts', "`Chip '"],
  ];
  const files: Record<string, string> = {
    'main.ts': MAIN,
    'forge-action.ts': FORGE_ACTION,
    'chips-view.ts': CHIPS_VIEW,
    'recipe-parse-error-friendly.ts': PARSE_ERR,
  };
  for (const [file, needle] of retired) {
    assert.ok(!files[file].includes(needle), `${file} still contains retired string: ${needle}`);
  }
});
