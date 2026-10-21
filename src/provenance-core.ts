// score_first_experiment M3 (drain 2026-10-21-1230) — the PROVENANCE MAP of an engraved rhythm Score: which note (file) and which hit made each engraved note.
//
// WHY THIS SHAPE (the investigation, FEEDBACK §evidence): an engraved note has to be tied to (channel, step) reliably. Three ways were tried on the four playground bars
// and the awkward bars (8 steps, swing, two channels on one step, an empty channel, every step on, all seven channels):
//   (a) Verovio's timeMap + the step times of the data  — works for the sounding time, but not for WHICH channel in the single-staff Kit view, and it needs the tempo/meter maths.
//   (b) ids carried THROUGH Verovio: give each hit a `<note id="…">` in the MusicXML — Verovio keeps it as the SVG element's id (verified in real Verovio, both views).
//   (c) document order within a staff — brittle against rests, chords and the Kit view's two voices.
// (b) wins because the id is the key BY CONSTRUCTION: the map is built from the data and the MusicXML alone, with no SVG parsing and no timing, and the same id names the
// same hit in the multi-staff view and in the Kit view. To put the ids on the right notes this reads the MusicXML's own structure (one <part> per channel in canonical order;
// a note's ONSET = the sum of the durations before it, with <backup>/<forward>/<chord> honoured; step = onset / (one step's divisions)), and then VERIFIES that the hits it found are
// exactly the hits of the data, per channel and in order. If they are not, nothing is annotated and the reason is returned: it never guesses.
//
// Nothing about the ENGINE changes: the annotation is a plugin-side rewrite of the MusicXML text the engine already returns, before Verovio sees it; the engine's MIDI is untouched.
// The map's shape is generic on purpose (noteId, role, params) so extend and mix (M5, M7) can add parents later; only `params` knows about drums.

/** The engine's channel order (`_RHYTHM_CHANNEL_INSTRUMENTS` in forge/music/lib.py): the parts of a rhythm Score follow it, not the JSON key order. A real-engine test pins this list. */
export const CANONICAL_CHANNELS = ['kick', 'snare', 'hihat', 'bell', 'claves', 'conga_high', 'conga_low'] as const;

export interface RhythmDataLike {
  time_signature: string;
  steps: number;
  group_size: number;
  channels: Record<string, ReadonlyArray<unknown>>;
}

export interface Provenance {
  /** The note (file id, e.g. `bars/bar_003`) that made this element. */
  noteId: string;
  /** What the element is for that note ("hit" today; a parent role for extend/mix later). */
  role: string;
  /** Free parameters of the role. For a hit: channel, step (0-based), beat label, velocity when authored. */
  params: Record<string, unknown>;
}

export type ProvenanceMap = Record<string, Provenance>;

/** "beat 2", "beat 2 e", "beat 2 and", "beat 2 a" (group size 4); "beat 2", "beat 2 and" (2); "beat 2", "beat 2 trip", "beat 2 let" (3); otherwise "beat 2 +k". */
export function beatLabel(step: number, groupSize: number): string {
  const beat = Math.floor(step / groupSize) + 1;
  const sub = step % groupSize;
  const names: Record<number, string[]> = { 2: ['', 'and'], 3: ['', 'trip', 'let'], 4: ['', 'e', 'and', 'a'] };
  const n = names[groupSize]?.[sub];
  if (n === undefined) return sub === 0 ? `beat ${beat}` : `beat ${beat} +${sub}`;
  return n === '' ? `beat ${beat}` : `beat ${beat} ${n}`;
}

/** A hit: anything the engine writes as a note — `true`, or an int velocity 1-127. (`false` and 0 are rests.) */
function isHit(v: unknown): boolean {
  return v === true || (typeof v === 'number' && Number.isInteger(v) && v > 0);
}

export function hitSteps(cells: ReadonlyArray<unknown>): number[] {
  const out: number[] = [];
  cells.forEach((v, i) => { if (isHit(v)) out.push(i); });
  return out;
}

interface XmlNote {
  tagStart: number;         // index of `<note` in the xml
  tagEnd: number;           // index just past the `>` of the opening tag
  rest: boolean;
  onset: number;            // in divisions from the start of the bar
  pitch: string | null;     // "F4" (pitched) or "F4" display position (unpitched)
  hasId: boolean;
  tieStop: boolean;         // the TAIL of a tied hit: the engine splits a ring that is not one note value (e.g. 10 steps = half + eighth) into tied notes
}

interface XmlPart { notes: XmlNote[]; divisions: number; measures: number }

const PART_RE = /<part\s+id="[^"]*"\s*>([\s\S]*?)<\/part>/g;
const MEASURE_RE = /<measure\b[^>]*>([\s\S]*?)<\/measure>/g;
const TOKEN_RE = /<note\b([^>]*)>([\s\S]*?)<\/note>|<backup>\s*<duration>(\d+)<\/duration>\s*<\/backup>|<forward>\s*<duration>(\d+)<\/duration>[\s\S]*?<\/forward>/g;

/** Scan the <part>s of a MusicXML document: every <note> with its onset in the bar. Returns null when the document is not one this understands. */
export function scanParts(xml: string): XmlPart[] | null {
  const parts: XmlPart[] = [];
  PART_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = PART_RE.exec(xml)) !== null) {
    const partStart = pm.index + pm[0].indexOf('>') + 1;
    const divisions = Number(/<divisions>(\d+)<\/divisions>/.exec(pm[1])?.[1]);
    if (!Number.isFinite(divisions) || divisions <= 0) return null;
    const part: XmlPart = { notes: [], divisions, measures: 0 };
    MEASURE_RE.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = MEASURE_RE.exec(pm[1])) !== null) {
      part.measures++;
      const mStart = partStart + mm.index + mm[0].indexOf('>') + 1;
      let cursor = 0;
      let lastOnset = 0;
      TOKEN_RE.lastIndex = 0;
      let tm: RegExpExecArray | null;
      while ((tm = TOKEN_RE.exec(mm[1])) !== null) {
        if (tm[3] !== undefined) { cursor -= Number(tm[3]); continue; }
        if (tm[4] !== undefined) { cursor += Number(tm[4]); continue; }
        const attrs = tm[1];
        const body = tm[2];
        const chord = /<chord\s*\/>/.test(body);
        const duration = Number(/<duration>(\d+)<\/duration>/.exec(body)?.[1] ?? 0);
        const onset = chord ? lastOnset : cursor;
        const rest = /<rest\b/.test(body);
        const pitchM = /<pitch>\s*<step>([A-G])<\/step>(?:\s*<alter>[^<]*<\/alter>)?\s*<octave>(-?\d+)<\/octave>/.exec(body)
          ?? /<unpitched>\s*<display-step>([A-G])<\/display-step>\s*<display-octave>(-?\d+)<\/display-octave>/.exec(body);
        const tagStart = mStart + tm.index;
        part.notes.push({
          tagStart,
          tagEnd: tagStart + '<note'.length + attrs.length + 1,
          rest,
          onset,
          pitch: pitchM ? `${pitchM[1]}${pitchM[2]}` : null,
          hasId: /\sid\s*=/.test(attrs),
          tieStop: /<tie\s+type="stop"/.test(body),
        });
        if (!chord) { lastOnset = onset; cursor += duration; }
      }
    }
    parts.push(part);
  }
  return parts.length > 0 ? parts : null;
}

/** An engraved note and the hit it belongs to. A tied TAIL (`tiedFrom` = the id of the head note) is the same hit drawn a second time: it has its own element id and the same provenance. */
export interface AnnotatedHit { id: string; channel: string; step: number; tiedFrom?: string }

export type AnnotateResult =
  | { ok: true; multiXml: string; kitXml: string | null; hits: AnnotatedHit[]; kitProblems: string[] }
  | { ok: false; problems: string[] };

/** The element id of a hit. `scope` keeps two notes' hits apart when a score has several (M5+); an XML id is an NCName, so letters, digits, `_` and `-` only. */
export function hitId(scope: string, channel: string, step: number): string {
  return `${scope}_${channel}_${step}`;
}

function stepDivisions(data: RhythmDataLike, divisions: number): number | null {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(data.time_signature.trim());
  if (!m) return null;
  const barQuarter = (Number(m[1]) * 4) / Number(m[2]);
  const d = (divisions * barQuarter) / data.steps;
  return Number.isFinite(d) && d > 0 ? d : null;
}

function insertIds(xml: string, notes: XmlNote[], ids: Map<XmlNote, string>): string {
  // apply right to left so earlier indices stay valid
  const todo = [...ids.entries()].sort((a, b) => b[0].tagStart - a[0].tagStart);
  let out = xml;
  for (const [n, id] of todo) {
    const tag = out.slice(n.tagStart, n.tagEnd);
    if (!tag.startsWith('<note')) throw new Error('annotateRhythmXml: the scanner lost its place in the MusicXML');
    out = out.slice(0, n.tagEnd - 1) + ` id="${id}"` + out.slice(n.tagEnd - 1);
  }
  void notes;
  return out;
}

/** Put a deterministic id on every engraved hit of a rhythm Score's MusicXML (multi-staff view, and the Kit view when given), verified against the data. */
export function annotateRhythmXml(multiXml: string, kitXml: string | null, data: RhythmDataLike, scope = 'a'): AnnotateResult {
  const problems: string[] = [];
  const present = CANONICAL_CHANNELS.filter((c) => Object.prototype.hasOwnProperty.call(data.channels, c));
  const unknown = Object.keys(data.channels).filter((c) => !(CANONICAL_CHANNELS as readonly string[]).includes(c));
  if (unknown.length > 0) return { ok: false, problems: [`channel(s) the provenance map does not know: ${unknown.join(', ')}`] };

  const multi = scanParts(multiXml);
  if (!multi) return { ok: false, problems: ['the multi-staff MusicXML could not be scanned'] };
  if (multi.length !== present.length) problems.push(`the Score has ${multi.length} part(s) but the data has ${present.length} channel(s)`);
  if (multi.some((p) => p.measures !== 1)) problems.push('more than one bar: the provenance map covers a single bar');
  if (problems.length > 0) return { ok: false, problems };

  const hits: AnnotatedHit[] = [];
  const multiIds = new Map<XmlNote, string>();
  const signature = new Map<string, string>();             // pitch position -> channel, taken from the multi-staff view
  for (const [i, channel] of present.entries()) {
    const part = multi[i];
    const div = stepDivisions(data, part.divisions);
    if (div === null) return { ok: false, problems: [`the time signature "${data.time_signature}" is not N/D`] };
    const found = part.notes.filter((n) => !n.rest);
    const heads = found.filter((n) => !n.tieStop);
    const steps = heads.map((n) => n.onset / div);
    const expected = hitSteps(data.channels[channel]);
    if (steps.length !== expected.length || steps.some((s, k) => s !== expected[k])) {
      problems.push(`${channel}: the Score's hits [${steps.join(',')}] are not the data's [${expected.join(',')}]`);
      continue;
    }
    let h = -1, tails = 0, headId = '';
    for (const n of found) {
      if (!n.tieStop) {
        h++; tails = 0; headId = hitId(scope, channel, expected[h]);
        multiIds.set(n, headId);
        hits.push({ id: headId, channel, step: expected[h] });
      } else {
        const id = `${headId}_t${++tails}`;
        multiIds.set(n, id);
        hits.push({ id, channel, step: expected[h], tiedFrom: headId });
      }
    }
    const sig = found[0]?.pitch;
    if (sig) {
      if (signature.has(sig) && signature.get(sig) !== channel) problems.push(`${channel} and ${signature.get(sig)} share the notehead position ${sig}`);
      signature.set(sig, channel);
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  // The Kit view is checked separately and NEVER blocks the map: the multi-staff view is always the faithful one. (Measured: the Kit XML of a bar with three or more channels can be
  // time-unfaithful — bar_004's upper voice spans 23 steps in a 12-step bar — so its notes cannot be tied to steps. That is reported, not guessed around.)
  const kitProblems: string[] = [];
  let kitOut: string | null = null;
  if (kitXml !== null) {
    const kit = scanParts(kitXml);
    const div = kit && kit.length === 1 ? stepDivisions(data, kit[0].divisions) : null;
    if (!kit || kit.length !== 1 || kit[0].measures !== 1) kitProblems.push('the Kit MusicXML is not a single part of a single bar');
    else if (div === null) kitProblems.push(`the time signature "${data.time_signature}" is not N/D`);
    else {
      const kitIds = new Map<XmlNote, string>();
      const perChannel = new Map<string, number[]>();
      const lastHead = new Map<string, { id: string; tails: number }>();
      for (const n of kit[0].notes.filter((x) => !x.rest).sort((a, b) => a.onset - b.onset)) {
        const channel = n.pitch ? signature.get(n.pitch) : undefined;
        const step = n.onset / div;
        if (channel === undefined) { kitProblems.push(`a Kit note at ${n.pitch ?? '?'} matches no channel`); continue; }
        if (n.tieStop) {
          const head = lastHead.get(channel);
          if (!head) { kitProblems.push(`a Kit tie tail on ${channel} has no head`); continue; }
          kitIds.set(n, `${head.id}_t${++head.tails}`);
          continue;
        }
        if (!Number.isInteger(step)) { kitProblems.push(`a Kit note is off the step grid (${step})`); continue; }
        const id = hitId(scope, channel, step);
        kitIds.set(n, id);
        lastHead.set(channel, { id, tails: 0 });
        (perChannel.get(channel) ?? perChannel.set(channel, []).get(channel)!).push(step);
      }
      for (const channel of present) {
        const got = (perChannel.get(channel) ?? []).sort((a, b) => a - b);
        const expected = hitSteps(data.channels[channel]);
        if (got.length !== expected.length || got.some((st, k) => st !== expected[k])) kitProblems.push(`${channel}: the Kit view's hits [${got.join(',')}] are not the data's [${expected.join(',')}]`);
      }
      if (kitProblems.length === 0) kitOut = insertIds(kitXml, kit[0].notes, kitIds);
    }
  }
  return { ok: true, multiXml: insertIds(multiXml, multi.flatMap((p) => p.notes), multiIds), kitXml: kitOut, hits, kitProblems };
}

/** The element id -> provenance table for the hits `annotateRhythmXml` found. `velocity` is carried when the data authored one (an int, not a plain `true`). */
export function provenanceFor(noteId: string, data: RhythmDataLike, hits: AnnotatedHit[]): ProvenanceMap {
  const map: ProvenanceMap = {};
  for (const h of hits) {
    const cell = data.channels[h.channel][h.step];
    const params: Record<string, unknown> = { channel: h.channel, step: h.step, beat: beatLabel(h.step, data.group_size) };
    if (typeof cell === 'number') params.velocity = cell;
    if (h.tiedFrom !== undefined) params.tiedFrom = h.tiedFrom;
    map[h.id] = { noteId, role: 'hit', params };
  }
  return map;
}

export interface ScorePayload { [k: string]: unknown }

export interface ProvenanceResult {
  /** The payload to render: the same one, with the ids on its MusicXML — or untouched when the map could not be built. */
  payload: ScorePayload;
  /** element id -> provenance; empty when it could not be built. */
  map: ProvenanceMap;
  /** Why the map could not be built (empty on success): shown by the inspector, never guessed around. */
  problems: string[];
  /** Why the Kit view (not the multi-staff view) is not mapped; empty when it is. The map itself is fine. */
  kitProblems: string[];
}

/** The whole step: the engine's tagged-MusicXML payload for `data` -> the payload with ids + the provenance map. Never throws; never changes anything it cannot verify. */
export function attachProvenance(noteId: string, data: RhythmDataLike, payload: ScorePayload): ProvenanceResult {
  const multi = typeof payload.multi_staff_content === 'string' ? payload.multi_staff_content : typeof payload.content === 'string' ? payload.content : null;
  const kit = typeof payload.kit_content === 'string' ? payload.kit_content : null;
  if (multi === null) return { payload, map: {}, problems: ['the Score payload carries no MusicXML'], kitProblems: [] };
  let r: AnnotateResult;
  try {
    r = annotateRhythmXml(multi, kit, data, 'a');
  } catch (e) {
    console.error('attachProvenance failed', e);
    return { payload, map: {}, problems: [`the provenance map could not be built (${(e as Error)?.message ?? e})`], kitProblems: [] };
  }
  if (r.ok === false) return { payload, map: {}, problems: r.problems, kitProblems: [] };
  const next: ScorePayload = { ...payload };
  if (typeof payload.multi_staff_content === 'string') next.multi_staff_content = r.multiXml; else next.content = r.multiXml;
  if (kit !== null && r.kitXml !== null) next.kit_content = r.kitXml;
  return { payload: next, map: provenanceFor(noteId, data, r.hits), problems: [], kitProblems: r.kitProblems };
}
