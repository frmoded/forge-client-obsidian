// 2026-11-19-0940 - the CAPTION INSIDE THE FIGURE in real headless Chrome. (1) every captioned gadget of <vault>/captions.json in the SHIPPED mount (a blob: URL in <iframe sandbox="allow-scripts">), at 800 and 360 px: the caption block is the LAST thing in the
// body, left aligned at the body's left edge, 15 px / 600 / rgb(43,43,43) and 12 px / rgb(85,85,85) in the loudness font stack, 12 px below the content above it; the page's own content height (fresh state) at both widths; no horizontal scroll; no vertical
// scroll at that height. (2) every captioned .svg inline: every caption row inside the picture's viewBox (not cropped), the title and rows left aligned at the viewBox's left edge; the picture's ink (everything but the caption) starts at the same left offset in
// every score figure of scales/ and intervals/ images (within 0.5 unit). (3) a note-like page (Obsidian's figure layout: the images at their natural size in a 700 px column) with the C major and G major figures side by side, as a screenshot.
//   node scripts/dev/measure-captions.mjs [--vault ~/projects/music-theory] [--out <dir>]        exit 0 = every verdict true; prints the heights (the numbers the notes' embeds carry)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';
import { svgCaptionLayout } from './caption-core.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/0940')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const captions = JSON.parse(fs.readFileSync(path.join(VAULT, 'captions.json'), 'utf8'));
const verdict = {}, numbers = { heights: {}, svg: {} };
const INSTRUMENT = `<script>(function () {
  window.addEventListener('error', function (e) { parent.postMessage({ err: String(e.message) }, '*'); });
  window.addEventListener('message', function (e) { if (e.data && e.data.q) { var r; try { r = (0, eval)(e.data.q); } catch (x) { r = 'ERR ' + x; } parent.postMessage({ a: e.data.id, r: r }, '*'); } });
})();</script>
`;
async function mount(file, width) {
  const served = fs.readFileSync(path.join(VAULT, file), 'utf8').replace('<script>', INSTRUMENT + '<script>');
  const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<iframe id="f" sandbox="allow-scripts" style="width:${width}px;height:900px;border:0;display:block"></iframe>
<script>
  window.__err = []; window.__ans = {}; var n = 0;
  window.addEventListener('message', function (e) { var d = e.data || {}; if (d.err) window.__err.push(d.err); if (d.a) window.__ans[d.a] = d.r; });
  window.probe = function (q) { var id = ++n; document.getElementById('f').contentWindow.postMessage({ q: q, id: id }, '*'); return new Promise(function (ok) { var t = setInterval(function () { if (id in window.__ans) { clearInterval(t); ok(window.__ans[id]); } }, 20); }); };
  document.getElementById('f').src = URL.createObjectURL(new Blob([${JSON.stringify(served).replace(/</g, '\\u003c')}], { type: 'text/html' }));
</script>`;
  const page = await openPage({ dir: VAULT, width: width + 20, height: 960, pageHtml: host });
  await sleep(700);
  return { page, probe: (js) => page.ev(`window.probe(${JSON.stringify(js)})`), errs: () => page.ev('window.__err.slice()') };
}
const CAPTION_PROBE = `(function () {
  var c = document.querySelector('.fig-cap'); if (!c) return null;
  var t = c.querySelector('.t'), l = c.querySelector('.l'), ts = getComputedStyle(t), ls = getComputedStyle(l);
  var cb = c.getBoundingClientRect(), bb = document.body.getBoundingClientRect(), bs = getComputedStyle(document.body), padL = parseFloat(bs.paddingLeft) || 0, padB = parseFloat(bs.paddingBottom) || 0;
  var above = 0; var kids = Array.prototype.filter.call(document.body.children, function (e) { return e !== c && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE' && e.getBoundingClientRect().height > 0; });
  kids.forEach(function (e) { above = Math.max(above, e.getBoundingClientRect().bottom); });
  var after = Array.prototype.filter.call(document.body.children, function (e) { return e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE' && e !== c && e.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING && e.getBoundingClientRect().height > 0; }).length;
  return { title: t.textContent, line: l.textContent, tSize: ts.fontSize, tWeight: ts.fontWeight, tColor: ts.color, lSize: ls.fontSize, lColor: ls.color, family: ts.fontFamily, align: ts.textAlign,
    left: Math.round((cb.left - bb.left - padL) * 10) / 10, padB: padB, capBlock: Math.ceil(cb.height + 12), gap: Math.round((cb.top - above) * 10) / 10, visibleAfter: after, bottom: Math.round(cb.bottom - bb.top), docEnd: Math.ceil(bb.height) };
})()`;
for (const [file, cap] of Object.entries(captions).filter(([f]) => f.endsWith('.html'))) {
  numbers.heights[file] = {};
  for (const width of [800, 360]) {
    const g = await mount(file, width); const tag = `${path.basename(file, '.html')}@${width}`;
    const info = await g.probe(CAPTION_PROBE);
    verdict[`${tag}_hasCaption`] = !!info && info.title === cap.title && info.line === cap.line;
    if (info) {
      verdict[`${tag}_type`] = info.tSize === '15px' && info.tWeight === '600' && info.tColor === 'rgb(43, 43, 43)' && info.lSize === '12px' && info.lColor === 'rgb(85, 85, 85)' && /system-ui/.test(info.family) && info.align === 'left';
      verdict[`${tag}_leftAtBodyEdge`] = info.left === 0;                                 // (left of the body's CONTENT box: a padded body keeps its padding, the caption lines up with the gadget's own content)
      verdict[`${tag}_twelveBelowContent`] = info.gap >= 12 && info.gap <= 13;
      verdict[`${tag}_lastInBody`] = info.visibleAfter === 0 || info.visibleAfter === undefined;
      verdict[`${tag}_endsTheDocument`] = info.docEnd - info.bottom <= info.padB + 1;                      // 2026-11-19-0955: a gadget whose body has padding (the instruments, the keyboards) keeps it: the caption sits at the CONTENT edge, and ends where the content ends
    }
    // the BOTTOM of the body, not its height: the first row's 3 px top margin collapses through the body
    numbers.capBlock = numbers.capBlock ?? {}; (numbers.capBlock[file] = numbers.capBlock[file] ?? {})[width] = info?.capBlock ?? null;                          // the caption block's own height (its 12 px margin included): a gadget captioned for the first time keeps its old height PLUS this
    const h = await g.probe('Math.ceil(document.body.getBoundingClientRect().bottom)'); numbers.heights[file][width] = h;
    verdict[`${tag}_noHorizontalScroll`] = (await g.probe('document.documentElement.scrollWidth - document.documentElement.clientWidth')) <= 0;
    await g.page.ev(`document.getElementById('f').style.height = '${h}px'`); await sleep(100);
    verdict[`${tag}_noVerticalScrollAtItsOwnHeight`] = (await g.probe('document.documentElement.scrollHeight - document.documentElement.clientHeight')) <= 0;
    verdict[`${tag}_noErrors`] = (await g.errs()).length === 0;
    g.page.close();
  }
}
// ---- the figures (.svg) ----------------------------------------------------------------------------------------------------------------------------------------------
const svgs = Object.keys(captions).filter((f) => f.endsWith('.svg'));
const imageDirs = ['scales/resources/images', 'intervals/resources/images'];
const scoreFigures = [...new Set([...svgs, ...imageDirs.flatMap((d) => (fs.existsSync(path.join(VAULT, d)) ? fs.readdirSync(path.join(VAULT, d)).filter((f) => f.endsWith('.svg')).map((f) => `${d}/${f}`) : []))])];
{
  const routes = {}; const pageHtml = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div id="box"></div>`;
  const page = await openPage({ dir: VAULT, width: 900, height: 700, pageHtml, routes });
  for (const f of scoreFigures) {
    const svg = fs.readFileSync(path.join(VAULT, f), 'utf8'); const tag = path.basename(f, '.svg');
    const r = await page.ev(`(function () {
      var box = document.getElementById('box'); box.innerHTML = ${JSON.stringify(svg)}; var s = box.querySelector('svg'); var vb = s.viewBox.baseVal;
      var mark = Array.prototype.filter.call(s.childNodes, function (n) { return n.nodeType === 8 && /^ caption-box /.test(n.nodeValue); })[0];          // 2026-11-25-1043: the rows of the caption BLOCK only (a drawing with its own text groups, the wheel and the line of notes, counted them as rows)
      var cap = mark ? Array.prototype.slice.call(mark.nextElementSibling.querySelectorAll('text')) : [];
      var rows = cap.map(function (t) { var b = t.getBBox(); return { x: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height, text: t.textContent, size: t.getAttribute('font-size') }; });
      var ink = null; Array.prototype.forEach.call(s.children, function (e) { if (e.tagName === 'style' || e.tagName === 'text' || (e.tagName === 'g' && e.hasAttribute('font-family'))) return; var b; try { b = e.getBBox(); } catch (x) { return; } if (b.width === 0 && b.height === 0) return; var m = e.transform && e.transform.baseVal.consolidate(); var tx = m ? m.matrix.e : 0; var x0 = b.x + tx; ink = ink === null ? x0 : Math.min(ink, x0); });
      var pxw = s.getBoundingClientRect().width, pxh = s.getBoundingClientRect().height;
      return { vb: [vb.x, vb.y, vb.width, vb.height], rows: rows, inkLeft: ink, px: [pxw, pxh], scale: pxw / vb.width };
    })()`);
    numbers.svg[tag] = { vb: r.vb, px: r.px, inkLeftOffset: r.inkLeft === null ? null : Math.round((r.inkLeft - r.vb[0]) * 1000) / 1000 };
    if (svgs.includes(f)) {
      verdict[`${tag}_captionRows`] = r.rows.length >= 2;
      verdict[`${tag}_noRowCropped`] = r.rows.every((w) => w.x >= r.vb[0] - 0.01 && w.right <= r.vb[0] + r.vb[2] + 0.01 && w.top >= r.vb[1] - 0.01 && w.bottom <= r.vb[1] + r.vb[3] + 0.01);
      const L = svgCaptionLayout(svg, captions[f]), grow = L.own / L.k;                  // 2026-11-25-1043: a panelled figure's caption is 12 px in from the edge; a figure that names a column (data-caption-column) has a bigger caption at its natural size
      verdict[`${tag}_leftAlignedAtTheViewBox`] = r.rows.every((w) => Math.abs(w.x - L.x) < 0.2);
      verdict[`${tag}_typeSizes`] = Math.abs(parseFloat(r.rows[0].size) * r.scale - 15 * grow) < 0.05 && r.rows.slice(1).every((w) => Math.abs(parseFloat(w.size) * r.scale - 12 * grow) < 0.05);
      numbers.svg[tag].rowRightPx = Math.round(Math.max(...r.rows.map((w) => w.right)) * r.scale - r.vb[0] * r.scale);
    }
  }
  const imageDirFigures = scoreFigures.filter((f) => imageDirs.some((d) => f.startsWith(d + '/')));                         // the rule is for the score figures of scales/ and intervals/ (0940); the engraved scores of notes/ keep their own margin and are only reported
  const offsets = imageDirFigures.map((f) => numbers.svg[path.basename(f, '.svg')].inkLeftOffset).filter((v) => v !== null);
  numbers.inkLeftOffsets = Object.fromEntries(scoreFigures.map((f) => [path.basename(f, '.svg'), numbers.svg[path.basename(f, '.svg')].inkLeftOffset]));
  verdict.scoreFiguresStartAtTheSameLeftOffset = offsets.length >= 3 && Math.max(...offsets) - Math.min(...offsets) <= 0.5;
  page.close();
}
// ---- the C and G pair in a note-like column --------------------------------------------------------------------------------------------------------------------------
{
  const imgs = ['c_major_scale', 'g_major_scale', 'f_major_scale'].map((n) => `<p><img src="/scales/resources/images/${n}.svg"></p>`).join('');
  const pageHtml = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;font:16px/1.5 system-ui"><div style="width:620px;margin:0 auto;padding:16px"><p>The major scale</p>${imgs}</div>`;
  const routes = {}; for (const n of ['c_major_scale', 'g_major_scale', 'f_major_scale']) routes[`GET /scales/resources/images/${n}.svg`] = (q, r) => { r.writeHead(200, { 'content-type': 'image/svg+xml' }); r.end(fs.readFileSync(path.join(VAULT, `scales/resources/images/${n}.svg`))); };
  const page = await openPage({ dir: VAULT, width: 700, height: 760, pageHtml, routes });
  await sleep(500); await page.shot(path.join(OUT, 'major-figures.png'));
  const ink = await page.ev(`Array.prototype.map.call(document.images, function (i) { var r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), ok: i.complete && i.naturalWidth > 0 }; })`);
  numbers.noteLayout = ink; verdict.figuresLoadInANoteLayout = ink.every((i) => i.ok) && new Set(ink.map((i) => i.left)).size === 1;
  page.close();
}
const bad = Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k);
fs.writeFileSync(path.join(OUT, 'measure-captions.json'), JSON.stringify({ verdict, numbers }, null, 2));
console.log(JSON.stringify(numbers, null, 1));
console.log(`${Object.keys(verdict).length} verdicts, ${bad.length} not true${bad.length ? ': ' + bad.join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
