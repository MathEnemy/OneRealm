// index.ts — Express server entry point
// CONTRACTS.md: 3 API endpoints — POST /api/sponsor, /api/battle, /api/ai-hint
// ADR-006: Game Server is trusted Tx2 builder + sponsor relay
// ADR-008: Rate limit enforced per authenticated address

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { handleSponsor } from './sponsor';
import { createSession, generateLoot, grantJudgeBundle } from './session';
import { buildBattleTx } from './battle';
import { getAiHint } from './ai-hint';
import { createAuthSession, createDemoAuthSession, requireAuth } from './auth';
import { checkDailyLimit, consumeDailyLimit, getDailyCount } from './rate-limit';
import { verifySponsoredTransaction } from './tx-policy';
import { CHAIN_DOCS_URL, CHAIN_FLAVOR, CHAIN_LABEL, CHAIN_NETWORK, CHAIN_RPC_URL, ONEBOX_URL } from './chain';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const JUDGE_MODE = process.env.JUDGE_MODE === 'true';
const JUDGE_EXPEDITION_MS = Number(process.env.JUDGE_EXPEDITION_MS ?? '90000');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// === Middleware ===
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));
app.use(express.json());

// Request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// === Health check ===
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    chain: {
      flavor: CHAIN_FLAVOR,
      label: CHAIN_LABEL,
      network: CHAIN_NETWORK,
      rpcUrl: CHAIN_RPC_URL,
    },
    project: {
      name: 'OneRealm',
      track: 'GameFi',
      packageId: process.env.ONEREALM_PACKAGE_ID,
      gameAuthorityObjectId: process.env.GAME_AUTHORITY_OBJECT_ID,
      sponsorAddress: process.env.SPONSOR_ADDRESS,
      judgeMode: JUDGE_MODE,
      judgeExpeditionMs: JUDGE_EXPEDITION_MS,
    },
    integrations: [
      'OneChain Move runtime',
      'Sponsored transactions',
      'Owned-object session authority',
      'OnePredict-ready AI mentor',
      'OnePlay-ready GameFi UX',
    ],
    resources: {
      docs: CHAIN_DOCS_URL,
      onebox: ONEBOX_URL,
    },
  });
});

app.post('/api/auth/demo', (_req: Request, res: Response, next: NextFunction) => {
  try {
    return res.json(createDemoAuthSession());
  } catch (err: any) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

app.post('/api/auth/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken, address, userSalt } = req.body;
    if (!idToken || !address || !userSalt) {
      return res.status(400).json({ error: 'Missing idToken, address, or userSalt' });
    }

    const session = await createAuthSession({ idToken, address, userSalt });
    return res.json(session);
  } catch (err: any) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

app.use('/api/sponsor', requireAuth);
app.use('/api/session', requireAuth);
app.use('/api/battle', requireAuth);
app.use('/api/demo', requireAuth);

function consumeQuotaOrThrow(address: string) {
  checkDailyLimit(address);
  consumeDailyLimit(address);
}

// ================================================================
// POST /api/sponsor — Gasless relay (ADR-008, WOW #2)
// ================================================================
// INPUT:  { txBytes: string } + Authorization: Bearer <sessionToken>
// OUTPUT: { sponsoredTxBytes: string, sponsorSig: string }
//       | { error: "Rate limited" }   HTTP 429
//       | { error: "Unauthorized" }   HTTP 401
// ================================================================
app.post('/api/sponsor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txBytes } = req.body;
    const authSession = req.authSession!;

    if (!txBytes) {
      return res.status(400).json({ error: 'Missing txBytes' });
    }

    verifySponsoredTransaction(txBytes, authSession.address);
    consumeQuotaOrThrow(authSession.address);

    const result = await handleSponsor(txBytes);
    return res.json(result);
  } catch (err: any) {
    // Rate limit throws { status: 429, error: ... }
    if (err.status) {
      return res.status(err.status).json({ error: err.error, details: err.details });
    }
    next(err);
  }
});

// ================================================================
// POST /api/session/create — Create MissionSession (ADR-004)
// ================================================================
// INPUT:  { heroId, missionType: 0|1|2, contractType: 0|1|2, stance: 0|1|2 } + Authorization: Bearer <sessionToken>
// OUTPUT: { sessionId: string, createTxDigest: string, readyAtMs: number }
// Game Server self-signs and transfers session to itself (owned object)
// ================================================================
app.post('/api/session/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { heroId, missionType, contractType, stance } = req.body;
    const authSession = req.authSession!;
    if (!heroId || missionType === undefined || contractType === undefined || stance === undefined) {
      return res.status(400).json({ error: 'Missing heroId, missionType, contractType, or stance' });
    }
    consumeQuotaOrThrow(authSession.address);
    const result = await createSession(
      heroId,
      authSession.address,
      missionType as 0 | 1 | 2,
      contractType as 0 | 1 | 2,
      stance as 0 | 1 | 2,
    );
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// ================================================================
// POST /api/session/loot — Generate Loot (Tx1 for E-01 fix)
// ================================================================
// INPUT:  { sessionId: string } + Authorization: Bearer <sessionToken>
// OUTPUT: { tx1Digest: string }
// Game Server self-signs and submits Tx1 as session owner
// ================================================================
app.post('/api/session/loot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.body;
    const authSession = req.authSession!;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }
    consumeQuotaOrThrow(authSession.address);
    const digest = await generateLoot(sessionId, authSession.address);
    return res.json({ tx1Digest: digest });
  } catch (err) {
    next(err);
  }
});

// ================================================================
// POST /api/battle — Build Tx2 settlement PTB (ADR-006, WOW #3)
// ================================================================
// INPUT:  { sessionId: string } + Authorization: Bearer <sessionToken>
// OUTPUT: { txBytes: string }  (base64-encoded Tx2 PTB bytes)
// ================================================================
app.post('/api/battle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.body;
    const authSession = req.authSession!;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const txBytes = await buildBattleTx(sessionId, authSession.address);
    return res.json({ txBytes });
  } catch (err) {
    next(err);
  }
});

app.post('/api/demo/bootstrap', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!JUDGE_MODE) {
      return res.status(404).json({ error: 'Judge mode is disabled' });
    }
    const authSession = req.authSession!;
    const txDigest = await grantJudgeBundle(authSession.address);
    return res.json({ txDigest });
  } catch (err) {
    next(err);
  }
});

// ================================================================
// POST /api/ai-hint — Mock AI Mentor (ADR-011)
// ================================================================
// INPUT:  { heroPower: number, equippedSlots: number }
// OUTPUT: { hint: string, readiness: number, recommended_quest: string }
// IDEMPOTENT: CÓ — same input → same output (pure function)
// ================================================================
app.post('/api/ai-hint', (req: Request, res: Response) => {
  const { heroPower, equippedSlots } = req.body;

  if (typeof heroPower !== 'number' || typeof equippedSlots !== 'number') {
    return res.status(400).json({ error: 'heroPower and equippedSlots must be numbers' });
  }

  const result = getAiHint(heroPower, equippedSlots);
  return res.json(result);
});

// === Global error handler ===
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// === Start ===
app.listen(PORT, () => {
  console.log(`🎮 OneRealm Game Server running on http://localhost:${PORT}`);
  console.log(`   Package ID: ${process.env.ONEREALM_PACKAGE_ID}`);
  console.log(`   Sponsor:    ${process.env.SPONSOR_ADDRESS}`);
  console.log(`   Network:    ${CHAIN_LABEL} (${CHAIN_RPC_URL})`);
});

export default app;
