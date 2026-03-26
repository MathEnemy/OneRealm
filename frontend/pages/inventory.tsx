'use client';
// pages/inventory.tsx — Inventory Screen [2.4]
// BLUEPRINT.md: Equipment grid + equip/unequip gaslessly
// Show all Equipment objects player owns + current Hero slots

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getStoredSession } from '../auth/zklogin';
import { executeGasless, GaslessError } from '../transactions/gasless';

const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'devnet';
const PACKAGE_ID  = process.env.NEXT_PUBLIC_ONEREALM_PACKAGE_ID!;

const suiClient = new SuiClient({ url: `https://fullnode.${SUI_NETWORK}.sui.io` });

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

interface EquipmentItem {
  id: string;
  name: string;
  power: number;
  rarity: number;
  eqType: number; // 0=weapon, 1=armor
}

export default function InventoryPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const heroId       = searchParams.get('heroId') ?? '';

  const [address, setAddress]     = useState<string | null>(null);
  const [items, setItems]         = useState<EquipmentItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState<string | null>(null); // ObjectId being acted on
  const [error, setError]         = useState('');
  const [feedback, setFeedback]   = useState('');

  useEffect(() => {
    const session = getStoredSession();
    if (!session.address) { router.push('/'); return; }
    setAddress(session.address);
    loadInventory(session.address);
  }, []);

  async function loadInventory(addr: string) {
    setLoading(true);
    setError('');
    try {
      const { data } = await suiClient.getOwnedObjects({
        owner: addr,
        filter: { StructType: `${PACKAGE_ID}::equipment::Equipment` },
        options: { showContent: true },
      });

      const equipList: EquipmentItem[] = data.map((obj: any) => {
        const f = obj.data?.content?.fields ?? {};
        return {
          id:     obj.data?.objectId ?? '',
          name:   f.name ? Buffer.from(f.name, 'base64').toString() : 'Unknown Item',
          power:  Number(f.power ?? 0),
          rarity: Number(f.rarity ?? 0),
          eqType: Number(f.eq_type ?? 0),
        };
      });

      setItems(equipList);
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
      const txBytes = Buffer.from(await tx.build({ client: suiClient })).toString('base64');
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
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::hero::unequip`,
        arguments: [
          tx.object(heroId),
          tx.pure.vector('u8', Array.from(Buffer.from(slot))),
        ],
      });
      tx.setSender(address);
      const txBytes = Buffer.from(await tx.build({ client: suiClient })).toString('base64');
      await executeGasless(txBytes, address);
      setFeedback(`✅ Unequipped successfully!`);
      await loadInventory(address);
    } catch (e: any) {
      setError('Unequip failed: ' + e.message);
    }
    setActing(null);
  }

  const weapons = items.filter(i => i.eqType === 0);
  const armors  = items.filter(i => i.eqType === 1);

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

      {heroId && (
        <div style={styles.heroSlots}>
          <h2 style={styles.sectionTitle}>Hero Equipment Slots</h2>
          <div style={styles.slotsRow}>
            <div style={styles.slotCard}>
              <div style={styles.slotIcon}>⚔️</div>
              <div style={styles.slotLabel}>Weapon Slot</div>
              <button
                style={styles.smallBtn}
                onClick={() => handleUnequip(SLOT_WEAPON)}
                disabled={!!acting}
              >
                {acting === SLOT_WEAPON ? 'Unequipping...' : 'Unequip'}
              </button>
            </div>
            <div style={styles.slotCard}>
              <div style={styles.slotIcon}>🛡</div>
              <div style={styles.slotLabel}>Armor Slot</div>
              <button
                style={styles.smallBtn}
                onClick={() => handleUnequip(SLOT_ARMOR)}
                disabled={!!acting}
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
          : <div style={styles.itemGrid}>{weapons.map(item => <ItemCard key={item.id} item={item} onEquip={() => handleEquip(item.id, SLOT_WEAPON)} acting={acting === item.id} disabled={!!acting} showEquip={!!heroId} />)}</div>
        }
      </section>

      {/* Armor section */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>🛡 Armor ({armors.length})</h2>
        {armors.length === 0
          ? <p style={styles.empty}>No armor yet — complete quests to earn loot!</p>
          : <div style={styles.itemGrid}>{armors.map(item => <ItemCard key={item.id} item={item} onEquip={() => handleEquip(item.id, SLOT_ARMOR)} acting={acting === item.id} disabled={!!acting} showEquip={!!heroId} />)}</div>
        }
      </section>

      {items.length === 0 && !loading && (
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

function ItemCard({ item, onEquip, acting, disabled, showEquip }: {
  item: EquipmentItem;
  onEquip: () => void;
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
      <div style={itemStyles.objId} title={item.id}>{item.id.slice(0,10)}...</div>
      {showEquip && (
        <button
          style={{ ...itemStyles.equipBtn, opacity: disabled ? 0.5 : 1 }}
          onClick={onEquip}
          disabled={disabled}
        >
          {acting ? 'Equipping...' : 'Equip'}
        </button>
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
  heroSlots:    { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '16px 20px', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 700, margin: '0 0 14px' },
  slotsRow:     { display: 'flex', gap: 12 },
  slotCard:     { flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.1)' },
  slotIcon:     { fontSize: 28 },
  slotLabel:    { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  smallBtn:     { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' },
  section:      { marginBottom: 24 },
  itemGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
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
  objId:       { fontSize: 10, color: 'rgba(255,255,255,0.3)', cursor: 'help' },
  equipBtn:    { marginTop: 4, width: '100%', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
};
