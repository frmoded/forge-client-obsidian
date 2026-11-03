// 2026-11-02-1155 (score_first M16b, design 4.14) - the PYTHON facet is editable and becomes the source: `parsePython` is the inverse of the three Python renderers (phrasePython, arrangementPython, compositionPython). A Python that is one of
// the KNOWN SHAPES, up to whitespace, comments, the quote style, the order of the keyword arguments and the names of the variables, gives back the params it was made from (every result goes through the plugin's own validators, as
// the Description and Recipe grammars' do); anything else is `{ ok: false }` and the caller makes the note a CUSTOM one. Pure: no `obsidian`, no engine.
import { canonical } from './phrase-describe-core.ts';
import { phrasePython } from './phrase-notes-core.ts';
import { arrangementPython, validateArrangement } from './arrangement-core.ts';
import { compositionPython, validateComposition } from './composition-core.ts';
import { validatePhrase } from './phrase-core.ts';
import type { GrammarParams } from './phrase-grammar-core.ts';

/** The Python the plugin writes for these params (the three renderers behind one name). */
export function renderPython(p: GrammarParams): string {
  return p.kind === 'arrangement' ? arrangementPython(p) : p.kind === 'composition' ? compositionPython(p) : phrasePython(p);
}

// ---- a small reader for the one-line statements the renderers write ------------------------------------------------------------------------------------------------------------------

type E =
  | { t: 'id'; v: string } | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'const'; v: 'True' | 'False' | 'None' }
  | { t: 'call'; f: E; args: E[]; kw: Array<[string, E]> } | { t: 'attr'; e: E; name: string } | { t: 'sub'; e: E; i: E } | { t: 'list'; items: E[] } | { t: 'dict'; pairs: Array<[E, E]> } | { t: 'bin'; op: string; l: E; r: E };
type Tok = { k: 'id' | 'num' | 'str' | 'p'; v: string };

function tokenize(line: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#') break;                                                          // a comment ends the line
    const rest = line.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { out.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/.exec(rest))) { out.push({ k: 'num', v: m[0] }); i += m[0].length; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      for (; j < line.length && line[j] !== c; j++) {
        if (line[j] === '\\') { j++; if (j >= line.length) return null; s += line[j]; } else s += line[j];
      }
      if (j >= line.length) return null;
      out.push({ k: 'str', v: s }); i = j + 1; continue;
    }
    if (rest.startsWith('//')) { out.push({ k: 'p', v: '//' }); i += 2; continue; }
    if ('()[]{},:=.+-*/'.includes(c)) { out.push({ k: 'p', v: c }); i++; continue; }
    return null;
  }
  return out;
}

class Reader {
  i = 0;
  readonly toks: Tok[];
  constructor(toks: Tok[]) { this.toks = toks; }
  peek(): Tok | undefined { return this.toks[this.i]; }
  is(v: string): boolean { const t = this.peek(); return t !== undefined && t.k === 'p' && t.v === v; }
  eat(v: string): boolean { if (this.is(v)) { this.i++; return true; } return false; }
  need(v: string): void { if (!this.eat(v)) throw new Error(`expected ${v}`); }
  done(): boolean { return this.i >= this.toks.length; }
  expr(): E { return this.add(); }
  private add(): E {
    let l = this.mul();
    for (;;) { const op = this.is('+') ? '+' : this.is('-') ? '-' : ''; if (op === '') return l; this.i++; l = { t: 'bin', op, l, r: this.mul() }; }
  }
  private mul(): E {
    let l = this.unary();
    for (;;) { const op = this.is('*') ? '*' : this.is('//') ? '//' : this.is('/') ? '/' : ''; if (op === '') return l; this.i++; l = { t: 'bin', op, l, r: this.unary() }; }
  }
  private unary(): E {
    if (this.eat('-')) { const e = this.unary(); return e.t === 'num' ? { t: 'num', v: -e.v } : { t: 'bin', op: '-', l: { t: 'num', v: 0 }, r: e }; }
    return this.postfix();
  }
  private postfix(): E {
    let e = this.atom();
    for (;;) {
      if (this.eat('(')) {
        const args: E[] = []; const kw: Array<[string, E]> = [];
        while (!this.is(')')) {
          const t = this.peek(), n = this.toks[this.i + 1];
          if (t?.k === 'id' && n?.k === 'p' && n.v === '=') { this.i += 2; kw.push([t.v, this.expr()]); } else { if (kw.length > 0) throw new Error('positional after keyword'); args.push(this.expr()); }
          if (!this.eat(',')) break;
        }
        this.need(')'); e = { t: 'call', f: e, args, kw };
      } else if (this.eat('[')) { const i = this.expr(); this.need(']'); e = { t: 'sub', e, i }; }
      else if (this.eat('.')) { const t = this.peek(); if (t?.k !== 'id') throw new Error('expected a name'); this.i++; e = { t: 'attr', e, name: t.v }; }
      else return e;
    }
  }
  private atom(): E {
    const t = this.peek();
    if (!t) throw new Error('unexpected end');
    if (t.k === 'num') { this.i++; return { t: 'num', v: Number(t.v) }; }
    if (t.k === 'str') { this.i++; return { t: 'str', v: t.v }; }
    if (t.k === 'id') { this.i++; return t.v === 'True' || t.v === 'False' || t.v === 'None' ? { t: 'const', v: t.v } : { t: 'id', v: t.v }; }
    if (this.eat('(')) { const e = this.expr(); this.need(')'); return e; }
    if (this.eat('[')) { const items: E[] = []; while (!this.is(']')) { items.push(this.expr()); if (!this.eat(',')) break; } this.need(']'); return { t: 'list', items }; }
    if (this.eat('{')) { const pairs: Array<[E, E]> = []; while (!this.is('}')) { const k = this.expr(); this.need(':'); pairs.push([k, this.expr()]); if (!this.eat(',')) break; } this.need('}'); return { t: 'dict', pairs }; }
    throw new Error(`unexpected ${t.v}`);
  }
}

type Stmt = { kind: 'assign'; target: E; value: E } | { kind: 'expr'; e: E } | { kind: 'return'; e: E };

function readStatement(line: string): Stmt | null {
  const toks = tokenize(line);
  if (toks === null || toks.length === 0) return null;
  try {
    const r = new Reader(toks);
    if (toks[0].k === 'id' && toks[0].v === 'return') { r.i = 1; const e = r.expr(); return r.done() ? { kind: 'return', e } : null; }
    const e = r.expr();
    if (r.eat('=')) { const value = r.expr(); return r.done() && (e.t === 'id' || e.t === 'sub') ? { kind: 'assign', target: e, value } : null; }
    return r.done() ? { kind: 'expr', e } : null;
  } catch { return null; }
}

/** The body statements of `def compute(<name>):` (blank and comment lines dropped; one indent width, at least one space or tab), or null when the text is not that shape. */
function bodyOf(text: string): Stmt[] | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  if (lines.length < 2 || !/^def\s+compute\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s*\)\s*:\s*(?:#.*)?$/.test(lines[0])) return null;
  const indent = /^[ \t]+/.exec(lines[1])?.[0];
  if (!indent) return null;
  const out: Stmt[] = [];
  for (const line of lines.slice(1)) {
    if (!line.startsWith(indent) || /^\s/.test(line.slice(indent.length))) return null;
    const s = readStatement(line.slice(indent.length));
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

// ---- the shapes ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const idName = (e: E | undefined): string | null => (e !== undefined && e.t === 'id' ? e.v : null);
const num = (e: E | undefined): number | null => (e !== undefined && e.t === 'num' ? e.v : null);
const str = (e: E | undefined): string | null => (e !== undefined && e.t === 'str' ? e.v : null);
/** `name()` or `globals()['name']()`: the note a call reads, by its name. */
function noteCall(e: E | undefined): string | null {
  if (e === undefined || e.t !== 'call' || e.args.length > 0 || e.kw.length > 0) return null;
  if (e.f.t === 'id') return e.f.v;
  if (e.f.t === 'sub' && e.f.e.t === 'call' && e.f.e.f.t === 'id' && e.f.e.f.v === 'globals' && e.f.e.args.length === 0 && e.f.i.t === 'str') return e.f.i.v;
  return null;
}
/** A call of `fn` whose keyword arguments are exactly `keys` (any order) or, with `optional`, those plus some of these; no positional ones. */
function callOf(e: E | undefined, fn: string, keys: string[], optional: string[] = []): Record<string, E> | null {
  if (e === undefined || e.t !== 'call' || e.f.t !== 'id' || e.f.v !== fn || e.args.length > 0) return null;
  const got: Record<string, E> = {};
  for (const [k, v] of e.kw) { if (k in got || !(keys.includes(k) || optional.includes(k))) return null; got[k] = v; }
  return keys.every((k) => k in got) ? got : null;
}
const idOfName = (name: string): string => (/^phrase_\d+$/.test(name) ? `phrases/${name}` : /^arr_\d+$/.test(name) ? `arrangements/${name}` : `compositions/${name}`);
const sameNum = (e: E | undefined, v: number): boolean => num(e) === v;

type Raw = Record<string, unknown>;
/** The forks that follow a phrase's bars (`bars[2] = note()`), then `return <the bars>`: the params' `overrides`, or null when the rest is not that. */
function forksAndReturn(rest: Stmt[], bars: string, wrapped: boolean): { overrides?: Record<string, string> } | null {
  const overrides: Record<string, string> = {};
  let i = 0;
  for (; i < rest.length; i++) {
    const s = rest[i];
    if (s.kind !== 'assign' || s.target.t !== 'sub' || idName(s.target.e) !== bars) break;
    const at = num(s.target.i), name = noteCall(s.value);
    if (at === null || !Number.isInteger(at) || at < 0 || name === null) return null;
    overrides[String(at + 1)] = `bars/${name}`;
  }
  const last = rest[i];
  if (i !== rest.length - 1 || last.kind !== 'return' || wrapped || idName(last.e) !== bars) return null;
  return Object.keys(overrides).length > 0 ? { overrides } : {};
}

function readExtend(b: Stmt[]): Raw | null {
  if (b.length < 3 || b[0].kind !== 'assign' || b[1].kind !== 'assign') return null;
  const base = idName(b[0].target), source = noteCall(b[0].value), bars = idName(b[1].target);
  const c = callOf(b[1].value, 'extend_rhythm', ['data', 'bars', 'style', 'tempo_change_pct']);
  if (base === null || source === null || bars === null || c === null || idName(c.data) !== base) return null;
  const n = num(c.bars), style = str(c.style), pct = num(c.tempo_change_pct);
  const f = forksAndReturn(b.slice(2), bars, false);
  return n === null || style === null || pct === null || f === null ? null : { kind: 'extend', source, bars: n, style, tempo_change_pct: pct, ...f };
}

function readTransform(b: Stmt[]): Raw | null {
  if (b.length < 3 || b[0].kind !== 'assign') return null;
  const bars = idName(b[0].target), source = noteCall(b[0].value);
  if (bars === null || source === null) return null;
  const ops: Raw[] = [];
  let i = 1;
  for (; i < b.length; i++) {
    const s = b[i];
    if (s.kind !== 'assign' || idName(s.target) !== bars) break;
    const thin = callOf(s.value, 'thin_out_bars', ['bars', 'first', 'last', 'amount'], ['row', 'keep', 'seed']);
    const dbl = thin === null ? callOf(s.value, 'double_up_bars', ['bars', 'first', 'last', 'grid'], ['row']) : null;
    const c = thin ?? dbl;
    if (c === null || idName(c.bars) !== bars) return null;
    const first = num(c.first), last = num(c.last), row = c.row === undefined ? undefined : str(c.row);
    if (first === null || last === null || row === null) return null;
    if (thin !== null) {
      const amount = num(thin.amount), keep = thin.keep === undefined ? undefined : str(thin.keep), seed = thin.seed === undefined ? undefined : num(thin.seed);
      if (amount === null || keep === null || seed === null || (keep === undefined) !== (seed === undefined) || (keep !== undefined && keep !== 'seeded')) return null;
      ops.push({ op: 'thin_out', first, last, ...(row !== undefined ? { row } : {}), amount, ...(keep !== undefined ? { keep: 'seeded', seed } : {}) });
    } else {
      const grid = num(dbl!.grid);
      if (grid === null) return null;
      ops.push({ op: 'double_up', first, last, ...(row !== undefined ? { row } : {}), grid });
    }
  }
  const f = forksAndReturn(b.slice(i), bars, false);
  return ops.length === 0 || f === null ? null : { kind: 'transform', source: idOfName(source), ops, ...f };
}

function readMorph(b: Stmt[]): Raw | null {
  if (b.length < 4 || b[0].kind !== 'assign' || b[1].kind !== 'assign' || b[2].kind !== 'assign') return null;
  const a = idName(b[0].target), an = noteCall(b[0].value), bn = noteCall(b[1].value), bb = idName(b[1].target), bars = idName(b[2].target);
  if (a === null || an === null || bb === null || bn === null || bars === null) return null;
  const v = b[2].value;
  const one = v.t === 'list' && v.items.length === 1;
  const c = callOf(one ? v.items[0] : v, 'morph_rhythm', ['a', 'b', 'bars', 'order', 'seed'], one ? ['position'] : []);
  if (c === null || idName(c.a) !== a || idName(c.b) !== bb) return null;
  const n = num(c.bars), order = str(c.order), seed = num(c.seed), position = c.position === undefined ? undefined : num(c.position);
  if (n === null || order === null || seed === null || position === null || (one ? n !== 1 || position === undefined : n === 1)) return null;
  const f = forksAndReturn(b.slice(3), bars, false);
  return f === null ? null : { kind: 'morph', a: an, b: bn, bars: n, order, seed, ...(one ? { position } : {}), ...f };
}

function readMix(b: Stmt[]): Raw | null {
  if (b.length < 4 || b[0].kind !== 'assign' || b[1].kind !== 'assign' || b[2].kind !== 'assign') return null;
  const a = idName(b[0].target), an = noteCall(b[0].value), bb = idName(b[1].target), bn = noteCall(b[1].value);
  if (a === null || an === null || bb === null || bn === null) return null;
  const v = b[2].value;
  if (b.length === 4) {                                                                            // a vote
    const out = idName(b[2].target), c = callOf(v, 'mix_rhythm', ['a', 'b', 'weight', 'threshold', 'ghost']), r = b[3];
    if (out === null || c === null || idName(c.a) !== a || idName(c.b) !== bb || r.kind !== 'return' || r.e.t !== 'list' || r.e.items.length !== 1 || idName(r.e.items[0]) !== out) return null;
    const weight = num(c.weight), threshold = num(c.threshold), ghost = c.ghost.t === 'const' && (c.ghost.v === 'True' || c.ghost.v === 'False') ? c.ghost.v === 'True' : null;
    return weight === null || threshold === null || ghost === null ? null : { kind: 'mix', a: an, b: bn, weight, threshold, ghost };
  }
  if (b.length !== 6 || b[3].kind !== 'assign' || b[4].kind !== 'assign' || b[5].kind !== 'return') return null;       // a path
  const changes = idName(b[2].target);
  const info = v.t === 'sub' && str(v.i) === 'd' ? callOf(v.e, 'morph_rhythm_info', ['a', 'b', 'order', 'seed']) : null;
  const stop = idName(b[3].target), bar = idName(b[4].target);
  if (changes === null || info === null || stop === null || bar === null || idName(info.a) !== a || idName(info.b) !== bb) return null;
  const order = str(info.order), seed = num(info.seed);
  const e = b[3].value;
  const millionths = e.t === 'call' && e.args.length === 2 && e.args[1].t === 'call' && e.args[1].args.length === 2 && e.args[1].args[1].t === 'bin' ? e.args[1].args[1].l : null;   // the millionths sit in min(c, max(0, ((1000000 - M) * c + 500000) // 1000000))
  const m = millionths !== null && millionths.t === 'bin' && millionths.l.t === 'bin' && millionths.l.l.t === 'bin' ? num(millionths.l.l.r) : null;
  if (order === null || seed === null || m === null) return null;
  const want = new Reader(tokenize(`min(${changes}, max(0, ((1000000 - ${m}) * ${changes} + 500000) // 1000000))`)!).expr();
  if (JSON.stringify(want) !== JSON.stringify(e)) return null;
  const c = callOf(b[4].value, 'morph_rhythm', ['a', 'b', 'bars', 'order', 'seed', 'position']);
  const r = b[5];
  if (c === null || idName(c.a) !== a || idName(c.b) !== bb || !sameNum(c.bars, 1) || str(c.order) !== order || !sameNum(c.seed, seed) || idName(c.position) !== stop) return null;
  if (r.kind !== 'return' || r.e.t !== 'list' || r.e.items.length !== 1 || idName(r.e.items[0]) !== bar) return null;
  return { kind: 'mix', a: an, b: bn, weight: m / 1e6, threshold: 0.5, ghost: false, mode: 'path', order, seed };
}

/** `<list>.append(<dict>)`: the dict, or null. */
function appended(s: Stmt, list: string): Array<[E, E]> | null {
  if (s.kind !== 'expr' || s.e.t !== 'call' || s.e.f.t !== 'attr' || s.e.f.name !== 'append' || idName(s.e.f.e) !== list || s.e.args.length !== 1 || s.e.kw.length > 0 || s.e.args[0].t !== 'dict') return null;
  return s.e.args[0].pairs;
}
const field = (pairs: Array<[E, E]>, key: string): E | undefined => pairs.find(([k]) => str(k) === key)?.[1];
const keysOf = (pairs: Array<[E, E]>): string[] | null => { const ks = pairs.map(([k]) => str(k)); return ks.every((k) => k !== null) && new Set(ks).size === ks.length ? (ks as string[]) : null; };

/** `tracks = []`, one `tracks.append({'kit': .., 'channels': kit()['channels'], 'bars': phrase()[, 'mute': True][, 'solo': True][, 'volume': N]})` per track, `bars = combine_tracks(tracks=tracks)`, `return bars`. */
function readArrangement(b: Stmt[]): Raw | null {
  if (b.length < 4 || b[0].kind !== 'assign' || b[0].value.t !== 'list' || b[0].value.items.length > 0) return null;
  const list = idName(b[0].target);
  if (list === null) return null;
  const tracks: Raw[] = [];
  let i = 1;
  for (; i < b.length; i++) {
    const pairs = appended(b[i], list);
    if (pairs === null) break;
    const keys = keysOf(pairs);
    if (keys === null || !['kit', 'channels', 'bars'].every((k) => keys.includes(k)) || keys.some((k) => !['kit', 'channels', 'bars', 'mute', 'solo', 'volume'].includes(k))) return null;
    const kit = str(field(pairs, 'kit')), phrase = noteCall(field(pairs, 'bars'));
    const ch = field(pairs, 'channels');
    if (kit === null || phrase === null || ch === undefined || ch.t !== 'sub' || str(ch.i) !== 'channels' || noteCall(ch.e) !== kit) return null;
    const flag = (k: string): true | undefined | null => { const v = field(pairs, k); return v === undefined ? undefined : v.t === 'const' && v.v === 'True' ? true : null; };
    const mute = flag('mute'), solo = flag('solo');
    const volume = field(pairs, 'volume') === undefined ? undefined : num(field(pairs, 'volume'));
    if (mute === null || solo === null || volume === null) return null;
    tracks.push({ kit, phrase, ...(mute ? { mute } : {}), ...(solo ? { solo } : {}), ...(volume !== undefined ? { volume } : {}) });
  }
  const make = b[i], ret = b[i + 1];
  if (tracks.length === 0 || i !== b.length - 2 || make.kind !== 'assign' || ret.kind !== 'return') return null;
  const out = idName(make.target), c = callOf(make.value, 'combine_tracks', ['tracks']);
  return out === null || c === null || idName(c.tracks) !== list || idName(ret.e) !== out ? null : { kind: 'arrangement', tracks };
}

/** `sections = []`, one `sections.append({'source': name, 'bars': name()[, 'length': N]})` per PLAYED section (a repeat is one more line), `bars = compose_sections(sections=sections)`, `return bars`. */
function readComposition(b: Stmt[]): { raw: Raw; played: Array<{ source: string; length?: number }> } | null {
  if (b.length < 4 || b[0].kind !== 'assign' || b[0].value.t !== 'list' || b[0].value.items.length > 0) return null;
  const list = idName(b[0].target);
  if (list === null) return null;
  const played: Array<{ source: string; length?: number }> = [];
  let i = 1;
  for (; i < b.length; i++) {
    const pairs = appended(b[i], list);
    if (pairs === null) break;
    const keys = keysOf(pairs);
    if (keys === null || !['source', 'bars'].every((k) => keys.includes(k)) || keys.some((k) => !['source', 'bars', 'length'].includes(k))) return null;
    const source = str(field(pairs, 'source')), name = noteCall(field(pairs, 'bars'));
    const length = field(pairs, 'length') === undefined ? undefined : num(field(pairs, 'length'));
    if (source === null || name === null || name !== source || length === null) return null;
    played.push({ source: idOfName(source), ...(length !== undefined ? { length } : {}) });
  }
  const make = b[i], ret = b[i + 1];
  if (played.length === 0 || i !== b.length - 2 || make.kind !== 'assign' || ret.kind !== 'return') return null;
  const out = idName(make.target), c = callOf(make.value, 'compose_sections', ['sections']);
  if (out === null || c === null || idName(c.sections) !== list || idName(ret.e) !== out) return null;
  // a section played twice in a row with the same length reads as ONE section repeated once (the Python cannot tell the two apart; `hint` settles it when it can)
  const sections: Array<{ source: string; length?: number; repeat?: number }> = [];
  for (const p of played) {
    const last = sections[sections.length - 1];
    if (last !== undefined && last.source === p.source && last.length === p.length) last.repeat = (last.repeat ?? 0) + 1;
    else sections.push({ ...p });
  }
  return { raw: { kind: 'composition', sections }, played };
}

export type PythonRead = { ok: true; params: GrammarParams } | { ok: false };

/** What the plugin's own validators accept of a raw reading, as the grammar's canonical params. */
function validated(raw: Raw): GrammarParams | null {
  const v = raw.kind === 'arrangement' ? validateArrangement(raw) : raw.kind === 'composition' ? validateComposition(raw) : validatePhrase(raw);
  return v.ok ? canonical(v.value as GrammarParams) : null;
}

function readText(text: string): PythonRead {
  const body = bodyOf(text);
  if (body === null) return { ok: false };
  const comp = readComposition(body);
  const raw = comp !== null ? comp.raw : readExtend(body) ?? readTransform(body) ?? readMorph(body) ?? readMix(body) ?? readArrangement(body);
  const params = raw === null ? null : validated(raw);
  return params === null ? { ok: false } : { ok: true, params };
}

/**
 * The params this Python was made from, or `{ ok: false }` when it is not one of the known shapes (the note is then a custom one). `hint` is the params the note's json cache holds now: a Python that reads as what THEIR Python reads as
 * (the same shape up to the same whitespace, comment and name freedom) is theirs, so the reading is them - which is how the things a Python cannot carry (a path mix's threshold and ghost notes, a composition's two equal sections that
 * are not one repeated) come back.
 */
export function parsePython(text: string, hint?: GrammarParams | null): PythonRead {
  const read = readText(text);
  if (!read.ok || !hint) return read;
  const theirs = readText(renderPython(hint));
  return theirs.ok && JSON.stringify(theirs.params) === JSON.stringify(read.params) ? { ok: true, params: canonical(hint) } : read;
}
