// gasless.ts — Gasless transaction wrapper
// BLUEPRINT.md Section 5: executeGasless(txBytes, zkAddress) spec
// Flow: txBytes → POST /api/sponsor → zkSign → executeTransactionBlock([zkSig, sponsorSig])

import { SuiClient } from '@mysten/sui/client';
import { fromBase64 } from '@mysten/sui/utils';
import { buildZkSignature } from '../auth/zklogin';

const SUI_NETWORK  = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'devnet';
const SERVER_URL   = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

export const suiClient = new SuiClient({
  url: `https://fullnode.${SUI_NETWORK}.sui.io`,
});

export interface GaslessResult {
  digest: string;
  effects: any;
}

/**
 * Execute a Sui transaction gaslessly (WOW #2).
 *
 * Steps:
 *   1. POST /api/sponsor to get sponsor signature
 *   2. Build zkLogin signature from ephemeral keypair + stored proof
 *   3. Execute with [zkSig, sponsorSig] — no gas popup for user
 *
 * CONTRACTS.md: POST /api/sponsor I/O contract
 */
export async function executeGasless(
  txBytes:   string,
  zkAddress: string
): Promise<GaslessResult> {
  // Step 1: Get sponsor signature (ADR-008: rate limit applies here)
  const sponsorRes = await fetch(`${SERVER_URL}/api/sponsor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txBytes, senderAddress: zkAddress }),
  });

  if (!sponsorRes.ok) {
    const errBody = await sponsorRes.json();
    // CONTRACTS.md error codes: 429=Rate limited, 401=Unauthorized
    if (sponsorRes.status === 429) {
      throw new GaslessError('RATE_LIMITED', errBody.error);
    }
    if (sponsorRes.status === 401) {
      throw new GaslessError('UNAUTHORIZED', errBody.error);
    }
    throw new GaslessError('SPONSOR_FAILED', errBody.error ?? 'Unknown sponsor error');
  }

  const { sponsoredTxBytes, sponsorSig } = await sponsorRes.json();

  // Step 2: Build zkLogin signature
  const zkSig = await buildZkSignature(sponsoredTxBytes);

  // Step 3: Execute on-chain with both signatures
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: sponsoredTxBytes,
    signature: [zkSig, sponsorSig],
    options: { showEffects: true, showEvents: true },
  });

  console.log('[gasless] Tx executed:', result.digest);
  return { digest: result.digest, effects: result.effects };
}

// ================================================================
// buildBattleTxAndExecute — Full quest flow helper
// ================================================================
// Calls /api/battle to get Tx2 bytes, then executes gaslessly.
// ================================================================
export async function buildBattleTxAndExecute(
  sessionId:     string,
  heroId:        string,
  playerAddress: string
): Promise<GaslessResult> {
  const battleRes = await fetch(`${SERVER_URL}/api/battle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, heroId, playerAddress }),
  });

  if (!battleRes.ok) {
    const errBody = await battleRes.json();
    throw new GaslessError('BATTLE_BUILD_FAILED', errBody.error ?? 'Failed to build Tx2');
  }

  const { txBytes } = await battleRes.json();
  return executeGasless(txBytes, playerAddress);
}

// ================================================================
// GaslessError — typed error for frontend UI handling
// ================================================================
export class GaslessError extends Error {
  constructor(
    public readonly code: 'RATE_LIMITED' | 'UNAUTHORIZED' | 'SPONSOR_FAILED' | 'BATTLE_BUILD_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'GaslessError';
  }
}
