// battle.ts — Tx2 PTB builder (ADR-006: Game Server builds Tx2, Frontend co-signs)
// CONTRACTS.md: POST /api/battle — build settlement PTB
// Tx2 structure: mission::settle_and_distribute

import { Transaction } from '@onelabs/sui/transactions';
import { normalizeSuiAddress, toBase64 } from '@onelabs/sui/utils';
import { suiClient, PACKAGE_ID, SPONSOR_ADDRESS, GAME_AUTHORITY_OBJECT_ID } from './sui-client';

/**
 * Build Tx2 settlement PTB.
 * ADR-006: Game Server is the ONLY entity that builds Tx2.
 * ADR-010 replacement: combat is stance-bound deterministic resolution — no clock-based seed.
 */
export async function buildBattleTx(
  sessionId:     string,
  playerAddress: string
): Promise<string> {
  const sessionObject = await suiClient.getObject({
    id: sessionId,
    options: { showContent: true },
  });

  const fields = sessionObject.data?.content && 'fields' in sessionObject.data.content
    ? (sessionObject.data.content as any).fields
    : {};
  const sessionPlayer = normalizeSuiAddress(fields.player ?? '');
  const heroId = fields.hero_id;

  if (sessionPlayer !== normalizeSuiAddress(playerAddress)) {
    throw Object.assign(new Error('Session player mismatch'), { status: 401 });
  }
  if (!heroId) {
    throw new Error('Session is missing hero binding');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::mission::settle_and_distribute`,
    arguments: [
      tx.object(GAME_AUTHORITY_OBJECT_ID),
      tx.object(sessionId),
      tx.object(heroId),
      tx.object('0x6'),
    ],
  });

  // Set metadata — ADR-006: player signs, sponsor pays gas
  tx.setSender(playerAddress);
  tx.setGasOwner(SPONSOR_ADDRESS);

  const txBytes = await tx.build({ client: suiClient });

  console.log(`[battle] Built Tx2 for player=${playerAddress}, session=${sessionId}, hero=${heroId}`);

  return toBase64(txBytes);
}
