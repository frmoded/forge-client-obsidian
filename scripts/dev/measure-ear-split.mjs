// 2026-11-16-0900 - the ear gadgets split into separate widgets: interval_ear_one_after_the_other / _both_at_once / _triads and scale_ear_name_the_scale / _build_the_scale in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px and at 360 px wide. Real mouse clicks (DevTools
// Input.dispatchMouseEvent at the real box of each control, found by asking the page: the sandboxed iframe is not in the DevTools DOM tree), the oscillators the real Web Audio graph is asked for (20 per note: the first of each is the pitch),
// the CONTENT HEIGHT of each gadget at each width (the body's own height: no fixed height, no margin), no horizontal scroll, and light and dark shots (no gadget has a dark theme: dark = the same page under prefers-color-scheme: dark).
//   node scripts/dev/measure-ear-gadget.mjs [--vault ~/projects/music-theory] [--out <dir>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/shots')).replace(/^~/, os.homedir());
const HTML = path.join(VAULT, 'music_instruments/resources/html');
fs.mkdirSync(OUT, { recursive: true });
const INSTRUMENT = `<script>(function () {
  var A = window.AudioContext, n = 0;
  window.AudioContext = class extends A { createOscillator() { var o = super.createOscillator(), s = o.start.bind(o); o.start = function (t) { parent.postMessage({ hz: o.frequency.value, t: t }, '*'); return s(t); }; return o; } };
  window.addEventListener('error', function (e) { parent.postMessage({ err: String(e.message) }, '*'); });
  window.addEventListener('message', function (e) { if (e.data && e.data.q) { var r; try { r = (0, eval)(e.data.q); } catch (x) { r = 'ERR ' + x; } parent.postMessage({ a: e.data.id, r: r }, '*'); } });
})();</script>
`;
async function mount(file, width) {
  const served = fs.readFileSync(path.join(VAULT, file), 'utf8').replace('<script>', INSTRUMENT + '<script>');
  const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<iframe id="f" sandbox="allow-scripts" style="width:${width}px;height:700px;border:0;display:block"></iframe>
<script>
  window.__hz = []; window.__t = []; window.__err = []; window.__ans = {}; var n = 0;
  window.addEventListener('message', function (e) { var d = e.data || {}; if (d.hz !== undefined) { window.__hz.push(+d.hz.toFixed(2)); window.__t.push(+d.t); } if (d.err) window.__err.push(d.err); if (d.a) window.__ans[d.a] = d.r; });
  window.probe = function (q) { var id = ++n; document.getElementById('f').contentWindow.postMessage({ q: q, id: id }, '*'); return new Promise(function (ok) { var t = setInterval(function () { if (id in window.__ans) { clearInterval(t); ok(window.__ans[id]); } }, 10); }); };
  document.getElementById('f').src = URL.createObjectURL(new Blob([${JSON.stringify(served).replace(/</g, '\\u003c')}], { type: 'text/html' }));
</script>`;
  const page = await openPage({ dir: VAULT, width: width + 20, height: 760, pageHtml: host });
  await sleep(700);
  const probe = (js) => page.ev(`window.probe(${JSON.stringify(js)})`);
  const centre = async (sel) => { const r = await probe(`(function () { var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var b = e.getBoundingClientRect(); return b.width > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`); if (!r || typeof r !== 'object') throw new Error(`no visible ${sel}`); return r; };
  const press = async (sel) => { const c = await centre(sel); await page.click(c.x, c.y); await sleep(150); };
  const height = () => probe(`Math.ceil(document.body.getBoundingClientRect().height)`);
  const overflow = () => probe(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  const shot = async (name, h) => {
    for (const scheme of ['light', 'dark']) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(120);
      await page.shot(path.join(OUT, `${name}-${scheme}.png`), { x: 0, y: 0, width, height: h });
    }
  };
  const setHeight = (h) => page.ev(`document.getElementById('f').style.height = '${h}px'`);
  const noScroll = () => probe(`document.documentElement.scrollHeight - document.documentElement.clientHeight`);
  return { page, probe, press, height, overflow, shot, setHeight, noScroll, hz: () => page.ev('window.__hz.slice()'), times: () => page.ev('window.__t.slice()'), clear: () => page.ev('window.__hz.length = 0; window.__t.length = 0'), errs: () => page.ev('window.__err.slice()') };
}
const verdict = {}; const numbers = {};
const notes = (hz) => hz.filter((_, i) => i % 20 === 0);
const midiOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));
const keyBox = (g, m) => g.press(`.key[data-midi="${m}"]`);
const setHeight = (g, h) => g.page.ev(`document.getElementById('f').style.height = '${h}px'`);
const noScroll = (g) => g.probe('document.documentElement.scrollHeight - document.documentElement.clientHeight');
const status = (g) => g.probe(`JSON.stringify({ first: [].map.call(document.querySelectorAll('.key.first, .key.tonic'), function (k) { return +k.getAttribute('data-midi'); }), right: document.querySelectorAll('.key.right').length, wrong: document.querySelectorAll('.key.wrong').length, reveal: document.querySelectorAll('.key.reveal').length, hint: document.getElementById('hint').textContent, counter: document.getElementById('counter').textContent, board: document.getElementById('board').textContent, sr: document.getElementById('sr').textContent, pressed: ['easy', 'medium', 'hard'].filter(function (l) { return document.getElementById('level-' + l).getAttribute('aria-pressed') === 'true'; })[0], games: !!document.getElementById('games'), answers: [].map.call(document.querySelectorAll('#answers button'), function (b) { return b.getAttribute('data-scale'); }) })`).then(JSON.parse);
const FILES = [
  { file: 'music_instruments/resources/html/interval_ear_one_after_the_other.html', kind: 'interval', game: 1 },
  { file: 'music_instruments/resources/html/interval_ear_both_at_once.html', kind: 'interval', game: 2 },
  { file: 'music_instruments/resources/html/interval_ear_triads.html', kind: 'interval', game: 3 },
  { file: 'scales/resources/html/scale_ear_name_the_scale.html', kind: 'name', game: 1 },

  // 2026-11-17-2003: the scale BUILD widgets are exercises now: scripts/dev/measure-scale-exercises.mjs measures them
];
const ATT = (f, level) => ({ easy: 5, medium: 3, hard: 1 }[level] + (f.kind === 'interval' && f.game === 3 ? 1 : 0));
const word = (n) => `${n} ${n === 1 ? 'attempt' : 'attempts'} left`;
const only = arg('--only', '');
const all = {};
for (const f of FILES.filter((x) => !only || x.file.includes(only))) {
  const name = path.basename(f.file, '.html'); all[name] = {};
  for (const width of [800, 360]) {
    const g = await mount(f.file, width); const hs = new Set();
    const sample = async (label) => { const h = await g.height(); hs.add(h); await setHeight(g, h); const sc = await noScroll(g); await setHeight(g, 700); if (sc > 0) verdict[`${name}${width}_${label}_verticalScroll`] = false; if ((await g.overflow()) > 0) verdict[`${name}${width}_${label}_horizontalScroll`] = false; return h; };
    try {
      let s = await status(g);
      verdict[`${name}${width}_noGameSwitchAndLevelMedium`] = !s.games && s.pressed === 'medium' && s.hint === 'Press Play' && /^Medium: score 0 of 0 asked/.test(s.counter);
      const idleHeight = await sample('idle');
      // 2026-11-17-1200: EVERY scale of a per-note build file, one question each (the tonic differs per scale), in real Chrome: no vertical scroll, the same height as idle, asked and over; the question names the scale
      if (f.scales) for (const [i, id] of f.scales.entries()) {
        const tonicIdx = (i * 5) % 12, n = f.scales.length;
        await g.probe(`window.__earRandom = (function () { var k = 0; return function () { return k++ % 2 === 0 ? ${tonicIdx + 0.5} / 12 : ${i + 0.5} / ${n}; }; })(); 0`);
        await g.press('#level-medium'); await g.press('#next'); await sleep(250);
        const sa = await status(g); const pr = await g.probe(`document.getElementById('prompt').textContent`);
        const hAsked = await sample(`scale_${id}_asked`); verdict[`${name}${width}_scale_${id}_asked_noScrollSameHeight`] = hAsked === idleHeight && /^Build /.test(pr) && sa.first.length === 1 && sa.first[0] % 12 === tonicIdx;
        const tonic = sa.first[0]; for (let m = tonic + 1; m < tonic + 12; m++) { const st = await status(g); if (st.hint === 'Press Play') break; await keyBox(g, m); await sleep(60); }
        const hOver = await sample(`scale_${id}_over`); verdict[`${name}${width}_scale_${id}_over_noScrollSameHeight`] = hOver === idleHeight;
      }
      for (const level of ['easy', 'medium', 'hard']) {
        await g.press(`#level-${level}`); await g.clear(); await g.press('#next'); await sleep(350); s = await status(g); const hz = notes(await g.hz()).map(midiOf);
        verdict[`${name}${width}_${level}_attempts`] = s.hint === word(ATT(f, level)) && s.pressed === level;
        const h1 = await sample(`${level}_asked`); if (width === 800 && level === 'medium') await g.shot(`${name}-1-asked`, h1);
        // one wrong action (where the attempts allow it), then finish the question
        if (f.kind === 'interval') {
          const lit = hz[0], targets = hz.slice(1); const wrong = [...Array(25).keys()].map((i) => 48 + i).find((m) => m !== lit && !targets.includes(m) && !(level === 'easy' && [1, 3, 6, 8, 10].includes(m % 12)));   // 2026-11-17-1100: in easy a black key is inactive, so the wrong key is a white one
          // 2026-11-17-1100 (real mouse events): easy is white keys only and a black key is off; a repeated click replays in easy and medium, uses no attempt
          if (level === 'easy') { verdict[`${name}${width}_easy_everyNoteIsWhite`] = [lit, ...targets].every((m) => ![1, 3, 6, 8, 10].includes(m % 12)); const hintBefore = s.hint; await g.clear(); await keyBox(g, 49); await sleep(250); const sB = await status(g); verdict[`${name}${width}_easy_blackKeyIsOffNoSoundNoAttempt`] = (await g.hz()).length === 0 && sB.hint === hintBefore && sB.wrong === 0; }
          if (level !== 'hard') { await keyBox(g, wrong); await sleep(250); const hintOne = (await status(g)).hint; await g.clear(); await keyBox(g, wrong); await sleep(250); verdict[`${name}${width}_${level}_repeatedClickReplaysNoAttempt`] = (await g.hz()).length > 0 && (await status(g)).hint === hintOne; await g.clear(); await keyBox(g, lit); await sleep(250); verdict[`${name}${width}_${level}_litNoteReplays`] = (await g.hz()).length > 0 && (await status(g)).hint === hintOne; }
          if (level === 'hard') { await g.clear(); await keyBox(g, lit); await sleep(250); verdict[`${name}${width}_hard_litNoteSilent`] = (await g.hz()).length === 0; }
          if (ATT(f, level) > 1) { await keyBox(g, wrong); await sleep(120); s = await status(g); verdict[`${name}${width}_${level}_wrongKeyUsesOneAndRevealsNothing`] = s.hint === word(ATT(f, level) - 1) && s.wrong === 1 && s.right === 0; await sample(`${level}_oneWrong`); if (width === 800 && level === 'medium') await g.shot(`${name}-2-one-wrong`, await g.height()); }
          for (const t of targets) { await keyBox(g, t); await sleep(100); }
          s = await status(g); const over = /^(Correct|Out of attempts)/.test(s.sr); verdict[`${name}${width}_${level}_endsAndCounts`] = over && s.hint === 'Press Play'; await sample(`${level}_over`);
        } else if (f.kind === 'name') {
          const sc = s.answers; const wrongFirst = ATT(f, level) > 1; let used = 0;
          for (const id of sc) { const st = await status(g); if (/^(Correct|Out of attempts)/.test(st.sr)) break; await g.press(`#answers button[data-scale="${id}"]`); await sleep(100); used++; if (wrongFirst && used === 1) { const st2 = await status(g); if (!/^Correct/.test(st2.sr)) { verdict[`${name}${width}_${level}_wrongAnswerUsesOne`] = st2.hint === word(ATT(f, level) - 1); await sample(`${level}_oneWrong`); } } }
          s = await status(g); verdict[`${name}${width}_${level}_endsAndCounts`] = /^(Correct|Out of attempts)/.test(s.sr) && s.hint === 'Press Play'; await sample(`${level}_over`);
        } else {
          const tonic = s.first[0]; let wrongTaps = 0, tapped = 0;
          for (let m = tonic + 1; m < tonic + 12; m++) { const st = await status(g); if (st.hint === 'Press Play') break; await keyBox(g, m); await sleep(80); tapped++; if (tapped === 3) { const st3 = await status(g); if (st3.hint !== 'Press Play') await sample(`${level}_midBuild`); if (width === 800 && level === 'medium') await g.shot(`${name}-2-building`, await g.height()); } }
          s = await status(g); verdict[`${name}${width}_${level}_endsAndCounts`] = s.hint === 'Press Play' && /^(All found|Out of attempts)/.test(s.sr); await sample(`${level}_over`); void wrongTaps;
          if (width === 800 && level === 'hard') await g.shot(`${name}-3-over`, await g.height());
        }
      }
      // the level change ends an open question and keeps the scores; Reset clears them
      await g.press('#level-medium'); await g.press('#next'); await sleep(200); await g.press('#level-easy'); s = await status(g);
      verdict[`${name}${width}_levelChangeEndsTheQuestion`] = s.hint === 'Press Play' && s.pressed === 'easy' && /Medium \d+\/\d+/.test(s.board);
      await g.press('#reset'); s = await status(g); verdict[`${name}${width}_resetClearsEveryLevel`] = s.board === 'Easy 0/0 · Medium 0/0 · Hard 0/0';
      verdict[`${name}${width}_noErrors`] = (await g.errs()).length === 0;
    } finally { g.page.close(); }
    all[name][width] = [...hs]; verdict[`${name}${width}_oneHeightInEveryLevelAndState`] = hs.size === 1;
    for (const k of Object.keys(verdict)) if (verdict[k] === undefined) delete verdict[k];
  }
}
numbers.heights = all;
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
