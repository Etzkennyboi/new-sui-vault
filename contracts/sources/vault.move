module suisyndicate::vault {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
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

    public struct Vault<phantom A, phantom B> has key {
        id: UID,
        creator: address,
        name: String,
        balance_a: Balance<A>,
        balance_b: Balance<B>,
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
        is_asset_a: bool,
        shares_minted: u64
    }

    public struct Ragequit has copy, drop {
        vault_id: ID,
        lp: address,
        shares_burned: u64,
        amount_a_returned: u64,
        amount_b_returned: u64
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

    public(package) fun create_vault<A, B>(
        name: String,
        strategy_blob: vector<u8>,
        metadata_blob: vector<u8>,
        ctx: &mut TxContext
    ): (Vault<A, B>, CreatorCap) {
        let vault_uid = object::new(ctx);
        let vault_id = object::uid_to_inner(&vault_uid);
        let creator = tx_context::sender(ctx);

        let vault = Vault<A, B> {
            id: vault_uid,
            creator,
            name,
            balance_a: balance::zero(),
            balance_b: balance::zero(),
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

    public(package) fun share_vault<A, B>(vault: Vault<A, B>) {
        transfer::share_object(vault)
    }

    // ==================== PUBLIC ENTRY FUNCTIONS ====================

    public fun deposit_a<A, B>(
        vault: &mut Vault<A, B>,
        coin_a: Coin<A>,
        ctx: &mut TxContext
    ): SyndicateShare {
        assert!(!vault.paused, EPaused);
        let amount = coin::value(&coin_a);
        assert!(amount > 0, EZeroAmount);

        let vault_id = object::id(vault);
        let lp_address = tx_context::sender(ctx);

        let shares_to_mint = if (vault.total_shares == 0) {
            amount
        } else {
            let vault_a_val = balance::value(&vault.balance_a);
            if (vault_a_val == 0) { amount } else {
                ((amount as u128) * (vault.total_shares as u128) / (vault_a_val as u128) as u64)
            }
        };

        assert!(shares_to_mint > 0, EZeroShares);

        balance::join(&mut vault.balance_a, coin::into_balance(coin_a));
        vault.total_shares = vault.total_shares + shares_to_mint;

        event::emit(Deposited {
            vault_id,
            lp: lp_address,
            amount,
            is_asset_a: true,
            shares_minted: shares_to_mint
        });

        SyndicateShare {
            id: object::new(ctx),
            vault_id,
            shares: shares_to_mint
        }
    }

    public fun deposit_b<A, B>(
        vault: &mut Vault<A, B>,
        coin_b: Coin<B>,
        ctx: &mut TxContext
    ): SyndicateShare {
        assert!(!vault.paused, EPaused);
        let amount = coin::value(&coin_b);
        assert!(amount > 0, EZeroAmount);

        let vault_id = object::id(vault);
        let lp_address = tx_context::sender(ctx);

        let shares_to_mint = if (vault.total_shares == 0) {
            amount
        } else {
            let vault_b_val = balance::value(&vault.balance_b);
            if (vault_b_val == 0) { amount } else {
                ((amount as u128) * (vault.total_shares as u128) / (vault_b_val as u128) as u64)
            }
        };

        assert!(shares_to_mint > 0, EZeroShares);

        balance::join(&mut vault.balance_b, coin::into_balance(coin_b));
        vault.total_shares = vault.total_shares + shares_to_mint;

        event::emit(Deposited {
            vault_id,
            lp: lp_address,
            amount,
            is_asset_a: false,
            shares_minted: shares_to_mint
        });

        SyndicateShare {
            id: object::new(ctx),
            vault_id,
            shares: shares_to_mint
        }
    }

    public fun ragequit<A, B>(
        vault: &mut Vault<A, B>,
        share_obj: SyndicateShare,
        ctx: &mut TxContext
    ): (Coin<A>, Coin<B>) {
        let vault_id = object::id(vault);
        let SyndicateShare { id, vault_id: share_vault_id, shares } = share_obj;
        object::delete(id);

        assert!(share_vault_id == vault_id, EVaultIdMismatch);
        assert!(shares > 0, EZeroShares);

        let total_shares = vault.total_shares;
        let amount_a = ((balance::value(&vault.balance_a) as u128) * (shares as u128) / (total_shares as u128) as u64);
        let amount_b = ((balance::value(&vault.balance_b) as u128) * (shares as u128) / (total_shares as u128) as u64);

        vault.total_shares = total_shares - shares;

        let payout_a = coin::from_balance(balance::split(&mut vault.balance_a, amount_a), ctx);
        let payout_b = coin::from_balance(balance::split(&mut vault.balance_b, amount_b), ctx);

        event::emit(Ragequit {
            vault_id,
            lp: tx_context::sender(ctx),
            shares_burned: shares,
            amount_a_returned: amount_a,
            amount_b_returned: amount_b
        });

        (payout_a, payout_b)
    }

    public fun anchor_lp_agreement<A, B>(
        vault: &mut Vault<A, B>,
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

    public fun anchor_log<A, B>(
        vault: &mut Vault<A, B>,
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

    public fun issue_agent_cap<A, B>(
        _creator_cap: &CreatorCap,
        vault: &Vault<A, B>,
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

    public fun update_agent_limits<A, B>(
        _creator_cap: &CreatorCap,
        vault: &Vault<A, B>,
        cap: &mut AgentCap,
        spend_limit_per_tx: u64,
        spend_limit_daily: u64
    ) {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        assert!(agent_cap::vault_id(cap) == object::id(vault), EVaultIdMismatch);
        agent_cap::set_limits(cap, spend_limit_per_tx, spend_limit_daily);
    }

    public fun revoke_agent_cap<A, B>(
        _creator_cap: &CreatorCap,
        vault: &Vault<A, B>,
        cap: &mut AgentCap
    ) {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        assert!(agent_cap::vault_id(cap) == object::id(vault), EVaultIdMismatch);
        agent_cap::set_revoked(cap, true);
    }

    public fun pause<A, B>(
        _creator_cap: &CreatorCap,
        vault: &mut Vault<A, B>
    ) {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        vault.paused = true;
    }

    public fun unpause<A, B>(
        _creator_cap: &CreatorCap,
        vault: &mut Vault<A, B>
    ) {
        assert!(_creator_cap.vault_id == object::id(vault), EVaultIdMismatch);
        vault.paused = false;
    }

    // ==================== INTERNAL/PACKAGE EXECUTION INTERFACES ====================

    public(package) fun borrow_a<A, B>(
        vault: &mut Vault<A, B>,
        cap: &mut AgentCap,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<A> {
        assert!(!vault.paused, EPaused);
        assert!(balance::value(&vault.balance_a) >= amount, EInsufficientBalance);

        agent_cap::verify_and_update_limits(cap, object::id(vault), amount, ctx);

        coin::from_balance(balance::split(&mut vault.balance_a, amount), ctx)
    }

    public(package) fun borrow_b<A, B>(
        vault: &mut Vault<A, B>,
        cap: &mut AgentCap,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<B> {
        assert!(!vault.paused, EPaused);
        assert!(balance::value(&vault.balance_b) >= amount, EInsufficientBalance);

        agent_cap::verify_and_update_limits(cap, object::id(vault), amount, ctx);

        coin::from_balance(balance::split(&mut vault.balance_b, amount), ctx)
    }

    public(package) fun return_a<A, B>(
        vault: &mut Vault<A, B>,
        coin: Coin<A>
    ) {
        balance::join(&mut vault.balance_a, coin::into_balance(coin));
    }

    public(package) fun return_b<A, B>(
        vault: &mut Vault<A, B>,
        coin: Coin<B>
    ) {
        balance::join(&mut vault.balance_b, coin::into_balance(coin));
    }

    // ==================== PUBLIC VIEWS ====================

    public fun balance_a<A, B>(vault: &Vault<A, B>): u64 { balance::value(&vault.balance_a) }
    public fun balance_b<A, B>(vault: &Vault<A, B>): u64 { balance::value(&vault.balance_b) }
    public fun total_shares<A, B>(vault: &Vault<A, B>): u64 { vault.total_shares }
    public fun paused<A, B>(vault: &Vault<A, B>): bool { vault.paused }
    public fun name<A, B>(vault: &Vault<A, B>): String { vault.name }

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
