// equipment.move — OneRealm v2.0
// CONTRACTS.md: Equipment schema — primitive, no dependencies
// ADR-001: Sui Move syntax (UID, has key + store)

module onerealm::equipment {

    // === Constants (CONTRACTS.md Section 1) ===
    const TYPE_WEAPON: u8 = 0;
    const TYPE_ARMOR:  u8 = 1;

    // === Structs ===
    public struct Equipment has key, store {
        id:      sui::object::UID,
        eq_type: u8,
        name:    vector<u8>,
        power:   u64,
        rarity:  u8,
    }

    // === Constructor ===
    public fun create(
        eq_type: u8,
        name:    vector<u8>,
        power:   u64,
        rarity:  u8,
        ctx:     &mut sui::tx_context::TxContext
    ): Equipment {
        Equipment {
            id: sui::object::new(ctx),
            eq_type,
            name,
            power,
            rarity,
        }
    }

    // === Getters ===
    public fun power(eq: &Equipment): u64       { eq.power }
    public fun eq_type(eq: &Equipment): u8      { eq.eq_type }
    public fun rarity(eq: &Equipment): u8       { eq.rarity }
    public fun name(eq: &Equipment): vector<u8> { eq.name }

    public fun type_weapon(): u8 { TYPE_WEAPON }
    public fun type_armor():  u8 { TYPE_ARMOR }
}
