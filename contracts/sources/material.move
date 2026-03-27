module onerealm::material {
    const TYPE_ORE:   u8 = 0;
    const TYPE_SCRAP: u8 = 1;
    const TYPE_ESSENCE: u8 = 2;

    public struct Material has key, store {
        id:            one::object::UID,
        material_type: u8,
        name:          vector<u8>,
        rarity:        u8,
        value:         u64,
    }

    public(package) fun create(
        material_type: u8,
        name:          vector<u8>,
        rarity:        u8,
        value:         u64,
        ctx:           &mut one::tx_context::TxContext
    ): Material {
        Material {
            id: one::object::new(ctx),
            material_type,
            name,
            rarity,
            value,
        }
    }

    public(package) fun consume(material: Material): (u8, u8, u64) {
        let Material { id, material_type, name: _, rarity, value } = material;
        one::object::delete(id);
        (material_type, rarity, value)
    }

    public fun material_type(material: &Material): u8 { material.material_type }
    public fun name(material: &Material): vector<u8>  { material.name }
    public fun rarity(material: &Material): u8        { material.rarity }
    public fun value(material: &Material): u64        { material.value }

    public fun type_ore(): u8   { TYPE_ORE }
    public fun type_scrap(): u8 { TYPE_SCRAP }
    public fun type_essence(): u8 { TYPE_ESSENCE }
}
