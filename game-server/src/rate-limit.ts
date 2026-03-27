import fs from 'node:fs';

export type RateLimitBucket = 'quest_start' | 'sponsor_action' | 'server_action';

interface RateLimitSnapshot {
  dayKey: string;
  counters: Record<string, Partial<Record<RateLimitBucket, number>>>;
}

export interface RateLimitDetails {
  bucket: RateLimitBucket;
  count_today: number;
  limit: number;
  remaining: number;
  resetsAt: number;
}

interface RateLimitStoreOptions {
  dbPath?: string;
  limits?: Partial<Record<RateLimitBucket, number>>;
  now?: () => number;
}

interface BucketStatus extends RateLimitDetails {}

const DEFAULT_LIMITS: Record<RateLimitBucket, number> = {
  quest_start: Number(process.env.QUEST_START_LIMIT_PER_DAY ?? '10'),
  sponsor_action: Number(process.env.SPONSOR_ACTION_LIMIT_PER_DAY ?? '50'),
  server_action: Number(process.env.SERVER_ACTION_LIMIT_PER_DAY ?? '25'),
};

const DEFAULT_DB_PATH = process.env.RATE_LIMIT_DB_PATH ?? '/tmp/onerealm-rate-limits.json';

function getLocalDayKey(nowMs: number): string {
  const now = new Date(nowMs);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextLocalMidnight(nowMs: number): number {
  const midnight = new Date(nowMs);
  midnight.setUTCHours(24, 0, 0, 0);
  return midnight.getTime();
}

function normalizeCountMap(
  input: Record<string, Partial<Record<RateLimitBucket, number>>>
): Map<string, Partial<Record<RateLimitBucket, number>>> {
  const counters = new Map<string, Partial<Record<RateLimitBucket, number>>>();
  for (const [address, value] of Object.entries(input)) {
    counters.set(address, value);
  }
  return counters;
}

function isRateLimitSnapshot(value: unknown): value is RateLimitSnapshot {
  return !!value && typeof value === 'object' && 'dayKey' in value && 'counters' in value;
}

export function createRateLimitStore(options: RateLimitStoreOptions = {}) {
  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const now = options.now ?? (() => Date.now());

  let dayKey = getLocalDayKey(now());
  let counters = new Map<string, Partial<Record<RateLimitBucket, number>>>();

  function ensureFreshDay() {
    const currentDayKey = getLocalDayKey(now());
    if (currentDayKey === dayKey) {
      return;
    }
    dayKey = currentDayKey;
    counters.clear();
    save();
    console.log('[rate-limit] Daily counters reset');
  }

  function load() {
    if (!fs.existsSync(dbPath)) {
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as unknown;

      if (isRateLimitSnapshot(parsed) && parsed.dayKey === dayKey) {
        counters = normalizeCountMap(parsed.counters);
        console.log('[rate-limit] Loaded current-day snapshot');
        return;
      }

      console.log('[rate-limit] Ignored stale or legacy snapshot');
    } catch (err) {
      console.error('Failed to load rate limits:', err);
    }
  }

  function save() {
    try {
      const snapshot: RateLimitSnapshot = {
        dayKey,
        counters: Object.fromEntries(counters),
      };
      const tmpPath = `${dbPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(snapshot));
      fs.renameSync(tmpPath, dbPath);
    } catch {
      // ignore persistence errors
    }
  }

  function getBucketCount(address: string, bucket: RateLimitBucket): number {
    ensureFreshDay();
    return counters.get(address)?.[bucket] ?? 0;
  }

  function getBucketStatus(address: string, bucket: RateLimitBucket): BucketStatus {
    const count = getBucketCount(address, bucket);
    const limit = limits[bucket];
    return {
      bucket,
      count_today: count,
      limit,
      remaining: Math.max(limit - count, 0),
      resetsAt: getNextLocalMidnight(now()),
    };
  }

  function consumeDailyLimit(address: string, bucket: RateLimitBucket): BucketStatus {
    ensureFreshDay();
    const current = counters.get(address) ?? {};
    const nextCount = (current[bucket] ?? 0) + 1;
    counters.set(address, { ...current, [bucket]: nextCount });
    return getBucketStatus(address, bucket);
  }

  function checkDailyLimit(address: string, bucket: RateLimitBucket): BucketStatus {
    const status = getBucketStatus(address, bucket);
    if (status.count_today >= status.limit) {
      throw { status: 429, error: 'Rate limited', details: status };
    }
    return status;
  }

  function consumeDailyLimitOrThrow(address: string, bucket: RateLimitBucket): BucketStatus {
    checkDailyLimit(address, bucket);
    return consumeDailyLimit(address, bucket);
  }

  function resetAll() {
    dayKey = getLocalDayKey(now());
    counters.clear();
    save();
  }

  load();

  return {
    save,
    resetAll,
    checkDailyLimit,
    consumeDailyLimit,
    consumeDailyLimitOrThrow,
    getBucketCount,
    getBucketStatus,
  };
}

const store = createRateLimitStore();

const saveInterval = setInterval(() => {
  store.save();
}, 5 * 60 * 1000);
saveInterval.unref?.();

process.on('SIGTERM', () => {
  store.save();
  process.exit(0);
});

process.on('SIGINT', () => {
  store.save();
  process.exit(0);
});

function scheduleReset() {
  const timeoutMs = Math.max(getNextLocalMidnight(Date.now()) - Date.now(), 1);
  const timer = setTimeout(() => {
    store.resetAll();
    console.log('[rate-limit] Daily counters reset');
    scheduleReset();
  }, timeoutMs);
  timer.unref?.();
}

scheduleReset();

export function getDailyCount(address: string, bucket: RateLimitBucket): number {
  return store.getBucketCount(address, bucket);
}

export function checkDailyLimit(address: string, bucket: RateLimitBucket): BucketStatus {
  return store.checkDailyLimit(address, bucket);
}

export function consumeDailyLimit(address: string, bucket: RateLimitBucket): BucketStatus {
  return store.consumeDailyLimit(address, bucket);
}

export function consumeDailyLimitOrThrow(address: string, bucket: RateLimitBucket): BucketStatus {
  return store.consumeDailyLimitOrThrow(address, bucket);
}
