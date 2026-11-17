// 2026-11-17-0901 A: read the build stamp out of an installed main.js (never a data.json), check an install against the commit it just built, list the copies on this machine.
// The stamp is the line esbuild leaves for src/build-stamp.generated.ts:   var BUILD_STAMP = { "sha": "be973422e", "dirty": false, "builtAt": "2026-11-17T01:50:08.507Z" };
const STAMP_LINE = /^var BUILD_STAMP = (\{[^\n]*\});?\s*$/m;

/** {sha, dirty, builtAt} from the text of a built main.js, or null when there is no stamp. */
export function parseInstalledStamp(mainJs) {
  const m = STAMP_LINE.exec(String(mainJs ?? ''));
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    if (typeof o.sha !== 'string') return null;
    return { sha: o.sha, dirty: o.dirty === true, builtAt: typeof o.builtAt === 'string' ? o.builtAt : '' };
  } catch { return null; }
}

const same = (a, b) => a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a));

/** Does the installed main.js carry the commit (and tree state) that was just built? `tree` is install-source's "clean" | "dirty". */
export function verifyInstalledStamp(mainJs, builtSha, tree) {
  const stamp = parseInstalledStamp(mainJs);
  if (!stamp) return { ok: false, reason: 'the installed main.js has no build stamp (var BUILD_STAMP line): it was not built by this script' };
  if (!same(stamp.sha, String(builtSha))) return { ok: false, reason: `the installed main.js is stamped ${stamp.sha}, but the commit just built is ${builtSha}: the copy did not take` };
  if (stamp.dirty && tree !== 'dirty') return { ok: false, reason: `the installed main.js is stamped ${stamp.sha}+dirty but the tree built was clean` };
  return { ok: true };
}

const when = (iso) => { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso); return m ? `built ${m[1]} ${m[2]} UTC` : 'built (time unknown)'; };

/** One line per installed copy: "<vault>  <sha>[+dirty]  built … UTC  CURRENT | OLDER than <head>: …". copies = [{vault, stamp|null}]. */
export function describeCopies(copies, headSha) {
  return copies.map(({ vault, stamp }) => {
    if (!stamp) return `${vault}  (no build stamp in main.js)`;
    const id = `${stamp.sha}${stamp.dirty ? '+dirty' : ''}`;
    const verdict = same(stamp.sha, headSha) ? 'CURRENT' : `OLDER than ${headSha}: install it too, or do not open this vault`;
    return `${vault}  ${id}  ${when(stamp.builtAt)}  ${verdict}`;
  });
}
