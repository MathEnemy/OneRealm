const RATE_LIMIT_PER_DAY = 10;
const dailyCounters = new Map<string, number>();

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
