// mission.move — OneRealm v2.0
// ADR-004: MissionSession owned by Game Server, ADR-010: deterministic battle
// Move 2024: no sui::vector import — use vector<T> natively

module onerealm::mission {
    use onerealm::equipment::Equipment;

    // === Constants ===
    const MISSION_FOREST:  u8  = 0;
    #[allow(unused_const)]
    const MISSION_DUNGEON: u8  = 1;
    const BOSS_FOREST_POWER:  u64 = 20;
    const BOSS_DUNGEON_POWER: u64 = 35;
    const BATTLE_SEED_MOD:    u64 = 20;

    const STATUS_PENDING:   u8 = 0;
    const STATUS_LOOT_DONE: u8 = 1;
    const STATUS_COMPLETE:  u8 = 2;
    const STATUS_FAILED:    u8 = 3;

    const LOOT_POWER_COMMON:    u64 = 10;
    const LOOT_POWER_RARE:      u64 = 22;
    const LOOT_POWER_LEGENDARY: u64 = 40;

    // === Error codes ===
    const EInvalidStatus:    u64 = 0;
    const ESettleBeforeLoot: u64 = 1;

    // === Struct ===
    /// Owned object of Game Server — NEVER share_object (ADR-004)
    /// `store` needed for test_only public_transfer calls
    public struct MissionSession has key, store {
        id:           sui::object::UID,
        player:       address,
        hero_id:      sui::object::ID,
        mission_type: u8,
        status:       u8,
        loot_tiers:   vector<u8>,
        loot_types:   vector<u8>,
    }

    // === Constructor ===
    public fun create_session(
        player:       address,
        hero_id:      sui::object::ID,
        mission_type: u8,
        ctx:          &mut sui::tx_context::TxContext
    ): MissionSession {
        MissionSession {
            id:           sui::object::new(ctx),
            player,
            hero_id,
            mission_type,
            status:       STATUS_PENDING,
            loot_tiers:   vector[],
            loot_types:   vector[],
        }
    }

    // === Package-internal (called by loot.move only) ===
    public(package) fun add_loot(
        session:   &mut MissionSession,
        tier:      u8,
        loot_type: u8
    ) {
        assert!(session.status == STATUS_PENDING, EInvalidStatus);
        session.loot_tiers.push_back(tier);
        session.loot_types.push_back(loot_type);
        session.status = STATUS_LOOT_DONE;
    }

    // === Tx2 settlement (called from PTB — ADR-006) ===
    /// Deterministic battle resolution — ADR-010, NO sui::random in Tx2
    public fun settle(
        session:    &mut MissionSession,
        hero_power: u64,
        clock:      &sui::clock::Clock,
        ctx:        &mut sui::tx_context::TxContext
    ): vector<Equipment> {
        assert!(session.status == STATUS_LOOT_DONE, ESettleBeforeLoot);

        let boss_power = get_boss_power(session.mission_type);
        let seed = sui::clock::timestamp_ms(clock) % BATTLE_SEED_MOD;
        let win = (hero_power + seed) > boss_power;

        if (!win) {
            session.status = STATUS_FAILED;
            return vector[]
        };

        let mut rewards = vector[];
        let len = session.loot_tiers.length();
        let mut i = 0;
        while (i < len) {
            let tier      = session.loot_tiers[i];
            let loot_type = session.loot_types[i];
            let power     = get_power_for_tier(tier);
            let name      = get_name_for_type(loot_type, tier);
            let eq        = onerealm::equipment::create(loot_type, name, power, tier, ctx);
            rewards.push_back(eq);
            i = i + 1;
        };

        session.status = STATUS_COMPLETE;
        rewards
    }

    public fun distribute(
        mut rewards: vector<Equipment>,
        player:      address,
        _ctx:        &mut sui::tx_context::TxContext
    ) {
        while (!rewards.is_empty()) {
            let eq = rewards.pop_back();
            sui::transfer::public_transfer(eq, player);
        };
        rewards.destroy_empty();
    }

    // === Helpers ===
    fun get_boss_power(mission_type: u8): u64 {
        if (mission_type == MISSION_FOREST) BOSS_FOREST_POWER
        else BOSS_DUNGEON_POWER
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

    // === Getters ===
    public fun status(s: &MissionSession): u8             { s.status }
    public fun player(s: &MissionSession): address        { s.player }
    public fun hero_id(s: &MissionSession): sui::object::ID   { s.hero_id }
    public fun loot_tiers(s: &MissionSession): &vector<u8>    { &s.loot_tiers }
    public fun loot_types(s: &MissionSession): &vector<u8>    { &s.loot_types }

    public fun status_pending():   u8 { STATUS_PENDING }
    public fun status_loot_done(): u8 { STATUS_LOOT_DONE }
    public fun status_complete():  u8 { STATUS_COMPLETE }
    public fun status_failed():    u8 { STATUS_FAILED }
}
