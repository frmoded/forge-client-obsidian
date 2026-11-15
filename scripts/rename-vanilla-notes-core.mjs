// 2026-11-15-1220 - the pure core of scripts/rename-vanilla-notes.mjs: rename the VANILLA notes (no front matter) of a vault so that no file name has an underscore, and rewrite every reference.
// No file system here: every function takes the vault as data ({ path, text }[] for the Markdown notes, string[] for every file) so the tests run on a small synthetic vault.
//
// The rules, in one place:
//   - a note is VANILLA when its text does not start with front matter ("---"); front-matter notes (Forge action and data notes) are left alone: their names are code identifiers.
//   - only the FILE name changes (every "_" in the stem becomes a space, case unchanged); folder names and asset files (.html .svg .png .mp3 ...) never do.
//   - a front-matter note that carries a hash (`description_hash`, `recipe_hash`, `python_hash`) must not have its text changed: a link rewritten inside its Description would change the Description's hash and the note would read "edited, not applied".
//     So a vanilla note that such a note links to is HELD (not renamed) and listed, until the driver decides.
//   - a BARE link ([[name]], data-href="name") that names two notes is resolved by: the candidate in the source note's own folder; else the one vanilla candidate; else it is AMBIGUOUS and listed (never guessed).
export const EXCLUDED_DIRS = ['.obsidian/', '.forge/', '.git/'];
const WIKI = /(!?)\[\[([^\]\n|#^]*)([#^][^\]\n|]*)?(\|[^\]\n]*)?\]\]/g;
const ANCHOR = /<a\b([^>]*)>([^<]*)<\/a>/g;

export const stemOf = (p) => p.replace(/^.*\//, '').replace(/\.md$/, '');
export const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const hasFrontMatter = (text) => text.startsWith('---');
export const hasHashes = (text) => { if (!hasFrontMatter(text)) return false; const end = text.indexOf('\n---', 3); return /^(description|recipe|python)_hash:/m.test(end < 0 ? text : text.slice(0, end)); };
export const spaced = (s) => s.replace(/_/g, ' ');
export const inScope = (p) => p.endsWith('.md') && !EXCLUDED_DIRS.some((d) => p.startsWith(d));
const isAsset = (t) => /\.\w{1,5}$/.test(t) && !/\.md$/i.test(t);

// ---- classification and collisions
export function classify(notes) {
  const out = { vanilla: [], frontMatter: [], untouched: [] };
  for (const n of notes) {
    if (!inScope(n.path)) continue;
    if (!stemOf(n.path).includes('_')) { out.untouched.push(n.path); continue; }
    (hasFrontMatter(n.text) ? out.frontMatter : out.vanilla).push(n.path);
  }
  return out;
}
export const targetPath = (p) => `${dirOf(p) ? dirOf(p) + '/' : ''}${spaced(stemOf(p))}.md`;
// A collision: a new path that already exists (case-insensitive, as on macOS) or that two renames would share.
export function collisions(allPaths, renames) {
  const have = new Map(); for (const p of allPaths) have.set(p.toLowerCase(), p);
  const out = [], seen = new Map();
  for (const from of renames) {
    const to = targetPath(from), key = to.toLowerCase();
    if (have.has(key) && have.get(key) !== from) out.push({ from, to, with: have.get(key) });
    if (seen.has(key)) out.push({ from, to, with: seen.get(key) }); else seen.set(key, from);
  }
  return out;
}

// ---- resolving a link target to a note path
export function makeResolver(mdPaths) {
  const lower = mdPaths.map((p) => ({ p, l: p.toLowerCase() }));
  return function resolve(target, sourcePath, isVanilla = () => true) {
    let t = target.trim(); if (!t) return { kind: 'none' };
    if (isAsset(t)) return { kind: 'asset' };
    t = t.replace(/\.md$/i, '').replace(/^\//, '');
    const want = `${t}.md`.toLowerCase();
    if (t.includes('/')) {
      const exact = lower.filter((x) => x.l === want); if (exact.length === 1) return { kind: 'note', path: exact[0].p };
      const tail = lower.filter((x) => x.l.endsWith('/' + want)); if (tail.length === 1) return { kind: 'note', path: tail[0].p };
      return tail.length > 1 ? { kind: 'ambiguous', candidates: tail.map((x) => x.p) } : { kind: 'none' };
    }
    const cands = lower.filter((x) => stemOf(x.p).toLowerCase() === t.toLowerCase()).map((x) => x.p);
    if (cands.length === 0) return { kind: 'none' };
    if (cands.length === 1) return { kind: 'note', path: cands[0] };
    const here = cands.filter((c) => dirOf(c) === dirOf(sourcePath)); if (here.length === 1) return { kind: 'note', path: here[0], by: 'same folder' };
    const van = cands.filter(isVanilla); if (van.length === 1) return { kind: 'note', path: van[0], by: 'the one vanilla note' };
    return { kind: 'ambiguous', candidates: cands };
  };
}

// every reference in a text: { kind: 'wiki' | 'anchor', target, index, length }, in text order
export function referencesIn(text) {
  const refs = [];
  for (const m of text.matchAll(WIKI)) refs.push({ kind: 'wiki', target: m[2], index: m.index, length: m[0].length, match: m });
  for (const m of text.matchAll(ANCHOR)) { const dh = /data-href="([^"]*)"/.exec(m[1]); if (dh) refs.push({ kind: 'anchor', target: dh[1], index: m.index, length: m[0].length, match: m }); }
  return refs.sort((a, b) => a.index - b.index);
}

// ---- which vanilla notes are HELD: linked from a hashed front-matter note (whose text may not change)
export function held(notes, candidates) {
  const resolve = makeResolver(notes.filter((n) => inScope(n.path)).map((n) => n.path)); const isVan = (p) => candidates.has(p);
  const out = new Map();
  for (const n of notes) {
    if (!inScope(n.path) || !hasHashes(n.text)) continue;
    for (const r of referencesIn(n.text)) {
      const res = resolve(r.target, n.path, isVan);
      const hits = res.kind === 'note' ? [res.path] : res.kind === 'ambiguous' ? res.candidates : [];
      for (const h of hits) if (candidates.has(h)) { if (!out.has(h)) out.set(h, []); out.get(h).push({ in: n.path, link: r.kind === 'wiki' ? r.match[0] : `data-href="${r.target}"` }); }
    }
  }
  return out;
}

// ---- the rewrite of one note's text. `renames` is a Map oldPath -> newPath (held notes are not in it).
// Returns { text, changes: [{ kind, from, to }], ambiguous: [{ link, candidates }], byRule: [{ in, link, by, to, renamed }] } (byRule: a bare link that names two notes, resolved by the rule).
export function rewrite(text, sourcePath, resolve, renames, isVan) {
  if (hasHashes(text)) return { text, changes: [], ambiguous: [], byRule: [] };                     // a hashed note's text never changes
  const changes = [], ambiguous = [], byRule = []; const parts = []; let at = 0;
  const rep = (target, res) => {                                                          // the new spelling of a link target, or null when it stays
    if (res.kind === 'ambiguous') { ambiguous.push({ link: target, in: sourcePath, candidates: res.candidates }); return null; }
    if (res.kind === 'note' && res.by) byRule.push({ in: sourcePath, link: target, by: res.by, to: res.path, renamed: renames.has(res.path) });
    if (res.kind !== 'note' || !renames.has(res.path)) return null;
    const t = target.trim(), m = /^(.*\/)?([^/]*)$/.exec(t), seg = m[2];
    const base = seg.replace(/\.md$/i, ''), ext = seg.slice(base.length);
    return (m[1] ?? '') + spaced(base) + ext;
  };
  for (const r of referencesIn(text)) {
    const res = resolve(r.target, sourcePath, isVan); const next = rep(r.target, res); if (next === null || next === r.target.trim()) continue;
    let replaced;
    if (r.kind === 'wiki') { const [, bang, , frag = '', alias = ''] = r.match; replaced = `${bang}[[${next}${frag}${alias}]]`; }
    else {
      const [, attrs, shown] = r.match; const old = r.target.trim(); const oldStem = old.replace(/^.*\//, '').replace(/\.md$/i, ''); const newStem = next.replace(/^.*\//, '').replace(/\.md$/i, '');
      const a2 = attrs.replace(/((?:data-)?href=")([^"]*)(")/g, (all, p1, val, p3) => (val.trim() === old ? p1 + next + p3 : all));
      replaced = `<a${a2}>${shown === oldStem ? newStem : shown}</a>`;                  // the visible text follows only when it IS the old name; an alias text stays
    }
    parts.push(text.slice(at, r.index), replaced); at = r.index + r.length; changes.push({ kind: r.kind, from: text.slice(r.index, r.index + r.length), to: replaced });
  }
  parts.push(text.slice(at));
  return { text: parts.join(''), changes, ambiguous, byRule };
}

// ---- the dead-link checker: every [[...]] and every data-href of every in-scope note that resolves to no note and no file
export function deadLinks(notes, allFiles) {
  const mdPaths = notes.filter((n) => inScope(n.path)).map((n) => n.path); const resolve = makeResolver(mdPaths);
  const files = allFiles.map((f) => f.toLowerCase()); const baseNames = new Set(files.map((f) => f.replace(/^.*\//, '')));
  const dead = [];
  for (const n of notes) {
    if (!inScope(n.path)) continue;
    for (const r of referencesIn(n.text)) {
      const t = r.target.trim(); if (!t) continue;
      if (isAsset(t)) { const l = t.toLowerCase().replace(/^\//, ''); if (!(files.includes(l) || files.some((f) => f.endsWith('/' + l)) || baseNames.has(l.replace(/^.*\//, '')))) dead.push({ in: n.path, link: t }); continue; }
      const res = resolve(t, n.path); if (res.kind === 'none') dead.push({ in: n.path, link: t });
    }
  }
  return dead;
}

// ---- the whole plan, from the vault as data
export function plan(notes, allFiles) {
  const cls = classify(notes);
  const cands = new Set(cls.vanilla);
  const clash = collisions(allFiles, cls.vanilla);
  const heldMap = held(notes, cands);
  const renamed = cls.vanilla.filter((p) => !heldMap.has(p));
  return { classes: cls, renamed, held: heldMap, collisions: clash, renames: new Map(renamed.map((p) => [p, targetPath(p)])) };
}
// Apply the rewrite to every note: { notes: [{path, text}] (text rewritten), changes, ambiguous }. The resolver sees the OLD paths (the links as written).
export function applyRewrites(notes, thePlan) {
  const resolve = makeResolver(notes.filter((n) => inScope(n.path)).map((n) => n.path)); const isVan = (p) => thePlan.classes.vanilla.includes(p);
  const out = [], changes = [], ambiguous = [], byRule = [];
  for (const n of notes) {
    if (!inScope(n.path)) { out.push(n); continue; }
    const r = rewrite(n.text, n.path, resolve, thePlan.renames, isVan);
    out.push({ path: n.path, text: r.text }); for (const c of r.changes) changes.push({ in: n.path, ...c }); for (const a of r.ambiguous) ambiguous.push(a); for (const b of r.byRule) byRule.push(b);
  }
  return { notes: out, changes, ambiguous, byRule };
}
