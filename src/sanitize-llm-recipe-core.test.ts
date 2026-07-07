// v0.2.280 CW-2200 sanitizer tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeLlmRecipe } from './sanitize-llm-recipe-core.ts';

test('CW-2200 sanitizer: pure valid Recipe passes through unchanged', () => {
  const input =
    'Let kp = Call [[play_at_offsets]] with instrument=[[kick]], offsets=[0, 2].\n' +
    'Let score = Call [[voices_canonical]] with kp=kp.\n' +
    'Return score.';
  const out = sanitizeLlmRecipe(input);
  assert.equal(out, input);
});

test('CW-2200 sanitizer: strips prose paragraphs, keeps Let/Return', () => {
  const input = [
    'Let me think through this. We need 8 bars of piano solo.',
    'Looking at available chips there is no piano chip.',
    '',
    'Let notes = Call [[major_pentatonic]] with key="C".',
    'The best I can do is use pentatonic scale notes.',
    'Return notes.',
  ].join('\n');
  const out = sanitizeLlmRecipe(input);
  assert.equal(
    out,
    'Let notes = Call [[major_pentatonic]] with key="C".\nReturn notes.',
  );
});

test('CW-2200 sanitizer: strips # comments (which may contain em-dashes)', () => {
  const input = [
    'Let x = Call [[chorus]].',
    '# missing chip: solo_violin — no pitched instrument available',
    'Return x.',
  ].join('\n');
  const out = sanitizeLlmRecipe(input);
  assert.equal(out, 'Let x = Call [[chorus]].\nReturn x.');
});

test('CW-2200 sanitizer: shorthand-call statement preserved', () => {
  const input = 'Let x = Call [[chorus]].\n[[show_score]] x.\nReturn x.';
  const out = sanitizeLlmRecipe(input);
  assert.equal(out, input);
});

test('CW-2200 sanitizer: pure-prose input returns null', () => {
  const input = [
    'Let me think about this.',
    'I cannot fulfill this request with the available chips.',
    'Sorry.',
  ].join('\n');
  const out = sanitizeLlmRecipe(input);
  assert.equal(out, null);
});

test('CW-2200 sanitizer: only comments returns null', () => {
  const input = '# missing chip: foo\n# missing chip: bar';
  const out = sanitizeLlmRecipe(input);
  assert.equal(out, null);
});

test('CW-2200 sanitizer: driver-observed piano prose case', () => {
  // Real LLM output from driver's rehearsal — mix of prose paragraphs,
  // valid Let statements, `# missing chip:` comments with em-dashes.
  const input = [
    'Let me think through this. We need 8 bars of piano solo resembling spring — flowing, melodic.',
    '',
    'Looking at available chips, the music chips are percussion-oriented. Let me use what is available.',
    '',
    'The best I can do with available chips is use `major_pentatonic` to get scale pitches — but there is no piano.',
    '',
    'Let pitches = Call [[major_pentatonic]] with key_or_tonic="C", octave_range=[4, 5].',
    'Let notes = Call [[with_velocity]] with notes=pitches, pattern=[60, 70, 80].',
    '# missing chip: play_melody — a chip that builds a pitched Part from notes',
    '# missing chip: piano_instrument — a factory chip for a music21 Piano instrument',
    'Let score = Call [[sequence_list]] with sections=[notes].',
    '[[show_score]] score.',
    'Return score.',
  ].join('\n');
  const out = sanitizeLlmRecipe(input);
  // Prose + comments stripped; Let/Return/shorthand kept.
  assert.equal(
    out,
    [
      'Let pitches = Call [[major_pentatonic]] with key_or_tonic="C", octave_range=[4, 5].',
      'Let notes = Call [[with_velocity]] with notes=pitches, pattern=[60, 70, 80].',
      'Let score = Call [[sequence_list]] with sections=[notes].',
      '[[show_score]] score.',
      'Return score.',
    ].join('\n'),
  );
  // No em-dash anywhere in the output — em-dashes were only in prose + comments.
  assert.equal(out?.includes('—'), false);
});
