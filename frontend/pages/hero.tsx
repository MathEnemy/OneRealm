// pages/hero.tsx — Hero Management Screen [2.2]
// BLUEPRINT.md: Hero card + equipment slots + Mint button (gasless) + AI hint panel

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { SuiClient } from '@onelabs/sui/client';
import { Transaction } from '@onelabs/sui/transactions';
import { getStoredSession } from '../auth/zklogin';
import { executeGasless, GaslessError } from '../transactions/gasless';
import { encodeE2eTx, e2eFetch, getDynamicFields, getE2eRuntime, getObject, getOwnedObjects } from '../lib/e2e';
import { CHAIN_LABEL, CHAIN_RPC_URL, ONEPREDICT_URL } from '../lib/chain';

const PACKAGE_ID   = process.env.NEXT_PUBLIC_ONEREALM_PACKAGE_ID!;
const SERVER_URL   = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
const SPONSOR_ADDRESS = process.env.NEXT_PUBLIC_SPONSOR_ADDRESS;
const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';
const ARCHETYPES = [
  { id: 0 as const, name: 'Warrior', icon: '🛡️', affinity: 'Raid affinity' },
  { id: 1 as const, name: 'Ranger', icon: '🌿', affinity: 'Harvest affinity' },
  { id: 2 as const, name: 'Arcanist', icon: '✨', affinity: 'Training affinity' },
];
const PROFESSIONS = [
  { id: 0 as const, name: 'Mining', icon: '⛏️', perk: 'Bonus ore on Harvest wins' },
  { id: 1 as const, name: 'Foraging', icon: '🌾', perk: 'Bonus scrap on Harvest wins' },
  { id: 2 as const, name: 'Smithing', icon: '🛠️', perk: 'Bonus essence on Training wins' },
  { id: 3 as const, name: 'Relic Hunting', icon: '🗝️', perk: 'Bonus essence on Raid wins' },
];
const PROFESSION_RANK_LABEL: Record<number, string> = {
  0: 'Novice',
  1: 'Adept',
  2: 'Master',
};

const suiClient = new SuiClient({ url: CHAIN_RPC_URL });

interface HeroData {
  id: string;
  name: string;
  level: number;
  basePower: number;
  totalPower: number;
  archetype: number;
  profession: number;
  professionXp: number;
  professionRank: number;
  weaponEquipped: boolean;
  armorEquipped: boolean;
}

interface AiHint {
  hint: string;
  readiness: number;
  recommended_quest: string;
}

function decodeBytes(value: any): string {
  if (typeof value === 'string') {
    return Buffer.from(value, 'base64').toString();
  }
  if (Array.isArray(value)) {
    return Buffer.from(value).toString();
  }
  return 'Unknown';
}

function dynamicFieldName(field: any): string {
  const value = field?.name?.value;
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return Buffer.from(value).toString();
  }
  return '';
}

async function loadEquipmentState(heroId: string) {
  const dynamicFields = await getDynamicFields(suiClient, { parentId: heroId });
  let totalBonus = 0;
  let weaponEquipped = false;
  let armorEquipped = false;

  for (const field of dynamicFields.data) {
    const slot = dynamicFieldName(field);
    if (!field.objectId) {
      continue;
    }

    const itemObject = await getObject(suiClient, {
      id: field.objectId,
      options: { showContent: true },
    });
    const itemFields = itemObject.data?.content && 'fields' in itemObject.data.content
      ? (itemObject.data.content as any).fields
      : {};
    totalBonus += Number(itemFields.power ?? 0);

    if (slot === 'weapon') {
      weaponEquipped = true;
    }
    if (slot === 'armor') {
      armorEquipped = true;
    }
  }

  return {
    armorEquipped,
    totalBonus,
    weaponEquipped,
  };
}

export default function HeroPage() {
  const router = useRouter();
  const [address, setAddress]   = useState<string | null>(null);
  const [heroes, setHeroes]     = useState<HeroData[]>([]);
  const [aiHint, setAiHint]     = useState<AiHint | null>(null);
  const [minting, setMinting]   = useState(false);
  const [heroName, setHeroName] = useState('');
  const [heroArchetype, setHeroArchetype] = useState<0 | 1 | 2>(0);
  const [heroProfession, setHeroProfession] = useState<0 | 1 | 2 | 3>(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    const session = getStoredSession();
    if (!session.address || !session.hasApiSession) { router.push('/'); return; }
    setAddress(session.address);
    loadHeroes(session.address);
  }, []);

  async function loadHeroes(addr: string) {
    setLoading(true);
    try {
      const { data } = await getOwnedObjects(suiClient, {
        owner: addr,
        filter: { StructType: `${PACKAGE_ID}::hero::Hero` },
        options: { showContent: true },
      });

      const heroList = await Promise.all(data.map(async (obj: any) => {
        const fields = obj.data?.content?.fields ?? {};
        const equipmentState = await loadEquipmentState(obj.data?.objectId ?? '');
        const basePower = Number(fields.base_power ?? 10);
        return {
          id:             obj.data?.objectId ?? '',
          name:           decodeBytes(fields.name),
          level:          Number(fields.level ?? 1),
          basePower,
          totalPower:     basePower + equipmentState.totalBonus,
          archetype:      Number(fields.archetype ?? 0),
          profession:     Number(fields.profession ?? 0),
          professionXp:   Number(fields.profession_xp ?? 0),
          professionRank: getProfessionRank(Number(fields.profession_xp ?? 0)),
          weaponEquipped: equipmentState.weaponEquipped,
          armorEquipped:  equipmentState.armorEquipped,
        };
      }));
      setHeroes(heroList);

      // Fetch AI hint for first hero if any
      if (heroList.length > 0) {
        const equippedSlots = Number(heroList[0].weaponEquipped) + Number(heroList[0].armorEquipped);
        fetchAiHint(heroList[0].totalPower, equippedSlots);
      }
    } catch (e: any) {
      setError('Failed to load heroes: ' + e.message);
    }
    setLoading(false);
  }

  async function fetchAiHint(heroPower: number, equippedSlots: number) {
    try {
      const res = await e2eFetch(`${SERVER_URL}/api/ai-hint`, {
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
      if (!SPONSOR_ADDRESS && !getE2eRuntime()) {
        throw new Error('Missing NEXT_PUBLIC_SPONSOR_ADDRESS');
      }
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::hero::mint_to_sender`,
        arguments: [tx.pure.string(heroName.trim()), tx.pure.u8(heroArchetype), tx.pure.u8(heroProfession)],
      });
      tx.setSender(address);
      tx.setGasOwner(SPONSOR_ADDRESS);
      const txBytes = encodeE2eTx({
        target: `${PACKAGE_ID}::hero::mint_to_sender`,
        heroName: heroName.trim(),
        archetype: heroArchetype,
        profession: heroProfession,
      }) ?? Buffer.from(await tx.build({ client: suiClient })).toString('base64');
      await executeGasless(txBytes, address);
      setHeroName('');
      setHeroArchetype(0);
      setHeroProfession(0);
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
      <div style={styles.runtimeBadge}>Built on {CHAIN_LABEL} • Gasless sessions • Move-owned assets</div>
      {JUDGE_MODE && (
        <div style={styles.judgeBanner}>Judge Mode live: claim the starter bundle in Inventory and resolve expeditions in about 30 seconds.</div>
      )}

      {/* AI Mentor Panel (ADR-011) */}
      {aiHint && (
        <div style={styles.aiPanel}>
          <div style={styles.aiTitle}>🤖 AI Mentor <span style={styles.aiPowered}>OnePredict-ready strategy layer</span></div>
          <div style={styles.readinessBar}>
            <div style={{ ...styles.readinessFill, width: `${aiHint.readiness}%` }} />
          </div>
          <p style={styles.aiHint}>{aiHint.hint}</p>
          <a href={ONEPREDICT_URL} target="_blank" rel="noreferrer" style={styles.aiLink}>
            Explore OnePredict ecosystem →
          </a>
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
        <div style={styles.archetypeRow}>
          {ARCHETYPES.map((archetype) => (
            <button
              key={archetype.id}
              style={{
                ...styles.archetypeBtn,
                ...(heroArchetype === archetype.id ? styles.archetypeBtnActive : {}),
              }}
              onClick={() => setHeroArchetype(archetype.id)}
              disabled={minting}
            >
              <span style={styles.archetypeIcon}>{archetype.icon}</span>
              <span>{archetype.name}</span>
              <span style={styles.archetypeHint}>{archetype.affinity}</span>
            </button>
          ))}
        </div>
        <div style={styles.professionRow}>
          {PROFESSIONS.map((profession) => (
            <button
              key={profession.id}
              style={{
                ...styles.professionBtn,
                ...(heroProfession === profession.id ? styles.professionBtnActive : {}),
              }}
              onClick={() => setHeroProfession(profession.id)}
              disabled={minting}
            >
              <span style={styles.archetypeIcon}>{profession.icon}</span>
              <span>{profession.name}</span>
              <span style={styles.archetypeHint}>{profession.perk}</span>
            </button>
          ))}
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
              <div style={styles.heroAvatar}>{getArchetype(hero.archetype).icon}</div>
              <h3 style={styles.heroName}>{hero.name}</h3>
              <div style={styles.heroArchetype}>{getArchetype(hero.archetype).name} • {getArchetype(hero.archetype).affinity}</div>
              <div style={styles.heroProfession}>{getProfession(hero.profession).name} • {getProfession(hero.profession).perk}</div>
              <div style={styles.heroProfessionMeta}>Rank {PROFESSION_RANK_LABEL[hero.professionRank]} • XP {hero.professionXp}</div>
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

function getArchetype(id: number) {
  return ARCHETYPES.find((entry) => entry.id === id) ?? ARCHETYPES[0];
}

function getProfession(id: number) {
  return PROFESSIONS.find((entry) => entry.id === id) ?? PROFESSIONS[0];
}

function getProfessionRank(xp: number) {
  if (xp >= 7) return 2;
  if (xp >= 3) return 1;
  return 0;
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
  runtimeBadge: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    background: 'rgba(96,165,250,0.14)',
    border: '1px solid rgba(96,165,250,0.28)',
    borderRadius: 999,
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 18,
    padding: '8px 14px',
  },
  judgeBanner: {
    background: 'rgba(245,158,11,0.14)',
    border: '1px solid rgba(245,158,11,0.35)',
    borderRadius: 14,
    color: '#fde68a',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 18,
    padding: '10px 14px',
  },
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
  aiLink:    { color: '#9fe870', fontSize: 13, marginTop: 8, textDecoration: 'none' },
  mintCard:  { background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '20px', marginBottom: 24, border: '1px solid rgba(255,255,255,0.1)' },
  sectionTitle: { fontSize: 16, fontWeight: 700, margin: '0 0 14px' },
  mintRow:   { display: 'flex', gap: 10 },
  archetypeRow: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 },
  professionRow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 },
  archetypeBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, padding: '12px 14px', color: '#fff', cursor: 'pointer', textAlign: 'left',
  },
  archetypeBtnActive: {
    background: 'rgba(59,130,246,0.22)', border: '1px solid rgba(96,165,250,0.45)',
  },
  professionBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, padding: '12px 14px', color: '#fff', cursor: 'pointer', textAlign: 'left',
  },
  professionBtnActive: {
    background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(251,191,36,0.45)',
  },
  archetypeIcon: { fontSize: 20 },
  archetypeHint: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
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
  heroArchetype: { textAlign: 'center', fontSize: 12, color: '#bfdbfe', fontWeight: 700 },
  heroProfession: { textAlign: 'center', fontSize: 12, color: '#fcd34d', fontWeight: 700 },
  heroProfessionMeta: { textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.58)' },
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
