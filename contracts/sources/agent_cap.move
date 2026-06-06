module suisyndicate::agent_cap {
    public struct AgentCap has key, store {
        id: UID,
        vault_id: ID,
        agent: address,
        spend_limit_per_tx: u64,
        spend_limit_daily: u64,
        spent_today: u64,
        last_reset_epoch: u64,
        cooldown_count: u64,
        last_action_epoch: u64,
        revoked: bool
    }

    public(package) fun create_cap(
        vault_id: ID,
        agent: address,
        spend_limit_per_tx: u64,
        spend_limit_daily: u64,
        ctx: &mut TxContext
    ): AgentCap {
        AgentCap {
            id: object::new(ctx),
            vault_id,
            agent,
            spend_limit_per_tx,
            spend_limit_daily,
            spent_today: 0,
            last_reset_epoch: tx_context::epoch(ctx),
            cooldown_count: 0,
            last_action_epoch: tx_context::epoch(ctx),
            revoked: false
        }
    }

    public(package) fun set_limits(
        cap: &mut AgentCap,
        spend_limit_per_tx: u64,
        spend_limit_daily: u64
    ) {
        cap.spend_limit_per_tx = spend_limit_per_tx;
        cap.spend_limit_daily = spend_limit_daily;
    }

    public(package) fun set_revoked(cap: &mut AgentCap, revoked: bool) {
        cap.revoked = revoked;
    }

    public fun verify_and_update_limits(
        cap: &mut AgentCap,
        vault_id: ID,
        amount: u64,
        ctx: &TxContext
    ) {
        assert!(!cap.revoked, 1);
        assert!(cap.vault_id == vault_id, 2);
        assert!(cap.agent == tx_context::sender(ctx), 3);
        assert!(amount <= cap.spend_limit_per_tx, 4);

        let current_epoch = tx_context::epoch(ctx);

        // Cooldown and rate limits: max 10 actions per epoch
        if (cap.last_action_epoch < current_epoch) {
            cap.cooldown_count = 0;
            cap.last_action_epoch = current_epoch;
        };
        assert!(cap.cooldown_count < 10, 5);
        cap.cooldown_count = cap.cooldown_count + 1;

        // Daily limit reset check based on epoch
        if (cap.last_reset_epoch < current_epoch) {
            cap.spent_today = 0;
            cap.last_reset_epoch = current_epoch;
        };

        assert!(cap.spent_today + amount <= cap.spend_limit_daily, 6);
        cap.spent_today = cap.spent_today + amount;
    }

    // Public getters
    public fun vault_id(cap: &AgentCap): ID { cap.vault_id }
    public fun agent(cap: &AgentCap): address { cap.agent }
    public fun spend_limit_per_tx(cap: &AgentCap): u64 { cap.spend_limit_per_tx }
    public fun spend_limit_daily(cap: &AgentCap): u64 { cap.spend_limit_daily }
    public fun spent_today(cap: &AgentCap): u64 { cap.spent_today }
    public fun last_reset_epoch(cap: &AgentCap): u64 { cap.last_reset_epoch }
    public fun revoked(cap: &AgentCap): bool { cap.revoked }
}

