// 2026-11-23-1022z - the sentence a panel says when a score cannot be drawn: the reason, in one line (the console has the whole error). Pure.
const MAX_REASON = 200;
export function scoreFailureText(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const line = raw.split('\n')[0].trim().replace(/\.+$/, '');
  const reason = line === '' ? 'the score library gave no reason (see the console)' : line.length > MAX_REASON ? `${line.slice(0, MAX_REASON)}...` : line;
  return `This score could not be drawn: ${reason}.`;
}
