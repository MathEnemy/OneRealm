'use client';
// pages/quest.tsx — Quest Screen [2.3] — Core gameplay loop
// BLUEPRINT.md Section 3: Happy Path data flow (Tx1 loot commit → Tx2 settlement)
// ADR-002: 2-Transaction pattern (Tx1 = entry loot::generate_loot, Tx2 = PTB settlement)
// ADR-006: Game Server builds Tx2, Frontend co-signs and submits

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getStoredSession } from '../auth/zklogin';
import { executeGasless, buildBattleTxAndExecute, GaslessError } from '../transactions/gasless';

const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'devnet';
const PACKAGE_ID  = process.env.NEXT_PUBLIC_ONEREALM_PACKAGE_ID!;
const SERVER_URL  = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

// Clock object on Sui: always "0x6"  (CONTRACTS.md: CLOCK_OBJECT_ID)
const CLOCK_OBJECT_ID = '0x6';
// Random object on Sui: always "0x8"
const RANDOM_OBJECT_ID = '0x8';

const suiClient = new SuiClient({ url: `https://fullnode.${SUI_NETWORK}.sui.io` });

type QuestStep =
  | 'select'        // [step 1] Choose mission type
  | 'tx1-pending'   // [step 2] Submitting Tx1 (loot commit)
  | 'tx1-done'      // [step 3] Tx1 confirmed — loot discovered!
  | 'tx2-pending'   // [step 4] Submitting Tx2 (battle + settle)
  | 'win'           // [step 5a] Battle won!
  | 'fail'          // [step 5b] Battle lost
  | 'error';        // Error state

interface QuestResult {
  txDigest: string;
  itemCount: number;
}

export default function QuestPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const heroId       = searchParams.get('heroId') ?? '';

  const [address, setAddress]       = useState<string | null>(null);
  const [missionType, setMissionType] = useState<0 | 1>(0); // 0=FOREST, 1=DUNGEON
  const [step, setStep]             = useState<QuestStep>('select');
  const [sessionId, setSessionId]   = useState('');
  const [error, setError]           = useState('');
  const [result, setResult]         = useState<QuestResult | null>(null);
  const [tx1Digest, setTx1Digest]   = useState('');

  useEffect(() => {
    const session = getStoredSession();
    if (!session.address) { router.push('/'); return; }
    setAddress(session.address);
    if (!heroId) { router.push('/hero'); }
  }, []);

  // ============================================================
  // Tx1: Create MissionSession + generate_loot (entry fun — ADR-002)
  // ============================================================
  async function handleStartQuest() {
    if (!address || !heroId) return;
    setError('');
    setStep('tx1-pending');

    try {
      // Step 1: Create MissionSession via Game Server
      // (Game Server calls mission::create_session and transfer to itself — ADR-004)
      const createRes = await fetch(`${SERVER_URL}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroId, playerAddress: address, missionType }),
      });

      if (!createRes.ok) throw new Error('Failed to create session');
      const { sessionId: newSessionId, createTxDigest } = await createRes.json();
      setSessionId(newSessionId);

      // Step 2: Build Tx1 — entry loot::generate_loot(Random, MissionSession)
      // CRITICAL (ADR-002): This is a STANDALONE transaction — CANNOT chain after Random MoveCall
      const tx1 = new Transaction();
      tx1.moveCall({
        target: `${PACKAGE_ID}::loot::generate_loot`,
        arguments: [
          tx1.object(RANDOM_OBJECT_ID),   // sui::random::Random (always "0x8")
          tx1.object(newSessionId),        // MissionSession (owned by game server)
        ],
      });
      tx1.setSender(address);

      const tx1Bytes = Buffer.from(await tx1.build({ client: suiClient })).toString('base64');

      // Step 3: Execute Tx1 gaslessly (WOW #2)
      const tx1Result = await executeGasless(tx1Bytes, address);
      setTx1Digest(tx1Result.digest);
      setStep('tx1-done');

      // Step 4: Auto-proceed to Tx2 after short reveal delay
      setTimeout(() => handleSettleBattle(newSessionId), 2000);

    } catch (e: any) {
      setError(handleQuestError(e));
      setStep('error');
    }
  }

  // ============================================================
  // Tx2: Battle + Settle + Distribute (PTB — ADR-006, ADR-010)
  // ============================================================
  async function handleSettleBattle(sid: string) {
    setStep('tx2-pending');
    try {
      // Game Server builds Tx2 PTB: total_power → settle → distribute (ADR-006)
      const tx2Result = await buildBattleTxAndExecute(sid, heroId, address!);

      // Detect win/lose from effects: check if new Equipment objects appeared
      const created = tx2Result.effects?.created ?? [];
      const equipmentCreated = created.filter((obj: any) =>
        obj.owner?.AddressOwner === address
      );

      if (equipmentCreated.length > 0) {
        setResult({ txDigest: tx2Result.digest, itemCount: equipmentCreated.length });
        setStep('win');
      } else {
        // BLUEPRINT.md: tx doesn't fail on battle-lose — session.status = FAILED, rewards = []
        setResult({ txDigest: tx2Result.digest, itemCount: 0 });
        setStep('fail');
      }
    } catch (e: any) {
      setError(handleQuestError(e));
      setStep('error');
    }
  }

  function handleQuestError(e: any): string {
    if (e instanceof GaslessError) {
      if (e.code === 'RATE_LIMITED') return 'Daily quest limit reached (10/day). Try again tomorrow.';
      if (e.code === 'UNAUTHORIZED') return 'Session expired. Please login again.';
    }
    return e.message ?? 'Unknown error occurred';
  }

  function resetQuest() {
    setStep('select');
    setSessionId('');
    setResult(null);
    setError('');
    setTx1Digest('');
  }

  const explorerUrl = (digest: string) =>
    `https://suiexplorer.com/txblock/${digest}?network=${SUI_NETWORK}`;

  return (
    <main style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => router.push('/hero')} style={styles.backBtn}>← Back</button>
        <h1 style={styles.title}>⚔️ Quest</h1>
        <div />
      </header>

      {/* ── STEP: SELECT MISSION ── */}
      {step === 'select' && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Choose Mission</h2>
          <div style={styles.missionGrid}>
            {/* Forest Quest */}
            <div
              style={{ ...styles.missionCard, ...(missionType === 0 ? styles.missionSelected : {}) }}
              onClick={() => setMissionType(0)}
            >
              <div style={styles.missionEmoji}>🌲</div>
              <h3 style={styles.missionName}>Forest Quest</h3>
              <p style={styles.missionDesc}>Boss Power: 20</p>
              <p style={styles.missionTip}>Beginner level — ~50% win with base hero</p>
            </div>
            {/* Dungeon Quest */}
            <div
              style={{ ...styles.missionCard, ...(missionType === 1 ? styles.missionSelected : {}) }}
              onClick={() => setMissionType(1)}
            >
              <div style={styles.missionEmoji}>🏚️</div>
              <h3 style={styles.missionName}>Dungeon Quest</h3>
              <p style={styles.missionDesc}>Boss Power: 35</p>
              <p style={styles.missionTip}>Expert level — requires full gear</p>
            </div>
          </div>
          <button style={styles.primaryBtn} onClick={handleStartQuest}>
            🗡 Start Quest (Gasless)
          </button>
        </div>
      )}

      {/* ── STEP: TX1 PENDING — Submitting loot commit ── */}
      {step === 'tx1-pending' && (
        <div style={styles.card}>
          <div style={styles.stepIndicator}>Step 1/2 — Committing Loot</div>
          <div style={styles.progressAnim}>🎲</div>
          <p style={styles.stepDesc}>Committing loot on-chain using Sui native randomness...</p>
          <div style={styles.techNote}>
            Using <code>sui::random::Random</code> — unmanipulable by anyone
          </div>
        </div>
      )}

      {/* ── STEP: TX1 DONE — Loot discovered ── */}
      {step === 'tx1-done' && (
        <div style={styles.card}>
          <div style={styles.stepIndicator}>Step 1/2 — Loot Committed ✅</div>
          <div style={styles.progressAnim}>📦</div>
          <p style={styles.stepDesc}>Loot discovered and committed on-chain!</p>
          <p style={styles.subtext}>Initiating battle resolution...</p>
          {tx1Digest && (
            <a href={explorerUrl(tx1Digest)} target="_blank" rel="noreferrer" style={styles.explorerLink}>
              View Tx1 on Explorer →
            </a>
          )}
        </div>
      )}

      {/* ── STEP: TX2 PENDING — Battle resolving ── */}
      {step === 'tx2-pending' && (
        <div style={styles.card}>
          <div style={styles.stepIndicator}>Step 2/2 — Battle Resolution</div>
          <div style={styles.progressAnim}>⚡</div>
          <p style={styles.stepDesc}>Battle resolving atomically on-chain...</p>
          <div style={styles.techNote}>
            PTB: <code>total_power → settle → distribute</code>
          </div>
        </div>
      )}

      {/* ── STEP: WIN 🏆 ── */}
      {step === 'win' && result && (
        <div style={styles.card}>
          <div style={styles.winBanner}>🏆 Quest Complete!</div>
          <p style={styles.winDesc}>
            You received <strong>{result.itemCount}</strong> equipment item
            {result.itemCount !== 1 ? 's' : ''}!
          </p>
          <p style={styles.subtext}>Items are now in your wallet on-chain. (WOW #3)</p>

          {/* WOW #3 — View on-chain */}
          <a
            href={explorerUrl(result.txDigest)}
            target="_blank"
            rel="noreferrer"
            style={styles.explorerBtnWin}
          >
            🔍 View on Sui Explorer
          </a>

          <div style={styles.actionRow}>
            <button style={styles.primaryBtn} onClick={resetQuest}>
              ⚔️ Quest Again
            </button>
            <button style={styles.secondaryBtn} onClick={() => router.push(`/inventory?heroId=${heroId}`)}>
              🎒 View Inventory
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: FAIL ── */}
      {step === 'fail' && result && (
        <div style={styles.card}>
          <div style={styles.failBanner}>💀 Quest Failed</div>
          <p style={styles.stepDesc}>Hero power insufficient to defeat the boss.</p>
          <div style={styles.aiPanel}>
            🤖 Tip: Equip weapon + armor to boost your power before attempting again.
          </div>
          <div style={styles.actionRow}>
            <button style={styles.primaryBtn} onClick={resetQuest}>
              Try Again
            </button>
            <button style={styles.secondaryBtn} onClick={() => router.push(`/inventory?heroId=${heroId}`)}>
              🎒 Equip Gear
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: ERROR ── */}
      {step === 'error' && (
        <div style={styles.card}>
          <div style={styles.failBanner}>⚠️ Error</div>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.primaryBtn} onClick={resetQuest}>Back</button>
        </div>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    fontFamily: "'Inter', sans-serif",
    color: '#fff',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' },
  title: { fontSize: 22, fontWeight: 800, margin: 0 },
  card: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20, padding: '28px 24px', maxWidth: 480, margin: '0 auto', width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
  },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  missionGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%' },
  missionCard: {
    background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)',
    borderRadius: 14, padding: '16px 12px', cursor: 'pointer', textAlign: 'center',
    transition: 'border-color 0.2s',
  },
  missionSelected: { borderColor: '#667eea', background: 'rgba(102,126,234,0.15)' },
  missionEmoji: { fontSize: 32, marginBottom: 6 },
  missionName:  { margin: '0 0 4px', fontSize: 14, fontWeight: 700 },
  missionDesc:  { margin: '0 0 4px', fontSize: 12, color: '#fbbf24' },
  missionTip:   { margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  primaryBtn: {
    width: '100%', background: 'linear-gradient(135deg,#667eea,#764ba2)',
    color: '#fff', border: 'none', borderRadius: 12, padding: '14px',
    fontWeight: 700, cursor: 'pointer', fontSize: 16,
  },
  secondaryBtn: {
    flex: 1, background: 'rgba(255,255,255,0.08)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12,
    padding: '12px', cursor: 'pointer',
  },
  actionRow:    { display: 'flex', gap: 10, width: '100%' },
  stepIndicator: { background: 'rgba(102,126,234,0.2)', borderRadius: 20, padding: '4px 14px', fontSize: 13, color: '#a5b4fc' },
  progressAnim: { fontSize: 60, animation: 'pulse 1.5s ease-in-out infinite' },
  stepDesc:    { margin: 0, textAlign: 'center', color: 'rgba(255,255,255,0.8)' },
  subtext:     { margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  techNote:    { background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  explorerLink: { color: '#818cf8', fontSize: 13, textDecoration: 'none' },
  explorerBtnWin: {
    display: 'block', width: '100%', textAlign: 'center',
    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: 12, padding: '12px', color: '#818cf8', textDecoration: 'none', fontWeight: 600,
  },
  winBanner:   { fontSize: 28, fontWeight: 800 },
  winDesc:     { margin: 0, fontSize: 16, textAlign: 'center' },
  failBanner:  { fontSize: 28, fontWeight: 800, color: '#fca5a5' },
  aiPanel:     { background: 'rgba(102,126,234,0.1)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: 'rgba(255,255,255,0.7)', width: '100%' },
  errorText:   { color: '#fca5a5', textAlign: 'center', margin: 0 },
};
