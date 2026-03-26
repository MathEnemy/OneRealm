// sponsor.ts — Gasless transaction sponsor relay
// CONTRACTS.md: POST /api/sponsor — thêm game server signature cho gasless tx
// ADR-008: Self-managed sponsor wallet, SPONSOR_RATE_LIMIT_PER_DAY=10

import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { suiClient, sponsorKeypair } from './sui-client';

// === Rate limiting (ADR-008) ===
// In-memory map — resets khi server restart (acceptable cho MVP)
// CONTRACTS.md: SPONSOR_RATE_LIMIT_PER_DAY = 10
const RATE_LIMIT_PER_DAY = 10;
const rateLimitMap = new Map<string, number>();

// Reset rate limits at midnight
setInterval(() => {
  rateLimitMap.clear();
  console.log('[sponsor] Rate limit counters reset');
}, getMillisToMidnight());

function getMillisToMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export function checkRateLimit(address: string): void {
  const count = rateLimitMap.get(address) ?? 0;
  if (count >= RATE_LIMIT_PER_DAY) {
    throw { status: 429, error: 'Rate limited', details: { count_today: count } };
  }
}

export function incrementRateLimit(address: string): void {
  const count = rateLimitMap.get(address) ?? 0;
  rateLimitMap.set(address, count + 1);
}

export function getRateLimitCount(address: string): number {
  return rateLimitMap.get(address) ?? 0;
}

// === Sponsor handler ===

export interface SponsorResult {
  sponsoredTxBytes: string;
  sponsorSig: string;
}

/**
 * Add game server sponsor signature to transaction bytes.
 * Returns sponsored tx bytes + sponsor signature for client to execute.
 *
 * CONTRACTS.md: POST /api/sponsor contract
 * OUTPUT: { sponsoredTxBytes: string, sponsorSig: string }
 */
export async function handleSponsor(
  txBytes: string,
  senderAddress: string
): Promise<SponsorResult> {
  // Check rate limit before processing
  checkRateLimit(senderAddress);

  // Build and sign transaction with sponsor keypair
  const tx = Transaction.from(fromBase64(txBytes));

  // Build the transaction into raw bytes
  const builtTxBytes = await tx.build({ client: suiClient });

  // Sign the raw transaction bytes with the sponsor keypair
  const { signature } = await sponsorKeypair.signTransaction(builtTxBytes);

  // Increment after successful signing
  incrementRateLimit(senderAddress);

  console.log(`[sponsor] Sponsored tx for ${senderAddress} (${getRateLimitCount(senderAddress)}/${RATE_LIMIT_PER_DAY} today)`);

  return {
    sponsoredTxBytes: toBase64(builtTxBytes),
    sponsorSig: signature,
  };
}
