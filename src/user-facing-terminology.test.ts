// Drain 2026-09-23-1810 — "chip" retired from user-facing strings in
// favour of "library note" (standing terminology rule: "chip" is not
// user-facing vocabulary; the model concept is "library note").
//
// MECHANISM-PINNING (per the queue's docstring convention): these tests
// read the SHIPPED SOURCE and pin specific literals — that the retired
// wording is gone from the listed sites and that labels which must agree
// with each other actually do. If a label is intentionally reworded
// again this SHOULD go red — reassess, don't just rewrite. They are a
// list of known sites, NOT a blanket "no user-visible 'chip' anywhere"
// guarantee: a new user-facing string that says 'chip' would not be caught
// here (the closing case-insensitive sweep in drain 2026-09-23-1915's
// FEEDBACK is what established the surface is clean). Extended by drain
// 2026-09-23-1915 to cover the rest of the previously-deferred strings.
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
const INVENTORY = src('chip-inventory-core.ts');
const LLM_GUIDANCE = src('llm-rejection-guidance-core.ts');
const REWRITE_MODAL = src('rewrite-suggestion-modal.ts');
const OUTPUT_VIEW = src('output-view.ts');
const REGISTRY = src('registry-inventory-core.ts');

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

// ---- drain 2026-09-23-1915: the rest of the previously-deferred strings ----

test("the 'Log library note inventory' command and its Notice use the new wording", () => {
  assert.equal(commandName(MAIN, 'forge-log-chip-inventory'), 'Log library note inventory');
  assert.ok(MAIN.includes('`Library note inventory logged to console ('));
});

test('both call sites of the inventory summary go through the one formatter (startup log + Notice)', () => {
  const uses = MAIN.match(/formatChipInventorySummary\(inventory\)/g) ?? [];
  assert.equal(uses.length, 2, 'main.ts:startup console.log and the Notice must share one formatter');
  assert.ok(INVENTORY.includes('library notes, moda: ${inv.moda.length} library notes'));
});

test("the engine-not-found Notice and the palette view's guard/empty-state text use the new wording", () => {
  assert.ok(MAIN.includes('`Engine library note "${chipName}" not found in catalog.`'));
  assert.ok(CHIPS_VIEW.includes("'No library notes defined."));
  assert.ok(CHIPS_VIEW.includes("'vault to surface authoring library notes here.'"));
  assert.ok(CHIPS_VIEW.includes("'Library notes only insert into action snippets. Switch to an action snippet to use library notes.'"));
  assert.ok(CHIPS_VIEW.includes("'Library notes only insert into action snippets.'"));
});

test('the modal body, closure-fail label, and registry-dump text use the new wording', () => {
  assert.ok(REWRITE_MODAL.includes('names individual library note '));
  assert.ok(OUTPUT_VIEW.includes("'closure-fail (LLM referenced unknown library notes)'"));
  for (const phrase of [
    'Engine library note names:',
    'collide with an engine library note:',
    'matches any engine library note name.',
    "under the library note\\'s own",
    'instead of the library note.',
  ]) {
    assert.ok(REGISTRY.includes(phrase), `registry-inventory-core.ts missing: ${phrase}`);
  }
});

test('retired wording is gone from the 1915 sites (non-vacuity: each was present before this drain)', () => {
  const retired: Array<[string, string, string]> = [
    ['main.ts', MAIN, "'Log chip inventory'"],
    ['main.ts', MAIN, '`Chip inventory logged'],
    ['main.ts', MAIN, '`Engine chip "'],
    ['chip-inventory-core.ts', INVENTORY, '} chips, moda:'],
    ['chips-view.ts', CHIPS_VIEW, "'No chips defined."],
    ['chips-view.ts', CHIPS_VIEW, 'authoring chips here'],
    ['chips-view.ts', CHIPS_VIEW, "'Chips only insert"],
    ['chips-view.ts', CHIPS_VIEW, 'to use chips.'],
    ['rewrite-suggestion-modal.ts', REWRITE_MODAL, 'names individual chip '],
    ['output-view.ts', OUTPUT_VIEW, 'unknown chips)'],
    ['registry-inventory-core.ts', REGISTRY, 'Engine chip names'],
    ['registry-inventory-core.ts', REGISTRY, 'engine chip:'],
    ['registry-inventory-core.ts', REGISTRY, 'matches any engine chip name.'],
    ['registry-inventory-core.ts', REGISTRY, "the chip\\'s own"],
    ['registry-inventory-core.ts', REGISTRY, 'instead of the chip.'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, '`[[print]]` chip needed'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, '`log` chip in V2'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, '`debug` chip in V2'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, 'as a chip name'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, '}\\` chip is registered'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, 'a real chip'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, '— chip names'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, 'as a chip invocation'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, 'read as chip names'],
    ['llm-rejection-guidance-core.ts', LLM_GUIDANCE, 'at least one chip'],
  ];
  for (const [file, text, needle] of retired) {
    assert.ok(!text.includes(needle), `${file} still contains retired string: ${needle}`);
  }
});
