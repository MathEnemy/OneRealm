import { useEffect, useState } from 'react';
import type { NextRouter } from 'next/router';
import { getAuthHeaders, getStoredSession } from '../../auth/zklogin';
import { buildBattleTxAndExecute, GaslessError } from '../../transactions/gasless';
import { ApiError, getRateLimitMessage, readApiError, type RateLimitDetails } from '../../lib/api-errors';
import { e2eFetch } from '../../lib/e2e';
import { formatCountdown, getActiveJourneyStep, getTxStatus, type ContractId, type MissionId, type QuestResult, type QuestStep, type StanceId } from './model';

const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
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

function getExpeditionStorageKey(heroId: string): string {
  return `onerealm:expedition:${heroId}`;
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

export function useQuestFlow({
  heroId,
  router,
}: {
  heroId: string;
  router: NextRouter;
}) {
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

  const isExpeditionContract = contractType === 2;
  const expeditionReady = step === 'expedition-wait' && readyAtMs > 0 && nowMs >= readyAtMs;
  const expeditionCountdown = readyAtMs > nowMs ? formatCountdown(readyAtMs - nowMs) : 'Ready now';
  const waitDurationMs = Math.max(DEFAULT_EXPEDITION_DURATION_MS, readyAtMs - startedAtMs, 1);
  const waitProgressPct =
    step === 'expedition-wait' && readyAtMs > 0
      ? Math.max(0, Math.min(100, ((waitDurationMs - Math.max(0, readyAtMs - nowMs)) / waitDurationMs) * 100))
      : 0;
  const activeJourneyStep = getActiveJourneyStep(step);
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
  }, [router, heroId]);

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
    if (!address) return;
    setError('');
    setStep('tx2-pending');

    try {
      const tx2Result = await buildBattleTxAndExecute(sid, address);

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

  return {
    address,
    missionType,
    contractType,
    stance,
    step,
    sessionId,
    error,
    result,
    tx1Digest,
    readyAtMs,
    restoredExpedition,
    isExpeditionContract,
    expeditionReady,
    expeditionCountdown,
    waitProgressPct,
    activeJourneyStep,
    txStatus,
    totalObjects,
    setMissionType,
    setContractType,
    setStance,
    handleStartQuest,
    handleSettleBattle,
    resetQuest,
  };
}
