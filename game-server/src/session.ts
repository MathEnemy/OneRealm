// session.ts — MissionSession creation
// BLUEPRINT.md: Game Server tạo MissionSession + transfer về game_server_address (ADR-004)

import { Transaction } from '@mysten/sui/transactions';
import { suiClient, PACKAGE_ID, SPONSOR_ADDRESS, sponsorKeypair } from './sui-client';
import { toBase64 } from '@mysten/sui/utils';

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
  missionType:   0 | 1
): Promise<{ sessionId: string; createTxDigest: string }> {
  const tx = new Transaction();

  // mission::create_session returns the session object
  const [session] = tx.moveCall({
    target: `${PACKAGE_ID}::mission::create_session`,
    arguments: [
      tx.pure.address(playerAddress),
      tx.pure.id(heroId),
      tx.pure.u8(missionType),
    ],
  });

  // ADR-004: transfer to game server address — NOT share_object
  tx.transferObjects([session], tx.pure.address(SPONSOR_ADDRESS));

  // Game server self-signs this tx
  tx.setSender(SPONSOR_ADDRESS);

  // Sign and submit (Gasless relay)
  const bytes = await tx.build({ client: suiClient });
  const { signature } = await sponsorKeypair.signTransaction(bytes);
  
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showEffects: true, showObjectChanges: true },
  });

  // Extract the created MissionSession object ID from effects
  const created = result.objectChanges?.filter(
    (c: any) => c.type === 'created' && c.objectType?.includes('::mission::MissionSession')
  ) ?? [];

  if (created.length === 0) {
    throw new Error('MissionSession not found in tx effects');
  }

  const sessionId = (created[0] as any).objectId;

  console.log(`[session] Created session ${sessionId} for hero=${heroId} player=${playerAddress}`);

  return { sessionId, createTxDigest: result.digest };
}

export async function generateLoot(sessionId: string, senderAddress: string): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::loot::generate_loot`,
    arguments: [tx.object('0x8'), tx.object(sessionId)],
  });
  tx.setSender(SPONSOR_ADDRESS);
  const bytes = await tx.build({ client: suiClient });
  const { signature } = await sponsorKeypair.signTransaction(bytes);
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showEffects: true },
  });
  if (result.effects?.status.status !== 'success') {
    throw new Error('Tx1 failed: ' + result.effects?.status.error);
  }
  console.log(`[loot] Generated loot for session ${sessionId} (Tx1: ${result.digest})`);
  return result.digest;
}
