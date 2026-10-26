// Real-engine helper for tests: boots real Pyodide with the vendored music wheels and the bundled engine (as music21-bundle.test.ts
// does), execs the SAME Python text the host runs (RHYTHM_SCORE_PYTHON), and exposes `compute`. Extracted from
// rhythm-score-engine.test.ts (Phase 6) so Phase 8's playground-to-Score test boots the engine the same way, once per test process.
import fs from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';
import { extractProductionPythonBlock } from './extract-python-block.ts';

export const WHEELS_DIR = path.resolve(process.cwd(), 'assets/wheels');
export const WHEELS_PRESENT = fs.existsSync(WHEELS_DIR) && fs.readdirSync(WHEELS_DIR).some((f) => f.endsWith('.whl'));
export const SKIP_REASON = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';

function walk(dir: string, base = ''): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, rel)); else out.push({ rel, abs });
  }
  return out;
}

let _py: Promise<any> | null = null;
export async function engine(): Promise<any> {
  if (_py) return _py;
  _py = (async () => {
    const py = await loadPyodide();
    await py.loadPackage(['numpy', 'pyyaml']);
    for (const d of ['/bundle', '/bundle/wheels', '/bundle/site-packages', '/bundle/engine']) { try { py.FS.mkdir(d); } catch { /* exists */ } }
    for (const { rel, abs } of walk(WHEELS_DIR)) { try { py.FS.writeFile('/bundle/wheels/' + rel, fs.readFileSync(abs)); } catch { /* */ } }
    const made = new Set(['/bundle/engine']);
    for (const { rel, abs } of walk(path.resolve(process.cwd(), 'assets/engine'))) {
      const parts = rel.split(path.sep);
      let cur = '/bundle/engine';
      for (let i = 0; i < parts.length - 1; i++) { cur += '/' + parts[i]; if (!made.has(cur)) { try { py.FS.mkdir(cur); made.add(cur); } catch { /* */ } } }
      try { py.FS.writeFile('/bundle/engine/' + parts.join('/'), fs.readFileSync(abs)); } catch { /* */ }
    }
    try { py.FS.mkdir('/bundle/user-vault'); } catch { /* exists */ }
    py.runPython(extractProductionPythonBlock());
    return py;
  })();
  return _py;
}

export function compute(py: any, data: unknown, title: string): any {
  py.globals.set('_d', JSON.stringify(data));
  py.globals.set('_t', title);
  const proxy = py.runPython('_forge_rhythm_score_payload(_d, _t)');
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  return out;
}


/** score_first M5: the phrase helper the host runs (`_forge_rhythm_phrase_payload`), same shape as `compute`. */
export function computePhrase(py: any, data: unknown, params: unknown, title: string): any {
  py.globals.set('_d', JSON.stringify(data));
  py.globals.set('_p', JSON.stringify(params));
  py.globals.set('_t', title);
  const proxy = py.runPython('_forge_rhythm_phrase_payload(_d, _p, _t)');
  const out = proxy.toJs({ dict_converter: Object.fromEntries });
  proxy.destroy?.();
  return out;
}

/** 2026-10-25-1000: the glue the host runs to count a morph's single-hit changes (`_forge_morph_changes`), same shape as `computePhrase`. */
export function morphChanges(py: any, data: unknown, order = 'musical', seed = 0): number {
  py.globals.set('_d', JSON.stringify(data));
  py.globals.set('_o', order);
  py.globals.set('_s', seed);
  return Number(py.runPython('_forge_morph_changes(_d, _o, _s)'));
}
