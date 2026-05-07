// Pure helpers for reading the body of a hand-authored data snippet.
//
// Mirrors forge.core.executor.extract_body so the plugin can render the
// payload locally without a /compute round-trip. Backend remains the
// source of truth at compute time; this is a read-only preview path.

const BODY_HEADING = /^#{1,6}\s+body\s*$/i;

export function extractDataBody(fileContent: string): string {
  const body = stripFrontmatter(fileContent);
  const lines = body.split('\n');
  const headingIdx = lines.findIndex(l => BODY_HEADING.test(l.trim()));
  const payload = headingIdx >= 0
    ? lines.slice(headingIdx + 1).join('\n')
    : body;
  return stripCodeFence(payload.trim());
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  // Closing fence is a line that's exactly `---`. Find the first such line
  // after the opening one (which is at offset 0).
  const re = /\n---[ \t]*(\r?\n|$)/;
  const m = re.exec(content);
  if (!m || m.index === undefined) return content;
  const after = m.index + m[0].length;
  return content.slice(after);
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const lines = trimmed.split('\n');
  let end = lines.length;
  if (end > 1 && lines[end - 1].trim() === '```') end -= 1;
  return lines.slice(1, end).join('\n');
}
