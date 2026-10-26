// score_first (drain 2026-10-26-0900) — the mix Inspector in PATH mode tells the truth about the path, not the vote: `made by phrase_002 (mix, path, 2 of 4 changes)`, and a hit's line says whether it is from both bars,
// from bar a only (removed at change K) or from bar b only (added at change K), derived from the morph's ordered edits and the stop (k) the engine returned — and CROSS-CHECKED against the bar the engine drew, so the
// copy of the rule here can never silently drift from it. Vote mode's Inspector is byte-identical (mix-lineage-core.test.ts / mix-inspector.test.ts run unchanged). Pure plus the DOM (happy-dom, a hand-made SVG).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { HITBOX_CLASS, PINNED_CLASS, attachArtifactInspector } from './artifact-inspector-core.ts';
import { createScoreInspector } from './score-inspector.ts';
import {
  MIX_BAR_ID, MIX_COLOURS, annotateMixPayload, classifyPathHits, mixLegend, mixLineageOf, mixProvenance, pathHitsFromEngine, type MixParams,
} from './mix-lineage-core.ts';
import { MIX_MARK_CLASS, paintMixHits } from './mix-hits-dom.ts';
import type { Provenance, ProvenanceResult, RhythmDataLike } from './provenance-core.ts';

const row = (at: number[], velocity: Record<number, number> = {}): Array<boolean | number> => Array.from({ length: 16 }, (_, i) => (at.includes(i) ? (velocity[i] ?? true) : false));
const bar = (channels: Record<string, Array<boolean | number>>): RhythmDataLike => ({ time_signature: '4/4', steps: 16, group_size: 4, channels });
const A = bar({ kick: row([0, 4, 8, 12]), snare: row([4]) });
const B = bar({ kick: row([0, 2, 4, 6]), snare: row([4]) });
// the morph's ordered edits for A -> B (the engine decides the order; here it is given): 4 changes
const EDITS = [
  { kind: 'remove' as const, channel: 'kick', step: 12 },
  { kind: 'add' as const, channel: 'kick', step: 2 },
  { kind: 'remove' as const, channel: 'kick', step: 8 },
  { kind: 'add' as const, channel: 'kick', step: 6 },
];
/** The bar at stop k, as the engine draws it: a's hits with the first k edits applied. */
function stateAt(k: number): RhythmDataLike {
  const kick = new Set([0, 4, 8, 12]);
  for (const e of EDITS.slice(0, k)) { if (e.kind === 'remove') kick.delete(e.step); else kick.add(e.step); }
  return bar({ kick: row([...kick].sort((x, y) => x - y)), snare: row([4]) });
}
const PATH = (weight: number): MixParams => ({ a: 'bar_005', b: 'bar_001', weight, threshold: 0.65, ghost: true, mode: 'path', order: 'musical', seed: 0 });

// ---- the rule ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('classifyPathHits: the hits of stop k, each from both bars, from a only (and the change that removes it) or from b only (and the change that adds it)', () => {
  const hits = classifyPathHits(A, B, EDITS, 2);
  const key = (h: { channel: string; step: number; kind: string; changeAt?: number }) => `${h.channel}:${h.step}:${h.kind}:${h.changeAt ?? '-'}`;
  assert.deepEqual(hits.map(key), ['kick:0:both:-', 'kick:2:b:2', 'kick:4:both:-', 'kick:8:a:3', 'snare:4:both:-']);
  assert.deepEqual(classifyPathHits(A, B, EDITS, 0).map(key), ['kick:0:both:-', 'kick:4:both:-', 'kick:8:a:3', 'kick:12:a:1', 'snare:4:both:-'], 'stop 0 is bar a: its changes are all still to come');
  assert.deepEqual(classifyPathHits(A, B, EDITS, 4).map(key), ['kick:0:both:-', 'kick:2:b:2', 'kick:4:both:-', 'kick:6:b:4', 'snare:4:both:-'], 'stop d is bar b');
});

test('pathHitsFromEngine: the rule\'s hits are checked against the bar the ENGINE drew; each carries the engine\'s own velocity; a hit the rule places that the engine did not draw (or the reverse) is a refusal naming it', () => {
  const drawn = bar({ kick: row([0, 2, 4, 8], { 2: 72 }), snare: row([4]) });
  const ok = pathHitsFromEngine(A, B, EDITS, 2, drawn);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.hits.map((h) => [h.channel, h.step, h.velocity]), [['kick', 0, 90], ['kick', 2, 72], ['kick', 4, 90], ['kick', 8, 90], ['snare', 4, 90]]);
  const missing = pathHitsFromEngine(A, B, EDITS, 2, bar({ kick: row([0, 4, 8]), snare: row([4]) }));
  assert.equal(missing.ok, false);
  if (missing.ok === false) assert.match(missing.problems[0], /kick step 3: the path places a hit the engine did not draw/);
  const extra = pathHitsFromEngine(A, B, EDITS, 2, bar({ kick: row([0, 2, 4, 8, 12]), snare: row([4]) }));
  assert.equal(extra.ok, false);
  if (extra.ok === false) assert.match(extra.problems[0], /kick step 13: the engine drew a hit the path does not place/);
});

// ---- provenance and the lineage stack ---------------------------------------------------------------------------------------------------------------------------------------------

function pathMap(k: number, params = PATH(0.5)) {
  const hits = classifyPathHits(A, B, EDITS, k).map((h) => ({ ...h, velocity: 90 }));
  const annotated = hits.map((h) => ({ id: `mx_${h.channel}_${h.step}`, channel: h.channel, step: h.step }));
  return { hits, map: mixProvenance('phrases/phrase_002', params, annotated, hits, 100, { d: 4, k }) };
}
const prov = (map: Record<string, Provenance>, id: string) => map[id];

test('the bar\'s stack in path mode: `made by phrase_002 (mix, path, 2 of 4 changes)`, the two parent bars as links, and a legend of the three colours (no ghost entry: a path has no ghosts)', () => {
  const { map } = pathMap(2);
  const stack = mixLineageOf(prov(map, MIX_BAR_ID));
  assert.deepEqual(stack.map((e) => e.text), ['made by phrase_002 (mix, path, 2 of 4 changes)', 'from bar_005', 'from bar_001', '▲ only bar_005 · ■ only bar_001 · ● both bars']);
  assert.equal(stack[0].noteId, 'phrases/phrase_002');
  assert.equal(stack[1].noteId, 'bars/bar_005'); assert.equal(stack[2].noteId, 'bars/bar_001');
  assert.equal(mixLegend(PATH(0.5)).text.includes('ghost'), false, 'no ghost line even though the note keeps ghost: true');
});

test('a hit\'s line in path mode: from both bars / from bar a only (removed at change K) / from bar b only (added at change K), with the engine\'s velocity, over the bar\'s stack', () => {
  const { map } = pathMap(2);
  assert.equal(mixLineageOf(prov(map, 'mx_kick_0'))[0].text, 'this hit: from both bars, velocity 90');
  assert.equal(mixLineageOf(prov(map, 'mx_kick_2'))[0].text, 'this hit: from bar_001 only (added at change 2), velocity 90');
  assert.equal(mixLineageOf(prov(map, 'mx_kick_8'))[0].text, 'this hit: from bar_005 only (removed at change 3), velocity 90');
  assert.equal(mixLineageOf(prov(map, 'mx_kick_8'))[1].text, 'made by phrase_002 (mix, path, 2 of 4 changes)');
  // the stop changes the answer: at stop 4 (bar b) the added hit is added at change 4, and bar a's hits are gone
  const at4 = pathMap(4, PATH(0)).map;
  assert.equal(mixLineageOf(prov(at4, 'mx_kick_6'))[0].text, 'this hit: from bar_001 only (added at change 4), velocity 90');
  assert.equal(at4['mx_kick_8'], undefined, 'a hit removed by stop 4 is not on the Score and not in the map');
});

test('a vote mix\'s provenance and lines are untouched: no mode, no path facts in its params; the vote lines read as before', () => {
  const params: MixParams = { a: 'bar_005', b: 'bar_001', weight: 0.7, threshold: 0.5, ghost: false };
  const map = mixProvenance('phrases/phrase_002', params, [{ id: 'mx_kick_2', channel: 'kick', step: 2 }], [{ channel: 'kick', step: 2, kind: 'a', v: 0.7, velocity: 90 }], 100);
  assert.deepEqual(Object.keys(map[MIX_BAR_ID].params).sort(), ['a', 'b', 'ghost', 'tempo', 'threshold', 'weight']);
  assert.equal(mixLineageOf(map.mx_kick_2)[0].text, 'this hit: from bar_005 only, velocity 90');
  assert.equal(mixLineageOf(map[MIX_BAR_ID])[0].text, 'made by phrase_002 (mix, 70 % bar_005 / 30 % bar_001, threshold 0.50)');
});

test('annotateMixPayload in path mode says why it cannot map: the path\'s facts or the two bars did not reach the Score (never a guess)', () => {
  const base = { content: '<score-partwise/>', forge_mix: { a: A, b: B }, mixed_bar: stateAt(2) };
  assert.equal(annotateMixPayload('phrases/phrase_002', PATH(0.5), base).problems[0], 'the engine did not return the path\'s state (path_state and morph_info)');
  assert.equal(annotateMixPayload('phrases/phrase_002', PATH(0.5), { ...base, path_state: { d: 4, k: 2 }, morph_info: { d: 3, edits: EDITS.slice(0, 3), bars: 1 } }).problems[0], 'the path\'s state does not match its edits (4 changes against 3)');
  const bad = annotateMixPayload('phrases/phrase_002', PATH(0.5), { ...base, mixed_bar: stateAt(1), path_state: { d: 4, k: 2 }, morph_info: { d: 4, edits: EDITS, bars: 1 } });
  assert.match(bad.problems[0], /the path places a hit the engine did not draw|the engine drew a hit the path does not place/);
});

// ---- in the DOM -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function resultFor(k: number): ProvenanceResult {
  const { map } = pathMap(k, PATH(1 - k / 4));
  return { payload: {}, map, problems: [], kitProblems: [] };
}
function host(win: any, ids: string[]): HTMLElement {
  const h = win.document.createElement('div');
  h.innerHTML = `<svg><g class="measure" id="${MIX_BAR_ID}"><g class="staff"><path id="staffline"/></g>${ids.map((id) => `<g class="note" id="${id}"><g class="notehead"><use id="${id}-h"/></g></g>`).join('')}</g></svg>`;
  win.document.body.appendChild(h);
  return h as HTMLElement;
}
function rig() {
  const win: any = new Window({ url: 'http://localhost/' });
  const slot = win.document.createElement('div'); win.document.body.appendChild(slot);
  const insp = createScoreInspector(slot, {
    noteId: 'phrases/phrase_002', openNote: () => {}, lineage: mixLineageOf, hint: 'Click the bar or a note to see where it came from.',
    order: () => [], keepPin: true, enlargeTargets: { x: 0.35, y: 0.15 },
    enlargeIds: (map) => Object.keys(map).filter((id) => map[id].params.channel !== undefined),
    decorate: (root, map, pinned) => { paintMixHits(root, map, pinned); },
  });
  const show = (k: number) => {
    const r = resultFor(k);
    const h = host(win, Object.keys(r.map).filter((id) => id !== MIX_BAR_ID));
    for (const el of h.querySelectorAll('*')) (el as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
    insp.onShown(h, r);
    return { h, r };
  };
  const click = (el: Element) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const stack = () => [...slot.querySelectorAll('.forge-inspector-lineage > li > span')].map((s: Element) => s.textContent as string);
  return { win, slot, show, click, stack };
}

test('clicking a hit of a path mix pins it and shows the path\'s line; the notehead is painted by where it came from (the vote\'s colours and marks); the bar stack below says the stop', () => {
  const t = rig();
  const { h } = t.show(2);
  t.click(h.querySelector('#mx_kick_2-h')!);
  assert.deepEqual(t.stack().slice(0, 3), ['this hit: from bar_001 only (added at change 2), velocity 90', 'made by phrase_002 (mix, path, 2 of 4 changes)', 'from bar_005']);
  assert.ok(h.querySelector('#mx_kick_2')!.classList.contains(PINNED_CLASS));
  const fill = (id: string) => (h.querySelector(`#${id} .notehead`) as HTMLElement).style.fill;
  assert.equal(fill('mx_kick_2'), MIX_COLOURS.b);
  assert.equal(fill('mx_kick_8'), MIX_COLOURS.a);
  assert.equal(fill('mx_kick_0'), MIX_COLOURS.both);
  assert.ok(h.querySelectorAll(`.${MIX_MARK_CLASS}`).length >= 1, 'the marks are drawn');
});

test('the pin survives a redraw to another stop (dragging the Weight slider): the same bar stays pinned and its stack now says the new stop', () => {
  const t = rig();
  const first = t.show(2);
  t.click(first.h.querySelector(`#${MIX_BAR_ID} .staff`)!);
  assert.equal(t.stack()[0], 'made by phrase_002 (mix, path, 2 of 4 changes)');
  const second = t.show(3);
  assert.ok(second.h.querySelector(`#${MIX_BAR_ID}`)!.classList.contains(PINNED_CLASS), 'still pinned after the redraw');
  assert.equal(t.stack()[0], 'made by phrase_002 (mix, path, 3 of 4 changes)');
  void HITBOX_CLASS; void attachArtifactInspector;
});
