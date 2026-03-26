'use client';
// pages/hero.tsx — Hero Management Screen [2.2]
// BLUEPRINT.md: Hero card + equipment slots + Mint button (gasless) + AI hint panel

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getStoredSession } from '../auth/zklogin';
import { executeGasless, GaslessError } from '../transactions/gasless';

const SUI_NETWORK  = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'devnet';
const PACKAGE_ID   = process.env.NEXT_PUBLIC_ONEREALM_PACKAGE_ID!;
const SERVER_URL   = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

const suiClient = new SuiClient({ url: `https://fullnode.${SUI_NETWORK}.sui.io` });

interface HeroData {
  id: string;
  name: string;
  level: number;
  basePower: number;
  totalPower: number;
  weaponEquipped: boolean;
  armorEquipped: boolean;
}

interface AiHint {
  hint: string;
  readiness: number;
  recommended_quest: string;
}

export default function HeroPage() {
  const router = useRouter();
  const [address, setAddress]   = useState<string | null>(null);
  const [heroes, setHeroes]     = useState<HeroData[]>([]);
  const [aiHint, setAiHint]     = useState<AiHint | null>(null);
  const [minting, setMinting]   = useState(false);
  const [heroName, setHeroName] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    const session = getStoredSession();
    if (!session.address) { router.push('/'); return; }
    setAddress(session.address);
    loadHeroes(session.address);
  }, []);

  async function loadHeroes(addr: string) {
    setLoading(true);
    try {
      const { data } = await suiClient.getOwnedObjects({
        owner: addr,
        filter: { StructType: `${PACKAGE_ID}::hero::Hero` },
        options: { showContent: true },
      });

      const heroList = data.map((obj: any) => {
        const fields = obj.data?.content?.fields ?? {};
        return {
          id:             obj.data?.objectId ?? '',
          name:           fields.name ? Buffer.from(fields.name, 'base64').toString() : 'Unknown',
          level:          Number(fields.level ?? 1),
          basePower:      Number(fields.base_power ?? 10),
          totalPower:     Number(fields.base_power ?? 10), // refined below
          weaponEquipped: false,
          armorEquipped:  false,
        };
      });
      setHeroes(heroList);

      // Fetch AI hint for first hero if any
      if (heroList.length > 0) fetchAiHint(heroList[0].totalPower, 0);
    } catch (e: any) {
      setError('Failed to load heroes: ' + e.message);
    }
    setLoading(false);
  }

  async function fetchAiHint(heroPower: number, equippedSlots: number) {
    try {
      const res = await fetch(`${SERVER_URL}/api/ai-hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroPower, equippedSlots }),
      });
      setAiHint(await res.json());
    } catch { /* silent fail — AI hint is non-critical */ }
  }

  async function handleMint() {
    if (!heroName.trim() || !address) return;
    setMinting(true);
    setError('');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::hero::mint_to_sender`,
        arguments: [tx.pure.string(heroName.trim())],
      });
      tx.setSender(address);
      const txBytes = Buffer.from(await tx.build({ client: suiClient })).toString('base64');
      await executeGasless(txBytes, address);
      setHeroName('');
      await loadHeroes(address);
    } catch (e: any) {
      if (e instanceof GaslessError && e.code === 'RATE_LIMITED') {
        setError('Daily quest limit reached (10/day). Try again tomorrow.');
      } else {
        setError('Mint failed: ' + e.message);
      }
    }
    setMinting(false);
  }

  if (loading) return <LoadingScreen text="Loading heroes..." />;

  return (
    <main style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>⚔️ OneRealm</h1>
        <div style={styles.addressBadge}>
          🔐 {address?.slice(0, 8)}...{address?.slice(-6)}
        </div>
      </header>

      {/* AI Mentor Panel (ADR-011) */}
      {aiHint && (
        <div style={styles.aiPanel}>
          <div style={styles.aiTitle}>🤖 AI Mentor <span style={styles.aiPowered}>powered by OnePredict</span></div>
          <div style={styles.readinessBar}>
            <div style={{ ...styles.readinessFill, width: `${aiHint.readiness}%` }} />
          </div>
          <p style={styles.aiHint}>{aiHint.hint}</p>
        </div>
      )}

      {/* Mint new hero */}
      <div style={styles.mintCard}>
        <h2 style={styles.sectionTitle}>Create Hero</h2>
        <div style={styles.mintRow}>
          <input
            style={styles.input}
            placeholder="Hero name..."
            value={heroName}
            onChange={e => setHeroName(e.target.value)}
            maxLength={32}
          />
          <button
            style={{ ...styles.btn, opacity: minting || !heroName.trim() ? 0.5 : 1 }}
            onClick={handleMint}
            disabled={minting || !heroName.trim()}
          >
            {minting ? 'Minting...' : '✨ Mint (Free)'}
          </button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </div>

      {/* Hero list */}
      {heroes.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No heroes yet. Mint your first hero above!</p>
        </div>
      ) : (
        <div style={styles.heroGrid}>
          {heroes.map(hero => (
            <div key={hero.id} style={styles.heroCard}>
              <div style={styles.heroAvatar}>🧙</div>
              <h3 style={styles.heroName}>{hero.name}</h3>
              <div style={styles.statRow}>
                <span style={styles.stat}>⚡ Power: {hero.totalPower}</span>
                <span style={styles.stat}>📊 Lv.{hero.level}</span>
              </div>
              <div style={styles.slots}>
                <div style={styles.slot}>⚔️ {hero.weaponEquipped ? 'Weapon' : 'Empty'}</div>
                <div style={styles.slot}>🛡 {hero.armorEquipped ? 'Armor' : 'Empty'}</div>
              </div>
              <div style={styles.heroActions}>
                <button
                  style={styles.questBtn}
                  onClick={() => router.push(`/quest?heroId=${hero.id}`)}
                >
                  🗡 Start Quest
                </button>
                <button
                  style={styles.invBtn}
                  onClick={() => router.push(`/inventory?heroId=${hero.id}`)}
                >
                  🎒 Inventory
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main style={{ ...baseContainer, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#fff', fontSize: 18 }}>{text}</div>
    </main>
  );
}

const baseContainer: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  fontFamily: "'Inter', sans-serif",
  color: '#fff',
  padding: '24px 20px',
};

const styles: Record<string, React.CSSProperties> = {
  container: { ...baseContainer },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title:     { fontSize: 24, fontWeight: 800, margin: 0 },
  addressBadge: {
    background: 'rgba(255,255,255,0.1)', borderRadius: 20,
    padding: '6px 14px', fontSize: 13, color: 'rgba(255,255,255,0.7)',
  },
  aiPanel: {
    background: 'rgba(102,126,234,0.15)', border: '1px solid rgba(102,126,234,0.3)',
    borderRadius: 16, padding: '16px 20px', marginBottom: 24,
  },
  aiTitle:   { fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 },
  aiPowered: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 400 },
  readinessBar: {
    height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginBottom: 10, overflow: 'hidden',
  },
  readinessFill: { height: '100%', background: 'linear-gradient(90deg,#667eea,#764ba2)', borderRadius: 3, transition: 'width 0.5s' },
  aiHint:    { margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  mintCard:  { background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '20px', marginBottom: 24, border: '1px solid rgba(255,255,255,0.1)' },
  sectionTitle: { fontSize: 16, fontWeight: 700, margin: '0 0 14px' },
  mintRow:   { display: 'flex', gap: 10 },
  input: {
    flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 15, outline: 'none',
  },
  btn: {
    background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff',
    border: 'none', borderRadius: 10, padding: '12px 20px',
    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
  error:    { color: '#fca5a5', fontSize: 13, marginTop: 8 },
  emptyState: { textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '40px 20px' },
  heroGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },
  heroCard: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
  },
  heroAvatar:  { fontSize: 40, textAlign: 'center' },
  heroName:    { margin: 0, fontSize: 18, fontWeight: 700, textAlign: 'center' },
  statRow:     { display: 'flex', justifyContent: 'space-around' },
  stat:        { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  slots:       { display: 'flex', gap: 8, justifyContent: 'center' },
  slot: {
    background: 'rgba(255,255,255,0.08)', borderRadius: 8,
    padding: '6px 12px', fontSize: 13, color: 'rgba(255,255,255,0.6)',
  },
  heroActions: { display: 'flex', gap: 8, marginTop: 4 },
  questBtn: {
    flex: 1, background: 'linear-gradient(135deg,#667eea,#764ba2)',
    color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0',
    fontWeight: 600, cursor: 'pointer',
  },
  invBtn: {
    flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10,
    padding: '10px 0', cursor: 'pointer',
  },
};
