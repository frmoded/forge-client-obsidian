// Drain 2026-10-11-0900 §2 + §3 — the extraction MANIFEST and the two decisions that rest on it. Pure (no Obsidian, no I/O): the
// extractor (bundled-vault-extractor-core.ts) supplies bytes/hashes and applies the plans.
//
// A manifest is, per extracted library vault, `{ <path relative to the library root>: <content hash as extracted> }`, recorded next to
// the identity record in the PLUGIN folder (never the user's vault). It answers, as a fact rather than a guess, "did the plugin put this
// file here, and has it been touched since?":
//   - the bundle-dropped SWEEP may remove a file only if it is (a) in the manifest, (b) absent from the new bundle, and (c) byte-identical
//     to its recorded hash. A user's own note is never in the manifest, so it survives every launch;
//   - a bundle DRIFT updates a file in place only if it is still byte-identical to its recorded hash (unedited), adds new files, leaves
//     an edited one alone (the caller may write the new version beside it as `<name>.bundled`), and remembers a deliberate deletion.
//
// A file that is in the manifest but turns out to be edited is RELINQUISHED (its entry is dropped): from then on it is the user's, so it
// is reported once and never touched or mentioned again.

export type Manifest = Record<string, string>;
export type ManifestStore = Record<string, Manifest>;

/** Where the record lives, beside `.extracted-bundle-ids.json`. */
export const MANIFESTS_FILE = '.extracted-manifests.json';

export function manifestsPath(pluginDir: string): string {
  return `${pluginDir.replace(/\/+$/, '')}/assets/${MANIFESTS_FILE}`;
}

/** `<length>:<64-bit FNV-1a, hex>` of the bytes. Not cryptographic — it detects "has this file changed since I wrote it", where an
 *  accidental collision is the only threat. Pure and synchronous (no SubtleCrypto), so the same code runs in Obsidian and in tests. */
export function hashBytes(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // two independent 32-bit FNV-1a lanes with different offset bases, combined to 64 bits
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `${bytes.length}:${hex(h1)}${hex(h2)}`;
}

/** Tolerant: anything that is not `{ vault: { path: string } }` yields only its well-formed entries. A missing or corrupt record means
 *  "we own nothing" — which costs a re-adoption pass, never a destructive action. */
export function parseManifests(text: string | null | undefined): ManifestStore {
  if (!text) return {};
  let v: unknown;
  try { v = JSON.parse(text); } catch { return {}; }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: ManifestStore = {};
  for (const [vault, entries] of Object.entries(v as Record<string, unknown>)) {
    if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const m: Manifest = {};
    for (const [rel, h] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof h === 'string') m[rel] = h;
    }
    out[vault] = m;
  }
  return out;
}

export function serializeManifests(store: ManifestStore): string {
  const sorted: ManifestStore = {};
  for (const vault of Object.keys(store).sort()) {
    const m: Manifest = {};
    for (const rel of Object.keys(store[vault]).sort()) m[rel] = store[vault][rel];
    sorted[vault] = m;
  }
  return JSON.stringify(sorted, null, 1);
}

// ---- the sweep ----------------------------------------------------------------------------------------------------------

/** The manifest entries whose file is no longer in the bundle: the only files whose on-disk hash the sweep needs. */
export function findDroppedCandidates(manifest: Manifest, bundleFiles: ReadonlySet<string>): string[] {
  return Object.keys(manifest).filter((rel) => !bundleFiles.has(rel)).sort();
}

export interface SweepPlan {
  /** Dropped from the bundle, in the manifest, and byte-identical to what was extracted: safe to trash. */
  remove: string[];
  /** Dropped from the bundle but EDITED since: left alone, relinquished, and listed in the one Notice. */
  keptEdited: string[];
  /** The manifest after this pass. */
  next: Manifest;
  /** The bundle listing was empty while the manifest is not: nothing is touched (a bad listing must not wipe a library). */
  bailedEmptyBundle: boolean;
}

export function planManifestSweep(input: {
  manifest: Manifest;
  bundleFiles: ReadonlySet<string>;
  /** On-disk hash per candidate path; `null`/missing = the file is not there. */
  diskHashes: Record<string, string | null | undefined>;
}): SweepPlan {
  const { manifest, bundleFiles, diskHashes } = input;
  if (bundleFiles.size === 0 && Object.keys(manifest).length > 0) {
    return { remove: [], keptEdited: [], next: { ...manifest }, bailedEmptyBundle: true };
  }
  const remove: string[] = [];
  const keptEdited: string[] = [];
  const next: Manifest = { ...manifest };
  for (const rel of findDroppedCandidates(manifest, bundleFiles)) {
    const disk = diskHashes[rel];
    if (disk === null || disk === undefined) {
      delete next[rel];                          // already gone: nothing to sweep, forget the entry
    } else if (disk === manifest[rel]) {
      remove.push(rel);
      delete next[rel];
    } else {
      keptEdited.push(rel);                      // edited since extraction: the user's now
      delete next[rel];
    }
  }
  return { remove, keptEdited, next, bailedEmptyBundle: false };
}

// ---- per-file drift -----------------------------------------------------------------------------------------------------

export interface DriftPlan {
  /** Unedited, bundle copy changed: overwrite in place. */
  update: string[];
  /** In the bundle, not on disk, never extracted by us: new file, write it. */
  add: string[];
  /** On disk, differs from the bundle, and not byte-identical to what we extracted: the user's. Left alone (a `.bundled` sidecar may be written). */
  leftEdited: string[];
  /** We extracted it, it is gone from disk: the user deleted it. Left deleted. */
  keptDeleted: string[];
  /** Dropped from the bundle and unedited: trash. */
  remove: string[];
  /** Dropped from the bundle but edited: left, relinquished, reported. */
  keptEdited: string[];
  next: Manifest;
}

export function planFileDrift(input: {
  manifest: Manifest;
  bundleHashes: Record<string, string>;
  diskHashes: Record<string, string | null | undefined>;
}): DriftPlan {
  const { manifest, bundleHashes, diskHashes } = input;
  const plan: DriftPlan = { update: [], add: [], leftEdited: [], keptDeleted: [], remove: [], keptEdited: [], next: { ...manifest } };
  for (const rel of Object.keys(bundleHashes).sort()) {
    const bundle = bundleHashes[rel];
    const disk = diskHashes[rel] ?? null;
    const recorded = manifest[rel];
    if (disk === null) {
      if (recorded !== undefined) plan.keptDeleted.push(rel);   // we extracted it, it is gone: a deliberate deletion — remember it
      else { plan.add.push(rel); plan.next[rel] = bundle; }
    } else if (disk === bundle) {
      plan.next[rel] = bundle;                                  // already current (adopt it if we did not know it)
    } else if (recorded !== undefined && disk === recorded) {
      plan.update.push(rel);                                    // untouched since extraction, bundle moved on: update in place
      plan.next[rel] = bundle;
    } else {
      plan.leftEdited.push(rel);                                // edited, or of unknown provenance: never overwritten
      delete plan.next[rel];
    }
  }
  // files that left the bundle follow the sweep rules
  const bundleSet = new Set(Object.keys(bundleHashes));
  const dropped = planManifestSweep({
    manifest: Object.fromEntries(Object.entries(manifest).filter(([rel]) => !bundleSet.has(rel))),
    bundleFiles: bundleSet,
    diskHashes,
  });
  if (!dropped.bailedEmptyBundle) {
    plan.remove = dropped.remove;
    plan.keptEdited = dropped.keptEdited;
    for (const rel of findDroppedCandidates(manifest, bundleSet)) delete plan.next[rel];   // removed, relinquished, or already gone
  }
  return plan;
}

// ---- the one Notice -----------------------------------------------------------------------------------------------------

export interface LibraryNoticeInput {
  /** Per vault: bundle changed, the user's edited copy was left, the new version sits beside it as `<name>.bundled`. */
  leftEdited: Record<string, string[]>;
  /** Per vault: dropped from the bundle but edited — left in place and now entirely the user's. */
  keptEdited: Record<string, string[]>;
  /** Per vault: dropped from the bundle, unedited, moved to the system trash. */
  removed: Record<string, string[]>;
}

const sample = (files: string[]) => `${files.slice(0, 3).join(', ')}${files.length > 3 ? `, +${files.length - 3} more` : ''}`;

/** The single Notice for an extraction + sweep pass, or null when there is nothing to say. A user's own notes are never listed. */
export function formatLibraryNotice(input: LibraryNoticeInput): string | null {
  const parts: string[] = [];
  const section = (title: string, by: Record<string, string[]>) => {
    const vaults = Object.keys(by).filter((v) => by[v].length > 0).sort();
    if (vaults.length === 0) return;
    parts.push(`${title}: ${vaults.map((v) => `${v}: ${by[v].length} (${sample(by[v])})`).join('; ')}`);
  };
  section('Left alone because you edited them (the new version is beside each as <name>.bundled)', input.leftEdited);
  section('No longer in the library but kept because you edited them', input.keptEdited);
  section('Removed from the library and moved to the system trash (unedited)', input.removed);
  return parts.length === 0 ? null : `Forge: library update — ${parts.join(' · ')}.`;
}
