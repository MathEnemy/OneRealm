// loot.move — OneRealm v2.0
// ADR-002: generate_loot PHẢI là `entry fun` — KHÔNG là `public fun`
// Move 2024: no duplicate use aliases

module onerealm::loot {
    use onerealm::mission::MissionSession;

    const LOOT_COMMON_MAX_ROLL: u8 = 59;
    const LOOT_RARE_MAX_ROLL:   u8 = 89;

    /// Entry fun — Tx1 TERMINAL (ADR-002)
    /// PHẢI submit standalone — KHÔNG chain thêm lệnh nào sau Random MoveCall
    entry fun generate_loot(
        r:       &sui::random::Random,
        session: &mut MissionSession,
        ctx:     &mut sui::tx_context::TxContext
    ) {
        let mut gen = sui::random::new_generator(r, ctx);
        let loot_count = sui::random::generate_u8_in_range(&mut gen, 1, 3);

        let mut i: u8 = 0;
        while (i < loot_count) {
            let roll = sui::random::generate_u8_in_range(&mut gen, 0, 99);
            let tier: u8 = if (roll <= LOOT_COMMON_MAX_ROLL) {
                0 // COMMON (60%)
            } else if (roll <= LOOT_RARE_MAX_ROLL) {
                1 // RARE (30%)
            } else {
                2 // LEGENDARY (10%)
            };

            let loot_type = sui::random::generate_u8_in_range(&mut gen, 0, 1);
            onerealm::mission::add_loot(session, tier, loot_type);
            i = i + 1;
        };
    }
}
