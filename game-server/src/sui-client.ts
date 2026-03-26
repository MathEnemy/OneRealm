// sui-client.ts — Shared Sui client + sponsor keypair initialization
// CONTRACTS.md: SUI_RPC_URL=https://fullnode.devnet.sui.io
// ADR-008: Self-managed sponsor wallet (faucet-funded keypair)

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { fromBase64 } from '@mysten/sui/utils';

// Validate required env vars at startup
const requiredEnvVars = [
  'ONEREALM_PACKAGE_ID',
  'SUI_RPC_URL',
  'SPONSOR_PRIVATE_KEY',
  'SPONSOR_ADDRESS',
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const suiClient = new SuiClient({ url: process.env.SUI_RPC_URL! });

// ADR-008: sponsor keypair from exported 'suiprivkey1...' format
export const sponsorKeypair = Ed25519Keypair.fromSecretKey(
  decodeSuiPrivateKey(process.env.SPONSOR_PRIVATE_KEY!).secretKey
);

export const PACKAGE_ID     = process.env.ONEREALM_PACKAGE_ID!;
export const SPONSOR_ADDRESS = process.env.SPONSOR_ADDRESS!;
