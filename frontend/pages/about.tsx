import Link from 'next/link';
import { CHAIN_DOCS_URL, CHAIN_LABEL, CHAIN_RPC_URL, ONEBOX_URL, ONEPLAY_URL, ONEPREDICT_URL } from '../lib/chain';
import { Card, Badge } from '../components/ui/Card';
import { Section } from '../components/ui/Section';

const cards = [
  {
    title: 'Move Runtime',
    body: 'OneRealm uses owned objects, dynamic fields, sponsored transactions, and PTB-based gameplay loops on a Move-compatible runtime.',
  },
  {
    title: 'OnePredict-Ready Mentor',
    body: 'The in-game mentor scores readiness, recommends mission families, and is structured for a stronger prediction layer as the ecosystem matures.',
    href: ONEPREDICT_URL,
    cta: 'Explore OnePredict',
  },
  {
    title: 'OnePlay-Ready GameFi UX',
    body: 'The loop is tuned for low-friction GameFi sessions: login, mint, quest, salvage, craft, expedition return.',
    href: ONEPLAY_URL,
    cta: 'Explore OnePlay',
  },
  {
    title: 'Builder Toolkit',
    body: 'Judges and collaborators can inspect the exact OneChain docs and the ONEbox toolkit used to align RPC, PTB, and sponsorship patterns.',
    href: CHAIN_DOCS_URL,
    cta: 'Open Docs',
  },
];

const demoSteps = [
  'Login with Google and derive an on-chain address without requiring a wallet install.',
  'Mint a hero with an archetype and profession, then inspect mentor recommendations.',
  'Run a gasless quest, receive materials and gear, then salvage or craft at the blacksmith.',
  'Start an expedition, refresh the page, and return later to settle it without losing progress.',
];

export default function AboutPage() {
  return (
    <main className="container" style={{ padding: 'var(--space-6) var(--space-4)', maxWidth: 980, margin: '0 auto' }}>
      <Section title={`OneRealm on ${CHAIN_LABEL}`} subtitle="A GameFi fantasy economy where players log in instantly, own on-chain gear, run gasless missions, craft role-specific equipment, and return for asynchronous expeditions.">
        <Badge variant="info" style={{ marginBottom: 'var(--space-4)', display: 'inline-flex' }}>OneHack Submission Surface</Badge>
        <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-primary" style={{ padding: 'var(--space-3) var(--space-5)' }}>
            Play OneRealm
          </Link>
          <a href={CHAIN_DOCS_URL} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: 'var(--space-3) var(--space-5)' }}>
            OneChain Developer Docs
          </a>
        </div>

        <Card style={{ maxWidth: 780 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Track:</span> GameFi</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Runtime:</span> {CHAIN_LABEL}</div>
            <div style={{ wordBreak: 'break-all' }}><span style={{ color: 'var(--text-muted)' }}>RPC:</span> {CHAIN_RPC_URL}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Toolkit:</span> <a href={ONEBOX_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent-primary)' }}>ONEbox</a></div>
          </div>
        </Card>
      </Section>

      <Section title="Product Promise">
        <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-secondary)', maxWidth: 780 }}>
          OneRealm is built around a simple player fantasy: hunt materials, discover rare recipes, shape a hero build,
          and keep coming back because each contract type changes risk, payout, and progression pacing.
        </p>
      </Section>

      <Section title="Gameplay Loop">
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {['Login', 'Mint', 'Quest', 'Salvage', 'Craft', 'Expedition'].map((step, i) => (
             <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
               <Badge variant="info" style={{ width: 24, height: 24, justifyContent: 'center', borderRadius: '50%' }}>{i + 1}</Badge>
               <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{step}</span>
               {i < 5 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
             </div>
          ))}
        </div>
      </Section>

      <Section title="Technical Alignment">
        <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {cards.map((card) => (
            <Card key={card.title}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 var(--space-3)' }}>{card.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 var(--space-4)' }}>{card.body}</p>
              {card.href && card.cta && (
                <a href={card.href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--color-accent-primary)', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
                  {card.cta} <span className="badge badge-info" style={{ padding: '2px 4px', fontSize: 10 }}>↗</span>
                </a>
              )}
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Demo Flow">
        <Card style={{ maxWidth: 780 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {demoSteps.map((step, index) => (
              <div key={index} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <Badge variant="info" style={{ flexShrink: 0, width: 28, height: 28, justifyContent: 'center', borderRadius: '50%' }}>
                  {index + 1}
                </Badge>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 2 }}>{step}</div>
              </div>
            ))}
          </div>
        </Card>
      </Section>
    </main>
  );
}
