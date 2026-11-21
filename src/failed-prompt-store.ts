// 2026-11-20-1004 - the store of the failed-prompt queue: a thin layer over a FILE ADAPTER (Obsidian's `vault.adapter` in the plugin; a map in the tests) and the pure core. The queue is `failed-prompts.jsonl` in the PLUGIN'S OWN data folder (never
// `data.json`: nothing here names it), the random vault id is kept once in `failed-prompts-vault-id.txt`, and ONE lock serialises every append and every rewrite so a sentence failing while the review tab saves is never lost. With the setting OFF
// nothing is read or written at all (P3). A failure to write is said once through `warn` and never reaches the composer.
/** 2026-11-19-0997: this module is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts). */
export const LIST_MODEL_SENTINEL_FAILED_PROMPT_STORE = 'forge-list-model-core:failed-prompt-store';
import { FAILED_FILE, RESOLVED_FILE, exportLines, knownLines, makeRecord, newId, parseQueue, pendingOf, queueText, recordLine, tableOf, type FailedRecord, type FailureInput } from './failed-prompt-core.ts';

export interface FileAdapter {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  append(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
export interface FailedStoreOptions {
  adapter: FileAdapter; dir: string; enabled(): boolean; build(): string; now(): number; rand(): number; warn(line: string): void;
}
export interface FailedStore {
  /** Make a record of a sentence that ended unprocessed. false = the setting is off, or the write failed (said through `warn`). Never throws. */
  record(input: FailureInput): Promise<boolean>;
  load(): Promise<{ records: FailedRecord[]; bad: number }>;
  save(records: readonly FailedRecord[]): Promise<void>;
  exportResolved(): Promise<{ count: number; file: string }>;
  /** Read the queue once (setting on) so the pending count and the personal table are known without a file read. */
  refresh(): Promise<void>;
  pendingCount(): number;
  known(sentence: string): string[] | null;
  onChange(fn: () => void): void;
}

export function createFailedStore(o: FailedStoreOptions): FailedStore {
  const file = `${o.dir}/${FAILED_FILE}`, idFile = `${o.dir}/failed-prompts-vault-id.txt`, outFile = `${o.dir}/${RESOLVED_FILE}`;
  let chain: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run; return run; };
  let table: Map<string, string[]> = new Map(); let pending = 0; const listeners: Array<() => void> = []; let vaultId: string | null = null;
  const absorb = (records: readonly FailedRecord[]): void => { table = tableOf(records); pending = pendingOf(records).length; for (const f of listeners) f(); };
  const readAll = async (): Promise<{ records: FailedRecord[]; bad: number }> => { let text = ''; try { text = await o.adapter.read(file); } catch { /* no file yet: an empty queue */ } return parseQueue(text); };
  const idOf = async (): Promise<string> => {
    if (vaultId !== null) return vaultId;
    try { const t = (await o.adapter.read(idFile)).trim(); if (/^v-[a-z0-9]+$/.test(t)) { vaultId = t; return t; } } catch { /* no id yet: a new one is made */ }
    vaultId = `v-${newId(o.rand, o.now()).slice(3).replace(/-/g, '')}`; await o.adapter.write(idFile, `${vaultId}\n`); return vaultId;
  };
  return {
    async record(input) {
      if (!o.enabled()) return false;
      try {
        return await locked(async () => {
          const rec = makeRecord(input, { id: newId(o.rand, o.now()), time: new Date(o.now()).toISOString(), build: o.build(), vaultId: await idOf() });
          await o.adapter.append(file, `${recordLine(rec)}\n`); pending++; for (const f of listeners) f(); return true;
        });
      } catch (e) { o.warn(`failed-prompts: could not keep a sentence for review: ${(e as Error)?.message ?? e}`); return false; }
    },
    async load() { if (!o.enabled()) return { records: [], bad: 0 }; return locked(async () => { const q = await readAll(); absorb(q.records); return q; }); },
    async save(records) { await locked(async () => { await o.adapter.write(file, queueText(records)); absorb(records); }); },
    async exportResolved() { return locked(async () => { const { records } = await readAll(); const text = exportLines(records); await o.adapter.write(outFile, text); return { count: text === '' ? 0 : text.trim().split('\n').length, file: outFile }; }); },
    async refresh() { if (!o.enabled()) { table = new Map(); pending = 0; return; } await locked(async () => { absorb((await readAll()).records); }); },
    pendingCount: () => (o.enabled() ? pending : 0),
    known: (s) => (o.enabled() ? knownLines(table, s) : null),
    onChange: (fn) => { listeners.push(fn); },
  };
}
