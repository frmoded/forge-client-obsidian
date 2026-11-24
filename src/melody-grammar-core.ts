// 2026-11-23-1030 (pitch in bars, Stage 1a: a MELODY BAR authored by sentences) - THE GRAMMAR of a melody bar's list: the canonical sentences, read and applied by PURE functions. No `obsidian`, no DOM, no vault, no model call;
// it never throws (a text it cannot read is `{ ok: false, message, column }`, in plain words). The rhythm bar's grammar (bar-grammar-core.ts) is untouched: a bar is one kind or the other, and each kind refuses the other's words.
//
// THE WORDS (each one parse-able and canonical: `renderMelodyLine(parseMelodySentence(s)) === s` for every sentence this file says)
//   Start with a melody bar of 16 steps in 4/4 at 100 beats per minute for the piano: G3 on step 1 for 1 step, D4 on step 2 for 1 step.        the HEAD: the whole bar. "Start with a melody bar of 16 steps." is read (the usual signature, tempo 100,
//                                                                                                                                              the piano) and said in full; "in groups of G" is said only when G is not the grid's usual group
//   Note G3 on step 1 for 1 step.   Note D4 on steps 2, 6 and 10 for 1 step.   Note Bb4 on step 5 for 2 steps.                                  notes (steps count from 1; the length is in steps; a note must END INSIDE the bar; one voice)
//   Rest on step 3.   Rest on step 3 for 2 steps.                                                                                              silence: the notes that start in it go, a note sounding into it is cut short where it begins
//   Clear step 5.   Clear steps 5 and 9.                                                                                                       takes away the note that STARTS on a step
//   Set the instrument to cello.   Set the tempo to 100.                                                                                       the General MIDI instrument by name (piano, guitar, mandolin, violin, cello); whole beats per minute, 40 to 240
// The grid is the Beat Box's (bar-grammar-core's `loadableGrid`): 16 steps in 4/4, 8 in 4/4, 12 in 3/4, 12 in 12/8, 6 in 6/8, 20 in 5/4.
import { MAX_TEMPO, MIN_TEMPO, barSentencesOf, defaultGroup, loadableGrid } from './bar-grammar-core.ts';
import { MELODY_INSTRUMENTS, endsOutside, instrumentWords, onlyOneVoice, parsePitch, validateMelodyData, type MelodyData, type MelodyNote } from './melody-bar-core.ts';
/** 2026-11-23-1030: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_MELODY_GRAMMAR_CORE = 'forge-list-model-core:melody-grammar-core';

export type MelodyLine =
  | { kind: 'start'; data: MelodyData }
  | { kind: 'note'; pitch: string; steps: number[]; length: number }
  | { kind: 'rest'; step: number; length: number }
  | { kind: 'clear'; steps: number[] }
  | { kind: 'instrument'; name: string }
  | { kind: 'tempo'; bpm: number };
export type MelodyParse = { ok: true; line: MelodyLine } | { ok: false; message: string; column: number };
export type MelodyApply = { ok: true; data: MelodyData } | { ok: false; message: string };

/** One example of every sentence the grammar says (the refusals name them; a test checks each one reads and says itself back). */
export const MELODY_FORMS: readonly string[] = [
  'Start with a melody bar of 16 steps in 4/4 at 100 beats per minute for the piano.', 'Note G3 on step 1 for 1 step.', 'Note D4 on steps 2, 6 and 10 for 1 step.', 'Rest on step 3.', 'Clear step 5.', 'Set the instrument to cello.', 'Set the tempo to 72.',
];
const VERBS = ['start', 'note', 'rest', 'clear', 'set'];
const FORMS_TEXT = 'Start with a melody bar, Note, Rest, Clear, Set the instrument, Set the tempo';
const USUAL_SIGNATURE: Record<number, string> = { 16: '4/4', 12: '3/4', 8: '4/4', 6: '6/8', 20: '5/4' };

const plain = (n: number): string | null => { const s = String(n); return /^\d+(\.\d+)?$/.test(s) ? s : null; };
const plural = (n: number): string => `${n} step${n === 1 ? '' : 's'}`;
const stepsWords = (steps: readonly number[]): string => (steps.length === 1 ? `step ${steps[0]}` : `steps ${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}`);
const sortedUnique = (xs: readonly number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);
const LIST = String.raw`\d+(?:\s*,\s*(?:and\s+)?\d+|\s+and\s+\d+)*`;
const listOf = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);
const fail = (message: string, column = 1): MelodyParse => ({ ok: false, message, column });
const tempoWords = `The tempo is a whole number of beats per minute from ${MIN_TEMPO} to ${MAX_TEMPO}.`;

/** The sentences of a typed text, each with its full stop (the bar grammar's own splitter: a stop between two digits is a decimal point). */
export const melodySentencesOf = (text: string): string[] => barSentencesOf(text);

// ---- reading ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Read ONE sentence (typed words are read leniently: case, "the", step or steps, any order of the steps, the pitch spelled `Bb4` or `B-4`, a missing stop). Never throws. */
export function parseMelodySentence(text: string): MelodyParse {
  try { return read(String(text ?? '')); } catch { return fail('That could not be read as a sentence of a melody bar.'); }
}

function read(raw: string): MelodyParse {
  const t = raw.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  if (t === '') return fail('There is nothing to read.');
  const low = t.toLowerCase();
  let m: RegExpExecArray | null;
  if (/^start with\b/.test(low)) return readHead(low);
  if ((m = new RegExp(`^note (\\S+) on steps? (${LIST})(?: for (\\d+) steps?)?$`).exec(low))) {
    const p = parsePitch(m[1]); if (p.ok === false) return fail(p.message, low.indexOf(m[1]) + 1);
    const steps = sortedUnique(listOf(m[2])), length = m[3] === undefined ? 1 : Number(m[3]);
    if (steps[0] < 1) return fail('Steps count from 1.', low.indexOf('step') + 1);
    if (length < 1) return fail('A note is at least 1 step long.', low.indexOf('for') + 1);
    return { ok: true, line: { kind: 'note', pitch: p.name, steps, length } };
  }
  if ((m = /^rest on step (\d+)(?: for (\d+) steps?)?$/.exec(low))) {
    const step = Number(m[1]), length = m[2] === undefined ? 1 : Number(m[2]);
    if (step < 1) return fail('Steps count from 1.', low.indexOf('step') + 1);
    if (length < 1) return fail('A rest is at least 1 step long.', low.indexOf('for') + 1);
    return { ok: true, line: { kind: 'rest', step, length } };
  }
  if ((m = new RegExp(`^clear steps? (${LIST})$`).exec(low))) {
    const steps = sortedUnique(listOf(m[1]));
    return steps[0] < 1 ? fail('Steps count from 1.', low.indexOf('step') + 1) : { ok: true, line: { kind: 'clear', steps } };
  }
  if ((m = /^set (?:the )?instrument to (?:the )?([a-z]+)$/.exec(low))) {
    return (MELODY_INSTRUMENTS as readonly string[]).includes(m[1]) ? { ok: true, line: { kind: 'instrument', name: m[1] } } : fail(`${m[1]} is not an instrument here; the instruments are ${instrumentWords()}.`, low.indexOf(m[1]) + 1);
  }
  if ((m = /^set (?:the )?tempo to (\d[\d.]*)(?: beats? per minute| bpm)?$/.exec(low))) {
    const bpm = Number(m[1]);
    return Number.isFinite(bpm) && plain(bpm) !== null ? { ok: true, line: { kind: 'tempo', bpm } } : fail(tempoWords, low.indexOf(m[1]) + 1);
  }
  const first = low.split(' ')[0];
  if (VERBS.includes(first)) return fail(`I could not read "${t}" as a sentence of a melody bar. For example: ${MELODY_FORMS.filter((f) => f.toLowerCase().startsWith(first)).join(' or ')}`);
  return fail(`I do not know how to read "${t}" as a sentence of a melody bar. A melody bar's sentences start with: ${FORMS_TEXT}. For example: ${MELODY_FORMS[1]}`);
}

const NOTE_CLAUSE = /^(\S+) on step (\d+) for (\d+) steps?(?:, |$)/;
const noGrid = (steps: number, signature: string): string => `There is no grid of ${steps} steps in ${signature}. A melody bar has 16 steps in 4/4, 8 steps in 4/4 (groups of 2 or 4), 12 in 3/4, 12 in 12/8, 6 in 6/8 or 20 in 5/4.`;

function readHead(low: string): MelodyParse {
  const m = /^start with a melody bar of (\d+) steps?(?: in (\d+\/\d+))?(?: in groups? of (\d+))?(?: at (\d[\d.]*) (?:beats? per minute|bpm))?(?: for the ([a-z]+))?\s*(?::\s*(.*))?$/.exec(low);
  if (m === null) return fail(`A melody bar's head reads like: ${MELODY_FORMS[0]}`, 1);
  const steps = Number(m[1]), signature = m[2] ?? USUAL_SIGNATURE[steps] ?? '4/4', group = m[3] === undefined ? defaultGroup(signature, steps) : Number(m[3]);
  if (!loadableGrid(signature, steps, group)) return fail(noGrid(steps, signature), 1);
  const bpm = m[4] === undefined ? 100 : Number(m[4]);
  if (!Number.isInteger(bpm) || bpm < MIN_TEMPO || bpm > MAX_TEMPO) return fail(tempoWords, low.indexOf(m[4] ?? 'at') + 1);
  const instrument = m[5] ?? 'piano';
  if (!(MELODY_INSTRUMENTS as readonly string[]).includes(instrument)) return fail(`${instrument} is not an instrument here; the instruments are ${instrumentWords()}.`, low.indexOf(instrument) + 1);
  const notes: MelodyNote[] = [];
  let rest = m[6] ?? '';
  while (rest !== '') {
    const c = NOTE_CLAUSE.exec(rest);
    if (c === null) return fail(`Expected a note like "G3 on step 1 for 1 step" here, but found "${rest.slice(0, 24)}".`, low.length - rest.length + 1);
    const p = parsePitch(c[1]); if (p.ok === false) return fail(p.message, low.length - rest.length + 1);
    notes.push({ step: Number(c[2]), pitch: p.name, length: Number(c[3]) });
    rest = rest.slice(c[0].length);
  }
  const v = validateMelodyData({ time_signature: signature, steps, group_size: group, tempo_bpm: bpm, instrument, notes });
  return v.ok === false ? fail(v.message.replace(/^Not melody data: /, ''), 1) : { ok: true, line: { kind: 'start', data: v.value } };
}

// ---- saying ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The head of a bar, or null when the bar cannot be said (a grid or a tempo the sentences cannot say, data the engine would refuse). */
export function headSentence(d: MelodyData): string | null {
  try {
    if (validateMelodyData(d).ok === false || !loadableGrid(d.time_signature, d.steps, d.group_size) || !Number.isInteger(d.tempo_bpm) || d.tempo_bpm < MIN_TEMPO || d.tempo_bpm > MAX_TEMPO) return null;
    const group = d.group_size === defaultGroup(d.time_signature, d.steps) ? '' : ` in groups of ${d.group_size}`;
    const notes = d.notes.length === 0 ? '' : `: ${d.notes.map((n) => `${n.pitch} on step ${n.step} for ${plural(n.length)}`).join(', ')}`;
    return `Start with a melody bar of ${plural(d.steps)} in ${d.time_signature}${group} at ${d.tempo_bpm} beats per minute for the ${d.instrument}${notes}.`;
  } catch { return null; }
}

/** The canonical sentence of a line. */
export function renderMelodyLine(line: MelodyLine): string {
  switch (line.kind) {
    case 'start': return headSentence(line.data) ?? 'Start with a melody bar the sentences cannot say.';
    case 'note': return `Note ${line.pitch} on ${stepsWords(sortedUnique(line.steps))} for ${plural(line.length)}.`;
    case 'rest': return `Rest on step ${line.step}${line.length === 1 ? '' : ` for ${plural(line.length)}`}.`;
    case 'clear': return `Clear ${stepsWords(sortedUnique(line.steps))}.`;
    case 'instrument': return `Set the instrument to ${line.name}.`;
    case 'tempo': return `Set the tempo to ${plain(line.bpm) ?? String(line.bpm)}.`;
  }
}

// ---- applying --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const refuse = (message: string): MelodyApply => ({ ok: false, message });
const clone = (d: MelodyData): MelodyData => ({ ...d, notes: d.notes.map((n) => ({ ...n })) });
const beyond = (d: MelodyData, step: number): string => `Step ${step} is beyond this bar's ${d.steps} steps.`;

/** What the line does to a bar: the new data, or why it cannot. Never throws; the input is never changed. */
export function applyMelodyLine(data: MelodyData, line: MelodyLine): MelodyApply {
  try { return apply(data, line); } catch { return refuse('That sentence could not be applied to this bar.'); }
}

function apply(data: MelodyData, line: MelodyLine): MelodyApply {
  const d = clone(data);
  switch (line.kind) {
    case 'start': return { ok: true, data: clone(line.data) };
    case 'note': {
      const added = line.steps.map((step): MelodyNote => ({ step, pitch: line.pitch, length: line.length })).filter((n) => !d.notes.some((e) => e.step === n.step && e.pitch === n.pitch && e.length === n.length));          // the very note already there is not a second one
      for (const n of added) { if (n.step > d.steps) return refuse(beyond(d, n.step)); if (n.step + n.length - 1 > d.steps) return refuse(endsOutside(n, d.steps)); }
      const all = [...d.notes, ...added].sort((a, b) => a.step - b.step);
      for (let i = 1; i < all.length; i++) if (all[i].step < all[i - 1].step + all[i - 1].length) return refuse(onlyOneVoice(all[i], all[i - 1]));
      d.notes = all; return { ok: true, data: d };
    }
    case 'rest': {
      const last = line.step + line.length - 1;
      if (line.step > d.steps) return refuse(beyond(d, line.step));
      if (last > d.steps) return refuse(`A rest must end inside the bar: step ${line.step} for ${plural(line.length)} would end after step ${d.steps}.`);
      d.notes = d.notes.filter((n) => n.step < line.step || n.step > last).map((n) => (n.step < line.step && n.step + n.length > line.step ? { ...n, length: line.step - n.step } : n));
      return { ok: true, data: d };
    }
    case 'clear': {
      for (const s of line.steps) {
        if (s > d.steps) return refuse(beyond(d, s));
        if (!d.notes.some((n) => n.step === s)) { const under = d.notes.find((n) => n.step < s && n.step + n.length > s); return refuse(`No note starts on step ${s}${under === undefined ? '' : `; the ${under.pitch} sounding there starts on step ${under.step}`}.`); }
      }
      d.notes = d.notes.filter((n) => !line.steps.includes(n.step)); return { ok: true, data: d };
    }
    case 'instrument': d.instrument = line.name; return { ok: true, data: d };
    case 'tempo':
      if (!Number.isInteger(line.bpm)) return refuse(`${tempoWords} Not ${line.bpm}.`);
      if (line.bpm < MIN_TEMPO || line.bpm > MAX_TEMPO) return refuse(`${tempoWords} Not ${line.bpm}.`);
      d.tempo_bpm = line.bpm; return { ok: true, data: d };
  }
}
