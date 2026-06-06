#[test_only]
module suisyndicate::vault_tests {
    use sui::test_scenario::{Self};
    use sui::coin::{Self};
    use sui::sui::SUI;
    use sui::balance;
    use sui::table;
    use std::string;
    use suisyndicate::mock_dex::{Self, Pool};
    use suisyndicate::vault::{Self, Vault, CreatorCap, AgentCap};
    use suisyndicate::actions;

    #[test]
    fun test_flow() {
        let admin = @0xAD;
        let lp1 = @0x10;
        let agent = @0xAB;

        let mut scenario = test_scenario::begin(admin);

        // 1. Initialize Mock DEX
        mock_dex::init_for_testing(test_scenario::ctx(&mut scenario));

        test_scenario::next_tx(&mut scenario, admin);

        // 2. Deploy Vault
        let name = string::utf8(b"Syndicate Alpha");
        let (mut vault, creator_cap) = vault::create_vault(
            name,
            vector[1, 2, 3], // Strategy blob ID
            vector[4, 5, 6], // Metadata blob ID
            test_scenario::ctx(&mut scenario)
        );

        // 3. Perform SUI deposit
        test_scenario::next_tx(&mut scenario, lp1);
        let sui_coin = coin::mint_for_testing<SUI>(10_000_000_000, test_scenario::ctx(&mut scenario)); // 10 SUI
        let share1 = vault::deposit_sui(&mut vault, sui_coin, test_scenario::ctx(&mut scenario));

        assert!(vault::total_shares(&vault) == 10_000_000_000, 101);
        assert!(vault::sui_balance(&vault) == 10_000_000_000, 102);

        // 4. Issue AgentCap and execute swap
        test_scenario::next_tx(&mut scenario, admin);
        let mut agent_cap = vault::issue_agent_cap(
            &creator_cap,
            &vault,
            agent,
            5_000_000_000, // 5 SUI limit per tx
            10_000_000_000, // 10 SUI daily limit
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, agent);
        let mut pool = test_scenario::take_shared<Pool>(&scenario);

        // Swap 2 SUI to USDC
        actions::execute_swap_sui_to_usdc(
            &mut vault,
            &mut agent_cap,
            &mut pool,
            2_000_000_000, // 2 SUI
            3_000_000,     // 3 USDC min out
            test_scenario::ctx(&mut scenario)
        );

        assert!(vault::sui_balance(&vault) == 8_000_000_000, 103);
        assert!(vault::usdc_balance(&vault) == 4_000_000, 104); // 4 USDC (1 SUI = 2 USDC rate)

        // 5. LP Ragequit
        test_scenario::next_tx(&mut scenario, lp1);
        let (sui_payout, usdc_payout) = vault::ragequit(&mut vault, share1, test_scenario::ctx(&mut scenario));

        assert!(coin::value(&sui_payout) == 8_000_000_000, 105);
        assert!(coin::value(&usdc_payout) == 4_000_000, 106);

        coin::burn_for_testing(sui_payout);
        coin::burn_for_testing(usdc_payout);

        // 6. Cleanup
        test_scenario::return_shared(pool);
        vault::revoke_agent_cap(&creator_cap, &vault, &mut agent_cap);

        let CreatorCap { id: c_id, vault_id: _ } = creator_cap;
        object::delete(c_id);

        let AgentCap {
            id: a_id,
            vault_id: _,
            agent: _,
            spend_limit_per_tx: _,
            spend_limit_daily: _,
            spent_today: _,
            last_reset_epoch: _,
            cooldown_count: _,
            last_action_epoch: _,
            revoked: _
        } = agent_cap;
        object::delete(a_id);

        let Vault {
            id: v_id,
            creator: _,
            name: _,
            sui_balance,
            usdc_balance,
            total_shares: _,
            walrus_strategy_blob: _,
            walrus_metadata_blob: _,
            walrus_log_roots,
            lp_agreements,
            paused: _
        } = vault;

        object::delete(v_id);
        balance::destroy_for_testing(sui_balance);
        balance::destroy_for_testing(usdc_balance);
        table::destroy_empty(walrus_log_roots);
        table::destroy_empty(lp_agreements);

        test_scenario::end(scenario);
    }
}

