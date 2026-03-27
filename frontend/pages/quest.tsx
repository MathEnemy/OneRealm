import { useRouter } from 'next/router';
import { CHAIN_LABEL } from '../lib/chain';
import { Banner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ErrorState } from '../components/ui/StatePanel';
import { PageHeader } from '../components/layout/PageHeader';
import { CONTRACTS, MISSIONS, STANCES } from '../features/quest/model';
import { ExpeditionPanel, QuestLifecycleOverview, QuestResultPanel, QuestSelectionPanel, QuestTransactionPanel } from '../features/quest/QuestPanels';
import { useQuestFlow } from '../features/quest/useQuestFlow';

const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';

export default function QuestPage() {
  const router = useRouter();
  const heroId = (router.query.heroId as string) || '';
  const flow = useQuestFlow({ heroId, router });

  const selectedMission = MISSIONS[flow.missionType];
  const selectedContract = CONTRACTS[flow.contractType];
  const selectedStance = STANCES[flow.stance];

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
          <Badge>{flow.isExpeditionContract ? 'Async Contract Selected' : 'Direct Contract Selected'}</Badge>
          <Badge>{flow.step === 'expedition-wait' ? 'Refresh Safe' : 'Gasless Flow'}</Badge>
        </div>
      </PageHeader>

      {JUDGE_MODE && (
        <div style={{ marginBottom: 24 }}>
          <Banner type="warning">
            Judge Mode: expeditions are reduced to about 30 seconds for testing. Timing behavior remains unchanged.
          </Banner>
        </div>
      )}

      <QuestLifecycleOverview
        activeJourneyStep={flow.activeJourneyStep}
        contractType={flow.contractType}
        step={flow.step}
        selectedMission={selectedMission}
        selectedContract={selectedContract}
        selectedStance={selectedStance}
        txStatus={flow.txStatus}
        sessionId={flow.sessionId}
        tx1Digest={flow.tx1Digest}
      />

      {flow.step === 'error' && (
        <ErrorState
          title="Mission Interrupted"
          message={flow.error}
          style={{ margin: '24px auto 0', maxWidth: 720 }}
          actions={
            <>
              <Button variant="primary" onClick={flow.resetQuest} style={{ minWidth: 200 }}>
                Reset Mission Flow
              </Button>
              <Button variant="ghost" onClick={() => router.push('/hero')} style={{ minWidth: 180 }}>
                Return to Hero
              </Button>
            </>
          }
        />
      )}

      {flow.step === 'select' && (
        <QuestSelectionPanel
          missionType={flow.missionType}
          contractType={flow.contractType}
          stance={flow.stance}
          onMissionChange={flow.setMissionType}
          onContractChange={flow.setContractType}
          onStanceChange={flow.setStance}
          onStartQuest={flow.handleStartQuest}
          selectedMission={selectedMission}
          selectedContract={selectedContract}
          selectedStance={selectedStance}
        />
      )}

      {(flow.step === 'tx1-pending' || flow.step === 'tx1-done' || flow.step === 'tx2-pending') && (
        <QuestTransactionPanel
          step={flow.step}
          selectedMission={selectedMission}
          selectedContract={selectedContract}
          selectedStance={selectedStance}
        />
      )}

      {flow.step === 'expedition-wait' && (
        <ExpeditionPanel
          expeditionReady={flow.expeditionReady}
          restoredExpedition={flow.restoredExpedition}
          expeditionCountdown={flow.expeditionCountdown}
          waitProgressPct={flow.waitProgressPct}
          selectedMission={selectedMission}
          selectedContract={selectedContract}
          selectedStance={selectedStance}
          onSettle={() => flow.handleSettleBattle(flow.sessionId)}
          onRefresh={() => window.location.reload()}
          sessionId={flow.sessionId}
          heroId={heroId}
          readyAtMs={flow.readyAtMs}
          tx1Digest={flow.tx1Digest}
          judgeMode={JUDGE_MODE}
        />
      )}

      {(flow.step === 'win' || flow.step === 'fail') && flow.result && (
        <QuestResultPanel
          step={flow.step}
          result={flow.result}
          totalObjects={flow.totalObjects}
          selectedMission={selectedMission}
          selectedContract={selectedContract}
          selectedStance={selectedStance}
          heroId={heroId}
          onReset={flow.resetQuest}
          onViewInventory={() => router.push(`/inventory?heroId=${heroId}`)}
          onReturnHero={() => router.push('/hero')}
        />
      )}
    </main>
  );
}
