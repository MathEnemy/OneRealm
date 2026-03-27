import Link from 'next/link';
import { CHAIN_DOCS_URL, CHAIN_LABEL, CHAIN_RPC_URL, ONEBOX_URL, ONEPLAY_URL, ONEPREDICT_URL } from '../lib/chain';

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
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.badge}>OneHack Submission Surface</div>
        <h1 style={styles.title}>OneRealm on {CHAIN_LABEL}</h1>
        <p style={styles.subtitle}>
          A GameFi fantasy economy where players log in instantly, own on-chain gear, run gasless missions,
          craft role-specific equipment, and return for asynchronous expeditions.
        </p>
        <div style={styles.ctaRow}>
          <Link href="/" style={styles.primaryLink}>Play OneRealm</Link>
          <a href={CHAIN_DOCS_URL} target="_blank" rel="noreferrer" style={styles.secondaryLink}>
            OneChain Developer Docs
          </a>
        </div>
        <div style={styles.metaBox}>
          <div><strong>Track:</strong> GameFi</div>
          <div><strong>Runtime:</strong> {CHAIN_LABEL}</div>
          <div><strong>RPC:</strong> {CHAIN_RPC_URL}</div>
          <div><strong>Toolkit:</strong> <a href={ONEBOX_URL} target="_blank" rel="noreferrer" style={styles.inlineLink}>ONEbox</a></div>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Backstory</h2>
        <p style={styles.copy}>
          OneRealm is built around a simple player fantasy: hunt materials, discover rare recipes, shape a hero build,
          and keep coming back because each contract type changes risk, payout, and progression pacing.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>OneChain Alignment</h2>
        <div style={styles.grid}>
          {cards.map((card) => (
            <article key={card.title} style={styles.card}>
              <h3 style={styles.cardTitle}>{card.title}</h3>
              <p style={styles.cardBody}>{card.body}</p>
              {card.href && card.cta && (
                <a href={card.href} target="_blank" rel="noreferrer" style={styles.cardLink}>
                  {card.cta} →
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>3-Minute Demo Flow</h2>
        <ol style={styles.list}>
          {demoSteps.map((step) => (
            <li key={step} style={styles.listItem}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: 'radial-gradient(circle at top, #132344 0%, #08111f 48%, #040812 100%)',
    color: '#f8fafc',
    minHeight: '100vh',
    padding: '56px 20px 80px',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
  },
  hero: {
    margin: '0 auto 48px',
    maxWidth: 980,
  },
  badge: {
    background: 'rgba(96,165,250,0.16)',
    border: '1px solid rgba(96,165,250,0.3)',
    borderRadius: 999,
    color: '#bfdbfe',
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.4,
    marginBottom: 18,
    padding: '8px 14px',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 'clamp(36px, 6vw, 68px)',
    lineHeight: 1.02,
    margin: '0 0 18px',
  },
  subtitle: {
    color: 'rgba(248,250,252,0.78)',
    fontSize: 18,
    lineHeight: 1.7,
    margin: '0 0 22px',
    maxWidth: 780,
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 24,
  },
  primaryLink: {
    background: '#9fe870',
    borderRadius: 999,
    color: '#08111f',
    fontWeight: 800,
    padding: '12px 18px',
    textDecoration: 'none',
  },
  secondaryLink: {
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 999,
    color: '#f8fafc',
    fontWeight: 700,
    padding: '12px 18px',
    textDecoration: 'none',
  },
  inlineLink: {
    color: '#9fe870',
  },
  metaBox: {
    background: 'rgba(15,23,42,0.68)',
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: 18,
    display: 'grid',
    gap: 10,
    maxWidth: 780,
    padding: 20,
  },
  section: {
    margin: '0 auto 40px',
    maxWidth: 980,
  },
  sectionTitle: {
    fontSize: 28,
    marginBottom: 16,
  },
  copy: {
    color: 'rgba(248,250,252,0.8)',
    fontSize: 17,
    lineHeight: 1.7,
  },
  grid: {
    display: 'grid',
    gap: 18,
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  },
  card: {
    background: 'rgba(15,23,42,0.7)',
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: 18,
    padding: 20,
  },
  cardTitle: {
    fontSize: 20,
    margin: '0 0 10px',
  },
  cardBody: {
    color: 'rgba(248,250,252,0.76)',
    lineHeight: 1.6,
    margin: 0,
  },
  cardLink: {
    color: '#9fe870',
    display: 'inline-block',
    fontWeight: 700,
    marginTop: 16,
    textDecoration: 'none',
  },
  list: {
    margin: 0,
    paddingLeft: 20,
  },
  listItem: {
    color: 'rgba(248,250,252,0.82)',
    lineHeight: 1.8,
    marginBottom: 10,
  },
};
