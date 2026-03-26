// battle.ts — Tx2 PTB builder (ADR-006: Game Server builds Tx2, Frontend co-signs)
// CONTRACTS.md: POST /api/battle — build settlement PTB
// Tx2 structure: hero::total_power → mission::settle → mission::distribute

import { Transaction } from '@mysten/sui/transactions';
import { suiClient, PACKAGE_ID, SPONSOR_ADDRESS } from './sui-client';
import { toBase64 } from '@mysten/sui/utils';

/**
 * Build Tx2 settlement PTB.
 * CONTRACTS.md Tx2 PTB structure:
 *   [1] hero::total_power(heroId)       → heroPower
 *   [2] mission::settle(sessionId, heroPower, "0x6") → rewards
 *   [3] mission::distribute(rewards, playerAddress)
 *
 * ADR-006: Game Server is the ONLY entity that builds Tx2.
 * ADR-010: settle() uses deterministic battle — DOES NOT use sui::random.
 */
export async function buildBattleTx(
  sessionId:     string,
  heroId:        string,
  playerAddress: string
): Promise<string> {
  const tx = new Transaction();

  // Step 1: Get hero total power (base_power + equipped weapons + armor)
  const [heroPower] = tx.moveCall({
    target: `${PACKAGE_ID}::hero::total_power`,
    arguments: [tx.object(heroId)],
  });

  // Step 2: Settle battle — deterministic (ADR-010)
  // clock="0x6" is the Sui system clock object (always available)
  const [rewards] = tx.moveCall({
    target: `${PACKAGE_ID}::mission::settle`,
    arguments: [
      tx.object(sessionId),
      heroPower,
      tx.object('0x6'),  // CONTRACTS.md: CLOCK_OBJECT_ID = "0x6"
    ],
  });

  // Step 3: Distribute all Equipment objects to player
  tx.moveCall({
    target: `${PACKAGE_ID}::mission::distribute`,
    arguments: [
      rewards,
      tx.pure.address(playerAddress),
    ],
  });

  // Set metadata — ADR-006: player signs, sponsor pays gas
  tx.setSender(playerAddress);
  tx.setGasOwner(SPONSOR_ADDRESS);

  const txBytes = await tx.build({ client: suiClient });

  console.log(`[battle] Built Tx2 for player=${playerAddress}, session=${sessionId}, hero=${heroId}`);

  return toBase64(txBytes);
}
