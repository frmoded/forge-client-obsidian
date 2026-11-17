// 2026-11-13-1214 - what the dialog (chat-panel-dom.ts) shows, read from a tab's element: the tests that used to read a box-origin outcome from the strip at the top read it here (the strip keeps the text view's and hand edits').
export interface Said { id: number; kind: string; text: string }
export const dialogEntries = (el: HTMLElement): Said[] => [...el.querySelectorAll('.forge-chat-msg')].map((m) => ({ id: Number(m.getAttribute('data-id')), kind: m.getAttribute('data-kind') ?? '', text: m.querySelector('.forge-chat-text')?.textContent ?? '' }));
/** The text of the newest message that is not the person's own ('' = none): what "the strip said" meant for a box sentence. */
export const dialogLast = (el: HTMLElement): string => { const l = dialogEntries(el).filter((e) => e.kind !== 'you' && e.kind !== 'asking'); return l.length ? l[l.length - 1]!.text : ''; };
/** 2026-11-17-2001: the dialog's open preview, named as the buttons were ('apply-preview', 'cancel-preview'): there are no buttons any more (Enter applies, Esc discards), but a LIVE preview is still "what can be applied or cancelled now". [] = none live. */
export const dialogButtons = (el: HTMLElement): string[] => {
  const chosen = [...el.querySelectorAll('.forge-chat-msg[data-kind="suggestion"] .forge-chat-chosen')];
  return chosen.length > 0 && chosen[chosen.length - 1]!.textContent === 'Press Enter to apply, Esc to discard' ? ['apply-preview', 'cancel-preview'] : [];
};
/** The keys that do what the buttons did: Enter applies the live preview, Esc discards it. */
export const dialogClick = (el: HTMLElement, action: 'apply-preview' | 'cancel-preview'): void => {
  if (dialogButtons(el).length === 0) throw new Error(`no live preview in the dialog to ${action}`);
  const field = el.querySelector('.forge-prompt-box-text') as HTMLElement; const W = el.ownerDocument.defaultView as any;
  field.dispatchEvent(new W.KeyboardEvent('keydown', { key: action === 'apply-preview' ? 'Enter' : 'Escape', bubbles: true, cancelable: true }));
};
