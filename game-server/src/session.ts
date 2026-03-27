// session.ts — MissionSession creation
// BLUEPRINT.md: Game Server tạo MissionSession + transfer về game_server_address (ADR-004)

import { Transaction } from '@onelabs/sui/transactions';
import { normalizeSuiAddress } from '@onelabs/sui/utils';
import { suiClient, PACKAGE_ID, SPONSOR_ADDRESS, sponsorKeypair, GAME_AUTHORITY_OBJECT_ID } from './sui-client';
import { withRpcRetry } from './rpc-retry';

const JUDGE_MODE = process.env.JUDGE_MODE === 'true';
const JUDGE_EXPEDITION_MS = Number(process.env.JUDGE_EXPEDITION_MS ?? '90000');

function readSessionFields(content: any) {
  const fields = content?.fields ?? {};
  return {
    player: normalizeSuiAddress(fields.player ?? ''),
    status: Number(fields.status ?? -1),
    readyAtMs: Number(fields.ready_at_ms ?? 0),
  };
}

/**
 * Create a MissionSession on-chain and transfer to game_server_address (ADR-004).
 * Returns { sessionId, createTxDigest } for use in Tx1 loot generation.
 *
 * ADR-004: MissionSession must be OWNED by game server — NOT shared_object.
 * The Game Server is the ONLY entity that can mutate the session.
 */
export async function createSession(
  heroId:       string,
  playerAddress: string,
  missionType:   0 | 1 | 2,
  contractType:  0 | 1 | 2,
  stance:        0 | 1 | 2
): Promise<{ sessionId: string; createTxDigest: string; readyAtMs: number }> {
  const tx = new Transaction();

  const judgeExpedition = JUDGE_MODE && contractType === 2;
  const expectedReadyAtMs = judgeExpedition ? Date.now() + JUDGE_EXPEDITION_MS : 0;
  const [session] = judgeExpedition
    ? tx.moveCall({
        target: `${PACKAGE_ID}::mission::create_judge_session`,
        arguments: [
          tx.object(GAME_AUTHORITY_OBJECT_ID),
          tx.pure.address(playerAddress),
          tx.pure.id(heroId),
          tx.pure.u8(missionType),
          tx.pure.u8(contractType),
          tx.pure.u8(stance),
          tx.pure.u64(expectedReadyAtMs),
        ],
      })
    : tx.moveCall({
        target: `${PACKAGE_ID}::mission::create_session`,
        arguments: [
          tx.object(GAME_AUTHORITY_OBJECT_ID),
          tx.pure.address(playerAddress),
          tx.pure.id(heroId),
          tx.pure.u8(missionType),
          tx.pure.u8(contractType),
          tx.object('0x6'),
          tx.pure.u8(stance),
        ],
      });

  // ADR-004: transfer to game server address — NOT share_object
  tx.transferObjects([session], tx.pure.address(SPONSOR_ADDRESS));

  // Game server self-signs this tx
  tx.setSender(SPONSOR_ADDRESS);

  // Sign and submit (Gasless relay)
  const bytes = await withRpcRetry('create_session:build', () => tx.build({ client: suiClient }), 5);
  const { signature } = await sponsorKeypair.signTransaction(bytes);
  
  const result = await withRpcRetry('create_session:execute', () => suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showEffects: true, showObjectChanges: true },
  }));

  // Extract the created MissionSession object ID from effects
  const created = result.objectChanges?.filter(
    (c: any) => c.type === 'created' && c.objectType?.includes('::mission::MissionSession')
  ) ?? [];

  if (created.length === 0) {
    throw new Error('MissionSession not found in tx effects');
  }

  const sessionId = (created[0] as any).objectId;
  const sessionObject = await withRpcRetry('create_session:getObject', () => suiClient.getObject({
    id: sessionId,
    options: { showContent: true },
  }));
  const sessionFields = readSessionFields(sessionObject.data?.content);

  console.log(`[session] Created session ${sessionId} for hero=${heroId} player=${playerAddress}`);

  return {
    sessionId,
    createTxDigest: result.digest,
    readyAtMs: sessionFields.readyAtMs || expectedReadyAtMs,
  };
}

export async function grantJudgeBundle(playerAddress: string): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::mission::grant_judge_bundle`,
    arguments: [
      tx.object(GAME_AUTHORITY_OBJECT_ID),
      tx.pure.address(playerAddress),
    ],
  });
  tx.setSender(SPONSOR_ADDRESS);

  const bytes = await withRpcRetry('grant_judge_bundle:build', () => tx.build({ client: suiClient }), 5);
  const { signature } = await sponsorKeypair.signTransaction(bytes);
  const result = await withRpcRetry('grant_judge_bundle:execute', () => suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showEffects: true, showObjectChanges: true },
  }));

  return result.digest;
}

export async function verifySessionOwnership(sessionId: string, playerAddress: string): Promise<void> {
  const sessionObject = await withRpcRetry('generate_loot:getObject', () => suiClient.getObject({
    id: sessionId,
    options: { showContent: true },
  }));

  const sessionFields = readSessionFields(sessionObject.data?.content);
  if (sessionFields.player !== normalizeSuiAddress(playerAddress)) {
    throw Object.assign(new Error('Session does not belong to authenticated player'), { status: 401 });
  }
}

export async function verifyHeroOwnership(heroId: string, playerAddress: string): Promise<void> {
  const heroObject = await withRpcRetry('verifyHero:getObject', () => suiClient.getObject({
    id: heroId,
    options: { showContent: true, showOwner: true },
  }));

  if (heroObject.error) {
    throw Object.assign(new Error(`Failed to fetch hero: ${heroObject.error.code}`), { status: 404 });
  }

  const content = heroObject.data?.content as any;
  if (!content || content.type !== `${PACKAGE_ID}::hero::Hero`) {
    throw Object.assign(new Error('Object is not a Hero'), { status: 400 });
  }

  const owner = heroObject.data?.owner as any;
  if (!owner || !owner.AddressOwner || normalizeSuiAddress(owner.AddressOwner) !== normalizeSuiAddress(playerAddress)) {
    throw Object.assign(new Error('Hero does not belong to authenticated player'), { status: 401 });
  }
}

export async function generateLoot(sessionId: string): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::mission::generate_loot`,
    arguments: [tx.object(GAME_AUTHORITY_OBJECT_ID), tx.object('0x8'), tx.object(sessionId)],
  });
  tx.setSender(SPONSOR_ADDRESS);
  const bytes = await withRpcRetry('generate_loot:build', () => tx.build({ client: suiClient }), 5);
  const { signature } = await sponsorKeypair.signTransaction(bytes);
  const result = await withRpcRetry('generate_loot:execute', () => suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showEffects: true },
  }));
  if (result.effects?.status.status !== 'success') {
    throw new Error('Tx1 failed: ' + result.effects?.status.error);
  }
  console.log(`[loot] Generated loot for session ${sessionId} (Tx1: ${result.digest})`);
  return result.digest;
}
