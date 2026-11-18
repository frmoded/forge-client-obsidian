// Drain 2026-10-09-2200 (rider d) — how the build stamp (short git SHA + build time, from the gitignored src/build-stamp.generated.ts that
// scripts/inline-plugin-version.mjs writes on every build) is shown. Pure so the formatting is tested.
import { setSrLabel } from './sr-label-core.ts';

export interface BuildStamp {
  readonly sha: string;
  readonly dirty: boolean;
  readonly builtAt: string;
}

/** "904d575c7+dirty · built 2026-10-09 20:53 UTC" (or "unknown build" when the SHA could not be read). */
export function formatBuildStamp(stamp: BuildStamp): string {
  const when = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(stamp.builtAt);
  const time = when ? ` · built ${when[1]} ${when[2]} UTC` : '';
  if (stamp.sha === 'unknown') return `unknown build${time}`;
  return `${stamp.sha}${stamp.dirty ? '+dirty' : ''}${time}`;
}

export interface StatusBarLabelInput {
  version: string;
  /** `formatBuildStamp(BUILD_STAMP)`. */
  build: string;
  pluginId: string;
  minAppVersion: string;
}

/** The status-bar item's full name for a screen reader, on ONE line (separators, not newlines). Nobody sees it: the item shows only "Forge v...", and the build is in Settings (the driver took the tooltip away, 2026-11-18). */
export function statusBarLabelText(i: StatusBarLabelInput): string {
  return `Forge Client v${i.version} · Build: ${i.build} · Plugin ID: ${i.pluginId} · Min app version: ${i.minAppVersion}`;
}

/** 2026-11-19-0925: no tooltip, Obsidian's own included. Obsidian draws one from the item's `aria-label` (positioned by `data-tooltip-position`), so neither is set: the text lives in a hidden span inside the item and
 *  the item points at it with `aria-labelledby` (src/sr-label-core.ts). Any native `title` is cleared too, so nothing can stack. Call it ONCE, after `setText`: a later `setText` would replace the span. */
export function setStatusBarLabel(el: HTMLElement, text: string): void {
  setSrLabel(el, text);
  el.removeAttribute('title');
}

/** 2026-10-31-1115: the commit alone, for the onload banner: "904d575c7" or "904d575c7+dirty" ("unknown" when it could not be read). */
export function formatBuildSha(stamp: Pick<BuildStamp, 'sha' | 'dirty'>): string {
  return stamp.sha === 'unknown' ? 'unknown build' : `${stamp.sha}${stamp.dirty ? '+dirty' : ''}`;
}

/** 2026-11-17-0901 A: the console banner. Every vault keeps its OWN copy of the plugin, so the banner names the vault whose copy is running: the commit alone cannot say
 *  "this is the old copy in the other vault". No vault name (or a blank one) leaves the line as it was. */
export function formatLoadBanner(i: { version: string; edition: string; stamp: Pick<BuildStamp, 'sha' | 'dirty'>; vaultName?: string }): string {
  const vault = i.vaultName?.trim();
  return `FORGE CLIENT v${i.version} LOADED (edition: ${i.edition}, ${formatBuildSha(i.stamp)}${vault ? `, vault: ${vault}` : ''})`;
}

/** 2026-11-17-0901 A: the Settings "Build" line: the commit (+dirty), when, and whose copy this is. */
export function formatBuildLine(stamp: BuildStamp, vaultName?: string): string {
  const vault = vaultName?.trim();
  return `${formatBuildStamp(stamp)}${vault ? ` · this vault (${vault}) has its own copy of the plugin` : ''}`;
}

/** 2026-11-17-0901 A: the open vault's name, or undefined. Never throws: the host's vault is a stub in tests and may not have a name yet, and a banner must not be able to stop onload. */
export function vaultNameOf(app: { vault?: { getName?: () => unknown } } | undefined): string | undefined {
  try {
    const name = app?.vault?.getName?.();
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}
