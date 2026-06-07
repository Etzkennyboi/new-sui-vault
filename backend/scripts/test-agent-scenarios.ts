import * as dotenv from 'dotenv';
import * as path from 'path';
import { SuiSyndicateClient } from '../../sdk/src/client';
import { WalrusClient } from '../../sdk/src/walrus';
import { createTatumClient } from '../../sdk/src/tatum';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const SUI_MAINNET_RPC = process.env.SUI_MAINNET_RPC || 'https://fullnode.mainnet.sui.io:443';
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '';
const FACTORY_ID = process.env.FACTORY_OBJECT_ID || '';
const TARGET_COIN_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'; // Native USDC
const CETUS_POOL_ID = process.env.CETUS_POOL_ID || '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105';
const CETUS_GLOBAL_CONFIG_ID = process.env.CETUS_GLOBAL_CONFIG_ID || '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function queryDeepSeek(strategy: any, vaultState: any, liveExchangeRate: number): Promise<any> {
  console.log(`\n🤖 Asking DeepSeek AI... (Strategy: ${strategy.strategy_type} | SUI Bal: ${vaultState.suiBalance / 1e9}, USDC Bal: ${vaultState.usdcBalance / 1e6} | Price: $${liveExchangeRate.toFixed(4)})`);
  
  const systemPromptBase = `You are the core intelligence of SuiSyndicate.
Analyze the current portfolio state against the assigned strategy and decide if a trade is required.
You must reply ONLY with a raw JSON block containing these fields:
- should_rebalance (boolean)
- action ("swap_sui_to_usdc", "swap_usdc_to_sui", or "none")
- amount_mist (number, the SUI/USDC amount to trade, represented in smallest decimals: SUI is 9 decimals, USDC is 6 decimals)
- reasoning (string, short 1-2 sentence description of your trade reasoning)
Do not output any markdown blocks or extra text.`;

  let userPrompt = `Portfolio State:
- SUI Balance: ${vaultState.suiBalance} MIST (decimals: 9)
- USDC Balance: ${vaultState.usdcBalance} units (decimals: 6)
- Exchange Rate: 1 SUI = ${liveExchangeRate.toFixed(4)} USDC
`;

  if (strategy.strategy_type === 'target_allocation') {
    userPrompt += `
Strategy: Target Allocation Rebalancing
- Target SUI Allocation: ${strategy.parameters.target_allocation_sui_pct}%
- Target USDC Allocation: ${strategy.parameters.target_allocation_usdc_pct}%

Rule: If one asset dominates by more than ${strategy.parameters.ai_rebalance_trigger_threshold_pct}% over its target allocation, trigger should_rebalance = true and compute the exact amount_mist swap required to restore the target percentages.`;
  } else if (strategy.strategy_type === 'grid_harvesting') {
    const lastPrice = strategy.parameters.last_trade_price || 2.0;
    const priceChange = liveExchangeRate - lastPrice;
    const direction = priceChange > 0 ? "ROSE (UP)" : priceChange < 0 ? "FELL (DOWN)" : "NO CHANGE";
    const percentChange = Math.abs(priceChange) / lastPrice * 100;

    userPrompt += `
Strategy: Grid Volatility Harvesting
- Grid Upper Bound: $${strategy.parameters.grid_upper_bound}
- Grid Lower Bound: $${strategy.parameters.grid_lower_bound}
- Number of Grid Steps: ${strategy.parameters.grid_steps}
- Last Trade Price: $${lastPrice}
- Current SUI Price has ${direction} relative to Last Trade Price by ${percentChange.toFixed(2)}%.

Rule: Since the price has ${direction}, you must execute:
- If SUI price FELL (DOWN), swap USDC to SUI (action: swap_usdc_to_sui) to buy the dip.
- If SUI price ROSE (UP), swap SUI to USDC (action: swap_sui_to_usdc) to take profits.`;
  } else if (strategy.strategy_type === 'momentum_trend') {
    const historicalPrice = strategy.parameters.historical_price || liveExchangeRate;
    const priceReturn = (liveExchangeRate - historicalPrice) / historicalPrice * 100;
    const direction = priceReturn > 0 ? "BULLISH (UPTREND)" : priceReturn < 0 ? "BEARISH (DOWNTREND)" : "NEUTRAL";
    const threshold = strategy.parameters.momentum_threshold_pct;
    
    let targetSuiPct = 50;
    if (priceReturn > threshold) {
      targetSuiPct = strategy.parameters.sui_allocation_uptrend_pct;
    } else if (priceReturn < -threshold) {
      targetSuiPct = strategy.parameters.sui_allocation_downtrend_pct;
    }

    userPrompt += `
Strategy: Momentum Trend Follower
- Momentum Period: ${strategy.parameters.momentum_period_hours} hours
- Momentum Threshold: ${threshold}%
- Uptrend SUI Allocation: ${strategy.parameters.sui_allocation_uptrend_pct}%
- Downtrend SUI Allocation: ${strategy.parameters.sui_allocation_downtrend_pct}%
- Historical Price: $${historicalPrice}
- Current SUI Return over period is ${priceReturn.toFixed(2)}% which indicates a ${direction}.
- The target SUI allocation based on this trend is ${targetSuiPct}%.

Rule: Compare current SUI allocation with target SUI allocation (${targetSuiPct}%) and execute swap to align them.`;
  }

  const response = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-ai/deepseek-v4-flash',
      messages: [{ role: 'system', content: systemPromptBase }, { role: 'user', content: userPrompt }],
      temperature: 0.1,
    }),
  });
  
  if (!response.ok) throw new Error('Failed to reach DeepSeek');
  const result = await response.json();
  let text = result.choices[0]?.message?.content || '{}';
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(text);
}

async function runScenarios() {
  console.log('--- SuiSyndicate: Agent Strategy Scenarios Test ---');

  if (!PRIVATE_KEY || !DEEPSEEK_API_KEY) {
    console.error('Error: PRIVATE_KEY and DEEPSEEK_API_KEY must be configured.');
    process.exit(1);
  }

  const { SuiJsonRpcClient } = await import('@mysten/sui/jsonRpc');
  const suiClient = createTatumClient({ apiKey: TATUM_API_KEY, rpcUrl: SUI_MAINNET_RPC });
  
  // Mock Walrus for script runner
  const walrusClient = new WalrusClient('', '');
  walrusClient.storeBlob = async () => 'mock_blob_id_for_testing_' + Date.now();

  const sdk = new SuiSyndicateClient(suiClient as any, walrusClient, {
    packageId: PACKAGE_ID,
    factoryId: FACTORY_ID,
    coinTypeA: '0x2702b6cae761cd63ac87522d7011d7d0b3677e9684980e4438403a67a3d8f24f::ssui::SSUI',
    coinTypeB: '0x2702b6cae761cd63ac87522d7011d7d0b3677e9684980e4438403a67a3d8f24f::susdc::SUSDC',
  });

  const signer = SuiSyndicateClient.getKeypairFromPrivateKey(PRIVATE_KEY);
  const senderAddress = signer.getPublicKey().toSuiAddress();
  
  const strategyTargetAllocation = {
    strategy_type: 'target_allocation',
    parameters: { target_allocation_sui_pct: 50, target_allocation_usdc_pct: 50, ai_rebalance_trigger_threshold_pct: 2 }
  };

  const strategyGrid = {
    strategy_type: 'grid_harvesting',
    parameters: { grid_upper_bound: 3.5, grid_lower_bound: 1.5, grid_steps: 5, last_trade_price: 2.0 }
  };

  const strategyMomentum = {
    strategy_type: 'momentum_trend',
    parameters: { momentum_period_hours: 24, momentum_threshold_pct: 5, sui_allocation_uptrend_pct: 80, sui_allocation_downtrend_pct: 20, historical_price: 2.0 }
  };

  // 1. Setup
  console.log('[1/5] Deploying temporary Vault for testing scenarios...');
  const { vaultId, creatorCapId } = await sdk.createVault(signer, 'Scenario test vault', strategyTargetAllocation, {});
  const agentCapId = await sdk.issueAgentCap(signer, creatorCapId, vaultId, senderAddress, 1e11, 1e12);
  console.log(`✅ Temporary Vault ID: ${vaultId}`);
  console.log(`✅ Issued AgentCap ID: ${agentCapId}`);

  console.log('\n[2/5] Depositing 0.02 SUI to seed liquidity...');
  const shareObjectId = await sdk.depositSui(signer, vaultId, 0.02 * 1e9);
  console.log(`✅ Deposited! Share Object ID: ${shareObjectId}`);

  // SCENARIO 1: Target Allocation (SUI Over-allocated)
  console.log('\n--- SCENARIO 1: Target Allocation (SUI Over-allocated) ---');
  const mockState1 = { suiBalance: 0.02 * 1e9, usdcBalance: 0 };
  const decision1 = await queryDeepSeek(strategyTargetAllocation, mockState1, 2.0);
  console.log(`DeepSeek Output: should_rebalance=${decision1.should_rebalance}, action=${decision1.action}, amount=${decision1.amount_mist}`);
  console.log(`Reasoning: ${decision1.reasoning}`);
  
  if (decision1.should_rebalance && decision1.action === 'swap_sui_to_usdc') {
    const safeAmountSui = Math.min(decision1.amount_mist, 0.005 * 1e9); // Limit amount to 0.005 SUI to save gas/slippage
    console.log(`Executing real SUI -> USDC swap for ${safeAmountSui / 1e9} SUI on Cetus Mainnet...`);
    const tx = await sdk.executeSwapCetus(signer, vaultId, agentCapId, safeAmountSui, 0, CETUS_POOL_ID, CETUS_GLOBAL_CONFIG_ID);
    console.log(`✅ Cetus SUI -> USDC Swap Successful! Tx Digest: ${tx}`);
  } else {
    console.warn('⚠️ DeepSeek did not recommend SUI -> USDC rebalance. Skipping contract call.');
  }

  // SCENARIO 2: Target Allocation (USDC Over-allocated)
  console.log('\n--- SCENARIO 2: Target Allocation (USDC Over-allocated) ---');
  // Check our actual USDC balance in the vault
  let actualState = await sdk.getVaultState(vaultId);
  console.log(`Vault balances: SUI: ${actualState.suiBalance / 1e9}, USDC: ${actualState.usdcBalance / 1e6}`);
  const mockState2 = { suiBalance: 0, usdcBalance: actualState.usdcBalance };
  
  if (actualState.usdcBalance > 0) {
    const decision2 = await queryDeepSeek(strategyTargetAllocation, mockState2, 2.0);
    console.log(`DeepSeek Output: should_rebalance=${decision2.should_rebalance}, action=${decision2.action}, amount=${decision2.amount_mist}`);
    console.log(`Reasoning: ${decision2.reasoning}`);
    
    if (decision2.should_rebalance && decision2.action === 'swap_usdc_to_sui') {
      const safeAmountUsdc = Math.min(decision2.amount_mist, actualState.usdcBalance);
      console.log(`Executing real USDC -> SUI swap for ${safeAmountUsdc / 1e6} USDC on Cetus...`);
      const tx = await sdk.executeSwapUsdcToSuiCetus(signer, vaultId, agentCapId, safeAmountUsdc, 0, CETUS_POOL_ID, CETUS_GLOBAL_CONFIG_ID);
      console.log(`✅ Cetus USDC -> SUI Swap Successful! Tx Digest: ${tx}`);
    } else {
      console.warn('⚠️ DeepSeek did not recommend USDC -> SUI. Skipping.');
    }
  } else {
    console.log('Skipping real USDC swap since Vault has no USDC.');
  }

  // SCENARIO 3: Grid Volatility Harvesting (Price Dump)
  console.log('\n--- SCENARIO 3: Grid Volatility Harvesting (Price Dump) ---');
  // Simulate price falling from $2.00 to $1.60
  const mockState3 = { suiBalance: 0.01 * 1e9, usdcBalance: 10 * 1e6 };
  const decision3 = await queryDeepSeek(strategyGrid, mockState3, 1.60);
  console.log(`DeepSeek Output: should_rebalance=${decision3.should_rebalance}, action=${decision3.action}, amount=${decision3.amount_mist}`);
  console.log(`Reasoning: ${decision3.reasoning}`);
  if (decision3.should_rebalance && decision3.action === 'swap_usdc_to_sui') {
    console.log('✅ Grid strategy pass: AI decided to BUY SUI on the dip!');
  } else {
    console.warn('⚠️ Grid strategy logic did not trigger buy as expected.');
  }

  // SCENARIO 4: Momentum Trend Follower (Uptrend Pump)
  console.log('\n--- SCENARIO 4: Momentum Trend Follower (Uptrend Pump) ---');
  // Simulate price pumping from historical $2.00 to current $2.30 (15% pump)
  const mockState4 = { suiBalance: 0.01 * 1e9, usdcBalance: 10 * 1e6 };
  const decision4 = await queryDeepSeek(strategyMomentum, mockState4, 2.30);
  console.log(`DeepSeek Output: should_rebalance=${decision4.should_rebalance}, action=${decision4.action}, amount=${decision4.amount_mist}`);
  console.log(`Reasoning: ${decision4.reasoning}`);
  if (decision4.should_rebalance && decision4.action === 'swap_usdc_to_sui') {
    console.log('✅ Momentum strategy pass: AI decided to increase SUI exposure during pump!');
  } else {
    console.warn('⚠️ Momentum strategy logic did not trigger trend following as expected.');
  }

  // 5. Clean up
  console.log('\n[5/5] Reclaiming real testing funds (Ragequit)...');
  actualState = await sdk.getVaultState(vaultId);
  console.log(`Final Vault status: SUI: ${actualState.suiBalance / 1e9}, USDC: ${actualState.usdcBalance / 1e6}`);
  const { suiReceived, usdcReceived } = await sdk.ragequit(signer, vaultId, shareObjectId);
  console.log(`✅ Ragequit complete! Recovered ${suiReceived / 1e9} SUI and ${usdcReceived / 1e6} USDC.`);
  console.log(`🎉 All Scenario Tests Completed!`);
}

runScenarios().catch(err => {
  console.error('Scenario tests failed with error:', err);
});
