import type { SuiClient } from '@onelabs/sui/client';
import { CHAIN_RPC_URL } from './chain';

let suiClientPromise: Promise<SuiClient> | null = null;

export async function getSuiClient(): Promise<SuiClient> {
  if (!suiClientPromise) {
    suiClientPromise = import('@onelabs/sui/client').then(({ SuiClient }) => new SuiClient({ url: CHAIN_RPC_URL }));
  }

  return suiClientPromise;
}
