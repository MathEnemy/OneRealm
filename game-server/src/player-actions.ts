import { Transaction } from '@onelabs/sui/transactions';
import { normalizeSuiAddress } from '@onelabs/sui/utils';
import { withRpcRetry } from './rpc-retry';
import { PACKAGE_ID, SPONSOR_ADDRESS, sponsorKeypair, suiClient } from './sui-client';
import { verifyHeroOwnership } from './session';

export interface SponsoredAction {
  txBytes: string;
  sponsorSig: string;
}

const HERO_TYPE = `${PACKAGE_ID}::hero::Hero`;
const EQUIPMENT_TYPE = `${PACKAGE_ID}::equipment::Equipment`;
const MATERIAL_TYPE = `${PACKAGE_ID}::material::Material`;
const SLOT_VALUES = new Set(['weapon', 'armor']);

async function buildSponsoredAction(tx: Transaction, playerAddress: string): Promise<SponsoredAction> {
  tx.setSender(playerAddress);
  tx.setGasOwner(SPONSOR_ADDRESS);
  const builtTxBytes = await withRpcRetry('player_action:build', () => tx.build({ client: suiClient }));
  const { signature } = await sponsorKeypair.signTransaction(builtTxBytes);
  return {
    txBytes: Buffer.from(builtTxBytes).toString('base64'),
    sponsorSig: signature,
  };
}

async function verifyOwnedObject(id: string, playerAddress: string, expectedType: string) {
  const object = await withRpcRetry('player_action:getObject', () =>
    suiClient.getObject({
      id,
      options: { showContent: true, showOwner: true },
    })
  );

  if (object.error || !object.data) {
    throw Object.assign(new Error(`Object not found: ${id}`), { status: 404 });
  }

  const content = object.data.content as any;
  if (!content || content.type !== expectedType) {
    throw Object.assign(new Error(`Object is not a ${expectedType.split('::').pop()}`), { status: 400 });
  }

  const owner = object.data.owner as any;
  if (!owner?.AddressOwner || normalizeSuiAddress(owner.AddressOwner) !== normalizeSuiAddress(playerAddress)) {
    throw Object.assign(new Error('Object does not belong to authenticated player'), { status: 401 });
  }
}

function assertValidHeroMint(name: string, archetype: number, profession: number) {
  if (!name.trim()) {
    throw Object.assign(new Error('Hero name is required'), { status: 400 });
  }
  if (Buffer.byteLength(name.trim(), 'utf-8') > 32) {
    throw Object.assign(new Error('Hero name exceeds 32 bytes'), { status: 400 });
  }
  if (![0, 1, 2].includes(archetype)) {
    throw Object.assign(new Error('Invalid hero archetype'), { status: 400 });
  }
  if (![0, 1, 2, 3].includes(profession)) {
    throw Object.assign(new Error('Invalid hero profession'), { status: 400 });
  }
}

function assertValidSlot(slot: string) {
  if (!SLOT_VALUES.has(slot)) {
    throw Object.assign(new Error('Invalid hero slot'), { status: 400 });
  }
}

export async function buildMintHeroAction(
  playerAddress: string,
  name: string,
  archetype: number,
  profession: number,
): Promise<SponsoredAction> {
  assertValidHeroMint(name, archetype, profession);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::hero::mint_to_sender`,
    arguments: [tx.pure.string(name.trim()), tx.pure.u8(archetype), tx.pure.u8(profession)],
  });
  return buildSponsoredAction(tx, playerAddress);
}

export async function buildEquipAction(
  playerAddress: string,
  heroId: string,
  slot: string,
  itemId: string,
): Promise<SponsoredAction> {
  assertValidSlot(slot);
  await verifyHeroOwnership(heroId, playerAddress);
  await verifyOwnedObject(itemId, playerAddress, EQUIPMENT_TYPE);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::hero::equip`,
    arguments: [
      tx.object(heroId),
      tx.pure.vector('u8', Array.from(Buffer.from(slot))),
      tx.object(itemId),
    ],
  });
  return buildSponsoredAction(tx, playerAddress);
}

export async function buildUnequipAction(
  playerAddress: string,
  heroId: string,
  slot: string,
): Promise<SponsoredAction> {
  assertValidSlot(slot);
  await verifyHeroOwnership(heroId, playerAddress);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::hero::unequip_to_sender`,
    arguments: [
      tx.object(heroId),
      tx.pure.vector('u8', Array.from(Buffer.from(slot))),
    ],
  });
  return buildSponsoredAction(tx, playerAddress);
}

export async function buildSalvageAction(
  playerAddress: string,
  itemId: string,
): Promise<SponsoredAction> {
  await verifyOwnedObject(itemId, playerAddress, EQUIPMENT_TYPE);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::equipment::salvage_to_sender`,
    arguments: [tx.object(itemId)],
  });
  return buildSponsoredAction(tx, playerAddress);
}

export async function buildCraftAction(
  playerAddress: string,
  recipeId: number,
  heroId: string,
  materialIds: string[],
): Promise<SponsoredAction> {
  if (materialIds.length !== 3) {
    throw Object.assign(new Error('Crafting requires exactly 3 materials'), { status: 400 });
  }
  if (new Set(materialIds).size !== materialIds.length) {
    throw Object.assign(new Error('Crafting materials must be unique'), { status: 400 });
  }

  await verifyHeroOwnership(heroId, playerAddress);
  await Promise.all(materialIds.map((materialId) => verifyOwnedObject(materialId, playerAddress, MATERIAL_TYPE)));

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::blacksmith::craft_to_sender`,
    arguments: [
      tx.pure.u8(recipeId),
      tx.object(heroId),
      tx.object(materialIds[0]),
      tx.object(materialIds[1]),
      tx.object(materialIds[2]),
    ],
  });
  return buildSponsoredAction(tx, playerAddress);
}
