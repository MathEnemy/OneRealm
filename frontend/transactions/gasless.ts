// gasless.ts — Sponsored transaction execution helpers
// Production flows now use typed server-built action endpoints and /api/battle.

import { buildZkSignature, getAuthHeaders, isDemoAuthSession } from '../auth/zklogin';
import { e2eFetch, getE2eRuntime } from '../lib/e2e';
import { getRateLimitMessage, readApiError, type RateLimitDetails } from '../lib/api-errors';
import { getSuiClient } from '../lib/sui-runtime';

const SERVER_URL   = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

export interface GaslessResult {
  digest: string;
  effects: any;
  objectChanges?: any[];
}

async function executeSponsoredTransaction(
  sponsoredTxBytes: string,
  sponsorSig: string,
): Promise<GaslessResult> {
  const signature = isDemoAuthSession()
    ? sponsorSig
    : [await buildZkSignature(sponsoredTxBytes), sponsorSig];
  const suiClient = await getSuiClient();
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: sponsoredTxBytes,
    signature,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });

  console.log('[gasless] Tx executed:', result.digest);
  return { digest: result.digest, effects: result.effects, objectChanges: result.objectChanges };
}

// ================================================================
// buildBattleTxAndExecute — Full quest flow helper
// ================================================================
// Calls /api/battle to get Tx2 bytes + sponsor signature, then executes it.
// ================================================================
export async function buildBattleTxAndExecute(
  sessionId: string,
  _playerAddress: string
): Promise<GaslessResult> {
  const runtime = getE2eRuntime();
  if (runtime?.buildBattleTxAndExecute) {
    return runtime.buildBattleTxAndExecute(sessionId, _playerAddress);
  }

  const battleRes = await e2eFetch(`${SERVER_URL}/api/battle`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ sessionId }),
  });

  if (!battleRes.ok) {
    const errBody = await battleRes.json();
    throw new GaslessError('BATTLE_BUILD_FAILED', errBody.error ?? 'Failed to build Tx2');
  }

  const data = await battleRes.json();
  if (!data.sponsorSig || !data.txBytes) {
    throw new GaslessError('BATTLE_BUILD_FAILED', 'Battle response is missing sponsored transaction data');
  }
  return executeSponsoredTransaction(data.txBytes, data.sponsorSig);
}

export async function executeServerAction(
  endpoint: string,
  body: Record<string, unknown>,
  playerAddress: string,
  fallbackAction?: unknown,
): Promise<GaslessResult> {
  const runtime = getE2eRuntime();
  if (runtime?.executeAction && fallbackAction) {
    return runtime.executeAction(fallbackAction, playerAddress);
  }

  const response = await e2eFetch(`${SERVER_URL}${endpoint}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 429) {
      const apiError = await readApiError(response, 'Rate limited');
      throw new GaslessError('RATE_LIMITED', getRateLimitMessage(apiError.details as RateLimitDetails), apiError.details as RateLimitDetails);
    }
    if (response.status === 401) {
      const apiError = await readApiError(response, 'Unauthorized');
      throw new GaslessError('UNAUTHORIZED', apiError.message);
    }
    const apiError = await readApiError(response, 'Failed to build sponsored action');
    throw new GaslessError('SPONSOR_FAILED', apiError.message, apiError.details as RateLimitDetails | undefined);
  }

  const data = await response.json();
  return executeSponsoredTransaction(data.txBytes, data.sponsorSig);
}

// ================================================================
// GaslessError — typed error for frontend UI handling
// ================================================================
export class GaslessError extends Error {
  constructor(
    public readonly code: 'RATE_LIMITED' | 'UNAUTHORIZED' | 'SPONSOR_FAILED' | 'BATTLE_BUILD_FAILED',
    message: string,
    public readonly details?: RateLimitDetails
  ) {
    super(message);
    this.name = 'GaslessError';
  }
}
