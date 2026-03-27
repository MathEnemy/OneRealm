// mission.move — OneRealm v2.0
// ADR-004: MissionSession owned by Game Server, ADR-010: deterministic battle
// Move 2024: no one::vector import — use vector<T> natively

module onerealm::mission {
    use onerealm::hero::Hero;

    // === Constants ===
    const MISSION_RAID:     u8  = 0;
    const MISSION_HARVEST:  u8  = 1;
    const MISSION_TRAINING: u8  = 2;
    const CONTRACT_STANDARD:u8  = 0;
    const CONTRACT_BOUNTY: u8  = 1;
    const CONTRACT_EXPEDITION: u8 = 2;
    const STANCE_BALANCED:  u8  = 0;
    const STANCE_AGGRESSIVE:u8  = 1;
    const STANCE_GUARDED:   u8  = 2;
    const BOSS_RAID_POWER:     u64 = 35;
    const BOSS_HARVEST_POWER:  u64 = 18;
    const BOSS_TRAINING_POWER: u64 = 8;

    const STATUS_PENDING:   u8 = 0;
    const STATUS_LOOT_DONE: u8 = 1;
    const STATUS_COMPLETE:  u8 = 2;
    const STATUS_FAILED:    u8 = 3;

    const LOOT_POWER_COMMON:    u64 = 10;
    const LOOT_POWER_RARE:      u64 = 22;
    const LOOT_POWER_LEGENDARY: u64 = 40;

    // === Error codes ===
    const EInvalidStatus:      u64 = 0;
    const ESettleBeforeLoot:   u64 = 1;
    const EInvalidMissionType: u64 = 2;
    const ELootAlreadyDone:    u64 = 3;
    const EHeroMismatch:       u64 = 4;
    const EPlayerMismatch:     u64 = 5;
    const EInvalidStance:      u64 = 6;
    const EInvalidContract:    u64 = 7;
    const EExpeditionNotReady: u64 = 8;

    public struct GameAuthority has key, store {
        id: one::object::UID,
    }

    /// Owned object of Game Server — NEVER share_object (ADR-004)
    /// `store` needed for test_only public_transfer calls
    public struct MissionSession has key, store {
        id:           one::object::UID,
        player:       address,
        hero_id:      one::object::ID,
        mission_type: u8,
        contract_type:u8,
        ready_at_ms:  u64,
        stance:       u8,
        status:       u8,
        loot_tiers:   vector<u8>,
        loot_types:   vector<u8>,
        loot_affixes: vector<u8>,
    }

    fun init(ctx: &mut one::tx_context::TxContext) {
        let authority = GameAuthority {
            id: one::object::new(ctx),
        };
        one::transfer::transfer(authority, one::tx_context::sender(ctx));
    }

    public fun create_session(
        _authority:   &GameAuthority,
        player:       address,
        hero_id:      one::object::ID,
        mission_type: u8,
        contract_type:u8,
        clock:        &one::clock::Clock,
        stance:       u8,
        ctx:          &mut one::tx_context::TxContext
    ): MissionSession {
        assert!(
            mission_type == MISSION_RAID || mission_type == MISSION_HARVEST || mission_type == MISSION_TRAINING,
            EInvalidMissionType
        );
        assert!(
            stance == STANCE_BALANCED || stance == STANCE_AGGRESSIVE || stance == STANCE_GUARDED,
            EInvalidStance
        );
        assert!(
            contract_type == CONTRACT_STANDARD || contract_type == CONTRACT_BOUNTY || contract_type == CONTRACT_EXPEDITION,
            EInvalidContract
        );
        let ready_at_ms = if (contract_type == CONTRACT_EXPEDITION) {
            one::clock::timestamp_ms(clock) + get_duration_for_expedition(mission_type)
        } else {
            0
        };

        MissionSession {
            id:           one::object::new(ctx),
            player,
            hero_id,
            mission_type,
            contract_type,
            ready_at_ms,
            stance,
            status:       STATUS_PENDING,
            loot_tiers:   vector[],
            loot_types:   vector[],
            loot_affixes: vector[],
        }
    }

    public fun create_judge_session(
        _authority:   &GameAuthority,
        player:       address,
        hero_id:      one::object::ID,
        mission_type: u8,
        contract_type:u8,
        stance:       u8,
        ready_in_ms:  u64,
        ctx:          &mut one::tx_context::TxContext
    ): MissionSession {
        assert!(
            mission_type == MISSION_RAID || mission_type == MISSION_HARVEST || mission_type == MISSION_TRAINING,
            EInvalidMissionType
        );
        assert!(
            stance == STANCE_BALANCED || stance == STANCE_AGGRESSIVE || stance == STANCE_GUARDED,
            EInvalidStance
        );
        assert!(
            contract_type == CONTRACT_STANDARD || contract_type == CONTRACT_BOUNTY || contract_type == CONTRACT_EXPEDITION,
            EInvalidContract
        );

        MissionSession {
            id:           one::object::new(ctx),
            player,
            hero_id,
            mission_type,
            contract_type,
            ready_at_ms:  if (contract_type == CONTRACT_EXPEDITION) ready_in_ms else 0,
            stance,
            status:       STATUS_PENDING,
            loot_tiers:   vector[],
            loot_types:   vector[],
            loot_affixes: vector[],
        }
    }

    public(package) fun add_loot(
        session:   &mut MissionSession,
        tier:      u8,
        loot_type: u8,
        affix:     u8
    ) {
        assert!(
            session.status == STATUS_PENDING || session.status == STATUS_LOOT_DONE,
            EInvalidStatus
        );
        session.loot_tiers.push_back(tier);
        session.loot_types.push_back(loot_type);
        session.loot_affixes.push_back(affix);
        session.status = STATUS_LOOT_DONE;
    }

    entry fun generate_loot(
        _authority: &GameAuthority,
        r:          &one::random::Random,
        mut session: MissionSession,
        ctx:        &mut one::tx_context::TxContext
    ) {
        assert!(session.status == STATUS_PENDING, ELootAlreadyDone);

        let mut gen = one::random::new_generator(r, ctx);
        let loot_count = get_loot_count_for_mission(session.mission_type, session.contract_type, &mut gen);

        let mut i: u8 = 0;
        while (i < loot_count) {
            let roll = one::random::generate_u8_in_range(&mut gen, 0, 99);
            let tier = get_tier_for_roll(session.mission_type, roll);

            let loot_type = one::random::generate_u8_in_range(&mut gen, 0, 1);
            let affix = get_affix_for_reward(tier, &mut gen);
            add_loot(&mut session, tier, loot_type, affix);
            i = i + 1;
        };

        let player = session.player;
        one::transfer::public_transfer(session, player);
    }

    public(package) fun settle(
        session:    &mut MissionSession,
        hero_power: u64,
        clock:      &one::clock::Clock,
        _ctx:       &mut one::tx_context::TxContext
    ): bool {
        assert!(session.status == STATUS_LOOT_DONE, ESettleBeforeLoot);
        if (session.contract_type == CONTRACT_EXPEDITION) {
            assert!(one::clock::timestamp_ms(clock) >= session.ready_at_ms, EExpeditionNotReady);
        };

        let boss_power = get_boss_power(session.mission_type, session.contract_type);
        let stance_bonus = get_stance_bonus(session.mission_type, session.stance);
        let win = (hero_power + stance_bonus) > boss_power;

        if (!win) {
            session.status = STATUS_FAILED;
            return false
        };

        session.status = STATUS_COMPLETE;
        true
    }

    public(package) fun distribute(
        session:     &MissionSession,
        player:      address,
        ctx:         &mut one::tx_context::TxContext
    ) {
        let len = session.loot_tiers.length();
        let mut i = 0;
        while (i < len) {
            let tier = session.loot_tiers[i];
            let loot_type = session.loot_types[i];
            let affix = session.loot_affixes[i];

            if (should_drop_equipment(session.mission_type, tier)) {
                let power = get_power_for_tier(tier);
                let name = get_name_for_type(loot_type, tier);
                let eq = onerealm::equipment::create(loot_type, name, power, tier, affix, ctx);
                one::transfer::public_transfer(eq, player);
            } else {
                let material_type = get_material_type_for_reward(session.mission_type, loot_type);
                let material_name = get_material_name_for_reward(session.mission_type, loot_type);
                let material_value = get_material_value_for_tier(session.mission_type, session.contract_type, tier);
                let material = onerealm::material::create(material_type, material_name, tier, material_value, ctx);
                one::transfer::public_transfer(material, player);
            };

            i = i + 1;
        };
    }

    public fun settle_and_distribute(
        session:    &mut MissionSession,
        hero:       &mut Hero,
        clock:      &one::clock::Clock,
        ctx:        &mut one::tx_context::TxContext
    ) {
        let sender = one::tx_context::sender(ctx);
        assert!(sender == session.player, EPlayerMismatch);
        assert!(one::object::id(hero) == session.hero_id, EHeroMismatch);

        let hero_power = onerealm::hero::total_power(hero) + onerealm::hero::mission_bonus(hero, session.mission_type);
        let win = settle(session, hero_power, clock, ctx);
        if (win) {
            distribute(session, sender, ctx);
            distribute_profession_bonus(hero, session.mission_type, sender, ctx);
            onerealm::hero::grant_profession_xp(hero, get_profession_xp_gain(session.contract_type));
        };
    }

    public fun grant_judge_bundle(
        _authority: &GameAuthority,
        player: address,
        ctx: &mut one::tx_context::TxContext
    ) {
        let ore_a = onerealm::material::create(onerealm::material::type_ore(), b"Iron Ore", 1, 2, ctx);
        let ore_b = onerealm::material::create(onerealm::material::type_ore(), b"Iron Ore", 1, 2, ctx);
        let scrap_a = onerealm::material::create(onerealm::material::type_scrap(), b"Armor Scrap", 1, 2, ctx);
        let scrap_b = onerealm::material::create(onerealm::material::type_scrap(), b"Armor Scrap", 1, 2, ctx);
        let essence_a = onerealm::material::create(onerealm::material::type_essence(), b"Battle Notes", 1, 2, ctx);
        let essence_b = onerealm::material::create(onerealm::material::type_essence(), b"Battle Notes", 1, 2, ctx);
        one::transfer::public_transfer(ore_a, player);
        one::transfer::public_transfer(ore_b, player);
        one::transfer::public_transfer(scrap_a, player);
        one::transfer::public_transfer(scrap_b, player);
        one::transfer::public_transfer(essence_a, player);
        one::transfer::public_transfer(essence_b, player);
    }

    // === Helpers ===
    fun get_boss_power(mission_type: u8, contract_type: u8): u64 {
        let base = if (mission_type == MISSION_RAID) BOSS_RAID_POWER
        else if (mission_type == MISSION_HARVEST) BOSS_HARVEST_POWER
        else BOSS_TRAINING_POWER;

        if (contract_type == CONTRACT_BOUNTY) {
            if (mission_type == MISSION_RAID) {
                base + 6
            } else if (mission_type == MISSION_HARVEST) {
                base + 4
            } else {
                base + 3
            }
        } else if (contract_type == CONTRACT_EXPEDITION) {
            if (mission_type == MISSION_RAID) {
                base + 8
            } else if (mission_type == MISSION_HARVEST) {
                base + 5
            } else {
                base + 4
            }
        } else {
            base
        }
    }

    fun get_duration_for_expedition(mission_type: u8): u64 {
        if (mission_type == MISSION_RAID) {
            12 * 60 * 60 * 1000
        } else if (mission_type == MISSION_HARVEST) {
            6 * 60 * 60 * 1000
        } else {
            2 * 60 * 60 * 1000
        }
    }

    fun get_profession_xp_gain(contract_type: u8): u64 {
        if (contract_type == CONTRACT_EXPEDITION) {
            3
        } else if (contract_type == CONTRACT_BOUNTY) {
            2
        } else {
            1
        }
    }

    fun get_stance_bonus(mission_type: u8, stance: u8): u64 {
        if (mission_type == MISSION_RAID) {
            if (stance == STANCE_AGGRESSIVE) 6
            else if (stance == STANCE_BALANCED) 2
            else 0
        } else if (mission_type == MISSION_HARVEST) {
            if (stance == STANCE_GUARDED) 5
            else if (stance == STANCE_BALANCED) 2
            else 1
        } else {
            if (stance == STANCE_BALANCED) 3
            else 2
        }
    }

    fun distribute_profession_bonus(
        hero: &Hero,
        mission_type: u8,
        player: address,
        ctx: &mut one::tx_context::TxContext
    ) {
        if (!onerealm::hero::has_profession_bonus(hero, mission_type)) {
            return
        };

        let material_type = onerealm::hero::profession_bonus_material_type(hero, mission_type);
        let material_name = onerealm::hero::profession_bonus_material_name(hero, mission_type);
        let material_value = onerealm::hero::profession_bonus_material_value(hero, mission_type);
        let material = onerealm::material::create(material_type, material_name, 1, material_value, ctx);
        one::transfer::public_transfer(material, player);
    }

    fun get_power_for_tier(tier: u8): u64 {
        if (tier == 0) LOOT_POWER_COMMON
        else if (tier == 1) LOOT_POWER_RARE
        else LOOT_POWER_LEGENDARY
    }

    fun get_name_for_type(loot_type: u8, tier: u8): vector<u8> {
        if (loot_type == 0) {
            if (tier == 0)      b"Iron Sword"
            else if (tier == 1) b"Rare Sword"
            else                b"Legendary Sword"
        } else {
            if (tier == 0)      b"Iron Armor"
            else if (tier == 1) b"Rare Armor"
            else                b"Legendary Armor"
        }
    }

    fun get_loot_count_for_mission(
        mission_type: u8,
        contract_type: u8,
        gen: &mut one::random::RandomGenerator
    ): u8 {
        if (mission_type == MISSION_TRAINING) {
            if (contract_type == CONTRACT_BOUNTY || contract_type == CONTRACT_EXPEDITION) {
                one::random::generate_u8_in_range(gen, 2, 3)
            } else {
                one::random::generate_u8_in_range(gen, 1, 2)
            }
        } else {
            if (contract_type == CONTRACT_BOUNTY || contract_type == CONTRACT_EXPEDITION) {
                one::random::generate_u8_in_range(gen, 3, 4)
            } else {
                one::random::generate_u8_in_range(gen, 2, 3)
            }
        }
    }

    fun get_tier_for_roll(mission_type: u8, roll: u8): u8 {
        if (mission_type == MISSION_RAID) {
            if (roll <= 44) 0
            else if (roll <= 84) 1
            else 2
        } else if (mission_type == MISSION_HARVEST) {
            if (roll <= 84) 0
            else if (roll <= 97) 1
            else 2
        } else {
            if (roll <= 89) 0
            else 1
        }
    }

    fun should_drop_equipment(mission_type: u8, tier: u8): bool {
        mission_type == MISSION_RAID && tier > 0
    }

    fun get_affix_for_reward(tier: u8, gen: &mut one::random::RandomGenerator): u8 {
        if (tier == 0) {
            onerealm::equipment::affix_none()
        } else {
            one::random::generate_u8_in_range(gen, 1, 3)
        }
    }

    fun get_material_type_for_reward(mission_type: u8, loot_type: u8): u8 {
        if (mission_type == MISSION_TRAINING) {
            onerealm::material::type_essence()
        } else if (loot_type == 0) {
            onerealm::material::type_ore()
        } else {
            onerealm::material::type_scrap()
        }
    }

    fun get_material_name_for_reward(mission_type: u8, loot_type: u8): vector<u8> {
        if (mission_type == MISSION_TRAINING) {
            b"Battle Notes"
        } else if (loot_type == 0) {
            b"Iron Ore"
        } else {
            b"Armor Scrap"
        }
    }

    fun get_material_value_for_tier(mission_type: u8, contract_type: u8, tier: u8): u64 {
        let base = if (mission_type == MISSION_TRAINING) {
            if (tier == 0) 1 else 2
        } else if (tier == 0) {
            1
        } else if (tier == 1) {
            2
        } else {
            4
        };

        if (contract_type == CONTRACT_BOUNTY) {
            base + 1
        } else if (contract_type == CONTRACT_EXPEDITION) {
            base + 2
        } else {
            base
        }
    }

    // === Getters ===
    public fun status(s: &MissionSession): u8               { s.status }
    public fun player(s: &MissionSession): address          { s.player }
    public fun hero_id(s: &MissionSession): one::object::ID { s.hero_id }
    public fun contract_type(s: &MissionSession): u8        { s.contract_type }
    public fun ready_at_ms(s: &MissionSession): u64         { s.ready_at_ms }
    public fun stance(s: &MissionSession): u8               { s.stance }
    public fun loot_tiers(s: &MissionSession): &vector<u8>  { &s.loot_tiers }
    public fun loot_types(s: &MissionSession): &vector<u8>  { &s.loot_types }
    public fun loot_affixes(s: &MissionSession): &vector<u8> { &s.loot_affixes }

    public fun status_pending():   u8 { STATUS_PENDING }
    public fun status_loot_done(): u8 { STATUS_LOOT_DONE }
    public fun status_complete():  u8 { STATUS_COMPLETE }
    public fun status_failed():    u8 { STATUS_FAILED }
    public fun contract_standard():u8 { CONTRACT_STANDARD }
    public fun contract_bounty():  u8 { CONTRACT_BOUNTY }
    public fun contract_expedition(): u8 { CONTRACT_EXPEDITION }
    public fun stance_balanced():  u8 { STANCE_BALANCED }
    public fun stance_aggressive():u8 { STANCE_AGGRESSIVE }
    public fun stance_guarded():   u8 { STANCE_GUARDED }

    #[test_only]
    public fun create_authority_for_testing(ctx: &mut one::tx_context::TxContext): GameAuthority {
        GameAuthority {
            id: one::object::new(ctx),
        }
    }
}
