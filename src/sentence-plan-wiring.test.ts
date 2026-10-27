// 2026-10-27-1015 — "New phrase from a sentence" on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), the real command, the real dialog, the real server.ts call (only `requestUrl`, the network, is a
// stand-in) and a vault that records what the plugin writes. The decisions are proven in sentence-plan-core.test.ts and the dialog in sentence-plan-dom.test.ts; this proves they are connected, only in a score-first vault, that the token and
// the BYOK key travel only in the request, and that a refusal never writes a note. Time is the shared host clock (test-support/host-workspace.ts), never a sleep; the workspace walk is the shared host-faithful one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { PHRASE_VIEW_TYPE, phraseNoteContent } from './phrase-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const CMD = 'new-phrase-from-sentence';

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null, files: string[] = ['bars/bar_001.md', 'bars/bar_005.md', 'bars/README.md', 'phrases/phrase_001.md']) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const doc = win.document;
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>(files.map((f) => [f, '']));
    const created: Array<[string, string]> = [];
    const requests: any[] = [];
    const net = { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8 }, error: null } as unknown, throws: null as Error | null };
    // only /plan is answered; the plugin's own start-up requests (wheel hydration) get the stand-in's default (nothing) and are not what these tests are about
    (globalThis as any).__shimFns = { requestUrl: async (req: any) => { if (!String(req.url).endsWith('/plan')) return undefined; requests.push(req); if (net.throws) throw net.throws; return { status: net.status, json: net.json }; } };
    const leaves: any[] = [];
    const makeLeaf = () => { const l: any = { states: [] as any[], setViewState: async (s: any) => { l.states.push(s); } }; leaves.push(l); return l; };
    const revealed: any[] = [];
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), configDir: '.obsidian',
        getFiles: () => [...store.keys()].map(tf),
        getMarkdownFiles: () => [...store.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (store.has(p) || p === 'phrases' || p === 'bars' ? tf(p) : null),
        read: async () => '', createFolder: async () => {},
        create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); if (p.startsWith('phrases/')) created.push([p, c]); return tf(p); },   // the plugin writes its own Welcome note in a vault with no forge.toml; only PHRASE notes are what these tests count

      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {},
        onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
        on: () => ({}), getLeavesOfType: () => [], getActiveFile: () => null, getActiveViewOfType: () => null, getMostRecentLeaf: () => null,
        getLeaf: () => makeLeaf(), revealLeaf: (l: any) => { revealed.push(l); }, setActiveLeaf: () => {},
      },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    plugin.target.settings.transpileServiceUrl = 'https://svc.example';
    plugin.target.settings.transpileServiceToken = 'tok-123';
    plugin.target.settings.useOwnAnthropicKey = false;
    plugin.target.settings.ownAnthropicKey = '';
    // the stand-in Modal: open() builds the content element and calls onOpen, close() calls onClose, as Obsidian does
    const modals: any[] = [];
    const proto = real.Modal.prototype;
    const saved = { open: proto.open, close: proto.close };
    proto.open = function () { this.contentEl = doc.createElement('div'); this.contentEl.empty = function () { this.textContent = ''; }; doc.body.appendChild(this.contentEl); modals.push(this); this.onOpen(); };
    proto.close = function () { this.closed = true; this.onClose(); this.contentEl.remove(); };
    const lines: string[] = [];
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (/^\[forge-/.test(String(a[0]))) lines.push(String(a[0])); };
    console.error = () => {};
    const flush = () => clock.advance(5);
    const q = (sel: string) => modals.at(-1)?.contentEl.querySelector(sel) as any;
    const type = (t: string) => { const box = q('textarea'); box.value = t; box.dispatchEvent(new win.Event('input', { bubbles: true })); };
    return {
      plugin, app, store, created, requests, net, modals, lines, revealed, leaves, q, type, flush,
      run: async () => { plugin.commands.get(CMD)!.checkCallback!(false); await flush(); },
      plan: async () => { q('.forge-sentence-plan-plan').click(); await flush(); },
      done: () => { clock.restore(); proto.open = saved.open; proto.close = saved.close; console.info = savedInfo; console.error = savedError; delete (globalThis as any).__shimFns; real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests(); },
    };
  }

  test(`[${edition}] a score-first vault: "New phrase from a sentence" is in the palette, anywhere; running it opens the dialog with the vault's bars (never README) and asks nothing yet`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      assert.equal(w.plugin.commands.get(CMD)?.name, 'New phrase from a sentence');
      assert.equal(w.plugin.commands.get(CMD)!.checkCallback!(true), true);
      await w.run();
      assert.equal(w.modals.length, 1);
      assert.equal(w.q('h3').textContent, 'New phrase from a sentence');
      assert.equal(w.q('.forge-sentence-plan-bars').textContent, 'Bars you can name: bar_001, bar_005');
      assert.deepEqual(w.requests, []);
      assert.deepEqual(w.created, []);
    } finally { w.done(); }
  });

  for (const [label, toml] of [['the tutorial vault (no profile)', TUTORIAL_TOML], ['music-theory (no profile)', MUSIC_THEORY_TOML], ['a vault with no forge.toml', null]] as const) {
    test(`[${edition}] P3 — ${label}: no "New phrase from a sentence" command, nothing asked of the service, nothing written`, async () => {
      const w = await world(toml);
      try {
        assert.equal(w.plugin.commands.has(CMD), false);
        assert.ok(![...w.plugin.commands.values()].some((c) => /from a sentence/i.test(String(c.name))), 'no command is named for it');
        assert.deepEqual(w.requests, []);
        assert.deepEqual(w.created, []);
        assert.deepEqual(w.modals, []);
      } finally { w.done(); }
    });
  }

  test(`[${edition}] Plan then Create, on the real call: POST {url}/plan with the bearer token and {sentence, bars, phrases} (no key), the preview shows the note, Create writes the controls' own note, opens it as the Score, closes the dialog; two evidence lines`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      await w.run();
      w.type('extend bar_005 to 8 bars');
      await w.plan();
      assert.equal(w.requests.length, 1);
      const req = w.requests[0];
      assert.equal(req.url, 'https://svc.example/plan');
      assert.equal(req.method, 'POST');
      assert.equal(req.headers.Authorization, 'Bearer tok-123');
      assert.deepEqual(JSON.parse(req.body), { sentence: 'extend bar_005 to 8 bars', bars: ['bar_001', 'bar_005'], phrases: ['phrase_001'] });
      assert.equal(w.q('.forge-sentence-plan-path').textContent, 'Create will make phrases/phrase_002.md (a extend).');
      assert.equal(w.q('.forge-sentence-plan-recipe').textContent, 'Take [[bar_005]].\nRepeat it for 8 bars with fills.');
      assert.deepEqual(w.created, [], 'Plan writes nothing');
      w.q('.forge-sentence-plan-create').click(); await w.flush();
      assert.equal(w.created.length, 1);
      assert.equal(w.created[0][0], 'phrases/phrase_002.md');
      assert.match(w.created[0][1], /\n# Recipe\n\nTake \[\[bar_005\]\]\.\nRepeat it for 8 bars with fills\.\n/);
      assert.match(w.created[0][1], /extend_rhythm\(data=base, bars=8, style='repeat_with_fills', tempo_change_pct=0\)/);
      assert.ok(w.created[0][1].startsWith(phraseNoteContent('phrase_002', 'bar_005').split('\n').slice(0, 3).join('\n')), 'same frontmatter head as the controls\' note');
      assert.deepEqual(w.leaves.flatMap((l) => l.states), [{ type: PHRASE_VIEW_TYPE, active: true, state: { file: 'phrases/phrase_002.md' } }], 'opened as the Score');
      assert.equal(w.modals[0].closed, true);
      assert.deepEqual(w.lines.filter((l) => l.startsWith('[forge-plan]')), ['[forge-plan] asked "extend bar_005 to 8 bars" -> extend', '[forge-plan] created phrases/phrase_002.md (extend)']);
    } finally { w.done(); }
  });

  test(`[${edition}] BYOK: with the toggle on, the key goes in the request body and nowhere else (not in the headers, the page, the note or the log); with it off, no key`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      w.plugin.target.settings.useOwnAnthropicKey = true; w.plugin.target.settings.ownAnthropicKey = 'sk-ant-secret-9';
      await w.run(); w.type('extend bar_005'); await w.plan();
      const req = w.requests[0];
      assert.equal(JSON.parse(req.body).user_anthropic_key, 'sk-ant-secret-9');
      assert.ok(!JSON.stringify(req.headers).includes('sk-ant-secret-9'));
      w.q('.forge-sentence-plan-create').click(); await w.flush();
      assert.ok(!w.created.map(([, c]) => c).join('').includes('sk-ant-secret-9'));
      assert.ok(!w.lines.join('\n').includes('sk-ant-secret-9'));
      assert.ok(!w.modals[0].contentEl.textContent.includes('sk-ant-secret-9'));
    } finally { w.done(); }
  });

  test(`[${edition}] a refusal never writes a note: no token (nothing is sent), the service down, an old service (404), a bar that is not there, the planner's own "no" - each is one sentence in the dialog and Create stays off`, async () => {
    const cases: Array<[string, (w: Awaited<ReturnType<typeof world>>) => void, RegExp, number]> = [
      ['no token', (w) => { w.plugin.target.settings.transpileServiceToken = ''; }, /^Set your transpile token in Settings → Forge → Transpile token before planning a phrase from a sentence\.$/, 0],
      ['service down', (w) => { w.net.throws = new Error('net::ERR_INTERNET_DISCONNECTED'); }, /^Could not reach the transpile service \(net::ERR_INTERNET_DISCONNECTED\)\. Check your connection and Settings → Forge → Transpile service URL\.$/, 1],
      ['old service', (w) => { w.net.status = 404; w.net.json = { detail: 'Not Found' }; }, /does not offer planning yet/, 1],
      ['unknown bar', (w) => { w.net.json = { ok: true, plan: { kind: 'extend', bar: 'bar_404' } }; }, /^"bar_404" is not a bar in this vault\.$/, 1],
      ['the planner says no', (w) => { w.net.json = { ok: false, parsed_ok: true, plan: null, error: 'I cannot tell which bar you mean.' }; }, /^I cannot tell which bar you mean\.$/, 1],
    ];
    for (const [label, arrange, expected, sent] of cases) {
      const w = await world(SCORE_FIRST_TOML);
      try {
        arrange(w);
        await w.run(); w.type('make it nicer'); await w.plan();
        assert.match(w.q('.forge-sentence-plan-message').textContent, expected, label);
        assert.equal(w.q('.forge-sentence-plan-create').disabled, true, label);
        assert.equal(w.requests.length, sent, label);
        assert.deepEqual(w.created, [], label);
        assert.deepEqual(w.leaves, [], `${label}: no tab opened`);
        assert.equal(w.modals[0].closed, undefined, `${label}: the dialog stays open for another try`);
        assert.match(w.lines.find((l) => l.startsWith('[forge-plan]'))!, /^\[forge-plan\] asked "make it nicer" -> refused: /, label);
      } finally { w.done(); }
    }
  });
}
