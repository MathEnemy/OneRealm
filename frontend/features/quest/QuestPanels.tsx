import React from 'react';
import { Button } from '../../components/ui/Button';
import { Card, Badge } from '../../components/ui/Card';
import { ChoiceCard } from '../../components/ui/ChoiceCard';
import { Section } from '../../components/ui/Section';
import { StatePanel } from '../../components/ui/StatePanel';
import { buildExplorerTxUrl } from '../../lib/chain';
import { CONTRACTS, JOURNEY_STEPS, MISSIONS, STANCES, getJourneyStatus, getJourneyStatusLabel, getStatusColor, truncateMiddle, type ContractId, type MissionId, type QuestResult, type QuestStep, type StanceId } from './model';
import { ChoiceMeta, ResultStat, StatPill, StatusTile, SummaryBlock, choiceCardStyle, choiceRowStyle, eyebrowStyle, linkStyle, panelStyle, statGridStyle, stateCardStyle } from './ui';

export function QuestLifecycleOverview({
  activeJourneyStep,
  contractType,
  step,
  selectedMission,
  selectedContract,
  selectedStance,
  txStatus,
  sessionId,
  tx1Digest,
}: {
  activeJourneyStep: number;
  contractType: ContractId;
  step: QuestStep;
  selectedMission: (typeof MISSIONS)[number];
  selectedContract: (typeof CONTRACTS)[number];
  selectedStance: (typeof STANCES)[number];
  txStatus: { title: string; detail: string; tone: 'default' | 'info' | 'warning' | 'success' };
  sessionId: string;
  tx1Digest: string;
}) {
  return (
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
          background: 'linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.82) 48%, rgba(59,130,246,0.16) 100%)',
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(144px, 1fr))', gap: 12 }}>
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
          <SummaryBlock title="Mission" value={`${selectedMission.emoji} ${selectedMission.name}`} note={`${selectedMission.difficulty} difficulty · BP ${selectedMission.bp}`} />
          <SummaryBlock title="Contract" value={selectedContract.name} note={selectedContract.settlement} />
          <SummaryBlock title="Stance" value={selectedStance.name} note={`${selectedStance.attack} · ${selectedStance.defense}`} />
          <SummaryBlock title="Tx Status" value={txStatus.title} note={txStatus.detail} tone={txStatus.tone} />
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
  );
}

export function QuestSelectionPanel({
  missionType,
  contractType,
  stance,
  onMissionChange,
  onContractChange,
  onStanceChange,
  onStartQuest,
  selectedMission,
  selectedContract,
  selectedStance,
}: {
  missionType: MissionId;
  contractType: ContractId;
  stance: StanceId;
  onMissionChange: (value: MissionId) => void;
  onContractChange: (value: ContractId) => void;
  onStanceChange: (value: StanceId) => void;
  onStartQuest: () => void;
  selectedMission: (typeof MISSIONS)[number];
  selectedContract: (typeof CONTRACTS)[number];
  selectedStance: (typeof STANCES)[number];
}) {
  return (
    <section className="stack-md">
      <Section title="Choose mission" subtitle={<span><span style={eyebrowStyle}>Step 1</span><br />Compare identity, risk, and reward.</span>} actions={<Badge variant="info">Step 1</Badge>}>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          {MISSIONS.map((mission) => {
            const isSelected = missionType === mission.id;
            return (
              <ChoiceCard
                key={mission.id}
                onClick={() => onMissionChange(mission.id)}
                selected={isSelected}
                tone="primary"
                data-testid={`quest-mission-${mission.id}`}
                style={{
                  ...choiceCardStyle,
                  background: isSelected ? 'linear-gradient(180deg, rgba(59,130,246,0.22), rgba(15,23,42,0.92))' : 'linear-gradient(180deg, rgba(15,23,42,0.78), rgba(15,23,42,0.62))',
                  border: isSelected ? '1px solid rgba(96,165,250,0.72)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: isSelected ? '0 0 0 1px rgba(96,165,250,0.28)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{mission.code}</div>
                    <h3 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800 }}>{mission.emoji} {mission.name}</h3>
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
                  onClick={() => onContractChange(contract.id)}
                  selected={isSelected}
                  tone="primary"
                  data-testid={`quest-contract-${contract.id}`}
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
                  onClick={() => onStanceChange(stanceOption.id)}
                  selected={isSelected}
                  tone="warning"
                  data-testid={`quest-stance-${stanceOption.id}`}
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
          background: 'linear-gradient(135deg, rgba(30,41,59,0.92) 0%, rgba(15,23,42,0.94) 60%, rgba(217,119,6,0.14) 100%)',
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
            <Button variant="primary" fullWidth onClick={onStartQuest} aria-label="Start Quest (Gasless)" data-testid="quest-start-button" style={{ minHeight: 54, fontSize: 16, fontWeight: 800 }}>
              Submit Tx1 and Deploy Hero
            </Button>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
              Selected route: {selectedMission.name} · {selectedContract.name} · {selectedStance.name}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

export function QuestTransactionPanel({
  step,
  selectedMission,
  selectedContract,
  selectedStance,
}: {
  step: QuestStep;
  selectedMission: (typeof MISSIONS)[number];
  selectedContract: (typeof CONTRACTS)[number];
  selectedStance: (typeof STANCES)[number];
}) {
  return (
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
  );
}

export function ExpeditionPanel({
  expeditionReady,
  restoredExpedition,
  expeditionCountdown,
  waitProgressPct,
  selectedMission,
  selectedContract,
  selectedStance,
  onSettle,
  onRefresh,
  sessionId,
  heroId,
  readyAtMs,
  tx1Digest,
  judgeMode,
}: {
  expeditionReady: boolean;
  restoredExpedition: boolean;
  expeditionCountdown: string;
  waitProgressPct: number;
  selectedMission: (typeof MISSIONS)[number];
  selectedContract: (typeof CONTRACTS)[number];
  selectedStance: (typeof STANCES)[number];
  onSettle: () => void;
  onRefresh: () => void;
  sessionId: string;
  heroId: string;
  readyAtMs: number;
  tx1Digest: string;
  judgeMode: boolean;
}) {
  return (
    <section style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <Card
        data-testid="quest-expedition-panel"
        style={{
          ...panelStyle,
          background: expeditionReady ? 'linear-gradient(135deg, rgba(6,95,70,0.42), rgba(15,23,42,0.96))' : 'linear-gradient(135deg, rgba(120,53,15,0.38), rgba(15,23,42,0.96))',
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

        <div style={{ marginTop: 20, padding: 22, borderRadius: 18, background: 'rgba(2,6,23,0.56)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Countdown</div>
              <div style={{ marginTop: 8, fontSize: 42, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontWeight: 800, color: expeditionReady ? '#6ee7b7' : '#fcd34d' }}>
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
                  background: expeditionReady ? 'linear-gradient(90deg, rgba(16,185,129,0.8), rgba(110,231,183,1))' : 'linear-gradient(90deg, rgba(245,158,11,0.7), rgba(251,191,36,1))',
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          <Button variant={expeditionReady ? 'primary' : 'ghost'} onClick={onSettle} disabled={!expeditionReady} data-testid="quest-expedition-settle" style={{ minWidth: 220, minHeight: 50, fontWeight: 800 }}>
            {expeditionReady ? 'Resolve Expedition' : 'Waiting for Return'}
          </Button>
          <Button variant="secondary" onClick={onRefresh} style={{ minWidth: 180 }}>
            Refresh Page Safely
          </Button>
        </div>
      </Card>

      <Card style={panelStyle}>
        <div style={eyebrowStyle}>Stored Expedition</div>
        <h2 style={{ margin: '6px 0 18px', fontSize: 22 }}>Persistent mission dossier</h2>

        <div style={{ display: 'grid', gap: 12 }}>
          <SummaryBlock title="Persistence" value={restoredExpedition ? 'Restored from local storage' : 'Saved for safe refresh'} note="The local expedition record remains until Tx2 completes." tone={restoredExpedition ? 'info' : 'default'} />
          <SummaryBlock title="Hero" value={heroId || 'Unknown'} note="The stored key is scoped per hero." />
          <SummaryBlock title="Session" value={truncateMiddle(sessionId, 18)} note="Used again during settlement." />
          <SummaryBlock title="Countdown Target" value={readyAtMs ? new Date(readyAtMs).toLocaleString() : 'Pending'} note={judgeMode ? 'Judge mode timing applies.' : 'Production timing applies.'} />
          {tx1Digest && <SummaryBlock title="Departure Tx" value={truncateMiddle(tx1Digest, 18)} note="Tx1 was already accepted and is safe to inspect." />}
        </div>

        <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
          {tx1Digest && buildExplorerTxUrl(tx1Digest) && (
            <a href={buildExplorerTxUrl(tx1Digest)!} target="_blank" rel="noreferrer" style={linkStyle}>
              View Tx1 on Explorer
            </a>
          )}
          <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55 }}>
            Retry-safe behavior: if the page reloads before the timer completes, the stored expedition summary will repopulate this screen and continue the countdown.
          </div>
        </div>
      </Card>
    </section>
  );
}

export function QuestResultPanel({
  step,
  result,
  totalObjects,
  selectedMission,
  selectedContract,
  selectedStance,
  heroId,
  onReset,
  onViewInventory,
  onReturnHero,
}: {
  step: 'win' | 'fail';
  result: QuestResult;
  totalObjects: number;
  selectedMission: (typeof MISSIONS)[number];
  selectedContract: (typeof CONTRACTS)[number];
  selectedStance: (typeof STANCES)[number];
  heroId: string;
  onReset: () => void;
  onViewInventory: () => void;
  onReturnHero: () => void;
}) {
  return (
    <Card
      data-testid="quest-result-panel"
      style={{
        ...panelStyle,
        background: step === 'win' ? 'linear-gradient(135deg, rgba(6,95,70,0.28), rgba(15,23,42,0.96))' : 'linear-gradient(135deg, rgba(127,29,29,0.3), rgba(15,23,42,0.96))',
        border: step === 'win' ? '1px solid rgba(16,185,129,0.28)' : '1px solid rgba(248,113,113,0.24)',
      }}
    >
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div>
          <div style={eyebrowStyle}>Step 7</div>
          <div style={{ color: step === 'win' ? '#a7f3d0' : '#fecaca', fontWeight: 800, marginTop: 8 }} data-testid="quest-result-status">
            {step === 'win' ? 'Quest Complete!' : 'Quest Failed'}
          </div>
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
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Reward Summary</div>
            <div style={{ marginTop: 10, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {step === 'win'
                ? `Recovered ${result.equipmentCount} equipment object(s) and ${result.materialCount} material object(s).`
                : 'No reward objects were created for this settlement. Reconfigure the mission package and try a safer route or stronger loadout.'}
            </div>
          </Card>
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <SummaryBlock title="Tx Digest" value={truncateMiddle(result.txDigest, 18)} note="Settlement transaction digest." />
          <SummaryBlock title="Next Action" value={step === 'win' ? 'Review inventory or run another mission' : 'Retool and retry'} note={step === 'win' ? 'Inventory will reflect any created objects from this settlement.' : 'Training and Harvest are safer if you need to rebuild.'} tone={step === 'win' ? 'success' : 'warning'} />
          <SummaryBlock title="Mission Package" value={`${selectedMission.name} · ${selectedContract.name}`} note={`${selectedStance.name} stance`} />

          <div style={{ display: 'grid', gap: 10 }}>
            <Button variant="primary" onClick={onReset} style={{ minHeight: 50, fontWeight: 800 }}>
              {step === 'win' ? 'Run Another Mission' : 'Rebuild Mission Plan'}
            </Button>
            <Button variant="secondary" onClick={onViewInventory} style={{ minHeight: 50, fontWeight: 800 }} data-testid="quest-view-inventory">
              View Inventory
            </Button>
            <Button variant="ghost" onClick={onReturnHero} style={{ minHeight: 46 }}>
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
  );
}
