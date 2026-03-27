import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRateLimitStore, type RateLimitBucket } from './rate-limit';

function withTempDb(run: (dbPath: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onerealm-rate-limit-'));
  const dbPath = path.join(dir, 'limits.json');
  try {
    run(dbPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function localMs(iso: string) {
  return new Date(iso).getTime();
}

test('rate limit buckets are isolated per address', () => {
  withTempDb((dbPath) => {
    const store = createRateLimitStore({
      dbPath,
      now: () => localMs('2026-03-27T10:00:00+07:00'),
      limits: { quest_start: 1, sponsor_action: 2, server_action: 3 },
    });

    store.consumeDailyLimitOrThrow('0xabc', 'quest_start');
    store.consumeDailyLimitOrThrow('0xabc', 'sponsor_action');

    assert.equal(store.getBucketCount('0xabc', 'quest_start'), 1);
    assert.equal(store.getBucketCount('0xabc', 'sponsor_action'), 1);
    assert.equal(store.getBucketCount('0xabc', 'server_action'), 0);
  });
});

test('same-day snapshots are restored', () => {
  withTempDb((dbPath) => {
    const nowMs = localMs('2026-03-27T10:00:00+07:00');
    const limits: Partial<Record<RateLimitBucket, number>> = { quest_start: 2 };

    const writer = createRateLimitStore({ dbPath, now: () => nowMs, limits });
    writer.consumeDailyLimitOrThrow('0xabc', 'quest_start');
    writer.save();

    const reader = createRateLimitStore({ dbPath, now: () => nowMs, limits });
    assert.equal(reader.getBucketCount('0xabc', 'quest_start'), 1);
  });
});

test('stale snapshots are ignored after day rollover', () => {
  withTempDb((dbPath) => {
    fs.writeFileSync(
      dbPath,
      JSON.stringify({
        dayKey: '2026-03-26',
        counters: {
          '0xabc': { quest_start: 9 },
        },
      })
    );

    const store = createRateLimitStore({
      dbPath,
      now: () => localMs('2026-03-27T10:00:00+07:00'),
    });

    assert.equal(store.getBucketCount('0xabc', 'quest_start'), 0);
  });
});

test('rate limit errors include bucket metadata', () => {
  withTempDb((dbPath) => {
    const store = createRateLimitStore({
      dbPath,
      now: () => localMs('2026-03-27T10:00:00+07:00'),
      limits: { sponsor_action: 1 },
    });

    store.consumeDailyLimitOrThrow('0xabc', 'sponsor_action');

    assert.throws(
      () => store.consumeDailyLimitOrThrow('0xabc', 'sponsor_action'),
      (err: any) => {
        assert.equal(err.status, 429);
        assert.equal(err.error, 'Rate limited');
        assert.equal(err.details.bucket, 'sponsor_action');
        assert.equal(err.details.limit, 1);
        assert.equal(err.details.remaining, 0);
        assert.equal(err.details.count_today, 1);
        return true;
      }
    );
  });
});
