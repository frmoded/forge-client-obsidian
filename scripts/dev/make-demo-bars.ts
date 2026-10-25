// 2026-10-24-1230 (M7c Phase B) — the two demo bars the driver morphs: a straight rock groove and an afro-cuban feel. They are made through the plugin's OWN paths, never hand-authored:
//   1. `createNewBar` (score-first-core.ts) with a filesystem-backed vault: the next free name (one past the highest `bar_NNN`) and the starter content "New bar" writes;
//   2. the Beat Box's save path (`applySave`, rhythm-edit-core.ts) to set the cells: it rewrites only the json block, exactly as an autosave does.
// Usage (from the client repo root):  node scripts/dev/make-demo-bars.ts <vault dir>          e.g. ~/projects/music-playground
// It refuses to run when a name it would use is not free in the WHOLE vault (so it never overwrites a note); it says which names it made and the number of single-hit changes (d) between them.
import fs from 'node:fs';
import path from 'node:path';
import { createNewBar } from '../../src/score-first-core.ts';
import { applySave, contentFingerprint, readRhythmNote, type RhythmData } from '../../src/rhythm-edit-core.ts';
import { morphEditCount } from '../../src/phrase-core.ts';

const vault = process.argv[2];
if (!vault || !fs.existsSync(path.join(vault, 'forge.toml'))) { console.error('usage: node scripts/dev/make-demo-bars.ts <vault dir with a forge.toml>'); process.exit(2); }

const row = (steps: number[], len = 16): boolean[] => Array.from({ length: len }, (_, i) => steps.includes(i));
const eighths = [0, 2, 4, 6, 8, 10, 12, 14];
const DEMO: Array<{ what: string; tempo: number; channels: Record<string, boolean[]> }> = [
  // a straight rock groove: kick on 1 and 3, snare on 2 and 4, closed hi-hat eighths
  { what: 'straight rock groove', tempo: 100, channels: { kick: row([0, 8]), snare: row([4, 12]), hihat: row(eighths) } },
  // an afro-cuban feel: son clave 3-2 on the claves, a tumbao kick, a low conga on 2 and 4, hi-hat on the quarters, no snare
  { what: 'afro-cuban feel (son clave 3-2)', tempo: 120, channels: { kick: row([0, 6, 10]), hihat: row([0, 4, 8, 12]), claves: row([0, 3, 6, 10, 12]), conga_low: row([4, 12]) } },
];

const barsDir = path.join(vault, 'bars');
const taken = (): string[] => {
  const all: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === '.git' || e.name === 'node_modules') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else all.push(e.name); } };
  walk(vault);
  return all;
};
const made: Array<{ path: string; data: RhythmData }> = [];
for (const demo of DEMO) {
  const ports = {
    folderExists: () => fs.existsSync(barsDir),
    createFolder: async () => { fs.mkdirSync(barsDir, { recursive: true }); },
    listBarBasenames: () => (fs.existsSync(barsDir) ? fs.readdirSync(barsDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')) : []),
    exists: (p: string) => fs.existsSync(path.join(vault, p)) || taken().includes(path.basename(p)),
    create: async (p: string, content: string) => { if (fs.existsSync(path.join(vault, p))) throw new Error('File already exists.'); fs.writeFileSync(path.join(vault, p), content); return p; },
    open: async () => {},
    notify: (m: string) => console.log('notice:', m),
  };
  const r = await createNewBar<string>(ports);
  if (r.ok === false) { console.error('createNewBar failed:', r.message); process.exit(1); }
  const file = path.join(vault, r.path);
  const text = fs.readFileSync(file, 'utf8');
  const note = readRhythmNote(text);
  if (note.ok === false) { console.error(note.message); process.exit(1); }
  const payload: RhythmData = { ...note.value.data, tempo_bpm: demo.tempo, channels: demo.channels };
  const saved = applySave(text, contentFingerprint(text), payload);
  if (saved.ok === false) { console.error(saved.message); process.exit(1); }
  fs.writeFileSync(file, saved.text);
  made.push({ path: r.path, data: payload });
  console.log(`made ${r.path}: ${demo.what}`);
}
console.log(`d between ${made[0].path} and ${made[1].path}: ${morphEditCount(made[0].data, made[1].data)} single-hit changes`);
