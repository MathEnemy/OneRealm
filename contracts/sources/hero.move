// hero.move — OneRealm v2.0
// ADR-001: Sui Move syntax, ADR-003: address, ADR-005: unequip before delete
// Move 2024: no duplicate use aliases

module onerealm::hero {
    use onerealm::equipment::Equipment;

    // === Constants ===
    const SLOT_WEAPON: vector<u8> = b"weapon";
    const SLOT_ARMOR:  vector<u8> = b"armor";
    const HERO_DEFAULT_LEVEL:      u64 = 1;
    const HERO_DEFAULT_BASE_POWER: u64 = 10;

    // === Error codes (CONTRACTS.md Section 5) ===
    const ESlotOccupied: u64 = 0;
    const ESlotEmpty:    u64 = 1;

    // === Struct ===
    public struct Hero has key, store {
        id:         sui::object::UID,
        name:       vector<u8>,
        level:      u64,
        base_power: u64,
        owner:      address,
    }

    // === Constructor ===
    public fun mint(name: vector<u8>, ctx: &mut sui::tx_context::TxContext): Hero {
        Hero {
            id:         sui::object::new(ctx),
            name,
            level:      HERO_DEFAULT_LEVEL,
            base_power: HERO_DEFAULT_BASE_POWER,
            owner:      sui::tx_context::sender(ctx),
        }
    }

    entry fun mint_to_sender(name: vector<u8>, ctx: &mut sui::tx_context::TxContext) {
        let hero = mint(name, ctx);
        sui::transfer::transfer(hero, sui::tx_context::sender(ctx));
    }

    // === Equipment (DOF) ===
    public fun equip(hero: &mut Hero, slot: vector<u8>, eq: Equipment) {
        assert!(!sui::dynamic_object_field::exists_(&hero.id, slot), ESlotOccupied);
        sui::dynamic_object_field::add(&mut hero.id, slot, eq);
    }

    public fun unequip(hero: &mut Hero, slot: vector<u8>): Equipment {
        assert!(sui::dynamic_object_field::exists_(&hero.id, slot), ESlotEmpty);
        sui::dynamic_object_field::remove(&mut hero.id, slot)
    }

    // === Stats ===
    public fun total_power(hero: &Hero): u64 {
        let mut power = hero.base_power;
        if (sui::dynamic_object_field::exists_(&hero.id, SLOT_WEAPON)) {
            let weapon = sui::dynamic_object_field::borrow<vector<u8>, Equipment>(&hero.id, SLOT_WEAPON);
            power = power + onerealm::equipment::power(weapon);
        };
        if (sui::dynamic_object_field::exists_(&hero.id, SLOT_ARMOR)) {
            let armor = sui::dynamic_object_field::borrow<vector<u8>, Equipment>(&hero.id, SLOT_ARMOR);
            power = power + onerealm::equipment::power(armor);
        };
        power
    }

    // === Lifecycle ===
    /// CRITICAL (ADR-005): unequip all DOF BEFORE object::delete
    #[allow(lint(self_transfer))]
    public fun burn(mut hero: Hero, ctx: &mut sui::tx_context::TxContext) {
        let sender = sui::tx_context::sender(ctx);
        if (sui::dynamic_object_field::exists_(&hero.id, SLOT_WEAPON)) {
            let w = sui::dynamic_object_field::remove<vector<u8>, Equipment>(&mut hero.id, SLOT_WEAPON);
            sui::transfer::public_transfer(w, sender);
        };
        if (sui::dynamic_object_field::exists_(&hero.id, SLOT_ARMOR)) {
            let a = sui::dynamic_object_field::remove<vector<u8>, Equipment>(&mut hero.id, SLOT_ARMOR);
            sui::transfer::public_transfer(a, sender);
        };
        let Hero { id, .. } = hero;
        sui::object::delete(id);
    }

    // === Getters ===
    public fun owner(hero: &Hero): address       { hero.owner }
    public fun level(hero: &Hero): u64           { hero.level }
    public fun base_power(hero: &Hero): u64      { hero.base_power }
    public fun name(hero: &Hero): vector<u8>     { hero.name }
    public fun id(hero: &Hero): &sui::object::UID { &hero.id }
    public fun slot_weapon(): vector<u8>         { SLOT_WEAPON }
    public fun slot_armor(): vector<u8>          { SLOT_ARMOR }
}
