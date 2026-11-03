// 2026-11-02-1155 (score_first M16b) - `parsePython`, the inverse of the three Python renderers. Round trip over the SAME seeded generators as the Description and Recipe grammars (so the three properties are about the same notes): for every kind,
// `parsePython(renderPython(p))` is `canonical(p)` - except the two things a Python cannot carry (a path mix's threshold and ghost notes, and a composition's two equal sections in a row that are not one repeated), which the `hint` (the params
// the json cache holds now) brings back. Then the freedom the shapes are read with (whitespace, comments, quotes, variable names), and a golden of near misses that are NOT known shapes (they are what makes a note custom).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonical } from './phrase-describe-core.ts';
import { expandSections } from './composition-core.ts';
import { parsePython, renderPython } from './python-grammar-core.ts';
import type { GrammarParams } from './phrase-grammar-core.ts';
import { GEN, rng } from './test-support/grammar-generators.ts';

const CASES = 600;
const KINDS = Object.keys(GEN);

/** What a Python can say of `p`: the canonical params, but a path mix has no threshold or ghost notes in its Python, and a composition's played sections that are the same twice in a row read as one section repeated. */
function whatPythonSays(p: GrammarParams): GrammarParams {
  const c = canonical(p);
  if (c.kind === 'mix' && c.mode === 'path') return { ...c, weight: Math.round(Math.min(1, Math.max(0, c.weight)) * 1e6) / 1e6, threshold: 0.5, ghost: false };
  if (c.kind === 'composition') {
    const sections: Array<{ source: string; length?: number; repeat?: number }> = [];
    for (const x of expandSections(c)) {
      const last = sections[sections.length - 1];
      if (last !== undefined && last.source === x.source && last.length === x.length) last.repeat = (last.repeat ?? 0) + 1;
      else sections.push({ source: x.source, ...(x.length !== undefined ? { length: x.length } : {}) });
    }
    return canonical({ kind: 'composition', sections });
  }
  return c;
}

for (const kind of KINDS) {
  test(`ROUND TRIP (${kind}, ${CASES} seeded cases): parsePython(renderPython(p)) is what the Python says of p, and with p as the hint it is canonical(p) exactly`, () => {
    const r = rng(20261102 + kind.length);
    for (let i = 0; i < CASES; i++) {
      const p = GEN[kind](r);
      const text = renderPython(p);
      const read = parsePython(text);
      assert.ok(read.ok, `${kind} #${i}: not read\n${text}`);
      assert.deepEqual(read.ok && read.params, whatPythonSays(p), `${kind} #${i}\n${text}`);
      const hinted = parsePython(text, p);
      assert.deepEqual(hinted.ok && hinted.params, canonical(p), `${kind} #${i} (with the hint)`);
    }
  });
}

const EXTEND = ['def compute(context):', "  base = bar_005()", "  bars = extend_rhythm(data=base, bars=8, style='building', tempo_change_pct=0)", '  return bars', '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)'].join('\n');
const EXTEND_PARAMS = { kind: 'extend', source: 'bar_005', bars: 8, style: 'building', tempo_change_pct: 0 };

test('the freedom a known shape is read with: whitespace, tabs, comments, quotes, the names of the variables, the order of the keyword arguments, the stream hint present or not', () => {
  const same = (text: string, why: string) => { const r = parsePython(text); assert.ok(r.ok, `${why}\n${text}`); assert.deepEqual(r.ok && r.params, canonical(EXTEND_PARAMS as GrammarParams), why); };
  same(EXTEND, 'as rendered');
  same(EXTEND.replace(/\n  # for.*$/, ''), 'without the stream hint');
  same(EXTEND.replace(/^ {2}/gm, '\t'), 'tabs');
  same(EXTEND.replace(/^ {2}/gm, '        '), 'eight spaces');
  same(EXTEND.replace(/ = /g, '   =   ').replace(/,/g, ' ,  '), 'spaces around = and ,');
  same(`# written by hand\n${EXTEND.replace('return bars', 'return bars   # done')}\n\n\n`, 'comments and blank lines');
  same(EXTEND.replace(/'building'/, '"building"'), 'double quotes');
  same(EXTEND.replace(/\bbase\b/g, 'src_bar').replace(/\bbars = /, 'out = ').replace('return bars', 'return out'), 'other variable names');
  same(EXTEND.replace('data=base, bars=8, style=\'building\', tempo_change_pct=0', "tempo_change_pct=0, style='building', bars=8, data=base"), 'another order of the keyword arguments');
  same(EXTEND.replace('compute(context)', 'compute( ctx )'), 'another name for context');
  same(EXTEND.replace('bar_005()', "globals()['bar_005']()"), 'a note read by globals()');
  same(EXTEND.replace(/\n/g, '\r\n'), 'windows line ends');
  const fork = parsePython(EXTEND.replace('  return bars', '  bars[2] = bar_009()\n  return bars'));
  assert.deepEqual(fork.ok && fork.params, canonical({ ...EXTEND_PARAMS, overrides: { '3': 'bars/bar_009' } } as GrammarParams), 'a fork: bars[2] is bar 3');
});

test('every other shape is read with its own variable names too (morph, mix as a vote, mix as a path, transform, arrangement, composition)', () => {
  const read = (text: string) => { const r = parsePython(text); assert.ok(r.ok, text); return r.ok ? r.params : null; };
  assert.deepEqual(read("def compute(context):\n  x = bar_001()\n  y = bar_002()\n  out = morph_rhythm(a=x, b=y, bars=4, order='musical', seed=0)\n  return out"), { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 4, order: 'musical', seed: 0 });
  assert.deepEqual(read("def compute(context):\n  x = bar_001()\n  y = bar_002()\n  out = [morph_rhythm(a=x, b=y, bars=1, order='musical', seed=0, position=3)]\n  return out"), { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 1, order: 'musical', seed: 0, position: 3 });
  assert.deepEqual(read("def compute(context):\n  x = bar_001()\n  y = bar_002()\n  m = mix_rhythm(a=x, b=y, weight=0.7, threshold=0.5, ghost=True)\n  return [m]"), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.7, threshold: 0.5, ghost: true });
  const pathText = renderPython({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.25, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 } as GrammarParams);
  assert.deepEqual(read(pathText), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.25, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 });
  assert.deepEqual(read(pathText.replace(/\bchanges\b/g, 'n_changes').replace(/\bstop\b/g, 'where').replace(/\bbar\b/g, 'one')), read(pathText), 'the path\'s variables renamed');
  assert.deepEqual(read("def compute(context):\n  s = phrase_003()\n  s = thin_out_bars(bars=s, first=2, last=2, amount=0.5)\n  return s"), { kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'thin_out', first: 2, last: 2, amount: 0.5 }] });
  assert.deepEqual(read("def compute(context):\n  s = arr_001()\n  s = double_up_bars(bars=s, first=1, last=2, row='kick', grid=16)\n  return s"), { kind: 'transform', source: 'arrangements/arr_001', ops: [{ op: 'double_up', first: 1, last: 2, row: 'kick', grid: 16 }] });
  assert.deepEqual(read("def compute(context):\n  ts = []\n  ts.append({'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_001()})\n  ts.append({'kit': 'latin', 'channels': latin()['channels'], 'bars': phrase_002(), 'mute': True, 'volume': 80})\n  out = combine_tracks(tracks=ts)\n  return out"),
    { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', mute: true, volume: 80 }] });
  assert.deepEqual(read("def compute(context):\n  parts = []\n  parts.append({'source': 'phrase_001', 'bars': phrase_001(), 'length': 8})\n  parts.append({'source': 'phrase_001', 'bars': phrase_001(), 'length': 8})\n  parts.append({'source': 'arr_002', 'bars': arr_002()})\n  out = compose_sections(sections=parts)\n  return out"),
    { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 8, repeat: 1 }, { source: 'arrangements/arr_002' }] });
});

test('a composition\'s two equal sections in a row: ONE section repeated once without a hint; the hint (the json cache) says they were two when they were', () => {
  const two: GrammarParams = { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 4 }, { source: 'phrases/phrase_001', length: 4 }] };
  const text = renderPython(two);
  assert.deepEqual(parsePython(text).ok && (parsePython(text) as { params: GrammarParams }).params, { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 4, repeat: 1 }] });
  assert.deepEqual((parsePython(text, two) as { params: GrammarParams }).params, canonical(two));
  const other: GrammarParams = { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 4 }, { source: 'phrases/phrase_002', length: 4 }] };
  assert.deepEqual((parsePython(text, other) as { params: GrammarParams }).params, { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 4, repeat: 1 }] }, 'a hint that is not this Python is not used');
});

test('a path mix\'s threshold and ghost notes are not in its Python: the hint brings them back, no hint gives the defaults', () => {
  const p: GrammarParams = { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.3, threshold: 0.2, ghost: true, mode: 'path', order: 'musical', seed: 0 };
  const text = renderPython(p);
  assert.deepEqual((parsePython(text) as { params: GrammarParams }).params, { ...canonical(p), threshold: 0.5, ghost: false });
  assert.deepEqual((parsePython(text, p) as { params: GrammarParams }).params, canonical(p));
});

const NOT_KNOWN: Array<[string, string]> = [
  ['an empty text', ''],
  ['no def', 'bars = bar_005()'],
  ['another function name', EXTEND.replace('def compute', 'def run')],
  ['a second parameter', EXTEND.replace('compute(context)', 'compute(context, x)')],
  ['an extra statement', EXTEND.replace('  return bars', '  print(bars)\n  return bars')],
  ['a statement dropped (no return)', EXTEND.replace('  return bars\n', '')],
  ['another function', EXTEND.replace('extend_rhythm', 'extend_rhythm2')],
  ['a keyword argument missing', EXTEND.replace(', tempo_change_pct=0', '')],
  ['an extra keyword argument', EXTEND.replace('tempo_change_pct=0', 'tempo_change_pct=0, seed=1')],
  ['a positional argument', EXTEND.replace('data=base, ', 'base, ')],
  ['the data of another variable', EXTEND.replace('data=base', 'data=other')],
  ['a value that is not a literal', EXTEND.replace('bars=8', 'bars=2 * n')],
  ['a number the validators refuse (0 bars)', EXTEND.replace('bars=8', 'bars=0')],
  ['a style that does not exist', EXTEND.replace("'building'", "'wobbly'")],
  ['a loop', 'def compute(context):\n  base = bar_005()\n  bars = []\n  for i in range(4):\n    bars = bars + base\n  return bars'],
  ['an if', 'def compute(context):\n  base = bar_005()\n  if True:\n    bars = extend_rhythm(data=base, bars=8, style=\'building\', tempo_change_pct=0)\n  return bars'],
  ['a note called with an argument', EXTEND.replace('bar_005()', 'bar_005(1)')],
  ['a statement on two lines', EXTEND.replace("bars = extend_rhythm(data=base,", "bars = extend_rhythm(data=base, \\\n bars=8,").replace(' bars=8, bars=8', ' bars=8')],
  ['text after the end', `${EXTEND}\nbars2 = 1`],
  ['two different indents', EXTEND.replace("  bars = extend", "    bars = extend")],
  ['an unterminated string', EXTEND.replace("'building'", "'building")],
  ['a different shape with the same words (a vote with a missing weight)', "def compute(context):\n  a = bar_001()\n  b = bar_002()\n  m = mix_rhythm(a=a, b=b, threshold=0.5, ghost=False)\n  return [m]"],
  ['a mix path whose stop is not the formula', renderPython({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.3, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 } as GrammarParams).replace('+ 500000', '+ 500001')],
  ['a track whose channels are of another kit', "def compute(context):\n  tracks = []\n  tracks.append({'kit': 'rock', 'channels': latin()['channels'], 'bars': phrase_001()})\n  bars = combine_tracks(tracks=tracks)\n  return bars"],
  ['a section whose source and note differ', "def compute(context):\n  sections = []\n  sections.append({'source': 'phrase_001', 'bars': phrase_002()})\n  bars = compose_sections(sections=sections)\n  return bars"],
  ['a transform with no op', 'def compute(context):\n  s = phrase_003()\n  return s'],
  ['a thin-out with a seed but no keep', "def compute(context):\n  s = phrase_003()\n  s = thin_out_bars(bars=s, first=1, last=1, amount=0.5, seed=3)\n  return s"],
];
for (const [why, text] of NOT_KNOWN) test(`NOT a known shape (so the note becomes custom): ${why}`, () => { assert.equal(parsePython(text).ok, false, text); });

test('the same text with a comment or a space changed reads as the same params (a cosmetic edit is not a takeover)', () => {
  const p: GrammarParams = { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 6, order: 'musical', seed: 0 };
  const text = renderPython(p);
  assert.deepEqual(parsePython(`${text}\n# my note to self\n`), parsePython(text));
  assert.deepEqual(parsePython(text.replace('bars=6', 'bars = 6')), parsePython(text));
});

// ---- added by the 1155 mutation pass over this file: every guard of every reader is violated, one at a time -------------------------------------------------------------------------------------------------------------------

/** The identifiers of a rendered Python outside its comments and its strings, with where each one stands. */
function identifiersOf(text: string): Array<{ name: string; at: number }> {
  const out: Array<{ name: string; at: number }> = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const code = line.replace(/#.*$/, (m, i: number) => ' '.repeat(m.length) + '' + (i >= 0 ? '' : ''));
    const stripped = code.replace(/'(?:[^'\\]|\\.)*'/g, (m) => ' '.repeat(m.length));
    for (const m of stripped.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) out.push({ name: m[0], at: offset + (m.index as number) });
    offset += line.length + 1;
  }
  return out;
}
const VARIABLES = new Set(['base', 'bars', 'a', 'b', 'tracks', 'sections', 'changes', 'stop', 'bar', 'mixed']);
const CALLS = ['extend_rhythm', 'thin_out_bars', 'double_up_bars', 'morph_rhythm', 'morph_rhythm_info', 'mix_rhythm', 'combine_tracks', 'compose_sections', 'append', 'globals'];

for (const kind of KINDS) {
  test(`CORRUPTIONS (${kind}, 40 seeded cases): every damage of a rendered Python that must leave it not a known shape is refused - a name, a keyword, a variable used once wrong, a function, the return, an extra or swapped statement`, () => {
    const r = rng(20261103 + kind.length);
    let refused = 0;
    for (let i = 0; i < 40; i++) {
      const text = renderPython(GEN[kind](r));
      assert.ok(parsePython(text).ok, `${kind} #${i}: the undamaged text is read`);
      const ids = identifiersOf(text);
      const damaged: Array<[string, string]> = [];
      for (const { name, at } of ids) {
        if (VARIABLES.has(name)) damaged.push([`variable ${name} at ${at}`, `${text.slice(0, at)}zz_${name}${text.slice(at + name.length)}`]);
        else if (CALLS.includes(name)) damaged.push([`function ${name} at ${at}`, `${text.slice(0, at)}${name}_x${text.slice(at + name.length)}`]);
        else if (/^(?:data|style|tempo_change_pct|first|last|amount|grid|row|keep|seed|order|position|weight|threshold|ghost|kit|channels|source|length|mute|solo|volume)$/.test(name) && text[at + name.length] === '=') damaged.push([`keyword ${name} at ${at}`, `${text.slice(0, at)}${name}_x${text.slice(at + name.length)}`]);
      }
      const lines = text.split('\n');
      const code = lines.map((l, k) => [l, k] as const).filter(([l]) => !l.trim().startsWith('#'));
      damaged.push(['the return dropped', lines.filter((l) => !/^\s+return\b/.test(l)).join('\n')]);
      damaged.push(['the def name', text.replace('def compute', 'def compute2')]);
      damaged.push(['the def has no colon', text.replace('compute(context):', 'compute(context)')]);
      damaged.push(['an extra statement before the return', text.replace(/\n(\s+)return/, '\n$1pass\n$1return')]);
      damaged.push(['an extra statement at the end', `${text}\n  pass`]);
      damaged.push(['the first statement swapped with the second', (() => { const c = lines.slice(); [c[1], c[2]] = [c[2], c[1]]; return c.join('\n'); })()]);
      damaged.push(['a positional argument added to the first call', text.replace(/\(([a-z_]+=)/, '(1, $1')]);
      damaged.push(['an unknown keyword added to the first call', text.replace(/\(([a-z_]+=)/, '(zzz=1, $1')]);
      damaged.push(['a statement cut in two', text.replace(/\n(\s+)([a-z_]+) = /, '\n$1$2 =')]);
      void code;
      for (const [why, t] of damaged) {
        if (why.startsWith('a statement cut in two') || why.startsWith('the first statement swapped') && kind === 'morph') continue;       // a space is no damage; a morph\'s a and b are swapped by name (not by position) and that reading is a different, valid one
        assert.equal(parsePython(t).ok, false, `${kind} #${i}: ${why} is still read\n${t}`);
        refused++;
      }
    }
    assert.ok(refused > 300, `non-vacuous: ${refused} damaged texts were all refused`);
  });
}

test('the reader\'s own edges: tabs between tokens, an escape in a string, a repeated or misplaced argument, a fork that is not a bar, a dict with a repeated key, a list that is not empty, another method than append', () => {
  const ok = (text: string) => assert.ok(parsePython(text).ok, text);
  const no = (text: string) => assert.equal(parsePython(text).ok, false, text);
  ok("def compute(context):\n\tbase\t=\tbar_005()\n\tbars\t=\textend_rhythm(data=base,\tbars=8,\tstyle='building',\ttempo_change_pct=0)\n\treturn\tbars");
  const transform = (row: string) => `def compute(context):\n  s = phrase_003()\n  s = thin_out_bars(bars=s, first=1, last=1, row=${row}, amount=0.5)\n  return s`;
  const read = parsePython(transform("'ki\\ck'"));
  assert.deepEqual(read.ok && (read.params as { ops: Array<{ row?: string }> }).ops[0].row, 'kick', 'a backslash makes the next character itself');
  no(transform("'kick"));                                                                                  // unterminated
  no(transform("'kick\\"));                                                                                // ends on the escape
  const extend = (extra: string, ret = 'return bars') => `def compute(context):\n  base = bar_005()\n  bars = extend_rhythm(data=base, bars=8, style='building', tempo_change_pct=0)${extra}\n  ${ret}`;
  ok(extend('\n  bars[0] = bar_009()'));
  no(extend('\n  bars[2.5] = bar_009()'));
  no(extend('\n  bars[-1] = bar_009()'));
  no(extend("\n  bars['x'] = bar_009()"));
  no(extend('\n  bars[0] = bar_009(1)'));
  no(extend('\n  other[0] = bar_009()'));
  no(extend('\n  bars[0] = bar_009()', 'return other'));
  no(extend('', 'return [bars]'));
  no("def compute(context):\n  base = bar_005()\n  bars = extend_rhythm(data=base, bars=8, bars=9, style='building', tempo_change_pct=0)\n  return bars");
  no("def compute(context):\n  base = bar_005()\n  bars = extend_rhythm(data=base, bars=8, style='building', 0)\n  return bars");
  no("def compute(context):\n  base = bar_005()\n  bars = extend_rhythm(data=base, bars=8, style='building', tempo_change_pct=0\n  return bars");                       // a missing )
  no("def compute(context):\n  base = bar_005()\n  bars = extend_rhythm(data=base, bars=8, style='building', tempo_change_pct=0))\n  return bars");                      // an extra )
  const arr = (appendTo = 'tracks', init = '[]', entry = "{'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_001()}") => `def compute(context):\n  tracks = ${init}\n  ${appendTo}.append(${entry})\n  bars = combine_tracks(tracks=tracks)\n  return bars`;
  ok(arr());
  no(arr('other')); no(arr('tracks', '[1]')); no(arr('tracks', '{}'));
  no(arr('tracks', '[]', "{'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_001(), 'kit': 'rock'}"));
  no(arr('tracks', '[]', "{'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_001(), 'mute': False}"));
  no(arr('tracks', '[]', "{'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_001(), 'zzz': True}"));
  no(arr('tracks', '[]', "{'kit': 'rock', 'bars': phrase_001()}"));
  no(arr('tracks', '[]', "{'kit': 'rock', 'channels': rock()['rows'], 'bars': phrase_001()}"));
  no(arr('tracks', '[]', "{'kit': 'rock', 'channels': rock, 'bars': phrase_001()}"));
  no(arr('tracks', '[]', "{'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_001}"));
  no(arr('tracks', '[]', "{'kit': 3, 'channels': rock()['channels'], 'bars': phrase_001()}"));
  no(arr('tracks', '[]', "{'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_001(), 'volume': 'loud'}"));
  no(arr('tracks').replace('.append(', '.extend(').replace('})', '}])'));
  no(arr('tracks').replace('.append(', '.append(1, '));
  no(arr('tracks').replace('  return bars', '  return tracks'));
  no(arr('tracks').replace('combine_tracks(tracks=tracks)', 'combine_tracks(tracks=other)'));
  no(arr('tracks').replace('  bars = combine_tracks(tracks=tracks)\n', ''));
  const comp = (entry = "{'source': 'phrase_001', 'bars': phrase_001(), 'length': 4}") => `def compute(context):\n  sections = []\n  sections.append(${entry})\n  bars = compose_sections(sections=sections)\n  return bars`;
  ok(comp());
  no(comp("{'source': 'phrase_001', 'bars': phrase_002(), 'length': 4}"));
  no(comp("{'source': 'phrase_001', 'length': 4}"));
  no(comp("{'source': 'phrase_001', 'bars': phrase_001(), 'length': 'four'}"));
  no(comp("{'source': 'phrase_001', 'bars': phrase_001(), 'zzz': 4}"));
  no(comp("{'source': 'phrase_001', 'bars': phrase_001(), 'source': 'phrase_001'}"));
  no(comp("{'source': 7, 'bars': phrase_001()}"));
  no(comp().replace('compose_sections(sections=sections)', 'compose_sections(sections=others)'));
  no(comp().replace('sections = []', 'sections = [1]'));
  no(comp().replace('sections.append', 'other.append'));
  no(comp().replace('  return bars', '  return sections'));
  no(comp().replace('append({', 'append(1, {'));
  no(`def compute(context):\n  sections = []\n  bars = compose_sections(sections=sections)\n  return bars`);
});

// ---- added by the 1155 mutation pass (second round): parsePython never THROWS on a person's Python, whatever its shape or length ---------------------------------------------------------------------------------------------------------

test('parsePython never throws: bodies of every length from 1 to 8 statements made of pieces of every shape, cut, repeated and shuffled; the answer is a refusal or a reading that renders back to the same reading', () => {
  const r = rng(20261104);
  const pieces: string[] = [];
  for (const kind of KINDS) for (let i = 0; i < 3; i++) pieces.push(...renderPython(GEN[kind](r)).split('\n').slice(1).filter((l) => l.trim() !== '' && !l.trim().startsWith('#')));
  pieces.push('x = 1', 'x = []', 'x = [1]', 'x = {}', 'x = bar_005()', 'return x', 'return [x]', 'return', 'x.append({})', "x.append({'kit': 'a'})", 'x[0] = bar_005()', 'x = x[0]', 'x = f(a=x)', 'x = -y', 'x = 1 / 2', 'x = (1 + 2) * 3 // 4', 'pass', 'x = [y, z]', "x = {'a': 1, 'b': 2}", 'x = bar_005()()', 'x = globals()', "x = globals()['a']", 'x = a.b.c(d)');
  let tried = 0, read = 0;
  for (let n = 1; n <= 8; n++) {
    for (let i = 0; i < 160; i++) {
      const body = Array.from({ length: n }, () => `  ${pieces[r.int(0, pieces.length - 1)].trim()}`).join('\n');
      const text = `def compute(context):\n${body}`;
      let result: ReturnType<typeof parsePython>;
      assert.doesNotThrow(() => { result = parsePython(text); }, text);
      tried++;
      if (result!.ok) { read++; assert.deepEqual(parsePython(renderPython(result!.params)), { ok: true, params: result!.params }, `a reading renders back to itself\n${text}`); }
    }
  }
  // the pieces of ONE valid shape, cut, repeated and shuffled: the near misses a person makes by editing
  for (const kind of KINDS) {
    for (let i = 0; i < 30; i++) {
      const lines = renderPython(GEN[kind](r)).split('\n');
      const body = lines.slice(1).filter((l) => !l.trim().startsWith('#'));
      for (let k = 0; k < 12; k++) {
        const cut = body.filter(() => r.next() > 0.25);
        if (r.next() > 0.5 && cut.length > 1) { const a = r.int(0, cut.length - 1), b = r.int(0, cut.length - 1); [cut[a], cut[b]] = [cut[b], cut[a]]; }
        if (r.next() > 0.7 && cut.length > 0) cut.push(cut[r.int(0, cut.length - 1)]);
        const text = [lines[0], ...cut].join('\n');
        assert.doesNotThrow(() => { parsePython(text); }, text);
        tried++;
      }
    }
  }
  assert.ok(tried > 3000 && read < tried, `non-vacuous: ${tried} texts tried, ${read} read`);
});

test('the numbers a Python may hold: exponents, leading and trailing dots, a negative; an operator on a name is not a number', () => {
  const extend = (pct: string) => `def compute(context):\n  base = bar_005()\n  bars = extend_rhythm(data=base, bars=8, style='building', tempo_change_pct=${pct})\n  return bars`;
  const pct = (s: string): number | null => { const rd = parsePython(extend(s)); return rd.ok ? (rd.params as { tempo_change_pct: number }).tempo_change_pct : null; };
  assert.equal(pct('-20'), -20);
  assert.equal(pct('2.5'), 2.5);
  assert.equal(pct('1e1'), 10);
  assert.equal(pct('.5'), 0.5);
  assert.equal(pct('- 3'), -3);
  assert.equal(pct('-x'), null);
  assert.equal(pct('1 / 2'), null);
  assert.equal(pct('(1)'), 1);
  assert.equal(pct('10 - 2'), null, 'arithmetic is not a literal');
});
