// index.ts — Express server entry point
// CONTRACTS.md: 3 API endpoints — POST /api/sponsor, /api/battle, /api/ai-hint
// ADR-006: Game Server is trusted Tx2 builder + sponsor relay
// ADR-008: Rate limit enforced per senderAddress

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { handleSponsor } from './sponsor';
import { createSession } from './session';
import { buildBattleTx } from './battle';
import { getAiHint } from './ai-hint';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// === Middleware ===
app.use(cors());
app.use(express.json());

// Request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// === Health check ===
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ================================================================
// POST /api/sponsor — Gasless relay (ADR-008, WOW #2)
// ================================================================
// INPUT:  { txBytes: string, senderAddress: string }
// OUTPUT: { sponsoredTxBytes: string, sponsorSig: string }
//       | { error: "Rate limited" }   HTTP 429
//       | { error: "Unauthorized" }   HTTP 401
// ================================================================
app.post('/api/sponsor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txBytes, senderAddress } = req.body;

    if (!txBytes || !senderAddress) {
      return res.status(400).json({ error: 'Missing txBytes or senderAddress' });
    }

    const result = await handleSponsor(txBytes, senderAddress);
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
// INPUT:  { heroId, playerAddress, missionType: 0|1 }
// OUTPUT: { sessionId: string, createTxDigest: string }
// Game Server self-signs and transfers session to itself (owned object)
// ================================================================
app.post('/api/session/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { heroId, playerAddress, missionType } = req.body;
    if (!heroId || !playerAddress || missionType === undefined) {
      return res.status(400).json({ error: 'Missing heroId, playerAddress, or missionType' });
    }
    const result = await createSession(heroId, playerAddress, missionType as 0 | 1);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// ================================================================
// POST /api/battle — Build Tx2 settlement PTB (ADR-006, WOW #3)
// ================================================================
// INPUT:  { sessionId: string, heroId: string, playerAddress: string }
// OUTPUT: { txBytes: string }  (base64-encoded Tx2 PTB bytes)
// ================================================================
app.post('/api/battle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, heroId, playerAddress } = req.body;

    if (!sessionId || !heroId || !playerAddress) {
      return res.status(400).json({ error: 'Missing sessionId, heroId, or playerAddress' });
    }

    const txBytes = await buildBattleTx(sessionId, heroId, playerAddress);
    return res.json({ txBytes });
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
  console.log(`   Network:    ${process.env.SUI_RPC_URL}`);
});

export default app;
