// 2026-11-03-1155-9 (PRIORITY): the ONE place the plugin makes an Obsidian toast. It writes the `[forge-notice]` evidence line first (logged-notice-core.ts), then shows the toast as always. A guard test fails when any other file calls `new Notice(`.
import { Notice } from 'obsidian';
import { noticeLine } from './logged-notice-core.ts';

export function loggedNotice(message: string | DocumentFragment, timeout?: number): Notice {
  console.info(noticeLine(typeof message === 'string' ? message : message.textContent ?? ''));
  return new Notice(message, timeout);
}
