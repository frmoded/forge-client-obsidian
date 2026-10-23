// drain 2026-10-22-2200 (second round) — one place to say "re-decide the header buttons of every markdown tab NOW". The header syncs (the Beat Box's rhythm buttons in rhythm-edit-view.ts, the
// phrase's "Open as Score" in score-first.ts) used to be driven only by Obsidian's workspace events, and `leaf.setViewState` (which "Open as JSON" uses to turn a phrase's Score into text) is not
// guaranteed to fire an event AFTER the new markdown view has its file. Whoever changes a tab's view or the profile answer asks here; every sync subscribes. Plain and synchronous.

type Listener = (reason: string) => void;
const listeners = new Set<Listener>();

export const headerResync = {
  /** Subscribe a sync; returns the unsubscribe (pass it to `plugin.register`). */
  subscribe(f: Listener): () => void { listeners.add(f); return () => { listeners.delete(f); }; },
  /** Run every subscribed sync. A sync that throws is logged and does not stop the others. */
  request(reason: string): void {
    for (const f of [...listeners]) {
      try { f(reason); } catch (e) { console.error('headerResync: a header sync failed', e); }
    }
  },
};
