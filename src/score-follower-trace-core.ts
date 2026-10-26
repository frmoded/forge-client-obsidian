// 2026-10-26-1100 — evidence for the Score's playback follower (the sounding note turns red and moves). CCQA smoke 5 saw it work on an extend phrase and not on a 5-bar morph, in the real Obsidian; headless Chrome
// (simulated clock, every layer the same code) lights the morph's notes too, so the cause is only visible where the real player runs. These two lines make the next smoke carry the facts: one when the follower is attached
// (how many notes the time map knows and how many of their ids really exist in the Score on screen) and one at the first Play (what the player's clock says and how many of the notes it expects NOW are on screen).
// Pure formatters: the renderer prints them.
export interface FollowerBucket { ms: number; ids: readonly string[] }

export function followerEvidence(input: { buckets: readonly FollowerBucket[]; found(id: string): boolean; start?: { currentSec: number; leadInSecs: number } }): string {
  const { buckets, found, start } = input;
  if (start === undefined) {
    if (buckets.length === 0) return '[forge-score] follower attached: no time points: nothing will light while it plays';
    const all = buckets.flatMap((b) => [...b.ids]);
    const ms = buckets.map((b) => b.ms);
    return `[forge-score] follower attached: ${buckets.length} time points, ${all.filter(found).length} of ${all.length} note ids are in this Score (first at ${Math.round(Math.min(...ms))} ms, last at ${Math.round(Math.max(...ms))} ms)`;
  }
  const rel = start.currentSec - start.leadInSecs;
  const where = rel < 0 ? 'still in the lead-in' : `${rel.toFixed(2)} s into the Score`;
  let active: readonly string[] = [];
  if (rel >= 0) for (const b of buckets) { if (b.ms > rel * 1000) break; active = b.ids; }
  return `[forge-score] follower started: player at ${start.currentSec.toFixed(2)} s (${where}), expecting ${active.length} note ids now, ${active.filter(found).length} of them in this Score`;
}
