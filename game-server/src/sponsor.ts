// sponsor.ts — Gasless transaction sponsor relay
// CONTRACTS.md: POST /api/sponsor — thêm game server signature cho gasless tx
// ADR-008: Self-managed sponsor wallet, SPONSOR_RATE_LIMIT_PER_DAY=10

import { Transaction } from '@onelabs/sui/transactions';
import { fromBase64, toBase64 } from '@onelabs/sui/utils';
import { suiClient, sponsorKeypair } from './sui-client';

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
): Promise<SponsorResult> {
  // Build and sign transaction with sponsor keypair
  const tx = Transaction.from(fromBase64(txBytes));

  // Build the transaction into raw bytes
  const builtTxBytes = await tx.build({ client: suiClient });

  // Sign the raw transaction bytes with the sponsor keypair
  const { signature } = await sponsorKeypair.signTransaction(builtTxBytes);

  console.log('[sponsor] Sponsored allowlisted transaction');

  return {
    sponsoredTxBytes: toBase64(builtTxBytes),
    sponsorSig: signature,
  };
}
