// 2026-11-19-0940 - the CAPTION INSIDE THE FIGURE, in the style of the loudness graphs (notes/resources/images/loudness_soft.svg): a TITLE (15 px, weight 600, #2B2B2B) and ONE explanatory LINE (12 px, #555555) under the figure, left aligned,
// font stack `system-ui, -apple-system, Segoe UI, sans-serif`. Pure functions (no file access): the seed from an italic caption line, the identical block for a gadget (an .html document), the two <text> lines for an .svg figure, and the
// strip of both, so that applying twice is applying once. scripts/dev/apply-captions.mjs does the files; the two gadget generators call applyGadgetCaption so that their output carries the caption too.
//
// The loudness reference, in px: the line's baseline is 19 below the title's baseline; the title's baseline is 12 + ~14 below the plot; 19 below the last baseline to the edge. Here: a 12 px gap above the block, line boxes of 19 px and 17 px.

export const CAPTION_FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';
export const TITLE_PX = 15, LINE_PX = 12, TITLE_FILL = '#2B2B2B', LINE_FILL = '#555555', GAP_PX = 12;
/** A conservative width of one character of the 12 px line, as a fraction of the font size (the measure in real Chrome checks that no wrapped line runs out of the figure). */
export const CHAR_EM = 0.56;

export const GADGET_BEGIN = '<!-- caption BEGIN -->';
export const GADGET_END = '<!-- caption END -->';
export const SVG_BEGIN = '<!-- caption BEGIN -->';
export const SVG_END = '<!-- caption END -->';

export const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The seed of captions.json from ONE italic caption line (the text between the asterisks): title = the text before the first colon, line = the rest with the first letter capitalised and the final full stop dropped; no colon: title = the first
 *  five words, line = the whole sentence (final full stop dropped). */
export function seedFromItalic(text) {
  const t = String(text).trim().replace(/^[*_]+|[*_]+$/g, '').trim();
  const strip = (s) => s.replace(/\.$/, '').trim();
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const i = t.indexOf(':');
  if (i > 0) return { title: t.slice(0, i).trim(), line: cap(strip(t.slice(i + 1).trim())) };
  return { title: t.split(/\s+/).slice(0, 5).join(' '), line: cap(strip(t)) };
}

/** The italic caption line a note would have carried for a caption (used to find and remove the line the seed was made from): the exact line, with the asterisks. */
export const italicLine = (text) => `*${String(text).trim().replace(/^\*|\*$/g, '')}*`;

// ---------------------------------------------------------------------------------------------------- a gadget (.html)
const CSS = [
  '  .fig-cap { margin: ' + GAP_PX + 'px 0 0; padding: 0 0 12px; max-width: 460px; text-align: left; font-family: ' + CAPTION_FONT + '; }',
  '  .fig-cap .t { font-size: ' + TITLE_PX + 'px; line-height: 19px; font-weight: 600; color: ' + TITLE_FILL + '; }',
  '  .fig-cap .l { font-size: ' + LINE_PX + 'px; line-height: 17px; margin-top: 2px; color: ' + LINE_FILL + '; }',
].join('\n');

/** The identical block (markup + CSS) for a gadget; only the two texts differ. */
export function gadgetBlock({ title, line }) {
  return `${GADGET_BEGIN}\n<style>\n${CSS}\n</style>\n<div class="fig-cap"><div class="t">${escapeText(title)}</div><div class="l">${escapeText(line)}</div></div>\n${GADGET_END}\n`;
}
/** The block with the two texts replaced by a placeholder: what must be byte-identical in every captioned gadget. */
export const gadgetBlockShape = (html) => { const m = captionRange(html); return m ? html.slice(m.start, m.end).replace(/<div class="t">.*?<\/div><div class="l">.*?<\/div>/s, '<div class="t">@T@</div><div class="l">@L@</div>') : null; };

function captionRange(html) {
  const a = html.indexOf(GADGET_BEGIN); if (a < 0) return null;
  const e = html.indexOf(GADGET_END, a); if (e < 0) throw new Error('a caption BEGIN marker without its END marker');
  let end = e + GADGET_END.length; if (html[end] === '\n') end++;
  return { start: a, end };
}
export function stripGadgetCaption(html) { const r = captionRange(html); return r ? html.slice(0, r.start) + html.slice(r.end) : html; }
export const gadgetCaptionOf = (html) => { const r = captionRange(html); if (!r) return null; const m = /<div class="t">(.*?)<\/div><div class="l">(.*?)<\/div>/s.exec(html.slice(r.start, r.end)); return m ? { title: unescapeText(m[1]), line: unescapeText(m[2]) } : null; };
export const unescapeText = (s) => String(s).replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

/** Put the caption block at the bottom of the document body: right before the first <script> that follows <body>, else before </body>. Idempotent (an existing block is replaced). No caption (null) = the document without one. */
export function applyGadgetCaption(html, cap) {
  const bare = stripGadgetCaption(html);
  if (!cap) return bare;
  if (!cap.title || !cap.line) throw new Error('a caption needs a title and a line');
  const b = bare.search(/<body[\s>]/); if (b < 0) throw new Error('no <body>');
  const s = bare.indexOf('<script', b);
  const at = s >= 0 ? s : bare.lastIndexOf('</body>');
  if (at < 0) throw new Error('no <script> and no </body> to put the caption before');
  return bare.slice(0, at) + gadgetBlock(cap) + bare.slice(at);
}

// ---------------------------------------------------------------------------------------------------- a figure (.svg)
/** Greedy word wrap to at most `maxChars` characters per row (a word longer than the row stands alone). */
export function wrapWords(text, maxChars) {
  const rows = []; let cur = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w; else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w; else { rows.push(cur); cur = w; }
  }
  if (cur) rows.push(cur);
  return rows;
}

const num = (n) => (Math.round(n * 10000) / 10000).toString();
export function parseSvgBox(svg) {
  const head = /<svg\b[^>]*>/.exec(svg); if (!head) throw new Error('no <svg> element');
  const attr = (n) => { const m = new RegExp(`\\s${n}="([^"]*)"`).exec(head[0]); return m ? m[1] : null; };
  const vb = (attr('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) throw new Error('no usable viewBox');
  return { head: head[0], headStart: head.index, vb, width: attr('width'), height: attr('height') };
}
const unitOf = (v) => { const m = /^([\d.]+)\s*(mm|px|cm|in|pt)?$/.exec(v ?? ''); if (!m) return null; return { n: parseFloat(m[1]), u: m[2] ?? 'px' }; };
const PX_PER = { mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, px: 1 };
/** CSS px that ONE viewBox unit takes up in the picture (the type sizes below are converted with it, once, per file). */
export function pxPerUnit(svg) {
  const { vb, width } = parseSvgBox(svg); const w = unitOf(width); if (!w) throw new Error('no usable width');
  return (w.n * PX_PER[w.u]) / vb[2];
}

/** The picture's own caption-less viewBox and size, the caption text rows, and the new box: used by applySvgCaption and by the tests. */
export function svgCaptionLayout(svg, cap, { minWidthPx = 360 } = {}) {
  const bare = stripSvgCaption(svg);
  const { vb, width, height } = parseSvgBox(bare);
  const k = pxPerUnit(bare);
  const wUnits = Math.max(vb[2], minWidthPx / k);
  const maxChars = Math.max(12, Math.floor((wUnits * k) / (LINE_PX * CHAR_EM)));
  const rows = wrapWords(cap.line, maxChars);
  const titleY = vb[1] + vb[3] + (GAP_PX + 14) / k;           // 12 px gap + ~14 px: the title's baseline (as the loudness graphs)
  const lineY = [...rows.keys()].map((i) => titleY + (19 + 17 * i) / k);
  const bottom = lineY[lineY.length - 1] + 12 / k;
  return { bare, vb, width, height, k, wUnits, rows, titleY, lineY, newVb: [vb[0], vb[1], wUnits, bottom - vb[1]] };
}
// 2026-11-23-1021: a figure may carry its own PANEL, a solid <rect x="0" y="0" width height ...> behind the drawing (the wheel: a light panel so the ink reads in Obsidian's dark mode). The caption makes the canvas bigger, so the panel grows with it
// (no transparent strip under the caption) and strip gives it its own size back; a caption on a panel is inset 12 px from the panel's edge.
const PANEL = /<rect x="0" y="0" width="[\d.]+" height="[\d.]+"/;
const hasPanel = (svg, vb) => vb[0] === 0 && vb[1] === 0 && PANEL.test(svg);
const sizePanel = (svg, w, h) => svg.replace(PANEL, (m) => m.replace(/width="[\d.]+"/, `width="${num(w)}"`).replace(/height="[\d.]+"/, `height="${num(h)}"`));
const scaleLen = (len, factor) => { const u = unitOf(len); return u ? `${num(u.n * factor)}${u.u === 'px' ? '' : u.u}` : len; };

export function stripSvgCaption(svg) {
  const a = svg.indexOf(SVG_BEGIN); if (a < 0) return svg;
  const e = svg.indexOf(SVG_END, a); if (e < 0) throw new Error('a caption BEGIN marker without its END marker');
  const meta = /<!-- caption-box ([^>]*?) -->/.exec(svg.slice(a, e));
  let out = svg.slice(0, a) + svg.slice(e + SVG_END.length).replace(/^\n/, '');
  // restore the picture's own box (recorded in the block, so that strip-then-apply is exact)
  if (meta) {
    const [vb, w, h] = meta[1].split('|');
    const { head } = parseSvgBox(out);
    let nh = head.replace(/viewBox="[^"]*"/, `viewBox="${vb}"`);
    const box0 = vb.split(' ').map(Number); if (hasPanel(out, box0)) out = sizePanel(out, box0[2], box0[3]);          // 2026-11-23-1021: the panel gets its own size back
    if (w) nh = nh.replace(/\swidth="[^"]*"/, ` width="${w}"`); if (h) nh = nh.replace(/\sheight="[^"]*"/, ` height="${h}"`);
    out = out.replace(head, () => nh);
  }
  return out;
}
export function applySvgCaption(svg, cap, opts) {
  if (!cap) return stripSvgCaption(svg);
  if (!cap.title || !cap.line) throw new Error('a caption needs a title and a line');
  const L = svgCaptionLayout(svg, cap, opts);
  const { bare, vb, width, height, wUnits, newVb } = L;
  const fW = wUnits / vb[2], fH = newVb[3] / vb[3];
  const { head } = parseSvgBox(bare);
  const box = [vb.map(num).join(' '), width ?? '', height ?? ''].join('|');
  let nh = head.replace(/viewBox="[^"]*"/, `viewBox="${newVb.map(num).join(' ')}"`);
  if (width) nh = nh.replace(/\swidth="[^"]*"/, ` width="${scaleLen(width, fW)}"`);
  if (height) nh = nh.replace(/\sheight="[^"]*"/, ` height="${scaleLen(height, fH)}"`);
  const x = num(vb[0] + (hasPanel(bare, vb) ? 12 / L.k : 0));          // 2026-11-23-1021: 12 px in from a panel's edge
  const ts = (n) => num(n * 1), sz = (px) => num(px / L.k);
  const lines = [
    `${SVG_BEGIN}`,
    `<!-- caption-box ${box} -->`,
    `<g font-family="${CAPTION_FONT}">`,
    `<text x="${x}" y="${ts(L.titleY)}" font-size="${sz(TITLE_PX)}" fill="${TITLE_FILL}" text-anchor="start" font-weight="600">${escapeText(cap.title)}</text>`,
    ...L.rows.map((r, i) => `<text x="${x}" y="${ts(L.lineY[i])}" font-size="${sz(LINE_PX)}" fill="${LINE_FILL}" text-anchor="start">${escapeText(r)}</text>`),
    `</g>`,
    `${SVG_END}`,
  ].join('\n');
  let out = bare.replace(head, () => nh);
  if (hasPanel(bare, vb)) out = sizePanel(out, newVb[2], newVb[3]);          // 2026-11-23-1021: the panel follows the canvas
  const close = out.lastIndexOf('</svg>'); if (close < 0) throw new Error('no </svg>');
  return out.slice(0, close) + lines + '\n' + out.slice(close);
}
/** The caption an .svg carries (title and the rows joined back into one line), or null. */
export function svgCaptionOf(svg) {
  const a = svg.indexOf(SVG_BEGIN); if (a < 0) return null;
  const e = svg.indexOf(SVG_END, a); const body = svg.slice(a, e);
  const texts = [...body.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map((m) => unescapeText(m[1]));
  return texts.length ? { title: texts[0], line: texts.slice(1).join(' ') } : null;
}

export const isSvg = (file) => /\.svg$/i.test(file);
export const applyCaption = (file, text, cap, opts) => (isSvg(file) ? applySvgCaption(text, cap, opts) : applyGadgetCaption(text, cap));
export const captionOf = (file, text) => (isSvg(file) ? svgCaptionOf(text) : gadgetCaptionOf(text));
