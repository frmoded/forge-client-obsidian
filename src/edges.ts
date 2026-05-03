// Plugin-side helpers for reading captured edge snapshots from
// <vault>/.forge/edges/. The backend writes these files on every traversal;
// the plugin reads them directly (no /edges endpoint in the API yet).

import { App, TFile } from 'obsidian';

const EDGES_DIR = '.forge/edges';

export interface SnapshotMeta {
  caller: string;
  callee: string;
  state: 'live' | 'frozen';
  captured_at: string;
  content_type: string;
}

// Map a file path to its qualified snippet ID. Library vaults (subdirs
// containing forge.toml) keep their name as the namespace; everything else
// lives in the authoring vault.
export async function pathToSnippetId(app: App, filePath: string): Promise<string> {
  const noExt = filePath.replace(/\.md$/, '');
  const firstSeg = noExt.split('/')[0];
  const libs = await detectLibraryVaults(app);
  if (libs.includes(firstSeg)) return noExt;
  return `authoring/${noExt}`;
}

// If the wikilink target is qualified, use it as-is. Otherwise assume the
// caller's namespace. This is a best-effort match for the backend resolver,
// which walks resolution order from the authoring vault outward.
export function resolveLinkTarget(linkText: string, callerId: string): string {
  if (linkText.includes('/')) return linkText;
  const ns = callerId.split('/', 1)[0];
  return `${ns}/${linkText}`;
}

export async function readSnapshot(app: App, callerId: string, calleeId: string): Promise<SnapshotMeta | null> {
  const path = `${EDGES_DIR}/${callerId}/${calleeId}.md`;
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(path))) return null;
  const content = await adapter.read(path);
  return parseSnapshotMeta(content);
}

// All edges this snippet calls.
export async function listOutgoing(app: App, callerId: string): Promise<SnapshotMeta[]> {
  const dir = `${EDGES_DIR}/${callerId}`;
  return await walkSnapshots(app, dir);
}

// All edges that call this snippet — every snapshot under .forge/edges/
// whose `callee` matches.
export async function listIncoming(app: App, calleeId: string): Promise<SnapshotMeta[]> {
  const all = await walkSnapshots(app, EDGES_DIR);
  return all.filter(s => s.callee === calleeId);
}

export function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function absoluteTime(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleString();
}

export function snapshotPath(callerId: string, calleeId: string): string {
  return `${EDGES_DIR}/${callerId}/${calleeId}.md`;
}

// --- internals ---

async function walkSnapshots(app: App, dir: string): Promise<SnapshotMeta[]> {
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(dir))) return [];
  const out: SnapshotMeta[] = [];

  async function walk(d: string) {
    const list = await adapter.list(d);
    for (const file of list.files) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = await adapter.read(file);
        const meta = parseSnapshotMeta(content);
        if (meta) out.push(meta);
      } catch (e) {
        console.warn(`Forge: failed to read snapshot ${file}`, e);
      }
    }
    for (const folder of list.folders) {
      await walk(folder);
    }
  }
  await walk(dir);
  return out;
}

function parseSnapshotMeta(content: string): SnapshotMeta | null {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = content.slice(3, end).trim();
  const meta: any = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    meta[m[1].trim()] = value;
  }
  if (!meta.caller || !meta.callee || !meta.state) return null;
  return meta as SnapshotMeta;
}

let _cachedLibs: string[] | null = null;
async function detectLibraryVaults(app: App): Promise<string[]> {
  if (_cachedLibs) return _cachedLibs;
  const adapter = app.vault.adapter;
  const root = await adapter.list('/');
  const libs: string[] = [];
  for (const folder of root.folders) {
    if (await adapter.exists(`${folder}/forge.toml`)) {
      libs.push(folder);
    }
  }
  _cachedLibs = libs;
  return libs;
}

// Forces a re-scan on next call; called when /connect succeeds (a new
// library vault may have been installed).
export function invalidateLibraryVaultCache() {
  _cachedLibs = null;
}
