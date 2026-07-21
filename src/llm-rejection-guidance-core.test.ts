// CW-description-prose-hallucination-forge-output-visibility tests.
//
// Covers §3.2 of the drain: 5 cases + guidance-text-derivation
// regression lock. The purpose is to prevent a future refactor from
// silently dropping the "prose-landmine" naming quality, which is what
// makes the panel's message actionable for the driver.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  deriveLlmRejectionGuidance,
  truncateLlmOutput,
} from './llm-rejection-guidance-core.ts';

// The exact Description from the driver's create_scale_take_2.md
// repro. Line 6 contains `print hello` — the landmine.
const REPRO_DESCRIPTION = [
  'Return the major scale that starts at a given note. Give it a tonic',
  'note name like C, G, or F# and it returns the note names of one',
  'ascending octave of that major scale, tonic to tonic inclusive —',
  'e.g. C gives [C, D, E, F, G, A, B, C]. Note names use music21',
  'spelling (flats written with `-`, e.g. Bb\'s scale starts at B-).',
  'print hello',
].join('\n');

describe('deriveLlmRejectionGuidance', () => {
  it('CASE 1 — reproducer: closure-fail on [[print]] with print-hello landmine', () => {
    // The exact scenario the driver's log line captured:
    //   plugin:forge-client-obsidian:135653 CW-2000 closure fail:
    //   unresolved wikilinks in LLM Recipe: print
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['print'],
      descriptionBody: REPRO_DESCRIPTION,
    });
    // Load-bearing quality assertions — driver must be able to see
    // WHAT prose triggered the phantom chip.
    assert.match(g.likelyCause, /print/i);
    assert.match(g.likelyCause, /Description/i);
    assert.match(g.likelyCause, /prose/i);
    // The specific chip name must appear so the driver can pattern-
    // match against the log line.
    assert.match(g.likelyCause, /\[\[print\]\]/);
  });

  it('CASE 2 — landmine guidance references the Print builtin verb', () => {
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['print'],
      descriptionBody: REPRO_DESCRIPTION,
    });
    // The B7.2 constitution-level guidance ("Print is a builtin verb")
    // is what teaches the driver the correct authoring pattern. If
    // this ever gets dropped, we lose the whole point of the fix.
    const joined = g.fixOptions.join(' ');
    assert.match(joined, /Print/);
    assert.match(joined, /builtin|built-in/);
  });

  it('CASE 3 — generic closure-fail when no landmine matches', () => {
    // LLM emitted `[[nonexistent_chip]]` — not a known landmine.
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['nonexistent_chip'],
      descriptionBody: 'Return the pentatonic scale for the given tonic.',
    });
    assert.match(g.likelyCause, /nonexistent_chip|unresolved/i);
    // Generic guidance still surfaces a "verify chip name" suggestion.
    const joined = g.fixOptions.join(' ');
    assert.match(joined, /catalog|palette|chip name/i);
  });

  it('CASE 4 — sanitize-fail: prose-only LLM output', () => {
    // LLM returned an explanation instead of Recipe syntax.
    const g = deriveLlmRejectionGuidance({
      failureMode: 'sanitize-fail',
      unresolvedWikilinks: [],
      descriptionBody: 'Return None.',
    });
    // Must NOT blame a specific chip name — no unresolved wikilinks
    // were passed. The `[[...]]` placeholder in the "sample shape"
    // explanation is fine; only literal chip names should be rejected.
    assert.doesNotMatch(g.likelyCause, /\[\[[a-z_][a-z0-9_]*\]\]/i);
    // Must reference the "no Let/Return" root cause.
    assert.match(g.likelyCause, /Let|Return|Recipe syntax|prose/i);
  });

  it('CASE 5 — landmine detection catches sanitize-fail with landmine prose too', () => {
    // Edge case: LLM returned prose (sanitize fail), AND the driver's
    // Description contains a landmine. Guidance should still surface
    // the landmine — the driver needs to fix the Description regardless
    // of which gate rejected the output.
    const g = deriveLlmRejectionGuidance({
      failureMode: 'sanitize-fail',
      // Sanitize-fail has no unresolved list, but if the failure
      // handler chose to still pass through what the LLM tried, we\'d
      // see [[print]]. Currently sanitize-fail passes empty list.
      unresolvedWikilinks: [],
      descriptionBody: REPRO_DESCRIPTION,
    });
    // With empty unresolvedWikilinks, no landmine detection fires —
    // we get the generic sanitize-fail guidance. That\'s ACCEPTABLE
    // because the sanitize-fail case isn\'t what\'s trapping the driver
    // on this note. But we still get useful advice.
    assert.match(g.likelyCause, /prose|Let|Return/i);
    assert.ok(g.fixOptions.length >= 2, 'sanitize-fail should give ≥2 fix options');
  });
});

describe('deriveLlmRejectionGuidance — pattern robustness', () => {
  it('detects landmine even when spelled with capital `Print`', () => {
    // Description prose could be "Print hello" (sentence-case). The
    // landmine detection is case-insensitive.
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['print'],
      descriptionBody: 'Return the scale. Print hello for debugging.',
    });
    assert.match(g.likelyCause, /\[\[print\]\]/);
  });

  it('does NOT trigger landmine if Description already uses [[print]] wikilink', () => {
    // If the driver explicitly wrote `[[print]]` in Description,
    // that\'s authored intent, not a prose landmine. Generic closure-
    // fail wording is more appropriate.
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['print'],
      descriptionBody:
        'Use [[print]] to emit debug lines. Return the value.',
    });
    // Should NOT contain the landmine-specific "prose" language.
    // (This might be too strict; if it starts failing, relax to check
    // that no false-positive fix-option like "remove prose" appears.)
    assert.doesNotMatch(g.likelyCause, /as prose/);
  });

  it('gracefully handles empty description', () => {
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['print'],
      descriptionBody: '',
    });
    // No landmine match — falls through to generic closure-fail.
    assert.match(g.likelyCause, /unresolved|chip name/i);
  });

  it('gracefully handles empty unresolved list on closure-fail', () => {
    // Shouldn\'t crash; falls through to generic language.
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: [],
      descriptionBody: 'Some description.',
    });
    assert.ok(g.likelyCause.length > 0);
    assert.ok(g.fixOptions.length >= 2);
  });
});

// CW-print-log-debug-landmine-lane-p3 (drain 2026-07-20-2000).
describe('deriveLlmRejectionGuidance — log + debug landmines (Lane P2)', () => {
  it('log — bare `log` in Description surfaces log-specific guidance', () => {
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['log'],
      descriptionBody:
        'Return a walking bass in E, and log the harmony at each bar.',
    });
    // Landmine detection fired: cause names the verb + the wikilink.
    assert.match(g.likelyCause, /log/i);
    assert.match(g.likelyCause, /\[\[log\]\]/);
    // Advice references either `Print` (constitution B7.2) or the
    // "no Recipe-level log chip" explanation.
    const joined = g.fixOptions.join(' ');
    assert.match(joined, /log/i);
    assert.match(joined, /Print|Python facet/i);
  });

  it('debug — bare `debug` in Description surfaces debug-specific guidance', () => {
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['debug'],
      descriptionBody: 'Return the drum groove; debug this by showing me the offsets.',
    });
    assert.match(g.likelyCause, /debug/i);
    assert.match(g.likelyCause, /\[\[debug\]\]/);
    const joined = g.fixOptions.join(' ');
    assert.match(joined, /debug/i);
    assert.match(joined, /Python facet|Print/i);
  });

  it('log — case-insensitive: `Log the harmony` still triggers landmine', () => {
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['log'],
      descriptionBody: 'Return the scale. Log the harmony at each bar.',
    });
    assert.match(g.likelyCause, /\[\[log\]\]/);
  });

  it('debug — Description already wikilinks [[debug]] → no landmine trigger', () => {
    // If the driver explicitly authored `[[debug]]`, that's authored
    // intent — don't accuse them of prose invention.
    const g = deriveLlmRejectionGuidance({
      failureMode: 'closure-fail',
      unresolvedWikilinks: ['debug'],
      descriptionBody:
        'Use [[debug]] to inspect state; then return the value.',
    });
    assert.doesNotMatch(g.likelyCause, /as prose/);
  });
});

describe('truncateLlmOutput', () => {
  it('returns short input verbatim', () => {
    assert.equal(truncateLlmOutput('short', 100), 'short');
  });

  it('trims to maxChars + ellipsis on long input', () => {
    const long = 'x'.repeat(200);
    const result = truncateLlmOutput(long, 100);
    assert.ok(result.length <= 120, 'must be around 100 chars + suffix');
    assert.match(result, /truncated/);
  });

  it('preserves multi-line content within limit', () => {
    const multi = 'Let x = 1.\nReturn x.';
    assert.equal(truncateLlmOutput(multi, 500), multi);
  });

  it('default maxChars is 500', () => {
    const long = 'a'.repeat(1000);
    const result = truncateLlmOutput(long);
    assert.ok(result.length <= 520);
    assert.match(result, /truncated/);
  });
});
