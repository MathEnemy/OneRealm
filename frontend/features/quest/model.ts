export type QuestStep =
  | 'select'
  | 'tx1-pending'
  | 'tx1-done'
  | 'expedition-wait'
  | 'tx2-pending'
  | 'win'
  | 'fail'
  | 'error';

export interface QuestResult {
  txDigest: string;
  equipmentCount: number;
  materialCount: number;
}

export type MissionId = 0 | 1 | 2;
export type ContractId = 0 | 1 | 2;
export type StanceId = 0 | 1 | 2;

export interface MissionDefinition {
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

export interface ContractDefinition {
  id: ContractId;
  name: string;
  label: string;
  desc: string;
  settlement: string;
}

export interface StanceDefinition {
  id: StanceId;
  name: string;
  desc: string;
  attack: string;
  defense: string;
}

export interface JourneyStep {
  key: number;
  label: string;
  title: string;
  detail: string;
}

export const MISSIONS: MissionDefinition[] = [
  { id: 0, name: 'Raid', code: 'R-01', emoji: '⚔️', difficulty: 'High', bp: 35, rewardProfile: 'Gear-heavy drops with essence upside', riskProfile: 'Highest defeat risk and weakest fallback yield', recommendedUse: 'Best when your hero is already geared and you want equipment spikes', description: 'Push into hostile ground for premium combat loot.', terrain: 'Fortress breach' },
  { id: 1, name: 'Harvest', code: 'H-07', emoji: '⛏️', difficulty: 'Medium', bp: 18, rewardProfile: 'Reliable material gain and steady salvage inputs', riskProfile: 'Moderate pressure with efficient farming value', recommendedUse: 'Use for crafting loops, inventory rebuilding, and safer progression', description: 'Route the hero through extraction lanes for materials.', terrain: 'Resource field' },
  { id: 2, name: 'Training', code: 'T-03', emoji: '📘', difficulty: 'Low', bp: 8, rewardProfile: 'Lower output but safe repetition and warmup value', riskProfile: 'Minimal danger and clean recovery path', recommendedUse: 'Use for low-risk prep runs, testing stance choices, and recovery after losses', description: 'Controlled drills with a forgiving threat profile.', terrain: 'Practice grounds' },
];

export const CONTRACTS: ContractDefinition[] = [
  { id: 0, name: 'Standard', label: 'Direct Run', desc: 'Normal synchronous resolution.', settlement: 'Starts and settles in one continuous flow.' },
  { id: 1, name: 'Bounty', label: 'High Stakes', desc: 'Higher risk, synchronous.', settlement: 'Fast resolution with more tactical pressure.' },
  { id: 2, name: 'Expedition', label: 'Async Return', desc: 'Asynchronous duration dispatch.', settlement: 'Tx1 commits now, settlement unlocks after the timer.' },
];

export const STANCES: StanceDefinition[] = [
  { id: 0, name: 'Balanced', desc: 'Standard combat posture.', attack: 'Stable offense', defense: 'Stable defense' },
  { id: 1, name: 'Aggressive', desc: 'Boost ATK, lowers DEF.', attack: 'High attack', defense: 'Reduced defense' },
  { id: 2, name: 'Guarded', desc: 'Boost DEF, lowers ATK.', attack: 'Reduced attack', defense: 'High defense' },
];

export const JOURNEY_STEPS: JourneyStep[] = [
  { key: 1, label: 'Step 1', title: 'Choose Mission', detail: 'Pick the mission profile.' },
  { key: 2, label: 'Step 2', title: 'Choose Contract', detail: 'Select synchronous or async execution.' },
  { key: 3, label: 'Step 3', title: 'Choose Stance', detail: 'Lock the combat posture.' },
  { key: 4, label: 'Step 4', title: 'Start Quest', detail: 'Submit Tx1 and commit the run.' },
  { key: 5, label: 'Step 5', title: 'Wait', detail: 'Expedition timer and persistence state.' },
  { key: 6, label: 'Step 6', title: 'Settle', detail: 'Submit Tx2 and resolve the outcome.' },
  { key: 7, label: 'Step 7', title: 'Report', detail: 'Review success or failure.' },
];

export function getActiveJourneyStep(step: QuestStep): number {
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
      return 7;
    default:
      return 1;
  }
}

export function getJourneyStatus(
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

export function getJourneyStatusLabel(status: 'done' | 'active' | 'upcoming' | 'skipped'): string {
  if (status === 'done') return 'Complete';
  if (status === 'active') return 'Active';
  if (status === 'skipped') return 'Skipped';
  return 'Queued';
}

export function getStatusColor(status: 'done' | 'active' | 'upcoming' | 'skipped'): string {
  if (status === 'done') return '#6ee7b7';
  if (status === 'active') return '#bfdbfe';
  if (status === 'skipped') return '#94a3b8';
  return 'var(--text-muted)';
}

export function getTxStatus(step: QuestStep, isExpeditionContract: boolean, expeditionReady: boolean) {
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

export function truncateMiddle(value: string, visibleChars: number) {
  if (!value || value.length <= visibleChars) return value;
  const side = Math.max(4, Math.floor((visibleChars - 3) / 2));
  return `${value.slice(0, side)}...${value.slice(-side)}`;
}

export function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}
