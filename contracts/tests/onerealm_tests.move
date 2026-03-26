// onerealm_tests.move — Move 2024 compatible unit tests
#[test_only]
module onerealm::onerealm_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use onerealm::equipment::{Self, Equipment};
    use onerealm::hero::{Self, Hero};
    use onerealm::mission::{Self, MissionSession};

    const PLAYER:      address = @0xA;
    const GAME_SERVER: address = @0xB;

    // ──────────────────────────────────────
    // Equipment
    // ──────────────────────────────────────
    #[test]
    fun test_equipment_create_and_getters() {
        let mut s = ts::begin(PLAYER);
        {
            let eq = equipment::create(0, b"Iron Sword", 10, 0, s.ctx());
            assert!(equipment::eq_type(&eq) == 0);
            assert!(equipment::power(&eq) == 10);
            assert!(equipment::rarity(&eq) == 0);
            sui::transfer::public_transfer(eq, PLAYER);
        };
        s.end();
    }

    // ──────────────────────────────────────
    // Hero
    // ──────────────────────────────────────
    #[test]
    fun test_mint_hero_defaults() {
        let mut s = ts::begin(PLAYER);
        {
            let hero = hero::mint(b"Alice", s.ctx());
            assert!(hero::level(&hero) == 1);
            assert!(hero::base_power(&hero) == 10);
            assert!(hero::total_power(&hero) == 10);
            sui::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_equip_and_total_power() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Bob", s.ctx());
            let weapon   = equipment::create(0, b"Iron Sword", 10, 0, s.ctx());
            let armor    = equipment::create(1, b"Iron Armor", 10, 0, s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), weapon);
            hero::equip(&mut hero, hero::slot_armor(),  armor);
            assert!(hero::total_power(&hero) == 30); // 10+10+10
            sui::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::hero::ESlotOccupied)]
    fun test_equip_occupied_aborts() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Carol", s.ctx());
            let w1 = equipment::create(0, b"Iron Sword", 10, 0, s.ctx());
            let w2 = equipment::create(0, b"Rare Sword", 22, 1, s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), w1);
            hero::equip(&mut hero, hero::slot_weapon(), w2); // aborts
            sui::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_unequip_returns_equipment() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Dave", s.ctx());
            let weapon   = equipment::create(0, b"Iron Sword", 10, 0, s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), weapon);
            assert!(hero::total_power(&hero) == 20);
            let returned = hero::unequip(&mut hero, hero::slot_weapon());
            assert!(hero::total_power(&hero) == 10);
            assert!(equipment::power(&returned) == 10);
            sui::transfer::public_transfer(returned, PLAYER);
            sui::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_burn_with_equipment_no_orphans() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Eve", s.ctx());
            let weapon = equipment::create(0, b"Iron Sword", 10, 0, s.ctx());
            let armor  = equipment::create(1, b"Iron Armor", 10, 0, s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), weapon);
            hero::equip(&mut hero, hero::slot_armor(), armor);
            hero::burn(hero, s.ctx()); // ADR-005: no orphans
        };
        s.end();
    }

    // ──────────────────────────────────────
    // Mission state machine
    // ──────────────────────────────────────
    #[test]
    fun test_session_pending_to_loot_done() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let hero = hero::mint(b"Frank", s.ctx());
            let hero_id = sui::object::id(&hero);
            let mut session = mission::create_session(PLAYER, hero_id, 0, s.ctx());
            assert!(mission::status(&session) == mission::status_pending());

            mission::add_loot(&mut session, 0, 0);
            assert!(mission::status(&session) == mission::status_loot_done());

            sui::transfer::public_transfer(session, GAME_SERVER);
            sui::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_session_settle_win() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let mut hero = hero::mint(b"Grace", s.ctx());
            let weapon = equipment::create(0, b"Rare Sword", 22, 1, s.ctx());
            let armor  = equipment::create(1, b"Rare Armor", 22, 1, s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), weapon);
            hero::equip(&mut hero, hero::slot_armor(),  armor);

            let hero_id   = sui::object::id(&hero);
            let mut session = mission::create_session(PLAYER, hero_id, 0, s.ctx()); // FOREST boss=20
            mission::add_loot(&mut session, 0, 0);

            let clk = clock::create_for_testing(s.ctx());
            // hero_power=54 >> boss=20: always win
            let rewards = mission::settle(&mut session, hero::total_power(&hero), &clk, s.ctx());
            assert!(mission::status(&session) == mission::status_complete());
            assert!(rewards.length() == 1);

            mission::distribute(rewards, PLAYER, s.ctx());
            clk.destroy_for_testing();
            sui::transfer::public_transfer(session, GAME_SERVER);
            sui::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_session_settle_lose() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let hero = hero::mint(b"Henry", s.ctx()); // base_power=10
            let hero_id = sui::object::id(&hero);
            let mut session = mission::create_session(PLAYER, hero_id, 1, s.ctx()); // DUNGEON boss=35
            mission::add_loot(&mut session, 0, 0);

            let clk = clock::create_for_testing(s.ctx());
            // hero_power=10, max bonus=19 → 10+19=29 < 35: always lose
            let rewards = mission::settle(&mut session, 10, &clk, s.ctx());
            assert!(mission::status(&session) == mission::status_failed());
            assert!(rewards.is_empty());

            mission::distribute(rewards, PLAYER, s.ctx());
            clk.destroy_for_testing();
            sui::transfer::public_transfer(session, GAME_SERVER);
            sui::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::mission::ESettleBeforeLoot)]
    fun test_settle_before_loot_aborts() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let hero    = hero::mint(b"Iris", s.ctx());
            let hero_id = sui::object::id(&hero);
            let mut session = mission::create_session(PLAYER, hero_id, 0, s.ctx());
            let clk = clock::create_for_testing(s.ctx());
            // STATUS_PENDING → aborts with ESettleBeforeLoot
            let rewards = mission::settle(&mut session, 10, &clk, s.ctx());
            mission::distribute(rewards, PLAYER, s.ctx());
            clk.destroy_for_testing();
            sui::transfer::public_transfer(session, GAME_SERVER);
            sui::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }
}
