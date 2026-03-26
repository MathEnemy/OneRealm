// zklogin.ts — zkLogin auth flow
// ADR-007: Dùng Mysten Hosted Prover (prover-dev.mystenlabs.com) — zero setup
// ADR-003: zkLogin naturally produces Sui `address` — no OneID type needed
// BLUEPRINT.md Section 5: startLogin() + completeLogin(jwt) specs

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  generateNonce,
  generateRandomness,
  getZkLoginSignature,
  jwtToAddress,
} from '@mysten/sui/zklogin';

const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'devnet';
const suiClient = new SuiClient({
  url: `https://fullnode.${SUI_NETWORK}.sui.io`,
});

// ADR-007: Mysten hosted prover — free for devnet/testnet
const ZK_PROVER_URL = 'https://prover-dev.mystenlabs.com/v1';

// ================================================================
// startLogin — Initiate Google OAuth flow
// ================================================================
// Persists ephemeral keypair + randomness to sessionStorage.
// Salt persisted to localStorage (ADR-007 trade-off: MVP only).
// Redirects to Google OAuth with zkLogin nonce embedded.
// ================================================================
export async function startLogin(): Promise<void> {
  // 1. Generate ephemeral keypair for this session
  const keypair = new Ed25519Keypair();

  // 2. Get current epoch for maxEpoch calculation
  const { epoch } = await suiClient.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 2;

  // 3. Generate randomness for nonce
  const randomness = generateRandomness();

  // 4. Build zkLogin nonce (embedded in Google OAuth URL)
  const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);

  // 5. Persist ephemeral key material to sessionStorage
  sessionStorage.setItem('zkEphemKey', keypair.getSecretKey());
  sessionStorage.setItem('zkRandomness', randomness);
  sessionStorage.setItem('zkMaxEpoch', String(maxEpoch));

  // 6. Salt persistence — ADR-007: localStorage (MVP trade-off)
  // Security note: if user clears localStorage → loses Sui address binding
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

  // 2. POST to Mysten hosted prover (ADR-007: latency 2-5s — show loading spinner)
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

  // 3. Derive Sui address from JWT + salt (ADR-003: address type)
  const address = jwtToAddress(jwt, salt);

  // 4. Persist proof for subsequent tx signing
  sessionStorage.setItem('zkProof', JSON.stringify(proof));
  sessionStorage.setItem('zkAddress', address);

  console.log('[zkLogin] Login complete. Address:', address);
  return { address, userSalt: salt };
}

// ================================================================
// getStoredSession — Retrieve current zkLogin session
// ================================================================
export function getStoredSession(): {
  address: string | null;
  maxEpoch: number | null;
  hasProof: boolean;
} {
  return {
    address:  sessionStorage.getItem('zkAddress'),
    maxEpoch: sessionStorage.getItem('zkMaxEpoch')
      ? Number(sessionStorage.getItem('zkMaxEpoch'))
      : null,
    hasProof: !!sessionStorage.getItem('zkProof'),
  };
}

// ================================================================
// buildZkSignature — Build zkLogin signature for a transaction
// ================================================================
export async function buildZkSignature(txBytes: string): Promise<string> {
  const keypair  = Ed25519Keypair.fromSecretKey(sessionStorage.getItem('zkEphemKey')!);
  const maxEpoch = Number(sessionStorage.getItem('zkMaxEpoch')!);
  const zkProof  = JSON.parse(sessionStorage.getItem('zkProof')!);

  const { fromBase64 } = await import('@mysten/sui/utils');
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
        console.warn(`[zkLogin] Prover attempt ${attempt + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error('ZK prover fetch failed');
}
