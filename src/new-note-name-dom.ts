// 2026-11-19-0991 - the NAME dialog of "New phrase" / "New arrangement" / "New composition" (plain DOM, no obsidian import; the Modal around it is new-note-name-modal.ts). One text field, focused, filled with the default name and the whole
// text selected (typing replaces it); a muted line under it that says what is wrong with the name or where the note will be made; Create (disabled while the name is not valid) and Cancel.
//   - Enter in the field creates (only when the name is valid); Escape and Cancel close the dialog and make NOTHING: this file never reaches the flow except through `ports.create`, and only from Enter or Create;
//   - the words under the field are one muted line (role=status), never red and never a tooltip: no `title`, no `aria-label` (the field names itself with a hidden label: src/sr-label-core.ts), nothing that reacts to the pointer resting;
//   - a name that is refused AFTER Enter (the flow found the path taken in the meantime) comes back as a sentence in the same line and the dialog stays open, with the field as it was.
import { setSrLabel } from './sr-label-core.ts';
import type { NameCheck } from './new-note-name-core.ts';

export type MadeNote = { ok: true } | { ok: false; message: string };
export interface NewNoteNamePorts {
  /** "New composition": the heading of the dialog. */
  title: string;
  /** "composition": what the hidden name of the field says ("Name of the new composition"). */
  noun: string;
  /** The default name the field starts with (already chosen from the vault as it is now). */
  initial: string;
  /** The verdict on the text, from the vault as it is NOW (asked on every keystroke). */
  check(raw: string): NameCheck;
  /** Enter / Create on a valid name: make the note. The dialog stays open on `ok: false` and shows the message. */
  create(name: string): Promise<MadeNote>;
  /** Close the dialog (idempotent). */
  close(): void;
  /** One evidence line, printed as Info (`[forge-newname] ...`). */
  trace(line: string): void;
}

export function mountNewNoteNameDialog(parent: HTMLElement, ports: NewNoteNamePorts): { dispose(): void; input: HTMLInputElement } {
  const doc = parent.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => { const e = doc.createElement(tag); if (cls !== '') e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const root = el('div', 'forge-newnote-dialog');
  root.appendChild(el('h3', 'forge-newnote-title', ports.title));

  const input = el('input', 'forge-newnote-name');
  input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off'; input.value = ports.initial;
  setSrLabel(input, `Name of the new ${ports.noun}`, { host: root, key: 'name' });
  const message = el('div', 'forge-newnote-message'); message.setAttribute('role', 'status');
  const create = el('button', 'forge-newnote-create mod-cta', 'Create'); create.type = 'button';
  const cancel = el('button', 'forge-newnote-cancel', 'Cancel'); cancel.type = 'button';

  let valid = false;
  let pending = false;
  let shown: NameCheck | null = null;
  const refresh = (): void => {
    shown = ports.check(input.value);
    valid = shown.ok;
    message.textContent = shown.message;
    message.setAttribute('data-valid', valid ? 'true' : 'false');
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    create.disabled = !valid || pending;
  };

  const submit = async (): Promise<void> => {
    if (pending) return;
    refresh();                                                                             // the vault as it is NOW: a note that appeared since the last key refuses the name here, in words
    if (!valid || shown === null || shown.ok === false) return;                            // Enter stays disabled until the name is valid
    const name = shown.name;
    pending = true; create.disabled = true;
    try {
      const made = await ports.create(name);
      if (made.ok === false) { message.textContent = made.message; message.setAttribute('data-valid', 'false'); return; }
      ports.trace(`[forge-newname] ${ports.title}: made ${name}`); ports.close();
    } catch (e) {
      console.error('mountNewNoteNameDialog: create failed', e);
      message.textContent = `${ports.title} failed: ${(e as Error)?.message ?? e}`; message.setAttribute('data-valid', 'false');
    } finally { pending = false; create.disabled = !valid; }
  };

  input.addEventListener('input', () => { refresh(); });
  input.addEventListener('keydown', (ev) => {
    const k = ev as KeyboardEvent;
    if (k.key === 'Enter' && !k.isComposing) { k.preventDefault(); void submit(); }
  });
  root.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Escape') { ev.preventDefault(); ports.close(); }
  });
  create.addEventListener('click', () => { void submit(); });
  cancel.addEventListener('click', () => { ports.close(); });

  root.appendChild(input);
  root.appendChild(message);
  const buttons = el('div', 'forge-newnote-buttons'); buttons.appendChild(create); buttons.appendChild(cancel);
  root.appendChild(buttons);
  parent.appendChild(root);
  refresh();
  const select = (): void => { input.focus(); input.select(); };
  select();
  // an Obsidian Modal may take the focus after onOpen: if the field is not the focused element a moment later, take it back (the text is still the default, so selecting it all is still right)
  const later = setTimeout(() => { if (doc.activeElement !== input && input.value === ports.initial) select(); }, 0);
  return { dispose() { clearTimeout(later); root.remove(); }, input };
}
