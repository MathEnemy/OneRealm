import React from 'react';
import { Button } from '../../components/ui/Button';
import { Card, Badge } from '../../components/ui/Card';
import { Banner } from '../../components/ui/Feedback';
import { EmptyState } from '../../components/ui/DataDisplay';
import { Section } from '../../components/ui/Section';
import { ItemCard } from './ItemCard';
import { AFFIX_LABEL, MATERIAL_LABEL, PROFESSIONS, PROFESSION_LABEL, PROFESSION_RANK_LABEL, RECIPES, SLOT_ARMOR, SLOT_WEAPON, type EquipmentItem, type HeroProfile, type HeroSlotState, type MaterialItem, selectMaterialsForRecipe } from './model';

export function InventoryStatusBanners({
  feedback,
  error,
}: {
  feedback: string;
  error: string;
}) {
  return (
    <>
      {feedback && <div style={{ marginBottom: 16 }} data-testid="inventory-feedback"><Banner type="success">{feedback}</Banner></div>}
      {error && <div style={{ marginBottom: 16 }} data-testid="inventory-error"><Banner type="error">{error}</Banner></div>}
    </>
  );
}

export function JudgeBundlePanel({
  acting,
  onClaim,
}: {
  acting: string | null;
  onClaim: () => void;
}) {
  return (
    <Card style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Judge Mode Bundle</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Claim a starter pack of ore, scrap, and essence to demo crafting instantly.</div>
      </div>
      <Button variant="warning" onClick={onClaim} disabled={!!acting} style={{ whiteSpace: 'nowrap' }} data-testid="inventory-claim-bundle">
        {acting === 'judge-bundle' ? 'Claiming...' : 'Claim Bundle'}
      </Button>
    </Card>
  );
}

export function LoadoutSection({
  heroId,
  heroProfile,
  heroSlots,
  acting,
  onUnequip,
}: {
  heroId: string;
  heroProfile: HeroProfile;
  heroSlots: HeroSlotState;
  acting: string | null;
  onUnequip: (slot: string) => void;
}) {
  if (!heroId) return null;

  return (
    <Section title="Active Loadout">
      <Card style={{ padding: '24px', background: 'var(--color-surface)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
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

          <div style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap' }}>
            <LoadoutSlot
              title="Weapon Slot"
              icon="⚔️"
              item={heroSlots.weapon}
              bonusLabel="ATK"
              acting={acting}
              actingKey={SLOT_WEAPON}
              onUnequip={() => onUnequip(SLOT_WEAPON)}
            />
            <LoadoutSlot
              title="Armor Slot"
              icon="🛡"
              item={heroSlots.armor}
              bonusLabel="DEF"
              acting={acting}
              actingKey={SLOT_ARMOR}
              onUnequip={() => onUnequip(SLOT_ARMOR)}
            />
          </div>
        </div>
      </Card>
    </Section>
  );
}

function LoadoutSlot({
  title,
  icon,
  item,
  bonusLabel,
  acting,
  actingKey,
  onUnequip,
}: {
  title: string;
  icon: string;
  item: EquipmentItem | null;
  bonusLabel: string;
  acting: string | null;
  actingKey: string;
  onUnequip: () => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 160, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.2)', position: 'relative' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 1, marginBottom: 12, fontWeight: 700 }}>{title}</div>
      {item ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{item.name}</div>
          <div style={{ fontSize: 13, color: 'var(--color-accent-warning)', fontWeight: 700, margin: '6px 0' }}>+{item.power} {bonusLabel}</div>
          <div style={{ fontSize: 11, color: 'var(--color-accent-primary)', fontWeight: 600 }}>{AFFIX_LABEL[item.affix]} Affix</div>
          <div style={{ marginTop: 16 }}>
            <Button variant="ghost" onClick={onUnequip} disabled={!!acting || !item} style={{ padding: '6px 12px', fontSize: 12, width: '100%', borderColor: 'rgba(255,255,255,0.1)' }}>
              {acting === actingKey ? `Unequipping...` : `Unequip ${bonusLabel === 'ATK' ? 'Weapon' : 'Armor'}`}
            </Button>
          </div>
        </div>
      ) : <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 16 }}>Empty slot</div>}
      <div style={{ fontSize: 40, opacity: 0.05, position: 'absolute', right: 12, top: 12, pointerEvents: 'none' }}>{icon}</div>
    </div>
  );
}

export function ArsenalSection({
  heroId,
  items,
  filteredArsenal,
  heroSlots,
  acting,
  confirmSalvage,
  searchQuery,
  filterType,
  filterRarity,
  sortBy,
  onSearchQueryChange,
  onFilterTypeChange,
  onFilterRarityChange,
  onSortByChange,
  onDeployMission,
  onEquip,
  onSalvageClick,
  onSalvageCancel,
}: {
  heroId: string;
  items: EquipmentItem[];
  filteredArsenal: EquipmentItem[];
  heroSlots: HeroSlotState;
  acting: string | null;
  confirmSalvage: string | null;
  searchQuery: string;
  filterType: 'all' | 'weapon' | 'armor';
  filterRarity: 'all' | '0' | '1' | '2';
  sortBy: 'newest' | 'power' | 'rarity';
  onSearchQueryChange: (value: string) => void;
  onFilterTypeChange: (value: 'all' | 'weapon' | 'armor') => void;
  onFilterRarityChange: (value: 'all' | '0' | '1' | '2') => void;
  onSortByChange: (value: 'newest' | 'power' | 'rarity') => void;
  onDeployMission: () => void;
  onEquip: (itemId: string, slot: string) => void;
  onSalvageClick: (itemId: string) => void;
  onSalvageCancel: () => void;
}) {
  return (
    <Section title={`The Arsenal (${items.length})`}>
      {items.length === 0 ? (
        <Card style={{ background: 'rgba(0,0,0,0.15)' }}>
          <EmptyState
            icon="⚔️"
            message="Your armory is empty. Equipment drops from Harvest and Raid missions, so deploy your hero to start building a loadout."
            action={<Button variant="primary" onClick={onDeployMission} data-testid="inventory-deploy-mission">Deploy on Mission</Button>}
          />
        </Card>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 24, background: 'rgba(0,0,0,0.2)', padding: '16px 20px', borderRadius: 12 }}>
            <div style={{ minWidth: 0 }}>
              <label htmlFor="arsenal-search" className="sr-only">Search gear</label>
              <input id="arsenal-search" name="arsenal_search" className="input" placeholder="Search gear…" value={searchQuery} onChange={e => onSearchQueryChange(e.target.value)} style={{ padding: '10px 14px' }} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="arsenal-type" className="sr-only">Filter by type</label>
              <select id="arsenal-type" className="input" value={filterType} onChange={e => onFilterTypeChange(e.target.value as 'all' | 'weapon' | 'armor')} style={{ padding: '10px 14px' }}>
                <option value="all">All Types</option>
                <option value="weapon">Weapons Only</option>
                <option value="armor">Armor Only</option>
              </select>
            </div>
            <div>
              <label htmlFor="arsenal-rarity" className="sr-only">Filter by rarity</label>
              <select id="arsenal-rarity" className="input" value={filterRarity} onChange={e => onFilterRarityChange(e.target.value as 'all' | '0' | '1' | '2')} style={{ padding: '10px 14px' }}>
                <option value="all">All Rarities</option>
                <option value="0">Common</option>
                <option value="1">Rare</option>
                <option value="2">Legendary</option>
              </select>
            </div>
            <div>
              <label htmlFor="arsenal-sort" className="sr-only">Sort arsenal</label>
              <select id="arsenal-sort" className="input" value={sortBy} onChange={e => onSortByChange(e.target.value as 'newest' | 'power' | 'rarity')} style={{ padding: '10px 14px' }}>
                <option value="newest">Sort: Default (Newest)</option>
                <option value="power">Sort: Power (High to Low)</option>
                <option value="rarity">Sort: Rarity</option>
              </select>
            </div>
          </div>

          <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {filteredArsenal.map((item) => {
              const isEquipped = heroSlots.weapon?.id === item.id || heroSlots.armor?.id === item.id;
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  isEquipped={isEquipped}
                  actingStatus={acting === item.id ? 'Equipping...' : acting === `salvage:${item.id}` ? 'Salvaging...' : undefined}
                  onEquip={() => onEquip(item.id, item.eqType === 0 ? SLOT_WEAPON : SLOT_ARMOR)}
                  onSalvageClick={() => onSalvageClick(item.id)}
                  onSalvageCancel={onSalvageCancel}
                  needsSalvageConfirm={confirmSalvage === item.id}
                  disabled={!!acting}
                  showActions={!!heroId}
                />
              );
            })}
          </div>
          {filteredArsenal.length === 0 && <EmptyState icon="🧭" message="No equipment matches the current filters. Clear or adjust the search, type, rarity, or sorting controls." />}
        </>
      )}
    </Section>
  );
}

export function MaterialsSection({ materials }: { materials: MaterialItem[] }) {
  const ores = materials.filter(m => m.materialType === 0);
  const scraps = materials.filter(m => m.materialType === 1);
  const essences = materials.filter(m => m.materialType === 2);

  return (
    <Section title="Resource Cache">
      {materials.length === 0 ? (
        <EmptyState icon="🧱" message="No materials yet. Stockpile resources via Harvest missions or by salvaging common gear." />
      ) : (
        <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          <MaterialCountCard icon="⛏️" label="Ore" value={ores.length} />
          <MaterialCountCard icon="🧩" label="Scrap" value={scraps.length} />
          <MaterialCountCard icon="📘" label="Essence" value={essences.length} />
        </div>
      )}
    </Section>
  );
}

function MaterialCountCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'rgba(0,0,0,0.2)' }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 1 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      </div>
    </div>
  );
}

export function CraftingSection({
  materials,
  heroProfile,
  acting,
  heroId,
  onCraft,
}: {
  materials: MaterialItem[];
  heroProfile: HeroProfile;
  acting: string | null;
  heroId: string;
  onCraft: (recipeId: number, requirements: readonly number[]) => void;
}) {
  return (
    <Section title="The Blacksmith" subtitle="Convert excess materials and salvage into masterwork, archetype-specific gear.">
      <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {RECIPES.map((recipe) => {
          const selected = selectMaterialsForRecipe(materials, recipe.materialTypes);
          const professionMatch = recipe.profession === undefined || heroProfile.profession === recipe.profession;
          const rankMatch = recipe.rank === undefined || heroProfile.professionRank >= recipe.rank;
          const canCraft = !!selected && !acting && !!heroId && professionMatch && rankMatch;

          return (
            <Card key={recipe.id} data-testid={`inventory-recipe-${recipe.id}`} style={{ opacity: canCraft ? 1 : 0.6, transition: 'opacity 0.2s', border: canCraft ? '1px solid rgba(245,158,11,0.3)' : undefined }}>
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
                  <div style={{ fontSize: 12, color: professionMatch ? 'var(--text-secondary)' : '#fca5a5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }} data-testid={`inventory-recipe-${recipe.id}-profession`}>
                    <span>{professionMatch ? '✓' : '❌'}</span> Requires {PROFESSION_LABEL[recipe.profession]} Profession
                  </div>
                )}
                {recipe.rank !== undefined && (
                  <div style={{ fontSize: 12, color: rankMatch ? 'var(--text-secondary)' : '#fca5a5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }} data-testid={`inventory-recipe-${recipe.id}-rank`}>
                    <span>{rankMatch ? '✓' : '❌'}</span> Requires {recipe.rank === 1 ? 'Adept' : 'Master'} rank
                  </div>
                )}
                {!selected && professionMatch && rankMatch && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚠️</span> Insufficient Materials
                  </div>
                )}
              </div>

              <Button variant={canCraft ? 'warning' : 'ghost'} fullWidth onClick={() => onCraft(recipe.id, recipe.materialTypes)} disabled={!canCraft} data-testid={`inventory-recipe-${recipe.id}-craft`} style={{ padding: '12px', fontSize: 14 }}>
                {acting === `craft:${recipe.id}` ? 'Crafting...' : !heroId ? 'Hero Required' : !professionMatch ? 'Wrong Profession' : !rankMatch ? 'Rank Too Low' : !selected ? 'Missing Materials' : 'Craft'}
              </Button>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
