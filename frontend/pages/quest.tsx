// pages/quest.tsx — Quest Screen [2.3] — Core gameplay loop
// BLUEPRINT.md Section 3: Happy Path data flow (Tx1 loot commit → Tx2 settlement)
// ADR-002: 2-Transaction pattern (Tx1 = server-submitted mission::generate_loot, Tx2 = PTB settlement)
// ADR-006: Game Server builds Tx2, Frontend co-signs and submits

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getAuthHeaders, getStoredSession } from '../auth/zklogin';
import { executeGasless, buildBattleTxAndExecute, GaslessError } from '../transactions/gasless';
import { e2eFetch } from '../lib/e2e';
import { buildExplorerTxUrl, CHAIN_LABEL } from '../lib/chain';

const SERVER_URL  = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';

interface StoredExpeditionState {
  address: string;
  heroId: string;
  missionType: 0 | 1 | 2;
  contractType: 0 | 1 | 2;
  stance: 0 | 1 | 2;
  sessionId: string;
  readyAtMs: number;
  tx1Digest: string;
}

function getExpeditionStorageKey(heroId: string): string {
  return `onerealm:expedition:${heroId}`;
}

type QuestStep =
  | 'select'        // [step 1] Choose mission type
  | 'tx1-pending'   // [step 2] Submitting Tx1 (loot commit)
  | 'tx1-done'      // [step 3] Tx1 confirmed — loot discovered!
  | 'expedition-wait'
  | 'tx2-pending'   // [step 4] Submitting Tx2 (battle + settle)
  | 'win'           // [step 5a] Battle won!
  | 'fail'          // [step 5b] Battle lost
  | 'error';        // Error state

interface QuestResult {
  txDigest: string;
  equipmentCount: number;
  materialCount: number;
}

export default function QuestPage() {
  const router       = useRouter();
  const heroId       = (router.query.heroId as string) || '';

  const [address, setAddress]       = useState<string | null>(null);
  const [missionType, setMissionType] = useState<0 | 1 | 2>(2); // 0=RAID, 1=HARVEST, 2=TRAINING
  const [contractType, setContractType] = useState<0 | 1 | 2>(0); // 0=STANDARD, 1=BOUNTY, 2=EXPEDITION
  const [stance, setStance]         = useState<0 | 1 | 2>(0); // 0=BALANCED, 1=AGGRESSIVE, 2=GUARDED
  const [step, setStep]             = useState<QuestStep>('select');
  const [sessionId, setSessionId]   = useState('');
  const [error, setError]           = useState('');
  const [result, setResult]         = useState<QuestResult | null>(null);
  const [tx1Digest, setTx1Digest]   = useState('');
  const [readyAtMs, setReadyAtMs]   = useState(0);
  const [nowMs, setNowMs]           = useState(0);

  useEffect(() => {
    if (!router.isReady) return;
    const session = getStoredSession();
    if (!session.address || !session.hasApiSession) { router.push('/'); return; }
    setAddress(session.address);
    if (!heroId) { router.push('/hero'); }
    if (heroId) {
      const stored = localStorage.getItem(getExpeditionStorageKey(heroId));
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as StoredExpeditionState;
          if (parsed.address === session.address && parsed.sessionId) {
            setMissionType(parsed.missionType);
            setContractType(parsed.contractType);
            setStance(parsed.stance);
            setSessionId(parsed.sessionId);
            setReadyAtMs(parsed.readyAtMs);
            setTx1Digest(parsed.tx1Digest);
            setStep('expedition-wait');
          }
        } catch {
          localStorage.removeItem(getExpeditionStorageKey(heroId));
        }
      }
    }
  }, [router.isReady, heroId]);

  useEffect(() => {
    if (step !== 'expedition-wait' || !readyAtMs) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [step, readyAtMs]);

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
      const createRes = await e2eFetch(`${SERVER_URL}/api/session/create`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ heroId, missionType, contractType, stance }),
      });

      if (!createRes.ok) throw new Error('Failed to create session');
      const { sessionId: newSessionId, readyAtMs: nextReadyAtMs } = await createRes.json();
      setSessionId(newSessionId);
      setReadyAtMs(nextReadyAtMs ?? 0);

      // E-01 FIX: Game Server submits Tx1 instead of Player (owned object limits)
      const lootRes = await e2eFetch(`${SERVER_URL}/api/session/loot`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId: newSessionId }),
      });
      if (!lootRes.ok) throw new Error('Failed to generate loot via server');
      const { tx1Digest } = await lootRes.json();
      
      setTx1Digest(tx1Digest);
      if (contractType === 2) {
        const storedExpedition: StoredExpeditionState = {
          address,
          heroId,
          missionType,
          contractType,
          stance,
          sessionId: newSessionId,
          readyAtMs: nextReadyAtMs ?? 0,
          tx1Digest,
        };
        localStorage.setItem(getExpeditionStorageKey(heroId), JSON.stringify(storedExpedition));
        setStep('expedition-wait');
      } else {
        setStep('tx1-done');
        setTimeout(() => handleSettleBattle(newSessionId), 2000);
      }

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
      // Game Server builds Tx2 PTB: settle_and_distribute(auth, session, hero)
      const tx2Result = await buildBattleTxAndExecute(sid, address!);

      const ownedObjectChanges = (tx2Result.objectChanges ?? []).filter((change: any) =>
        change.type === 'created' && change.owner?.AddressOwner === address
      );
      const equipmentCount = ownedObjectChanges.filter((change: any) =>
        change.objectType?.includes('::equipment::Equipment')
      ).length;
      const materialCount = ownedObjectChanges.filter((change: any) =>
        change.objectType?.includes('::material::Material')
      ).length;

      if (equipmentCount > 0 || materialCount > 0) {
        setResult({ txDigest: tx2Result.digest, equipmentCount, materialCount });
        setStep('win');
      } else {
        // BLUEPRINT.md: tx doesn't fail on battle-lose — session.status = FAILED, rewards = []
        setResult({ txDigest: tx2Result.digest, equipmentCount: 0, materialCount: 0 });
        setStep('fail');
      }
      if (heroId) {
        localStorage.removeItem(getExpeditionStorageKey(heroId));
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
    setReadyAtMs(0);
    setNowMs(0);
    if (heroId) {
      localStorage.removeItem(getExpeditionStorageKey(heroId));
    }
  }
  const expeditionReady = readyAtMs > 0 && nowMs >= readyAtMs;
  const expeditionCountdown = readyAtMs > nowMs ? formatCountdown(readyAtMs - nowMs) : 'Ready now';

  return (
    <main style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => router.push('/hero')} style={styles.backBtn}>← Back</button>
        <h1 style={styles.title}>⚔️ Quest</h1>
        <div />
      </header>
      <div style={styles.runtimeBadge}>Live on {CHAIN_LABEL} • Expedition progress survives refresh</div>
      {JUDGE_MODE && (
        <div style={styles.judgeBanner}>Judge Mode: expeditions resolve in about 30 seconds for demo flow.</div>
      )}

      {/* ── STEP: SELECT MISSION ── */}
      {step === 'select' && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Choose Mission</h2>
          <div style={styles.missionGrid}>
            <div
              style={{ ...styles.missionCard, ...(missionType === 0 ? styles.missionSelected : {}) }}
              onClick={() => setMissionType(0)}
            >
              <div style={styles.missionEmoji}>⚔️</div>
              <h3 style={styles.missionName}>Raid</h3>
              <p style={styles.missionDesc}>Boss Power: 35</p>
              <p style={styles.missionTip}>Hard combat, best odds for rare gear</p>
            </div>
            <div
              style={{ ...styles.missionCard, ...(missionType === 1 ? styles.missionSelected : {}) }}
              onClick={() => setMissionType(1)}
            >
              <div style={styles.missionEmoji}>⛏️</div>
              <h3 style={styles.missionName}>Harvest</h3>
              <p style={styles.missionDesc}>Boss Power: 18</p>
              <p style={styles.missionTip}>Material-heavy farming with lighter risk</p>
            </div>
            <div
              style={{ ...styles.missionCard, ...(missionType === 2 ? styles.missionSelected : {}) }}
              onClick={() => setMissionType(2)}
            >
              <div style={styles.missionEmoji}>📘</div>
              <h3 style={styles.missionName}>Training</h3>
              <p style={styles.missionDesc}>Boss Power: 8</p>
              <p style={styles.missionTip}>Low-risk runs for battle notes and warmup</p>
            </div>
          </div>
          <div style={styles.contractPanel}>
            <div style={styles.stanceTitle}>Choose Contract</div>
            <div style={styles.contractGrid}>
              <button style={{ ...styles.contractBtn, ...(contractType === 0 ? styles.contractSelected : {}) }} onClick={() => setContractType(0)}>
                📜 Standard
              </button>
              <button style={{ ...styles.contractBtn, ...(contractType === 1 ? styles.contractSelected : {}) }} onClick={() => setContractType(1)}>
                🏹 Bounty
              </button>
              <button style={{ ...styles.contractBtn, ...(contractType === 2 ? styles.contractSelected : {}) }} onClick={() => setContractType(2)}>
                🧭 Expedition
              </button>
            </div>
            <p style={styles.stanceHint}>
              {contractType === 0 && 'Standard: lower boss pressure, reliable loop for progression.'}
              {contractType === 1 && 'Bounty: tougher contract, richer drops and better material payout.'}
              {contractType === 2 && 'Expedition: delayed resolution, strongest payout curve, hero returns later.'}
            </p>
          </div>
          <div style={styles.stancePanel}>
            <div style={styles.stanceTitle}>Choose Stance</div>
            <div style={styles.stanceGrid}>
              <button style={{ ...styles.stanceBtn, ...(stance === 0 ? styles.stanceSelected : {}) }} onClick={() => setStance(0)}>
                ⚖️ Balanced
              </button>
              <button style={{ ...styles.stanceBtn, ...(stance === 1 ? styles.stanceSelected : {}) }} onClick={() => setStance(1)}>
                🔥 Aggressive
              </button>
              <button style={{ ...styles.stanceBtn, ...(stance === 2 ? styles.stanceSelected : {}) }} onClick={() => setStance(2)}>
                🛡 Guarded
              </button>
            </div>
            <p style={styles.stanceHint}>
              {stance === 0 && 'Balanced: stable choice, best all-round stance.'}
              {stance === 1 && 'Aggressive: strongest for Raid pushes and fast clears.'}
              {stance === 2 && 'Guarded: safer posture, strongest for Harvest stability.'}
            </p>
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
          <p style={styles.stepDesc}>Committing loot on-chain using native Move randomness...</p>
          <div style={styles.techNote}>
            Using native on-chain randomness — unmanipulable by anyone
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
          {tx1Digest && buildExplorerTxUrl(tx1Digest) && (
            <a href={buildExplorerTxUrl(tx1Digest)!} target="_blank" rel="noreferrer" style={styles.explorerLink}>
              View Tx1 on Explorer →
            </a>
          )}
        </div>
      )}

      {step === 'expedition-wait' && (
        <div style={styles.card}>
          <div style={styles.stepIndicator}>Expedition Underway</div>
          <div style={styles.progressAnim}>🧭</div>
          <p style={styles.stepDesc}>Your hero is out on an asynchronous expedition.</p>
          <div style={styles.techNote}>
            Expedition unlocks in <code>{expeditionCountdown}</code>
          </div>
          {tx1Digest && buildExplorerTxUrl(tx1Digest) && (
            <a href={buildExplorerTxUrl(tx1Digest)!} target="_blank" rel="noreferrer" style={styles.explorerLink}>
              View departure on Explorer →
            </a>
          )}
          <button
            style={{ ...styles.primaryBtn, opacity: expeditionReady ? 1 : 0.5 }}
            onClick={() => handleSettleBattle(sessionId)}
            disabled={!expeditionReady}
          >
            {expeditionReady ? 'Resolve Expedition' : 'Waiting for Return'}
          </button>
        </div>
      )}

      {/* ── STEP: TX2 PENDING — Battle resolving ── */}
      {step === 'tx2-pending' && (
        <div style={styles.card}>
          <div style={styles.stepIndicator}>Step 2/2 — Battle Resolution</div>
          <div style={styles.progressAnim}>⚡</div>
          <p style={styles.stepDesc}>Battle resolving atomically on-chain...</p>
          <div style={styles.techNote}>
            PTB: <code>contract + stance + affix + build resolve the encounter deterministically</code>
          </div>
        </div>
      )}

      {/* ── STEP: WIN 🏆 ── */}
      {step === 'win' && result && (
        <div style={styles.card}>
          <div style={styles.winBanner}>🏆 Quest Complete!</div>
          <p style={styles.winDesc}>
            You received <strong>{result.materialCount}</strong> material
            {result.materialCount !== 1 ? 's' : ''} and <strong>{result.equipmentCount}</strong> equipment item
            {result.equipmentCount !== 1 ? 's' : ''}!
          </p>
          <p style={styles.subtext}>Rewards are now in your wallet on-chain. Materials fuel the upcoming crafting loop.</p>

          {/* WOW #3 — View on-chain */}
          {buildExplorerTxUrl(result.txDigest) && (
            <a
              href={buildExplorerTxUrl(result.txDigest)!}
              target="_blank"
              rel="noreferrer"
              style={styles.explorerBtnWin}
            >
              🔍 View transaction on explorer
            </a>
          )}

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
            🤖 Tip: swap to Training or Harvest first, then come back for Raid when your build is ready.
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
  runtimeBadge: {
    alignSelf: 'center',
    background: 'rgba(96,165,250,0.14)',
    border: '1px solid rgba(96,165,250,0.28)',
    borderRadius: 999,
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: 700,
    margin: '0 auto 18px',
    padding: '8px 14px',
  },
  judgeBanner: {
    alignSelf: 'center',
    background: 'rgba(245,158,11,0.14)',
    border: '1px solid rgba(245,158,11,0.35)',
    borderRadius: 14,
    color: '#fde68a',
    fontSize: 13,
    fontWeight: 700,
    margin: '0 auto 18px',
    maxWidth: 520,
    padding: '10px 14px',
    textAlign: 'center',
  },
  card: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20, padding: '28px 24px', maxWidth: 480, margin: '0 auto', width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
  },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  missionGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, width: '100%' },
  missionCard: {
    background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)',
    borderRadius: 14, padding: '16px 12px', cursor: 'pointer', textAlign: 'center',
    transition: 'border-color 0.2s',
  },
  missionSelected: { borderColor: '#667eea', background: 'rgba(102,126,234,0.15)' },
  stancePanel: { width: '100%', background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, border: '1px solid rgba(255,255,255,0.08)' },
  contractPanel: { width: '100%', background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, border: '1px solid rgba(255,255,255,0.08)' },
  stanceTitle: { fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'rgba(255,255,255,0.78)' },
  contractGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  contractBtn: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 10, padding: '10px 8px', cursor: 'pointer', fontWeight: 700, fontSize: 12 },
  contractSelected: { borderColor: '#fcd34d', background: 'rgba(245,158,11,0.16)' },
  stanceGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  stanceBtn: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 10, padding: '10px 8px', cursor: 'pointer', fontWeight: 700, fontSize: 12 },
  stanceSelected: { borderColor: '#93c5fd', background: 'rgba(59,130,246,0.16)' },
  stanceHint: { margin: '10px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.58)', textAlign: 'center' },
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

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}
