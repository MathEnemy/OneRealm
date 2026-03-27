// zklogin.ts — Google OAuth + zk proof auth flow
// ADR-007: Dùng hosted prover (prover-dev.mystenlabs.com) — zero setup
// ADR-003: Google + zk proof auth naturally produces on-chain `address` — no OneID type needed on-chain
// BLUEPRINT.md Section 5: startLogin() + completeLogin(jwt) specs

import { SuiClient } from '@onelabs/sui/client';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import {
  generateNonce,
  generateRandomness,
  getZkLoginSignature,
  jwtToAddress,
} from '@onelabs/sui/zklogin';
import { e2eFetch, getE2eRuntime, getLatestSuiSystemState } from '../lib/e2e';
import { CHAIN_RPC_URL } from '../lib/chain';

const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';
const suiClient = new SuiClient({
  url: CHAIN_RPC_URL,
});

// ADR-007: hosted prover — free for devnet/testnet
const ZK_PROVER_URL = 'https://prover-dev.mystenlabs.com/v1';

// ================================================================
// startLogin — Initiate Google OAuth flow
// ================================================================
// Persists ephemeral keypair + randomness to sessionStorage.
// Salt persisted to localStorage (ADR-007 trade-off: MVP only).
// Redirects to Google OAuth with embedded login nonce.
// ================================================================
export async function startLogin(): Promise<void> {
  const e2eRuntime = getE2eRuntime();
  if (e2eRuntime?.startLogin) {
    await e2eRuntime.startLogin(window.location.origin);
    return;
  }

  // 1. Generate ephemeral keypair for this session
  const keypair = new Ed25519Keypair();

  // 2. Get current epoch for maxEpoch calculation
  const { epoch } = await getLatestSuiSystemState(suiClient);
  const maxEpoch = Number(epoch) + 2;

  // 3. Generate randomness for nonce
  const randomness = generateRandomness();

  // 4. Build login nonce (embedded in Google OAuth URL)
  const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);

  // 5. Persist ephemeral key material to sessionStorage
  sessionStorage.setItem('zkEphemKey', keypair.getSecretKey());
  sessionStorage.setItem('zkRandomness', randomness);
  sessionStorage.setItem('zkMaxEpoch', String(maxEpoch));

  // 6. Salt persistence — ADR-007: localStorage (MVP trade-off)
  // Security note: if user clears localStorage → loses address binding
  if (!localStorage.getItem('zkSalt')) {
    localStorage.setItem('zkSalt', generateRandomness());
  }

  // 7. Build Google OAuth URL with nonce
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
  const redirectUri = `${window.location.origin}/auth/callback`;
  const loginUrl = buildGoogleOAuthUrl(clientId, nonce, redirectUri);

  // 8. Redirect (WOW #1 starts here)
  window.location.href = loginUrl;
}

export async function startDemoLogin(): Promise<void> {
  if (!JUDGE_MODE) {
    throw new Error('Judge mode is disabled');
  }

  const response = await e2eFetch(`${SERVER_URL}/api/auth/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Judge mode auth failed: ${response.status}`);
  }

  const data = await response.json();
  sessionStorage.setItem('zkAddress', data.address);
  sessionStorage.setItem('apiSessionToken', data.sessionToken);
  sessionStorage.setItem('apiSessionExpiresAt', String(data.expiresAt));
  sessionStorage.setItem('demoAuth', 'true');
  sessionStorage.removeItem('zkProof');
  sessionStorage.removeItem('zkEphemKey');
  sessionStorage.removeItem('zkMaxEpoch');
}

// ================================================================
// completeLogin — Process JWT from Google OAuth callback
// ================================================================
// Called after redirect back from Google with ?id_token=...
// Returns { address, keypair } for use in subsequent transactions.
// ================================================================
export async function completeLogin(jwt: string): Promise<{
  address: string;
  userSalt: string;
}> {
  // 1. Load stored ephemeral key material
  const salt       = localStorage.getItem('zkSalt')!;
  const randomness = sessionStorage.getItem('zkRandomness')!;
  const maxEpoch   = Number(sessionStorage.getItem('zkMaxEpoch'));
  const keypair    = Ed25519Keypair.fromSecretKey(sessionStorage.getItem('zkEphemKey')!);

  // 2. POST to hosted prover (ADR-007: latency 2-5s — show loading spinner)
  // CONTRACTS.md Section 6: ZK Prover request format
  const proverResponse = await retryFetch(ZK_PROVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jwt,
      extendedEphemeralPublicKey: keypair.getPublicKey().toBase64(),
      maxEpoch,
      jwtRandomness: randomness,
      salt,
      keyClaimName: 'sub',
    }),
  });

  if (!proverResponse.ok) {
    throw new Error(`ZK prover error: ${proverResponse.status}`);
  }

  const proof = await proverResponse.json();

  // 3. Derive on-chain address from JWT + salt (ADR-003: address type)
  const address = jwtToAddress(jwt, salt);

  // 4. Persist proof for subsequent tx signing
  sessionStorage.setItem('zkProof', JSON.stringify(proof));
  sessionStorage.setItem('zkAddress', address);
  await completeServerAuth(jwt, address, salt);

  console.log('[login] Login complete. Address:', address);
  return { address, userSalt: salt };
}

// ================================================================
// getStoredSession — Retrieve current login session
// ================================================================
export function getStoredSession(): {
  address: string | null;
  maxEpoch: number | null;
  hasProof: boolean;
  hasApiSession: boolean;
} {
  return {
    address:  sessionStorage.getItem('zkAddress'),
    maxEpoch: sessionStorage.getItem('zkMaxEpoch')
      ? Number(sessionStorage.getItem('zkMaxEpoch'))
      : null,
    hasProof: !!sessionStorage.getItem('zkProof'),
    hasApiSession: !!sessionStorage.getItem('apiSessionToken'),
  };
}

export function isDemoAuthSession(): boolean {
  return sessionStorage.getItem('demoAuth') === 'true';
}

export function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('apiSessionToken');
  if (!token) {
    throw new Error('Missing API session token');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ================================================================
// buildZkSignature — Build proof-backed signature for a transaction
// ================================================================
export async function buildZkSignature(txBytes: string): Promise<string> {
  if (isDemoAuthSession()) {
    throw new Error('Demo auth does not use zkLogin signatures');
  }
  if (getE2eRuntime()) {
    return 'e2e-zk-signature';
  }

  const keypair  = Ed25519Keypair.fromSecretKey(sessionStorage.getItem('zkEphemKey')!);
  const maxEpoch = Number(sessionStorage.getItem('zkMaxEpoch')!);
  const zkProof  = JSON.parse(sessionStorage.getItem('zkProof')!);

  const { fromBase64 } = await import('@onelabs/sui/utils');
  const { signature: userSig } = await keypair.signTransaction(fromBase64(txBytes));

  return getZkLoginSignature({
    inputs: zkProof,
    maxEpoch,
    userSignature: userSig,
  });
}

// ================================================================
// Helpers
// ================================================================

function buildGoogleOAuthUrl(clientId: string, nonce: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'id_token',
    scope:         'openid email profile',
    nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function completeServerAuth(jwt: string, address: string, userSalt: string): Promise<void> {
  const response = await e2eFetch(`${SERVER_URL}/api/auth/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: jwt, address, userSalt }),
  });

  if (!response.ok) {
    throw new Error(`Server auth error: ${response.status}`);
  }

  const data = await response.json();
  sessionStorage.setItem('apiSessionToken', data.sessionToken);
  sessionStorage.setItem('apiSessionExpiresAt', String(data.expiresAt));
}

// CONTRACTS.md: retry max 2 times on ZK prover timeout
async function retryFetch(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        console.warn(`[login] Prover attempt ${attempt + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error('ZK prover fetch failed');
}
