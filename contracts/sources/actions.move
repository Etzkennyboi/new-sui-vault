module suisyndicate::actions {
    use sui::coin::{Coin};
    use suisyndicate::vault::{Self, Vault};
    use suisyndicate::agent_cap::AgentCap;

    // ==================== ERROR CODES ====================
    const EVaultIdMismatch: u64 = 1;
    const EAssetTypeMismatch: u64 = 2;

    // ==================== OBJECTS ====================

    /// Hot potato struct with no abilities, enforcing that an initiated swap
    /// must be resolved (by depositing the destination asset back) before the transaction ends.
    public struct SwapReceipt {
        vault_id: ID,
        borrowed_amount: u64,
        is_asset_a: bool
    }

    // ==================== FLASH SWAP RECEIPTS ====================

    public fun initiate_swap_a<A, B>(
        vault: &mut Vault<A, B>,
        cap: &mut AgentCap,
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<A>, SwapReceipt) {
        let coin = vault::borrow_a(vault, cap, amount, ctx);
        let receipt = SwapReceipt {
            vault_id: object::id(vault),
            borrowed_amount: amount,
            is_asset_a: true
        };
        (coin, receipt)
    }

    public fun resolve_swap_a<A, B>(
        vault: &mut Vault<A, B>,
        receipt: SwapReceipt,
        coin_b: Coin<B>
    ) {
        let SwapReceipt { vault_id, borrowed_amount: _, is_asset_a } = receipt;
        assert!(vault_id == object::id(vault), EVaultIdMismatch);
        assert!(is_asset_a, EAssetTypeMismatch);
        vault::return_b(vault, coin_b);
    }

    public fun initiate_swap_b<A, B>(
        vault: &mut Vault<A, B>,
        cap: &mut AgentCap,
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<B>, SwapReceipt) {
        let coin = vault::borrow_b(vault, cap, amount, ctx);
        let receipt = SwapReceipt {
            vault_id: object::id(vault),
            borrowed_amount: amount,
            is_asset_a: false
        };
        (coin, receipt)
    }

    public fun resolve_swap_b<A, B>(
        vault: &mut Vault<A, B>,
        receipt: SwapReceipt,
        coin_a: Coin<A>
    ) {
        let SwapReceipt { vault_id, borrowed_amount: _, is_asset_a } = receipt;
        assert!(vault_id == object::id(vault), EVaultIdMismatch);
        assert!(!is_asset_a, EAssetTypeMismatch);
        vault::return_a(vault, coin_a);
    }
}
