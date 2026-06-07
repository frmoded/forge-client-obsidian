import test from 'node:test';
import assert from 'node:assert/strict';

import { syncFileToMemfsAfterWrite } from './post-write-memfs-sync-core.ts';
import type {
  FileReader,
  MemfsSyncer,
} from './post-write-memfs-sync-core.ts';

// v0.2.71 hotfix — failing-first tests for the post-write MEMFS sync
// helper. Establish the production contract: reader is called, then
// syncer is called with the fresh content + the same filePath, and
// errors propagate in either direction.

function makeReader(content: string): FileReader {
  return { readPath: async () => content };
}

function makeFailingReader(err: Error): FileReader {
  return { readPath: async () => { throw err; } };
}

interface SyncerCall { relPath: string; content: string; }

function makeRecordingSyncer(): { syncer: MemfsSyncer; calls: SyncerCall[] } {
  const calls: SyncerCall[] = [];
  const syncer: MemfsSyncer = {
    syncFileToMemfs: async (relPath, content) => {
      calls.push({ relPath, content });
    },
  };
  return { syncer, calls };
}

function makeFailingSyncer(err: Error): MemfsSyncer {
  return { syncFileToMemfs: async () => { throw err; } };
}

test('syncFileToMemfsAfterWrite: happy path — reads then syncs with fresh content', async () => {
  const reader = makeReader('the new body');
  const { syncer, calls } = makeRecordingSyncer();
  await syncFileToMemfsAfterWrite('forge-moda/slot_demo.md', reader, syncer);
  assert.deepStrictEqual(calls, [{
    relPath: 'forge-moda/slot_demo.md',
    content: 'the new body',
  }]);
});

test('syncFileToMemfsAfterWrite: reader error propagates, syncer never called', async () => {
  const reader = makeFailingReader(new Error('disk read failed'));
  const { syncer, calls } = makeRecordingSyncer();
  await assert.rejects(
    () => syncFileToMemfsAfterWrite('forge-moda/slot_demo.md', reader, syncer),
    (err: Error) => err.message === 'disk read failed',
  );
  assert.strictEqual(calls.length, 0, 'syncer should not be called on reader failure');
});

test('syncFileToMemfsAfterWrite: syncer error propagates after successful read', async () => {
  const reader = makeReader('the new body');
  const syncer = makeFailingSyncer(new Error('MEMFS sync failed'));
  await assert.rejects(
    () => syncFileToMemfsAfterWrite('forge-moda/slot_demo.md', reader, syncer),
    (err: Error) => err.message === 'MEMFS sync failed',
  );
});

test('syncFileToMemfsAfterWrite: empty content still triggers syncer call', async () => {
  // Defensive — a file that was truncated or somehow empty still
  // needs to propagate to MEMFS so the engine sees the truncation
  // (rather than holding stale prior content).
  const reader = makeReader('');
  const { syncer, calls } = makeRecordingSyncer();
  await syncFileToMemfsAfterWrite('any.md', reader, syncer);
  assert.deepStrictEqual(calls, [{ relPath: 'any.md', content: '' }]);
});

test('syncFileToMemfsAfterWrite: filePath is faithfully forwarded to syncer', async () => {
  const reader = makeReader('x');
  const { syncer, calls } = makeRecordingSyncer();
  await syncFileToMemfsAfterWrite('a/b/c.md', reader, syncer);
  await syncFileToMemfsAfterWrite('different/path.md', reader, syncer);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].relPath, 'a/b/c.md');
  assert.strictEqual(calls[1].relPath, 'different/path.md');
});
