// equipment.move — OneRealm v2.0
// CONTRACTS.md: Equipment schema — primitive, no dependencies
// ADR-001: Sui Move syntax (UID, has key + store)

module onerealm::equipment {

    // === Constants (CONTRACTS.md Section 1) ===
    const TYPE_WEAPON: u8 = 0;
    const TYPE_ARMOR:  u8 = 1;
    const AFFIX_NONE:     u8 = 0;
    const AFFIX_RAIDER:   u8 = 1;
    const AFFIX_FORAGER:  u8 = 2;
    const AFFIX_SCHOLAR:  u8 = 3;

    // === Structs ===
    public struct Equipment has key, store {
        id:      one::object::UID,
        eq_type: u8,
        name:    vector<u8>,
        power:   u64,
        rarity:  u8,
        affix:   u8,
    }

    // === Constructor ===
    public(package) fun create(
        eq_type: u8,
        name:    vector<u8>,
        power:   u64,
        rarity:  u8,
        affix:   u8,
        ctx:     &mut one::tx_context::TxContext
    ): Equipment {
        Equipment {
            id: one::object::new(ctx),
            eq_type,
            name,
            power,
            rarity,
            affix,
        }
    }

    entry fun salvage_to_sender(eq: Equipment, ctx: &mut one::tx_context::TxContext) {
        let sender = one::tx_context::sender(ctx);
        let Equipment { id, eq_type, rarity, name: _, power: _, affix: _ } = eq;
        one::object::delete(id);

        let material_type = if (eq_type == TYPE_WEAPON) {
            onerealm::material::type_ore()
        } else {
            onerealm::material::type_scrap()
        };
        let material_name = if (eq_type == TYPE_WEAPON) {
            b"Iron Ore"
        } else {
            b"Armor Scrap"
        };
        let material_value = if (rarity == 0) {
            1
        } else if (rarity == 1) {
            2
        } else {
            4
        };
        let material = onerealm::material::create(material_type, material_name, rarity, material_value, ctx);
        one::transfer::public_transfer(material, sender);
    }

    // === Getters ===
    public fun power(eq: &Equipment): u64       { eq.power }
    public fun eq_type(eq: &Equipment): u8      { eq.eq_type }
    public fun rarity(eq: &Equipment): u8       { eq.rarity }
    public fun name(eq: &Equipment): vector<u8> { eq.name }
    public fun affix(eq: &Equipment): u8        { eq.affix }

    public fun type_weapon(): u8 { TYPE_WEAPON }
    public fun type_armor():  u8 { TYPE_ARMOR }
    public fun affix_none(): u8 { AFFIX_NONE }
    public fun affix_raider(): u8 { AFFIX_RAIDER }
    public fun affix_forager(): u8 { AFFIX_FORAGER }
    public fun affix_scholar(): u8 { AFFIX_SCHOLAR }
}
