// CW-slot-cache-writer-not-found tests.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { locateSnippetFile, type FileLike } from './locate-snippet-file-core.ts';

const files: FileLike[] = [
  { path: 'regression_16th_hihat.md', basename: 'regression_16th_hihat' },
  { path: 'experiments/create_scale_take_2.md', basename: 'create_scale_take_2' },
  { path: 'forge-music/blues/song.md', basename: 'song' },
  { path: 'other/create_scale_take_2.md', basename: 'create_scale_take_2' },
];

describe('locateSnippetFile', () => {
  it('providedFile wins unconditionally when passed', () => {
    // Even if snippetId would match a different file, providedFile is
    // trusted. This is the runSnippet → computeSnippetWithArgs path.
    const forced = files[2]; // forge-music/blues/song
    const got = locateSnippetFile('regression_16th_hihat', files, forced);
    assert.equal(got, forced);
  });

  it('exact-path match on qualified snippetId (library subdir)', () => {
    // snippetIdFromPath returns the qualified path for library subdirs.
    const got = locateSnippetFile('forge-music/blues/song', files);
    assert.ok(got);
    assert.equal(got!.path, 'forge-music/blues/song.md');
  });

  it('exact-path match on vault-root snippetId', () => {
    const got = locateSnippetFile('regression_16th_hihat', files);
    assert.ok(got);
    assert.equal(got!.path, 'regression_16th_hihat.md');
  });

  it('basename fallback for bare snippetId at nested path (the wizard case)', () => {
    // The CW-slot-cache-writer-not-found reproducer:
    // snippetId="create_scale_take_2" (bare — from non-library subdir),
    // note at `experiments/create_scale_take_2.md`. Exact-path miss,
    // basename fallback hits.
    const got = locateSnippetFile('create_scale_take_2', files);
    assert.ok(got);
    // First-match wins on basename collision (experiments/ is listed
    // before other/ in the fixture).
    assert.equal(got!.path, 'experiments/create_scale_take_2.md');
  });

  it('returns null when no file matches', () => {
    const got = locateSnippetFile('does_not_exist', files);
    assert.equal(got, null);
  });

  it('empty file list returns null without provided', () => {
    const got = locateSnippetFile('anything', []);
    assert.equal(got, null);
  });

  it('providedFile trusted even against empty file list', () => {
    const forced = { path: 'some/where.md', basename: 'where' };
    const got = locateSnippetFile('anything', [], forced);
    assert.equal(got, forced);
  });

  it('handles null providedFile the same as undefined', () => {
    const got = locateSnippetFile('regression_16th_hihat', files, null);
    assert.ok(got);
    assert.equal(got!.path, 'regression_16th_hihat.md');
  });
});
