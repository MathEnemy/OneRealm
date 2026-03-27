// pages/inventory.tsx — Inventory Screen [2.4]
// BLUEPRINT.md: Equipment grid + equip/unequip gaslessly
// Show all Equipment objects player owns + current Hero slots

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { SuiClient } from '@onelabs/sui/client';
import { Transaction } from '@onelabs/sui/transactions';
import { getAuthHeaders, getStoredSession } from '../auth/zklogin';
import { executeGasless, GaslessError } from '../transactions/gasless';
import { e2eFetch, encodeE2eTx, getDynamicFields, getE2eRuntime, getObject, getOwnedObjects } from '../lib/e2e';
import { CHAIN_RPC_URL } from '../lib/chain';

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
  0: 'rgba(156,163,175,0.3)',
  1: 'rgba(59,130,246,0.3)',
  2: 'rgba(234,179,8,0.3)',
};
const RARITY_BORDER: Record<number, string> = {
  0: 'rgba(156,163,175,0.5)',
  1: 'rgba(59,130,246,0.6)',
  2: 'rgba(234,179,8,0.7)',
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
    id: 2,
    name: 'Scholar Focus',
    description: '2 Essence + 1 Scrap',
    affix: 'Scholar',
    icon: '📘',
    materialTypes: [2, 2, 1],
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
        setError('Daily action limit reached.');
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
      setError('Unequip failed: ' + e.message);
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
      await loadInventory(address);
    } catch (e: any) {
      setError('Salvage failed: ' + e.message);
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
      setError('Craft failed: ' + e.message);
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

  const weapons = items.filter(i => i.eqType === 0);
  const armors  = items.filter(i => i.eqType === 1);
  const ores = materials.filter(m => m.materialType === 0);
  const scraps = materials.filter(m => m.materialType === 1);
  const essences = materials.filter(m => m.materialType === 2);

  if (loading) {
    return (
      <main style={styles.container}>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>Loading inventory...</p>
      </main>
    );
  }

  return (
    <main style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => router.push(`/hero`)} style={styles.backBtn}>← Back</button>
        <h1 style={styles.title}>🎒 Inventory</h1>
        <div />
      </header>

      {/* Feedback / Error messages */}
      {feedback && <div style={styles.feedbackBanner}>{feedback}</div>}
      {error    && <div style={styles.errorBanner}>{error}</div>}

      {JUDGE_MODE && (
        <div style={styles.judgeCard}>
          <div>
            <div style={styles.judgeTitle}>Judge Mode Bundle</div>
            <div style={styles.judgeText}>Claim a starter pack of ore, scrap, and essence to demo crafting instantly.</div>
          </div>
          <button
            style={styles.judgeBtn}
            onClick={claimJudgeBundle}
            disabled={!!acting}
          >
            {acting === 'judge-bundle' ? 'Claiming...' : 'Claim Bundle'}
          </button>
        </div>
      )}

      {heroId && (
        <div style={styles.heroSlots}>
          <h2 style={styles.sectionTitle}>Hero Equipment Slots</h2>
          <div style={styles.slotsRow}>
            <div style={styles.slotCard}>
              <div style={styles.slotIcon}>⚔️</div>
              <div style={styles.slotLabel}>
                {heroSlots.weapon ? `${heroSlots.weapon.name} (+${heroSlots.weapon.power}) • ${AFFIX_LABEL[heroSlots.weapon.affix]}` : 'Weapon Slot Empty'}
              </div>
              <button
                style={styles.smallBtn}
                onClick={() => handleUnequip(SLOT_WEAPON)}
                disabled={!!acting || !heroSlots.weapon}
              >
                {acting === SLOT_WEAPON ? 'Unequipping...' : 'Unequip'}
              </button>
            </div>
            <div style={styles.slotCard}>
              <div style={styles.slotIcon}>🛡</div>
              <div style={styles.slotLabel}>
                {heroSlots.armor ? `${heroSlots.armor.name} (+${heroSlots.armor.power}) • ${AFFIX_LABEL[heroSlots.armor.affix]}` : 'Armor Slot Empty'}
              </div>
              <button
                style={styles.smallBtn}
                onClick={() => handleUnequip(SLOT_ARMOR)}
                disabled={!!acting || !heroSlots.armor}
              >
                {acting === SLOT_ARMOR ? 'Unequipping...' : 'Unequip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weapons section */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>⚔️ Weapons ({weapons.length})</h2>
        {weapons.length === 0
          ? <p style={styles.empty}>No weapons yet — complete quests to earn loot!</p>
          : <div style={styles.itemGrid}>{weapons.map(item => <ItemCard key={item.id} item={item} onEquip={() => handleEquip(item.id, SLOT_WEAPON)} onSalvage={() => handleSalvage(item.id)} acting={acting === item.id || acting === `salvage:${item.id}`} disabled={!!acting} showEquip={!!heroId} />)}</div>
        }
      </section>

      {/* Armor section */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>🛡 Armor ({armors.length})</h2>
        {armors.length === 0
          ? <p style={styles.empty}>No armor yet — complete quests to earn loot!</p>
          : <div style={styles.itemGrid}>{armors.map(item => <ItemCard key={item.id} item={item} onEquip={() => handleEquip(item.id, SLOT_ARMOR)} onSalvage={() => handleSalvage(item.id)} acting={acting === item.id || acting === `salvage:${item.id}`} disabled={!!acting} showEquip={!!heroId} />)}</div>
        }
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>🧱 Materials ({materials.length})</h2>
        {materials.length === 0
          ? <p style={styles.empty}>No materials yet — common quest rewards now stockpile future crafting resources.</p>
          : (
            <div style={styles.materialGrid}>
              {ores.map(material => (
                <div key={material.id} style={styles.materialCard}>
                  <div style={styles.materialIcon}>⛏️</div>
                  <div style={styles.materialName}>{material.name}</div>
                  <div style={styles.materialMeta}>Ore • Value {material.value}</div>
                </div>
              ))}
              {scraps.map(material => (
                <div key={material.id} style={styles.materialCard}>
                  <div style={styles.materialIcon}>🧩</div>
                  <div style={styles.materialName}>{material.name}</div>
                  <div style={styles.materialMeta}>Scrap • Value {material.value}</div>
                </div>
              ))}
              {essences.map(material => (
                <div key={material.id} style={styles.materialCard}>
                  <div style={styles.materialIcon}>📘</div>
                  <div style={styles.materialName}>{material.name}</div>
                  <div style={styles.materialMeta}>Essence • Value {material.value}</div>
                </div>
              ))}
            </div>
          )
        }
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>🛠 Blacksmith Recipes</h2>
        <p style={styles.craftingIntro}>Convert mission drops into affix-focused gear instead of waiting for rare direct drops.</p>
        <div style={styles.recipeGrid}>
          {RECIPES.map((recipe) => {
            const selected = selectMaterialsForRecipe(materials, recipe.materialTypes);
            const professionMatch = recipe.profession === undefined || heroProfile.profession === recipe.profession;
            const rankMatch = recipe.rank === undefined || heroProfile.professionRank >= recipe.rank;
            const canCraft = !!selected && !acting && !!heroId && professionMatch && rankMatch;
            return (
              <div key={recipe.id} style={styles.recipeCard}>
                <div style={styles.recipeHeader}>
                  <span style={styles.recipeIcon}>{recipe.icon}</span>
                  <div>
                    <div style={styles.recipeName}>{recipe.name}</div>
                    <div style={styles.recipeAffix}>{recipe.affix} Affix</div>
                  </div>
                </div>
                <div style={styles.recipeText}>{recipe.description}</div>
                <div style={styles.recipeRequirements}>
                  {recipe.materialTypes.map((materialType, index) => (
                    <span key={`${recipe.id}-${index}`} style={styles.recipeChip}>{MATERIAL_LABEL[materialType]}</span>
                  ))}
                </div>
                {recipe.profession !== undefined && (
                  <div style={styles.recipeLock}>Requires {PROFESSION_LABEL[recipe.profession]}</div>
                )}
                {recipe.rank !== undefined && (
                  <div style={styles.recipeLock}>Requires {recipe.rank === 1 ? 'Adept' : 'Master'} rank</div>
                )}
                <button
                  style={{ ...styles.craftBtn, opacity: canCraft ? 1 : 0.5 }}
                  onClick={() => handleCraft(recipe.id, recipe.materialTypes)}
                  disabled={!canCraft}
                >
                  {acting === `craft:${recipe.id}` ? 'Crafting...' : !heroId ? 'Hero Required' : !professionMatch ? 'Wrong Profession' : !rankMatch ? 'Rank Too Low' : canCraft ? 'Craft' : 'Missing Materials'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {items.length === 0 && materials.length === 0 && !loading && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
          <p>Your inventory is empty.</p>
          <button style={styles.questBtn} onClick={() => router.push(`/quest?heroId=${heroId}`)}>
            ⚔️ Go on a Quest
          </button>
        </div>
      )}
    </main>
  );
}

function ItemCard({ item, onEquip, onSalvage, acting, disabled, showEquip }: {
  item: EquipmentItem;
  onEquip: () => void;
  onSalvage: () => void;
  acting: boolean;
  disabled: boolean;
  showEquip: boolean;
}) {
  return (
    <div style={{
      ...itemStyles.card,
      background: RARITY_COLOR[item.rarity],
      borderColor: RARITY_BORDER[item.rarity],
    }}>
      <div style={itemStyles.rarityBadge}>{RARITY_LABEL[item.rarity]}</div>
      <div style={itemStyles.icon}>{item.eqType === 0 ? '⚔️' : '🛡'}</div>
      <h3 style={itemStyles.name}>{item.name}</h3>
      <div style={itemStyles.power}>+{item.power} ATK</div>
      <div style={itemStyles.affix}>{AFFIX_LABEL[item.affix]}</div>
      <div style={itemStyles.objId} title={item.id}>{item.id.slice(0,10)}...</div>
      {showEquip && (
        <div style={itemStyles.actionRow}>
          <button
            style={{ ...itemStyles.equipBtn, opacity: disabled ? 0.5 : 1 }}
            onClick={onEquip}
            disabled={disabled}
          >
            {acting ? 'Working...' : 'Equip'}
          </button>
          <button
            style={{ ...itemStyles.salvageBtn, opacity: disabled ? 0.5 : 1 }}
            onClick={onSalvage}
            disabled={disabled}
          >
            {acting ? 'Working...' : 'Salvage'}
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    fontFamily: "'Inter', sans-serif",
    color: '#fff',
    padding: '24px 20px',
  },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn:      { background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' },
  title:        { fontSize: 22, fontWeight: 800, margin: 0 },
  feedbackBanner: { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, color: '#86efac', fontSize: 14 },
  errorBanner:  { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, color: '#fca5a5', fontSize: 14 },
  judgeCard: { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' },
  judgeTitle: { fontSize: 14, fontWeight: 800, marginBottom: 4 },
  judgeText: { fontSize: 12, color: 'rgba(255,255,255,0.72)' },
  judgeBtn: { background: 'linear-gradient(135deg,#f59e0b,#b45309)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontWeight: 800, whiteSpace: 'nowrap' },
  heroSlots:    { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '16px 20px', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 700, margin: '0 0 14px' },
  slotsRow:     { display: 'flex', gap: 12 },
  slotCard:     { flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.1)' },
  slotIcon:     { fontSize: 28 },
  slotLabel:    { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  smallBtn:     { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' },
  section:      { marginBottom: 24 },
  itemGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  materialGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
  materialCard: { borderRadius: 14, padding: '14px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' },
  materialIcon: { fontSize: 28, marginBottom: 8 },
  materialName: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  materialMeta: { fontSize: 12, color: 'rgba(255,255,255,0.55)' },
  craftingIntro: { color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: '0 0 14px' },
  recipeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  recipeCard: { borderRadius: 14, padding: '16px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' },
  recipeHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  recipeIcon: { fontSize: 28 },
  recipeName: { fontSize: 15, fontWeight: 800 },
  recipeAffix: { fontSize: 12, color: '#bfdbfe', fontWeight: 700 },
  recipeText: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 10 },
  recipeRequirements: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  recipeChip: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '6px 10px' },
  recipeLock: { fontSize: 12, color: '#fcd34d', marginBottom: 12, fontWeight: 700 },
  craftBtn: { width: '100%', background: 'linear-gradient(135deg,#f59e0b,#b45309)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13 },
  empty:        { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  emptyState:   { textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.6)' },
  questBtn:     { marginTop: 16, background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 28px', cursor: 'pointer', fontWeight: 600 },
};

const itemStyles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid', borderRadius: 14,
    padding: '14px 12px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 6,
  },
  rarityBadge: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: 'rgba(255,255,255,0.7)' },
  icon:        { fontSize: 32 },
  name:        { margin: 0, fontSize: 13, fontWeight: 700, textAlign: 'center' },
  power:       { fontSize: 12, color: '#fbbf24', fontWeight: 600 },
  affix:       { fontSize: 11, color: '#bfdbfe', fontWeight: 700 },
  objId:       { fontSize: 10, color: 'rgba(255,255,255,0.3)', cursor: 'help' },
  actionRow:   { display: 'grid', width: '100%', gap: 8, marginTop: 4 },
  equipBtn:    { width: '100%', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  salvageBtn:  { width: '100%', background: 'rgba(248,113,113,0.16)', color: '#fecaca', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 8, padding: '8px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
};
