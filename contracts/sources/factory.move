module suisyndicate::factory {
    use std::string::String;
    use suisyndicate::vault::{Self, CreatorCap};

    public struct Factory has key {
        id: UID,
        vaults: vector<ID>
    }

    fun init(ctx: &mut TxContext) {
        let factory = Factory {
            id: object::new(ctx),
            vaults: vector[]
        };
        transfer::share_object(factory);
    }

    public fun create_vault<A, B>(
        factory: &mut Factory,
        name: String,
        strategy_blob: vector<u8>,
        metadata_blob: vector<u8>,
        ctx: &mut TxContext
    ): CreatorCap {
        let (vault, creator_cap) = vault::create_vault<A, B>(name, strategy_blob, metadata_blob, ctx);
        let vault_id = object::id(&vault);

        vector::push_back(&mut factory.vaults, vault_id);

        vault::share_vault(vault);

        creator_cap
    }

    // Public getters
    public fun get_vaults(factory: &Factory): vector<ID> {
        factory.vaults
    }

    public fun get_vault_count(factory: &Factory): u64 {
        vector::length(&factory.vaults)
    }
}
