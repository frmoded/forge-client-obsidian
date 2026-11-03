// 2026-11-03-1155-9 (PRIORITY): a toast vanishes before it can be copied, so every Notice the plugin shows is ALSO written to the console as one `[forge-notice]` evidence line (Cmd+Opt+I, filter `forge-notice`). Pure: the line only; the Notice is logged-notice.ts's.
/** One line: the toast text with its line breaks folded, after the evidence tag. */
export const noticeLine = (text: string): string => `[forge-notice] ${String(text).replace(/\s*\n\s*/g, ' ').trim()}`;
