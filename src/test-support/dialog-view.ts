// 2026-11-13-1214 - what the dialog (chat-panel-dom.ts) shows, read from a tab's element: the tests that used to read a box-origin outcome from the strip at the top read it here (the strip keeps the text view's and hand edits').
export interface Said { id: number; kind: string; text: string }
export const dialogEntries = (el: HTMLElement): Said[] => [...el.querySelectorAll('.forge-chat-msg')].map((m) => ({ id: Number(m.getAttribute('data-id')), kind: m.getAttribute('data-kind') ?? '', text: m.querySelector('.forge-chat-text')?.textContent ?? '' }));
/** The text of the newest message that is not the person's own ('' = none): what "the strip said" meant for a box sentence. */
export const dialogLast = (el: HTMLElement): string => { const l = dialogEntries(el).filter((e) => e.kind !== 'you' && e.kind !== 'asking'); return l.length ? l[l.length - 1]!.text : ''; };
/** The enabled buttons of the dialog's open suggestion, named as the strip's were ('apply-preview', 'cancel-preview'). */
export const dialogButtons = (el: HTMLElement): string[] => [...el.querySelectorAll('.forge-chat-action')].filter((b: any) => !b.disabled).map((b) => (b.getAttribute('data-choice') === 'apply' ? 'apply-preview' : 'cancel-preview'));
export const dialogClick = (el: HTMLElement, action: 'apply-preview' | 'cancel-preview'): void => {
  const b = [...el.querySelectorAll(`.forge-chat-action[data-choice="${action === 'apply-preview' ? 'apply' : 'cancel'}"]`)].filter((x: any) => !x.disabled).pop() as HTMLElement | undefined;
  if (!b) throw new Error(`no enabled ${action} button in the dialog`);
  b.click();
};
