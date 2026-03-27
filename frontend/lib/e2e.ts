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
  return window.__ONEREALM_E2E__ ?? null;
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
  if (!getE2eRuntime()) {
    return null;
  }
  return Buffer.from(JSON.stringify(action)).toString('base64');
}
