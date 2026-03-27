import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import { Transaction } from '@onelabs/sui/transactions';

process.env.ONEREALM_PACKAGE_ID = '0xabc';
process.env.SUI_RPC_URL = 'https://fullnode.devnet.sui.io';
process.env.GAME_AUTHORITY_OBJECT_ID = '0x999';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';

const sponsor = new Ed25519Keypair();
const sponsorAddress = sponsor.getPublicKey().toSuiAddress();
process.env.SPONSOR_PRIVATE_KEY = sponsor.getSecretKey();
process.env.SPONSOR_ADDRESS = sponsorAddress;

test('verifySponsoredTransaction accepts allowlisted mint tx', async () => {
  const { verifySponsoredTransaction } = await import('./tx-policy');

  const tx = new Transaction();
  tx.moveCall({
    target: '0xabc::hero::mint_to_sender',
    arguments: [tx.pure.string('Alice'), tx.pure.u8(0), tx.pure.u8(0)],
  });
  tx.setSender('0x111');
  tx.setGasOwner(sponsorAddress);

  verifySponsoredTransaction(JSON.stringify(tx.getData()), '0x111');
});

test('verifySponsoredTransaction rejects non-allowlisted target', async () => {
  const { verifySponsoredTransaction } = await import('./tx-policy');

  const tx = new Transaction();
  tx.moveCall({
    target: '0xabc::hero::burn',
    arguments: [],
  });
  tx.setSender('0x111');
  tx.setGasOwner(sponsorAddress);

  assert.throws(
    () => verifySponsoredTransaction(JSON.stringify(tx.getData()), '0x111'),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      'error' in error &&
      (error as { status: number; error: string }).status === 401 &&
      (error as { status: number; error: string }).error.includes('allowlisted'),
  );
});

test('verifySponsoredTransaction rejects sender mismatch', async () => {
  const { verifySponsoredTransaction } = await import('./tx-policy');

  const tx = new Transaction();
  tx.moveCall({
    target: '0xabc::hero::mint_to_sender',
    arguments: [tx.pure.string('Alice'), tx.pure.u8(0), tx.pure.u8(0)],
  });
  tx.setSender('0x111');
  tx.setGasOwner(sponsorAddress);

  assert.throws(
    () => verifySponsoredTransaction(JSON.stringify(tx.getData()), '0x222'),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      'error' in error &&
      (error as { status: number; error: string }).status === 401 &&
      (error as { status: number; error: string }).error === 'Sender mismatch',
  );
});

test('verifySponsoredTransaction accepts allowlisted salvage tx', async () => {
  const { verifySponsoredTransaction } = await import('./tx-policy');

  const tx = new Transaction();
  tx.moveCall({
    target: '0xabc::equipment::salvage_to_sender',
    arguments: [tx.object('0x123')],
  });
  tx.setSender('0x111');
  tx.setGasOwner(sponsorAddress);

  verifySponsoredTransaction(JSON.stringify(tx.getData()), '0x111');
});

test('verifySponsoredTransaction accepts allowlisted blacksmith tx', async () => {
  const { verifySponsoredTransaction } = await import('./tx-policy');

  const tx = new Transaction();
  tx.moveCall({
    target: '0xabc::blacksmith::craft_to_sender',
    arguments: [tx.pure.u8(0), tx.object('0x222'), tx.object('0x123'), tx.object('0x124'), tx.object('0x125')],
  });
  tx.setSender('0x111');
  tx.setGasOwner(sponsorAddress);

  verifySponsoredTransaction(JSON.stringify(tx.getData()), '0x111');
});
