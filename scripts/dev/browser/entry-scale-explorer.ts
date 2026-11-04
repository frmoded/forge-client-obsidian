// 2026-11-04-1170 (Scale Explorer 1 of 4): the REAL `forge-scale` block (mountScaleBlock) and the REAL Verovio staff drawer of the plugin (scale-explorer-view.ts renderStaff) in real Chrome under Obsidian's own stylesheet. Only the SOUND is a test double:
// it records every play/stop and lets the measure fire the note hooks, so "a click on Play together starts the sound" is observable without making a noise.
import { mountScaleBlock, type ScaleSound } from '@client/scale-explorer-dom.ts';
import { renderStaff } from '@client/scale-explorer-view.ts';

const w = window as any;
w.__pageErrors = [];
window.addEventListener('error', (e) => { w.__pageErrors.push(`error: ${e.message}`); });
window.addEventListener('unhandledrejection', (e) => { w.__pageErrors.push(`rejection: ${String((e as PromiseRejectionEvent).reason)}`); });
const consoleError = console.error;
console.error = (...a: unknown[]) => { w.__pageErrors.push(`console.error: ${a.map(String).join(' ')}`); consoleError(...a); };

const sound = { plays: [] as { events: { midi: number; startMs: number; durMs: number }[]; hooks: any }[], stops: 0 };
const double: ScaleSound = { play: (events, hooks) => { sound.plays.push({ events: [...events], hooks }); }, stop: () => { sound.stops++; } };
w.__sound = sound;
w.__fire = (kind: 'on' | 'off' | 'end', midi?: number) => { const p = sound.plays[sound.plays.length - 1]; if (kind === 'end') p.hooks.onEnd(); else if (kind === 'on') p.hooks.onNoteOn(midi); else p.hooks.onNoteOff(midi); };

/** Mount a block's source into `el`; resolves when the staff (if any) has been drawn. */
w.__mount = async (el: HTMLElement, source: string) => {
  const handle = mountScaleBlock(el, source, { sound: double, renderStaff });
  const t0 = performance.now();
  while (el.querySelector('.forge-scale-staff') && !el.querySelector('.forge-scale-staff svg') && !el.querySelector('.forge-scale-staff-error') && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
  return !!handle;
};
