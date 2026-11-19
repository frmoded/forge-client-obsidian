// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - the NOTE side of a bar's list (11d.1): the list lives in the front matter key `lines:` (a YAML list of canonical sentences), the BODY stays exactly one json fence, `description:` stays what it is.
// Pure strings in, strings out. Written RED first (the module did not exist). The Beat Box's own reader is the witness that the note stays a bar it can open.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { barLinesBlock, hasBarLines, readBarLines, writeBarNote, withBarLines, withoutBarLines, inspectBarNote } from './bar-list-note-core.ts';
import { BAR_BASE, baselineList, replayBar } from './bar-list-core.ts';
import { stopNotice } from './sentence-list-core.ts';
import { headSentence } from './bar-grammar-core.ts';
import { extractJsonBlock, formatRhythmJson, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { barOriginOf, hasBarProvenance } from './bar-provenance-core.ts';
import { planNewBar } from './score-first-core.ts';
import { forkNoteContent } from './phrase-fork-core.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const BAR_001 = PLAYGROUND_BARS['bar_001'];
const dataOf = (text: string): RhythmData => { const r = readRhythmNote(text); assert.equal(r.ok, true, JSON.stringify(r)); return (r as { value: { data: RhythmData } }).value.data; };
const fence = (text: string): string => { const b = extractJsonBlock(text) as Extract<ReturnType<typeof extractJsonBlock>, { ok: true }>; return text.slice(b.contentStart, b.contentEnd); };
const newBar = (): string => { const p = planNewBar({ existingBasenames: [], exists: () => false }); assert.equal(p.ok, true); return (p as { content: string }).content; };
const HEAD = headSentence(dataOf(BAR_001))!;

// ---- reading `lines:` ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a bar with no `lines:` has none (hasLines false); `lines: []` is an empty list (hasLines true): the difference is the baseline of 11d.2', () => {
  assert.deepEqual(readBarLines(BAR_001), { hasLines: false, lines: [] });
  assert.equal(hasBarLines(BAR_001), false);
  const empty = BAR_001.replace('\n---\n', '\nlines: []\n---\n');
  assert.deepEqual(readBarLines(empty), { hasLines: true, lines: [] });
  assert.equal(readBarLines('no front matter'), null);
});

test('the YAML forms read: a block list (double quoted, single quoted, plain), a flow list, CRLF; the next key ends the list', () => {
  const mk = (block: string, eol = '\n') => BAR_001.replace(/\n/g, eol).replace(`${eol}---${eol}`, `${eol}${block.replace(/\n/g, eol)}${eol}---${eol}`);
  assert.deepEqual(readBarLines(mk('lines:\n  - "Hit kick on step 3."\n  - \'Clear kick on step 1.\'\n  - Set the tempo to 100.')), { hasLines: true, lines: ['Hit kick on step 3.', 'Clear kick on step 1.', 'Set the tempo to 100.'] });
  assert.deepEqual(readBarLines(mk('lines:\n- "Hit kick on step 3."\nlinks:\n  - "[[x]]"')).lines, ['Hit kick on step 3.']);
  assert.deepEqual(readBarLines(mk('lines: ["Hit kick on step 3.", "Clear kick on step 1."]')).lines, ['Hit kick on step 3.', 'Clear kick on step 1.']);
  assert.deepEqual(readBarLines(mk('lines:\n  - "Hit kick on step 3."\n  - "Clear kick on step 1."', '\r\n')).lines, ['Hit kick on step 3.', 'Clear kick on step 1.']);
  assert.deepEqual(readBarLines(mk('lines:\n  - "say \\"hi\\" and a \\\\ slash"')).lines, ['say "hi" and a \\ slash']);
  assert.deepEqual(readBarLines(mk('lines: [not json')), { hasLines: true, lines: [] }, 'a broken flow list is an empty one (nothing is invented)');
});

// ---- writing `lines:` ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('withBarLines puts the list just before the closing --- (or in place when there is one), keeps every other front matter line and the body byte for byte, and is idempotent', () => {
  const list = [HEAD, 'Hit hihat on steps 1, 3 and 5.'];
  const once = withBarLines(BAR_001, list);
  assert.ok(once.includes(`lines:\n  - ${JSON.stringify(list[0])}\n  - ${JSON.stringify(list[1])}\n---\n`), 'just before the closing fence');
  assert.deepEqual(readBarLines(once), { hasLines: true, lines: list });
  assert.equal(once.slice(once.indexOf('\n---\n')), BAR_001.slice(BAR_001.indexOf('\n---\n')), 'the body and the closing --- are the note\'s own bytes');
  assert.equal(withBarLines(once, list), once, 'idempotent');
  const next = withBarLines(once, [HEAD]);
  assert.deepEqual(readBarLines(next).lines, [HEAD]);
  assert.equal((next.match(/^lines:/gm) ?? []).length, 1);
  assert.ok(next.startsWith('---\ntype: data\ncontent_type: json\ndescription: '), 'type, content_type and description keep their places');
  assert.equal(withBarLines(next, []).includes('lines: []'), true);
  assert.equal(withBarLines(BAR_001, []).replace('lines: []\n', ''), BAR_001, 'an empty list is `lines: []`, nothing else changes');
  const crlf = BAR_001.replace(/\n/g, '\r\n');
  const w = withBarLines(crlf, [HEAD]);
  assert.ok(!/[^\r]\n/.test(w), 'a CRLF note stays CRLF');
  assert.deepEqual(readBarLines(w).lines, [HEAD]);
});

test('a sentence with a quote, a backslash or a colon survives the front matter (a JSON string is a YAML string)', () => {
  const odd = ['Hit "kick" on step 1.', 'a \\ b: c # d', 'Start with 16 steps in 4/4 at 100 beats per minute: kick on step 1.'];
  assert.deepEqual(readBarLines(withBarLines(BAR_001, odd)).lines, odd);
});

test('barLinesBlock is the raw `lines:` text of a note, so a copy can carry it byte for byte (and null when there is none)', () => {
  assert.equal(barLinesBlock(BAR_001), null);
  const note = withBarLines(BAR_001, [HEAD, 'Hit hihat on step 3.']);
  assert.equal(barLinesBlock(note), `lines:\n  - ${JSON.stringify(HEAD)}\n  - "Hit hihat on step 3."`);
  assert.equal(barLinesBlock(withBarLines(BAR_001, [])), 'lines: []');
});

// ---- writing the whole bar from its list -----------------------------------------------------------------------------------------------------------------------------------------------

test('writeBarNote: the json fence is the replay of the list (byte for byte formatRhythmJson), `lines:` is the list, the description line is untouched, the bar stays a bar the Beat Box opens', () => {
  const list = [HEAD, 'Hit hihat on step 3.'];
  const withHihat = [headSentence({ ...dataOf(BAR_001), channels: { ...dataOf(BAR_001).channels, hihat: new Array(16).fill(false) } })!, 'Hit hihat on step 3.'];
  const w = writeBarNote(BAR_001, withHihat);
  assert.equal(w.ok, true, JSON.stringify(w));
  const text = (w as { text: string }).text;
  assert.equal(fence(text), formatRhythmJson(replayBar(withHihat).data));
  assert.deepEqual(readBarLines(text).lines, withHihat);
  assert.equal(text.split('\n').find((l) => l.startsWith('description:')), BAR_001.split('\n').find((l) => l.startsWith('description:')));
  assert.equal(readRhythmNote(text).ok, true);
  assert.deepEqual(dataOf(text).channels.hihat, [false, false, true, ...new Array(13).fill(false)]);
  assert.equal(extractJsonBlock(text).ok, true);
  void list;
  const again = writeBarNote(text, withHihat); assert.equal((again as { text: string }).text, text, 'the same list writes the same bytes (the caller\'s process then writes nothing)');
});

test('writeBarNote on a bar with provenance sections keeps them current (the Beat Box save does the same), and a fork keeps its origin and links', () => {
  const note = withBarLines(newBar(), []);
  assert.equal(hasBarProvenance(note), true);
  const w = writeBarNote(note, ['Set the tempo to 120.', 'Hit kick on step 3.']);
  const text = (w as { text: string }).text;
  assert.match(text, /Bar made in the Beat Box; 5 hits in 16 steps, tempo 120\./);
  assert.deepEqual(barOriginOf(text), { kind: 'beatbox' });
  const fork = withBarLines(forkNoteContent('bar_020', 'phrases/phrase_006', 9, dataOf(BAR_001)), []);
  const wf = writeBarNote(fork, ['Hit kick on step 3.']);
  const ft = (wf as { text: string }).text;
  assert.deepEqual(barOriginOf(ft), { kind: 'fork', phrase: 'phrase_006', bar: 9 });
  assert.equal((ft.match(/^links:/gm) ?? []).length, 1);
  assert.deepEqual(readBarLines(ft).lines, ['Hit kick on step 3.']);
});

test('an EMPTY list is the new-bar groove; a list nobody can read writes nothing (a typo in line 1 never empties the Score); a read_only or non-rhythm note is refused', () => {
  const empty = writeBarNote(BAR_001, []);
  assert.equal(fence((empty as { text: string }).text), formatRhythmJson(BAR_BASE));
  const bad = writeBarNote(BAR_001, ['this is nothing', 'nor is this']);
  assert.equal(bad.ok, false); assert.match((bad as { message: string }).message, /No line of the list can be read/);
  const ro = writeBarNote(BAR_001.replace('content_type: json', 'content_type: json\nread_only: true'), [HEAD]);
  assert.equal(ro.ok, false);
  assert.equal(writeBarNote('---\ntype: action\n---\n\nhello\n', [HEAD]).ok, false);
  assert.equal(writeBarNote('plain text', [HEAD]).ok, false);
});

test('a hand-edited list: the readable lines before the first unreadable one are written, every line is kept (11a.4)', () => {
  const list = [HEAD, 'Hit kick on step 3.', 'garbage', 'Hit kick on step 4.'];
  const w = writeBarNote(BAR_001, list);
  assert.equal(w.ok, true);
  const text = (w as { text: string }).text;
  assert.deepEqual(readBarLines(text).lines, list, 'the unreadable line and the one after it are kept');
  assert.deepEqual(dataOf(text).channels.kick, [true, false, true, false, false, false, false, false, true, false, false, false, false, false, false, false], 'the note shows lines 1 and 2');
});

test('inspectBarNote says what the list and the fence say, and whether they agree (a hand edit of either is seen; nothing is written)', () => {
  const list = [HEAD, 'Hit kick on step 3.'];
  const note = (writeBarNote(BAR_001, list) as { text: string }).text;
  const same = inspectBarNote(note);
  assert.equal(same.hasLines, true); assert.equal(same.inSync, true); assert.deepEqual(same.list, list);
  const edited = withBarLines(note, [HEAD, 'Hit kick on step 4.']);
  const out = inspectBarNote(edited);
  assert.equal(out.inSync, false, 'the list says one thing and the fence another');
  assert.equal(out.replay.stop, null);
  assert.equal(inspectBarNote(BAR_001).hasLines, false);
  assert.equal(inspectBarNote(BAR_001).inSync, true, 'a bar with no list is its fence: nothing to compare');
  assert.equal(inspectBarNote('not a note').fence, null);
});

// ---- the bar "New bar" makes: an empty list ------------------------------------------------------------------------------------------------------------------------------------------------

test('"New bar" writes `lines: []`: a new bar starts with an EMPTY list and the groove it has always had; the list and the fence agree', () => {
  const text = newBar();
  assert.deepEqual(readBarLines(text), { hasLines: true, lines: [] });
  assert.deepEqual(dataOf(text), BAR_BASE);
  assert.equal(inspectBarNote(text).inSync, true);
  assert.ok(text.includes('lines: []\n---\n'));
  assert.equal(readRhythmNote(text).ok, true);
});

// ---- P3: what is not a listed bar is never touched ------------------------------------------------------------------------------------------------------------------------------------------

test('P3: every existing bar is read as it was: no `lines:`, nothing to write on open, the Beat Box reads its data exactly', () => {
  for (const [name, text] of Object.entries(PLAYGROUND_BARS)) {
    assert.equal(hasBarLines(text), false, name);
    const i = inspectBarNote(text);
    assert.equal(i.hasLines, false); assert.equal(i.inSync, true);
    assert.deepEqual(i.list, baselineList(dataOf(text)) ?? [], `${name}: an unlisted bar's list IS its head (made only when it is first written)`);
  }
});

// ---- corruption fuzz: a hand-edited note never throws, and a write is never half a write ----------------------------------------------------------------------------------------------------

test('FUZZ: corrupted notes (a hand edit gone wrong anywhere in the front matter, the list or the fence) never make a reader or the writer throw; a write that succeeds is a bar the Beat Box reads', () => {
  let x = 4242; const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const listed = (writeBarNote(BAR_001, [HEAD, 'Hit kick on step 3.', 'Set the tempo to 120.']) as { text: string }).text;
  for (let k = 0; k < 400; k++) {
    let t = listed;
    for (let j = 0; j < 1 + Math.floor(rnd() * 3); j++) {
      const at = Math.floor(rnd() * t.length); const op = Math.floor(rnd() * 5);
      if (op === 0) t = t.slice(0, at) + t.slice(at + 1 + Math.floor(rnd() * 8));
      else if (op === 1) t = t.slice(0, at) + String.fromCharCode(1 + Math.floor(rnd() * 120)) + t.slice(at);
      else if (op === 2) t = t.slice(0, at);
      else if (op === 3) t = t.replace(/\n/g, k % 2 === 0 ? '\r\n' : '\n');
      else t = t.slice(0, at) + '\n---\n' + t.slice(at);
    }
    const r = readBarLines(t); assert.ok(r === null || typeof r.hasLines === 'boolean');
    const i = inspectBarNote(t); assert.equal(typeof i.inSync, 'boolean');
    const w = writeBarNote(t, r?.lines ?? []);
    if (w.ok === true) assert.equal(readRhythmNote(w.text).ok, true, 'a bar the Beat Box can open');
    assert.equal(typeof withBarLines(t, ['x']), 'string');
  }
  for (const junk of ['', '---', '---\n---', '---\nlines:\n---\n', '---\nlines: [\n---\n', 'lines:\n  - a', null, undefined, 5]) {
    assert.doesNotThrow(() => { readBarLines(junk as never); inspectBarNote(junk as never); writeBarNote(junk as never, ['x']); withBarLines(junk as never, ['x']); barLinesBlock(junk as never); });
  }
});

// =====================================================================================================================================================================================================
// 2026-11-19-0993 MUTATION SURVIVORS (triage of ~/.forge-mem-evidence/p0993/mutate-bar-list-note-core.log): every test below FAILS against the mutant it names (checked on a scratch copy of the source) and passes on the real code.
// =====================================================================================================================================================================================================

/** BAR_001 with `block` (front matter lines) put just before the closing `---` (or, with `first`, just after the opening one). */
const withFront = (block: string, first = false, eol = '\n'): string => {
  const t = BAR_001.replace(/\n/g, eol);
  return first ? t.replace(`---${eol}`, `---${eol}${block.replace(/\n/g, eol)}${eol}`) : t.replace(`${eol}---${eol}`, `${eol}${block.replace(/\n/g, eol)}${eol}---${eol}`);
};

// 2026-11-19-0993 mutation survivor: bar-list-note-core.ts:21 boundary "<" -> "<=", number+1 "0" -> "1" (`lines:` as the FIRST line of the front matter)
test('`lines:` is found when it is the very first line of the front matter (read, written in place, taken away)', () => {
  const note = withFront('lines:\n  - "Hit kick on step 3."\n  - "Hit kick on step 4."', true);
  assert.ok(note.startsWith('---\nlines:\n  - "Hit kick on step 3."'));
  assert.deepEqual(readBarLines(note), { hasLines: true, lines: ['Hit kick on step 3.', 'Hit kick on step 4.'] });
  assert.equal(barLinesBlock(note), 'lines:\n  - "Hit kick on step 3."\n  - "Hit kick on step 4."');
  const w = withBarLines(note, ['Hit kick on step 5.']);
  assert.ok(w.startsWith('---\nlines:\n  - "Hit kick on step 5."\ntype: data'), 'replaced in place, first');
  assert.equal((w.match(/^lines:/gm) ?? []).length, 1);
  assert.equal(withoutBarLines(note), BAR_001);
  assert.deepEqual(readBarLines(withFront('lines: []', true)), { hasLines: true, lines: [] });
});

// 2026-11-19-0993 mutation survivor: bar-list-note-core.ts:24 if-true, eq-flip x2, empty-string '|' and '>', logic "||" -> "&&" (the items of the list belong to `lines:` / `lines: |` / `lines: >`, and NOT to an inline value)
test('which lines are the items of `lines:`: those right under `lines:`, `lines: |` or `lines: >`; an inline value (a flow list, a word) has none, and what follows it is not touched', () => {
  const items = '  - "Hit kick on step 3."\n  - Clear kick on step 1.';
  const want = ['Hit kick on step 3.', 'Clear kick on step 1.'];
  for (const head of ['lines:', 'lines: |', 'lines: >', 'lines:   ']) {
    const note = withFront(`${head}\n${items}\nafter: 1`);
    assert.deepEqual(readBarLines(note), { hasLines: true, lines: want }, JSON.stringify(head));
    assert.equal(barLinesBlock(note), `${head}\n${items}`, JSON.stringify(head));
    assert.equal(withoutBarLines(note), BAR_001.replace('\n---\n', '\nafter: 1\n---\n'), `${JSON.stringify(head)}: the key and its items go, the next key stays`);
  }
  for (const inline of ['lines: ["Hit kick on step 3."]', 'lines: []', 'lines: "Hit kick on step 3."', 'lines: Hit kick on step 3.']) {
    const note = withFront(`${inline}\n- "stray"\nafter: 1`);
    assert.equal(barLinesBlock(note), inline, `${inline}: the line under an inline value is not an item of it`);
    assert.equal(withoutBarLines(note), BAR_001.replace('\n---\n', '\n- "stray"\nafter: 1\n---\n'), inline);
  }
  assert.deepEqual(readBarLines(withFront('lines: "just a word"\nafter: 1')), { hasLines: true, lines: [] }, 'a scalar is not a list: nothing is invented');
});

// 2026-11-19-0993 mutation survivor: bar-list-note-core.ts:30 early-return "return t.replace(/^\"|\"$/g, '');" and "typeof v === 'string'" -> "true"; :31 true, "'" -> '' (x2)
test('the items of a hand-written list are read the way YAML reads them: a double quoted JSON string, a double quoted text JSON refuses, a single quoted text (\'\' is a quote), a plain text', () => {
  const read = (...itemLines: string[]): string[] => readBarLines(withFront(`lines:\n${itemLines.map((l) => `  - ${l}`).join('\n')}`))!.lines;
  assert.deepEqual(read('"Hit kick on step 3."'), ['Hit kick on step 3.']);
  assert.deepEqual(read('"say \\"hi\\" \\\\ \\u0041"'), ['say "hi" \\ A']);
  assert.deepEqual(read('"Hit kick on step 3.'), ['Hit kick on step 3.'], 'a double quote that is never closed: the quote is dropped, the text is kept');
  assert.deepEqual(read('Hit kick on step 3."'), ['Hit kick on step 3."'], 'a plain text is as it is');
  assert.deepEqual(read('"say \\q"'), ['say \\q'], 'an escape JSON does not know: the quotes are dropped, the text is kept');
  assert.deepEqual(read("'it''s a kick'"), ["it's a kick"]);
  assert.deepEqual(read("'a''b'"), ["a'b"]);
  assert.deepEqual(read("'Hit kick on step 3.'"), ['Hit kick on step 3.']);
  assert.deepEqual(read("Hit it''s on step 3."), ["Hit it''s on step 3."], 'a plain text is not unquoted');
  assert.deepEqual(read("kick's"), ["kick's"]);
  assert.deepEqual(read('"123"', '123', 'true'), ['123', '123', 'true'], 'a number or a word is its text, a quoted number is its text');
});

// 2026-11-19-0993 mutation survivor: bar-list-note-core.ts:63 number+1 "1" -> "2" (the front matter line AFTER the items is kept)
test('withBarLines keeps the front matter line right after the list (in place, with items, with `lines: []`, with an inline value)', () => {
  for (const head of ['lines:\n  - "Hit kick on step 3."\n  - "Hit kick on step 4."', 'lines: []', 'lines: ["a", "b"]']) {
    const note = withFront(`${head}\nafter: 1\nmore: 2`);
    const w = withBarLines(note, ['Clear kick on step 1.']);
    assert.ok(w.includes('lines:\n  - "Clear kick on step 1."\nafter: 1\nmore: 2\n---\n'), JSON.stringify(head));
    assert.equal(w.split('\n').filter((l) => l === 'after: 1').length, 1);
    assert.equal(withBarLines(w, []).includes('lines: []\nafter: 1\nmore: 2\n---\n'), true, JSON.stringify(head));
  }
});

// 2026-11-19-0993 mutation survivor: bar-list-note-core.ts:70 eq-flip; :71 early-return, eq-flip x2, logic, number+1 x2, plus-minus, number "0" -> "1" (withoutBarLines had no test of its own: the controller uses it when a list cannot be written)
test('withoutBarLines takes `lines:` and its items away and nothing else; a note with no list, or with no front matter, comes back as it was', () => {
  const listed = withBarLines(BAR_001, [HEAD, 'Hit hihat on step 3.']);
  assert.equal(withoutBarLines(listed), BAR_001, 'the round trip of withBarLines');
  assert.equal(withoutBarLines(withBarLines(BAR_001, [])), BAR_001, 'lines: [] goes too');
  assert.equal(withoutBarLines(BAR_001), BAR_001, 'an unlisted bar is not touched');
  assert.equal(withoutBarLines('no front matter\nlines:\n  - "x"'), 'no front matter\nlines:\n  - "x"');
  assert.equal(withoutBarLines(''), '');
  const crlf = BAR_001.replace(/\n/g, '\r\n');
  assert.equal(withoutBarLines(withBarLines(crlf, [HEAD])), crlf, 'a CRLF note stays CRLF');
  const middle = withFront('keep_before: 1\nlines:\n  - "a"\n  - "b"\nkeep_after: 2');
  const gone = withoutBarLines(middle);
  assert.equal(gone, BAR_001.replace('\n---\n', '\nkeep_before: 1\nkeep_after: 2\n---\n'));
  assert.equal(hasBarLines(gone), false);
  assert.equal(fence(gone), fence(BAR_001), 'the body is the note\'s own bytes');
  assert.equal(withoutBarLines(withFront('lines:\n  - "only"', true)), BAR_001, 'the first line of the front matter');
});

// 2026-11-19-0993 mutation survivor: bar-list-note-core.ts:84 number+1 "0" -> "1" x2, eq-flip, empty-string (the words of "no line can be read", and when they are said)
test('a list of which NO line can be read writes nothing, and says which line and why; one readable line is enough to write (the rest are kept)', () => {
  for (const list of [['this is nothing'], ['this is nothing', 'nor is this'], ['Hit kick on step 99.']]) {
    const stop = replayBar(list).stop!;
    const w = writeBarNote(BAR_001, list);
    assert.deepEqual(w, { ok: false, message: `No line of the list can be read, so nothing was written; the note keeps what it shows. ${stopNotice(stop, 0)}` }, JSON.stringify(list));
    assert.match((w as { message: string }).message, /Line 1 is not a sentence I can read/);
  }
  const one = writeBarNote(BAR_001, [HEAD, 'junk']);
  assert.equal(one.ok, true, 'one readable line (the head) is enough');
  assert.deepEqual(readBarLines((one as { text: string }).text)?.lines, [HEAD, 'junk']);
  assert.equal(writeBarNote(BAR_001, ['Set the tempo to 120.']).ok, true, 'a list of ONE readable line is written');
});
