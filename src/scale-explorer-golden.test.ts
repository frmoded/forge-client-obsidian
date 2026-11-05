// 2026-11-04-1171 (Scale Explorer 2 of 4): scale mode is unchanged by chord mode. The DOM of three scale blocks (the staff's MusicXML included) is pinned BYTE FOR BYTE against a golden recorded from the 1170 commit (563fcef) BEFORE chord mode was written:
// test/fixtures/scale-explorer-golden-1170.json. Pins the OUTPUT of a shipped design (scale mode as 1170 drew it); if scale mode is changed on purpose, regenerate with UPDATE_GOLDEN=1 and say so in the FEEDBACK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

import { parseScaleExplorerSource } from './scale-explorer-core.ts';
import { mountScaleBlock } from './scale-explorer-dom.ts';

const GOLDEN = path.resolve(import.meta.dirname, '../test/fixtures/scale-explorer-golden-1170.json');
const SOURCES: Record<string, string> = {
  'C major, everything on': '',
  'Bb lydian, octave 3, piano and numbers only': 'tonic: Bb\nscale: lydian\noctave: 3\nshow: piano, numbers',
  'A harmonic minor, a fixed picture': 'tonic: A\nscale: harmonic minor\ncontrols: no',
};

async function render(): Promise<Record<string, { html: string; staffXml: string[] }>> {
  const out: Record<string, { html: string; staffXml: string[] }> = {};
  for (const [name, source] of Object.entries(SOURCES)) {
    const win: any = new Window({ url: 'http://localhost/' });
    const el = win.document.createElement('div');
    win.document.body.appendChild(el);
    const staffXml: string[] = [];
    assert.ok(parseScaleExplorerSource(source).ok);
    mountScaleBlock(el, source, { sound: { play() {}, stop() {} }, renderStaff: async (_host, xml) => { staffXml.push(xml); } });
    await new Promise((r) => setTimeout(r, 5));
    out[name] = { html: el.innerHTML, staffXml };
  }
  return out;
}

test('scale mode is byte for byte what 1170 drew: three scales, their DOM and their staff MusicXML', async () => {
  const now = await render();
  if (process.env.UPDATE_GOLDEN === '1') { fs.writeFileSync(GOLDEN, JSON.stringify(now, null, 2) + '\n'); return; }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(Object.keys(now), Object.keys(golden));
  for (const name of Object.keys(golden)) {
    assert.ok(now[name].html === golden[name].html, `${name}: the DOM differs from the 1170 golden`);
    assert.deepEqual(now[name].staffXml, golden[name].staffXml, `${name}: the staff MusicXML differs`);
    assert.ok(golden[name].html.length > 2000, `${name}: non-vacuity: the golden holds a real picture`);
  }
});

test('CONTROL: the comparison can fail (a different scale gives a different DOM)', async () => {
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div');
  mountScaleBlock(el, 'tonic: D', { sound: { play() {}, stop() {} } });
  assert.ok(el.innerHTML !== golden['C major, everything on'].html);
});
