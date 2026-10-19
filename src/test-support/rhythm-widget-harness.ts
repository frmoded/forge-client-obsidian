// Shared harness for tests that drive the Rhythm Box widget page in happy-dom (Phase 8 and later). The Phase 5-7 file
// (rhythm-box-widget.test.ts) keeps its own copy of the same small helper, unmodified; new tests use this one.
//
// The widget is read from the SOURCE vault checkout (../music-theory) when present, else the bundled copy — and when BOTH exist and differ the import FAILS, naming
// both paths (test-support/vault-source.ts; drain 2026-10-20-1100): which of two checkouts a test read used to decide its result without saying so. With neither,
// `skip` is the reason string for node:test's `{ skip }` option.
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import { resolveVaultFile } from './vault-source.ts';

const WIDGET_REL = 'music_instruments/resources/html/rhythm_box.html';
// RHYTHM_BOX_WIDGET_FILE: an explicit widget file (a clean worktree of the source vault) — takes precedence and is not compared with anything, so a change to the
// widget can be tested before the sibling checkout has pulled it. Unset, sibling and bundle must agree (or only one exist).
const OVERRIDE = process.env.RHYTHM_BOX_WIDGET_FILE ? path.resolve(process.env.RHYTHM_BOX_WIDGET_FILE) : undefined;
export const WIDGET_FILE = resolveVaultFile('music-theory', WIDGET_REL, { override: OVERRIDE })?.path;
export const skip: string | false = WIDGET_FILE ? false : (OVERRIDE
  ? `RHYTHM_BOX_WIDGET_FILE names a file that does not exist: ${OVERRIDE}`
  : 'rhythm_box.html found in neither ../music-theory nor the bundled music-theory vault');
export const widgetHtml = WIDGET_FILE ? fs.readFileSync(WIDGET_FILE, 'utf-8') : '';
export const widgetScript = (/<script>([\s\S]*?)<\/script>/.exec(widgetHtml) ?? [])[1] ?? '';

export interface Harness {
  win: any;
  doc: any;
  posted: any[];
  host: object | null;
  send: (m: unknown, source?: unknown) => Promise<void>;
  el: (id: string) => any;
  cell: (ch: string, s: number) => any;
}

/** Load the page. `asHost` gives it a fake `window.parent` whose postMessage is captured (a JSON round trip: objects built inside the
 *  happy-dom vm context have that context's Object.prototype, which node's strict deepEqual does not equate with ours). */
export async function loadWidget(asHost: boolean): Promise<Harness> {
  const posted: any[] = [];
  const host = asHost ? { postMessage: (m: unknown) => { posted.push(JSON.parse(JSON.stringify(m))); } } : null;
  const win: any = new Window({ url: 'http://localhost/' });
  if (host) Object.defineProperty(win, 'parent', { value: host, configurable: true });
  const m = /<script>([\s\S]*?)<\/script>/.exec(widgetHtml)!;
  win.document.write(widgetHtml.replace(m[0], ''));
  win.eval(m[1]);
  await new Promise((r) => setTimeout(r, 5));
  const send = async (msg: unknown, source: unknown = host) => {
    win.dispatchEvent(new win.MessageEvent('message', { data: msg, source }));
    await new Promise((r) => setTimeout(r, 5));
  };
  return {
    win, doc: win.document, posted, host, send,
    el: (id) => win.document.getElementById(id),
    cell: (ch, s) => win.document.querySelector(`.step[data-channel="${ch}"][data-step="${s}"]`),
  };
}

/** A minimal Web Audio stand-in so Play can run: records started nodes; `win.__ctx` is the context (set `currentTime` to advance). */
export function fakeAudio(win: any) {
  const log: Array<{ kind: string; t?: number }> = [];
  const param = () => ({ value: 0, setValueAtTime(v: number) { this.value = v; }, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = (kind: string, extra: any = {}) => ({ connect() {}, disconnect() {}, start(t?: number) { log.push({ kind, t }); }, stop() {}, ...extra });
  class FakeCtx {
    currentTime = 0; sampleRate = 8000; state = 'running'; destination = {};
    constructor() { win.__ctx = this; }
    resume() {}
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
    createOscillator() { return node('osc', { frequency: param(), type: 'sine' }); }
    createBiquadFilter() { return { type: 'lowpass', frequency: param(), Q: param(), gain: param(), connect() {}, disconnect() {} }; }
    createBufferSource() { return node('noise', { buffer: null }); }
    createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
  }
  win.AudioContext = FakeCtx;
  return log;
}

export const ROCK = {
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: {
    kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    hihat: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  },
};
