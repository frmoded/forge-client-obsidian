// score_first M10 slice 1 (drain 2026-10-29-0820) - the dialog of "New kit" (plain DOM, no obsidian import; the Modal around it is a few lines in kits-arrangements.ts): two presets that fill the name and the channels, a name box, one box per channel of
// the engine's vocabulary, Create and Cancel. Refusals come back from the flow as one sentence and are shown, the dialog stays open; success closes it. The channel boxes are the vocabulary, not a list of this file (kit-core.ts).
import { RHYTHM_CHANNELS } from './rhythm-edit-core.ts';
import { KIT_NAME_RULE, KIT_PRESETS, channelWords } from './kit-core.ts';
import type { CreateResult } from './kit-arrangement-flow-core.ts';

export interface KitDialogPorts {
  create(choice: { name: string; channels: string[] }): Promise<CreateResult>;
  close(): void;
}

export function mountKitDialog(parent: HTMLElement, ports: KitDialogPorts): { dispose(): void } {
  const doc = parent.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => { const e = doc.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const root = el('div', 'forge-kit-dialog');
  root.appendChild(el('h3', '', 'New kit'));
  root.appendChild(el('p', 'forge-kit-hint', 'A kit says which rows of a bar a track may play. Start from a preset, or name it and tick the channels.'));

  const name = el('input', 'forge-kit-name');
  name.type = 'text'; name.maxLength = 40; name.setAttribute('aria-label', 'Kit name'); name.setAttribute('placeholder', 'for example: rock');
  const boxes = new Map<string, HTMLInputElement>();
  const channels = el('div', 'forge-kit-channels');
  for (const c of RHYTHM_CHANNELS) {
    const label = el('label', 'forge-kit-channel');
    const box = el('input', 'forge-kit-channel-box');
    box.type = 'checkbox'; box.setAttribute('data-channel', c);
    boxes.set(c, box);
    label.appendChild(box); label.appendChild(doc.createTextNode(` ${channelWords(c)}`));
    channels.appendChild(label);
  }
  const presets = el('div', 'forge-kit-presets');
  for (const p of KIT_PRESETS) {
    const b = el('button', 'forge-kit-preset', `${p.name[0].toUpperCase()}${p.name.slice(1)} kit`);
    b.type = 'button'; b.setAttribute('data-preset', p.name);
    b.addEventListener('click', () => { name.value = p.name; for (const [c, box] of boxes) box.checked = p.channels.includes(c as never); message.textContent = ''; });
    presets.appendChild(b);
  }
  const message = el('div', 'forge-kit-message'); message.setAttribute('role', 'status');
  const create = el('button', 'forge-kit-create', 'Create'); create.type = 'button';
  const cancel = el('button', 'forge-kit-cancel', 'Cancel'); cancel.type = 'button';

  let pending = false;
  const submit = async (): Promise<void> => {
    if (pending) return;
    pending = true; create.disabled = true; message.textContent = '';
    try {
      const r = await ports.create({ name: name.value, channels: [...boxes].filter(([, b]) => b.checked).map(([c]) => c) });
      if (r.ok === false) message.textContent = r.message; else ports.close();
    } catch (e) {
      message.textContent = `New kit failed: ${(e as Error)?.message ?? e}`;
    } finally { pending = false; create.disabled = false; }
  };
  create.addEventListener('click', () => { void submit(); });
  cancel.addEventListener('click', () => { ports.close(); });
  name.addEventListener('keydown', (ev) => { if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); void submit(); } });

  root.appendChild(presets);
  const nameLabel = el('label', 'forge-kit-name-label', 'Name '); nameLabel.appendChild(name);
  root.appendChild(nameLabel);
  root.appendChild(el('div', 'forge-kit-rule', KIT_NAME_RULE));
  root.appendChild(channels);
  root.appendChild(message);
  const buttons = el('div', 'forge-kit-buttons'); buttons.appendChild(create); buttons.appendChild(cancel);
  root.appendChild(buttons);
  parent.appendChild(root);
  return { dispose() { root.remove(); } };
}
