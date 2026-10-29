// 2026-10-27-1030 (M14 slice 1): the notebook on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), the real phrase view factory, the real vault ports of score-first.ts over a stand-in
// vault that records what the plugin does. Proves: only a score-first vault has the phrase view (and so a notebook); the view is given the notebook; Run writes the phrase and the cell through app.vault.create and opens the phrase;
// Delete cell closes the tabs that show the derived phrase BEFORE trashing it, checks it is gone, and never touches the source. Time is the shared host clock; the workspace walk is the shared host-faithful one.
// 2026-10-27-0720 (slice 2): the typed request on the same real wiring: the real server.ts call (only `requestUrl`, the network, is a stand-in), the token and the BYOK key only in the request, an old service told apart by its /health version.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { PHRASE_VIEW_TYPE, noteContentFor } from './phrase-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const BAR = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const files = new Map<string, string>([['bars/bar_005.md', BAR], ['phrases/phrase_006.md', noteContentFor('phrase_006', { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 })], ['notebook/README.md', 'Notebook.']]);
    const log = { trashed: [] as string[], removed: [] as string[], detached: [] as string[], states: [] as any[], order: [] as string[] };
    // only /plan and /health are answered; the plugin's own start-up requests (wheel hydration) get the stand-in's default (nothing)
    const requests: any[] = [];
    const net = { plan: { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'transform', op: 'thin_out', amount: 0.5, keep: 'downbeat' }, error: null } as unknown }, health: { status: 200, json: { status: 'ok', version: '0.2.41' } as unknown }, throws: null as Error | null, healthThrows: null as Error | null };
    (globalThis as any).__shimFns = { requestUrl: async (req: any) => {
      const u = String(req.url);
      if (u.endsWith('/plan')) { requests.push(req); if (net.throws) throw net.throws; return net.plan; }
      if (u.endsWith('/health')) { requests.push(req); if (net.healthThrows) throw net.healthThrows; return net.health; }
      return undefined;
    } };
    const leaves: any[] = [];
    const makeLeaf = (file?: string) => {
      const l: any = { view: file ? { file: tf(file), getViewType: () => PHRASE_VIEW_TYPE } : { getViewType: () => 'empty' }, states: [] as any[], setViewState: async (s: any) => { l.states.push(s); log.states.push(s); if (s.state?.file) { const f = s.state.file; l.view = { file: tf(f), getViewType: () => s.type }; l.detach = () => { log.detached.push(f); log.order.push(`detach ${f}`); leaves.splice(leaves.indexOf(l), 1); }; } }, detach: () => { log.detached.push(file ?? ''); log.order.push(`detach ${file}`); leaves.splice(leaves.indexOf(l), 1); } };
      leaves.push(l);
      return l;
    };
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => (p === 'forge.toml' ? toml !== null : files.has(p)), read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : ''), remove: async (p: string) => { files.delete(p); log.removed.push(p); } },
        on: () => ({}), configDir: '.obsidian',
        getFiles: () => [...files.keys()].map(tf), getMarkdownFiles: () => [...files.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (files.has(p) || ['phrases', 'bars', 'notebook'].includes(p) ? tf(p) : null),
        read: async (f: any) => files.get(f.path) ?? '', createFolder: async () => {},
        create: async (p: string, c: string) => { if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); return tf(p); },
        process: async (f: any, fn: (t: string) => string) => { files.set(f.path, fn(files.get(f.path) ?? '')); },
        trash: async (f: any) => { log.order.push(`trash ${f.path}`); log.trashed.push(f.path); files.delete(f.path); },
      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {},
        onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
        on: () => ({}), getLeavesOfType: (t: string) => leaves.filter((l) => l.view.getViewType() === t), getActiveFile: () => null, getActiveViewOfType: () => null, getMostRecentLeaf: () => null,
        getLeaf: () => makeLeaf(), revealLeaf: () => {}, setActiveLeaf: () => {},
      },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    plugin.target.settings.transpileServiceUrl = 'https://svc.example';
    plugin.target.settings.transpileServiceToken = 'tok-123';
    plugin.target.settings.useOwnAnthropicKey = false;
    plugin.target.settings.ownAnthropicKey = '';
    (Object.prototype as any).addAction = function () { return { remove() {} }; };       // the stand-in view base has no addAction
    const lines: string[] = [];
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (/^\[forge-/.test(String(a[0]))) lines.push(String(a[0])); };
    console.error = () => {};
    return { plugin, files, log, lines, leaves, makeLeaf, tf, requests, net, done: () => { delete (Object.prototype as any).addAction; delete (globalThis as any).__shimFns; clock.restore(); console.info = savedInfo; console.error = savedError; real.messageDelivery.setScoreFirst(false); real.messageDelivery.resetForTests(); } };
  }

  test(`[${edition}] P3: a vault that is not score-first has no phrase view, so no notebook; a score-first vault has the view, and the view is given the notebook`, async () => {
    const off = await world(TUTORIAL_TOML);
    try { assert.equal(off.plugin.views.has(PHRASE_VIEW_TYPE), false); } finally { off.done(); }
    const on = await world(SCORE_FIRST_TOML);
    try {
      assert.equal(on.plugin.views.has(PHRASE_VIEW_TYPE), true);
      const view: any = on.plugin.views.get(PHRASE_VIEW_TYPE)!(on.makeLeaf());
      assert.equal(typeof view.notebookFor, 'function');
      const ports = view.notebookFor(on.tf('phrases/phrase_006.md'));
      assert.equal(typeof ports.notebook.run, 'function');
      assert.deepEqual(await ports.notebook.cells(), { cells: [], problems: [] }, 'only the README: no cells');
    } finally { on.done(); }
  });

  test(`[${edition}] Run on the real vault ports: the transform phrase and the cell are created with app.vault.create, the phrase is opened as a Score, the evidence line is said; the source is not touched`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      const sourceBefore = w.files.get('phrases/phrase_006.md');
      const res = await notebook.run({ bars: [3, 4, 5], row: 'kick' }, 'thin_out', 0.5);
      assert.deepEqual(res, { ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_007.md' });
      assert.ok(w.files.has('phrases/phrase_007.md') && w.files.has('notebook/cell_001.md'));
      assert.deepEqual(w.leaves.flatMap((l: any) => l.states), [{ type: PHRASE_VIEW_TYPE, active: true, state: { file: 'phrases/phrase_007.md' } }], 'opened as the Score');
      assert.equal(w.files.get('phrases/phrase_006.md'), sourceBefore);
      assert.ok(w.lines.includes('[forge-notebook] ran cell_001: bars 3 to 5, kick row -> thin_out -> phrases/phrase_007.md'));
      const listed = await notebook.cells();
      assert.deepEqual(listed.cells.map((c: any) => [c.id, c.role]), [['cell_001', 'source']]);
    } finally { w.done(); }
  });

  test(`[${edition}] Delete cell on the real vault ports: the tab showing the derived phrase is closed BEFORE the note is trashed, the trash is checked, the cell goes after the phrase, the source stays`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      await notebook.run({ bars: [3], row: null }, 'double_up', 16);
      w.log.order.length = 0;
      const cell = (await notebook.cells()).cells[0];
      assert.deepEqual(await notebook.deleteCell(cell), { ok: true });
      assert.deepEqual(w.log.order, ['detach phrases/phrase_007.md', 'trash phrases/phrase_007.md', 'trash notebook/cell_001.md'], 'tabs closed first, then the phrase, then the cell');
      assert.ok(!w.files.has('phrases/phrase_007.md') && !w.files.has('notebook/cell_001.md') && w.files.has('phrases/phrase_006.md') && w.files.has('notebook/README.md'));
      assert.ok(w.lines.includes('[forge-notebook] deleted cell_001 (phrases/phrase_007.md)'));
    } finally { w.done(); }
  });

  test(`[${edition}] a note the trash silently leaves behind (L12) is removed through the adapter; one that is still there after that is a refusal naming it`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      await notebook.run({ bars: [3], row: null }, 'thin_out', 0.5);
      const app = (w.plugin.target as any).app;
      const realTrash = app.vault.trash;
      app.vault.trash = async () => {};                       // Obsidian's trash that does nothing while a view holds the note
      const cell = (await notebook.cells()).cells[0];
      assert.deepEqual(await notebook.deleteCell(cell), { ok: true });
      assert.deepEqual(w.log.removed, ['phrases/phrase_007.md', 'notebook/cell_001.md'], 'the adapter removed them');
      app.vault.trash = realTrash;
      await notebook.run({ bars: [1], row: null }, 'thin_out', 0.5);
      app.vault.trash = async () => {}; app.vault.adapter.remove = async () => {};
      const stuck = (await notebook.cells()).cells[0];
      const res = await notebook.deleteCell(stuck);
      assert.equal(res.ok, false);
      assert.match(res.message, /Could not delete cell_001: phrases\/phrase_007\.md is still there/);
    } finally { w.done(); }
  });

  // ---- slice 2: the typed request on the real wiring -------------------------------------------------------------------------------------------------------------------------------------

  const SENTENCE = 'make this half as busy, keep the downbeat';
  const SEL = { bars: [3, 4, 5], row: 'kick' };

  test(`[${edition}] a typed request on the real call: POST {url}/plan with the bearer token and {sentence, bars, phrases, selection} (no key), the phrase and the cell are made by the real vault ports, the phrase opens, the cell's Description is the sentence; two evidence lines`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      const sourceBefore = w.files.get('phrases/phrase_006.md');
      const res = await notebook.runRequest(SEL, SENTENCE);
      assert.deepEqual(res, { ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_007.md' });
      assert.equal(w.requests.length, 1);
      const req = w.requests[0];
      assert.equal(req.url, 'https://svc.example/plan');
      assert.equal(req.method, 'POST');
      assert.equal(req.headers.Authorization, 'Bearer tok-123');
      assert.deepEqual(JSON.parse(req.body), { sentence: SENTENCE, bars: ['bar_005'], phrases: ['phrase_006'], selection: { phrase: 'phrases/phrase_006', first: 3, last: 5, row: 'kick' } });
      assert.match(w.files.get('phrases/phrase_007.md')!, /"op": "thin_out", "first": 3, "last": 5, "row": "kick", "amount": 0.5/);
      assert.match(w.files.get('notebook/cell_001.md')!, /\n# Description\n\n“make this half as busy, keep the downbeat”\n/);
      assert.deepEqual(w.leaves.flatMap((l: any) => l.states), [{ type: PHRASE_VIEW_TYPE, active: true, state: { file: 'phrases/phrase_007.md' } }], 'opened as a Score');
      assert.equal(w.files.get('phrases/phrase_006.md'), sourceBefore, 'the source is untouched');
      assert.deepEqual(w.lines.filter((l: string) => l.startsWith('[forge-notebook]')), [`[forge-notebook] asked "${SENTENCE}" -> thin_out`, `[forge-notebook] ran cell_001: bars 3 to 5, kick row -> thin_out -> phrases/phrase_007.md`]);
      const cell = (await notebook.cells()).cells[0];
      assert.equal(cell.request, SENTENCE);
      assert.deepEqual(await notebook.deleteCell(cell), { ok: true });
      assert.ok(!w.files.has('phrases/phrase_007.md') && !w.files.has('notebook/cell_001.md') && w.files.has('phrases/phrase_006.md'), 'Delete cell undoes it');
      assert.equal(w.requests.length, 1, 'only the one question was ever asked');
    } finally { w.done(); }
  });

  test(`[${edition}] BYOK on the notebook: with the toggle on, the key goes in the request body and nowhere else (not the headers, the notes, the log); with it off, no key`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      w.plugin.target.settings.useOwnAnthropicKey = true; w.plugin.target.settings.ownAnthropicKey = 'sk-ant-secret-9';
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      assert.ok((await notebook.runRequest(SEL, SENTENCE)).ok);
      const req = w.requests[0];
      assert.equal(JSON.parse(req.body).user_anthropic_key, 'sk-ant-secret-9');
      assert.ok(!JSON.stringify(req.headers).includes('sk-ant-secret-9'));
      assert.ok(![...w.files.values()].join('\n').includes('sk-ant-secret-9'));
      assert.ok(!w.lines.join('\n').includes('sk-ant-secret-9'));
    } finally { w.done(); }
    const off = await world(SCORE_FIRST_TOML);
    try {
      const view: any = off.plugin.views.get(PHRASE_VIEW_TYPE)!(off.makeLeaf());
      const { notebook } = view.notebookFor(off.tf('phrases/phrase_006.md'));
      await notebook.runRequest(SEL, SENTENCE);
      assert.equal('user_anthropic_key' in JSON.parse(off.requests[0].body), false);
    } finally { off.done(); }
  });

  test(`[${edition}] a refusal writes nothing: no token (nothing is sent), the service down, an old service (404), "make it jazzier" - each is one sentence and no phrase, no cell, no tab`, async () => {
    const jazzy = { status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'I can thin the hits out or double them up; I cannot make a bar jazzier.' } };
    const cases: Array<[string, (w: Awaited<ReturnType<typeof world>>) => void, RegExp, number]> = [
      ['no token', (w) => { w.plugin.target.settings.transpileServiceToken = ''; }, /^Set your transpile token in Settings → Forge → Transpile token before planning a phrase from a sentence\.$/, 0],
      ['service down', (w) => { w.net.throws = new Error('net::ERR_INTERNET_DISCONNECTED'); }, /^Could not reach the transpile service \(net::ERR_INTERNET_DISCONNECTED\)\./, 1],
      ['old service (404)', (w) => { w.net.plan = { status: 404, json: { detail: 'Not Found' } }; }, /does not offer planning yet \(it needs version 0\.2\.41 or newer\)/, 1],
      ['make it jazzier', (w) => { w.net.plan = jazzy; }, /^I can thin the hits out or double them up; I cannot make a bar jazzier\.$/, 2],      // 2 = /plan, then /health (an answer an old service could give too) says 0.2.41: the reason stands
    ];
    for (const [label, arrange, expected, sent] of cases) {
      const w = await world(SCORE_FIRST_TOML);
      try {
        arrange(w);
        const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
        const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
        const before = [...w.files.keys()].sort().join('|');
        const res = await notebook.runRequest(SEL, label === 'make it jazzier' ? 'make it jazzier' : SENTENCE);
        assert.equal(res.ok, false, label);
        assert.match(res.message, expected, label);
        assert.equal(w.requests.length, sent, label);
        assert.equal([...w.files.keys()].sort().join('|'), before, `${label}: nothing written`);
        assert.deepEqual(w.leaves.flatMap((l: any) => l.states), [], `${label}: no tab opened`);
        assert.match(w.lines.find((l: string) => l.startsWith('[forge-notebook] asked'))!, /^\[forge-notebook\] asked ".*" -> refused: /, label);
      } finally { w.done(); }
    }
  });

  test(`[${edition}] before the deploy: a service on 0.2.40 ignores the selection and answers a new phrase; /health (unauthenticated, GET) says 0.2.40 and the person reads "needs version 0.2.41 or newer", nothing is written`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      w.net.plan = { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8 }, error: null } };
      w.net.health = { status: 200, json: { status: 'ok', version: '0.2.40' } };
      const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
      const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
      const before = [...w.files.keys()].sort().join('|');
      const res = await notebook.runRequest(SEL, SENTENCE);
      assert.equal(res.ok, false);
      assert.match(res.message, /^This transpile service does not offer planning yet \(it needs version 0\.2\.41 or newer\)\. The person who runs it has to update it\.$/);
      assert.deepEqual(w.requests.map((r: any) => `${r.method} ${r.url}`), ['POST https://svc.example/plan', 'GET https://svc.example/health']);
      assert.equal(w.requests[1].headers?.Authorization, undefined, '/health carries no token');
      assert.equal([...w.files.keys()].sort().join('|'), before);
    } finally { w.done(); }
  });

  test(`[${edition}] 2026-10-29-0800: a /plan answer that carries the service version is the only request sent (no GET /health), the person still reads the service's reason; the same answer without it asks /health as before`, async () => {
    const answer = (extra: Record<string, unknown>) => ({ status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'I cannot make a bar jazzier.', ...extra } });
    for (const [label, extra, urls] of [
      ['carries 0.2.42', { version: '0.2.42' }, ['https://svc.example/plan']],
      ['carries no version (an older service)', {}, ['https://svc.example/plan', 'https://svc.example/health']],
    ] as Array<[string, Record<string, unknown>, string[]]>) {
      const w = await world(SCORE_FIRST_TOML);
      try {
        w.net.plan = answer(extra);
        w.net.health = { status: 200, json: { status: 'ok', version: '0.2.42' } };
        const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
        const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
        const res = await notebook.runRequest(SEL, 'make it jazzier');
        assert.deepEqual(res, { ok: false, message: 'I cannot make a bar jazzier.' }, label);
        assert.deepEqual(w.requests.map((r: any) => r.url), urls, label);
      } finally { w.done(); }
    }
  });

  test(`[${edition}] a version that cannot be read is unknown, never "old": a /health that fails, is not 200, has no version, a version that is not text or an empty one - the person still reads the service\'s answer, not "needs 0.2.41"`, async () => {
    const unreadable: Array<[string, (w: Awaited<ReturnType<typeof world>>) => void]> = [
      ['health throws', (w) => { w.net.healthThrows = new Error('offline'); }],
      ['health 500', (w) => { w.net.health = { status: 500, json: { version: '0.2.40' } }; }],
      ['health 404 (a gateway that has no /health)', (w) => { w.net.health = { status: 404, json: { version: '0.2.40' } }; }],
      ['no version', (w) => { w.net.health = { status: 200, json: { status: 'ok' } }; }],
      ['version is a number', (w) => { w.net.health = { status: 200, json: { version: 40 } }; }],
      ['empty version', (w) => { w.net.health = { status: 200, json: { version: '' } }; }],
      ['body is not json', (w) => { w.net.health = { status: 200, json: null }; }],
    ];
    for (const [label, arrange] of unreadable) {
      const w = await world(SCORE_FIRST_TOML);
      try {
        w.net.plan = { status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'I cannot make a bar jazzier.' } };
        arrange(w);
        const view: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!(w.makeLeaf());
        const { notebook } = view.notebookFor(w.tf('phrases/phrase_006.md'));
        const res = await notebook.runRequest(SEL, 'make it jazzier');
        assert.deepEqual(res, { ok: false, message: 'I cannot make a bar jazzier.' }, label);
        assert.deepEqual(w.requests.map((r: any) => r.url), ['https://svc.example/plan', 'https://svc.example/health'], label);
      } finally { w.done(); }
    }
  });

  test(`[${edition}] P3: a vault that is not score-first has no phrase view, so no notebook and no request box: the service is never asked, nothing is written`, async () => {
    const w = await world(TUTORIAL_TOML);
    try {
      assert.equal(w.plugin.views.has(PHRASE_VIEW_TYPE), false);
      assert.deepEqual(w.requests, []);
      assert.ok(![...w.files.keys()].some((p) => p.startsWith('notebook/cell_')));
    } finally { w.done(); }
  });
}
