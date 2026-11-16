// 2026-11-16-0901 - the ribbon (left sidebar) buttons of the music vaults: New phrase, New arrangement, New composition, New bar, each with an icon of our OWN drawing. Pure: no obsidian import (the plugin passes `addIcon`, `removeIcon`,
// `addRibbonIcon` and the command runner in), so a test fixes what is registered and what a click runs.
//
// An icon is the INNER content of an SVG whose viewBox is 0 0 100 100 (what Obsidian's `addIcon(id, svgContent)` takes): every stroke and fill is `currentColor` (or `none`), so the icon follows the theme in light and dark, with no fixed colour,
// no image, no link, no script; every coordinate inside the box. Original drawings only.
export const ICON_PHRASE = 'forge-new-phrase';
export const ICON_ARRANGEMENT = 'forge-new-arrangement';
export const ICON_COMPOSITION = 'forge-new-composition';
export const ICON_BAR = 'forge-new-bar';

const S = 'stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"';
const FILL = 'fill="currentColor" stroke="none"';
export interface MusicIcon { id: string; svg: string; what: string }
export const MUSIC_ICONS: readonly MusicIcon[] = [
  { id: ICON_PHRASE, what: 'a short run of notes on a line',
    svg: `<line x1="8" y1="70" x2="92" y2="70" ${S} fill="none"/><ellipse cx="24" cy="62" rx="9" ry="7" ${FILL}/><line x1="32" y1="62" x2="32" y2="30" ${S} fill="none"/><ellipse cx="52" cy="50" rx="9" ry="7" ${FILL}/><line x1="60" y1="50" x2="60" y2="22" ${S} fill="none"/><ellipse cx="78" cy="56" rx="9" ry="7" ${FILL}/><line x1="86" y1="56" x2="86" y2="26" ${S} fill="none"/>` },
  { id: ICON_ARRANGEMENT, what: 'stacked staves, three layers',
    svg: `<rect x="14" y="60" width="72" height="18" rx="5" ${S} fill="none"/><rect x="14" y="38" width="72" height="18" rx="5" ${S} fill="none"/><rect x="14" y="16" width="72" height="18" rx="5" ${S} fill="none"/><circle cx="30" cy="69" r="3.5" ${FILL}/><circle cx="50" cy="47" r="3.5" ${FILL}/><circle cx="70" cy="25" r="3.5" ${FILL}/>` },
  { id: ICON_COMPOSITION, what: 'blocks in a row, three heights',
    svg: `<rect x="10" y="44" width="24" height="38" rx="4" ${S} fill="none"/><rect x="38" y="22" width="24" height="60" rx="4" ${S} fill="none"/><rect x="66" y="54" width="24" height="28" rx="4" ${S} fill="none"/>` },
  { id: ICON_BAR, what: 'one bar with a beat tick',
    svg: `<line x1="18" y1="30" x2="18" y2="74" ${S} fill="none"/><line x1="82" y1="30" x2="82" y2="74" ${S} fill="none"/><line x1="18" y1="52" x2="82" y2="52" ${S} fill="none"/><line x1="50" y1="20" x2="50" y2="40" ${S} fill="none"/><circle cx="50" cy="52" r="7" ${FILL}/>` },
];

/** What is wrong with an icon's SVG content (an empty list = fine): a wrapper, a fixed colour, an image or a link, a script, a coordinate outside the 100 x 100 box. */
export function iconIssues(svg: string): string[] {
  const bad: string[] = [];
  if (typeof svg !== 'string' || svg.trim() === '') return ['empty'];
  if (/<\s*svg\b/i.test(svg)) bad.push('has its own <svg> wrapper (Obsidian adds it)');
  if (/<\s*(image|script|foreignObject|use|style)\b/i.test(svg) || /\b(href|xlink:href|onload|onclick)\s*=/i.test(svg)) bad.push('has an image, a link or a script');
  for (const m of svg.matchAll(/\b(?:stroke|fill)\s*=\s*"([^"]*)"/g)) if (!['currentColor', 'none'].includes(m[1])) bad.push(`a fixed colour: ${m[1]}`);
  if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(svg)) bad.push('a colour value');
  for (const m of svg.matchAll(/\b(x|y|cx|cy|x1|y1|x2|y2|r|rx|ry|width|height)\s*=\s*"(-?[\d.]+)"/g)) {
    const n = Number(m[2]); if (!(n >= 0 && n <= 100)) bad.push(`${m[1]}=${m[2]} is outside the box`);
    if ((m[1] === 'x' || m[1] === 'y') && (n + Number(new RegExp(`\\b${m[1] === 'x' ? 'width' : 'height'}\\s*=\\s*"([\\d.]+)"`).exec(svg.slice(m.index!))?.[1] ?? 0)) > 100) bad.push(`${m[1]}=${m[2]} runs out of the box`);
  }
  return bad;
}

export interface IconApi { addIcon(id: string, svg: string): void; removeIcon?(id: string): void }
const registered = new Set<string>();
/** Register our four icons with `addIcon`, once each (a second call while they are registered adds nothing); the returned function takes them away again with `removeIcon` (when Obsidian has it) and forgets them, so a reload registers them afresh. */
export function registerMusicIcons(api: IconApi): () => void {
  const mine: string[] = [];
  for (const icon of MUSIC_ICONS) { if (registered.has(icon.id)) continue; api.addIcon(icon.id, icon.svg); registered.add(icon.id); mine.push(icon.id); }
  return () => { for (const id of mine) { try { api.removeIcon?.(id); } catch (e) { console.error('registerMusicIcons: removeIcon failed', id, e); } registered.delete(id); } mine.length = 0; };
}

export interface RibbonItem { commandId: string; icon: string; title: string; unavailable: string }
/** The four buttons, in the order of the ribbon. `commandId` is the id the PLUGIN registered the command under (the palette entry and the ribbon button are the same command). */
export const MUSIC_RIBBON: readonly RibbonItem[] = [
  { commandId: 'new-phrase', icon: ICON_PHRASE, title: 'New phrase', unavailable: 'New phrase is not available right now.' },
  { commandId: 'new-arrangement', icon: ICON_ARRANGEMENT, title: 'New arrangement', unavailable: 'New arrangement needs at least one kit and one phrase. Make them first (New kit, New phrase).' },
  { commandId: 'new-composition', icon: ICON_COMPOSITION, title: 'New composition', unavailable: 'New composition needs at least one phrase or arrangement. Make one first (New phrase, New arrangement).' },
  { commandId: 'new-bar', icon: ICON_BAR, title: 'New bar', unavailable: 'New bar is not available right now.' },
];
export interface RibbonDeps {
  /** The plugin's id: a command is run by `<pluginId>:<commandId>`. */
  pluginId: string;
  addRibbonIcon(icon: string, title: string, onClick: () => void): unknown;
  /** Run a command by its full id; false when it is not offered right now. */
  runCommand(fullId: string): boolean;
  notify(message: string): void;
  /** 2026-11-16-1102: one evidence line (`[forge-music-ribbon] registered 4 buttons`, and a line per button that could not be made). Absent = nothing is said. */
  trace?(line: string): void;
}
/** Register the four buttons; returns how many Obsidian took. A button that throws is a trace line naming it (the others still go in). */
export function registerMusicRibbon(deps: RibbonDeps): number {
  let made = 0;
  for (const item of MUSIC_RIBBON) {
    try { deps.addRibbonIcon(item.icon, item.title, () => { if (!deps.runCommand(`${deps.pluginId}:${item.commandId}`)) deps.notify(item.unavailable); }); made++; }
    catch (e) { deps.trace?.(`${RIBBON_TRACE} could not make "${item.title}": ${(e as Error)?.message ?? e}`); }
  }
  deps.trace?.(ribbonRegisteredLine(made));
  return made;
}

// ---- 2026-11-16-1102: what the plugin SAYS about the buttons -----------------------------------------------------------------------------------------------------------------------------
export const RIBBON_TRACE = '[forge-music-ribbon]';
export const ribbonRegisteredLine = (n: number): string => `${RIBBON_TRACE} registered ${n} buttons`;
export const ribbonNotRegisteredLine = (reason: string): string => `${RIBBON_TRACE} not registered: ${reason}`;
export const NOT_MUSIC_VAULT_REASON = 'this vault is not a music vault (its forge.toml does not turn the music tabs on), so the music buttons are not made here';

/** One of our buttons as Obsidian's left ribbon has it: `present` = Obsidian lists it, `hidden` = turned off in the ribbon's Manage list, `shown` = its button is inside the ribbon's box (false = clipped below it; null = could not be measured). */
export interface RibbonProbe { id: string; title: string; present: boolean; hidden: boolean; shown: boolean | null }
interface Boxed { getBoundingClientRect(): { top: number; bottom: number; height: number } }
interface RibbonLike { items?: Array<{ id: string; hidden?: boolean; buttonEl?: Boxed }>; containerEl?: Boxed }
/**
 * Read Obsidian's left ribbon (its internals, as app.js of Obsidian 1.15 keeps them: `items` of `{ id, hidden, buttonEl }`, `containerEl`; the ribbon has no scrolling, so an icon below the box of the ribbon is cut off). `fits` counts every icon that is
 * not turned off: how many of them are inside the box. Never throws: what cannot be read is `shown: null`.
 */
export function ribbonProbe(ribbon: RibbonLike | null | undefined, pluginId: string, titles: readonly string[]): { probes: RibbonProbe[]; fits: { fit: number; total: number } | null } {
  const items = Array.isArray(ribbon?.items) ? ribbon!.items! : [];
  let box: { top: number; bottom: number } | null = null;
  try { const r = ribbon?.containerEl?.getBoundingClientRect(); if (r && r.bottom > r.top) box = r; } catch { box = null; }
  const inside = (el: Boxed | undefined): boolean | null => {
    if (!el || !box) return null;
    try { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1; } catch { return null; }
  };
  const probes = titles.map((title): RibbonProbe => {
    const id = `${pluginId}:${title}`; const it = items.find((x) => x.id === id);
    if (!it) return { id, title, present: false, hidden: false, shown: null };
    const hidden = it.hidden === true;
    return { id, title, present: true, hidden, shown: hidden ? false : inside(it.buttonEl) };
  });
  const live = items.filter((x) => x.hidden !== true && x.buttonEl !== undefined);
  const fits = box ? { fit: live.filter((x) => inside(x.buttonEl) === true).length, total: live.length } : null;
  return { probes, fits };
}

export type RibbonState = 'shown' | 'not-music-vault' | 'loading' | 'not-registered' | 'turned-off' | 'too-short' | 'unmeasured';
export interface RibbonStatusInput { musicVault: boolean | null; registered: boolean; probes: readonly RibbonProbe[]; fits?: { fit: number; total: number } | null }
/** The Settings row's text, one sentence: shown, or hidden because ... (the cause that can be told apart from the outside). */
export function ribbonStatus(i: RibbonStatusInput): { state: RibbonState; text: string } {
  const say = (state: RibbonState, text: string) => ({ state, text: `Music ribbon buttons: ${text}` });
  if (i.musicVault === null) return say('loading', 'not known yet (Obsidian is still loading this vault).');
  if (i.musicVault === false) return say('not-music-vault', 'hidden because this vault is not a music vault (its forge.toml does not turn the music tabs on).');
  const present = i.probes.filter((p) => p.present);
  if (!i.registered || present.length === 0) return say('not-registered', `hidden because they were not made (the console line ${RIBBON_TRACE} says why).`);
  const off = present.filter((p) => p.hidden), live = present.filter((p) => !p.hidden);
  if (live.length === 0) return say('turned-off', "hidden because you turned them off in the ribbon's Manage list (right-click the ribbon, Manage).");
  if (live.some((p) => p.shown === false)) {
    const f = i.fits;
    return say('too-short', `hidden because the ribbon is too short for them: only ${f ? `${f.fit} of ${f.total}` : 'some'} icons fit. Make the window taller, or turn off icons you do not use (right-click the ribbon, Manage).`);
  }
  if (live.every((p) => p.shown === null)) return say('unmeasured', 'made, but I could not measure whether the ribbon shows them (look at the left ribbon; the "+ New" button in the tab header does the same).');
  if (off.length > 0) return say('turned-off', `${off.length} of ${present.length} are turned off in the ribbon's Manage list (${off.map((p) => p.title).join(', ')}); the others are shown.`);
  return say('shown', `shown (${live.length} of ${present.length} are in the left ribbon).`);
}
