export interface RateLimitDetails {
  bucket?: 'quest_start' | 'sponsor_action' | 'server_action' | string;
  count_today?: number;
  limit?: number;
  remaining?: number;
  resetsAt?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function readApiError(response: Response, fallbackMessage: string): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const message =
    body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : fallbackMessage;
  const details = body && typeof body === 'object' && 'details' in body ? body.details : undefined;
  return new ApiError(response.status, message, details);
}

export function getRateLimitMessage(details?: RateLimitDetails): string {
  if (details?.bucket === 'quest_start') {
    const limit = details.limit ?? 10;
    return `Daily quest launch limit reached (${limit}/day). Try again tomorrow.`;
  }

  if (details?.bucket === 'sponsor_action') {
    return 'Daily gasless action budget reached. Try again tomorrow.';
  }

  if (details?.bucket === 'server_action') {
    return 'Daily quest processing limit reached. Try again tomorrow.';
  }

  return 'Daily request limit reached. Try again tomorrow.';
}
