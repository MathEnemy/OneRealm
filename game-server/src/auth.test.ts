import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import { normalizeSuiAddress } from '@onelabs/sui/utils';

process.env.ONEREALM_PACKAGE_ID = '0x9348d3e1e8fb08948bf9d31c1ee4bd7fc93526e4f0150866a14c240ed515ce26';
process.env.SUI_RPC_URL = 'https://rpc-testnet.onelabs.cc:443';
process.env.GAME_AUTHORITY_OBJECT_ID = '0x7eabb0ae0760c658c93b9c904defbe9ea5c627efe6b47f10ba935127758e0a4a';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret';
process.env.JUDGE_MODE = 'true';

const dummySponsor = new Ed25519Keypair();
process.env.SPONSOR_PRIVATE_KEY = dummySponsor.getSecretKey();
process.env.SPONSOR_ADDRESS = dummySponsor.getPublicKey().toSuiAddress();
const TEST_ADDRESS = normalizeSuiAddress('0x111');

test('issueSignedSessionToken and resolveAuthSessionToken round-trip', async () => {
  const { issueSignedSessionToken, resolveAuthSessionToken } = await import('./auth');
  const token = issueSignedSessionToken({
    address: '0x111',
    expiresAt: Date.now() + 60_000,
    googleSub: 'google-sub-123',
  });

  const session = resolveAuthSessionToken(token);
  assert.ok(session);
  assert.equal(session.address, TEST_ADDRESS);
  assert.equal(session.googleSub, 'google-sub-123');
  assert.equal(session.token, token);
});

test('resolveAuthSessionToken accepts legacy compatibility token', async () => {
  const { registerLegacyCompatSession, resolveAuthSessionToken } = await import('./auth');
  const legacy = registerLegacyCompatSession({
    address: '0x111',
    expiresAt: Date.now() + 60_000,
    googleSub: 'legacy-user',
    token: 'legacy-token',
  });

  const session = resolveAuthSessionToken(legacy.token);
  assert.ok(session);
  assert.equal(session.address, TEST_ADDRESS);
  assert.equal(session.googleSub, 'legacy-user');
  assert.equal(session.token, 'legacy-token');
});

test('resolveAuthSessionToken rejects tampered signed tokens', async () => {
  const { issueSignedSessionToken, resolveAuthSessionToken } = await import('./auth');
  const token = issueSignedSessionToken({
    address: '0x111',
    expiresAt: Date.now() + 60_000,
    googleSub: 'google-sub-123',
  });
  const tampered = `${token}tampered`;

  assert.equal(resolveAuthSessionToken(tampered), null);
});

test('resolveAuthSessionToken rejects expired signed tokens', async () => {
  const { issueSignedSessionToken, resolveAuthSessionToken } = await import('./auth');
  const token = issueSignedSessionToken({
    address: '0x111',
    expiresAt: Date.now() - 1_000,
    googleSub: 'google-sub-123',
  });

  assert.equal(resolveAuthSessionToken(token), null);
});

test('createDemoAuthSession issues judge-mode stateless tokens', async () => {
  const { createDemoAuthSession, resolveAuthSessionToken } = await import('./auth');
  const session = createDemoAuthSession();
  const resolved = resolveAuthSessionToken(session.sessionToken);

  assert.equal(session.judgeMode, true);
  assert.ok(resolved);
  assert.equal(resolved.address, session.address);
  assert.equal(resolved.judgeMode, true);
  assert.equal(resolved.googleSub, 'judge-mode');
});

test('requireAuth accepts signed stateless tokens', async () => {
  const { issueSignedSessionToken, requireAuth } = await import('./auth');
  const token = issueSignedSessionToken({
    address: '0x111',
    expiresAt: Date.now() + 60_000,
    googleSub: 'google-sub-123',
  });

  const req: any = {
    header(name: string) {
      return name === 'authorization' ? `Bearer ${token}` : undefined;
    },
  };
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.authSession.address, TEST_ADDRESS);
  assert.equal(res.statusCode, 200);
});

test('verifyHeroOwnership rejects missing object', async (t) => {
  const { suiClient, PACKAGE_ID } = await import('./sui-client');
  const { verifyHeroOwnership } = await import('./session');
  t.mock.method(suiClient, 'getObject', async () => ({
    error: { code: 'notExists' }
  }));
  
  await assert.rejects(
    () => verifyHeroOwnership('0x123', '0x111'),
    (error: any) => error.status === 404
  );
});

test('verifyHeroOwnership rejects invalid type', async (t) => {
  const { suiClient, PACKAGE_ID } = await import('./sui-client');
  const { verifyHeroOwnership } = await import('./session');
  t.mock.method(suiClient, 'getObject', async () => ({
    data: {
      content: { type: '0x2::coin::Coin' },
      owner: { AddressOwner: '0x111' }
    }
  }));
  
  await assert.rejects(
    () => verifyHeroOwnership('0x123', '0x111'),
    (error: any) => error.status === 400
  );
});

test('verifyHeroOwnership rejects mismatched owner', async (t) => {
  const { suiClient, PACKAGE_ID } = await import('./sui-client');
  const { verifyHeroOwnership } = await import('./session');
  t.mock.method(suiClient, 'getObject', async () => ({
    data: {
      content: { type: `${PACKAGE_ID}::hero::Hero` },
      owner: { AddressOwner: '0x222' }
    }
  }));
  
  await assert.rejects(
    () => verifyHeroOwnership('0x123', '0x111'),
    (error: any) => error.status === 401
  );
});

test('verifyHeroOwnership accepts valid owner', async (t) => {
  const { suiClient, PACKAGE_ID } = await import('./sui-client');
  const { verifyHeroOwnership } = await import('./session');
  t.mock.method(suiClient, 'getObject', async () => ({
    data: {
      content: { type: `${PACKAGE_ID}::hero::Hero` },
      owner: { AddressOwner: '0x111' }
    }
  }));
  
  await assert.doesNotReject(
    () => verifyHeroOwnership('0x123', '0x111')
  );
});

test('buildBattleTx rejects mismatched session owner', async (t) => {
  const { suiClient } = await import('./sui-client');
  const { buildBattleTx } = await import('./battle');
  t.mock.method(suiClient, 'getObject', async () => ({
    data: {
      content: {
        fields: {
          player: '0x222',
          hero_id: '0xabc',
          status: 1
        }
      }
    }
  }));
  
  await assert.rejects(
    () => buildBattleTx('0xsession', '0x111'),
    (error: any) => error.status === 401
  );
});

test('buildBattleTx accepts valid owner', async (t) => {
  const { suiClient } = await import('./sui-client');
  const { buildBattleTx } = await import('./battle');
  const { Transaction } = await import('@onelabs/sui/transactions');
  
  t.mock.method(suiClient, 'getObject', async () => ({
    data: {
      content: {
        fields: {
          player: '0x111',
          hero_id: '0xabc',
          status: 1
        }
      }
    }
  }));

  // Bypass the actual tx.build which makes network calls to resolving modules
  t.mock.method(Transaction.prototype, 'build', async () => new Uint8Array([1,2,3]));
  
  await assert.doesNotReject(
    () => buildBattleTx('0xsession', '0x111')
  );
});
