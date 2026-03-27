import test from 'node:test';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import { Transaction } from '@onelabs/sui/transactions';
import { toBase64 } from '@onelabs/sui/utils';
import { SuiClient } from '@onelabs/sui/client';

process.env.ONEREALM_PACKAGE_ID = '0x9348d3e1e8fb08948bf9d31c1ee4bd7fc93526e4f0150866a14c240ed515ce26';
process.env.SUI_RPC_URL = 'https://rpc-testnet.onelabs.cc:443';
process.env.GAME_AUTHORITY_OBJECT_ID = '0x7eabb0ae0760c658c93b9c904defbe9ea5c627efe6b47f10ba935127758e0a4a';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';

const sponsor = new Ed25519Keypair();
const sponsorAddress = sponsor.getPublicKey().toSuiAddress();
process.env.SPONSOR_PRIVATE_KEY = sponsor.getSecretKey();
process.env.SPONSOR_ADDRESS = sponsorAddress;

const dummyClient = new SuiClient({ url: process.env.SUI_RPC_URL });

function sealTx(tx: Transaction) {
  tx.setGasBudget(10000000);
  tx.setGasPayment([{
    objectId: '0x7eabb0ae0760c658c93b9c904defbe9ea5c627efe6b47f10ba935127758e0a4a',
    digest: '4v5rDMCwXb3Le5N6QZmegUPRVVszrgFUeLwYrUepN43g',
    version: 1,
  }]);
}

test('verifySponsoredTransaction accepts production-realistic base64 encoded bytes', async () => {
  const { verifySponsoredTransaction } = await import('./tx-policy');

  const tx = new Transaction();
  tx.moveCall({
    target: '0x9348d3e1e8fb08948bf9d31c1ee4bd7fc93526e4f0150866a14c240ed515ce26::hero::mint_to_sender',
    arguments: [tx.pure.vector('u8', Array.from(Buffer.from('Alice'))), tx.pure.u8(0), tx.pure.u8(0)],
  });
  tx.setSender('0x111');
  tx.setGasOwner(sponsorAddress);
  sealTx(tx);

  const txBytes = await tx.build({ client: dummyClient });
  const b64 = toBase64(txBytes);

  verifySponsoredTransaction(b64, '0x111');
});
