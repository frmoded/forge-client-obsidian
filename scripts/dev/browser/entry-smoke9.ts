// 2026-10-31-1110 (CCQA smoke 9): the visual parts of the fixes in real Chrome - the REAL Score panel with `markPending` (a score that is dimmed from the moment its data changes until the new one replaces it), the REAL notebook
// (the hint that stays once bars are picked, Esc), and the line that names the kit of a pinned arrangement row. The renderer is a stand-in that draws a plain svg; what is measured is what the stylesheet does to it.
import { attachScoreArea, SCORE_HOST_STALE_CLASS } from '@client/live-score-dom.ts';
import { mountNotebook } from '@client/notebook-dom.ts';

(window as any).__mount = (root: HTMLElement) => {
  root.innerHTML = '<div id="score-parent"></div><div id="pin-parent"><div class="forge-arrangement-header">arr_001 — 2 tracks played together: phrase_003 on the rock kit, phrase_009 on the latin kit.</div><div class="forge-arrangement-pin" id="pin" style="display:none"></div></div><div id="nb-parent" tabindex="0"></div>';
  let n = 0;
  const gate: { release: (() => void) | null } = { release: null };
  const area = attachScoreArea(root.querySelector('#score-parent') as HTMLElement, 'score', {
    renderInto: (host) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', '560'); svg.setAttribute('height', '90'); svg.innerHTML = `<rect x="2" y="2" width="556" height="86" fill="#223" /><text x="12" y="50" fill="#fff">score ${++n}</text>`; host.appendChild(svg); return true; },
    stopPlayers: () => {},
    produce: async (_d, _t) => { await new Promise<void>((ok) => { gate.release = ok; }); return { kind: 'score', payload: { type: 'musicxml', content: 'x' } } as any; },
    title: 'arr_001', setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (h) => window.clearTimeout(h as number), markPending: true, debounceMs: 50,
  } as any)!;
  const nb = mountNotebook(root.querySelector('#nb-parent') as HTMLElement, {
    notebook: { run: async () => ({ ok: false } as any), runRequest: async () => ({ ok: false } as any), cells: async () => ({ cells: [], problems: [] }), rerun: async () => ({ ok: false } as any), deleteCell: async () => ({ ok: false } as any) } as any,
    trace: () => {}, openPhrase: () => {},
  } as any);
  nb.setScore({ count: 8, rows: ['kick', 'snare'] });
  (window as any).__area = area; (window as any).__nb = nb; (window as any).__gate = gate; (window as any).__STALE = SCORE_HOST_STALE_CLASS;
};
