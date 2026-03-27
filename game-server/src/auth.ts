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
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

interface SessionRecord {
  address: string;
  expiresAt: number;
  googleSub: string;
  token: string;
}

export interface AuthSession {
  address: string;
  expiresAt: number;
  googleSub: string;
  token: string;
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

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000;

  sessionStore.set(token, {
    address: normalizedAddress,
    expiresAt,
    googleSub,
    token,
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

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000;

  sessionStore.set(token, {
    address: DEMO_ADDRESS,
    expiresAt,
    googleSub: 'judge-mode',
    token,
  });

  return {
    address: DEMO_ADDRESS,
    expiresAt,
    sessionToken: token,
    judgeMode: true,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  pruneExpiredSessions();

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const session = sessionStore.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.authSession = session;
  return next();
}
