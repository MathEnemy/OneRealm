// battle.ts — Tx2 PTB builder (ADR-006: Game Server builds Tx2, Frontend co-signs)
// CONTRACTS.md: POST /api/battle — build settlement PTB
// Tx2 structure: mission::settle_and_distribute

import { Transaction } from '@onelabs/sui/transactions';
import { normalizeSuiAddress, toBase64 } from '@onelabs/sui/utils';
import { suiClient, PACKAGE_ID, SPONSOR_ADDRESS, sponsorKeypair, GAME_AUTHORITY_OBJECT_ID } from './sui-client';
import { withRpcRetry } from './rpc-retry';

let cachedSettlementMode: 'authority-gated' | 'legacy' | null = null;

async function getSettlementMode(): Promise<'authority-gated' | 'legacy'> {
  if (cachedSettlementMode) {
    return cachedSettlementMode;
  }

  const mod = await withRpcRetry('battle:getNormalizedMoveModule', () =>
    suiClient.getNormalizedMoveModule({
      package: PACKAGE_ID,
      module: 'mission',
    })
  );

  const fn = mod.exposedFunctions.settle_and_distribute;
  if (!fn) {
    throw new Error('mission::settle_and_distribute not found on deployed package');
  }

  const firstParam = fn.parameters[0] as any;
  const firstStruct = firstParam?.Reference?.Struct ?? firstParam?.MutableReference?.Struct;

  cachedSettlementMode =
    firstStruct?.module === 'mission' && firstStruct?.name === 'GameAuthority'
      ? 'authority-gated'
      : 'legacy';

  return cachedSettlementMode;
}

/**
 * Build Tx2 settlement PTB.
 * ADR-006: Game Server is the ONLY entity that builds Tx2.
 * ADR-010 replacement: combat is stance-bound deterministic resolution — no clock-based seed.
 */
export async function buildBattleTx(
  sessionId: string,
  playerAddress: string
): Promise<{ txBytes: string; sponsorSig: string }> {
  const sessionObject = await withRpcRetry('battle:getObject', () =>
    suiClient.getObject({
      id: sessionId,
      options: { showContent: true },
    })
  );

  if (sessionObject.error || !sessionObject.data) {
    throw Object.assign(new Error('Session not found'), { status: 404 });
  }

  const fields = sessionObject.data.content && 'fields' in sessionObject.data.content
    ? (sessionObject.data.content as any).fields
    : {};

  const sessionPlayer = normalizeSuiAddress(fields.player ?? '');
  if (sessionPlayer !== normalizeSuiAddress(playerAddress)) {
    throw Object.assign(new Error('Session does not belong to authenticated player'), { status: 401 });
  }

  const rawHeroId = fields.hero_id;
  const heroId = typeof rawHeroId === 'object' && rawHeroId !== null && 'id' in rawHeroId
    ? rawHeroId.id
    : String(rawHeroId ?? '');

  if (!heroId || heroId === 'undefined') {
    throw new Error('Session is missing hero binding');
  }

  const sessionStatus = Number(fields.status ?? -1);

  const STATUS_LOOT_DONE = 1;
  if (sessionStatus !== STATUS_LOOT_DONE) {
    throw Object.assign(new Error("Session status is not ready for settlement"), { status: 400 });
  }

  const tx = new Transaction();

  const settlementMode = await withRpcRetry('battle:getSettlementMode', () => getSettlementMode());
  const args = settlementMode === 'authority-gated'
    ? [
      tx.object(GAME_AUTHORITY_OBJECT_ID),
      tx.object(sessionId),
      tx.object(heroId),
      tx.object('0x6'),
    ]
    : [
      tx.object(sessionId),
      tx.object(heroId),
      tx.object('0x6'),
    ];

  tx.moveCall({
    target: `${PACKAGE_ID}::mission::settle_and_distribute`,
    arguments: args,
  });

  // Set metadata — ADR-006: player signs, sponsor pays gas
  tx.setSender(playerAddress);
  tx.setGasOwner(SPONSOR_ADDRESS);

  const txBytes = await withRpcRetry('battle:build', () => tx.build({ client: suiClient }));
  const { signature } = await sponsorKeypair.signTransaction(txBytes);

  console.log(`[battle] Built Tx2 for player=${playerAddress}, session=${sessionId}, hero=${heroId}, mode=${settlementMode}`);

  return {
    txBytes: toBase64(txBytes),
    sponsorSig: signature,
  };
}
