// score_first_experiment M0 + M1 (drain 2026-10-21-1100) — REAL engine checks for the live Score and for the playground vault's manifest. The real Pyodide engine (the very Python the
// plugin runs, test-support/real-rhythm-engine.ts) engraves the data the controller hands it; a fake canvas stands in for Verovio. Skipped (visibly) without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { WHEELS_PRESENT, engine, compute } from './test-support/real-rhythm-engine.ts';
import { attachScoreArea } from './live-score-dom.ts';
import { RHYTHM_STARTER } from './new-note-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const flush = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };
const noteCount = (xml: string) => [...xml.matchAll(/<note[ >]/g)].length;
const restCount = (xml: string) => [...xml.matchAll(/<rest[ />]/g)].length;

test('the starter bar engraves: tagged MusicXML with kick and snare, at 100 bpm', async () => {
  const py = await engine();
  const out = compute(py, RHYTHM_STARTER, 'bar_001');
  assert.equal(out.type, 'musicxml');
  const xml = (out.multi_staff_content ?? out.content) as string;
  assert.match(xml, /<score-partwise/);
  assert.ok(noteCount(xml) > 0);
  assert.match(xml, /<per-minute>100<\/per-minute>|tempo="100/);
});

test('END TO END (real engine): the Score area follows the data — an added hit, then a new tempo — and an invalid bar is a message, then it recovers', async () => {
  const py = await engine();
  const win: any = new Window({ url: 'http://localhost/' });
  const tab = win.document.createElement('div'); win.document.body.appendChild(tab);
  const drawn: string[] = [];
  const timers = new Map<number, () => void>(); let tid = 0;
  const area = attachScoreArea(tab, 'score', {
    renderInto: (host, payload) => { const xml = (payload.multi_staff_content ?? payload.content) as string; drawn.push(xml); host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    compute: async (d, t) => compute(py, d, t),
    title: 'bar_001',
    setTimer: (fn) => { timers.set(++tid, fn); return tid; },
    clearTimer: (h) => { timers.delete(h as number); },
  })!;
  const fire = async () => { const fns = [...timers.values()]; timers.clear(); fns.forEach((f) => f()); await flush(); };

  area.showNow(RHYTHM_STARTER); await flush();
  assert.equal(drawn.length, 1);
  const baseNotes = noteCount(drawn[0]);

  const extra: RhythmData = { ...RHYTHM_STARTER, channels: { ...RHYTHM_STARTER.channels, kick: RHYTHM_STARTER.channels.kick.map((v, i) => (i === 4 ? true : v)) } };
  area.update(extra); await fire();
  assert.equal(drawn.length, 2, 'one more engraving');
  assert.ok(noteCount(drawn[1]) > baseNotes || restCount(drawn[1]) < restCount(drawn[0]) || drawn[1] !== drawn[0], 'the added hit changed the engraving');
  assert.notEqual(drawn[1], drawn[0]);

  area.update({ ...extra, tempo_bpm: 66 }); await fire();
  assert.equal(drawn.length, 3);
  assert.match(drawn[2], /<per-minute>66<\/per-minute>|tempo="66/, 'the new tempo is in the score');

  area.update({ ...extra, steps: 0 }); await fire();
  assert.equal(drawn.length, 3, 'an invalid bar draws nothing');
  const status = tab.querySelector('.forge-rhythm-edit-score-status').textContent as string;
  assert.match(status, /^Score: /, status);

  area.update({ ...extra, tempo_bpm: 80 }); await fire();
  assert.equal(drawn.length, 4, 'fixed -> the score comes back');
  area.dispose();
});

test('the playground\'s manifest is a valid vault manifest for the REAL engine: the profile key is ignored, [imports] music-core resolves, nothing is reported as an error', async () => {
  const py = await engine();
  py.runPython(`
import os
from forge.core.snippet_registry import SnippetRegistry
from forge.core.manifest import read_manifest
def _w(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(s)
_w('/pg/music-playground/forge.toml', '''name = "music-playground"
version = "0.0.1"
description = "A score-first percussion playground."
domains = ["music"]
profile = "score_first"

[imports]
music-core = { local = "../music-core" }
''')
_w('/pg/music-core/forge.toml', '''name = "music-core"
version = "0.3.5"
description = "Composition-authoring surface for the Forge music domain."
domains = ["music"]
''')
_w('/pg/music-core/pitched_line.md', '---\\ntype: data\\ncontent_type: text\\n---\\n\\nx\\n')
_w('/pg/music-playground/bars/bar_001.md', '---\\ntype: data\\ncontent_type: json\\n---\\n\\n\`\`\`json\\n{}\\n\`\`\`\\n')
_pg_manifest = read_manifest('/pg/music-playground')
_pg_reg = SnippetRegistry()
_pg_reg.scan('/pg/music-playground')
`);
  assert.equal(py.runPython('_pg_manifest.name'), 'music-playground');
  assert.equal(py.runPython('_pg_manifest.domains[0]'), 'music');
  assert.deepEqual(py.runPython('list(_pg_reg.errors)').toJs(), [], 'no registry errors');
  const loaded = py.runPython('list(_pg_reg.loaded_vaults())').toJs() as string[];
  assert.ok(loaded.includes('music-core'), `music-core is indexed through the import: ${loaded.join(',')}`);
});

// Drain 2026-10-21-2200 (decision 5): the REAL playground tree, with NO extracted libraries in it (a score-first vault skips extraction), resolves music-core through [imports] alone.
import fs from 'node:fs';
import path from 'node:path';
const REAL_PG = path.resolve(import.meta.dirname, '../../music-playground');
const REAL_MC = path.resolve(import.meta.dirname, '../../music-core');
const realSkip = skip || (fs.existsSync(path.join(REAL_PG, 'forge.toml')) && fs.existsSync(path.join(REAL_MC, 'forge.toml')) ? false : `${REAL_PG} / ${REAL_MC} not checked out here`);
baseTest('the REAL music-playground tree (no extracted libraries) + the real music-core: music-core is indexed through [imports] alone, no errors, pitched_line resolves', { skip: realSkip, timeout: 300_000 }, async () => {
  const py = await engine();
  const put = (src: string, dest: string) => {
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;                                   // the engine's own walks skip dot-dirs; so does the plugin's mount (shouldMountImportFile)
      const s = path.join(src, e.name); const d = `${dest}/${e.name}`;
      if (e.isDirectory()) put(s, d);
      else if (e.name === 'forge.toml' || e.name.endsWith('.md')) { py.runPython(`import os\nos.makedirs(${JSON.stringify(path.posix.dirname(d))}, exist_ok=True)`); py.FS.writeFile(d, fs.readFileSync(s, 'utf8')); }
    }
  };
  put(REAL_PG, '/real/music-playground');
  put(REAL_MC, '/real/music-core');                                            // where "../music-core" resolves from the vault
  py.runPython(`
import os
from forge.core.snippet_registry import SnippetRegistry
_real_reg = SnippetRegistry()
_real_reg.scan('/real/music-playground')
`);
  assert.deepEqual(py.runPython('list(_real_reg.errors)').toJs(), []);
  const loaded = py.runPython('list(_real_reg.loaded_vaults())').toJs() as string[];
  assert.ok(loaded.includes('music-core'), loaded.join(','));
  assert.equal(py.runPython("_real_reg.get_bare('pitched_line')['snippet_id']"), 'music-core/pitched_line');
  assert.equal(py.runPython("os.path.exists('/real/music-playground/music-core')"), false, 'and no extracted copy exists in the vault');
});
