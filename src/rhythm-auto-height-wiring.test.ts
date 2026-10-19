// Drain 2026-10-18-1800 §2 — auto-height, the HOST wiring: the load message asks for it, the embed and the Beat Box tab route the widget's
// `resize` messages through the controller, and an explicit `height:` turns it off. The views import 'obsidian' and cannot run under
// node:test, so their wiring is pinned (docstring: these pin the MECHANISM) while the decisions live in the pure, tested cores.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { attachAutoHeight } from './widget-auto-height.ts';
import { WIDGET_RESIZE_MESSAGE } from './widget-auto-height-core.ts';
import { widgetScript, skip } from './test-support/rhythm-widget-harness.ts';
import { MSG_LOAD, buildLoadMessage } from './rhythm-edit-core.ts';
import { createRhythmEmbedSession } from './rhythm-embed-core.ts';

const src = (f: string) => fs.readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const DATA = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } } as any;

test('buildLoadMessage: autoHeight rides on the load only when asked for (the old shapes are byte-identical)', () => {
  assert.deepEqual(buildLoadMessage(DATA, 'n'), { type: MSG_LOAD, data: DATA, noteName: 'n' });
  assert.deepEqual(buildLoadMessage(DATA, 'n', 'playground', 'circle'), { type: MSG_LOAD, data: DATA, noteName: 'n', mode: 'playground', view: 'circle' });
  assert.deepEqual(buildLoadMessage(DATA, 'n', 'edit', null, true), { type: MSG_LOAD, data: DATA, noteName: 'n', autoHeight: true });
  assert.deepEqual(buildLoadMessage(DATA, 'n', 'playground', 'circle', true), { type: MSG_LOAD, data: DATA, noteName: 'n', mode: 'playground', view: 'circle', autoHeight: true });
  assert.equal('autoHeight' in buildLoadMessage(DATA, 'n', 'edit', null, false), false);
});

test('embed session: autoHeight is on the load when the block gave no height:, absent when it did', async () => {
  const text = '---\ntype: data\ncontent_type: json\n---\n\n```json\n' + JSON.stringify(DATA) + '\n```\n';
  const run = async (autoHeight?: boolean) => {
    const posted: any[] = [];
    const s = createRhythmEmbedSession({
      noteName: 'n', title: 'n', autoHeight, readNote: async () => text, post: (m) => { posted.push(m); }, openNote: () => {},
      onPlaying: () => {}, showUpdated: () => {}, showError: () => {}, setTimer: () => 0, clearTimer: () => {},
    });
    await s.onWidgetMessage({ type: 'forge-rhythm-ready' });
    return posted[0];
  };
  assert.equal((await run(true)).autoHeight, true);
  assert.equal('autoHeight' in (await run(false)), false);
  assert.equal('autoHeight' in (await run(undefined)), false);
});

test('attachAutoHeight: drives iframe.style.height in px through the controller (grow, shrink, clamp by the pane)', () => {
  const iframe = { style: { height: '400px' } };
  let t = 0; const timers: Array<{ at: number; fn: () => void }> = [];
  const ctl = attachAutoHeight(iframe, {
    initial: 400, paneHeight: () => 600,
    now: () => t, setTimer: (fn, ms) => { timers.push({ at: t + ms, fn }); return timers.length; }, clearTimer: () => {},
  });
  ctl.request(520); assert.equal(iframe.style.height, '520px');
  t = 500; ctl.request(5000); assert.equal(iframe.style.height, '900px', '1.5 x the 600 px pane');
  t = 1000; ctl.request(300); assert.equal(iframe.style.height, '300px');
});

test('mechanism pin (embed): resize messages from OUR iframe go to the controller; explicit height: gets none; disposed on unload', () => {
  const v = src('rhythm-embed-view.ts');
  assert.match(v, /parseWidgetResize\(ev\.data\)/, 'the widget message is parsed with the validated parser');
  assert.match(v, /this\.autoHeight\?\.request\(/);
  assert.match(v, /autoHeight: !options\.heightExplicit/, 'the session is told to ask for it unless the author gave a height:');
  assert.match(v, /options\.heightExplicit \? null : attachAutoHeight\(/, 'an explicit height: attaches NO controller');
  assert.match(v, /this\.autoHeight\?\.dispose\(\)/);
  // the source check comes BEFORE the resize is honoured: only our iframe may resize us
  const onMessage = /private readonly onMessage[\s\S]*?\n  \};/.exec(v)![0];
  assert.ok(onMessage.indexOf('ev.source !== this.iframe.contentWindow') < onMessage.indexOf('parseWidgetResize'), 'source check first');
});

test('mechanism pin (Beat Box tab): the tab asks for auto-height, never shrinks below its pane, and scrolls in the pane not in the iframe', () => {
  const v = src('rhythm-edit-view.ts');
  assert.match(v, /parseWidgetResize\(ev\.data\)/);
  assert.match(v, /this\.autoHeight\?\.request\(/);
  assert.match(v, /buildLoadMessage\(note\.value\.data, this\.file\.basename, 'edit', null, true\)/);
  assert.match(v, /attachAutoHeight\(iframe,/);
  assert.match(v, /iframe\.style\.minHeight = '100%'/, 'a short rhythm still fills the pane (no stripe of a different background)');
  assert.match(v, /this\.autoHeight\?\.dispose\(\)/);
  const css = src('../styles.css');
  assert.match(css, /\.forge-rhythm-edit-view \{[^}]*overflow-y: auto;/, 'the pane scrolls when the content is taller than it');
});

test('the message name is the one the widget posts', { skip }, () => {
  assert.ok(widgetScript.includes(`type: "${WIDGET_RESIZE_MESSAGE}"`));
});
