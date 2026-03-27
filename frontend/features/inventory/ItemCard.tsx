import { Badge } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { AFFIX_LABEL, RARITY_BORDER, RARITY_COLOR, RARITY_LABEL, type EquipmentItem } from './model';

export function ItemCard({
  item,
  isEquipped,
  actingStatus,
  onEquip,
  onSalvageClick,
  onSalvageCancel,
  needsSalvageConfirm,
  disabled,
  showActions,
}: {
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
    <div
      className="card"
      style={{
        background: isEquipped ? 'rgba(59,130,246,0.1)' : RARITY_COLOR[item.rarity],
        borderColor: isEquipped ? 'var(--color-accent-primary)' : RARITY_BORDER[item.rarity],
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
        padding: '20px 16px',
      }}
    >
      {isEquipped && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            background: 'var(--color-accent-primary)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 1,
            textAlign: 'center',
            padding: '4px 0',
            zIndex: 1,
          }}
        >
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
        {item.id.slice(0, 10)}...
      </div>

      {showActions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {!isEquipped && (
            <Button variant="primary" onClick={onEquip} disabled={disabled || needsSalvageConfirm} style={{ padding: '8px', fontSize: 12 }}>
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
