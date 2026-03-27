import { Transaction } from '@onelabs/sui/transactions';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';

async function run() {
  const sponsorAddress = new Ed25519Keypair().getPublicKey().toSuiAddress();
  const tx = new Transaction();
  tx.moveCall({
    target: '0x9348d3e1e8fb08948bf9d31c1ee4bd7fc93526e4f0150866a14c240ed515ce26::hero::mint_to_sender',
    arguments: [tx.pure.vector('u8', Array.from(Buffer.from('Alice'))), tx.pure.u8(0), tx.pure.u8(0)],
  });
  tx.setSender('0x111');
  tx.setGasOwner(sponsorAddress);
  tx.setGasBudget(10000000);
  tx.setGasPayment([{
    objectId: '0x7eabb0ae0760c658c93b9c904defbe9ea5c627efe6b47f10ba935127758e0a4a',
    digest: '4v5rDMCwXb3Le5N6QZmegUPRVVszrgFUeLwYrUepN43g',
    version: 1,
  }]);

  const mockClient = {
    getProtocolConfig: async () => { console.log('Called getProtocolConfig'); return { attributes: {} }; },
    getReferenceGasPrice: async () => { console.log('Called getReferenceGasPrice'); return '1000'; },
    multiGetObjects: async (args: any) => { console.log('Called multiGetObjects', args); return []; },
    getNormalizedMoveFunction: async (args: any) => { console.log('Called getNormalizedMoveFunction', args); return { parameters: [{ Vector: 'U8' }, 'U8', 'U8'] }; }
  } as any;

  try {
    const bytes = await tx.build({ client: mockClient });
    console.log("Built size:", bytes.length);
  } catch (e: any) {
    console.log("Mock build failed:", e.message);
  }
}
run();
