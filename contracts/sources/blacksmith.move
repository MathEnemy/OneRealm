module onerealm::blacksmith {
    use onerealm::hero::Hero;
    use onerealm::material::Material;

    const RECIPE_RAIDER_BLADE: u8 = 0;
    const RECIPE_FORAGER_MAIL: u8 = 1;
    const RECIPE_SCHOLAR_FOCUS: u8 = 2;
    const RECIPE_MINERS_PICKBLADE: u8 = 3;
    const RECIPE_FORAGERS_MANTLE: u8 = 4;
    const RECIPE_SMITHS_SIGIL: u8 = 5;
    const RECIPE_RELIC_PIKE: u8 = 6;
    const RECIPE_MINERS_CROWNBREAKER: u8 = 7;
    const RECIPE_FORAGERS_BULWARK: u8 = 8;
    const RECIPE_MASTERWORK_MATRIX: u8 = 9;
    const RECIPE_ANCIENT_HALBERD: u8 = 10;

    const EInvalidRecipe: u64 = 0;
    const EWrongMaterials: u64 = 1;
    const EProfessionMismatch: u64 = 2;
    const EProfessionRankTooLow: u64 = 3;

    entry fun craft_to_sender(
        recipe: u8,
        hero: &mut Hero,
        mat_a: Material,
        mat_b: Material,
        mat_c: Material,
        ctx: &mut one::tx_context::TxContext
    ) {
        let sender = one::tx_context::sender(ctx);
        let (type_a, rarity_a, value_a) = onerealm::material::consume(mat_a);
        let (type_b, rarity_b, value_b) = onerealm::material::consume(mat_b);
        let (type_c, rarity_c, value_c) = onerealm::material::consume(mat_c);

        let ore_count = count_type(type_a, type_b, type_c, onerealm::material::type_ore());
        let scrap_count = count_type(type_a, type_b, type_c, onerealm::material::type_scrap());
        let essence_count = count_type(type_a, type_b, type_c, onerealm::material::type_essence());

        let (eq_type, name, affix, bonus_power, xp_gain) = if (recipe == RECIPE_RAIDER_BLADE) {
            assert!(ore_count == 2 && essence_count == 1 && scrap_count == 0, EWrongMaterials);
            (onerealm::equipment::type_weapon(), b"Raider Blade", onerealm::equipment::affix_raider(), 0, 1)
        } else if (recipe == RECIPE_FORAGER_MAIL) {
            assert!(scrap_count == 2 && ore_count == 1 && essence_count == 0, EWrongMaterials);
            (onerealm::equipment::type_armor(), b"Forager Mail", onerealm::equipment::affix_forager(), 0, 1)
        } else if (recipe == RECIPE_SCHOLAR_FOCUS) {
            assert!(essence_count == 2 && scrap_count == 1 && ore_count == 0, EWrongMaterials);
            (onerealm::equipment::type_weapon(), b"Scholar Focus", onerealm::equipment::affix_scholar(), 0, 1)
        } else if (recipe == RECIPE_MINERS_PICKBLADE) {
            assert!(onerealm::hero::profession(hero) == onerealm::hero::profession_mining(), EProfessionMismatch);
            assert!(onerealm::hero::profession_rank(hero) >= onerealm::hero::profession_rank_adept(), EProfessionRankTooLow);
            assert!(ore_count == 2 && scrap_count == 1 && essence_count == 0, EWrongMaterials);
            (onerealm::equipment::type_weapon(), b"Miner's Pickblade", onerealm::equipment::affix_raider(), 5, 2)
        } else if (recipe == RECIPE_FORAGERS_MANTLE) {
            assert!(onerealm::hero::profession(hero) == onerealm::hero::profession_foraging(), EProfessionMismatch);
            assert!(onerealm::hero::profession_rank(hero) >= onerealm::hero::profession_rank_adept(), EProfessionRankTooLow);
            assert!(scrap_count == 2 && essence_count == 1 && ore_count == 0, EWrongMaterials);
            (onerealm::equipment::type_armor(), b"Forager's Mantle", onerealm::equipment::affix_forager(), 5, 2)
        } else if (recipe == RECIPE_SMITHS_SIGIL) {
            assert!(onerealm::hero::profession(hero) == onerealm::hero::profession_smithing(), EProfessionMismatch);
            assert!(onerealm::hero::profession_rank(hero) >= onerealm::hero::profession_rank_adept(), EProfessionRankTooLow);
            assert!(ore_count == 1 && scrap_count == 1 && essence_count == 1, EWrongMaterials);
            (onerealm::equipment::type_weapon(), b"Smith's Sigil", onerealm::equipment::affix_scholar(), 6, 2)
        } else if (recipe == RECIPE_RELIC_PIKE) {
            assert!(onerealm::hero::profession(hero) == onerealm::hero::profession_relic_hunting(), EProfessionMismatch);
            assert!(onerealm::hero::profession_rank(hero) >= onerealm::hero::profession_rank_adept(), EProfessionRankTooLow);
            assert!(essence_count == 2 && ore_count == 1 && scrap_count == 0, EWrongMaterials);
            (onerealm::equipment::type_weapon(), b"Relic Pike", onerealm::equipment::affix_raider(), 7, 2)
        } else if (recipe == RECIPE_MINERS_CROWNBREAKER) {
            assert!(onerealm::hero::profession(hero) == onerealm::hero::profession_mining(), EProfessionMismatch);
            assert!(onerealm::hero::profession_rank(hero) >= onerealm::hero::profession_rank_master(), EProfessionRankTooLow);
            assert!(ore_count == 3 && essence_count == 0 && scrap_count == 0, EWrongMaterials);
            (onerealm::equipment::type_weapon(), b"Miner's Crownbreaker", onerealm::equipment::affix_raider(), 10, 3)
        } else if (recipe == RECIPE_FORAGERS_BULWARK) {
            assert!(onerealm::hero::profession(hero) == onerealm::hero::profession_foraging(), EProfessionMismatch);
            assert!(onerealm::hero::profession_rank(hero) >= onerealm::hero::profession_rank_master(), EProfessionRankTooLow);
            assert!(scrap_count == 2 && ore_count == 1 && essence_count == 0, EWrongMaterials);
            (onerealm::equipment::type_armor(), b"Forager's Bulwark", onerealm::equipment::affix_forager(), 10, 3)
        } else if (recipe == RECIPE_MASTERWORK_MATRIX) {
            assert!(onerealm::hero::profession(hero) == onerealm::hero::profession_smithing(), EProfessionMismatch);
            assert!(onerealm::hero::profession_rank(hero) >= onerealm::hero::profession_rank_master(), EProfessionRankTooLow);
            assert!(ore_count == 1 && scrap_count == 1 && essence_count == 1, EWrongMaterials);
            (onerealm::equipment::type_weapon(), b"Masterwork Matrix", onerealm::equipment::affix_scholar(), 11, 3)
        } else if (recipe == RECIPE_ANCIENT_HALBERD) {
            assert!(onerealm::hero::profession(hero) == onerealm::hero::profession_relic_hunting(), EProfessionMismatch);
            assert!(onerealm::hero::profession_rank(hero) >= onerealm::hero::profession_rank_master(), EProfessionRankTooLow);
            assert!(essence_count == 2 && scrap_count == 1 && ore_count == 0, EWrongMaterials);
            (onerealm::equipment::type_weapon(), b"Ancient Halberd", onerealm::equipment::affix_raider(), 12, 3)
        } else {
            abort EInvalidRecipe
        };

        let rarity_sum = rarity_a + rarity_b + rarity_c;
        let rarity = if (rarity_sum >= 4) 2 else if (rarity_sum >= 2) 1 else 0;
        let power = 20 + value_a + value_b + value_c + (rarity as u64) * 4 + bonus_power;

        let eq = onerealm::equipment::create(eq_type, name, power, rarity, affix, ctx);
        onerealm::hero::grant_profession_xp(hero, xp_gain);
        one::transfer::public_transfer(eq, sender);
    }

    fun count_type(a: u8, b: u8, c: u8, expected: u8): u8 {
        let mut count = 0;
        if (a == expected) {
            count = count + 1;
        };
        if (b == expected) {
            count = count + 1;
        };
        if (c == expected) {
            count = count + 1;
        };
        count
    }

    public fun recipe_raider_blade(): u8 { RECIPE_RAIDER_BLADE }
    public fun recipe_forager_mail(): u8 { RECIPE_FORAGER_MAIL }
    public fun recipe_scholar_focus(): u8 { RECIPE_SCHOLAR_FOCUS }
    public fun recipe_miners_pickblade(): u8 { RECIPE_MINERS_PICKBLADE }
    public fun recipe_foragers_mantle(): u8 { RECIPE_FORAGERS_MANTLE }
    public fun recipe_smiths_sigil(): u8 { RECIPE_SMITHS_SIGIL }
    public fun recipe_relic_pike(): u8 { RECIPE_RELIC_PIKE }
    public fun recipe_miners_crownbreaker(): u8 { RECIPE_MINERS_CROWNBREAKER }
    public fun recipe_foragers_bulwark(): u8 { RECIPE_FORAGERS_BULWARK }
    public fun recipe_masterwork_matrix(): u8 { RECIPE_MASTERWORK_MATRIX }
    public fun recipe_ancient_halberd(): u8 { RECIPE_ANCIENT_HALBERD }
}
