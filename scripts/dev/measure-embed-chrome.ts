// 2026-11-03-1157: the "</>" ("Edit this block") button that appeared when the pointer was over an `html-embed` gadget (piano, guitar, monochord, the triad keyboard), in real headless Chrome under Obsidian's own app.css and the plugin's
// styles.css, with the DOM Obsidian's Live Preview builds for a code-block widget (read out of the installed app.js: `div.cm-preview-code-block.cm-embed-block.markdown-rendered.cm-lang-<language>` holding the processor's
// `div.block-language-<language>` and `div.embed-actions > div.embed-action.edit-block-button`) and, for Reading view, the processor output alone next to an ordinary code block with its Copy button. REAL pointer moves over each block.
// The verdicts, each of which can fail:
//   * BEFORE (the stylesheet of the commit this starts from): the html-embed block's button shows on hover (display flex, opacity 1, a real box, the top inline-end corner) - the defect, reproduced, so "hidden" below is not vacuous;
//   * AFTER: the html-embed block's button and its actions container are `display:none` on hover, have no box, and the point where the button was belongs to the gadget, not to a button;
//   * AFTER, the CONTROLS: the forge-rhythm block (already hidden) stays hidden; an ordinary widget (mermaid) and another plugin's language keep their button on hover, and show it only on hover (opacity 0 -> 1: hover is what the page models);
//   * Reading view: an html-embed block has no `.edit-block-button` at all (nothing to hide) and an ordinary reading-view code block keeps its Copy button.
// Run from the client repo root with a directory holding app.css (Obsidian's own: `node scripts/dev/asar-cat.mjs <obsidian.asar> app.css <dir>/app.css`), plugin-styles.css (this build's styles.css) and plugin-styles-before.css (the start
// commit's):   node scripts/dev/measure-embed-chrome.ts <dir>      (writes <dir>/embed-chrome-measurements.json and <dir>/shots/embed-*.png; exits 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const root = process.argv[2];
const SHOTS = path.join(root, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-code-2"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>';
const widget = (lang: string, label: string) => `<div class="cm-preview-code-block cm-embed-block markdown-rendered cm-lang-${lang}" id="b-${lang}" style="margin:14px 0"><div class="block-language-${lang}"><div style="height:110px;background:#e8edf7;display:flex;align-items:center;justify-content:center">${label}</div></div><div class="embed-actions"><div class="embed-action edit-block-button" aria-label="Edit this block">${ICON}</div></div></div>`;
const pageFor = (css: string) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="${css}"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="markdown-source-view mod-cm6 is-live-preview" style="width:640px;padding:12px"><div class="cm-editor"><div class="cm-scroller"><div class="cm-content" id="content" style="width:616px;min-width:616px">
${widget('html-embed', 'html-embed: the piano gadget')}${widget('forge-rhythm', 'forge-rhythm: the Beat Box embed')}${widget('mermaid', 'mermaid: an ordinary widget (keeps its button)')}${widget('dataview', 'dataview: another plugin\'s language (keeps its button)')}
</div></div></div></div>
<div class="markdown-reading-view" style="width:640px;padding:12px"><div class="markdown-preview-view markdown-rendered" id="reading">
<div class="block-language-html-embed" id="r-html-embed"><div style="height:80px;background:#e8edf7">html-embed in Reading view</div></div>
<div class="el-pre" id="r-code"><pre><code>an ordinary code block</code></pre><button class="copy-code-button">Copy</button></div>
</div></div></body></html>`;

async function study(label: 'before' | 'after', css: string) {
  const p = await openPage({ dir: root, width: 700, height: 900, pageHtml: pageFor(css), routes: {} });
  const out: any = { label, blocks: {} };
  try {
    await sleep(300);
    const move = (x: number, y: number) => p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    const read = (lang: string) => p.ev(`(() => { const b = document.getElementById('b-${lang}'); const btn = b.querySelector('.edit-block-button'); const box = b.querySelector('.embed-actions'); const cs = getComputedStyle(btn); const bs = getComputedStyle(box); const r = btn.getBoundingClientRect(); const br = b.getBoundingClientRect();
      const probe = { x: br.right - 14, y: br.top + 14 }; const hit = document.elementFromPoint(probe.x, probe.y);
      return { probe, innerW: innerWidth, innerH: innerHeight, blockRect: { l: br.left, r: br.right, t: br.top, b: br.bottom }, btnDisplay: cs.display, btnOpacity: cs.opacity, boxDisplay: bs.display, btn: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), fromRight: +(br.right - r.right).toFixed(1), fromTop: +(r.top - br.top).toFixed(1) }, hitIsButton: !!(hit && hit.closest('.edit-block-button')), hitIn: hit ? (hit.closest('[id^=b-]')?.id ?? hit.tagName) : null }; })()`);
    for (const lang of ['html-embed', 'forge-rhythm', 'mermaid', 'dataview']) {
      await move(5, 5); await sleep(120);
      const away = await read(lang);
      const c = await p.ev(`(() => { const r = document.getElementById('b-${lang}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await move(c.x, c.y); await sleep(250);
      const over = await read(lang);
      out.blocks[lang] = { away, over };
      if (lang === 'html-embed' || lang === 'mermaid') await p.shot(path.join(SHOTS, `embed-${label}-${lang}-hover.png`), { x: 0, y: await p.ev(`document.getElementById('b-${lang}').getBoundingClientRect().top - 24`), width: 700, height: 170 });
    }
    out.reading = await p.ev(`(() => { const r = document.getElementById('reading'); const copy = r.querySelector('.copy-code-button'); return { htmlEmbedButtons: r.querySelectorAll('#r-html-embed .edit-block-button, #r-html-embed .embed-actions').length, copyDisplay: getComputedStyle(copy).display, copyBox: copy.getBoundingClientRect().width > 0 }; })()`);
  } finally { p.close(); }
  return out;
}

const before = await study('before', 'plugin-styles-before.css');
const after = await study('after', 'plugin-styles.css');
const shown = (s: any) => s.btnDisplay !== 'none' && s.btnOpacity === '1' && s.btn.w > 0 && s.btn.h > 0;
const hiddenB = (s: any) => s.btnDisplay === 'none' && s.boxDisplay === 'none' && s.btn.w === 0 && s.btn.h === 0 && s.hitIsButton === false;
const b = before.blocks, a = after.blocks;
const verdicts: Record<string, boolean> = {
  [`BEFORE (non-vacuity): the html-embed block's button shows on hover (display ${b['html-embed'].over.btnDisplay}, opacity ${b['html-embed'].over.btnOpacity}, ${b['html-embed'].over.btn.w} x ${b['html-embed'].over.btn.h} px, ${b['html-embed'].over.btn.fromTop} px from the top and ${b['html-embed'].over.btn.fromRight} px from the right of the block)`]: shown(b['html-embed'].over),
  'BEFORE: and the point where it sat belongs to the button (the defect is a real click target)': b['html-embed'].over.hitIsButton === true,
  [`AFTER: the html-embed block's button and its actions container are display:none on hover (button ${a['html-embed'].over.btnDisplay}, container ${a['html-embed'].over.boxDisplay}), have no box, and the point where the button was belongs to ${a['html-embed'].over.hitIn} (not a button)`]: hiddenB(a['html-embed'].over),
  'AFTER: the forge-rhythm block (hidden before) stays hidden': hiddenB(a['forge-rhythm'].over) && hiddenB(b['forge-rhythm'].over),
  [`CONTROL: an ordinary widget (mermaid) keeps its button on hover (${a.mermaid.over.btn.w} x ${a.mermaid.over.btn.h} px, ${a.mermaid.over.btn.fromTop} px from the top, ${a.mermaid.over.btn.fromRight} px from the right) and it is the click target there`]: shown(a.mermaid.over) && a.mermaid.over.hitIsButton === true,
  "CONTROL: another plugin's language (dataview) keeps its button on hover": shown(a.dataview.over) && a.dataview.over.hitIsButton === true,
  'CONTROL: hover is what shows it (the control button has opacity 0 with the pointer away): the page models Obsidian\'s hover rule': a.mermaid.away.btnOpacity === '0' && a.dataview.away.btnOpacity === '0',
  'CONTROL: the comparator can fail (it calls the BEFORE html-embed block "not hidden")': hiddenB(b['html-embed'].over) === false,
  'Reading view: an html-embed block has no edit button or actions container at all (nothing to hide), and an ordinary reading-view code block keeps its Copy button': after.reading.htmlEmbedButtons === 0 && after.reading.copyDisplay !== 'none' && after.reading.copyBox === true,
};
fs.writeFileSync(path.join(root, 'embed-chrome-measurements.json'), JSON.stringify({ before, after, verdicts }, null, 2));
for (const [k, v] of Object.entries(verdicts)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
process.exit(Object.values(verdicts).every(Boolean) ? 0 : 1);
