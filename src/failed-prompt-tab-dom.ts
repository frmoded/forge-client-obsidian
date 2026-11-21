// 2026-11-20-1004 (THE FAILED-PROMPT REVIEW QUEUE, phase 1) - the REVIEW TAB's DOM (no `obsidian` import: the plugin's ItemView only hosts it). Oldest first, the count; the item card shows the sentence AS TYPED (text, never markup), the kind, the
// lines, the bar count, the grammar's words and the service result; five resolutions (design section 2.3): Write the lines (every line checked live by the SAME grammar the composer uses, a refused line in words under the box, Copy lines, Apply to
// the open note only when it is the same note as it was, as a plan to confirm), Teach a word, Not a request, Ask the person, Skip (this session only: the item goes to the end). Undo of the last resolution. Export. Keyboard shortcuts for the five.
// No tooltips (no title attributes), no hover behaviour, muted words, no red: the look is the stylesheet's (`.forge-review-*`, Obsidian's own variables).
/** 2026-11-19-0997: this module is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts). */
export const LIST_MODEL_SENTINEL_FAILED_PROMPT_TAB_DOM = 'forge-list-model-core:failed-prompt-tab-dom';
import { setSrLabel } from './sr-label-core.ts';
import { pendingOf, resolve, unresolve, type FailKind, type FailedRecord, type ResolutionInput } from './failed-prompt-core.ts';

export interface ReviewTabPorts {
  enabled(): boolean;
  load(): Promise<FailedRecord[]>;
  save(records: FailedRecord[]): Promise<void>;
  /** The composer's grammar on each line (null = it reads it, else its words); the lines are checked one after the other, each after the ones above it, over the item's own lines. */
  check(item: FailedRecord, lines: string[]): Promise<Array<string | null>>;
  copy(text: string): Promise<void>;
  exportResolved(): Promise<{ count: number; file: string }>;
  /** The note open in the workspace right now (kind and canonical lines), or null: "Apply to the open note" is offered only when it is the item's own kind with the item's own lines. */
  active(): { path: string; kind: FailKind; lines: string[] } | null;
  applyLines(path: string, lines: string[]): Promise<{ ok: boolean; message: string }>;
  now(): string;
}
export interface ReviewTab { refresh(): Promise<void>; destroy(): void }

type Mode = 'lines' | 'teach' | 'ask' | null;
const ACTIONS: ReadonlyArray<{ key: string; label: string; mode: Mode | 'not' | 'skip' }> = [
  { key: 'w', label: 'Write the lines (W)', mode: 'lines' }, { key: 't', label: 'Teach a word (T)', mode: 'teach' }, { key: 'n', label: 'Not a request (N)', mode: 'not' },
  { key: 'a', label: 'Ask the person (A)', mode: 'ask' }, { key: 's', label: 'Skip (S)', mode: 'skip' },
];
const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export function mountReviewTab(host: HTMLElement, ports: ReviewTabPorts): ReviewTab {
  const doc = host.ownerDocument;
  let records: FailedRecord[] = []; let skipped: string[] = []; const history: string[] = [];
  let mode: Mode = null; let status = ''; let boxText = ''; let checks: Array<string | null> | { error: string } | null = null; let confirming = false; let seq = 0;

  /** Everything the open panel and the last action leave behind (the box, its checks, the apply plan, the status line): one place. */
  const reset = (next: Mode = null): void => { mode = next; boxText = ''; checks = null; confirming = false; status = ''; };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => { const e = doc.createElement(tag); e.className = cls; e.textContent = text ?? ''; return e; };
  const orderedPending = (): FailedRecord[] => { const p = pendingOf(records); const sk = skipped.filter((id) => p.some((r) => r.id === id)); return [...p.filter((r) => !sk.includes(r.id)), ...sk.map((id) => p.find((r) => r.id === id)!)]; };
  const current = (): FailedRecord | null => orderedPending()[0] ?? null;
  const boxLines = (): string[] => boxText.split('\n').map((l) => l.trim()).filter((l) => l !== '');

  async function recheck(): Promise<void> {
    const item = current(); const mine = ++seq; const lines = boxLines();
    if (item === null || mode !== 'lines' || lines.length === 0) { checks = null; renderChecks(); return; }
    try { const out = await ports.check(item, lines); if (mine === seq) checks = out; } catch (e) { if (mine === seq) checks = { error: (e as Error)?.message ?? String(e) }; }
    if (mine === seq) renderChecks();
  }
  const canSave = (): boolean => {
    if (mode === 'lines') return Array.isArray(checks) && checks.length === boxLines().length && boxLines().length > 0 && checks.every((c) => c === null);
    return boxText.trim() !== '';
  };
  async function commit(input: ResolutionInput): Promise<void> {
    const item = current(); if (item === null) return;
    const before = records;
    try { records = resolve(records, item.id, input, ports.now()); await ports.save(records); } catch (e) { records = before; status = `Could not save: ${(e as Error)?.message ?? e}`; render(); return; }
    history.push(item.id); reset(); render();          // a resolved item's id may stay in `skipped` (orderedPending ignores it; an undo forgets it)
  }
  async function save(): Promise<void> {
    if (!canSave()) return;
    if (mode === 'lines') await commit({ kind: 'lines', lines: boxLines() });
    else if (mode === 'teach') await commit({ kind: 'teach', note: boxText.trim() });
    else await commit({ kind: 'ask', question: boxText.trim() });          // the third panel
  }
  async function undo(): Promise<void> {
    const id = history.pop(); if (id === undefined) return;
    const before = records;
    try { records = unresolve(records, id); await ports.save(records); } catch (e) { records = before; history.push(id); status = `Could not save: ${(e as Error)?.message ?? e}`; render(); return; }
    skipped = skipped.filter((x) => x !== id); reset(); render();
  }
  function open(next: Mode): void { reset(next); render(); host.querySelector<HTMLElement>('.forge-review-box')?.focus(); }
  async function act(a: (typeof ACTIONS)[number]): Promise<void> {
    const item = current(); if (item === null) return;
    if (a.mode === 'not') await commit({ kind: 'not-a-request' });
    else if (a.mode === 'skip') { skipped = [...skipped.filter((id) => id !== item.id), item.id]; reset(); render(); }
    else open(a.mode);
  }

  function renderChecks(): void {
    const box = host.querySelector('.forge-review-checks'); const saveBtn = host.querySelector<HTMLButtonElement>('.forge-review-save');
    if (box !== null) {
      box.textContent = '';
      const lines = boxText.split('\n');
      if (checks !== null && !Array.isArray(checks)) box.appendChild(el('p', 'forge-review-check forge-review-muted', `The lines could not be checked: ${checks.error}`));
      else if (Array.isArray(checks)) { let k = 0; lines.forEach((l, i) => { if (l.trim() === '') return; const why = checks[k++]; box.appendChild(el('p', 'forge-review-check forge-review-muted', why === null ? `Line ${i + 1} reads.` : `Line ${i + 1}: ${why}`)); }); }
    }
    if (saveBtn !== null) saveBtn.disabled = !canSave();
    const item = current(); const row = host.querySelector('.forge-review-panel .forge-review-row'); host.querySelector('.forge-review-apply')?.remove();
    if (row !== null && item !== null && mode === 'lines' && !confirming && boxLines().length > 0 && offersApply(item)) {            // offered only when the open note is the one this sentence was typed in, as it was
      const ap = doc.createElement('button'); ap.type = 'button'; ap.className = 'forge-review-apply'; ap.textContent = 'Apply to the open note'; ap.addEventListener('click', () => { confirming = true; render(); }); row.appendChild(ap);
    }
  }
  const offersApply = (item: FailedRecord): boolean => { const a = ports.active(); return a !== null && a.kind === item.kind && same(a.lines, item.lines); };

  function panel(item: FailedRecord): HTMLElement {
    const p = el('div', 'forge-review-panel');
    const box = (cls: string, label: string, rows: number): HTMLTextAreaElement => { const b = doc.createElement('textarea'); b.className = `forge-review-box ${cls}`; b.rows = rows; b.value = boxText; setSrLabel(b, label, { host: p }); b.addEventListener('input', () => { boxText = b.value; if (mode === 'lines') void recheck(); else renderChecks(); }); return b; };
    const btn = (cls: string, label: string, on: () => void): HTMLButtonElement => { const b = doc.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.addEventListener('click', on); return b; };
    if (mode === 'lines') {
      p.appendChild(el('p', 'forge-review-muted', 'One canonical sentence per line. Each line is checked by the same grammar the composer uses.'));
      p.appendChild(box('forge-review-lines-box', 'Canonical sentences, one per line', 5)); p.appendChild(el('div', 'forge-review-checks'));
      const row = el('div', 'forge-review-row');
      row.appendChild(btn('forge-review-save', 'Save the lines', () => { void save(); }));
      row.appendChild(btn('forge-review-copy', 'Copy lines', () => { void (async () => { const ls = boxLines(); if (ls.length === 0) { status = 'Nothing to copy.'; } else { await ports.copy(ls.join('\n')); status = `Copied ${ls.length} line${ls.length === 1 ? '' : 's'}.`; } renderStatus(); })(); }));
      p.appendChild(row);
      if (confirming) {
        const n = boxLines().length; const plan = el('div', 'forge-review-plan'); plan.appendChild(el('p', '', `This will add ${n} line${n === 1 ? '' : 's'} to the open note.`));
        plan.appendChild(btn('forge-review-apply-confirm', 'Add', () => { void (async () => { const a = ports.active(); if (a === null || !offersApply(item)) { status = 'The open note is not the one this sentence was typed in any more.'; confirming = false; render(); return; } const r = await ports.applyLines(a.path, boxLines()); status = r.message; confirming = false; render(); })(); }));
        plan.appendChild(btn('forge-review-apply-cancel', 'Cancel', () => { confirming = false; render(); })); p.appendChild(plan);
      }
    } else if (mode === 'teach') {
      p.appendChild(el('p', 'forge-review-muted', 'A note for forge-core: what the grammar should learn to read.'));
      p.appendChild(box('forge-review-note-box', 'A note for forge-core', 3)); p.appendChild(btn('forge-review-save', 'Save the note', () => { void save(); }));
    } else if (mode === 'ask') {
      p.appendChild(el('p', 'forge-review-muted', 'One short question, kept with the item.'));
      p.appendChild(box('forge-review-question-box', 'A question for the person', 2)); p.appendChild(btn('forge-review-save', 'Save the question', () => { void save(); }));
    }
    return p;
  }
  function renderStatus(): void { const s = host.querySelector('.forge-review-status'); if (s !== null) s.textContent = status; }

  function render(): void {
    host.textContent = ''; host.classList.add('forge-review-tab');
    host.appendChild(el('h3', 'forge-review-title', 'Unprocessed sentences'));
    if (!ports.enabled()) { host.appendChild(el('p', 'forge-review-muted', 'Keeping unprocessed sentences is off. Turn it on in Settings → Forge Actions (Beta) → Keep unprocessed sentences for review.')); return; }
    const pending = orderedPending(); const item = pending[0] ?? null;
    host.appendChild(el('p', 'forge-review-count forge-review-muted', `${pending.length} waiting`));
    const tools = el('div', 'forge-review-row');
    const mk = (cls: string, label: string, on: () => void, disabled = false): HTMLButtonElement => { const b = doc.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.disabled = disabled; b.addEventListener('click', on); return b; };
    tools.appendChild(mk('forge-review-undo', 'Undo the last resolution (U)', () => { void undo(); }, history.length === 0));
    tools.appendChild(mk('forge-review-export', 'Export the resolved sentences', () => { void (async () => { try { const r = await ports.exportResolved(); status = `Exported ${r.count} resolved sentence${r.count === 1 ? '' : 's'} to ${baseName(r.file)}.`; } catch (e) { status = `Could not export: ${(e as Error)?.message ?? e}`; } renderStatus(); })(); }));
    host.appendChild(tools);
    if (item === null) host.appendChild(el('p', 'forge-review-muted', 'Nothing is waiting.'));
    else {
      const card = el('div', 'forge-review-card');
      card.appendChild(el('div', 'forge-review-sentence', item.sentence));
      card.appendChild(el('p', 'forge-review-meta forge-review-muted', `${item.kind}, ${item['bar-count'] === null ? 'no Score drawn' : `${item['bar-count']} bars`}, ${item.build}, ${item.time}`));
      card.appendChild(el('p', 'forge-review-label', 'The note\'s lines'));
      if (item.lines.length === 0) card.appendChild(el('p', 'forge-review-muted', 'The note had no lines.'));
      else { const ol = el('ol', 'forge-review-lines'); for (const l of item.lines) ol.appendChild(el('li', 'forge-review-line', l)); card.appendChild(ol); }
      const ge = item['grammar-error']; card.appendChild(el('p', 'forge-review-grammar', ge === null ? 'The grammar said: nothing was recorded.' : `The grammar said: ${ge.message} (column ${ge.column})`));
      const sr = item['service-result']; card.appendChild(el('p', 'forge-review-service', `The service: ${sr.result}${sr.text !== '' ? ` — ${sr.text}` : ''}`));
      host.appendChild(card);
      const actions = el('div', 'forge-review-actions forge-review-row');
      for (const a of ACTIONS) actions.appendChild(mk(`forge-review-act forge-review-act-${a.key}`, a.label, () => { void act(a); }));
      host.appendChild(actions); host.appendChild(panel(item));
    }
    const st = el('p', 'forge-review-status forge-review-muted', status); st.setAttribute('role', 'status'); host.appendChild(st);
    renderChecks();          // the Save button's state (and, for the lines panel, its checks and the apply offer); nothing happens when no panel is open
  }

  const onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null; const typing = t !== null && t.tagName === 'TEXTAREA';
    if (typing) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
      else if (e.key === 'Escape') { e.preventDefault(); reset(); render(); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'u') { e.preventDefault(); void undo(); return; }
    const a = ACTIONS.find((x) => x.key === k); if (a !== undefined) { e.preventDefault(); void act(a); }
  };
  host.addEventListener('keydown', onKey);
  return {
    async refresh() { records = ports.enabled() ? await ports.load() : []; render(); },
    destroy() { host.removeEventListener('keydown', onKey); host.textContent = ''; },
  };
}
