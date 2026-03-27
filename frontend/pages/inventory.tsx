import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { SuiClient } from '@onelabs/sui/client';
import { Transaction } from '@onelabs/sui/transactions';
import { getAuthHeaders, getStoredSession } from '../auth/zklogin';
import { executeGasless, GaslessError } from '../transactions/gasless';
import { e2eFetch, encodeE2eTx, getDynamicFields, getE2eRuntime, getObject, getOwnedObjects } from '../lib/e2e';
import { getRateLimitMessage } from '../lib/api-errors';
import { CHAIN_RPC_URL } from '../lib/chain';
import { Button } from '../components/ui/Button';
import { Card, Badge } from '../components/ui/Card';
import { LoadingScreen, Banner } from '../components/ui/Feedback';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/DataDisplay';
import { Section } from '../components/ui/Section';

const PACKAGE_ID  = process.env.NEXT_PUBLIC_ONEREALM_PACKAGE_ID!;
const SPONSOR_ADDRESS = process.env.NEXT_PUBLIC_SPONSOR_ADDRESS;
const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';

const suiClient = new SuiClient({ url: CHAIN_RPC_URL });

// CONTRACTS.md slot keys
const SLOT_WEAPON = 'weapon';
const SLOT_ARMOR  = 'armor';

const RARITY_LABEL: Record<number, string> = { 0: 'Common', 1: 'Rare', 2: 'Legendary' };
const RARITY_COLOR: Record<number, string> = {
  0: 'rgba(156,163,175,0.2)',
  1: 'rgba(59,130,246,0.2)',
  2: 'rgba(234,179,8,0.2)',
};
const RARITY_BORDER: Record<number, string> = {
  0: 'rgba(156,163,175,0.4)',
  1: 'rgba(59,130,246,0.5)',
  2: 'rgba(234,179,8,0.6)',
};
const AFFIX_LABEL: Record<number, string> = {
  0: 'Unaligned',
  1: 'Raider',
  2: 'Forager',
  3: 'Scholar',
};
const MATERIAL_LABEL: Record<number, string> = {
  0: 'Ore',
  1: 'Scrap',
  2: 'Essence',
};
const PROFESSION_LABEL: Record<number, string> = {
  0: 'Mining',
  1: 'Foraging',
  2: 'Smithing',
  3: 'Relic Hunting',
};

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

interface RecipeDefinition {
  id: number;
  name: string;
  description: string;
  affix: string;
  icon: string;
  materialTypes: readonly number[];
  profession?: number;
  rank?: number;
}

const RECIPES: readonly RecipeDefinition[] = [
  {
    id: 2,
    name: 'Scholar Focus',
    description: '2 Essence + 1 Scrap',
    affix: 'Scholar',
    icon: '📘',
    materialTypes: [2, 2, 1],
  },
  {
    id: 0,
    name: 'Raider Blade',
    description: '2 Ore + 1 Essence',
    affix: 'Raider',
    icon: '⚔️',
    materialTypes: [0, 0, 2],
  },
  {
    id: 1,
    name: 'Forager Mail',
    description: '2 Scrap + 1 Ore',
    affix: 'Forager',
    icon: '🛡',
    materialTypes: [1, 1, 0],
  },
  {
    id: 3,
    name: "Miner's Pickblade",
    description: '2 Ore + 1 Scrap',
    affix: 'Raider',
    icon: '⛏️',
    materialTypes: [0, 0, 1],
    profession: 0,
    rank: 1,
  },
  {
    id: 4,
    name: "Forager's Mantle",
    description: '2 Scrap + 1 Essence',
    affix: 'Forager',
    icon: '🌾',
    materialTypes: [1, 1, 2],
    profession: 1,
    rank: 1,
  },
  {
    id: 5,
    name: "Smith's Sigil",
    description: '1 Ore + 1 Scrap + 1 Essence',
    affix: 'Scholar',
    icon: '🛠️',
    materialTypes: [0, 1, 2],
    profession: 2,
    rank: 1,
  },
  {
    id: 6,
    name: 'Relic Pike',
    description: '2 Essence + 1 Ore',
    affix: 'Raider',
    icon: '🗝️',
    materialTypes: [2, 2, 0],
    profession: 3,
    rank: 1,
  },
  {
    id: 7,
    name: "Miner's Crownbreaker",
    description: '2 Ore + 1 Essence',
    affix: 'Raider',
    icon: '👑',
    materialTypes: [0, 0, 2],
    profession: 0,
    rank: 2,
  },
  {
    id: 8,
    name: "Forager's Bulwark",
    description: '2 Scrap + 1 Ore',
    affix: 'Forager',
    icon: '🪵',
    materialTypes: [1, 1, 0],
    profession: 1,
    rank: 2,
  },
  {
    id: 9,
    name: 'Masterwork Matrix',
    description: '1 Ore + 1 Scrap + 1 Essence',
    affix: 'Scholar',
    icon: '⚙️',
    materialTypes: [0, 1, 2],
    profession: 2,
    rank: 2,
  },
  {
    id: 10,
    name: 'Ancient Halberd',
    description: '2 Essence + 1 Scrap',
    affix: 'Raider',
    icon: '🏺',
    materialTypes: [2, 2, 1],
    profession: 3,
    rank: 2,
  },
] as const;

interface EquipmentItem {
  id: string;
  name: string;
  power: number;
  rarity: number;
  eqType: number; // 0=weapon, 1=armor
  affix: number;
}

interface MaterialItem {
  id: string;
  name: string;
  rarity: number;
  value: number;
  materialType: number; // 0=ore, 1=scrap, 2=essence
}

interface HeroSlotState {
  weapon: EquipmentItem | null;
  armor: EquipmentItem | null;
}

interface HeroProfile {
  profession: number | null;
  professionXp: number;
  professionRank: number;
}

function decodeBytes(value: any): string {
  if (typeof value === 'string') {
    return Buffer.from(value, 'base64').toString();
  }
  if (Array.isArray(value)) {
    return Buffer.from(value).toString();
  }
  return 'Unknown Item';
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

function selectMaterialsForRecipe(materials: MaterialItem[], requirements: readonly number[]) {
  const remaining = [...materials];
  const selected: MaterialItem[] = [];

  for (const requiredType of requirements) {
    const index = remaining.findIndex((material) => material.materialType === requiredType);
    if (index === -1) {
      return null;
    }
    const [next] = remaining.splice(index, 1);
    selected.push(next);
  }

  return selected;
}

async function loadEquipmentObject(id: string): Promise<EquipmentItem | null> {
  const object = await getObject(suiClient, {
    id,
    options: { showContent: true },
  });
  const f = object.data?.content && 'fields' in object.data.content
    ? (object.data.content as any).fields
    : null;

  if (!f) {
    return null;
  }

  return {
    id,
    name: decodeBytes(f.name),
    power: Number(f.power ?? 0),
    rarity: Number(f.rarity ?? 0),
    eqType: Number(f.eq_type ?? 0),
    affix: Number(f.affix ?? 0),
  };
}

export default function InventoryPage() {
  const router       = useRouter();
  const heroId       = (router.query.heroId as string) || '';

  const [address, setAddress]     = useState<string | null>(null);
  const [items, setItems]         = useState<EquipmentItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState<string | null>(null); // ObjectId being acted on
  const [error, setError]         = useState('');
  const [feedback, setFeedback]   = useState('');
  const [heroSlots, setHeroSlots] = useState<HeroSlotState>({ weapon: null, armor: null });
  const [heroProfile, setHeroProfile] = useState<HeroProfile>({ profession: null, professionXp: 0, professionRank: 0 });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'weapon' | 'armor'>('all');
  const [filterRarity, setFilterRarity] = useState<'all' | '0' | '1' | '2'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'power' | 'rarity'>('power');
  const [confirmSalvage, setConfirmSalvage] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const session = getStoredSession();
    if (!session.address || !session.hasApiSession) { router.push('/'); return; }
    setAddress(session.address);
    if (heroId) loadInventory(session.address);
  }, [router.isReady, heroId]);

  async function loadInventory(addr: string) {
    setLoading(true);
    setError('');
    try {
      const { data } = await getOwnedObjects(suiClient, {
        owner: addr,
        filter: { StructType: `${PACKAGE_ID}::equipment::Equipment` },
        options: { showContent: true },
      });

      const equipList: EquipmentItem[] = data.map((obj: any) => {
        const f = obj.data?.content?.fields ?? {};
        return {
          id:     obj.data?.objectId ?? '',
          name:   decodeBytes(f.name),
          power:  Number(f.power ?? 0),
          rarity: Number(f.rarity ?? 0),
          eqType: Number(f.eq_type ?? 0),
          affix:  Number(f.affix ?? 0),
        };
      });

      setItems(equipList);
      const materialObjects = await getOwnedObjects(suiClient, {
        owner: addr,
        filter: { StructType: `${PACKAGE_ID}::material::Material` },
        options: { showContent: true },
      });

      const materialList: MaterialItem[] = materialObjects.data.map((obj: any) => {
        const f = obj.data?.content?.fields ?? {};
        return {
          id: obj.data?.objectId ?? '',
          name: decodeBytes(f.name),
          rarity: Number(f.rarity ?? 0),
          value: Number(f.value ?? 0),
          materialType: Number(f.material_type ?? 0),
        };
      });
      setMaterials(materialList);

      if (heroId) {
        const heroObject = await getObject(suiClient, {
          id: heroId,
          options: { showContent: true },
        });
        const heroFields = heroObject.data?.content && 'fields' in heroObject.data.content
          ? (heroObject.data.content as any).fields
          : {};
        const professionXp = Number(heroFields.profession_xp ?? 0);
        setHeroProfile({
          profession: Number(heroFields.profession ?? 0),
          professionXp,
          professionRank: professionXp >= 7 ? 2 : professionXp >= 3 ? 1 : 0,
        });

        const dynamicFields = await getDynamicFields(suiClient, { parentId: heroId });
        const nextSlots: HeroSlotState = { weapon: null, armor: null };

        const validFields = dynamicFields.data.filter((f: any) => f.objectId);
        const loadedItems = await Promise.all(
          validFields.map(async (field: any) => {
            const item = await loadEquipmentObject(field.objectId);
            return { field, item };
          })
        );

        for (const { field, item } of loadedItems) {
          if (!item) continue;
          const slot = dynamicFieldName(field);
          if (slot === SLOT_WEAPON) {
            nextSlots.weapon = item;
          } else if (slot === SLOT_ARMOR) {
            nextSlots.armor = item;
          }
        }

        setHeroSlots(nextSlots);
      }
    } catch (e: any) {
      setError('Failed to load inventory: ' + e.message);
    }
    setLoading(false);
  }

  async function handleEquip(itemId: string, slot: string) {
    if (!address || !heroId) return;
    setActing(itemId);
    setError('');
    setFeedback('');
    try {
      if (!SPONSOR_ADDRESS && !getE2eRuntime()) {
        throw new Error('Missing NEXT_PUBLIC_SPONSOR_ADDRESS');
      }
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::hero::equip`,
        arguments: [
          tx.object(heroId),
          tx.pure.vector('u8', Array.from(Buffer.from(slot))),
          tx.object(itemId),
        ],
      });
      tx.setSender(address);
      tx.setGasOwner(SPONSOR_ADDRESS);
      const txBytes = encodeE2eTx({
        target: `${PACKAGE_ID}::hero::equip`,
        heroId,
        slot,
        itemId,
      }) ?? Buffer.from(await tx.build({ client: suiClient })).toString('base64');
      await executeGasless(txBytes, address);
      setFeedback(`✅ Equipped successfully!`);
      await loadInventory(address);
    } catch (e: any) {
      if (e instanceof GaslessError && e.code === 'RATE_LIMITED') {
        setError(getRateLimitMessage(e.details));
      } else {
        setError('Equip failed: ' + e.message);
      }
    }
    setActing(null);
  }

  async function handleUnequip(slot: string) {
    if (!address || !heroId) return;
    setActing(slot);
    setError('');
    setFeedback('');
    try {
      if (!SPONSOR_ADDRESS && !getE2eRuntime()) {
        throw new Error('Missing NEXT_PUBLIC_SPONSOR_ADDRESS');
      }
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::hero::unequip_to_sender`,
        arguments: [
          tx.object(heroId),
          tx.pure.vector('u8', Array.from(Buffer.from(slot))),
        ],
      });
      tx.setSender(address);
      tx.setGasOwner(SPONSOR_ADDRESS);
      const txBytes = encodeE2eTx({
        target: `${PACKAGE_ID}::hero::unequip_to_sender`,
        heroId,
        slot,
      }) ?? Buffer.from(await tx.build({ client: suiClient })).toString('base64');
      await executeGasless(txBytes, address);
      setFeedback(`✅ Unequipped successfully!`);
      await loadInventory(address);
    } catch (e: any) {
      if (e instanceof GaslessError && e.code === 'RATE_LIMITED') {
        setError(getRateLimitMessage(e.details));
      } else {
        setError('Unequip failed: ' + e.message);
      }
    }
    setActing(null);
  }

  async function handleSalvage(itemId: string) {
    if (!address) return;
    setActing(`salvage:${itemId}`);
    setError('');
    setFeedback('');
    try {
      if (!SPONSOR_ADDRESS && !getE2eRuntime()) {
        throw new Error('Missing NEXT_PUBLIC_SPONSOR_ADDRESS');
      }
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::equipment::salvage_to_sender`,
        arguments: [tx.object(itemId)],
      });
      tx.setSender(address);
      tx.setGasOwner(SPONSOR_ADDRESS);
      const txBytes = encodeE2eTx({
        target: `${PACKAGE_ID}::equipment::salvage_to_sender`,
        itemId,
      }) ?? Buffer.from(await tx.build({ client: suiClient })).toString('base64');
      await executeGasless(txBytes, address);
      setFeedback('♻️ Salvaged into crafting material.');
      setConfirmSalvage(null);
      await loadInventory(address);
    } catch (e: any) {
      if (e instanceof GaslessError && e.code === 'RATE_LIMITED') {
        setError(getRateLimitMessage(e.details));
      } else {
        setError('Salvage failed: ' + e.message);
      }
    }
    setActing(null);
  }

  async function handleCraft(recipeId: number, requirements: readonly number[]) {
    if (!address || !heroId) return;
    const selected = selectMaterialsForRecipe(materials, requirements);
    if (!selected) {
      setError('Missing materials for this recipe.');
      return;
    }

    setActing(`craft:${recipeId}`);
    setError('');
    setFeedback('');
    try {
      if (!SPONSOR_ADDRESS && !getE2eRuntime()) {
        throw new Error('Missing NEXT_PUBLIC_SPONSOR_ADDRESS');
      }
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::blacksmith::craft_to_sender`,
        arguments: [
          tx.pure.u8(recipeId),
          tx.object(heroId),
          tx.object(selected[0].id),
          tx.object(selected[1].id),
          tx.object(selected[2].id),
        ],
      });
      tx.setSender(address);
      tx.setGasOwner(SPONSOR_ADDRESS);
      const txBytes = encodeE2eTx({
        target: `${PACKAGE_ID}::blacksmith::craft_to_sender`,
        recipeId,
        heroId,
        materialIds: selected.map((material) => material.id),
      }) ?? Buffer.from(await tx.build({ client: suiClient })).toString('base64');
      await executeGasless(txBytes, address);
      setFeedback('🛠 Crafted new gear at the blacksmith.');
      await loadInventory(address);
    } catch (e: any) {
      if (e instanceof GaslessError && e.code === 'RATE_LIMITED') {
        setError(getRateLimitMessage(e.details));
      } else {
        setError('Craft failed: ' + e.message);
      }
    }
    setActing(null);
  }

  async function claimJudgeBundle() {
    if (!address) return;
    setActing('judge-bundle');
    setError('');
    setFeedback('');
    try {
      const response = await e2eFetch(`${SERVER_URL}/api/demo/bootstrap`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to claim judge bundle');
      }
      setFeedback('⚡ Judge bundle claimed. You can craft immediately.');
      await loadInventory(address);
    } catch (e: any) {
      setError('Judge bundle failed: ' + e.message);
    }
    setActing(null);
  }

  const ores = materials.filter(m => m.materialType === 0);
  const scraps = materials.filter(m => m.materialType === 1);
  const essences = materials.filter(m => m.materialType === 2);

  const filteredArsenal = useMemo(() => {
    return items.filter(item => {
      if (filterType !== 'all') {
        if (filterType === 'weapon' && item.eqType !== 0) return false;
        if (filterType === 'armor' && item.eqType !== 1) return false;
      }
      if (filterRarity !== 'all' && item.rarity.toString() !== filterRarity) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesAffix = AFFIX_LABEL[item.affix].toLowerCase().includes(q);
        if (!matchesName && !matchesAffix) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'power') return b.power - a.power;
      if (sortBy === 'rarity') {
        if (b.rarity !== a.rarity) return b.rarity - a.rarity;
        return b.power - a.power;
      }
      return 0;
    });
  }, [items, filterType, filterRarity, searchQuery, sortBy]);

  if (loading) return <LoadingScreen text="Loading tactical inventory..." />;

  return (
    <main className="container" style={{ paddingBottom: 'var(--space-8)' }}>
      <PageHeader
        icon="🎒"
        title="Inventory Manager"
        subtitle="Review your loadout, salvage unused drops, and craft masterwork gear."
        breadcrumb={[{ label: 'OneRealm' }, { label: 'Hero', href: '/hero' }, { label: 'Inventory' }]}
        secondaryCTA={{ label: '← Back to Hero', href: '/hero', variant: 'ghost' }}
      />

      {feedback && <div style={{ marginBottom: 16 }}><Banner type="success">{feedback}</Banner></div>}
      {error    && <div style={{ marginBottom: 16 }}><Banner type="error">{error}</Banner></div>}

      {JUDGE_MODE && (
        <Card style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Judge Mode Bundle</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Claim a starter pack of ore, scrap, and essence to demo crafting instantly.</div>
          </div>
          <Button variant="warning" onClick={claimJudgeBundle} disabled={!!acting} style={{ whiteSpace: 'nowrap' }}>
            {acting === 'judge-bundle' ? 'Claiming...' : 'Claim Bundle'}
          </Button>
        </Card>
      )}

      {/* ZONE 1: ACTIVE LOADOUT */}
      {heroId && (
        <Section title="Active Loadout">
          <Card style={{ padding: '24px', background: 'var(--color-surface)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
              
              {/* Hero Status */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                 <div style={{ fontSize: 48, filter: 'drop-shadow(0 0 10px rgba(102,126,234,0.3))' }}>
                   {heroProfile.profession !== null ? PROFESSIONS[heroProfile.profession].icon : '👤'}
                 </div>
                 <div>
                   <div style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 4 }}>Hero Profession</div>
                   <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
                     {heroProfile.profession !== null ? PROFESSIONS[heroProfile.profession].name : 'Unassigned'}
                   </div>
                   <div style={{ fontSize: 13, color: 'var(--color-accent-warning)', fontWeight: 700, marginTop: 4 }}>
                     Rank {PROFESSION_RANK_LABEL[heroProfile.professionRank]} • {heroProfile.professionXp} XP Drop Knowledge
                   </div>
                 </div>
              </div>
              
              {/* Slots */}
              <div style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.2)', position: 'relative' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 1, marginBottom: 12, fontWeight: 700 }}>Weapon Slot</div>
                  {heroSlots.weapon ? (
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{heroSlots.weapon.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--color-accent-warning)', fontWeight: 700, margin: '6px 0' }}>+{heroSlots.weapon.power} ATK</div>
                      <div style={{ fontSize: 11, color: 'var(--color-accent-primary)', fontWeight: 600 }}>{AFFIX_LABEL[heroSlots.weapon.affix]} Affix</div>
                      
                      <div style={{ marginTop: 16 }}>
                        <Button variant="ghost" onClick={() => handleUnequip(SLOT_WEAPON)} disabled={!!acting || !heroSlots.weapon} style={{ padding: '6px 12px', fontSize: 12, width: '100%', borderColor: 'rgba(255,255,255,0.1)' }}>
                          {acting === SLOT_WEAPON ? 'Unequipping...' : 'Unequip Weapon'}
                        </Button>
                      </div>
                    </div>
                  ) : <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 16 }}>Empty slot</div>}
                  <div style={{ fontSize: 40, opacity: 0.05, position: 'absolute', right: 12, top: 12, pointerEvents: 'none' }}>⚔️</div>
                </div>

                <div style={{ flex: 1, minWidth: 160, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.2)', position: 'relative' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 1, marginBottom: 12, fontWeight: 700 }}>Armor Slot</div>
                  {heroSlots.armor ? (
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{heroSlots.armor.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--color-accent-warning)', fontWeight: 700, margin: '6px 0' }}>+{heroSlots.armor.power} DEF</div>
                      <div style={{ fontSize: 11, color: 'var(--color-accent-primary)', fontWeight: 600 }}>{AFFIX_LABEL[heroSlots.armor.affix]} Affix</div>
                      
                      <div style={{ marginTop: 16 }}>
                        <Button variant="ghost" onClick={() => handleUnequip(SLOT_ARMOR)} disabled={!!acting || !heroSlots.armor} style={{ padding: '6px 12px', fontSize: 12, width: '100%', borderColor: 'rgba(255,255,255,0.1)' }}>
                          {acting === SLOT_ARMOR ? 'Unequipping...' : 'Unequip Armor'}
                        </Button>
                      </div>
                    </div>
                  ) : <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 16 }}>Empty slot</div>}
                  <div style={{ fontSize: 40, opacity: 0.05, position: 'absolute', right: 12, top: 12, pointerEvents: 'none' }}>🛡</div>
                </div>
              </div>

            </div>
          </Card>
        </Section>
      )}

      {/* ZONE 2: THE ARSENAL */}
      <Section title={`The Arsenal (${items.length})`}>
        
        {items.length === 0 ? (
          <Card style={{ background: 'rgba(0,0,0,0.15)' }}>
            <EmptyState
              icon="⚔️"
              message="Your armory is empty. Equipment drops from Harvest and Raid missions, so deploy your hero to start building a loadout."
              action={
                <Button variant="primary" onClick={() => router.push(`/quest?heroId=${heroId}`)}>
                  Deploy on Mission
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            {/* Filter controls */}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 24, background: 'rgba(0,0,0,0.2)', padding: '16px 20px', borderRadius: 12 }}>
              <div style={{ minWidth: 0 }}>
                <label htmlFor="arsenal-search" className="sr-only">Search gear</label>
                <input
                  id="arsenal-search"
                  name="arsenal_search"
                  className="input"
                  placeholder="Search gear…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ padding: '10px 14px' }}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="arsenal-type" className="sr-only">Filter by type</label>
                <select id="arsenal-type" className="input" value={filterType} onChange={e => setFilterType(e.target.value as any)} style={{ padding: '10px 14px' }}>
                  <option value="all">All Types</option>
                  <option value="weapon">Weapons Only</option>
                  <option value="armor">Armor Only</option>
                </select>
              </div>
              <div>
                <label htmlFor="arsenal-rarity" className="sr-only">Filter by rarity</label>
                <select id="arsenal-rarity" className="input" value={filterRarity} onChange={e => setFilterRarity(e.target.value as any)} style={{ padding: '10px 14px' }}>
                  <option value="all">All Rarities</option>
                  <option value="0">Common</option>
                  <option value="1">Rare</option>
                  <option value="2">Legendary</option>
                </select>
              </div>
              <div>
                <label htmlFor="arsenal-sort" className="sr-only">Sort arsenal</label>
                <select id="arsenal-sort" className="input" value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ padding: '10px 14px' }}>
                  <option value="newest">Sort: Default (Newest)</option>
                  <option value="power">Sort: Power (High to Low)</option>
                  <option value="rarity">Sort: Rarity</option>
                </select>
              </div>
            </div>

            <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {filteredArsenal.map(item => {
                const isEquipped = heroSlots.weapon?.id === item.id || heroSlots.armor?.id === item.id;
                
                return (
                  <ItemCard 
                    key={item.id} 
                    item={item} 
                    isEquipped={isEquipped}
                    actingStatus={
                      acting === item.id ? 'Equipping...' :
                      acting === `salvage:${item.id}` ? 'Salvaging...' :
                      undefined
                    }
                    onEquip={() => handleEquip(item.id, item.eqType === 0 ? SLOT_WEAPON : SLOT_ARMOR)} 
                    onSalvageClick={() => {
                      if (confirmSalvage === item.id) {
                        handleSalvage(item.id);
                      } else {
                        setConfirmSalvage(item.id);
                      }
                    }}
                    onSalvageCancel={() => setConfirmSalvage(null)}
                    needsSalvageConfirm={confirmSalvage === item.id}
                    disabled={!!acting}
                    showActions={!!heroId}
                  />
                );
              })}
            </div>
            {filteredArsenal.length === 0 && (
              <EmptyState
                icon="🧭"
                message="No equipment matches the current filters. Clear or adjust the search, type, rarity, or sorting controls."
              />
            )}
          </>
        )}
      </Section>

      {/* ZONE 3: RESOURCE CACHE */}
      <Section title="Resource Cache">
        {materials.length === 0 ? (
          <EmptyState
            icon="🧱"
            message="No materials yet. Stockpile resources via Harvest missions or by salvaging common gear."
          />
        ) : (
          <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: 32 }}>⛏️</div>
              <div>
                <div style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 1 }}>Ore</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{ores.length}</div>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: 32 }}>🧩</div>
              <div>
                <div style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 1 }}>Scrap</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{scraps.length}</div>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: 32 }}>📘</div>
              <div>
                <div style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 1 }}>Essence</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{essences.length}</div>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ZONE 4: THE BLACKSMITH */}
      <Section
        title="The Blacksmith"
        subtitle="Convert excess materials and salvage into masterwork, archetype-specific gear."
      >
        <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {RECIPES.map((recipe) => {
            const selected = selectMaterialsForRecipe(materials, recipe.materialTypes);
            const professionMatch = recipe.profession === undefined || heroProfile.profession === recipe.profession;
            const rankMatch = recipe.rank === undefined || heroProfile.professionRank >= recipe.rank;
            const canCraft = !!selected && !acting && !!heroId && professionMatch && rankMatch;
            
            return (
              <Card key={recipe.id} style={{ opacity: canCraft ? 1 : 0.6, transition: 'opacity 0.2s', border: canCraft ? '1px solid rgba(245,158,11,0.3)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 32 }}>{recipe.icon}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>{recipe.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-accent-primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{recipe.affix} Affix Gear</div>
                    </div>
                  </div>
                  {canCraft && <Badge variant="warning" style={{ fontSize: 11 }}>Ready</Badge>}
                </div>
                
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {recipe.materialTypes.map((materialType, index) => (
                    <Badge key={`${recipe.id}-${index}`} style={{ background: 'rgba(255,255,255,0.05)' }}>
                      {MATERIAL_LABEL[materialType]}
                    </Badge>
                  ))}
                </div>

                <div style={{ minHeight: 48, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {recipe.profession !== undefined && (
                    <div style={{ fontSize: 12, color: professionMatch ? 'var(--text-secondary)' : '#fca5a5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{professionMatch ? '✓' : '❌'}</span> Requires {PROFESSION_LABEL[recipe.profession]} Profession
                    </div>
                  )}
                  {recipe.rank !== undefined && (
                    <div style={{ fontSize: 12, color: rankMatch ? 'var(--text-secondary)' : '#fca5a5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{rankMatch ? '✓' : '❌'}</span> Requires {recipe.rank === 1 ? 'Adept' : 'Master'} rank
                    </div>
                  )}
                  {!selected && professionMatch && rankMatch && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⚠️</span> Insufficient Materials
                    </div>
                  )}
                </div>

                <Button
                  variant={canCraft ? "warning" : "ghost"}
                  fullWidth
                  onClick={() => handleCraft(recipe.id, recipe.materialTypes)}
                  disabled={!canCraft}
                  style={{ padding: '12px', fontSize: 14 }}
                >
                   {acting === `craft:${recipe.id}` ? 'Crafting...' : !heroId ? 'Hero Required' : !professionMatch ? 'Wrong Profession' : !rankMatch ? 'Rank Too Low' : !selected ? 'Missing Materials' : 'Craft'}
                </Button>
              </Card>
            );
          })}
        </div>
      </Section>

    </main>
  );
}

function ItemCard({ item, isEquipped, actingStatus, onEquip, onSalvageClick, onSalvageCancel, needsSalvageConfirm, disabled, showActions }: {
  item: EquipmentItem;
  isEquipped: boolean;
  actingStatus?: string;
  onEquip: () => void;
  onSalvageClick: () => void;
  onSalvageCancel: () => void;
  needsSalvageConfirm: boolean;
  disabled: boolean;
  showActions: boolean;
}) {
  return (
    <div className="card" style={{
      background: isEquipped ? 'rgba(59,130,246,0.1)' : RARITY_COLOR[item.rarity],
      borderColor: isEquipped ? 'var(--color-accent-primary)' : RARITY_BORDER[item.rarity],
      display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden',
      padding: '20px 16px'
    }}>
      {isEquipped && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--color-accent-primary)', color: '#fff', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', padding: '4px 0', zIndex: 1 }}>
          Active
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: isEquipped ? 16 : 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: isEquipped ? 'var(--color-accent-primary)' : 'var(--text-secondary)' }}>
          {RARITY_LABEL[item.rarity]}
        </div>
        <div style={{ fontSize: 24, opacity: 0.8 }}>{item.eqType === 0 ? '⚔️' : '🛡'}</div>
      </div>
      
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{item.name}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge variant="warning" style={{ fontSize: 11 }}>+{item.power} {item.eqType === 0 ? 'ATK' : 'DEF'}</Badge>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{AFFIX_LABEL[item.affix]}</div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', cursor: 'help', fontFamily: 'monospace' }} title={item.id}>
        {item.id.slice(0,10)}...
      </div>

      {showActions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {!isEquipped && (
            <Button
              variant="primary"
              onClick={onEquip}
              disabled={disabled || needsSalvageConfirm}
              style={{ padding: '8px', fontSize: 12 }}
            >
              {actingStatus && actingStatus.startsWith('Equip') ? actingStatus : 'Equip'}
            </Button>
          )}
          
          {!isEquipped && (
            <div style={{ display: 'flex', gap: 8 }}>
              {needsSalvageConfirm ? (
                <>
                  <Button variant="ghost" onClick={onSalvageCancel} disabled={disabled} style={{ flex: 1, padding: '8px', fontSize: 12 }}>Cancel</Button>
                  <Button variant="ghost" onClick={onSalvageClick} disabled={disabled} style={{ flex: 1, padding: '8px', fontSize: 12, background: 'rgba(248,113,113,0.2)', color: '#f87171', border: '1px solid #f87171' }}>Confirm?</Button>
                </>
              ) : (
                <Button variant="ghost" onClick={onSalvageClick} disabled={disabled} style={{ width: '100%', padding: '8px', fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' }}>
                  {actingStatus && actingStatus.startsWith('Salvage') ? actingStatus : 'Salvage'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
