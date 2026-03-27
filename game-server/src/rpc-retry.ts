const RETRYABLE_PATTERNS = [
  'Unexpected status code: 502',
  'Unexpected status code: 503',
  'Unexpected status code: 504',
  'fetch failed',
  'ETIMEDOUT',
  'ECONNRESET',
] as const;

function isRetryable(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '');
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRpcRetry<T>(label: string, operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) {
        throw error;
      }
      console.warn(`[rpc] ${label} failed on attempt ${attempt}/${attempts}: ${String((error as any)?.message ?? error)}`);
      await delay(500 * attempt);
    }
  }

  throw lastError;
}
