import { getObject } from '../../lib/e2e';
import { getSuiClient } from '../../lib/sui-runtime';

export const SLOT_WEAPON = 'weapon';
export const SLOT_ARMOR = 'armor';

export const RARITY_LABEL: Record<number, string> = { 0: 'Common', 1: 'Rare', 2: 'Legendary' };
export const RARITY_COLOR: Record<number, string> = {
  0: 'rgba(156,163,175,0.2)',
  1: 'rgba(59,130,246,0.2)',
  2: 'rgba(234,179,8,0.2)',
};
export const RARITY_BORDER: Record<number, string> = {
  0: 'rgba(156,163,175,0.4)',
  1: 'rgba(59,130,246,0.5)',
  2: 'rgba(234,179,8,0.6)',
};
export const AFFIX_LABEL: Record<number, string> = {
  0: 'Unaligned',
  1: 'Raider',
  2: 'Forager',
  3: 'Scholar',
};
export const MATERIAL_LABEL: Record<number, string> = {
  0: 'Ore',
  1: 'Scrap',
  2: 'Essence',
};
export const PROFESSION_LABEL: Record<number, string> = {
  0: 'Mining',
  1: 'Foraging',
  2: 'Smithing',
  3: 'Relic Hunting',
};

export const PROFESSIONS = [
  { id: 0 as const, name: 'Mining', icon: '⛏️', perk: 'Bonus ore on Harvest wins' },
  { id: 1 as const, name: 'Foraging', icon: '🌾', perk: 'Bonus scrap on Harvest wins' },
  { id: 2 as const, name: 'Smithing', icon: '🛠️', perk: 'Bonus essence on Training wins' },
  { id: 3 as const, name: 'Relic Hunting', icon: '🗝️', perk: 'Bonus essence on Raid wins' },
];

export const PROFESSION_RANK_LABEL: Record<number, string> = {
  0: 'Novice',
  1: 'Adept',
  2: 'Master',
};

export interface RecipeDefinition {
  id: number;
  name: string;
  description: string;
  affix: string;
  icon: string;
  materialTypes: readonly number[];
  profession?: number;
  rank?: number;
}

export const RECIPES: readonly RecipeDefinition[] = [
  { id: 2, name: 'Scholar Focus', description: '2 Essence + 1 Scrap', affix: 'Scholar', icon: '📘', materialTypes: [2, 2, 1] },
  { id: 0, name: 'Raider Blade', description: '2 Ore + 1 Essence', affix: 'Raider', icon: '⚔️', materialTypes: [0, 0, 2] },
  { id: 1, name: 'Forager Mail', description: '2 Scrap + 1 Ore', affix: 'Forager', icon: '🛡', materialTypes: [1, 1, 0] },
  { id: 3, name: "Miner's Pickblade", description: '2 Ore + 1 Scrap', affix: 'Raider', icon: '⛏️', materialTypes: [0, 0, 1], profession: 0, rank: 1 },
  { id: 4, name: "Forager's Mantle", description: '2 Scrap + 1 Essence', affix: 'Forager', icon: '🌾', materialTypes: [1, 1, 2], profession: 1, rank: 1 },
  { id: 5, name: "Smith's Sigil", description: '1 Ore + 1 Scrap + 1 Essence', affix: 'Scholar', icon: '🛠️', materialTypes: [0, 1, 2], profession: 2, rank: 1 },
  { id: 6, name: 'Relic Pike', description: '2 Essence + 1 Ore', affix: 'Raider', icon: '🗝️', materialTypes: [2, 2, 0], profession: 3, rank: 1 },
  { id: 7, name: "Miner's Crownbreaker", description: '2 Ore + 1 Essence', affix: 'Raider', icon: '👑', materialTypes: [0, 0, 2], profession: 0, rank: 2 },
  { id: 8, name: "Forager's Bulwark", description: '2 Scrap + 1 Ore', affix: 'Forager', icon: '🪵', materialTypes: [1, 1, 0], profession: 1, rank: 2 },
  { id: 9, name: 'Masterwork Matrix', description: '1 Ore + 1 Scrap + 1 Essence', affix: 'Scholar', icon: '⚙️', materialTypes: [0, 1, 2], profession: 2, rank: 2 },
  { id: 10, name: 'Ancient Halberd', description: '2 Essence + 1 Scrap', affix: 'Raider', icon: '🏺', materialTypes: [2, 2, 1], profession: 3, rank: 2 },
] as const;

export interface EquipmentItem {
  id: string;
  name: string;
  power: number;
  rarity: number;
  eqType: number;
  affix: number;
}

export interface MaterialItem {
  id: string;
  name: string;
  rarity: number;
  value: number;
  materialType: number;
}

export interface HeroSlotState {
  weapon: EquipmentItem | null;
  armor: EquipmentItem | null;
}

export interface HeroProfile {
  profession: number | null;
  professionXp: number;
  professionRank: number;
}

export function decodeBytes(value: any): string {
  if (typeof value === 'string') {
    return Buffer.from(value, 'base64').toString();
  }
  if (Array.isArray(value)) {
    return Buffer.from(value).toString();
  }
  return 'Unknown Item';
}

export function dynamicFieldName(field: any): string {
  const value = field?.name?.value;
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return Buffer.from(value).toString();
  }
  return '';
}

export function selectMaterialsForRecipe(materials: MaterialItem[], requirements: readonly number[]) {
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

export async function loadEquipmentObject(id: string): Promise<EquipmentItem | null> {
  const suiClient = await getSuiClient();
  const object = await getObject(suiClient, {
    id,
    options: { showContent: true },
  });
  const fields = object.data?.content && 'fields' in object.data.content
    ? (object.data.content as any).fields
    : null;

  if (!fields) {
    return null;
  }

  return {
    id,
    name: decodeBytes(fields.name),
    power: Number(fields.power ?? 0),
    rarity: Number(fields.rarity ?? 0),
    eqType: Number(fields.eq_type ?? 0),
    affix: Number(fields.affix ?? 0),
  };
}
