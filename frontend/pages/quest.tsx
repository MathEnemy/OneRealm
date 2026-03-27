import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getAuthHeaders, getStoredSession } from '../auth/zklogin';
import { buildBattleTxAndExecute, GaslessError } from '../transactions/gasless';
import { ApiError, getRateLimitMessage, readApiError, type RateLimitDetails } from '../lib/api-errors';
import { e2eFetch } from '../lib/e2e';
import { buildExplorerTxUrl, CHAIN_LABEL } from '../lib/chain';
import { Button } from '../components/ui/Button';
import { Card, Badge } from '../components/ui/Card';
import { Spinner, Banner } from '../components/ui/Feedback';
import { PageHeader } from '../components/layout/PageHeader';
import { ChoiceCard } from '../components/ui/ChoiceCard';
import { Section } from '../components/ui/Section';
import { ErrorState, StatePanel } from '../components/ui/StatePanel';

const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';
const DEFAULT_EXPEDITION_DURATION_MS = 30000;

interface StoredExpeditionState {
  address: string;
  heroId: string;
  missionType: 0 | 1 | 2;
  contractType: 0 | 1 | 2;
  stance: 0 | 1 | 2;
  sessionId: string;
  startedAtMs?: number;
  readyAtMs: number;
  tx1Digest: string;
}

type QuestStep =
  | 'select'
  | 'tx1-pending'
  | 'tx1-done'
  | 'expedition-wait'
  | 'tx2-pending'
  | 'win'
  | 'fail'
  | 'error';

interface QuestResult {
  txDigest: string;
  equipmentCount: number;
  materialCount: number;
}

type MissionId = 0 | 1 | 2;
type ContractId = 0 | 1 | 2;
type StanceId = 0 | 1 | 2;

interface MissionDefinition {
  id: MissionId;
  name: string;
  code: string;
  emoji: string;
  difficulty: string;
  bp: number;
  rewardProfile: string;
  riskProfile: string;
  recommendedUse: string;
  description: string;
  terrain: string;
}

interface ContractDefinition {
  id: ContractId;
  name: string;
  label: string;
  desc: string;
  settlement: string;
}

interface StanceDefinition {
  id: StanceId;
  name: string;
  desc: string;
  attack: string;
  defense: string;
}

interface JourneyStep {
  key: number;
  label: string;
  title: string;
  detail: string;
}

const MISSIONS: MissionDefinition[] = [
  {
    id: 0,
    name: 'Raid',
    code: 'R-01',
    emoji: '⚔️',
    difficulty: 'High',
    bp: 35,
    rewardProfile: 'Gear-heavy drops with essence upside',
    riskProfile: 'Highest defeat risk and weakest fallback yield',
    recommendedUse: 'Best when your hero is already geared and you want equipment spikes',
    description: 'Push into hostile ground for premium combat loot.',
    terrain: 'Fortress breach',
  },
  {
    id: 1,
    name: 'Harvest',
    code: 'H-07',
    emoji: '⛏️',
    difficulty: 'Medium',
    bp: 18,
    rewardProfile: 'Reliable material gain and steady salvage inputs',
    riskProfile: 'Moderate pressure with efficient farming value',
    recommendedUse: 'Use for crafting loops, inventory rebuilding, and safer progression',
    description: 'Route the hero through extraction lanes for materials.',
    terrain: 'Resource field',
  },
  {
    id: 2,
    name: 'Training',
    code: 'T-03',
    emoji: '📘',
    difficulty: 'Low',
    bp: 8,
    rewardProfile: 'Lower output but safe repetition and warmup value',
    riskProfile: 'Minimal danger and clean recovery path',
    recommendedUse: 'Use for low-risk prep runs, testing stance choices, and recovery after losses',
    description: 'Controlled drills with a forgiving threat profile.',
    terrain: 'Practice grounds',
  },
];

const CONTRACTS: ContractDefinition[] = [
  {
    id: 0,
    name: 'Standard',
    label: 'Direct Run',
    desc: 'Normal synchronous resolution.',
    settlement: 'Starts and settles in one continuous flow.',
  },
  {
    id: 1,
    name: 'Bounty',
    label: 'High Stakes',
    desc: 'Higher risk, synchronous.',
    settlement: 'Fast resolution with more tactical pressure.',
  },
  {
    id: 2,
    name: 'Expedition',
    label: 'Async Return',
    desc: 'Asynchronous duration dispatch.',
    settlement: 'Tx1 commits now, settlement unlocks after the timer.',
  },
];

const STANCES: StanceDefinition[] = [
  {
    id: 0,
    name: 'Balanced',
    desc: 'Standard combat posture.',
    attack: 'Stable offense',
    defense: 'Stable defense',
  },
  {
    id: 1,
    name: 'Aggressive',
    desc: 'Boost ATK, lowers DEF.',
    attack: 'High attack',
    defense: 'Reduced defense',
  },
  {
    id: 2,
    name: 'Guarded',
    desc: 'Boost DEF, lowers ATK.',
    attack: 'Reduced attack',
    defense: 'High defense',
  },
];

const JOURNEY_STEPS: JourneyStep[] = [
  { key: 1, label: 'Step 1', title: 'Choose Mission', detail: 'Pick the mission profile.' },
  { key: 2, label: 'Step 2', title: 'Choose Contract', detail: 'Select synchronous or async execution.' },
  { key: 3, label: 'Step 3', title: 'Choose Stance', detail: 'Lock the combat posture.' },
  { key: 4, label: 'Step 4', title: 'Start Quest', detail: 'Submit Tx1 and commit the run.' },
  { key: 5, label: 'Step 5', title: 'Wait', detail: 'Expedition timer and persistence state.' },
  { key: 6, label: 'Step 6', title: 'Settle', detail: 'Submit Tx2 and resolve the outcome.' },
  { key: 7, label: 'Step 7', title: 'Report', detail: 'Review success or failure.' },
];

function getExpeditionStorageKey(heroId: string): string {
  return `onerealm:expedition:${heroId}`;
}

export default function QuestPage() {
  const router = useRouter();
  const heroId = (router.query.heroId as string) || '';

  const [address, setAddress] = useState<string | null>(null);
  const [missionType, setMissionType] = useState<MissionId>(2);
  const [contractType, setContractType] = useState<ContractId>(0);
  const [stance, setStance] = useState<StanceId>(0);
  const [step, setStep] = useState<QuestStep>('select');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<QuestResult | null>(null);
  const [tx1Digest, setTx1Digest] = useState('');
  const [readyAtMs, setReadyAtMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState(0);
  const [restoredExpedition, setRestoredExpedition] = useState(false);

  const selectedMission = MISSIONS[missionType];
  const selectedContract = CONTRACTS[contractType];
  const selectedStance = STANCES[stance];
  const isExpeditionContract = contractType === 2;
  const expeditionReady = step === 'expedition-wait' && readyAtMs > 0 && nowMs >= readyAtMs;
  const expeditionCountdown = readyAtMs > nowMs ? formatCountdown(readyAtMs - nowMs) : 'Ready now';
  const waitDurationMs = Math.max(DEFAULT_EXPEDITION_DURATION_MS, readyAtMs - startedAtMs, 1);
  const waitProgressPct =
    step === 'expedition-wait' && readyAtMs > 0
      ? Math.max(0, Math.min(100, ((waitDurationMs - Math.max(0, readyAtMs - nowMs)) / waitDurationMs) * 100))
      : 0;
  const activeJourneyStep = getActiveJourneyStep(step, contractType);
  const txStatus = getTxStatus(step, isExpeditionContract, expeditionReady);
  const totalObjects = (result?.equipmentCount ?? 0) + (result?.materialCount ?? 0);

  useEffect(() => {
    if (!router.isReady) return;
    const session = getStoredSession();
    if (!session.address || !session.hasApiSession) {
      router.push('/');
      return;
    }

    setAddress(session.address);
    if (!heroId) {
      router.push('/hero');
      return;
    }

    const stored = localStorage.getItem(getExpeditionStorageKey(heroId));
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as StoredExpeditionState;
      if (parsed.address === session.address && parsed.sessionId) {
        setMissionType(parsed.missionType);
        setContractType(parsed.contractType);
        setStance(parsed.stance);
        setSessionId(parsed.sessionId);
        setStartedAtMs(parsed.startedAtMs ?? Math.max(0, parsed.readyAtMs - DEFAULT_EXPEDITION_DURATION_MS));
        setReadyAtMs(parsed.readyAtMs);
        setTx1Digest(parsed.tx1Digest);
        setRestoredExpedition(true);
        setStep('expedition-wait');
      } else {
        localStorage.removeItem(getExpeditionStorageKey(heroId));
      }
    } catch {
      localStorage.removeItem(getExpeditionStorageKey(heroId));
    }
  }, [router.isReady, heroId]);

  useEffect(() => {
    if (step !== 'expedition-wait' || !readyAtMs) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [step, readyAtMs]);

  useEffect(() => {
    if (step !== 'tx1-done' || !sessionId) return;
    const timeout = window.setTimeout(() => {
      void handleSettleBattle(sessionId);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [step, sessionId]);

  async function handleStartQuest() {
    if (!address || !heroId) return;

    setError('');
    setResult(null);
    setRestoredExpedition(false);
    setStep('tx1-pending');

    try {
      const createRes = await e2eFetch(`${SERVER_URL}/api/session/create`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ heroId, missionType, contractType, stance }),
      });

      if (!createRes.ok) throw await readApiError(createRes, 'Failed to create session');
      const { sessionId: newSessionId, readyAtMs: nextReadyAtMs } = await createRes.json();
      const nextStartedAtMs = Date.now();
      setSessionId(newSessionId);
      setStartedAtMs(nextStartedAtMs);
      setReadyAtMs(nextReadyAtMs ?? 0);

      const lootRes = await e2eFetch(`${SERVER_URL}/api/session/loot`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId: newSessionId }),
      });

      if (!lootRes.ok) throw await readApiError(lootRes, 'Failed to generate loot via server');
      const { tx1Digest: nextTx1Digest } = await lootRes.json();
      setTx1Digest(nextTx1Digest);

      if (contractType === 2) {
        const storedExpedition: StoredExpeditionState = {
          address,
          heroId,
          missionType,
          contractType,
          stance,
          sessionId: newSessionId,
          startedAtMs: nextStartedAtMs,
          readyAtMs: nextReadyAtMs ?? 0,
          tx1Digest: nextTx1Digest,
        };
        localStorage.setItem(getExpeditionStorageKey(heroId), JSON.stringify(storedExpedition));
        setStep('expedition-wait');
        return;
      }

      setStep('tx1-done');
    } catch (e: any) {
      setError(handleQuestError(e));
      setStep('error');
    }
  }

  async function handleSettleBattle(sid: string) {
    setError('');
    setStep('tx2-pending');

    try {
      const tx2Result = await buildBattleTxAndExecute(sid, address!);

      const ownedObjectChanges = (tx2Result.objectChanges ?? []).filter(
        (change: any) => change.type === 'created' && change.owner?.AddressOwner === address
      );
      const equipmentCount = ownedObjectChanges.filter((change: any) =>
        change.objectType?.includes('::equipment::Equipment')
      ).length;
      const materialCount = ownedObjectChanges.filter((change: any) =>
        change.objectType?.includes('::material::Material')
      ).length;

      setResult({
        txDigest: tx2Result.digest,
        equipmentCount,
        materialCount,
      });
      setStep(equipmentCount > 0 || materialCount > 0 ? 'win' : 'fail');

      if (heroId) {
        localStorage.removeItem(getExpeditionStorageKey(heroId));
      }
      setRestoredExpedition(false);
    } catch (e: any) {
      setError(handleQuestError(e));
      setStep('error');
    }
  }

  function handleQuestError(e: any): string {
    if (e instanceof GaslessError) {
      if (e.code === 'RATE_LIMITED') return getRateLimitMessage(e.details);
      if (e.code === 'UNAUTHORIZED') return 'Session expired. Please login again.';
    }
    if (e instanceof ApiError) {
      if (e.status === 429) return getRateLimitMessage(e.details as RateLimitDetails);
      return e.message;
    }
    return e.message ?? 'Unknown error occurred';
  }

  function resetQuest() {
    setStep('select');
    setSessionId('');
    setResult(null);
    setError('');
    setTx1Digest('');
    setStartedAtMs(0);
    setReadyAtMs(0);
    setNowMs(0);
    setRestoredExpedition(false);
    if (heroId) {
      localStorage.removeItem(getExpeditionStorageKey(heroId));
    }
  }

  return (
    <main className="container" style={{ paddingBottom: 'var(--space-8)' }}>
      <PageHeader
        icon="🗺️"
        title="Quest Command"
        subtitle="Guide your hero through a full mission lifecycle with visible blockchain checkpoints and safe expedition persistence."
        breadcrumb={[{ label: 'OneRealm' }, { label: 'Hero', href: '/hero' }, { label: 'Quest' }]}
        secondaryCTA={{ label: '← Back to Hero', href: '/hero', variant: 'ghost' }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge variant="info">Live on {CHAIN_LABEL}</Badge>
          <Badge>{isExpeditionContract ? 'Async Contract Selected' : 'Direct Contract Selected'}</Badge>
          <Badge>{step === 'expedition-wait' ? 'Refresh Safe' : 'Gasless Flow'}</Badge>
        </div>
      </PageHeader>

      {JUDGE_MODE && (
        <div style={{ marginBottom: 24 }}>
          <Banner type="warning">
            Judge Mode: expeditions are reduced to about 30 seconds for testing. Timing behavior remains unchanged.
          </Banner>
        </div>
      )}

      <section
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          alignItems: 'start',
          marginBottom: 28,
        }}
      >
        <Card
          style={{
            padding: 24,
            background:
              'linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.82) 48%, rgba(59,130,246,0.16) 100%)',
            border: '1px solid rgba(96,165,250,0.22)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <div>
              <div style={eyebrowStyle}>Mission Lifecycle</div>
              <h2 style={{ margin: '6px 0 0', fontSize: 24 }}>Seven visible phases from briefing to report</h2>
            </div>
            <Badge variant="info">Current Step {activeJourneyStep}/7</Badge>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(144px, 1fr))',
              gap: 12,
            }}
          >
            {JOURNEY_STEPS.map((journey) => {
              const status = getJourneyStatus(journey.key, activeJourneyStep, contractType, step);
              const isActive = status === 'active';
              const isDone = status === 'done';
              const isSkipped = status === 'skipped';

              return (
                <div
                  key={journey.key}
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    minHeight: 122,
                    border: isActive
                      ? '1px solid rgba(96,165,250,0.7)'
                      : isDone
                        ? '1px solid rgba(16,185,129,0.4)'
                        : isSkipped
                          ? '1px solid rgba(148,163,184,0.2)'
                          : '1px solid rgba(255,255,255,0.08)',
                    background: isActive
                      ? 'linear-gradient(180deg, rgba(30,64,175,0.26), rgba(15,23,42,0.8))'
                      : isDone
                        ? 'linear-gradient(180deg, rgba(16,185,129,0.18), rgba(15,23,42,0.76))'
                        : isSkipped
                          ? 'rgba(15,23,42,0.5)'
                          : 'rgba(15,23,42,0.72)',
                    opacity: isSkipped ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 13,
                        background: isDone ? 'rgba(16,185,129,0.2)' : isActive ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.06)',
                        color: isDone ? '#6ee7b7' : isActive ? '#bfdbfe' : 'var(--text-muted)',
                      }}
                    >
                      {isSkipped ? '•' : isDone ? '✓' : journey.key}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: getStatusColor(status) }}>
                      {getJourneyStatusLabel(status)}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>
                      {journey.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{journey.title}</div>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)' }}>{journey.detail}</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card
          style={{
            padding: 22,
            background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(15,23,42,0.82))',
            border: '1px solid rgba(148,163,184,0.16)',
            position: 'sticky',
            top: 16,
          }}
        >
          <div style={eyebrowStyle}>Loadout Summary</div>
          <h2 style={{ margin: '6px 0 18px', fontSize: 22 }}>Selected mission package</h2>

          <div style={{ display: 'grid', gap: 12 }}>
            <SummaryBlock
              title="Mission"
              value={`${selectedMission.emoji} ${selectedMission.name}`}
              note={`${selectedMission.difficulty} difficulty · BP ${selectedMission.bp}`}
            />
            <SummaryBlock title="Contract" value={selectedContract.name} note={selectedContract.settlement} />
            <SummaryBlock title="Stance" value={selectedStance.name} note={`${selectedStance.attack} · ${selectedStance.defense}`} />
            <SummaryBlock
              title="Tx Status"
              value={txStatus.title}
              note={txStatus.detail}
              tone={txStatus.tone}
            />
            {sessionId && <SummaryBlock title="Session" value={truncateMiddle(sessionId, 18)} note="Quest session is active." />}
            {tx1Digest && <SummaryBlock title="Tx1 Digest" value={truncateMiddle(tx1Digest, 18)} note="Departure commit confirmed." />}
          </div>

          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge variant="warning">{selectedMission.rewardProfile}</Badge>
              <Badge>{selectedMission.riskProfile}</Badge>
            </div>
          </div>
        </Card>
      </section>

      {step === 'error' && (
        <ErrorState
          title="Mission Interrupted"
          message={error}
          style={{ margin: '24px auto 0', maxWidth: 720 }}
          actions={
            <>
              <Button variant="primary" onClick={resetQuest} style={{ minWidth: 200 }}>
                Reset Mission Flow
              </Button>
              <Button variant="ghost" onClick={() => router.push('/hero')} style={{ minWidth: 180 }}>
                Return to Hero
              </Button>
            </>
          }
        />
      )}

      {step === 'select' && (
        <section className="stack-md">
          <Section
            title="Choose mission"
            subtitle={<span><span style={eyebrowStyle}>Step 1</span><br />Compare identity, risk, and reward.</span>}
            actions={<Badge variant="info">Step 1</Badge>}
          >

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              {MISSIONS.map((mission) => {
                const isSelected = missionType === mission.id;
                return (
                  <ChoiceCard
                    key={mission.id}
                    onClick={() => setMissionType(mission.id)}
                    selected={isSelected}
                    tone="primary"
                    style={{
                      ...choiceCardStyle,
                      background: isSelected
                        ? 'linear-gradient(180deg, rgba(59,130,246,0.22), rgba(15,23,42,0.92))'
                        : 'linear-gradient(180deg, rgba(15,23,42,0.78), rgba(15,23,42,0.62))',
                      border: isSelected ? '1px solid rgba(96,165,250,0.72)' : '1px solid rgba(255,255,255,0.08)',
                      boxShadow: isSelected ? '0 0 0 1px rgba(96,165,250,0.28)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                          {mission.code}
                        </div>
                        <h3 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800 }}>
                          {mission.emoji} {mission.name}
                        </h3>
                      </div>
                      <Badge variant={mission.bp > 20 ? 'warning' : 'info'}>{mission.difficulty}</Badge>
                    </div>

                    <p style={{ margin: '12px 0 16px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{mission.description}</p>

                    <div style={statGridStyle}>
                      <StatPill label="Difficulty" value={`BP ${mission.bp}`} tone="warning" />
                      <StatPill label="Terrain" value={mission.terrain} />
                    </div>

                    <ChoiceMeta label="Reward Profile" value={mission.rewardProfile} />
                    <ChoiceMeta label="Risk Profile" value={mission.riskProfile} />
                    <ChoiceMeta label="Recommended Use" value={mission.recommendedUse} />
                  </ChoiceCard>
                );
              })}
            </div>
          </Section>

          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <Section title="Choose contract" subtitle={<span><span style={eyebrowStyle}>Step 2</span><br />Select the mission execution model.</span>}>

              <div style={{ display: 'grid', gap: 12 }}>
                {CONTRACTS.map((contract) => {
                  const isSelected = contractType === contract.id;
                  return (
                    <ChoiceCard
                      key={contract.id}
                      onClick={() => setContractType(contract.id)}
                      selected={isSelected}
                      tone="primary"
                      style={{
                        ...choiceRowStyle,
                        border: isSelected ? '1px solid rgba(96,165,250,0.72)' : '1px solid rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(37,99,235,0.16)' : 'rgba(15,23,42,0.6)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 17, fontWeight: 800 }}>{contract.name}</span>
                          <Badge variant={contract.id === 2 ? 'warning' : 'info'}>{contract.label}</Badge>
                        </div>
                        <div style={{ marginTop: 6, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{contract.desc}</div>
                        <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 13 }}>{contract.settlement}</div>
                      </div>
                    </ChoiceCard>
                  );
                })}
              </div>
            </Section>

            <Section title="Choose stance" subtitle={<span><span style={eyebrowStyle}>Step 3</span><br />Lock the combat posture.</span>}>

              <div style={{ display: 'grid', gap: 12 }}>
                {STANCES.map((stanceOption) => {
                  const isSelected = stance === stanceOption.id;
                  return (
                    <ChoiceCard
                      key={stanceOption.id}
                      onClick={() => setStance(stanceOption.id)}
                      selected={isSelected}
                      tone="warning"
                      style={{
                        ...choiceRowStyle,
                        border: isSelected ? '1px solid rgba(245,158,11,0.72)' : '1px solid rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(245,158,11,0.14)' : 'rgba(15,23,42,0.6)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 17, fontWeight: 800 }}>{stanceOption.name}</span>
                          <Badge variant={stanceOption.id === 1 ? 'warning' : 'info'}>{stanceOption.attack}</Badge>
                        </div>
                        <div style={{ marginTop: 6, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{stanceOption.desc}</div>
                        <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 13 }}>{stanceOption.defense}</div>
                      </div>
                    </ChoiceCard>
                  );
                })}
              </div>
            </Section>
          </div>

          <Card
            style={{
              ...panelStyle,
              background:
                'linear-gradient(135deg, rgba(30,41,59,0.92) 0%, rgba(15,23,42,0.94) 60%, rgba(217,119,6,0.14) 100%)',
              border: '1px solid rgba(245,158,11,0.22)',
            }}
          >
            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div>
                <div style={eyebrowStyle}>Step 4</div>
                <h2 style={{ margin: '6px 0 10px', fontSize: 24 }}>Start quest</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Tx1 will create the quest session and commit the loot seed. Expedition contracts persist locally so the wait state remains safe across refreshes.
                </p>
              </div>
              <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleStartQuest}
                  aria-label="Start Quest (Gasless)"
                  style={{ minHeight: 54, fontSize: 16, fontWeight: 800 }}
                >
                  Submit Tx1 and Deploy Hero
                </Button>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                  Selected route: {selectedMission.name} · {selectedContract.name} · {selectedStance.name}
                </div>
              </div>
            </div>
          </Card>
        </section>
      )}

      {(step === 'tx1-pending' || step === 'tx1-done' || step === 'tx2-pending') && (
        <StatePanel
          loading={step !== 'tx1-done'}
          icon={step === 'tx1-done' ? <span style={{ fontSize: 64 }}>✅</span> : undefined}
          eyebrow="Transaction State"
          title={step === 'tx1-pending' ? 'Pending Tx1' : step === 'tx1-done' ? 'Tx1 Confirmed' : 'Pending Tx2'}
          description={
            step === 'tx1-pending'
              ? 'Creating the mission session and committing the departure transaction. The quest cannot advance until Tx1 lands.'
              : step === 'tx1-done'
                ? 'The departure commit is confirmed. Synchronous contracts auto-advance into settlement after the short transition window.'
                : 'Submitting battle settlement and final reward resolution. This is the last on-chain checkpoint before the result report.'
          }
          style={{ ...stateCardStyle, textAlign: 'center' }}
        >
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 16 }}>
            <StatusTile label="Mission" value={selectedMission.name} />
            <StatusTile label="Contract" value={selectedContract.name} />
            <StatusTile label="Stance" value={selectedStance.name} />
          </div>
        </StatePanel>
      )}

      {step === 'expedition-wait' && (
        <section style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card
            style={{
              ...panelStyle,
              background:
                expeditionReady
                  ? 'linear-gradient(135deg, rgba(6,95,70,0.42), rgba(15,23,42,0.96))'
                  : 'linear-gradient(135deg, rgba(120,53,15,0.38), rgba(15,23,42,0.96))',
              border: expeditionReady ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.28)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
              <div>
                <div style={eyebrowStyle}>Step 5</div>
                <div style={{ marginTop: 6, color: '#fcd34d', fontWeight: 800 }}>Expedition Underway</div>
                <h2 style={{ margin: '6px 0 0', fontSize: 28 }}>
                  {expeditionReady ? 'Expedition ready for settlement' : 'Expedition in progress'}
                </h2>
              </div>
              <Badge variant={expeditionReady ? 'info' : 'warning'}>
                {expeditionReady ? 'Settlement Unlocked' : 'Waiting for Return'}
              </Badge>
            </div>

            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 0 }}>
              {restoredExpedition
                ? 'This expedition was restored from local storage. You can refresh safely; the stored session and timer remain visible until settlement succeeds.'
                : 'The expedition is now detached from this tab. You can leave and come back later without losing the pending return state.'}
            </p>

            <div
              style={{
                marginTop: 20,
                padding: 22,
                borderRadius: 18,
                background: 'rgba(2,6,23,0.56)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Countdown
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 42,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontWeight: 800,
                      color: expeditionReady ? '#6ee7b7' : '#fcd34d',
                    }}
                  >
                    {expeditionCountdown}
                  </div>
                  <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                    {expeditionReady ? 'Timer complete. Tx2 can be submitted now.' : 'Settlement remains locked until the return window completes.'}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <StatusTile label="Mission" value={selectedMission.name} />
                  <StatusTile label="Contract" value={selectedContract.name} />
                  <StatusTile label="Stance" value={selectedStance.name} />
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  <span>Progress</span>
                  <span>{Math.round(waitProgressPct)}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${waitProgressPct}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: expeditionReady
                        ? 'linear-gradient(90deg, rgba(16,185,129,0.8), rgba(110,231,183,1))'
                        : 'linear-gradient(90deg, rgba(245,158,11,0.7), rgba(251,191,36,1))',
                      transition: 'width 1s linear',
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
              <Button
                variant={expeditionReady ? 'primary' : 'ghost'}
                onClick={() => handleSettleBattle(sessionId)}
                disabled={!expeditionReady}
                style={{ minWidth: 220, minHeight: 50, fontWeight: 800 }}
              >
                {expeditionReady ? 'Resolve Expedition' : 'Waiting for Return'}
              </Button>
              <Button variant="secondary" onClick={() => window.location.reload()} style={{ minWidth: 180 }}>
                Refresh Page Safely
              </Button>
            </div>
          </Card>

          <Card style={panelStyle}>
            <div style={eyebrowStyle}>Stored Expedition</div>
            <h2 style={{ margin: '6px 0 18px', fontSize: 22 }}>Persistent mission dossier</h2>

            <div style={{ display: 'grid', gap: 12 }}>
              <SummaryBlock
                title="Persistence"
                value={restoredExpedition ? 'Restored from local storage' : 'Saved for safe refresh'}
                note="The local expedition record remains until Tx2 completes."
                tone={restoredExpedition ? 'info' : 'default'}
              />
              <SummaryBlock title="Hero" value={heroId || 'Unknown'} note="The stored key is scoped per hero." />
              <SummaryBlock title="Session" value={truncateMiddle(sessionId, 18)} note="Used again during settlement." />
              <SummaryBlock
                title="Countdown Target"
                value={readyAtMs ? new Date(readyAtMs).toLocaleString() : 'Pending'}
                note={JUDGE_MODE ? 'Judge mode timing applies.' : 'Production timing applies.'}
              />
              {tx1Digest && (
                <SummaryBlock
                  title="Departure Tx"
                  value={truncateMiddle(tx1Digest, 18)}
                  note="Tx1 was already accepted and is safe to inspect."
                />
              )}
            </div>

            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              {tx1Digest && buildExplorerTxUrl(tx1Digest) && (
                <a
                  href={buildExplorerTxUrl(tx1Digest)!}
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  View Tx1 on Explorer
                </a>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55 }}>
                Retry-safe behavior: if the page reloads before the timer completes, the stored expedition summary will repopulate this screen and continue the countdown.
              </div>
            </div>
          </Card>
        </section>
      )}

      {(step === 'win' || step === 'fail') && result && (
        <Card
          style={{
            ...panelStyle,
            background:
              step === 'win'
                ? 'linear-gradient(135deg, rgba(6,95,70,0.28), rgba(15,23,42,0.96))'
                : 'linear-gradient(135deg, rgba(127,29,29,0.3), rgba(15,23,42,0.96))',
            border: step === 'win' ? '1px solid rgba(16,185,129,0.28)' : '1px solid rgba(248,113,113,0.24)',
          }}
        >
          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div>
              <div style={eyebrowStyle}>Step 7</div>
              {step === 'win' && (
                <div style={{ color: '#a7f3d0', fontWeight: 800, marginTop: 8 }}>Quest Complete!</div>
              )}
              <h2 style={{ margin: '8px 0 10px', fontSize: 34, color: step === 'win' ? '#d1fae5' : '#fecaca' }}>
                {step === 'win' ? 'Mission Success' : 'Mission Failed'}
              </h2>
              <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {step === 'win'
                  ? 'The quest settled successfully and the reward objects were created for your address.'
                  : 'Settlement completed, but the hero returned without reward objects. The result still matters because the mission record is finalized.'}
              </p>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 18 }}>
                <ResultStat label="Equipment" value={String(result.equipmentCount)} tone={step === 'win' ? 'success' : 'danger'} />
                <ResultStat label="Materials" value={String(result.materialCount)} tone={step === 'win' ? 'success' : 'danger'} />
                <ResultStat label="Objects" value={String(totalObjects)} tone={step === 'win' ? 'success' : 'danger'} />
              </div>

              <Card style={{ padding: 18, background: 'rgba(2,6,23,0.48)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Reward Summary
                </div>
                <div style={{ marginTop: 10, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {step === 'win'
                    ? `Recovered ${result.equipmentCount} equipment object(s) and ${result.materialCount} material object(s).`
                    : 'No reward objects were created for this settlement. Reconfigure the mission package and try a safer route or stronger loadout.'}
                </div>
              </Card>
            </div>

            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <SummaryBlock title="Tx Digest" value={truncateMiddle(result.txDigest, 18)} note="Settlement transaction digest." />
              <SummaryBlock
                title="Next Action"
                value={step === 'win' ? 'Review inventory or run another mission' : 'Retool and retry'}
                note={
                  step === 'win'
                    ? 'Inventory will reflect any created objects from this settlement.'
                    : 'Training and Harvest are safer if you need to rebuild.'
                }
                tone={step === 'win' ? 'success' : 'warning'}
              />
              <SummaryBlock
                title="Mission Package"
                value={`${selectedMission.name} · ${selectedContract.name}`}
                note={`${selectedStance.name} stance`}
              />

              <div style={{ display: 'grid', gap: 10 }}>
                <Button variant="primary" onClick={resetQuest} style={{ minHeight: 50, fontWeight: 800 }}>
                  {step === 'win' ? 'Run Another Mission' : 'Rebuild Mission Plan'}
                </Button>
                <Button variant="secondary" onClick={() => router.push(`/inventory?heroId=${heroId}`)} style={{ minHeight: 50, fontWeight: 800 }}>
                  View Inventory
                </Button>
                <Button variant="ghost" onClick={() => router.push('/hero')} style={{ minHeight: 46 }}>
                  Return to Hero
                </Button>
              </div>

              {buildExplorerTxUrl(result.txDigest) && (
                <a href={buildExplorerTxUrl(result.txDigest)!} target="_blank" rel="noreferrer" style={linkStyle}>
                  View settlement on Explorer
                </a>
              )}
            </div>
          </div>
        </Card>
      )}
    </main>
  );
}

function SummaryBlock({
  title,
  value,
  note,
  tone = 'default',
}: {
  title: string;
  value: string;
  note: string;
  tone?: 'default' | 'info' | 'warning' | 'success';
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        border: `1px solid ${getToneBorder(tone)}`,
        background: getToneBackground(tone),
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)' }}>{note}</div>
    </div>
  );
}

function ChoiceMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{value}</div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 14,
        background: tone === 'warning' ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.05)',
        border: tone === 'warning' ? '1px solid rgba(245,158,11,0.18)' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        background: 'rgba(2,6,23,0.48)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'danger';
}) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 18,
        background: tone === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(248,113,113,0.12)',
        border: tone === 'success' ? '1px solid rgba(16,185,129,0.18)' : '1px solid rgba(248,113,113,0.18)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: tone === 'success' ? '#d1fae5' : '#fecaca' }}>{value}</div>
    </div>
  );
}

function getActiveJourneyStep(step: QuestStep, contractType: ContractId): number {
  switch (step) {
    case 'select':
      return 1;
    case 'tx1-pending':
    case 'tx1-done':
      return 4;
    case 'expedition-wait':
      return 5;
    case 'tx2-pending':
      return 6;
    case 'win':
    case 'fail':
    case 'error':
      return contractType === 2 ? 7 : 7;
    default:
      return 1;
  }
}

function getJourneyStatus(
  journeyKey: number,
  activeJourneyStep: number,
  contractType: ContractId,
  step: QuestStep
): 'done' | 'active' | 'upcoming' | 'skipped' {
  if (contractType !== 2 && journeyKey === 5 && ['tx2-pending', 'win', 'fail', 'error'].includes(step)) {
    return 'skipped';
  }
  if (journeyKey < activeJourneyStep) return 'done';
  if (journeyKey === activeJourneyStep) return 'active';
  return 'upcoming';
}

function getJourneyStatusLabel(status: 'done' | 'active' | 'upcoming' | 'skipped'): string {
  if (status === 'done') return 'Complete';
  if (status === 'active') return 'Active';
  if (status === 'skipped') return 'Skipped';
  return 'Queued';
}

function getStatusColor(status: 'done' | 'active' | 'upcoming' | 'skipped'): string {
  if (status === 'done') return '#6ee7b7';
  if (status === 'active') return '#bfdbfe';
  if (status === 'skipped') return '#94a3b8';
  return 'var(--text-muted)';
}

function getTxStatus(step: QuestStep, isExpeditionContract: boolean, expeditionReady: boolean) {
  if (step === 'tx1-pending') {
    return { title: 'Pending Tx1', detail: 'Creating session and committing departure.', tone: 'warning' as const };
  }
  if (step === 'tx1-done') {
    return { title: 'Tx1 Confirmed', detail: 'Waiting through transition into settlement.', tone: 'info' as const };
  }
  if (step === 'expedition-wait') {
    return {
      title: expeditionReady ? 'Waiting complete' : 'Waiting for expedition',
      detail: expeditionReady ? 'Tx2 can now be submitted.' : 'Timer is still active and refresh-safe.',
      tone: expeditionReady ? ('success' as const) : ('warning' as const),
    };
  }
  if (step === 'tx2-pending') {
    return { title: 'Pending Tx2', detail: 'Settlement transaction in progress.', tone: 'warning' as const };
  }
  if (step === 'win') {
    return { title: 'Success', detail: 'Settlement finalized with reward objects.', tone: 'success' as const };
  }
  if (step === 'fail') {
    return { title: 'Fail', detail: 'Settlement finalized without reward objects.', tone: 'warning' as const };
  }
  if (step === 'error') {
    return { title: 'Interrupted', detail: 'Mission flow stopped on an error.', tone: 'warning' as const };
  }
  return {
    title: isExpeditionContract ? 'Ready for Tx1' : 'Ready for launch',
    detail: 'Select the package and start the quest.',
    tone: 'default' as const,
  };
}

function getToneBorder(tone: 'default' | 'info' | 'warning' | 'success') {
  if (tone === 'info') return 'rgba(96,165,250,0.24)';
  if (tone === 'warning') return 'rgba(245,158,11,0.24)';
  if (tone === 'success') return 'rgba(16,185,129,0.24)';
  return 'rgba(255,255,255,0.08)';
}

function getToneBackground(tone: 'default' | 'info' | 'warning' | 'success') {
  if (tone === 'info') return 'rgba(37,99,235,0.12)';
  if (tone === 'warning') return 'rgba(245,158,11,0.1)';
  if (tone === 'success') return 'rgba(16,185,129,0.1)';
  return 'rgba(255,255,255,0.03)';
}

function truncateMiddle(value: string, visibleChars: number) {
  if (!value || value.length <= visibleChars) return value;
  const side = Math.max(4, Math.floor((visibleChars - 3) / 2));
  return `${value.slice(0, side)}...${value.slice(-side)}`;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

const eyebrowStyle = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.9,
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
};

const panelStyle = {
  padding: 24,
  background: 'linear-gradient(180deg, rgba(15,23,42,0.94), rgba(15,23,42,0.84))',
  border: '1px solid rgba(255,255,255,0.08)',
};

const choiceCardStyle = {
  padding: 20,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,0.08)',
};

const choiceRowStyle = {
  padding: 16,
  borderRadius: 18,
  textAlign: 'left' as const,
  cursor: 'pointer',
};

const stateCardStyle = {
  margin: '32px auto 0',
  maxWidth: 860,
  padding: 32,
  background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(15,23,42,0.82))',
  border: '1px solid rgba(96,165,250,0.18)',
};

const errorCardStyle = {
  margin: '24px auto 0',
  maxWidth: 720,
  textAlign: 'center' as const,
  padding: '36px 28px',
  background: 'linear-gradient(180deg, rgba(69,10,10,0.94), rgba(15,23,42,0.92))',
  border: '1px solid rgba(248,113,113,0.28)',
};

const statGridStyle = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
};

const linkStyle = {
  color: 'var(--text-secondary)',
  fontSize: 13,
  textDecoration: 'underline',
};
