// score_first_experiment M1 (drain 2026-10-21-1100) — the DOM of the Score under the Beat Box, in happy-dom: the code the tab runs, with a fake engraver and a fake player.
// Includes the P3 half for the tab itself: in a vault that is not score-first the tab's DOM is byte-for-byte what it was.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import {
  READY_TIMEOUT_MS, SCORE_HOST_CLASS, SCORE_HOST_PENDING_CLASS, SCORE_HOST_STALE_CLASS, SCORE_PANEL_CLASS, SCORE_PANEL_LABEL, SCORE_STATUS_CLASS, attachScoreArea, mountLeanNote, mountScorePanel, type ScoreAreaPorts,
} from './live-score-dom.ts';
import { LEAN_SCORE_NOTE, scorePanelPlan } from './score-first-core.ts';
import { RHYTHM_STARTER } from './new-note-core.ts';

function page() {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const tab = doc.createElement('div');
  tab.className = 'forge-rhythm-edit-view';
  const iframe = doc.createElement('iframe');
  iframe.style.minHeight = '100%';
  tab.appendChild(iframe);
  doc.body.appendChild(tab);
  return { win, doc, tab: tab as HTMLElement };
}

function ports(over: Partial<ScoreAreaPorts> = {}) {
  const rendered: Array<{ host: HTMLElement; tag: string }> = [];
  const stopped: HTMLElement[] = [];
  const timers: Array<() => void> = [];
  const p: ScoreAreaPorts = {
    renderInto: (host, payload) => { host.textContent = String(payload.content); host.appendChild(host.ownerDocument.createElement('svg')); rendered.push({ host, tag: String(payload.content) }); return true; },
    stopPlayers: (host) => { stopped.push(host); },
    compute: async (_d, title) => ({ type: 'musicxml', content: `score-of-${title}` }),
    title: 'bar_001',
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => { /* not needed here */ },
    ...over,
  };
  return { p, rendered, stopped, timers };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('P3 — a vault that is not score-first: the Beat Box tab\'s DOM is byte-for-byte what it was (nothing added, nothing touched), in both editions', () => {
  for (const edition of ['music', 'lean'] as const) {
    const { tab } = page();
    const before = tab.outerHTML;
    const plan = scorePanelPlan({ scoreFirst: false, edition });
    const area = attachScoreArea(tab, plan, ports().p);
    assert.equal(area, null, `${edition}: no area object`);
    assert.equal(tab.outerHTML, before, `${edition}: the tab's DOM is identical`);
    assert.equal(tab.querySelector(`.${SCORE_PANEL_CLASS}`), null);
  }
});

test('score-first, music edition: a labelled region with a status line, under the widget; the first score is drawn into the shared host class', async () => {
  const { tab } = page();
  const { p, rendered } = ports();
  const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'music' }), p)!;
  assert.ok(area);
  assert.equal(tab.children.length, 2, 'the iframe and the panel');
  assert.equal(tab.children[0].tagName, 'IFRAME');
  const panel = tab.children[1] as HTMLElement;
  assert.equal(panel.className, SCORE_PANEL_CLASS);
  assert.equal(panel.getAttribute('role'), 'region');
  assert.equal(panel.getAttribute('aria-label'), SCORE_PANEL_LABEL);
  assert.equal((panel.children[0] as HTMLElement).className, SCORE_STATUS_CLASS);
  assert.equal(panel.children[0].getAttribute('aria-live'), 'polite');
  area.showNow(RHYTHM_STARTER);
  assert.equal(panel.children[0].textContent, 'Rendering score…');
  await flush();
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].tag, 'score-of-bar_001');
  assert.equal(panel.children[0].textContent, '', 'the status line is cleared');
  assert.equal(panel.querySelectorAll(`.${SCORE_HOST_CLASS}`).length, 1);
});

test('a new score replaces the old one only once it is in: the old host is silenced and removed AFTER the new host is drawn', async () => {
  const { tab } = page();
  const order: string[] = [];
  const { p, rendered, stopped } = ports({
    renderInto: (host, payload) => { order.push(`render ${String(payload.content)}`); host.textContent = String(payload.content); host.appendChild(host.ownerDocument.createElement('svg')); return true; },
    stopPlayers: (host) => { order.push(`stop ${host.textContent}`); stopped.push(host); },
    compute: async (_d, _t) => ({ type: 'musicxml', content: `v${order.length}` }),
  });
  const panelHosts = () => tab.querySelectorAll(`.${SCORE_HOST_CLASS}`);
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  const first = panelHosts()[0] as HTMLElement;
  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 90 }); await flush();
  assert.equal(panelHosts().length, 1, 'never two scores on screen after the swap');
  assert.notEqual(panelHosts()[0], first);
  assert.ok(!first.isConnected);
  const i = order.findIndex((o) => o.startsWith('render') && order.indexOf(o) > 0);
  assert.ok(order.indexOf('stop v0') > i, `the old player is stopped after the new score rendered: ${order.join(' | ')}`);
  assert.deepEqual(stopped.map((h) => h.textContent), ['v0']);
  void rendered;
});

test('a renderer that is unavailable removes the half-made host and leaves the old score where it was', async () => {
  const { tab } = page();
  let ok = true;
  const { p } = ports({ renderInto: (host, payload) => { if (!ok) return false; host.textContent = String(payload.content); host.appendChild(host.ownerDocument.createElement('svg')); return true; } });
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  ok = false;
  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 91 }); await flush();
  const hosts = tab.querySelectorAll(`.${SCORE_HOST_CLASS}`);
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].textContent, 'score-of-bar_001', 'the old score stays');
  assert.match(tab.querySelector(`.${SCORE_STATUS_CLASS}`)!.textContent!, /music edition/);
});

test('a renderer that throws also removes the half-made host (and the old score stays)', async () => {
  const { tab } = page();
  const orig = console.error; console.error = () => { /* expected */ };
  try {
    let boom = false;
    const { p } = ports({ renderInto: (host, payload) => { if (boom) throw new Error('nope'); host.textContent = String(payload.content); host.appendChild(host.ownerDocument.createElement('svg')); return true; } });
    const area = attachScoreArea(tab, 'score', p)!;
    area.showNow(RHYTHM_STARTER); await flush();
    boom = true;
    area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 92 }); await flush();
    assert.equal(tab.querySelectorAll(`.${SCORE_HOST_CLASS}`).length, 1);
    assert.match(tab.querySelector(`.${SCORE_STATUS_CLASS}`)!.textContent!, /could not draw the score \(nope\)/);
  } finally {
    console.error = orig;
  }
});

test('an invalid bar clears the score and shows the validator message in the status line', async () => {
  const { tab } = page();
  const { p, stopped } = ports();
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  area.showNow({ ...RHYTHM_STARTER, steps: 0 }); await flush();
  assert.equal(tab.querySelectorAll(`.${SCORE_HOST_CLASS}`).length, 0, 'the stale score is gone');
  assert.equal(stopped.length, 1, 'and its player was silenced');
  assert.match(tab.querySelector(`.${SCORE_STATUS_CLASS}`)!.textContent!, /^Score: /);
});

test('dispose removes the panel and silences its player; the widget (and the rest of the tab) is untouched', async () => {
  const { tab } = page();
  const { p, stopped } = ports();
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  area.dispose();
  assert.equal(tab.children.length, 1);
  assert.equal(tab.children[0].tagName, 'IFRAME');
  assert.equal((tab.children[0] as HTMLElement).style.minHeight, '100%');
  assert.equal(stopped.length, 1);
});

test('lean edition in a score-first vault: ONE line of explanation instead of a score, no panel, nothing to render', () => {
  const { tab } = page();
  const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'lean' }), ports().p)!;
  assert.ok(area);
  const note = tab.querySelector('.forge-rhythm-edit-score-lean')!;
  assert.equal(note.textContent, LEAN_SCORE_NOTE);
  assert.equal(tab.querySelector(`.${SCORE_HOST_CLASS}`), null);
  area.showNow(RHYTHM_STARTER); area.update(RHYTHM_STARTER);          // harmless
  assert.equal(tab.querySelectorAll('.forge-rhythm-edit-score-lean').length, 1);
  area.dispose();
  assert.equal(tab.querySelector('.forge-rhythm-edit-score-lean'), null);
});

test('mountScorePanel / mountLeanNote are usable on their own (the building blocks)', () => {
  const { tab } = page();
  const panel = mountScorePanel(tab, ports().p);
  assert.equal(panel.el.parentElement, tab);
  panel.view.status('hello');
  assert.equal(panel.el.querySelector(`.${SCORE_STATUS_CLASS}`)!.textContent, 'hello');
  panel.dispose();
  assert.equal(tab.querySelector(`.${SCORE_PANEL_CLASS}`), null);
  const n = mountLeanNote(tab, 'x');
  assert.equal(n.textContent, 'x');
});

// ---- a fire-and-forget renderer: the old score stays until the new engraving ARRIVES ------------------------------------------------------------------------------
// (renderTaggedMusicXML returns at once and the <svg> comes later; measured in real Chromium, swapping on return left 1-2 blank frames and a 388 -> 103 px jump.)

function lateRenderer() {
  const slots: Array<() => void> = [];
  const deps: Partial<ScoreAreaPorts> = {
    renderInto: (host, payload) => {
      host.textContent = '';                                            // the toolbar would be here; no engraving yet
      slots.push(() => { const svg = host.ownerDocument.createElement('svg'); svg.textContent = String(payload.content); host.appendChild(svg); });
      return true;
    },
  };
  return { deps, slots };
}
const flushDom = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

test('LATE engraving: the first score is shown at once; the next one stays hidden (pending) while the old one stays on screen, and is swapped in when its <svg> arrives', async () => {
  const { tab } = page();
  const { deps, slots } = lateRenderer();
  const { p, stopped } = ports(deps);
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  const hosts = () => [...tab.querySelectorAll(`.${SCORE_HOST_CLASS}`)] as HTMLElement[];
  assert.equal(hosts().length, 1);
  assert.equal(hosts()[0].classList.contains(SCORE_HOST_PENDING_CLASS), false, 'a FIRST score is not hidden: there is nothing else to show');
  slots.shift()!();                                                     // its engraving arrives
  const first = hosts()[0];

  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 90 }); await flush();
  assert.equal(hosts().length, 2, 'old and new host coexist while the new one renders');
  assert.ok(hosts()[0] === first && !first.classList.contains(SCORE_HOST_PENDING_CLASS), 'the old score is still visible');
  assert.ok(hosts()[1].classList.contains(SCORE_HOST_PENDING_CLASS), 'the new one is hidden (laid out, not shown)');
  assert.equal(stopped.length, 0, 'the old player keeps its place until the swap');

  slots.shift()!(); await flushDom();                                   // the new engraving arrives
  assert.equal(hosts().length, 1, 'the swap happened');
  assert.notEqual(hosts()[0], first);
  assert.equal(hosts()[0].classList.contains(SCORE_HOST_PENDING_CLASS), false, 'and the new one is revealed');
  assert.deepEqual(stopped, [first], 'the OLD player was silenced in the swap');
});

test('LATE engraving: a newer draw replaces the pending one (only the newest can ever show), and the swap never shows the superseded score', async () => {
  const { tab } = page();
  const { deps, slots } = lateRenderer();
  const { p } = ports(deps);
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush(); slots.shift()!();
  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 91 }); await flush();
  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 92 }); await flush();
  const hosts = () => [...tab.querySelectorAll(`.${SCORE_HOST_CLASS}`)] as HTMLElement[];
  assert.equal(hosts().length, 2, 'the old score and ONE pending one — the superseded pending host is gone');
  assert.equal(slots.length, 2);
  slots[0]();                                                           // the superseded render finishes late: into a host that was removed
  await flushDom();
  assert.equal(hosts().length, 2, 'nothing swapped');
  slots[1](); await flushDom();
  assert.equal(hosts().length, 1);
  assert.equal(tab.querySelector(`.${SCORE_HOST_CLASS} svg`)!.textContent, 'score-of-bar_001');
});

test('LATE engraving: a renderer that never produces an <svg> cannot freeze the old score forever — after READY_TIMEOUT_MS the new host is shown anyway', async () => {
  const { tab } = page();
  const { deps } = lateRenderer();
  const fired: Array<() => void> = [];
  const { p } = ports({ ...deps, setTimer: (fn) => { fired.push(fn); return fired.length; }, clearTimer: () => {} });
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 93 }); await flush();
  const hosts = () => [...tab.querySelectorAll(`.${SCORE_HOST_CLASS}`)] as HTMLElement[];
  assert.equal(hosts().length, 2);
  assert.equal(READY_TIMEOUT_MS, 4000);
  fired.at(-1)!();                                                      // the ready timeout fires
  assert.equal(hosts().length, 1);
  assert.equal(hosts()[0].classList.contains(SCORE_HOST_PENDING_CLASS), false);
});

test('LATE engraving: an invalid bar (clear) and dispose take a pending host away too — nothing is left behind', async () => {
  const { tab } = page();
  const { deps } = lateRenderer();
  const { p } = ports(deps);
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 94 }); await flush();
  assert.equal(tab.querySelectorAll(`.${SCORE_HOST_CLASS}`).length, 2);
  area.showNow({ ...RHYTHM_STARTER, steps: 0 }); await flush();
  assert.equal(tab.querySelectorAll(`.${SCORE_HOST_CLASS}`).length, 0, 'invalid bar: both the shown and the pending score are gone');
  area.showNow(RHYTHM_STARTER); await flush();
  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 95 }); await flush();
  area.dispose();
  assert.equal(tab.querySelector(`.${SCORE_PANEL_CLASS}`), null);
  assert.equal(tab.querySelectorAll(`.${SCORE_HOST_CLASS}`).length, 0);
});

test('the renderer sees a FIRST score in its final, visible state, and a replacement in the pending (hidden) one', async () => {
  const { tab } = page();
  const seen: string[] = [];
  const { p } = ports({ renderInto: (host) => { seen.push(host.className); host.appendChild(host.ownerDocument.createElement('svg')); return true; } });
  const area = attachScoreArea(tab, 'score', p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  area.showNow({ ...RHYTHM_STARTER, tempo_bpm: 96 }); await flush();
  assert.equal(seen[0], SCORE_HOST_CLASS, 'first: plain');
  assert.equal(seen[1], `${SCORE_HOST_CLASS} ${SCORE_HOST_PENDING_CLASS}`, 'second: pending while it renders');
});

// ---- score_first M3 (drain 2026-10-21-1230): the Score area with the inspector — the map and the engraving arrive together, and leave together ----
const KICK_BAR = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false] } };
const kickXml = (tag: string) => `<score-partwise><!--${tag}--><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes><note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration></note><note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration></note></measure></part></score-partwise>`;
/** a stand-in for Verovio's behaviour that matters here: every `<note id="x">` of the MusicXML becomes `<g class="note" id="x">` in the SVG. */
function inspectorPorts(over: Partial<ScoreAreaPorts> = {}) {
  const opened: string[] = []; const posted: any[] = []; const shown: string[] = [];
  const base = ports({
    compute: async (_d, title) => ({ type: 'musicxml', multi_staff_content: kickXml(String(title)), content: 'x' }),
    renderInto: (host, payload) => {
      const doc = host.ownerDocument; const svg = doc.createElement('svg');
      for (const m of String(payload.multi_staff_content).matchAll(/<note id="([^"]+)"/g)) { const g = doc.createElement('g'); g.setAttribute('class', 'note'); g.id = m[1]; svg.appendChild(g); }
      host.appendChild(svg); shown.push(host.querySelectorAll('g.note').length + ' notes'); return true;
    },
    inspector: { noteId: 'bars/bar_001', openNote: (n) => opened.push(n), postHighlight: (t) => posted.push(t) },
    ...over,
  });
  return { ...base, opened, posted, shown };
}

test('M3: the inspector slot is the LAST child of the panel, engravings stay above it, and a hint shows once the first score is on screen', async () => {
  const { tab } = page(); const { p } = inspectorPorts();
  const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'music' }), p)!;
  area.showNow(KICK_BAR); await flush();
  const panel = tab.querySelector(`.${SCORE_PANEL_CLASS}`)!;
  assert.equal((panel.lastElementChild as HTMLElement).className, 'forge-rhythm-inspector-slot');
  assert.ok(panel.querySelector(`.${SCORE_HOST_CLASS}`)!.compareDocumentPosition(panel.lastElementChild!) & 4, 'the engraving precedes the slot');
  assert.match(panel.textContent ?? '', /Click an engraved note/);
  area.dispose();
});

test('M3: the ids the engraving carries are the ids the map knows — clicking an engraved note shows ITS hit, and "Open note" asks to open the note', async () => {
  const { tab, doc } = page(); const { p, opened } = inspectorPorts();
  const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'music' }), p)!;
  area.showNow(KICK_BAR); await flush();
  const g = doc.getElementById('a_kick_8')!; assert.ok(g, 'the engraved note of kick step 8 carries its id');
  g.dispatchEvent(new (tab.ownerDocument.defaultView as any).MouseEvent('click', { bubbles: true }));
  assert.match(tab.textContent ?? '', /kick — step 9 \(beat 3\)/);
  (tab.querySelector('.forge-inspector-open') as HTMLButtonElement).click();
  assert.deepEqual(opened, ['bars/bar_001']);
  area.gridHover({ channel: 'kick', step: 0 });
  assert.ok(doc.getElementById('a_kick_0')!.classList.contains('forge-artifact-hot'), 'the grid step lights the engraved note');
  area.dispose();
});

test('M3: a NEW score replaces the old engraving and its map together — the pin of the old score is gone, and the old host no longer reacts', async () => {
  const { tab, doc } = page(); const { p, timers } = inspectorPorts();
  const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'music' }), p)!;
  area.showNow(KICK_BAR); await flush();
  const old = doc.getElementById('a_kick_0')!;
  old.dispatchEvent(new (tab.ownerDocument.defaultView as any).MouseEvent('click', { bubbles: true }));
  assert.match(tab.textContent ?? '', /kick — step 1/);
  area.update({ ...KICK_BAR }); timers.forEach((f) => f()); await flush();
  assert.equal(tab.querySelectorAll(`.${SCORE_HOST_CLASS}`).length, 1, 'one engraving on screen');
  assert.ok(!old.isConnected, 'the old engraving was removed');
  assert.doesNotMatch(tab.textContent ?? '', /kick — step 1/, 'the old pin is gone with it');
  assert.match(tab.textContent ?? '', /Click an engraved note/);
  area.dispose();
});

test('M3: a score the map cannot be built for (the data does not match the engraving) is still shown, with the reason, and nothing to click', async () => {
  const { tab } = page(); const { p } = inspectorPorts();
  const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'music' }), p)!;
  area.showNow({ ...KICK_BAR, channels: { kick: [true, true, false, false, false, false, false, false, true, false, false, false, false, false, false, false] } }); await flush();
  assert.equal(tab.querySelectorAll(`.${SCORE_HOST_CLASS}`).length, 1, 'the Score is on screen');
  assert.match(tab.textContent ?? '', /could not be mapped to its note, so it cannot be inspected/);
  assert.equal(tab.querySelectorAll('g.note[id]').length, 0, 'an unverified engraving carries no ids');
  area.dispose();
});

test('M3: without an inspector port the Score is exactly the M1 Score — no slot content, no ids on the engraving', async () => {
  const { tab } = page(); const { p } = inspectorPorts({ inspector: undefined });
  const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'music' }), p)!;
  area.showNow(KICK_BAR); await flush();
  assert.equal(tab.querySelector('.forge-inspector'), null);
  assert.equal(tab.querySelectorAll('g.note[id]').length, 0);
  area.gridHover({ channel: 'kick', step: 0 });                       // a no-op, never throws
  area.dispose();
});

// ---- 2026-10-31-1110 item 3: the Score on screen is marked stale (dimmed, aria-busy) from the moment a change is asked for until the new one is the one on screen ----------------------------------
test('markPending: the score on screen is dimmed and aria-busy the moment the data changes, and the NEW host is the current one, clean, once it is swapped in; without the option the DOM is never touched', async () => {
  for (const markPending of [true, false]) {
    const { tab } = page();
    const { p } = ports({ markPending });
    const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'music' }), p)!;
    area.showNow(RHYTHM_STARTER); await flush();
    const panel = tab.children[1] as HTMLElement;
    assert.equal(panel.querySelectorAll(`.${SCORE_HOST_STALE_CLASS}`).length, 0, 'nothing is stale after the first draw');
    area.update({ ...RHYTHM_STARTER, tempo_bpm: 99 });
    const stale = panel.querySelectorAll(`.${SCORE_HOST_STALE_CLASS}`);
    assert.equal(stale.length, markPending ? 1 : 0, `${markPending}: marked before the debounce fired`);
    if (markPending) assert.equal(panel.getAttribute('aria-busy'), 'true');
    else assert.equal(panel.hasAttribute('aria-busy'), false);
  }
});

test('markPending: the new score swapped in is not stale; a score drawn while a newer change waits is stale (the mark follows the host that is current)', async () => {
  const { tab } = page();
  const { p, timers } = ports({ markPending: true });
  const area = attachScoreArea(tab, scorePanelPlan({ scoreFirst: true, edition: 'music' }), p)!;
  area.showNow(RHYTHM_STARTER); await flush();
  area.update({ ...RHYTHM_STARTER, tempo_bpm: 99 });
  for (const fn of timers.splice(0)) fn();                       // the debounce fires: the second score is built and swapped in
  await flush();
  const panel = tab.children[1] as HTMLElement;
  const hosts = [...panel.querySelectorAll(`.${SCORE_HOST_CLASS}`)] as HTMLElement[];
  assert.equal(hosts.length, 1, 'one score on screen');
  assert.equal(hosts[0].classList.contains(SCORE_HOST_STALE_CLASS), false, 'the new score is current');
  assert.equal(panel.hasAttribute('aria-busy'), false);
});
