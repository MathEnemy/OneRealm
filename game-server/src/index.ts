// index.ts — Express server entry point
// CONTRACTS.md: auth, typed action, quest, and hint endpoints
// ADR-006: Game Server is trusted Tx2 builder and sponsor
// ADR-008: Rate limit enforced per authenticated address

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createSession, generateLoot, grantJudgeBundle, verifySessionOwnership, verifyHeroOwnership } from './session';
import { buildBattleTx } from './battle';
import {
  buildCraftAction,
  buildEquipAction,
  buildMintHeroAction,
  buildSalvageAction,
  buildUnequipAction,
} from './player-actions';
import { getAiHint } from './ai-hint';
import { createAuthSession, createDemoAuthSession, requireAuth } from './auth';
import { consumeDailyLimitOrThrow, RateLimitBucket } from './rate-limit';
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
    // Allow requests with no origin (server-to-server, health checks, curl)
    if (!origin) {
      callback(null, true);
      return;
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
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
      legacySponsorRelayEnabled: false,
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
app.use('/api/actions', requireAuth);
app.use('/api/session', requireAuth);
app.use('/api/battle', requireAuth);
app.use('/api/demo', requireAuth);

function consumeBucketOrThrow(address: string, bucket: RateLimitBucket) {
  consumeDailyLimitOrThrow(address, bucket);
}

function sendKnownError(err: any, res: Response): boolean {
  if (!err?.status) {
    return false;
  }
  res.status(err.status).json({ error: err.error ?? err.message, details: err.details });
  return true;
}

// ================================================================
// POST /api/sponsor — Legacy relay (hard-disabled)
// ================================================================
// INPUT:  { txBytes: string } + Authorization: Bearer <sessionToken>
// OUTPUT: { sponsoredTxBytes: string, sponsorSig: string }
//       | { error: "Rate limited", details: { bucket, count_today, limit, remaining, resetsAt } }   HTTP 429
//       | { error: "Unauthorized" }   HTTP 401
// ================================================================
app.post('/api/sponsor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(410).json({
      error: 'Legacy sponsor relay is disabled',
      details: {
        migration: 'Use typed /api/actions/* endpoints or /api/battle for settlement.',
      },
    });
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
    next(err);
  }
});

app.post('/api/actions/mint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authSession = req.authSession!;
    const { name, archetype, profession } = req.body;
    consumeBucketOrThrow(authSession.address, 'sponsor_action');
    const result = await buildMintHeroAction(authSession.address, String(name ?? ''), Number(archetype), Number(profession));
    return res.json(result);
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
    next(err);
  }
});

app.post('/api/actions/equip', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authSession = req.authSession!;
    const { heroId, slot, itemId } = req.body;
    if (!heroId || !slot || !itemId) {
      return res.status(400).json({ error: 'Missing heroId, slot, or itemId' });
    }
    consumeBucketOrThrow(authSession.address, 'sponsor_action');
    const result = await buildEquipAction(authSession.address, heroId, slot, itemId);
    return res.json(result);
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
    next(err);
  }
});

app.post('/api/actions/unequip', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authSession = req.authSession!;
    const { heroId, slot } = req.body;
    if (!heroId || !slot) {
      return res.status(400).json({ error: 'Missing heroId or slot' });
    }
    consumeBucketOrThrow(authSession.address, 'sponsor_action');
    const result = await buildUnequipAction(authSession.address, heroId, slot);
    return res.json(result);
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
    next(err);
  }
});

app.post('/api/actions/salvage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authSession = req.authSession!;
    const { itemId } = req.body;
    if (!itemId) {
      return res.status(400).json({ error: 'Missing itemId' });
    }
    consumeBucketOrThrow(authSession.address, 'sponsor_action');
    const result = await buildSalvageAction(authSession.address, itemId);
    return res.json(result);
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
    next(err);
  }
});

app.post('/api/actions/craft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authSession = req.authSession!;
    const { recipeId, heroId, materialIds } = req.body;
    if (recipeId === undefined || !heroId || !Array.isArray(materialIds)) {
      return res.status(400).json({ error: 'Missing recipeId, heroId, or materialIds' });
    }
    consumeBucketOrThrow(authSession.address, 'sponsor_action');
    const result = await buildCraftAction(authSession.address, Number(recipeId), heroId, materialIds);
    return res.json(result);
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
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
    
    await verifyHeroOwnership(heroId, authSession.address);

    consumeBucketOrThrow(authSession.address, 'quest_start');
    const result = await createSession(
      heroId,
      authSession.address,
      missionType as 0 | 1 | 2,
      contractType as 0 | 1 | 2,
      stance as 0 | 1 | 2,
    );
    return res.json(result);
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
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
    await verifySessionOwnership(sessionId, authSession.address);
    consumeBucketOrThrow(authSession.address, 'server_action');
    const digest = await generateLoot(sessionId);
    return res.json({ tx1Digest: digest });
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
    next(err);
  }
});

// ================================================================
// POST /api/battle — Build Tx2 settlement PTB (ADR-006, WOW #3)
// ================================================================
// INPUT:  { sessionId: string } + Authorization: Bearer <sessionToken>
// OUTPUT: { txBytes: string, sponsorSig: string }  (base64-encoded Tx2 PTB bytes + sponsor signature)
// ================================================================
app.post('/api/battle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.body;
    const authSession = req.authSession!;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const result = await buildBattleTx(sessionId, authSession.address);
    return res.json(result);
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
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
  } catch (err: any) {
    if (sendKnownError(err, res)) {
      return;
    }
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
  res.status(500).json({ error: 'Internal server error' });
});

// === Start ===
app.listen(PORT, () => {
  console.log(`🎮 OneRealm Game Server running on http://localhost:${PORT}`);
  console.log(`   Package ID: ${process.env.ONEREALM_PACKAGE_ID}`);
  console.log(`   Sponsor:    ${process.env.SPONSOR_ADDRESS}`);
  console.log(`   Network:    ${CHAIN_LABEL} (${CHAIN_RPC_URL})`);
});

export default app;
