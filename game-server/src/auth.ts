import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { jwtToAddress } from '@onelabs/sui/zklogin';
import { normalizeSuiAddress } from '@onelabs/sui/utils';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  throw new Error('Missing required env var: GOOGLE_CLIENT_ID');
}

const SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS ?? '12');
const JUDGE_MODE = process.env.JUDGE_MODE === 'true';
const DEMO_ADDRESS = normalizeSuiAddress(process.env.DEMO_PLAYER_ADDRESS ?? process.env.SPONSOR_ADDRESS ?? '');
const SESSION_TOKEN_SECRET =
  process.env.AUTH_SESSION_SECRET ??
  process.env.SPONSOR_PRIVATE_KEY ??
  GOOGLE_CLIENT_ID;
const STATELESS_TOKEN_PREFIX = 'or1';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

interface SessionRecord {
  address: string;
  expiresAt: number;
  googleSub: string;
  token: string;
  judgeMode?: boolean;
}

interface StatelessSessionPayload {
  v: 1;
  address: string;
  exp: number;
  sub: string;
  judge?: 1;
}

export interface AuthSession {
  address: string;
  expiresAt: number;
  googleSub: string;
  token: string;
  judgeMode?: boolean;
}

const sessionStore = new Map<string, SessionRecord>();

declare global {
  namespace Express {
    interface Request {
      authSession?: AuthSession;
    }
  }
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessionStore.entries()) {
    if (session.expiresAt <= now) {
      sessionStore.delete(token);
    }
  }
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf-8');
}

function signPayload(payloadB64: string): string {
  return crypto.createHmac('sha256', SESSION_TOKEN_SECRET).update(payloadB64).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function issueSignedSessionToken(input: {
  address: string;
  expiresAt: number;
  googleSub: string;
  judgeMode?: boolean;
}): string {
  const payload: StatelessSessionPayload = {
    v: 1,
    address: normalizeSuiAddress(input.address),
    exp: input.expiresAt,
    sub: input.googleSub,
    judge: input.judgeMode ? 1 : undefined,
  };
  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadB64);
  return `${STATELESS_TOKEN_PREFIX}.${payloadB64}.${signature}`;
}

function decodeSignedSessionToken(token: string): AuthSession | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [prefix, payloadB64, signature] = parts;
  if (prefix !== STATELESS_TOKEN_PREFIX || !payloadB64 || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payloadB64);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadB64)) as StatelessSessionPayload;
    if (payload.v !== 1 || typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
      return null;
    }
    if (!payload.address || !payload.sub) {
      return null;
    }

    return {
      address: normalizeSuiAddress(payload.address),
      expiresAt: payload.exp,
      googleSub: payload.sub,
      token,
      judgeMode: payload.judge === 1,
    };
  } catch {
    return null;
  }
}

// Migration compatibility: keep accepting opaque in-memory tokens until all active
// sessions have rotated to signed stateless tokens.
export function registerLegacyCompatSession(input: {
  address: string;
  expiresAt: number;
  googleSub: string;
  token?: string;
  judgeMode?: boolean;
}): AuthSession {
  const token = input.token ?? crypto.randomBytes(32).toString('hex');
  const session: SessionRecord = {
    address: normalizeSuiAddress(input.address),
    expiresAt: input.expiresAt,
    googleSub: input.googleSub,
    token,
    judgeMode: input.judgeMode,
  };
  sessionStore.set(token, session);
  return session;
}

export function resolveAuthSessionToken(token: string): AuthSession | null {
  pruneExpiredSessions();

  const statelessSession = decodeSignedSessionToken(token);
  if (statelessSession) {
    return statelessSession;
  }

  const legacySession = sessionStore.get(token);
  if (!legacySession || legacySession.expiresAt <= Date.now()) {
    return null;
  }

  return legacySession;
}

export async function createAuthSession(input: {
  address: string;
  idToken: string;
  userSalt: string;
}) {
  pruneExpiredSessions();

  const ticket = await googleClient.verifyIdToken({
    idToken: input.idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const googleSub = payload?.sub;
  if (!googleSub) {
    throw new Error('Google token missing subject');
  }

  const derivedAddress = normalizeSuiAddress(jwtToAddress(input.idToken, input.userSalt));
  const normalizedAddress = normalizeSuiAddress(input.address);

  if (derivedAddress !== normalizedAddress) {
    throw Object.assign(new Error('Address mismatch'), { status: 401 });
  }

  const expiresAt = Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000;
  const token = issueSignedSessionToken({
    address: normalizedAddress,
    expiresAt,
    googleSub,
  });

  return {
    address: normalizedAddress,
    expiresAt,
    sessionToken: token,
  };
}

export function createDemoAuthSession() {
  if (!JUDGE_MODE) {
    throw Object.assign(new Error('Judge mode is disabled'), { status: 404 });
  }
  if (!DEMO_ADDRESS) {
    throw new Error('Missing demo player address');
  }

  pruneExpiredSessions();

  const expiresAt = Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000;
  const token = issueSignedSessionToken({
    address: DEMO_ADDRESS,
    expiresAt,
    googleSub: 'judge-mode',
    judgeMode: true,
  });

  return {
    address: DEMO_ADDRESS,
    expiresAt,
    sessionToken: token,
    judgeMode: true,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const session = resolveAuthSessionToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.authSession = session;
  return next();
}
