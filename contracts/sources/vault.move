module suisyndicate::vault {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::event;
    use std::string::String;
    use suisyndicate::agent_cap::{Self, AgentCap};

    // ==================== ERROR CODES ====================
    const EPaused: u64 = 1;
    const EVaultIdMismatch: u64 = 2;
    const EZeroShares: u64 = 3;
    const EZeroAmount: u64 = 4;
    const EInsufficientBalance: u64 = 5;

    // ==================== OBJECTS ====================

    public struct Vault<phantom T> has key {
        id: UID,
        creator: address,
        name: String,
        sui_balance: Balance<SUI>,
        target_balance: Balance<T>,
        total_shares: u64,
        walrus_strategy_blob: vector<u8>,
        walrus_metadata_blob: vector<u8>,
        walrus_log_roots: Table<u64, vector<u8>>,
        lp_agreements: Table<address, vector<u8>>,
        paused: bool
    }

    public struct CreatorCap has key, store {
        id: UID,
        vault_id: ID
    }

    public struct SyndicateShare has key, store {
        id: UID,
        vault_id: ID,
        shares: u64
    }

    // ==================== EVENTS ====================

    public struct VaultCreated has copy, drop {
        vault_id: ID,
        creator: address,
        name: String
    }

    public struct Deposited has copy, drop {
        vault_id: ID,
        lp: address,
        amount: u64,
        is_sui: bool,
        shares_minted: u64
    }

    public struct Ragequit has copy, drop {
        vault_id: ID,
        lp: address,
        shares_burned: u64,
        sui_returned: u64,
        target_returned: u64
    }

    public struct LogAnchored has copy, drop {
        vault_id: ID,
        agent: address,
        epoch: u64,
        blob_id: vector<u8>
    }

    public struct LPAgreementAnchored has copy, drop {
        vault_id: ID,
        lp: address,
        blob_id: vector<u8>
    }

    // ==================== CONSTRUCTOR (PACKAGE ONLY) ====================

    public(package) fun create_vault<T>(
        name: String,
        strategy_blob: vector<u8>,
        metadata_blob: vector<u8>,
        ctx: &mut TxContext
    ): (Vault<T>, CreatorCap) {
        let vault_uid = object::new(ctx);
        let vault_id = object::uid_to_inner(&vault_uid);
        let creator = tx_context::sender(ctx);

        let vault = Vault<T> {
            id: vault_uid,
            creator,
            name,
            sui_balance: balance::zero(),
            target_balance: balance::zero(),
            total_shares: 0,
            walrus_strategy_blob: strategy_blob,
            walrus_metadata_blob: metadata_blob,
            walrus_log_roots: table::new(ctx),
            lp_agreements: table::new(ctx),
            paused: false
        };

        let creator_cap = CreatorCap {
            id: object::new(ctx),
            vault_id
        };

        event::emit(VaultCreated {
            vault_id,
            creator,
            name
        });

        (vault, creator_cap)
    }

    public(package) fun share_vault<T>(vault: Vault<T>) {
        transfer::share_object(vault)
    }

    // ==================== PUBLIC ENTRY FUNCTIONS ====================

    public fun deposit_sui<T>(
        vault: &mut Vault<T>,
        sui_coin: Coin<SUI>,
        ctx: &mut TxContext
    ): SyndicateShare {
        assert!(!vault.paused, EPaused);
        let amount = coin::value(&sui_coin);
        assert!(amount > 0, EZeroAmount);

        let vault_id = object::id(vault);
        let lp_address = tx_context::sender(ctx);

        let shares_to_mint = if (vault.total_shares == 0) {
            amount
        } else {
            let vault_sui_val = balance::value(&vault.sui_balance);
            if (vault_sui_val == 0) { amount } else {
                ((amount as u128) * (vault.total_shares as u128) / (vault_sui_val as u128) as u64)
            }
        };

        assert!(shares_to_mint > 0, EZeroShares);

        balance::join(&mut vault.sui_balance, coin::into_balance(sui_coin));
        vault.total_shares = vault.total_shares + shares_to_mint;

        event::emit(Deposited {
            vault_id,
            lp: lp_address,
            amount,
            is_sui: true,
            shares_minted: shares_to_mint
        });

        SyndicateShare {
            id: object::new(ctx),
            vault_id,
            shares: shares_to_mint
        }
    }

    public fun deposit_target<T>(
        vault: &mut Vault<T>,
        target_coin: Coin<T>,
        ctx: &mut TxContext
    ): SyndicateShare {
        assert!(!vault.paused, EPaused);
        let amount = coin::value(&target_coin);
        assert!(amount > 0, EZeroAmount);

        let vault_id = object::id(vault);
        let lp_address = tx_context::sender(ctx);

        let shares_to_mint = if (vault.total_shares == 0) {
            amount
        } else {
            let vault_target_val = balance::value(&vault.target_balance);
            if (vault_target_val == 0) { amount } else {
                ((amount as u128) * (vault.total_shares as u128) / (vault_target_val as u128) as u64)
            }
        };

        assert!(shares_to_mint > 0, EZeroShares);

        balance::join(&mut vault.target_balance, coin::into_balance(target_coin));
        vault.total_shares = vault.total_shares + shares_to_mint;

        event::emit(Deposited {
            vault_id,
            lp: lp_address,
            amount,
            is_sui: false,
            shares_minted: shares_to_mint
        });

        SyndicateShare {
            id: object::new(ctx),
            vault_id,
            shares: shares_to_mint
        }
    }

    public fun ragequit<T>(
        vault: &mut Vault<T>,
        share_obj: SyndicateShare,
        ctx: &mut TxContext
    ): (Coin<SUI>, Coin<T>) {
        let vault_id = object::id(vault);
        let SyndicateShare { id, vault_id: share_vault_id, shares } = share_obj;
        object::delete(id);

        assert!(share_vault_id == vault_id, EVaultIdMismatch);
        assert!(shares > 0, EZeroShares);

        let total_shares = vault.total_shares;
        let sui_amount = ((balance::value(&vault.sui_balance) as u128) * (shares as u128) / (total_shares as u128) as u64);
        let target_amount = ((balance::value(&vault.target_balance) as u128) * (shares as u128) / (total_shares as u128) as u64);

        vault.total_shares = total_shares - shares;

        let sui_payout = coin::from_balance(balance::split(&mut vault.sui_balance, sui_amount), ctx);
        let target_payout = coin::from_balance(balance::split(&mut vault.target_balance, target_amount), ctx);

        event::emit(Ragequit {
            vault_id,
            lp: tx_context::sender(ctx),
            shares_burned: shares,
            sui_returned: sui_amount,
            target_returned: target_amount
        });

        (sui_payout, target_payout)
    }

    public fun anchor_lp_agreement<T>(
        vault: &mut Vault<T>,
        blob_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let lp_address = tx_context::sender(ctx);
        if (table::contains(&vault.lp_agreements, lp_address)) {
            table::remove(&mut vault.lp_agreements, lp_address);
        };
        table::add(&mut vault.lp_agreements, lp_address, blob_id);

        event::emit(LPAgreementAnchored {
            vault_id: object::id(vault),
            lp: lp_address,
            blob_id
        });
    }

    public fun anchor_log<T>(
        vault: &mut Vault<T>,
        cap: &AgentCap,
        epoch: u64,
        blob_id: vector<u8>
    ) {
        assert!(agent_cap::vault_id(cap) == object::id(vault), EVaultIdMismatch);
        assert!(!agent_cap::revoked(cap), EPaused);

        if (table::contains(&vault.walrus_log_roots, epoch)) {
            table::remove(&mut vault.walrus_log_roots, epoch);
        };
        table::add(&mut vault.walrus_log_roots, epoch, blob_id);

        event::emit(LogAnchored {
            vault_id: object::id(vault),
            agent: agent_cap::agent(cap),
            epoch,
            blob_id
        });
    }

    // ==================== CREATOR ADMIN FUNCTIONS ====================

    public fun issue_agent_cap<T>(
        _creator_cap: &CreatorCap,
        vault: &Vault<T>,
        agent: address,
        spend_limit_per_tx: u64,
        spend_limit_daily: u64,
        ctx: &mut TxContext
    ): AgentCap {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        agent_cap::create_cap(
            object::id(vault),
            agent,
            spend_limit_per_tx,
            spend_limit_daily,
            ctx
        )
    }

    public fun update_agent_limits<T>(
        _creator_cap: &CreatorCap,
        vault: &Vault<T>,
        cap: &mut AgentCap,
        spend_limit_per_tx: u64,
        spend_limit_daily: u64
    ) {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        assert!(agent_cap::vault_id(cap) == object::id(vault), EVaultIdMismatch);
        agent_cap::set_limits(cap, spend_limit_per_tx, spend_limit_daily);
    }

    public fun revoke_agent_cap<T>(
        _creator_cap: &CreatorCap,
        vault: &Vault<T>,
        cap: &mut AgentCap
    ) {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        assert!(agent_cap::vault_id(cap) == object::id(vault), EVaultIdMismatch);
        agent_cap::set_revoked(cap, true);
    }

    public fun pause<T>(
        _creator_cap: &CreatorCap,
        vault: &mut Vault<T>
    ) {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        vault.paused = true;
    }

    public fun unpause<T>(
        _creator_cap: &CreatorCap,
        vault: &mut Vault<T>
    ) {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        vault.paused = false;
    }

    // ==================== INTERNAL/PACKAGE EXECUTION INTERFACES ====================

    public(package) fun borrow_sui<T>(
        vault: &mut Vault<T>,
        cap: &mut AgentCap,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<SUI> {
        assert!(!vault.paused, EPaused);
        assert!(balance::value(&vault.sui_balance) >= amount, EInsufficientBalance);

        agent_cap::verify_and_update_limits(cap, object::id(vault), amount, ctx);

        coin::from_balance(balance::split(&mut vault.sui_balance, amount), ctx)
    }

    public(package) fun borrow_target<T>(
        vault: &mut Vault<T>,
        cap: &mut AgentCap,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<T> {
        assert!(!vault.paused, EPaused);
        assert!(balance::value(&vault.target_balance) >= amount, EInsufficientBalance);

        agent_cap::verify_and_update_limits(cap, object::id(vault), amount, ctx);

        coin::from_balance(balance::split(&mut vault.target_balance, amount), ctx)
    }

    public(package) fun return_sui<T>(
        vault: &mut Vault<T>,
        coin: Coin<SUI>
    ) {
        balance::join(&mut vault.sui_balance, coin::into_balance(coin));
    }

    public(package) fun return_target<T>(
        vault: &mut Vault<T>,
        coin: Coin<T>
    ) {
        balance::join(&mut vault.target_balance, coin::into_balance(coin));
    }

    // ==================== PUBLIC VIEWS ====================

    public fun sui_balance<T>(vault: &Vault<T>): u64 { balance::value(&vault.sui_balance) }
    public fun target_balance<T>(vault: &Vault<T>): u64 { balance::value(&vault.target_balance) }
    public fun total_shares<T>(vault: &Vault<T>): u64 { vault.total_shares }
    public fun paused<T>(vault: &Vault<T>): bool { vault.paused }
    public fun name<T>(vault: &Vault<T>): String { vault.name }

    // ==================== SHARE SPLIT/JOIN (Sui-Native share coin support) ====================

    public fun split_share(share: &mut SyndicateShare, amount: u64, ctx: &mut TxContext): SyndicateShare {
        assert!(share.shares > amount, EZeroShares);
        share.shares = share.shares - amount;
        SyndicateShare {
            id: object::new(ctx),
            vault_id: share.vault_id,
            shares: amount
        }
    }

    public fun join_share(share: &mut SyndicateShare, other: SyndicateShare) {
        let SyndicateShare { id, vault_id, shares } = other;
        assert!(share.vault_id == vault_id, EVaultIdMismatch);
        share.shares = share.shares + shares;
        object::delete(id);
    }

    public fun share_value(share: &SyndicateShare): u64 {
        share.shares
    }
}
