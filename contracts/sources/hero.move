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
    const ARCHETYPE_WARRIOR: u8 = 0;
    const ARCHETYPE_RANGER: u8 = 1;
    const ARCHETYPE_ARCANIST: u8 = 2;
    const PROFESSION_MINING: u8 = 0;
    const PROFESSION_FORAGING: u8 = 1;
    const PROFESSION_SMITHING: u8 = 2;
    const PROFESSION_RELIC_HUNTING: u8 = 3;
    const PROFESSION_RANK_NOVICE: u8 = 0;
    const PROFESSION_RANK_ADEPT: u8 = 1;
    const PROFESSION_RANK_MASTER: u8 = 2;

    // === Error codes (CONTRACTS.md Section 5) ===
    const ESlotOccupied: u64 = 0;
    const ESlotEmpty:    u64 = 1;
    const EInvalidSlot:  u64 = 2;
    const ETypeMismatch: u64 = 3;
    const EInvalidArchetype: u64 = 4;
    const EInvalidProfession: u64 = 5;
    const ENameTooLong: u64 = 6;

    // === Struct ===
    public struct Hero has key, store {
        id:         one::object::UID,
        name:       vector<u8>,
        level:      u64,
        base_power: u64,
        archetype:  u8,
        profession: u8,
        profession_xp: u64,
        owner:      address,
    }

    // === Constructor ===
    public fun mint(name: vector<u8>, archetype: u8, profession: u8, ctx: &mut one::tx_context::TxContext): Hero {
        assert!(name.length() <= 32, ENameTooLong);
        assert!(
            archetype == ARCHETYPE_WARRIOR || archetype == ARCHETYPE_RANGER || archetype == ARCHETYPE_ARCANIST,
            EInvalidArchetype
        );
        assert!(
            profession == PROFESSION_MINING ||
            profession == PROFESSION_FORAGING ||
            profession == PROFESSION_SMITHING ||
            profession == PROFESSION_RELIC_HUNTING,
            EInvalidProfession
        );
        Hero {
            id:         one::object::new(ctx),
            name,
            level:      HERO_DEFAULT_LEVEL,
            base_power: HERO_DEFAULT_BASE_POWER,
            archetype,
            profession,
            profession_xp: 0,
            owner:      one::tx_context::sender(ctx),
        }
    }

    entry fun mint_to_sender(name: vector<u8>, archetype: u8, profession: u8, ctx: &mut one::tx_context::TxContext) {
        let hero = mint(name, archetype, profession, ctx);
        one::transfer::transfer(hero, one::tx_context::sender(ctx));
    }

    // === Equipment (DOF) ===
    public fun equip(hero: &mut Hero, slot: vector<u8>, eq: Equipment) {
        assert_valid_slot(&slot);
        assert_slot_matches_type(&slot, &eq);
        assert!(!one::dynamic_object_field::exists_(&hero.id, slot), ESlotOccupied);
        one::dynamic_object_field::add(&mut hero.id, slot, eq);
    }

    public fun unequip(hero: &mut Hero, slot: vector<u8>): Equipment {
        assert_valid_slot(&slot);
        assert!(one::dynamic_object_field::exists_(&hero.id, slot), ESlotEmpty);
        one::dynamic_object_field::remove(&mut hero.id, slot)
    }

    entry fun unequip_to_sender(
        hero: &mut Hero,
        slot: vector<u8>,
        ctx: &one::tx_context::TxContext
    ) {
        let sender = one::tx_context::sender(ctx);
        let eq = unequip(hero, slot);
        one::transfer::public_transfer(eq, sender);
    }

    // === Stats ===
    public fun total_power(hero: &Hero): u64 {
        let mut power = hero.base_power;
        if (one::dynamic_object_field::exists_(&hero.id, SLOT_WEAPON)) {
            let weapon = one::dynamic_object_field::borrow<vector<u8>, Equipment>(&hero.id, SLOT_WEAPON);
            power = power + onerealm::equipment::power(weapon);
        };
        if (one::dynamic_object_field::exists_(&hero.id, SLOT_ARMOR)) {
            let armor = one::dynamic_object_field::borrow<vector<u8>, Equipment>(&hero.id, SLOT_ARMOR);
            power = power + onerealm::equipment::power(armor);
        };
        power
    }

    public fun mission_bonus(hero: &Hero, mission_type: u8): u64 {
        let mut bonus = archetype_bonus_for_mission(hero.archetype, mission_type);
        if (one::dynamic_object_field::exists_(&hero.id, SLOT_WEAPON)) {
            let weapon = one::dynamic_object_field::borrow<vector<u8>, Equipment>(&hero.id, SLOT_WEAPON);
            bonus = bonus + affix_bonus_for_mission(onerealm::equipment::affix(weapon), mission_type);
        };
        if (one::dynamic_object_field::exists_(&hero.id, SLOT_ARMOR)) {
            let armor = one::dynamic_object_field::borrow<vector<u8>, Equipment>(&hero.id, SLOT_ARMOR);
            bonus = bonus + affix_bonus_for_mission(onerealm::equipment::affix(armor), mission_type);
        };
        bonus
    }

    public(package) fun grant_profession_xp(hero: &mut Hero, amount: u64) {
        hero.profession_xp = hero.profession_xp + amount;
    }

    // === Lifecycle ===
    /// CRITICAL (ADR-005): unequip all DOF BEFORE object::delete
    #[allow(lint(self_transfer))]
    public fun burn(mut hero: Hero, ctx: &mut one::tx_context::TxContext) {
        let sender = one::tx_context::sender(ctx);
        if (one::dynamic_object_field::exists_(&hero.id, SLOT_WEAPON)) {
            let w = one::dynamic_object_field::remove<vector<u8>, Equipment>(&mut hero.id, SLOT_WEAPON);
            one::transfer::public_transfer(w, sender);
        };
        if (one::dynamic_object_field::exists_(&hero.id, SLOT_ARMOR)) {
            let a = one::dynamic_object_field::remove<vector<u8>, Equipment>(&mut hero.id, SLOT_ARMOR);
            one::transfer::public_transfer(a, sender);
        };
        let Hero { id, .. } = hero;
        one::object::delete(id);
    }

    // === Getters ===
    public fun owner(hero: &Hero): address       { hero.owner }
    public fun level(hero: &Hero): u64           { hero.level }
    public fun base_power(hero: &Hero): u64      { hero.base_power }
    public fun archetype(hero: &Hero): u8        { hero.archetype }
    public fun profession(hero: &Hero): u8       { hero.profession }
    public fun profession_xp(hero: &Hero): u64   { hero.profession_xp }
    public fun profession_rank(hero: &Hero): u8 {
        rank_for_xp(hero.profession_xp)
    }
    public fun name(hero: &Hero): vector<u8>     { hero.name }
    public fun id(hero: &Hero): &one::object::UID { &hero.id }
    public fun slot_weapon(): vector<u8>         { SLOT_WEAPON }
    public fun slot_armor(): vector<u8>          { SLOT_ARMOR }
    public fun archetype_warrior(): u8           { ARCHETYPE_WARRIOR }
    public fun archetype_ranger(): u8            { ARCHETYPE_RANGER }
    public fun archetype_arcanist(): u8          { ARCHETYPE_ARCANIST }
    public fun profession_mining(): u8           { PROFESSION_MINING }
    public fun profession_foraging(): u8         { PROFESSION_FORAGING }
    public fun profession_smithing(): u8         { PROFESSION_SMITHING }
    public fun profession_relic_hunting(): u8    { PROFESSION_RELIC_HUNTING }
    public fun profession_rank_novice(): u8      { PROFESSION_RANK_NOVICE }
    public fun profession_rank_adept(): u8       { PROFESSION_RANK_ADEPT }
    public fun profession_rank_master(): u8      { PROFESSION_RANK_MASTER }

    public fun has_profession_bonus(hero: &Hero, mission_type: u8): bool {
        (hero.profession == PROFESSION_MINING && mission_type == 1) ||
        (hero.profession == PROFESSION_FORAGING && mission_type == 1) ||
        (hero.profession == PROFESSION_SMITHING && mission_type == 2) ||
        (hero.profession == PROFESSION_RELIC_HUNTING && mission_type == 0)
    }

    public fun profession_bonus_material_type(hero: &Hero, mission_type: u8): u8 {
        if (hero.profession == PROFESSION_MINING && mission_type == 1) {
            onerealm::material::type_ore()
        } else if (hero.profession == PROFESSION_FORAGING && mission_type == 1) {
            onerealm::material::type_scrap()
        } else {
            onerealm::material::type_essence()
        }
    }

    public fun profession_bonus_material_name(hero: &Hero, mission_type: u8): vector<u8> {
        if (hero.profession == PROFESSION_MINING && mission_type == 1) {
            b"Miner's Cache"
        } else if (hero.profession == PROFESSION_FORAGING && mission_type == 1) {
            b"Forager Bundle"
        } else if (hero.profession == PROFESSION_SMITHING && mission_type == 2) {
            b"Forge Notes"
        } else {
            b"Relic Dust"
        }
    }

    public fun profession_bonus_material_value(hero: &Hero, mission_type: u8): u64 {
        if (hero.profession == PROFESSION_RELIC_HUNTING && mission_type == 0) {
            3
        } else {
            2
        }
    }

    fun assert_valid_slot(slot: &vector<u8>) {
        assert!(*slot == SLOT_WEAPON || *slot == SLOT_ARMOR, EInvalidSlot);
    }

    fun assert_slot_matches_type(slot: &vector<u8>, eq: &Equipment) {
        let eq_type = onerealm::equipment::eq_type(eq);
        if (*slot == SLOT_WEAPON) {
            assert!(eq_type == onerealm::equipment::type_weapon(), ETypeMismatch);
        } else {
            assert!(eq_type == onerealm::equipment::type_armor(), ETypeMismatch);
        };
    }

    fun affix_bonus_for_mission(affix: u8, mission_type: u8): u64 {
        if (affix == onerealm::equipment::affix_raider() && mission_type == 0) {
            4
        } else if (affix == onerealm::equipment::affix_forager() && mission_type == 1) {
            4
        } else if (affix == onerealm::equipment::affix_scholar() && mission_type == 2) {
            4
        } else {
            0
        }
    }

    fun archetype_bonus_for_mission(archetype: u8, mission_type: u8): u64 {
        if (archetype == ARCHETYPE_WARRIOR && mission_type == 0) {
            3
        } else if (archetype == ARCHETYPE_RANGER && mission_type == 1) {
            3
        } else if (archetype == ARCHETYPE_ARCANIST && mission_type == 2) {
            3
        } else {
            0
        }
    }

    fun rank_for_xp(xp: u64): u8 {
        if (xp >= 7) {
            PROFESSION_RANK_MASTER
        } else if (xp >= 3) {
            PROFESSION_RANK_ADEPT
        } else {
            PROFESSION_RANK_NOVICE
        }
    }
}
