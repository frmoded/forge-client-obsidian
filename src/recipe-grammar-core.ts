// 2026-10-31-1140 (M16a, design 4.14) - the RECIPE read back: `parseRecipe(text, vault)` is the inverse of what the renderers write as a note's `# Recipe` (phraseRecipeSteps, arrangementRecipeSteps, compositionRecipeSteps), so a person can edit
// the Recipe and the Recipe become the source (recipe-apply-core.ts). Pure, no `obsidian`; it does NOT fork the Description grammar (phrase-grammar-core.ts): it reads with the same scanner (words in any case and spacing, numbers, `N %` or
// `N percent`, `[[a note]]` checked against the vault), the same weight convention (the share of the FIRST bar is the weight), the same validators as the last gate and the same refusal style (one sentence, a line and a column).
//
//   renderRecipe(params) -> the Recipe text, one step per line;   parseRecipe(text, vault) -> { ok, params } | { ok: false, error: { message, line, column } };   canonical(params) is what the Recipe carries (phrase-grammar-core.ts).
//
// WHAT IS SHARED AND WHAT IS NOT. An arrangement and a composition say their Recipe in the Description grammar's own sentences ("Play [[a]] on the [[rock]] kit. ... Together.", "Play [[arr_001]] for 8 bars. Then play ..."): their steps are read by `parse`
// itself (a test pins that the two texts are the same sentences). An extend, a morph, a mix and a transform have a Recipe of their own wording ("Repeat it for 8 bars with fills, 20 % slower.",
// "Morph from the first to the second over 5 bars, in musical order.", "Mix them by vote: 70 % [[a]] and 30 % [[b]], threshold 0.50, ghost notes off."): those are read here, one reader per step shape. EVERY step shape the renderers write is in
// RECIPE_STEPS below (the table the "I do not know the step" sentence is made from) and a property test (600 seeded cases per kind) pins that what is written is read back.
import {
  FOLDER_OF, Fail, Scan, followForks, note, orderFromWords, parse, placeOf, readRange, sentencesOf, type GrammarError, type GrammarVault, type ParseResult, type Sentence,
} from './phrase-grammar-core.ts';
import {
  MIX_DEFAULTS, MORPH_DEFAULTS, MORPH_ORDERS, PHRASE_BARS_MAX, PHRASE_BARS_MIN, PHRASE_DEFAULTS, PHRASE_PCT_MAX, PHRASE_PCT_MIN, TRANSFORM_DEFAULTS, TRANSFORM_OPS_MAX, validatePhrase,
  type ExtendPhrase, type MixPhrase, type MorphOrder, type MorphPhrase, type PhraseStyle, type TransformOp, type TransformPhrase,
} from './phrase-core.ts';
import { phraseRecipeSteps } from './phrase-notes-core.ts';
import { arrangementRecipeSteps } from './arrangement-core.ts';
import { compositionRecipeSteps } from './composition-core.ts';
import { complementOf100, noNegZero, shiftDecimal, type GrammarParams } from './phrase-describe-core.ts';

export type RecipeResult = ParseResult;

/** The Recipe the renderers write for `p`: one step per line (no trailing newline). */
export function renderRecipe(p: GrammarParams): string {
  const steps = p.kind === 'arrangement' ? arrangementRecipeSteps(p) : p.kind === 'composition' ? compositionRecipeSteps(p) : phraseRecipeSteps(p);
  return steps.join('\n');
}

/** Every step a Recipe may start with: what the renderers write (one row per way a step starts) and an example of it. The "I do not know the step" sentence lists the openers from here, so a new step is a new row and nowhere else. */
export const RECIPE_STEPS: ReadonlyArray<{ opener: string; re: RegExp; example: string }> = [
  { opener: 'Take', re: /^take\b/i, example: 'Take [[bar_005]].' },
  { opener: 'Repeat', re: /^repeat\b/i, example: 'Repeat it for 8 bars with fills, 20 % slower.' },
  { opener: 'Build', re: /^build\b/i, example: 'Build it up over 8 bars.' },
  { opener: 'Morph', re: /^morph\b/i, example: 'Morph from the first to the second over 5 bars, in musical order.' },
  { opener: 'Mix', re: /^mix\b/i, example: 'Mix them by vote: 70 % [[bar_005]] and 30 % [[bar_006]], threshold 0.50, ghost notes off.' },
  { opener: 'Keep', re: /^keep\b/i, example: 'Keep the state at weight 0.7 (1 is all of [[bar_005]], 0 is all of [[bar_006]]).' },
  { opener: 'Threshold', re: /^threshold\b/i, example: 'Threshold 40 percent.' },
  { opener: 'With', re: /^with\b/i, example: 'With ghost notes.' },
  { opener: 'Thin out', re: /^thin\s+out\b/i, example: 'Thin out bars 3 to 5, kick row, by half, keeping the downbeat.' },
  { opener: 'Double up', re: /^double\s+up\b/i, example: 'Double up bars 3 to 5, kick row.' },
  { opener: 'Bar', re: /^bar\b/i, example: 'Bar 9 is replaced by [[bar_009]].' },
  { opener: 'Play', re: /^play\b/i, example: 'Play [[phrase_006]] on the [[rock]] kit.' },
  { opener: 'Mute', re: /^mute\b/i, example: 'Mute the [[latin]] kit.' },
  { opener: 'Only', re: /^only\b/i, example: 'Only the [[rock]] kit plays.' },
  { opener: 'Together', re: /^together\b/i, example: 'Together.' },
  { opener: 'For', re: /^for\b/i, example: 'For 8 bars play [[arr_001]].' },
  { opener: 'Then play', re: /^then\s+play\b/i, example: 'Then play [[arr_002]] for 4 bars.' },
];
export const RECIPE_OPENERS_TEXT = RECIPE_STEPS.map((s) => s.opener).join(', ');

const stepError = (text: string, offset: number, message: string): RecipeResult => ({ ok: false, error: { message, ...placeOf(text, offset) } });

/** A step must be read to its end: a sentence of the Recipe (a line, or a full stop and a space). */
const parenSeed = (sc: Scan): number | null => {
  sc.ws();
  if (sc.s[sc.i] !== '(') return null;
  sc.i++;
  if (!sc.kw('seed')) sc.fail('"seed N"');
  const seed = sc.whole('a seed', 0);
  sc.ws();
  if (sc.s[sc.i] !== ')') sc.fail('")"');
  sc.i++;
  return seed;
};

function readOrder(sc: Scan): MorphOrder {
  if (!sc.kw('in')) sc.fail(`", in musical order" (or another order: ${MORPH_ORDERS.join(', ')})`);
  const o = orderFromWords(sc);
  if (o === null) sc.fail(`an order (${MORPH_ORDERS.join(', ')})`);
  return o;
}

/** "Take [[a]]." (one bar) or "Take [[a]] and [[b]]." (two): the step every kind opens with. */
function takeBars(s: Sentence, vault: GrammarVault, two: boolean): string[] {
  const sc = new Scan(s.text, s.start);
  sc.kw('take');
  const a = note(sc, vault, ['bar'], two ? 'the first bar' : 'the bar to extend').name;
  if (!two) { sc.end(); return [a]; }
  if (!sc.kw('and')) sc.fail('"and"');
  const b = note(sc, vault, ['bar'], 'the second bar').name;
  sc.end();
  return [a, b];
}

function parseExtendRecipe(ss: Sentence[], vault: GrammarVault): ExtendPhrase {
  const [source] = takeBars(ss[0], vault, false);
  const sc = new Scan(ss[1].text, ss[1].start);
  let bars: number, style: PhraseStyle;
  if (sc.kw('repeat it for')) {
    bars = sc.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX);
    if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"');
    if (!sc.kw('with')) sc.fail('"with fills" or "with ghost notes"');
    if (sc.kw('ghost notes')) style = 'ghost_notes'; else if (sc.kw('fills')) style = 'repeat_with_fills'; else sc.fail('"fills" or "ghost notes"');
  } else if (sc.kw('build it up over')) {
    bars = sc.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX);
    if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"');
    style = 'building';
  } else sc.fail('"Repeat it for N bars with fills", "Repeat it for N bars with ghost notes" or "Build it up over N bars"');
  let pct: number = PHRASE_DEFAULTS.tempo_change_pct;
  if (sc.comma()) {
    const n = sc.number();
    if (n === null) sc.fail('"N % slower" or "N % faster"');
    if (!(sc.kw('percent') || sc.eatPercentSign())) sc.fail(`"%" after ${n.text}`);
    const slower = sc.kw('slower');
    if (!slower && !sc.kw('faster')) sc.fail('"slower" or "faster"');
    if (n.value < 0 || n.value > (slower ? -PHRASE_PCT_MIN : PHRASE_PCT_MAX)) sc.failAt(`Expected a tempo change of 0 to ${slower ? -PHRASE_PCT_MIN : PHRASE_PCT_MAX} percent ${slower ? 'slower' : 'faster'}, but found ${n.text}.`, n.at);
    pct = slower ? noNegZero(-n.value) : n.value;
  }
  sc.end();
  const overrides = followForks(ss.slice(2), vault, () => bars);
  return { kind: 'extend', source, bars, style, tempo_change_pct: pct, ...overrides };
}

function parseMorphRecipe(ss: Sentence[], vault: GrammarVault): MorphPhrase {
  const [a, b] = takeBars(ss[0], vault, true);
  const sc = new Scan(ss[1].text, ss[1].start);
  if (!sc.kw('morph from the first to the second')) sc.fail('"Morph from the first to the second over N bars, in musical order."');
  let bars: number, position: number | null = null;
  if (sc.kw('over')) {
    const at = sc.at;
    bars = sc.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX);
    if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"');
    if (bars === 1) sc.failAt('Expected "and keep the bar at position N" for a morph of one bar, but found "over 1 bar".', at);
  } else if (sc.kw('and keep the bar at position')) {
    bars = 1; position = sc.whole('a position', 0);
  } else sc.fail('"over N bars" or "and keep the bar at position N"');
  sc.comma();
  const order = readOrder(sc);
  const seedAt = sc.at;
  const seed = parenSeed(sc);
  if (seed !== null && order !== 'seeded') sc.failAt(`Expected a seed only with the seeded order, but this morph is in ${order} order.`, seedAt);
  sc.end();
  const overrides = followForks(ss.slice(2), vault, () => bars);
  return { kind: 'morph', a, b, bars, order, seed: seed ?? MORPH_DEFAULTS.seed, ...(bars === 1 ? { position: position ?? 0 } : {}), ...overrides };
}

/** "Mix them by vote: 70 % [[a]] and 30 % [[b]], threshold 0.50, ghost notes off." and "Mix them as a path ... Keep the state at weight 0.7 (...)." with the two sentences a path may add. */
function parseMixRecipe(ss: Sentence[], vault: GrammarVault): MixPhrase {
  const [a, b] = takeBars(ss[0], vault, true);
  const sc = new Scan(ss[1].text, ss[1].start);
  const link = (n: string): string => `[[${n}]]`;
  if (sc.kw('mix them by vote')) {
    sc.ws(); if (sc.s[sc.i] === ':') sc.i++;
    const share = (expected: string, what: string): { text: string; at: number } => {
      const n = sc.number();
      if (n === null) sc.fail(`${what} as a number of percent`);
      if (!(sc.kw('percent') || sc.eatPercentSign())) sc.fail(`"%" after ${n.text}`);
      if (n.value < 0 || n.value > 100) sc.failAt(`Expected a share from 0 to 100 percent, but found ${n.text}.`, n.at);
      const refAt = sc.at;
      const r = note(sc, vault, ['bar'], 'the bar the share belongs to');
      if (r.name !== expected) sc.failAt(`Expected ${link(expected)} for ${what}, but found ${link(r.name)}.`, refAt);
      return { text: n.text, at: n.at };
    };
    const first = share(a, 'the first share');
    if (!sc.kw('and')) sc.fail('"and"');
    const second = share(b, 'the second share');
    if (shiftDecimal(second.text, 0) !== complementOf100(first.text)) sc.failAt(`Expected the two shares to add up to 100 percent, but found ${first.text} and ${second.text}.`, second.at);
    if (!sc.comma() || !sc.kw('threshold')) sc.fail('", threshold 0.50"');
    const t = sc.number();
    if (t === null) sc.fail('a threshold from 0 to 1');
    if (t.value > 1) sc.failAt(`Expected a threshold from 0 to 1, but found ${t.text}.`, t.at);
    if (!sc.comma() || !sc.kw('ghost notes')) sc.fail('", ghost notes on" or ", ghost notes off"');
    let ghost: boolean;
    if (sc.kw('on')) ghost = true; else if (sc.kw('off')) ghost = false; else sc.fail('"on" or "off"');
    sc.end();
    if (ss.length > 2) { const x = new Scan(ss[2].text, ss[2].start); x.fail('nothing after the vote step'); }
    return { kind: 'mix', a, b, weight: Number(shiftDecimal(first.text, -2)), threshold: Number(t.text), ghost };
  }
  if (!sc.kw('mix them as a path of single-hit changes from the first to the second')) sc.fail('"Mix them by vote: ..." or "Mix them as a path of single-hit changes from the first to the second, in musical order."');
  sc.comma();
  const order = readOrder(sc);
  const seedAt = sc.at;
  const seed = parenSeed(sc);
  if (seed !== null && order !== 'seeded') sc.failAt(`Expected a seed only with the seeded order, but this mix is in ${order} order.`, seedAt);
  sc.end();
  if (ss.length < 3) throw new Fail(ss[1].start + ss[1].text.length, 'Expected "Keep the state at weight N (...)." after the path, but found the end of the Recipe.');
  const w = new Scan(ss[2].text, ss[2].start);
  if (!w.kw('keep the state at weight')) w.fail('"Keep the state at weight N (1 is all of [[a]], 0 is all of [[b]])."');
  const n = w.number();
  if (n === null) w.fail('a weight from 0 to 1');
  if (n.value > 1) w.failAt(`Expected a weight from 0 to 1, but found ${n.text}.`, n.at);
  w.ws();
  if (w.s[w.i] === '(') {                                              // the parenthesis only explains the weight: when it is there it must say the same bars
    w.i++;
    if (!w.kw('1 is all of')) w.fail('"1 is all of [[a]]"');
    const at1 = w.at; const x = note(w, vault, ['bar'], 'the bar the weight 1 is');
    if (x.name !== a) w.failAt(`Expected ${link(a)} for the weight 1, but found ${link(x.name)}.`, at1);
    w.comma();
    if (!w.kw('0 is all of')) w.fail('"0 is all of [[b]]"');
    const at0 = w.at; const y = note(w, vault, ['bar'], 'the bar the weight 0 is');
    if (y.name !== b) w.failAt(`Expected ${link(b)} for the weight 0, but found ${link(y.name)}.`, at0);
    w.ws(); if (w.s[w.i] !== ')') w.fail('")"'); w.i++;
  }
  w.end();
  let threshold: number = MIX_DEFAULTS.threshold, ghost = false;
  const said = new Set<string>();
  for (const s of ss.slice(3)) {
    const f = new Scan(s.text, s.start);
    if (f.kw('threshold')) {
      if (said.has('threshold')) f.failAt('Expected the threshold to be said once, but it is said twice.', s.start);
      said.add('threshold'); threshold = f.percent('a threshold', 0, 100); f.end();
    } else if (f.kw('with ghost notes')) {
      if (said.has('ghost')) f.failAt('Expected the ghost notes to be said once, but they are said twice.', s.start);
      said.add('ghost'); ghost = true; f.end();
    } else f.fail('"Threshold N percent." or "With ghost notes."');
  }
  return { kind: 'mix', a, b, weight: Number(n.text), threshold, ghost, mode: 'path', order, seed: seed ?? MORPH_DEFAULTS.seed };
}

/**
 * A transform's Recipe: "Take [[phrase_006]]." then one step per change, in the words `transformOpWords` writes (phrase-words-core.ts): "Thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.",
 * "Thin out bar 4: remove 25 % of the hits, chosen by seed 7.", "Double up bars 1 to 2: every hit gets a second one a step later (grid 8).", and "Bar 9 is replaced by [[bar_009]]." for a fork.
 */
function parseTransformRecipe(ss: Sentence[], vault: GrammarVault): TransformPhrase & { source: string } {
  const t = new Scan(ss[0].text, ss[0].start);
  t.kw('take');
  const src = note(t, vault, ['phrase', 'arrangement', 'composition'], 'the note to take');
  t.end();
  const ops: TransformOp[] = [];
  const forks: Sentence[] = [];
  for (const s of ss.slice(1)) {
    const f = new Scan(s.text, s.start);
    if (f.peekKw('bar')) { forks.push(s); continue; }
    const thin = f.kw('thin out');
    if (!thin && !f.kw('double up')) f.fail('"Thin out ...", "Double up ..." or "Bar N is replaced by [[a bar]]"');
    const { first, last } = readRange(f);
    let row: string | undefined;
    if (f.comma()) {
      f.ws();
      const m = /^[A-Za-z0-9_-]+/.exec(f.s.slice(f.i));
      const at = f.i;
      if (m) { f.i += m[0].length; if (f.kw('row')) row = m[0]; else f.i = at; }
      if (row === undefined) f.fail('"kick row"');
    }
    f.ws(); if (f.s[f.i] !== ':') f.fail('":"'); f.i++;
    if (!thin) {
      if (!f.kw('every hit gets a second one a step later')) f.fail('"every hit gets a second one a step later"');
      let grid: number = TRANSFORM_DEFAULTS.grid;
      f.ws();
      if (f.s[f.i] === '(') { f.i++; if (!f.kw('grid')) f.fail('"grid N"'); grid = f.whole('a grid', 1); f.ws(); if (f.s[f.i] !== ')') f.fail('")"'); f.i++; }
      f.end();
      ops.push({ op: 'double_up', first, last, ...(row !== undefined ? { row } : {}), grid });
      continue;
    }
    if (!f.kw('remove')) f.fail('"remove half of the hits", "remove N % of the hits", "remove all the hits" or "remove none of the hits"');
    let amount: number;
    if (f.kw('half of the hits')) amount = 0.5;
    else if (f.kw('all the hits')) amount = 1;
    else if (f.kw('none of the hits')) amount = 0;
    else { amount = f.percent('an amount', 0, 100); if (!f.kw('of the hits')) f.fail('"of the hits"'); }
    let keep: 'seeded' | null = null, seed: number | null = null;
    if (!f.comma()) f.fail('", keeping the strongest beats" or ", chosen by seed N"');
    if (f.kw('keeping the strongest beats')) { /* the default */ } else if (f.kw('chosen by seed')) { keep = 'seeded'; seed = f.whole('a seed', 0); } else f.fail('"keeping the strongest beats" or "chosen by seed N"');
    f.end();
    ops.push({ op: 'thin_out', first, last, ...(row !== undefined ? { row } : {}), amount, ...(keep === 'seeded' ? { keep: 'seeded' as const, seed: seed ?? 0 } : {}) });
  }
  if (ops.length === 0) t.failAt('Expected at least one change after "Take" (Thin out or Double up), but found none.', ss[0].start + ss[0].text.length);
  if (ops.length > TRANSFORM_OPS_MAX) t.failAt(`Expected at most ${TRANSFORM_OPS_MAX} changes, but found ${ops.length}.`, ss[0].start);
  const overrides = followForks(forks, vault, () => Number.MAX_SAFE_INTEGER);
  return { kind: 'transform', source: `${FOLDER_OF[src.kind as 'phrase' | 'arrangement' | 'composition']}/${src.name}`, ops, ...overrides };
}

/**
 * A Recipe -> its params, or the first thing that is wrong with it, with the line and the column it is at and one sentence saying what was expected. Never throws. `vault` is what the notes it names are checked against.
 * A step that starts with a word the table does not know is refused by name: "I do not know the step 'Sprinkle'. A step starts with Take, Repeat, ...".
 */
export function parseRecipe(text: string, vault: GrammarVault): RecipeResult {
  try {
    const ss = sentencesOf(text);
    if (ss.length === 0) return stepError(text, 0, `Expected a Recipe (its first step is Take or Play), but found nothing.`);
    for (const s of ss) {
      if (RECIPE_STEPS.some((r) => r.re.test(s.text))) continue;
      const word = /^[^\s.,:;]+/.exec(s.text)?.[0] ?? s.text.slice(0, 1);
      return stepError(text, s.start, `I do not know the step '${word}'. A step starts with ${RECIPE_OPENERS_TEXT}.`);
    }
    if (!/^(?:take|play|for)\b/i.test(ss[0].text)) {                    // a Recipe opens with "Take" (a phrase) or "Play" / "For" (an arrangement, a composition); the Description grammar's own "Extend, Mix, ..." message would talk of a description
      const word = /^[^\s.,:;]+/.exec(ss[0].text)?.[0] ?? ss[0].text.slice(0, 1);
      return stepError(text, ss[0].start, `Expected a Recipe that starts with "Take [[a note]]." or "Play [[a note]] ...", but found "${word}".`);
    }
    const second = ss[1]?.text ?? '';
    if (/^take\b/i.test(ss[0].text)) {
      if (/^(?:repeat\s+it\b|build\s+it\b)/i.test(second)) return finish(text, parseExtendRecipe(ss, vault), ss);
      if (/^morph\b/i.test(second)) return finish(text, parseMorphRecipe(ss, vault), ss);
      if (/^mix\b/i.test(second)) return finish(text, parseMixRecipe(ss, vault), ss);
      if (ss.length === 1 && /\band\b/i.test(ss[0].text.replace(/\[\[[^\]]*\]\]/g, ''))) throw new Fail(ss[0].start + ss[0].text.length, 'Expected "Morph from the first to the second ..." or "Mix them ..." after the two bars, but found the end of the Recipe.');
      return finish(text, parseTransformRecipe(ss, vault), ss);
    }
    const delegated = parse(text, vault);                              // an arrangement and a composition say their Recipe in the Description grammar's own sentences
    return delegated.ok === false ? { ok: false, error: { ...delegated.error, message: delegated.error.message.replace(/\bdescription\b/g, 'Recipe') } } : delegated;       // ... and its refusals talk of "the description": here it is the Recipe
  } catch (e) {
    if (e instanceof Fail) return stepError(text, e.at, e.message);
    return stepError(text, 0, `Expected a Recipe of this grammar, but it could not be read (${(e as Error)?.message ?? String(e)}).`);
  }
}

/** The last gate, the one the Description grammar has: what is read must be what the plugin's own validators accept. */
function finish(text: string, params: ExtendPhrase | MorphPhrase | MixPhrase | (TransformPhrase & { source: string }), ss: Sentence[]): RecipeResult {
  const v = validatePhrase(params);
  if (v.ok === false) return stepError(text, ss[0].start, v.message);
  return { ok: true, params };
}

export type { GrammarError };
