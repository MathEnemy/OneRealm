// pages/hero.tsx — Hero Management Screen [2.2]
// BLUEPRINT.md: Hero card + equipment slots + Mint button (gasless) + AI hint panel

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { SuiClient } from '@onelabs/sui/client';
import { Transaction } from '@onelabs/sui/transactions';
import { getStoredSession } from '../auth/zklogin';
import { executeGasless, GaslessError } from '../transactions/gasless';
import { encodeE2eTx, e2eFetch, getDynamicFields, getE2eRuntime, getObject, getOwnedObjects } from '../lib/e2e';
import { getRateLimitMessage } from '../lib/api-errors';
import { CHAIN_LABEL, CHAIN_RPC_URL, ONEPREDICT_URL } from '../lib/chain';
import { Button } from '../components/ui/Button';
import { Card, Badge } from '../components/ui/Card';
import { Banner, Spinner } from '../components/ui/Feedback';
import { PageHeader } from '../components/layout/PageHeader';
import { ChoiceCard } from '../components/ui/ChoiceCard';
import { Section } from '../components/ui/Section';
import { StatePanel } from '../components/ui/StatePanel';

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
  if (typeof value === 'string') return Buffer.from(value, 'base64').toString();
  if (Array.isArray(value)) return Buffer.from(value).toString();
  return 'Unknown';
}

function dynamicFieldName(field: any): string {
  const value = field?.name?.value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return Buffer.from(value).toString();
  return '';
}

function getArchetype(id: number) {
  return ARCHETYPES.find((e) => e.id === id) ?? ARCHETYPES[0];
}

function getProfession(id: number) {
  return PROFESSIONS.find((e) => e.id === id) ?? PROFESSIONS[0];
}

function getProfessionRank(xp: number) {
  if (xp >= 7) return 2;
  if (xp >= 3) return 1;
  return 0;
}

async function loadEquipmentState(heroId: string) {
  const dynamicFields = await getDynamicFields(suiClient, { parentId: heroId });
  let totalBonus = 0;
  let weaponEquipped = false;
  let armorEquipped = false;

  for (const field of dynamicFields.data) {
    const slot = dynamicFieldName(field);
    if (!field.objectId) continue;

    const itemObject = await getObject(suiClient, { id: field.objectId, options: { showContent: true } });
    const itemFields = itemObject.data?.content && 'fields' in itemObject.data.content ? (itemObject.data.content as any).fields : {};
    totalBonus += Number(itemFields.power ?? 0);

    if (slot === 'weapon') weaponEquipped = true;
    if (slot === 'armor') armorEquipped = true;
  }

  return { armorEquipped, totalBonus, weaponEquipped };
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
    } catch { /* silent */ }
  }

  async function handleMint() {
    if (!heroName.trim() || !address) return;
    setMinting(true);
    setError('');
    try {
      if (!SPONSOR_ADDRESS && !getE2eRuntime()) throw new Error('Missing NEXT_PUBLIC_SPONSOR_ADDRESS');
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
        setError(getRateLimitMessage(e.details));
      } else {
        setError('Mint failed: ' + e.message);
      }
    }
    setMinting(false);
  }

  const renderMintPanel = (isFirst: boolean) => (
    <Card style={{ marginBottom: isFirst ? 32 : 0, display: 'flex', flexDirection: 'column', gap: isFirst ? 24 : 16 }}>
      {isFirst && (
        <div style={{ textAlign: 'center', marginBottom: 8, marginTop: 16 }}>
           <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>First, shape your hero.</h2>
           <p style={{ color: 'var(--text-secondary)', fontSize: 16, maxWidth: 600, margin: '0 auto' }}>
             Select an archetype to define combat affinity, and a profession for material bonuses. Both choices influence your optimal gameplay loop.
           </p>
        </div>
      )}
      {!isFirst && <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Recruit Reserve Hero</h3>}
      
      <div>
        <label htmlFor="hero-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Name your champion</label>
        <input
          id="hero-name"
          name="hero_name"
          className="input"
          style={{ width: '100%', fontSize: isFirst ? 18 : 14, padding: isFirst ? 16 : 12 }}
          placeholder="Hero name..."
          value={heroName}
          onChange={e => setHeroName(e.target.value)}
          maxLength={32}
          autoComplete="off"
        />
      </div>
      
      <div>
        <div style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Archetype (Combat Affinity)</div>
        <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {ARCHETYPES.map((archetype) => (
            <ChoiceCard
              key={archetype.id}
              onClick={() => !minting && setHeroArchetype(archetype.id)}
              selected={heroArchetype === archetype.id}
              tone="primary"
              disabled={minting}
              style={{ padding: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                <span style={{ fontSize: 18 }}>{archetype.icon}</span> {archetype.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {heroArchetype === archetype.id ? 'Selected · ' : ''}
                {archetype.affinity}
              </div>
            </ChoiceCard>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Profession (Loot Bonus)</div>
        <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {PROFESSIONS.map((profession) => (
            <ChoiceCard
              key={profession.id}
              onClick={() => !minting && setHeroProfession(profession.id)}
              selected={heroProfession === profession.id}
              tone="warning"
              disabled={minting}
              style={{ padding: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                <span style={{ fontSize: 18 }}>{profession.icon}</span> {profession.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {heroProfession === profession.id ? 'Selected · ' : ''}
                {profession.perk}
              </div>
            </ChoiceCard>
          ))}
        </div>
      </div>

      {error && <Banner type="error">{error}</Banner>}

      <Button variant={isFirst ? "primary" : "secondary"} fullWidth onClick={handleMint} disabled={minting || !heroName.trim()} style={{ padding: isFirst ? 20 : 16, fontSize: isFirst ? 18 : 14, fontWeight: 800 }}>
        {minting ? 'Minting…' : '✨ Mint (Free)'}
      </Button>
    </Card>
  );

  if (loading) return (
    <main className="container flex-center" style={{ minHeight: '60vh' }}>
      <StatePanel
        loading
        tone="info"
        eyebrow="Hero Roster"
        title="Loading secure hero roster…"
        description="Fetching hero objects, dynamic equipment fields, and mentor context."
        style={{ maxWidth: 480, width: '100%' }}
      />
    </main>
  );

  const activeHero = heroes.length > 0 ? heroes[0] : null;
  const rosterHeros = heroes.length > 1 ? heroes.slice(1) : [];

  return (
    <main className="container" style={{ paddingBottom: 'var(--space-8)' }}>
      <PageHeader
        icon="⚔️"
        title={activeHero ? "Player Dashboard" : "Create Hero"}
        subtitle={activeHero ? "Manage your active hero, consult your mentor, and deploy to missions." : "Your blockchain GameFi journey begins here."}
        breadcrumb={[{ label: 'OneRealm' }, { label: 'Hero Roster' }]}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge variant="info">Built on {CHAIN_LABEL}</Badge>
          <Badge>Gasless</Badge>
          <Badge>Move-owned equipment</Badge>
        </div>
      </PageHeader>

      {JUDGE_MODE && (
        <Banner type="warning">
          Judge Mode live: claim the starter bundle in Inventory and resolve expeditions in about 30 seconds.
        </Banner>
      )}

      {!activeHero ? (
        // --- 0 HEROES: LARGE MINT FLOW ---
        <div style={{ maxWidth: 800, margin: '32px auto 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, fontSize: 64 }}>🎲</div>
          {renderMintPanel(true)}
        </div>
      ) : (
        // --- DASHBOARD LAYOUT (2 COLUMNS) ---
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, marginTop: 24 }}>
          
          {/* LEFT COLUMN: ACTIVE HERO */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 className="section-heading" style={{ margin: 0, fontSize: 22 }}>Active Hero</h2>
              <Badge variant="info" style={{ fontWeight: 800 }}>Lvl {activeHero.level}</Badge>
            </div>
            
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {/* Character Header Plate */}
              <div style={{ background: 'linear-gradient(to right, rgba(102,126,234,0.15), rgba(0,0,0,0))', padding: '32px 24px', display: 'flex', alignItems: 'center', gap: 20, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 64, filter: 'drop-shadow(0 0 20px rgba(102,126,234,0.4))' }}>
                  {getArchetype(activeHero.archetype).icon}
                </div>
                <div>
                  <h3 style={{ fontSize: 28, margin: '0 0 4px', fontWeight: 800 }}>{activeHero.name}</h3>
                  <div style={{ color: 'var(--color-accent-primary)', fontWeight: 700, fontSize: 14 }}>
                    {getArchetype(activeHero.archetype).name} • {getArchetype(activeHero.archetype).affinity}
                  </div>
                </div>
              </div>
              
              {/* Stats Strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.05)' }}>
                 <div className="stat-block" style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 0, padding: 20 }}>
                   <div className="stat-label" style={{ marginBottom: 4 }}>Total Power</div>
                   <div className="stat-value" style={{ color: 'var(--color-accent-warning)', fontSize: 32, lineHeight: 1 }}>{activeHero.totalPower}</div>
                   <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Base {activeHero.basePower} + Gear {activeHero.totalPower - activeHero.basePower}</div>
                 </div>
                 <div className="stat-block" style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 0, padding: 20 }}>
                   <div className="stat-label" style={{ marginBottom: 4 }}>Profession</div>
                   <div className="stat-value" style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2, marginTop: 4 }}>
                     {getProfession(activeHero.profession).icon} {getProfession(activeHero.profession).name}
                   </div>
                   <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Rank {PROFESSION_RANK_LABEL[activeHero.professionRank]} • {activeHero.professionXp} XP</div>
                 </div>
              </div>
              
              {/* Equipment Status */}
              <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Equipped Gear Overview</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                   <Badge variant={activeHero.weaponEquipped ? 'info' : 'warning'} style={{ padding: '8px 12px', fontSize: 13 }}>⚔️ {activeHero.weaponEquipped ? 'Weapon Active' : 'No Weapon'}</Badge>
                   <Badge variant={activeHero.armorEquipped ? 'info' : 'warning'} style={{ padding: '8px 12px', fontSize: 13 }}>🛡 {activeHero.armorEquipped ? 'Armor Active' : 'No Armor'}</Badge>
                </div>
              </div>
              
              {/* Primary Actions */}
              <div style={{ padding: 24, background: 'rgba(0,0,0,0.2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Button variant="primary" style={{ flex: 1, minWidth: 200, padding: 16, fontSize: 16 }} onClick={() => router.push(`/quest?heroId=${activeHero.id}`)}>
                  🗡 Start Quest
                </Button>
                <Button variant="secondary" style={{ flex: 1, minWidth: 140, padding: 16, fontSize: 16 }} onClick={() => router.push(`/inventory?heroId=${activeHero.id}`)}>
                  🎒 Inventory
                </Button>
              </div>
            </Card>
          </div>
          
          {/* RIGHT COLUMN: MENTOR, ROSTER, & MINT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* AI MENTOR PANEL */}
            {aiHint ? (
              <Card style={{ border: '1px solid rgba(16, 185, 129, 0.3)', background: 'linear-gradient(180deg, rgba(16,185,129,0.05) 0%, transparent 100%)' }}>
                <div style={{ fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, color: '#a7f3d0' }}>
                  🤖 Advisory Panel
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1 }}>
                    <span>Combat Readiness</span>
                    <span style={{ color: 'var(--color-accent-success)' }}>{aiHint.readiness}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--color-accent-success)', borderRadius: 3, transition: 'width 0.5s ease', width: `${aiHint.readiness}%` }} />
                  </div>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>{aiHint.hint}</p>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Recommendation:</span>
                  <strong style={{ color: '#a7f3d0' }}>{aiHint.recommended_quest.toUpperCase()}</strong>
                </div>
                
                <a href={ONEPREDICT_URL} target="_blank" rel="noreferrer" style={{ fontSize: 12, marginTop: 16, display: 'inline-block', color: 'var(--text-muted)', textDecoration: 'underline' }}>
                  Powered by OnePredict ecosystem
                </a>
              </Card>
            ) : (
              <Card style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 20 }}>
                <Spinner size={24} /> <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Mentor analyzing loadout…</span>
              </Card>
            )}
            
            {/* HERO ROSTER */}
            {rosterHeros.length > 0 && (
              <Section title="Reserve Roster">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {rosterHeros.map(hero => (
                    <Card key={hero.id} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '16px 20px', background: 'rgba(0,0,0,0.2)' }}>
                       <div style={{ fontSize: 32 }}>{getArchetype(hero.archetype).icon}</div>
                       <div style={{ flex: 1 }}>
                         <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{hero.name}</div>
                         <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                           Lvl {hero.level} • {getArchetype(hero.archetype).name} • Rank {PROFESSION_RANK_LABEL[hero.professionRank]}
                         </div>
                       </div>
                       <div>
                         <Button variant="ghost" onClick={() => router.push(`/quest?heroId=${hero.id}`)}>
                           Select
                         </Button>
                       </div>
                    </Card>
                  ))}
                </div>
              </Section>
            )}

            {/* MINT RESERVE PANEL */}
            <div>
              {renderMintPanel(false)}
            </div>
            
          </div>
        </div>
      )}
    </main>
  );
}
