// onerealm_tests.move — Move 2024 compatible unit tests
#[test_only]
module onerealm::onerealm_tests {
    use onerealm::blacksmith;
    use one::clock;
    use one::test_scenario::{Self as ts};
    use onerealm::equipment;
    use onerealm::hero;
    use onerealm::material;
    use onerealm::mission;

    const PLAYER:      address = @0xA;
    const GAME_SERVER: address = @0xB;

    // ──────────────────────────────────────
    // Equipment
    // ──────────────────────────────────────
    #[test]
    fun test_equipment_create_and_getters() {
        let mut s = ts::begin(PLAYER);
        {
            let eq = equipment::create(0, b"Iron Sword", 10, 0, equipment::affix_none(), s.ctx());
            assert!(equipment::eq_type(&eq) == 0);
            assert!(equipment::power(&eq) == 10);
            assert!(equipment::rarity(&eq) == 0);
            assert!(equipment::affix(&eq) == equipment::affix_none());
            one::transfer::public_transfer(eq, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_material_create_and_getters() {
        let mut s = ts::begin(PLAYER);
        {
            let ore = material::create(material::type_ore(), b"Iron Ore", 0, 1, s.ctx());
            assert!(material::material_type(&ore) == material::type_ore());
            assert!(material::rarity(&ore) == 0);
            assert!(material::value(&ore) == 1);
            one::transfer::public_transfer(ore, PLAYER);

            let essence = material::create(material::type_essence(), b"Battle Notes", 0, 1, s.ctx());
            assert!(material::material_type(&essence) == material::type_essence());
            assert!(material::rarity(&essence) == 0);
            assert!(material::value(&essence) == 1);
            one::transfer::public_transfer(essence, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_salvage_equipment_to_material() {
        let mut s = ts::begin(PLAYER);
        {
            let eq = equipment::create(0, b"Iron Sword", 10, 1, equipment::affix_raider(), s.ctx());
            equipment::salvage_to_sender(eq, s.ctx());
        };
        s.end();
    }

    #[test]
    fun test_blacksmith_crafts_raider_blade() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Frost", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let ore_a = material::create(material::type_ore(), b"Iron Ore", 0, 1, s.ctx());
            let ore_b = material::create(material::type_ore(), b"Iron Ore", 1, 2, s.ctx());
            let essence = material::create(material::type_essence(), b"Battle Notes", 1, 2, s.ctx());
            blacksmith::craft_to_sender(blacksmith::recipe_raider_blade(), &mut hero, ore_a, ore_b, essence, s.ctx());
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::blacksmith::EWrongMaterials)]
    fun test_blacksmith_rejects_wrong_material_mix() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Moss", hero::archetype_ranger(), hero::profession_foraging(), s.ctx());
            let ore = material::create(material::type_ore(), b"Iron Ore", 0, 1, s.ctx());
            let scrap = material::create(material::type_scrap(), b"Armor Scrap", 0, 1, s.ctx());
            let essence = material::create(material::type_essence(), b"Battle Notes", 0, 1, s.ctx());
            blacksmith::craft_to_sender(blacksmith::recipe_forager_mail(), &mut hero, ore, scrap, essence, s.ctx());
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_blacksmith_profession_recipe_crafts() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Anvil", hero::archetype_arcanist(), hero::profession_smithing(), s.ctx());
            hero::grant_profession_xp(&mut hero, 3);
            let ore = material::create(material::type_ore(), b"Iron Ore", 1, 2, s.ctx());
            let scrap = material::create(material::type_scrap(), b"Armor Scrap", 1, 2, s.ctx());
            let essence = material::create(material::type_essence(), b"Battle Notes", 1, 2, s.ctx());
            blacksmith::craft_to_sender(blacksmith::recipe_smiths_sigil(), &mut hero, ore, scrap, essence, s.ctx());
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::blacksmith::EProfessionMismatch)]
    fun test_blacksmith_profession_recipe_rejects_wrong_profession() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Willow", hero::archetype_ranger(), hero::profession_foraging(), s.ctx());
            hero::grant_profession_xp(&mut hero, 3);
            let ore_a = material::create(material::type_ore(), b"Iron Ore", 0, 1, s.ctx());
            let ore_b = material::create(material::type_ore(), b"Iron Ore", 0, 1, s.ctx());
            let scrap = material::create(material::type_scrap(), b"Armor Scrap", 0, 1, s.ctx());
            blacksmith::craft_to_sender(blacksmith::recipe_miners_pickblade(), &mut hero, ore_a, ore_b, scrap, s.ctx());
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::blacksmith::EProfessionRankTooLow)]
    fun test_blacksmith_profession_recipe_requires_rank() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Coal", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let ore_a = material::create(material::type_ore(), b"Iron Ore", 0, 1, s.ctx());
            let ore_b = material::create(material::type_ore(), b"Iron Ore", 0, 1, s.ctx());
            let scrap = material::create(material::type_scrap(), b"Armor Scrap", 0, 1, s.ctx());
            blacksmith::craft_to_sender(blacksmith::recipe_miners_pickblade(), &mut hero, ore_a, ore_b, scrap, s.ctx());
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_blacksmith_master_recipe_requires_master_rank() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Forge", hero::archetype_arcanist(), hero::profession_smithing(), s.ctx());
            hero::grant_profession_xp(&mut hero, 7);
            let ore = material::create(material::type_ore(), b"Iron Ore", 1, 2, s.ctx());
            let scrap = material::create(material::type_scrap(), b"Armor Scrap", 1, 2, s.ctx());
            let essence = material::create(material::type_essence(), b"Battle Notes", 1, 2, s.ctx());
            blacksmith::craft_to_sender(blacksmith::recipe_masterwork_matrix(), &mut hero, ore, scrap, essence, s.ctx());
            assert!(hero::profession_rank(&hero) == hero::profession_rank_master());
            one::transfer::public_transfer(hero, PLAYER);
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
            let hero = hero::mint(b"Alice", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            assert!(hero::level(&hero) == 1);
            assert!(hero::base_power(&hero) == 10);
            assert!(hero::archetype(&hero) == hero::archetype_warrior());
            assert!(hero::profession(&hero) == hero::profession_mining());
            assert!(hero::profession_rank(&hero) == hero::profession_rank_novice());
            assert!(hero::total_power(&hero) == 10);
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_equip_and_total_power() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Bob", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let weapon   = equipment::create(0, b"Iron Sword", 10, 0, equipment::affix_none(), s.ctx());
            let armor    = equipment::create(1, b"Iron Armor", 10, 0, equipment::affix_none(), s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), weapon);
            hero::equip(&mut hero, hero::slot_armor(),  armor);
            assert!(hero::total_power(&hero) == 30); // 10+10+10
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::hero::ESlotOccupied)]
    fun test_equip_occupied_aborts() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Carol", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let w1 = equipment::create(0, b"Iron Sword", 10, 0, equipment::affix_none(), s.ctx());
            let w2 = equipment::create(0, b"Rare Sword", 22, 1, equipment::affix_raider(), s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), w1);
            hero::equip(&mut hero, hero::slot_weapon(), w2); // aborts
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::hero::ETypeMismatch)]
    fun test_equip_wrong_type_aborts() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Clara", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let armor = equipment::create(1, b"Iron Armor", 10, 0, equipment::affix_none(), s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), armor);
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_unequip_returns_equipment() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Dave", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let weapon   = equipment::create(0, b"Iron Sword", 10, 0, equipment::affix_none(), s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), weapon);
            assert!(hero::total_power(&hero) == 20);
            let returned = hero::unequip(&mut hero, hero::slot_weapon());
            assert!(hero::total_power(&hero) == 10);
            assert!(equipment::power(&returned) == 10);
            one::transfer::public_transfer(returned, PLAYER);
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_burn_with_equipment_no_orphans() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Eve", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let weapon = equipment::create(0, b"Iron Sword", 10, 0, equipment::affix_none(), s.ctx());
            let armor  = equipment::create(1, b"Iron Armor", 10, 0, equipment::affix_none(), s.ctx());
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
            let authority = mission::create_authority_for_testing(s.ctx());
            let clock = clock::create_for_testing(s.ctx());
            let hero = hero::mint(b"Frank", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let hero_id = one::object::id(&hero);
            let mut session = mission::create_session(&authority, PLAYER, hero_id, 0, mission::contract_standard(), &clock, mission::stance_balanced(), s.ctx());
            assert!(mission::status(&session) == mission::status_pending());

            mission::add_loot(&mut session, 0, 0, equipment::affix_none());
            assert!(mission::status(&session) == mission::status_loot_done());

            one::transfer::public_transfer(session, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    fun test_session_settle_win() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let clock = clock::create_for_testing(s.ctx());
            let mut hero = hero::mint(b"Grace", hero::archetype_warrior(), hero::profession_relic_hunting(), s.ctx());
            let weapon = equipment::create(0, b"Rare Sword", 22, 1, equipment::affix_raider(), s.ctx());
            let armor  = equipment::create(1, b"Rare Armor", 22, 1, equipment::affix_raider(), s.ctx());
            hero::equip(&mut hero, hero::slot_weapon(), weapon);
            hero::equip(&mut hero, hero::slot_armor(),  armor);

            let hero_id   = one::object::id(&hero);
            let mut session = mission::create_session(&authority, PLAYER, hero_id, 0, mission::contract_standard(), &clock, mission::stance_aggressive(), s.ctx()); // RAID boss=35
            mission::add_loot(&mut session, 2, 0, equipment::affix_raider());

            // hero_power=54, affix bonus=8, aggressive stance=6 >> boss=35: always win
            let win = mission::settle(&mut session, hero::total_power(&hero) + hero::mission_bonus(&hero, 0), &clock, s.ctx());
            assert!(mission::status(&session) == mission::status_complete());
            assert!(win);

            mission::distribute(&session, PLAYER, s.ctx());
            one::transfer::public_transfer(session, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    fun test_session_settle_lose() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let clock = clock::create_for_testing(s.ctx());
            let hero = hero::mint(b"Henry", hero::archetype_warrior(), hero::profession_mining(), s.ctx()); // base_power=10
            let hero_id = one::object::id(&hero);
            let mut session = mission::create_session(&authority, PLAYER, hero_id, 0, mission::contract_standard(), &clock, mission::stance_guarded(), s.ctx()); // RAID boss=35
            mission::add_loot(&mut session, 0, 0, equipment::affix_none());

            let win = mission::settle(&mut session, 10, &clock, s.ctx());
            assert!(mission::status(&session) == mission::status_failed());
            assert!(!win);

            one::transfer::public_transfer(session, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::mission::ESettleBeforeLoot)]
    fun test_settle_before_loot_aborts() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let clock = clock::create_for_testing(s.ctx());
            let hero    = hero::mint(b"Iris", hero::archetype_warrior(), hero::profession_smithing(), s.ctx());
            let hero_id = one::object::id(&hero);
            let mut session = mission::create_session(&authority, PLAYER, hero_id, 2, mission::contract_standard(), &clock, mission::stance_balanced(), s.ctx());
            // STATUS_PENDING → aborts with ESettleBeforeLoot
            let _win = mission::settle(&mut session, 10, &clock, s.ctx());
            one::transfer::public_transfer(session, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    fun test_training_session_is_easy_win() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let clock = clock::create_for_testing(s.ctx());
            let hero = hero::mint(b"Jade", hero::archetype_arcanist(), hero::profession_smithing(), s.ctx());
            let hero_id = one::object::id(&hero);
            let mut session = mission::create_session(&authority, PLAYER, hero_id, 2, mission::contract_standard(), &clock, mission::stance_balanced(), s.ctx());
            mission::add_loot(&mut session, 0, 0, equipment::affix_scholar());

            let win = mission::settle(&mut session, hero::total_power(&hero) + hero::mission_bonus(&hero, 2), &clock, s.ctx());
            assert!(win);
            assert!(mission::status(&session) == mission::status_complete());

            one::transfer::public_transfer(session, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    fun test_aggressive_stance_changes_raid_outcome() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let clock = clock::create_for_testing(s.ctx());
            let hero = hero::mint(b"Kai", hero::archetype_warrior(), hero::profession_relic_hunting(), s.ctx());
            let hero_id = one::object::id(&hero);

            let mut guarded = mission::create_session(&authority, PLAYER, hero_id, 0, mission::contract_standard(), &clock, mission::stance_guarded(), s.ctx());
            mission::add_loot(&mut guarded, 0, 0, equipment::affix_none());
            let guarded_win = mission::settle(&mut guarded, 34, &clock, s.ctx());
            assert!(!guarded_win);

            let mut aggressive = mission::create_session(&authority, PLAYER, hero_id, 0, mission::contract_standard(), &clock, mission::stance_aggressive(), s.ctx());
            mission::add_loot(&mut aggressive, 0, 0, equipment::affix_none());
            let aggressive_win = mission::settle(&mut aggressive, 34, &clock, s.ctx());
            assert!(aggressive_win);

            one::transfer::public_transfer(guarded, GAME_SERVER);
            one::transfer::public_transfer(aggressive, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    fun test_bounty_contract_requires_more_power_than_standard() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let clock = clock::create_for_testing(s.ctx());
            let hero = hero::mint(b"Vale", hero::archetype_warrior(), hero::profession_relic_hunting(), s.ctx());
            let hero_id = one::object::id(&hero);

            let mut standard = mission::create_session(&authority, PLAYER, hero_id, 0, mission::contract_standard(), &clock, mission::stance_balanced(), s.ctx());
            mission::add_loot(&mut standard, 0, 0, equipment::affix_none());
            assert!(mission::settle(&mut standard, 34, &clock, s.ctx()));

            let mut bounty = mission::create_session(&authority, PLAYER, hero_id, 0, mission::contract_bounty(), &clock, mission::stance_balanced(), s.ctx());
            mission::add_loot(&mut bounty, 0, 0, equipment::affix_none());
            assert!(!mission::settle(&mut bounty, 34, &clock, s.ctx()));

            one::transfer::public_transfer(standard, GAME_SERVER);
            one::transfer::public_transfer(bounty, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    #[expected_failure(abort_code = onerealm::mission::EExpeditionNotReady)]
    fun test_expedition_rejects_early_settle() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let clock = clock::create_for_testing(s.ctx());
            let hero = hero::mint(b"Toma", hero::archetype_ranger(), hero::profession_foraging(), s.ctx());
            let hero_id = one::object::id(&hero);

            let mut expedition = mission::create_session(&authority, PLAYER, hero_id, 1, mission::contract_expedition(), &clock, mission::stance_guarded(), s.ctx());
            mission::add_loot(&mut expedition, 1, 1, equipment::affix_forager());
            assert!(mission::ready_at_ms(&expedition) > 0);
            let _ = mission::settle(&mut expedition, 40, &clock, s.ctx());
            one::transfer::public_transfer(expedition, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    fun test_expedition_settles_after_wait() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let mut clock = clock::create_for_testing(s.ctx());
            let hero = hero::mint(b"Toma", hero::archetype_ranger(), hero::profession_foraging(), s.ctx());
            let hero_id = one::object::id(&hero);

            let mut expedition = mission::create_session(&authority, PLAYER, hero_id, 1, mission::contract_expedition(), &clock, mission::stance_guarded(), s.ctx());
            mission::add_loot(&mut expedition, 1, 1, equipment::affix_forager());
            clock::increment_for_testing(&mut clock, 6 * 60 * 60 * 1000);
            assert!(mission::settle(&mut expedition, 40, &clock, s.ctx()));

            one::transfer::public_transfer(expedition, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            clock::destroy_for_testing(clock);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    fun test_archetype_bonus_matches_mission_affinity() {
        let mut s = ts::begin(PLAYER);
        {
            let warrior = hero::mint(b"Wren", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            let ranger = hero::mint(b"Reed", hero::archetype_ranger(), hero::profession_foraging(), s.ctx());
            let arcanist = hero::mint(b"Iona", hero::archetype_arcanist(), hero::profession_smithing(), s.ctx());

            assert!(hero::mission_bonus(&warrior, 0) == 3);
            assert!(hero::mission_bonus(&ranger, 1) == 3);
            assert!(hero::mission_bonus(&arcanist, 2) == 3);
            assert!(hero::mission_bonus(&warrior, 1) == 0);

            one::transfer::public_transfer(warrior, PLAYER);
            one::transfer::public_transfer(ranger, PLAYER);
            one::transfer::public_transfer(arcanist, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_profession_bonus_matches_reward_loop() {
        let mut s = ts::begin(PLAYER);
        {
            let miner = hero::mint(b"Mira", hero::archetype_ranger(), hero::profession_mining(), s.ctx());
            let forager = hero::mint(b"Fern", hero::archetype_ranger(), hero::profession_foraging(), s.ctx());
            let smith = hero::mint(b"Brass", hero::archetype_arcanist(), hero::profession_smithing(), s.ctx());
            let relic = hero::mint(b"Rook", hero::archetype_warrior(), hero::profession_relic_hunting(), s.ctx());

            assert!(hero::has_profession_bonus(&miner, 1));
            assert!(hero::profession_bonus_material_type(&miner, 1) == material::type_ore());
            assert!(hero::profession_bonus_material_value(&miner, 1) == 2);

            assert!(hero::has_profession_bonus(&forager, 1));
            assert!(hero::profession_bonus_material_type(&forager, 1) == material::type_scrap());

            assert!(hero::has_profession_bonus(&smith, 2));
            assert!(hero::profession_bonus_material_type(&smith, 2) == material::type_essence());

            assert!(hero::has_profession_bonus(&relic, 0));
            assert!(hero::profession_bonus_material_value(&relic, 0) == 3);
            assert!(!hero::has_profession_bonus(&relic, 1));

            one::transfer::public_transfer(miner, PLAYER);
            one::transfer::public_transfer(forager, PLAYER);
            one::transfer::public_transfer(smith, PLAYER);
            one::transfer::public_transfer(relic, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_profession_rank_thresholds() {
        let mut s = ts::begin(PLAYER);
        {
            let mut hero = hero::mint(b"Tier", hero::archetype_warrior(), hero::profession_mining(), s.ctx());
            assert!(hero::profession_rank(&hero) == hero::profession_rank_novice());
            hero::grant_profession_xp(&mut hero, 3);
            assert!(hero::profession_rank(&hero) == hero::profession_rank_adept());
            hero::grant_profession_xp(&mut hero, 4);
            assert!(hero::profession_rank(&hero) == hero::profession_rank_master());
            one::transfer::public_transfer(hero, PLAYER);
        };
        s.end();
    }

    #[test]
    fun test_judge_session_uses_override_ready_time() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            let hero = hero::mint(b"Demo", hero::archetype_arcanist(), hero::profession_smithing(), s.ctx());
            let hero_id = one::object::id(&hero);
            let session = mission::create_judge_session(
                &authority,
                PLAYER,
                hero_id,
                2,
                mission::contract_expedition(),
                mission::stance_balanced(),
                12345,
                s.ctx(),
            );
            assert!(mission::ready_at_ms(&session) == 12345);
            one::transfer::public_transfer(session, GAME_SERVER);
            one::transfer::public_transfer(hero, PLAYER);
            one::transfer::public_transfer(authority, GAME_SERVER);
        };
        s.end();
    }

    #[test]
    fun test_judge_bundle_grants_materials() {
        let mut s = ts::begin(GAME_SERVER);
        {
            let authority = mission::create_authority_for_testing(s.ctx());
            mission::grant_judge_bundle(&authority, PLAYER, s.ctx());
            one::transfer::public_transfer(authority, GAME_SERVER);
            ts::next_tx(&mut s, PLAYER);
            let ore_a = ts::take_from_sender<material::Material>(&mut s);
            let ore_b = ts::take_from_sender<material::Material>(&mut s);
            let scrap_a = ts::take_from_sender<material::Material>(&mut s);
            let scrap_b = ts::take_from_sender<material::Material>(&mut s);
            let essence_a = ts::take_from_sender<material::Material>(&mut s);
            let essence_b = ts::take_from_sender<material::Material>(&mut s);
            let ore_count = count_material_type(&ore_a, material::type_ore())
                + count_material_type(&ore_b, material::type_ore())
                + count_material_type(&scrap_a, material::type_ore())
                + count_material_type(&scrap_b, material::type_ore())
                + count_material_type(&essence_a, material::type_ore())
                + count_material_type(&essence_b, material::type_ore());
            let scrap_count = count_material_type(&ore_a, material::type_scrap())
                + count_material_type(&ore_b, material::type_scrap())
                + count_material_type(&scrap_a, material::type_scrap())
                + count_material_type(&scrap_b, material::type_scrap())
                + count_material_type(&essence_a, material::type_scrap())
                + count_material_type(&essence_b, material::type_scrap());
            let essence_count = count_material_type(&ore_a, material::type_essence())
                + count_material_type(&ore_b, material::type_essence())
                + count_material_type(&scrap_a, material::type_essence())
                + count_material_type(&scrap_b, material::type_essence())
                + count_material_type(&essence_a, material::type_essence())
                + count_material_type(&essence_b, material::type_essence());
            assert!(ore_count == 2);
            assert!(scrap_count == 2);
            assert!(essence_count == 2);
            ts::return_to_sender(&mut s, ore_a);
            ts::return_to_sender(&mut s, ore_b);
            ts::return_to_sender(&mut s, scrap_a);
            ts::return_to_sender(&mut s, scrap_b);
            ts::return_to_sender(&mut s, essence_a);
            ts::return_to_sender(&mut s, essence_b);
        };
        s.end();
    }

    fun count_material_type(item: &material::Material, expected: u8): u64 {
        if (material::material_type(item) == expected) 1 else 0
    }
}
