import type { SuiClient } from '@onelabs/sui/client';

export interface E2EGaslessResult {
  digest: string;
  effects: any;
  objectChanges?: any[];
}

export interface OneRealmE2ERuntime {
  startLogin?: (origin: string) => Promise<void> | void;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  getLatestSuiSystemState?: () => Promise<any>;
  getOwnedObjects?: (args: any) => Promise<any>;
  getObject?: (args: any) => Promise<any>;
  getDynamicFields?: (args: any) => Promise<any>;
  executeGasless?: (txBytes: string, address: string) => Promise<E2EGaslessResult>;
  buildBattleTxAndExecute?: (sessionId: string, address: string) => Promise<E2EGaslessResult>;
}

declare global {
  interface Window {
    __ONEREALM_E2E__?: OneRealmE2ERuntime;
  }
}

export function getE2eRuntime(): OneRealmE2ERuntime | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (window.__ONEREALM_E2E__) {
    return window.__ONEREALM_E2E__;
  }
  
  if (sessionStorage.getItem('demoAuth') === 'true') {
    return {
      executeGasless: async (txBytes: string, address: string) => {
        const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
        const sponsorRes = await fetch(`${SERVER_URL}/api/sponsor`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('apiSessionToken')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ txBytes }),
        });
        if (!sponsorRes.ok) {
           const errBody = await sponsorRes.json().catch(()=>({}));
           throw new Error(errBody.error || 'Sponsor failed in demo mode');
        }
        const { sponsoredTxBytes, sponsorSig } = await sponsorRes.json();
        
        const { SuiClient } = await import('@onelabs/sui/client');
        const client = new SuiClient({ url: process.env.NEXT_PUBLIC_SUI_RPC_URL ?? 'https://rpc-testnet.onelabs.cc:443' });
        const result = await client.executeTransactionBlock({
          transactionBlock: sponsoredTxBytes,
          signature: sponsorSig,
          options: { showEffects: true, showEvents: true, showObjectChanges: true },
        });
        return { digest: result.digest, effects: result.effects, objectChanges: result.objectChanges };
      },
      buildBattleTxAndExecute: async function(sessionId: string, address: string) {
        const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
        const battleRes = await fetch(`${SERVER_URL}/api/battle`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('apiSessionToken')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        });
        if (!battleRes.ok) {
           const errBody = await battleRes.json().catch(()=>({}));
           throw new Error(errBody.error || 'Battle build failed in demo mode');
        }
        const { txBytes } = await battleRes.json();
        return this.executeGasless!(txBytes, address);
      }
    };
  }

  return null;
}

export async function e2eFetch(input: string, init?: RequestInit): Promise<Response> {
  const runtime = getE2eRuntime();
  if (runtime?.fetch) {
    return runtime.fetch(input, init);
  }
  return fetch(input, init);
}

export async function getLatestSuiSystemState(client: SuiClient) {
  const runtime = getE2eRuntime();
  if (runtime?.getLatestSuiSystemState) {
    return runtime.getLatestSuiSystemState();
  }
  return client.getLatestSuiSystemState();
}

export async function getOwnedObjects(client: SuiClient, args: any) {
  const runtime = getE2eRuntime();
  if (runtime?.getOwnedObjects) {
    return runtime.getOwnedObjects(args);
  }
  return client.getOwnedObjects(args);
}

export async function getObject(client: SuiClient, args: any) {
  const runtime = getE2eRuntime();
  if (runtime?.getObject) {
    return runtime.getObject(args);
  }
  return client.getObject(args);
}

export async function getDynamicFields(client: SuiClient, args: any) {
  const runtime = getE2eRuntime();
  if (runtime?.getDynamicFields) {
    return runtime.getDynamicFields(args);
  }
  return client.getDynamicFields(args);
}

export function encodeE2eTx(action: unknown): string | null {
  if (typeof window !== 'undefined' && sessionStorage.getItem('demoAuth') === 'true') {
    return null;
  }
  if (!getE2eRuntime()) {
    return null;
  }
  return Buffer.from(JSON.stringify(action)).toString('base64');
}
