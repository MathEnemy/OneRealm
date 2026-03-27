import fs from 'node:fs';

const RATE_LIMIT_PER_DAY = 10;
const dailyCounters = new Map<string, number>();

const DB_PATH = '/tmp/onerealm-rate-limits.json';

if (fs.existsSync(DB_PATH)) {
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    for (const [k, v] of Object.entries(data)) {
      dailyCounters.set(k, v as number);
    }
    console.log('[rate-limit] Loaded from snapshot');
  } catch (err) {
    console.error('Failed to load rate limits:', err);
  }
}

function saveRateLimits() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(Object.fromEntries(dailyCounters)));
  } catch (err) {
    // ignore
  }
}

setInterval(saveRateLimits, 5 * 60 * 1000);

process.on('SIGTERM', () => {
  saveRateLimits();
  process.exit(0);
});
process.on('SIGINT', () => {
  saveRateLimits();
  process.exit(0);
});

function getMillisToMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function scheduleReset() {
  setTimeout(() => {
    dailyCounters.clear();
    console.log('[rate-limit] Daily counters reset');
    scheduleReset();
  }, getMillisToMidnight());
}

scheduleReset();

export function getDailyCount(address: string): number {
  return dailyCounters.get(address) ?? 0;
}

export function checkDailyLimit(address: string): void {
  const count = getDailyCount(address);
  if (count >= RATE_LIMIT_PER_DAY) {
    throw { status: 429, error: 'Rate limited', details: { count_today: count } };
  }
}

export function consumeDailyLimit(address: string): void {
  const count = getDailyCount(address);
  dailyCounters.set(address, count + 1);
}
