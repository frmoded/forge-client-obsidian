// 2026-10-30-1040: the row of controls above an arrangement's Score in real Chrome - the REAL controls DOM (arrangement-controls-dom.ts) over an in-memory arrangement note and the REAL note round trip
// (applySettingsPatches), so a click is a real click and the json after it is the json the plugin would write. No engine: what is measured is what the buttons look like and what the note says.
import { mountArrangementControls } from '@client/arrangement-controls-dom.ts';
import { applySettingsPatches, newArrangementNote, readArrangementNote } from '@client/arrangement-core.ts';

(window as any).__mountControls = (parent: HTMLElement) => {
  let text = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_006' }, { kit: 'latin', phrase: 'phrase_010' }] });
  (window as any).__json = () => /```json\n([\s\S]*?)```/.exec(text)![1].trim();
  const show = () => { const r = readArrangementNote(text); controls.show(r.ok ? r.value : null); };
  const controls = mountArrangementControls(parent, {
    commit: (patches) => { const w = applySettingsPatches(text, 'arr_001', patches); if (w.ok && w.changed) text = w.text; show(); },
    trace: (line) => { ((window as any).__lines ??= []).push(line); },
    setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (h) => window.clearTimeout(h as number),
  });
  show();
};
