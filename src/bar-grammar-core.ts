// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS; checklists/music_tabs_chat_ui_design.md 11d.3) - THE GRAMMAR of a bar's list: the canonical sentences a Beat Box gesture is said in, read and applied by PURE functions. No `obsidian`, no DOM, no vault, no model call;
// it never throws (a text it cannot read is `{ ok: false, message, column }`, in plain words).
//
// THE WORDS (each one parse-able and canonical: `renderBarLine(parseBarSentence(s)) === s` for every sentence this file says)
//   Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.          the HEAD: the whole bar. Optional "in groups of G" (only when G is not the default of that grid), "with S percent swing" (only when S is
//                                                                                                               not 0); every channel is said, in order ("hihat with no hits"); a velocity cell is "on step 1 at velocity 112" (groups joined by "and on")
//   Hit kick on steps 1, 5 and 9.  /  Hit conga_high on steps 5 and 9 at velocity 80.                           cells set (steps count from 1)
//   Clear kick on step 5.  /  Clear kick on steps 5 and 13.  /  Clear kick.                                    cells cleared / the whole channel cleared
//   Set the tempo to 118.   Set the swing to 20 percent.                                                        whole numbers the Beat Box loads (40 to 240; 0 to 100)
//   Use 16 steps in 4/4.   Use 8 steps in 4/4 in groups of 4.                                                  the GRID; like the widget, it clears every channel. "Use 8 steps." is read (the signature of the moment is kept) and said in full
//   Add the channel hihat.   Remove the channel hihat.                                                          the channel list is data, in order (never the last channel)
//   Shift every channel one step to the left. / ... to the right.   Mirror every channel.                      the widget's transforms (the widget's own rotatePattern / mirrorPattern are the test's oracle)
//   Rotate the kick channel one step to the left. / ... to the right.   Move the kick channel one place earlier. / ... later.
// Not words (the Beat Box writes nothing for them): the kit picker (it only changes what "Add instrument" offers), mute, solo, volume, play.
import { MAX_RHYTHM_STEPS, RHYTHM_CHANNELS, validateRhythmData, type RhythmData, type RhythmStep } from './rhythm-edit-core.ts';

export type BarLine =
  | { kind: 'start'; data: RhythmData }
  | { kind: 'hit'; channel: string; steps: number[]; velocity: number | null }
  | { kind: 'clear'; channel: string; steps: number[] | null }
  | { kind: 'tempo'; bpm: number }
  | { kind: 'swing'; pct: number }
  | { kind: 'grid'; steps: number; signature: string | null; group: number | null }
  | { kind: 'add'; channel: string }
  | { kind: 'remove'; channel: string }
  | { kind: 'shift'; dir: 'left' | 'right' }
  | { kind: 'mirror' }
  | { kind: 'rotate'; channel: string; dir: 'left' | 'right' }
  | { kind: 'move'; channel: string; dir: 'earlier' | 'later' };

export type BarParse = { ok: true; line: BarLine } | { ok: false; message: string; column: number };
export type BarApply = { ok: true; data: RhythmData } | { ok: false; message: string };

export const MIN_TEMPO = 40, MAX_TEMPO = 240;

// ---- the Beat Box's grids (rhythm_box.html TIME_SIGNATURES / EIGHTH_GRIDS: the widget refuses to load anything else) ---------------------------------------------------------------------------------

const SIGNATURES: Record<string, { steps: number; group: number }> = { '4/4': { steps: 16, group: 4 }, '3/4': { steps: 12, group: 4 }, '12/8': { steps: 12, group: 3 }, '6/8': { steps: 6, group: 3 }, '5/4': { steps: 20, group: 4 } };
const EIGHTH_STEPS = 8, EIGHTH_GROUPS = [2, 4];

/** The group size a grid has unless it says otherwise ("in groups of G" is said only when G is another one). */
export function defaultGroup(signature: string, steps: number): number {
  const sig = SIGNATURES[signature];
  if (sig !== undefined && sig.steps === steps) return sig.group;
  if (signature === '4/4' && steps === EIGHTH_STEPS) return 2;
  return steps % 4 === 0 ? 4 : steps % 3 === 0 ? 3 : 1;
}
/** Can the Beat Box load this grid (and so save it back unchanged)? */
export function loadableGrid(signature: string, steps: number, group: number): boolean {
  const sig = Object.prototype.hasOwnProperty.call(SIGNATURES, signature) ? SIGNATURES[signature] : undefined;
  if (sig === undefined) return false;
  if (steps === sig.steps && group === sig.group) return true;
  return signature === '4/4' && steps === EIGHTH_STEPS && EIGHTH_GROUPS.includes(group);
}

// ---- small helpers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const CHANNEL_LIST = `${RHYTHM_CHANNELS.slice(0, -1).join(', ')} and ${RHYTHM_CHANNELS[RHYTHM_CHANNELS.length - 1]}`;
const isChannel = (n: string): boolean => (RHYTHM_CHANNELS as readonly string[]).includes(n);
const plain = (n: number): string | null => { const s = String(n); return /^\d+(\.\d+)?$/.test(s) ? s : null; };
const parseNum = (s: string): number | null => { if (!/^\d{1,15}(\.\d{1,12})?$/.test(s)) return null; const n = Number(s); return Number.isFinite(n) && plain(n) !== null ? n : null; };
const cellOf = (v: unknown): RhythmStep => (v === true ? true : typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 127 ? v : false);        // the widget's normalizeCell: a rest is false, 0 reads as a rest

function stepsWords(steps: readonly number[]): string {
  if (steps.length === 1) return `step ${steps[0]}`;
  return `steps ${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}`;
}
const sortedUnique = (xs: readonly number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);

const LIST = String.raw`\d+(?:\s*,\s*(?:and\s+)?\d+|\s+and\s+\d+)*`;
const listOf = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);
const FORMS_TEXT = 'Hit, Clear, Set the tempo, Set the swing, Use N steps, Add the channel, Remove the channel, Shift, Mirror, Rotate, Move, Start with';

/** One example of every sentence the grammar says (the refusal lists their verbs; a test checks each one reads). */
export const BAR_FORMS: readonly string[] = [
  'Hit kick on steps 1, 5 and 9.', 'Hit conga_high on step 1 at velocity 112.', 'Clear kick on step 5.', 'Clear kick.', 'Set the tempo to 118.', 'Set the swing to 20 percent.', 'Use 16 steps in 4/4.',
  'Add the channel hihat.', 'Remove the channel hihat.', 'Shift every channel one step to the left.', 'Mirror every channel.', 'Rotate the kick channel one step to the right.', 'Move the kick channel one place earlier.',
  'Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.',
];

function resolveChannel(name: string): string | null {
  const c = name.trim().replace(/[\s-]+/g, '_');
  const k = c === 'hi_hat' ? 'hihat' : c;
  return isChannel(k) ? k : null;
}

// ---- splitting typed text ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The sentences of a typed text, each with its full stop (a stop between two digits is a decimal point). Never throws. */
export function barSentencesOf(text: string): string[] {
  const t = String(text ?? '');
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    cur += c;
    if (c === '.' && !(/\d/.test(t[i - 1] ?? '') && /\d/.test(t[i + 1] ?? ''))) { if (cur.trim() !== '.') out.push(cur.trim()); cur = ''; }
  }
  if (cur.trim() !== '') out.push(`${cur.trim()}.`);
  return out.filter((s) => s !== '.');
}

// ---- reading -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const fail = (message: string, column = 1): BarParse => ({ ok: false, message, column });
const notChannel = (name: string): string => `${name.trim()} is not a channel; the channels are ${CHANNEL_LIST}.`;

/** Read ONE sentence (the typed words are read leniently: case, "the", step or steps, any order and repeats of the steps, "hi-hat", a missing stop). Never throws. */
export function parseBarSentence(text: string): BarParse {
  try { return read(String(text ?? '')); } catch { return fail('That could not be read as a Beat Box sentence.'); }
}

function read(raw: string): BarParse {
  const t = raw.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  if (t === '') return fail('There is nothing to read.');
  const low = t.toLowerCase();
  let m: RegExpExecArray | null;

  if (/^start with\b/.test(low)) return readHead(low);

  if ((m = new RegExp(`^hit (?:the )?(.+?) on steps? (${LIST})(?: at velocity (\\d+))?$`).exec(low))) {
    const channel = resolveChannel(m[1]); if (channel === null) return fail(notChannel(m[1]), low.indexOf(m[1]) + 1);
    const steps = sortedUnique(listOf(m[2]));
    const velocity = m[3] === undefined ? null : Number(m[3]);
    if (velocity !== null && (!Number.isInteger(velocity) || velocity > 127)) return fail('A velocity is a whole number from 0 to 127.', low.indexOf('velocity') + 1);
    return { ok: true, line: { kind: 'hit', channel, steps, velocity } };
  }
  if ((m = new RegExp(`^clear (?:the )?(.+?)(?: on steps? (${LIST}))?$`).exec(low))) {
    const channel = resolveChannel(m[1]); if (channel === null) return fail(notChannel(m[1]), low.indexOf(m[1]) + 1);
    return { ok: true, line: { kind: 'clear', channel, steps: m[2] === undefined ? null : sortedUnique(listOf(m[2])) } };
  }
  if ((m = /^set (?:the )?tempo to (\d[\d.]*)(?: beats? per minute| bpm)?$/.exec(low))) {
    const bpm = parseNum(m[1]); if (bpm === null) return fail('The tempo is a number of beats per minute, like 118.', low.indexOf(m[1]) + 1);
    return { ok: true, line: { kind: 'tempo', bpm } };
  }
  if ((m = /^set (?:the )?swing to (\d[\d.]*) ?(?:percent|%)?$/.exec(low))) {
    const pct = parseNum(m[1]); if (pct === null) return fail('The swing is a number of percent, like 20.', low.indexOf(m[1]) + 1);
    return { ok: true, line: { kind: 'swing', pct } };
  }
  if ((m = /^use (\d+) steps?(?: in (\d+\/\d+))?(?: in groups? of (\d+))?$/.exec(low))) {
    const steps = Number(m[1]), signature = m[2] ?? null; let group = m[3] === undefined ? null : Number(m[3]);
    if (steps < 1 || steps > MAX_RHYTHM_STEPS) return fail(`A bar has 1 to ${MAX_RHYTHM_STEPS} steps.`, 5);
    if (group !== null && (group < 1 || steps % group !== 0)) return fail(`The group size must divide the ${steps} steps.`, low.indexOf('groups') + 1);
    if (signature !== null && group !== null && group === defaultGroup(signature, steps)) group = null;
    return { ok: true, line: { kind: 'grid', steps, signature, group } };
  }
  if ((m = /^add (?:the )?channel (.+)$/.exec(low))) { const c = resolveChannel(m[1]); return c === null ? fail(notChannel(m[1]), low.indexOf(m[1]) + 1) : { ok: true, line: { kind: 'add', channel: c } }; }
  if ((m = /^remove (?:the )?(?:channel (.+)|(.+?) channel)$/.exec(low))) { const n = m[1] ?? m[2]; const c = resolveChannel(n); return c === null ? fail(notChannel(n), low.indexOf(n) + 1) : { ok: true, line: { kind: 'remove', channel: c } }; }
  if ((m = /^shift (?:every channel |everything |all channels |all instruments |the pattern |every instrument )?(?:by )?(?:one step )?(?:to the )?(left|right)$/.exec(low))) return { ok: true, line: { kind: 'shift', dir: m[1] as 'left' | 'right' } };
  if (/^mirror(?: every channel| everything| all channels| the pattern| the bar| the rhythm)?$/.test(low)) return { ok: true, line: { kind: 'mirror' } };
  if ((m = /^rotate (?:the )?(.+?)(?: channel)? (?:by )?(?:one step )?(?:to the )?(left|right)$/.exec(low))) { const c = resolveChannel(m[1]); return c === null ? fail(notChannel(m[1]), low.indexOf(m[1]) + 1) : { ok: true, line: { kind: 'rotate', channel: c, dir: m[2] as 'left' | 'right' } }; }
  if ((m = /^move (?:the )?(.+?)(?: channel)? one place (earlier|later)$/.exec(low))) { const c = resolveChannel(m[1]); return c === null ? fail(notChannel(m[1]), low.indexOf(m[1]) + 1) : { ok: true, line: { kind: 'move', channel: c, dir: m[2] as 'earlier' | 'later' } }; }

  const first = low.split(' ')[0];
  const verbs = ['hit', 'clear', 'set', 'use', 'add', 'remove', 'shift', 'mirror', 'rotate', 'move'];
  if (verbs.includes(first)) return fail(`I could not read "${t}". For example: ${BAR_FORMS.find((f) => f.toLowerCase().startsWith(first)) ?? BAR_FORMS[0]}`);
  return fail(`I do not know how to read "${t}". A bar's sentences start with: ${FORMS_TEXT}. For example: ${BAR_FORMS[0]}`);
}

const CHANNEL_NAMES = ['conga_high', 'conga_low', 'claves', 'hi-hat', 'hi hat', 'hihat', 'snare', 'kick', 'bell'];
const CH_RE = new RegExp(`^(${CHANNEL_NAMES.map((n) => n.replace(/[-]/g, '\\-')).join('|')})(?= )`);

function readHead(low: string): BarParse {
  const m = new RegExp(`^start with (\\d+) steps? in (\\d+/\\d+)(?: in groups? of (\\d+))? at (\\d[\\d.]*) beats? per minute(?: with (\\d[\\d.]*) percent swing)?\\s*:\\s*(.*)$`).exec(low);
  if (!m) return fail('A head reads like: Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.', 1);
  const steps = Number(m[1]), signature = m[2];
  const group = m[3] === undefined ? defaultGroup(signature, steps) : Number(m[3]);
  const bpm = parseNum(m[4]); if (bpm === null) return fail('The tempo is a number of beats per minute, like 118.', low.indexOf(m[4]) + 1);
  const swing = m[5] === undefined ? 0 : parseNum(m[5]); if (swing === null) return fail('The swing is a number of percent, like 20.', low.indexOf(m[5] as string) + 1);
  if (!Number.isInteger(steps) || steps < 1 || steps > MAX_RHYTHM_STEPS) return fail(`A bar has 1 to ${MAX_RHYTHM_STEPS} steps.`, 12);
  if (group < 1 || steps % group !== 0) return fail(`The group size must divide the ${steps} steps.`, low.indexOf('groups') + 1);
  const body = m[6].trim();
  if (body === '') return fail('A head says at least one channel, like: kick on steps 1 and 9.', low.length);
  const channels: Record<string, RhythmStep[]> = {};
  let pos = 0;
  const at = (): string => body.slice(pos);
  const col = (): number => low.length - body.length + pos + 1;
  for (;;) {
    const c = CH_RE.exec(at());
    if (c === null) return fail(`Expected a channel name here (${CHANNEL_LIST}).`, col());
    const name = resolveChannel(c[1]) as string;
    if (name in channels) return fail(`The channel ${name} is said twice.`, col());
    pos += c[0].length + 1;
    const cells: Array<RhythmStep | undefined> = new Array(steps).fill(undefined);
    const noHits = /^with no hits/.exec(at());
    if (noHits) pos += noHits[0].length;
    else {
      for (;;) {
        const on = new RegExp(`^on steps? (${LIST})(?: at velocity (\\d+))?`).exec(at());
        if (on === null) return fail(`Expected "on step 1" or "with no hits" after ${name}.`, col());
        const v = on[2] === undefined ? null : Number(on[2]);
        if (v !== null && (!Number.isInteger(v) || v > 127)) return fail('A velocity is a whole number from 0 to 127.', col());
        for (const s of sortedUnique(listOf(on[1]))) {
          if (s < 1) return fail('Steps count from 1.', col());
          if (s > steps) return fail(`Step ${s} is beyond the ${steps} steps of this bar.`, col());
          if (cells[s - 1] !== undefined) return fail(`Step ${s} of ${name} is said twice.`, col());
          cells[s - 1] = v === null ? true : v;
        }
        pos += on[0].length;
        const more = /^ and (?=on step)/.exec(at());
        if (more) { pos += more[0].length; continue; }
        break;
      }
    }
    channels[name] = cells.map((x) => (x === undefined ? false : x));
    if (at() === '') break;
    const comma = /^, ?/.exec(at());
    if (comma === null) return fail('Expected a comma and the next channel, or the end of the sentence.', col());
    pos += comma[0].length;
  }
  const data: RhythmData = { time_signature: signature, steps, group_size: group, swing_pct: swing, tempo_bpm: bpm, channels };
  const v = validateRhythmData(data);
  if (v.ok === false) return fail(v.message.replace(/^Not rhythm data: /, ''), 1);
  return { ok: true, line: { kind: 'start', data } };
}

// ---- saying ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The head of a bar, or null when the bar cannot be said (a signature that is not N/N, data the Beat Box would refuse, a number written in exponent form). */
export function headSentence(data: RhythmData): string | null {
  try {
    if (validateRhythmData(data).ok === false || !/^\d+\/\d+$/.test(data.time_signature)) return null;
    const bpm = plain(data.tempo_bpm), swing = plain(data.swing_pct ?? 0);
    if (bpm === null || swing === null) return null;
    const clauses: string[] = [];
    for (const [name, row] of Object.entries(data.channels)) {
      const groups: Array<{ velocity: number | null; steps: number[] }> = [];
      const hits = row.map((v, i) => (v === true ? i + 1 : -1)).filter((i) => i > 0);
      if (hits.length > 0) groups.push({ velocity: null, steps: hits });
      const vels = [...new Set(row.filter((v): v is number => typeof v === 'number'))].sort((a, b) => a - b);
      for (const v of vels) groups.push({ velocity: v, steps: row.map((x, i) => (x === v ? i + 1 : -1)).filter((i) => i > 0) });
      clauses.push(groups.length === 0 ? `${name} with no hits` : `${name} ${groups.map((g) => `on ${stepsWords(g.steps)}${g.velocity === null ? '' : ` at velocity ${g.velocity}`}`).join(' and ')}`);
    }
    const group = data.group_size === defaultGroup(data.time_signature, data.steps) ? '' : ` in groups of ${data.group_size}`;
    const swingText = data.swing_pct === 0 || data.swing_pct === undefined ? '' : ` with ${swing} percent swing`;
    return `Start with ${data.steps} ${data.steps === 1 ? 'step' : 'steps'} in ${data.time_signature}${group} at ${bpm} beats per minute${swingText}: ${clauses.join(', ')}.`;
  } catch { return null; }
}

/** The canonical sentence of a line. A grid line with no signature is said in its short form ("Use 8 steps."): use `canonicalBarLine` to say it in full. */
export function renderBarLine(line: BarLine): string {
  switch (line.kind) {
    case 'start': return headSentence(line.data) ?? 'Start with a bar the Beat Box cannot say.';
    case 'hit': return `Hit ${line.channel} on ${stepsWords(sortedUnique(line.steps))}${line.velocity === null ? '' : ` at velocity ${line.velocity}`}.`;
    case 'clear': return line.steps === null ? `Clear ${line.channel}.` : `Clear ${line.channel} on ${stepsWords(sortedUnique(line.steps))}.`;
    case 'tempo': return `Set the tempo to ${plain(line.bpm) ?? String(line.bpm)}.`;
    case 'swing': return `Set the swing to ${plain(line.pct) ?? String(line.pct)} percent.`;
    case 'grid': return `Use ${line.steps} ${line.steps === 1 ? 'step' : 'steps'}${line.signature === null ? '' : ` in ${line.signature}`}${line.group === null ? '' : ` in groups of ${line.group}`}.`;
    case 'add': return `Add the channel ${line.channel}.`;
    case 'remove': return `Remove the channel ${line.channel}.`;
    case 'shift': return `Shift every channel one step to the ${line.dir}.`;
    case 'mirror': return 'Mirror every channel.';
    case 'rotate': return `Rotate the ${line.channel} channel one step to the ${line.dir}.`;
    case 'move': return `Move the ${line.channel} channel one place ${line.dir}.`;
  }
}

/** The canonical sentence of a line in the bar it will be said in: a grid line that leaves out its signature keeps the bar's own, and its group is said only when it is not the default one. */
export function canonicalBarLine(line: BarLine, data: RhythmData): string {
  if (line.kind !== 'grid') return renderBarLine(line);
  const signature = line.signature ?? data.time_signature;
  const group = line.group !== null && line.group !== defaultGroup(signature, line.steps) ? line.group : null;
  return renderBarLine({ kind: 'grid', steps: line.steps, signature, group });
}

// ---- applying ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const cloneData = (d: RhythmData): RhythmData => ({ ...d, channels: Object.fromEntries(Object.entries(d.channels).map(([k, row]) => [k, [...row]])) });
const refuse = (message: string): BarApply => ({ ok: false, message });
const noChannel = (name: string): BarApply => refuse(`There is no ${name} channel in this bar; add it first: Add the channel ${name}.`);
const tooFar = (d: RhythmData, steps: readonly number[]): string | null => {
  for (const s of steps) { if (s < 1) return 'Steps count from 1.'; if (s > d.steps) return `Step ${s} is beyond this bar's ${d.steps} steps.`; }
  return null;
};

/** What the line does to a bar: the new data, or why it cannot. Never throws; the input is never changed. */
export function applyBarLine(data: RhythmData, line: BarLine): BarApply {
  try { return apply(data, line); } catch { return refuse('That sentence could not be applied to this bar.'); }
}

function apply(data: RhythmData, line: BarLine): BarApply {
  const d = cloneData(data);
  const rows = Object.keys(d.channels);
  switch (line.kind) {
    case 'start': return { ok: true, data: cloneData(line.data) };
    case 'hit': {
      if (!(line.channel in d.channels)) return noChannel(line.channel);
      const far = tooFar(d, line.steps); if (far !== null) return refuse(far);
      if (line.velocity !== null && (!Number.isInteger(line.velocity) || line.velocity < 0 || line.velocity > 127)) return refuse('A velocity is a whole number from 0 to 127.');
      for (const s of line.steps) d.channels[line.channel][s - 1] = line.velocity === null ? true : line.velocity;
      return { ok: true, data: d };
    }
    case 'clear': {
      if (!(line.channel in d.channels)) return noChannel(line.channel);
      if (line.steps === null) { d.channels[line.channel] = new Array(d.steps).fill(false); return { ok: true, data: d }; }
      const far = tooFar(d, line.steps); if (far !== null) return refuse(far);
      for (const s of line.steps) d.channels[line.channel][s - 1] = false;
      return { ok: true, data: d };
    }
    case 'tempo':
      if (!Number.isInteger(line.bpm)) return refuse(`The tempo is a whole number from ${MIN_TEMPO} to ${MAX_TEMPO} beats per minute (the Beat Box plays no other).`);
      if (line.bpm < MIN_TEMPO || line.bpm > MAX_TEMPO) return refuse(`The Beat Box plays ${MIN_TEMPO} to ${MAX_TEMPO} beats per minute, not ${line.bpm}.`);
      d.tempo_bpm = line.bpm; return { ok: true, data: d };
    case 'swing':
      if (!Number.isInteger(line.pct)) return refuse('The swing is a whole number from 0 to 100 percent (the Beat Box has no other).');
      if (line.pct < 0 || line.pct > 100) return refuse(`The swing is from 0 to 100 percent, not ${line.pct}.`);
      d.swing_pct = line.pct; return { ok: true, data: d };
    case 'grid': {
      const signature = line.signature ?? d.time_signature;
      const group = line.group ?? defaultGroup(signature, line.steps);
      if (!loadableGrid(signature, line.steps, group)) return refuse(`The Beat Box has no grid of ${line.steps} steps in ${signature}${group === defaultGroup(signature, line.steps) ? '' : ` in groups of ${group}`}. It has 16 steps in 4/4, 8 steps in 4/4 (groups of 2 or 4), 12 in 3/4, 12 in 12/8, 6 in 6/8 and 20 in 5/4.`);
      d.time_signature = signature; d.steps = line.steps; d.group_size = group;
      for (const k of rows) d.channels[k] = new Array(line.steps).fill(false);          // the widget clears the pattern on a grid change
      return { ok: true, data: d };
    }
    case 'add':
      if (line.channel in d.channels) return refuse(`This bar already has a ${line.channel} channel.`);
      d.channels[line.channel] = new Array(d.steps).fill(false); return { ok: true, data: d };
    case 'remove':
      if (!(line.channel in d.channels)) return refuse(`There is no ${line.channel} channel in this bar.`);
      if (rows.length <= 1) return refuse(`${line.channel} is the last channel; a bar keeps at least one.`);
      delete d.channels[line.channel]; return { ok: true, data: d };
    case 'shift': case 'mirror': case 'rotate': {
      if (line.kind === 'rotate' && !(line.channel in d.channels)) return noChannel(line.channel);
      const targets = line.kind === 'rotate' ? [line.channel] : rows;
      for (const k of targets) {
        const src = d.channels[k], n = d.steps, out: RhythmStep[] = new Array(n);
        for (let i = 0; i < n; i++) {
          const from = line.kind === 'mirror' ? n - 1 - i : (((i - (line.dir === 'right' ? 1 : -1)) % n) + n) % n;
          out[i] = cellOf(src[from]);
        }
        d.channels[k] = out;
      }
      return { ok: true, data: d };
    }
    case 'move': {
      const i = rows.indexOf(line.channel);
      if (i < 0) return noChannel(line.channel);
      const j = i + (line.dir === 'earlier' ? -1 : 1);
      if (j < 0) return refuse(`${line.channel} is already the first channel.`);
      if (j >= rows.length) return refuse(`${line.channel} is already the last channel.`);
      const order = [...rows]; [order[i], order[j]] = [order[j], order[i]];
      d.channels = Object.fromEntries(order.map((k) => [k, d.channels[k]]));
      return { ok: true, data: d };
    }
  }
}
