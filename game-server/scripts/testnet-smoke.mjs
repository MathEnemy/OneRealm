import 'dotenv/config';

import { SuiClient } from '@onelabs/sui/client';
import { Transaction } from '@onelabs/sui/transactions';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@onelabs/sui/cryptography';

const REQUIRED_ENV = [
  'CHAIN_RPC_URL',
  'ONEREALM_PACKAGE_ID',
  'SPONSOR_PRIVATE_KEY',
  'SPONSOR_ADDRESS',
  'GAME_AUTHORITY_OBJECT_ID',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const client = new SuiClient({ url: process.env.CHAIN_RPC_URL });
const signer = Ed25519Keypair.fromSecretKey(
  decodeSuiPrivateKey(process.env.SPONSOR_PRIVATE_KEY).secretKey,
);

const playerSigner = new Ed25519Keypair();
const PLAYER = playerSigner.toSuiAddress();

const PACKAGE_ID = process.env.ONEREALM_PACKAGE_ID;
const AUTHORITY = process.env.GAME_AUTHORITY_OBJECT_ID;
const JUDGE_EXPEDITION_MS = Number(process.env.JUDGE_EXPEDITION_MS ?? '15000');

function target(module, fn) {
  return `${PACKAGE_ID}::${module}::${fn}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildWithRetry(tx, attempts = 6) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await tx.build({ client });
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? error);
      if (!message.includes('notExists') || attempt === attempts) {
        throw error;
      }
      await sleep(750 * attempt);
    }
  }
  throw lastError;
}

async function playerSponsoredTx(tx) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      tx.setSender(PLAYER);
      tx.setGasOwner(signer.toSuiAddress());
      tx.setGasBudget(100_000_000);
      const bytes = await buildWithRetry(tx);
      const playerSig = await playerSigner.signTransaction(bytes);
      const sponsorSig = await signer.signTransaction(bytes);
      return await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature: [playerSig.signature, sponsorSig.signature],
        options: { showEffects: true, showObjectChanges: true, showEvents: true },
      });
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? error);
      const retryable = message.includes('not available for consumption')
        || message.includes('Unexpected status code: 502')
        || message.includes('Unexpected status code: 503');
      if (!retryable || attempt === 5) {
        throw error;
      }
      await sleep(750 * attempt);
    }
  }
  throw lastError;
}

async function sponsorTx(tx) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      tx.setSender(signer.toSuiAddress());
      tx.setGasBudget(100_000_000);
      const bytes = await buildWithRetry(tx);
      const { signature } = await signer.signTransaction(bytes);
      return await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true, showObjectChanges: true, showEvents: true },
      });
    } catch (error) {
      lastError = error;
      const message = String(error?.message ?? error);
      const retryable = message.includes('not available for consumption')
        || message.includes('Unexpected status code: 502')
        || message.includes('Unexpected status code: 503');
      if (!retryable || attempt === 5) {
        throw error;
      }
      await sleep(750 * attempt);
    }
  }
  throw lastError;
}

async function fetchOwned(structType) {
  const result = await client.getOwnedObjects({
    owner: PLAYER,
    filter: { StructType: structType },
    options: { showContent: true },
  });
  return result.data ?? [];
}

async function waitForObject(id, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const object = await client.getObject({
      id,
      options: { showContent: true },
    });
    if (object.data) {
      return object;
    }
    await sleep(500 * attempt);
  }
  throw new Error(`Object not visible yet: ${id}`);
}

function firstCreatedObject(result, suffix) {
  return result.objectChanges?.find(
    (change) => change.type === 'created' && change.objectType?.endsWith(suffix),
  )?.objectId ?? null;
}

async function mintHero() {
  const tx = new Transaction();
  tx.moveCall({
    target: target('hero', 'mint_to_sender'),
    arguments: [
      tx.pure.vector('u8', Array.from(Buffer.from('Judge Hero'))),
      tx.pure.u8(0),
      tx.pure.u8(0),
    ],
  });
  const result = await playerSponsoredTx(tx);
  const heroId = firstCreatedObject(result, '::hero::Hero');
  if (!heroId) {
    throw new Error('Mint hero did not create Hero object');
  }
  return { heroId, digest: result.digest };
}

async function grantJudgeBundle() {
  const tx = new Transaction();
  tx.moveCall({
    target: target('mission', 'grant_judge_bundle'),
    arguments: [tx.object(AUTHORITY), tx.pure.address(PLAYER)],
  });
  return sponsorTx(tx);
}

async function craftRaiderBlade(heroId) {
  const materials = await fetchOwned(`${PACKAGE_ID}::material::Material`);
  const oreIds = [];
  let essenceId = null;

  for (const item of materials) {
    const fields = item.data?.content?.fields ?? {};
    const type = Number(fields.material_type ?? -1);
    if (type === 0 && oreIds.length < 2) {
      oreIds.push(item.data.objectId);
    } else if (type === 2 && !essenceId) {
      essenceId = item.data.objectId;
    }
  }

  if (oreIds.length < 2 || !essenceId) {
    throw new Error('Judge bundle did not produce enough ore/essence for Raider Blade');
  }

  const tx = new Transaction();
  tx.moveCall({
    target: target('blacksmith', 'craft_to_sender'),
    arguments: [
      tx.pure.u8(0),
      tx.object(heroId),
      tx.object(oreIds[0]),
      tx.object(oreIds[1]),
      tx.object(essenceId),
    ],
  });

  const result = await playerSponsoredTx(tx);
  const equipmentId = firstCreatedObject(result, '::equipment::Equipment');
  if (!equipmentId) {
    throw new Error('Craft did not create Equipment object');
  }
  return { equipmentId, digest: result.digest };
}

async function equipWeapon(heroId, equipmentId) {
  const tx = new Transaction();
  tx.moveCall({
    target: target('hero', 'equip'),
    arguments: [
      tx.object(heroId),
      tx.pure.vector('u8', Array.from(Buffer.from('weapon'))),
      tx.object(equipmentId),
    ],
  });
  return playerSponsoredTx(tx);
}

async function createJudgeExpedition(heroId) {
  const tx = new Transaction();
  const readyAtMs = Date.now() + JUDGE_EXPEDITION_MS;
  const [session] = tx.moveCall({
    target: target('mission', 'create_judge_session'),
    arguments: [
      tx.object(AUTHORITY),
      tx.pure.address(PLAYER),
      tx.pure.id(heroId),
      tx.pure.u8(2),
      tx.pure.u8(2),
      tx.pure.u8(0),
      tx.pure.u64(readyAtMs),
    ],
  });
  tx.transferObjects([session], tx.pure.address(signer.toSuiAddress()));
  const result = await sponsorTx(tx);
  const sessionId = firstCreatedObject(result, '::mission::MissionSession');
  if (!sessionId) {
    throw new Error('Judge expedition did not create MissionSession');
  }
  return { sessionId, readyAtMs, digest: result.digest };
}

async function generateLoot(sessionId) {
  const tx = new Transaction();
  tx.moveCall({
    target: target('mission', 'generate_loot'),
    arguments: [tx.object(AUTHORITY), tx.object('0x8'), tx.object(sessionId)],
  });
  return sponsorTx(tx);
}

async function settle(sessionId, heroId) {
  const tx = new Transaction();
  tx.moveCall({
    target: target('mission', 'settle_and_distribute'),
    arguments: [
      tx.object(AUTHORITY),
      tx.object(sessionId),
      tx.object(heroId),
      tx.object('0x6'),
    ],
  });
  return playerSponsoredTx(tx);
}

async function main() {
  console.log('== OneRealm Judge Smoke (Real User Simulation) ==');
  console.log(`Package: ${PACKAGE_ID}`);
  console.log(`Player (ephemeral): ${PLAYER}`);
  console.log(`Sponsor: ${signer.toSuiAddress()}`);
  console.log(`Judge expedition ms: ${JUDGE_EXPEDITION_MS}`);

  const { heroId, digest: heroDigest } = await mintHero();
  console.log(`mint hero: ok (${heroDigest}) hero=${heroId}`);

  const bundleResult = await grantJudgeBundle();
  console.log(`judge bundle: ok (${bundleResult.digest})`);

  console.log('waiting 3s for RPC indexer...');
  await sleep(3000);

  const { equipmentId, digest: craftDigest } = await craftRaiderBlade(heroId);
  console.log(`craft raider blade: ok (${craftDigest}) equipment=${equipmentId}`);

  const equipResult = await equipWeapon(heroId, equipmentId);
  console.log(`equip crafted weapon: ok (${equipResult.digest})`);

  const expedition = await createJudgeExpedition(heroId);
  console.log(`create expedition: ok (${expedition.digest}) session=${expedition.sessionId}`);

  const lootResult = await generateLoot(expedition.sessionId);
  console.log(`generate loot: ok (${lootResult.digest})`);

  const waitMs = Math.max(0, expedition.readyAtMs - Date.now()) + 2000;
  console.log(`waiting ${waitMs}ms for expedition return window...`);
  await sleep(waitMs);

  const settleResult = await settle(expedition.sessionId, heroId);
  console.log(`settle expedition: ok (${settleResult.digest})`);

  const materials = await fetchOwned(`${PACKAGE_ID}::material::Material`);
  const equipment = await fetchOwned(`${PACKAGE_ID}::equipment::Equipment`);
  console.log(`wallet now has ${materials.length} materials and ${equipment.length} unequipped gear objects`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
