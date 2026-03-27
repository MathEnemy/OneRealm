import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { getAuthHeaders, getStoredSession } from '../auth/zklogin';
import { executeServerAction, GaslessError } from '../transactions/gasless';
import { e2eFetch, getDynamicFields, getObject, getOwnedObjects } from '../lib/e2e';
import { getRateLimitMessage } from '../lib/api-errors';
import { getSuiClient } from '../lib/sui-runtime';
import { Button } from '../components/ui/Button';
import { LoadingScreen } from '../components/ui/Feedback';
import { PageHeader } from '../components/layout/PageHeader';
import {
  AFFIX_LABEL,
  SLOT_ARMOR,
  SLOT_WEAPON,
  type EquipmentItem,
  type HeroProfile,
  type HeroSlotState,
  type MaterialItem,
  dynamicFieldName,
  decodeBytes,
  loadEquipmentObject,
  selectMaterialsForRecipe,
} from '../features/inventory/model';
import { ArsenalSection, CraftingSection, InventoryStatusBanners, JudgeBundlePanel, LoadoutSection, MaterialsSection } from '../features/inventory/sections';

const PACKAGE_ID = process.env.NEXT_PUBLIC_ONEREALM_PACKAGE_ID!;
const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';

export default function InventoryPage() {
  const router = useRouter();
  const heroId = (router.query.heroId as string) || '';

  const [address, setAddress] = useState<string | null>(null);
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null); // ObjectId being acted on
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
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
      const suiClient = await getSuiClient();
      const { data } = await getOwnedObjects(suiClient, {
        owner: addr,
        filter: { StructType: `${PACKAGE_ID}::equipment::Equipment` },
        options: { showContent: true },
      });

      const equipList: EquipmentItem[] = data.map((obj: any) => {
        const f = obj.data?.content?.fields ?? {};
        return {
          id: obj.data?.objectId ?? '',
          name: decodeBytes(f.name),
          power: Number(f.power ?? 0),
          rarity: Number(f.rarity ?? 0),
          eqType: Number(f.eq_type ?? 0),
          affix: Number(f.affix ?? 0),
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
      await executeServerAction(
        '/api/actions/equip',
        { heroId, slot, itemId },
        address,
        { target: `${PACKAGE_ID}::hero::equip`, heroId, slot, itemId }
      );
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
      await executeServerAction(
        '/api/actions/unequip',
        { heroId, slot },
        address,
        { target: `${PACKAGE_ID}::hero::unequip_to_sender`, heroId, slot }
      );
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
      await executeServerAction(
        '/api/actions/salvage',
        { itemId },
        address,
        { target: `${PACKAGE_ID}::equipment::salvage_to_sender`, itemId }
      );
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
      const materialIds = selected.map((material) => material.id);
      await executeServerAction(
        '/api/actions/craft',
        { recipeId, heroId, materialIds },
        address,
        { target: `${PACKAGE_ID}::blacksmith::craft_to_sender`, recipeId, heroId, materialIds }
      );
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

      <InventoryStatusBanners feedback={feedback} error={error} />

      {JUDGE_MODE && (
        <JudgeBundlePanel acting={acting} onClaim={claimJudgeBundle} />
      )}

      <LoadoutSection heroId={heroId} heroProfile={heroProfile} heroSlots={heroSlots} acting={acting} onUnequip={handleUnequip} />

      <ArsenalSection
        heroId={heroId}
        items={items}
        filteredArsenal={filteredArsenal}
        heroSlots={heroSlots}
        acting={acting}
        confirmSalvage={confirmSalvage}
        searchQuery={searchQuery}
        filterType={filterType}
        filterRarity={filterRarity}
        sortBy={sortBy}
        onSearchQueryChange={setSearchQuery}
        onFilterTypeChange={setFilterType}
        onFilterRarityChange={setFilterRarity}
        onSortByChange={setSortBy}
        onDeployMission={() => router.push(`/quest?heroId=${heroId}`)}
        onEquip={handleEquip}
        onSalvageClick={(itemId) => {
          if (confirmSalvage === itemId) {
            handleSalvage(itemId);
          } else {
            setConfirmSalvage(itemId);
          }
        }}
        onSalvageCancel={() => setConfirmSalvage(null)}
      />

      <MaterialsSection materials={materials} />

      <CraftingSection materials={materials} heroProfile={heroProfile} acting={acting} heroId={heroId} onCraft={handleCraft} />

    </main>
  );
}
