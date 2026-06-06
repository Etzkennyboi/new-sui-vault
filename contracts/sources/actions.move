module suisyndicate::actions {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
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
        is_sui: bool
    }

    // ==================== FLASH SWAP RECEIPTS ====================

    public fun initiate_swap_sui<T>(
        vault: &mut Vault<T>,
        cap: &mut AgentCap,
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<SUI>, SwapReceipt) {
        let coin = vault::borrow_sui(vault, cap, amount, ctx);
        let receipt = SwapReceipt {
            vault_id: object::id(vault),
            borrowed_amount: amount,
            is_sui: true
        };
        (coin, receipt)
    }

    public fun resolve_swap_sui<T>(
        vault: &mut Vault<T>,
        receipt: SwapReceipt,
        target_coin: Coin<T>
    ) {
        let SwapReceipt { vault_id, borrowed_amount: _, is_sui } = receipt;
        assert!(vault_id == object::id(vault), EVaultIdMismatch);
        assert!(is_sui, EAssetTypeMismatch);
        vault::return_target(vault, target_coin);
    }

    public fun initiate_swap_target<T>(
        vault: &mut Vault<T>,
        cap: &mut AgentCap,
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<T>, SwapReceipt) {
        let coin = vault::borrow_target(vault, cap, amount, ctx);
        let receipt = SwapReceipt {
            vault_id: object::id(vault),
            borrowed_amount: amount,
            is_sui: false
        };
        (coin, receipt)
    }

    public fun resolve_swap_target<T>(
        vault: &mut Vault<T>,
        receipt: SwapReceipt,
        sui_coin: Coin<SUI>
    ) {
        let SwapReceipt { vault_id, borrowed_amount: _, is_sui } = receipt;
        assert!(vault_id == object::id(vault), EVaultIdMismatch);
        assert!(!is_sui, EAssetTypeMismatch);
        vault::return_sui(vault, sui_coin);
    }
}
