// sui-client.ts — Shared Move-compatible client + sponsor keypair initialization
// CONTRACTS.md: CHAIN_RPC_URL=https://rpc-testnet.onelabs.cc:443
// ADR-008: Self-managed sponsor wallet (faucet-funded keypair)

import { SuiClient } from '@onelabs/sui/client';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@onelabs/sui/cryptography';
import { CHAIN_RPC_URL } from './chain';

// Validate required env vars at startup
const requiredEnvVars = [
  'ONEREALM_PACKAGE_ID',
  'SPONSOR_PRIVATE_KEY',
  'SPONSOR_ADDRESS',
  'GAME_AUTHORITY_OBJECT_ID',
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const suiClient = new SuiClient({ url: CHAIN_RPC_URL });

// ADR-008: sponsor keypair from exported 'suiprivkey1...' format
export const sponsorKeypair = Ed25519Keypair.fromSecretKey(
  decodeSuiPrivateKey(process.env.SPONSOR_PRIVATE_KEY!).secretKey
);

export const PACKAGE_ID     = process.env.ONEREALM_PACKAGE_ID!;
export const SPONSOR_ADDRESS = process.env.SPONSOR_ADDRESS!;
export const GAME_AUTHORITY_OBJECT_ID = process.env.GAME_AUTHORITY_OBJECT_ID!;
