import * as dotenv from 'dotenv';
import * as path from 'path';
import { SuiSyndicateClient } from '../sdk/src/client';
import { WalrusClient } from '../sdk/src/walrus';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const SUI_MAINNET_RPC = 'https://fullnode.mainnet.sui.io:443';
const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '';
const FACTORY_ID = process.env.FACTORY_OBJECT_ID || '';
const TARGET_COIN_TYPE = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN';
const CETUS_POOL_ID = process.env.CETUS_POOL_ID || '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630';
const CETUS_GLOBAL_CONFIG_ID = process.env.CETUS_GLOBAL_CONFIG_ID || '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function queryDeepSeek(strategy: any, vaultState: any, liveExchangeRate: number): Promise<any> {
  console.log(`\n🤖 Asking DeepSeek AI... (SUI Bal: ${vaultState.suiBalance / 1e9}, USDC Bal: ${vaultState.usdcBalance / 1e6})`);
  
  const systemPromptBase = `You are the core intelligence of SuiSyndicate.
Analyze the current portfolio state against the assigned strategy and decide if a trade is required.
You must reply ONLY with a raw JSON block containing these fields:
- should_rebalance (boolean)
- action ("swap_sui_to_usdc", "swap_usdc_to_sui", or "none")
- amount_mist (number, the SUI/USDC amount to trade, represented in smallest decimals: SUI is 9 decimals, USDC is 6 decimals)
- reasoning (string, short 1-2 sentence description of your trade reasoning)
Do not output any markdown blocks or extra text.`;

  const userPrompt = `Portfolio State:
- SUI Balance: ${vaultState.suiBalance} MIST (decimals: 9)
- USDC Balance: ${vaultState.usdcBalance} units (decimals: 6)
- Exchange Rate: 1 SUI = ${liveExchangeRate.toFixed(4)} USDC

Strategy: Target Allocation Rebalancing
- Target SUI Allocation: ${strategy.parameters.target_allocation_sui_pct}%
- Target USDC Allocation: ${strategy.parameters.target_allocation_usdc_pct}%

Rule: If one asset dominates by more than ${strategy.parameters.ai_rebalance_trigger_threshold_pct}% over its target allocation, trigger should_rebalance = true and compute the exact amount_mist swap required to restore the target percentages.`;

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
  return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
}

async function runScenarios() {
  console.log('--- SuiSyndicate: Agent Strategy Scenarios Test ---');

  const { SuiClient } = await import('@mysten/sui/client');
  const suiClient = new SuiClient({ url: SUI_MAINNET_RPC });
  
  // Mock Walrus
  const walrusClient = new WalrusClient('', '');
  walrusClient.storeBlob = async () => 'mock_blob_id_for_testing_' + Date.now();

  const sdk = new SuiSyndicateClient(suiClient, walrusClient, {
    packageId: PACKAGE_ID, factoryId: FACTORY_ID, targetCoinType: TARGET_COIN_TYPE,
  });

  const signer = SuiSyndicateClient.getKeypairFromPrivateKey(PRIVATE_KEY);
  const senderAddress = signer.getPublicKey().toSuiAddress();
  
  const strategy = {
    strategy_type: 'target_allocation',
    parameters: { target_allocation_sui_pct: 50, target_allocation_usdc_pct: 50, ai_rebalance_trigger_threshold_pct: 2 }
  };

  // 1. Setup
  console.log('[1/4] Deploying Vault and Issuing AgentCap...');
  const { vaultId, creatorCapId } = await sdk.createVault(signer, 'AI Test Vault', strategy, {});
  const agentCapId = await sdk.issueAgentCap(signer, creatorCapId, vaultId, senderAddress, 1e11, 1e12);
  console.log(`✅ Vault: ${vaultId} | AgentCap: ${agentCapId}`);

  console.log('\n[2/4] Depositing 0.02 SUI to start...');
  const shareObjectId = await sdk.depositSui(signer, vaultId, 0.02 * 1e9);

  // SCENARIO 1: SUI Over-allocated
  console.log('\n--- SCENARIO 1: SUI Over-Allocated ---');
  const mockState1 = { suiBalance: 0.02 * 1e9, usdcBalance: 0 };
  const decision1 = await askDeepSeek(strategy, 0.02, 0);
  console.log(`DeepSeek: action=${decision1.action}, amount=${decision1.amount_mist}`);
  console.log(`Reasoning: ${decision1.reasoning}`);
  
  if (decision1.should_rebalance && decision1.action === 'swap_sui_to_usdc') {
    const safeAmountSui = Math.min(decision1.amount_mist, 0.005 * 1e9);
    console.log(`✅ Strategy PASS: AI correctly decided to sell SUI to rebalance! (Target Amount: ${decision1.amount_mist / 1e9} SUI)`);
    console.log(`Executing REAL Swap SUI -> USDC for ${safeAmountSui / 1e9} SUI on Cetus Mainnet...`);
    await sdk.executeSwapCetus(signer, vaultId, agentCapId, safeAmountSui, 0, CETUS_POOL_ID, CETUS_GLOBAL_CONFIG_ID);
    console.log('✅ Cetus Swap SUI -> USDC successful!');
  } else {
    throw new Error('DeepSeek failed to choose SUI -> USDC swap in Scenario 1');
  }

  // SCENARIO 2: USDC Over-allocated
  console.log('\n--- SCENARIO 2: USDC Over-Allocated ---');
  const mockState2 = { suiBalance: 0, usdcBalance: 10 * 1e6 }; // 10 USDC fake balance
  const decision2 = await askDeepSeek(strategy, 0, 1000);
  console.log(`DeepSeek: action=${decision2.action}, amount=${decision2.amount_mist}`);
  console.log(`Reasoning: ${decision2.reasoning}`);
  
  if (decision2.should_rebalance && decision2.action === 'swap_usdc_to_sui') {
    const safeAmountUsdc = Math.min(decision2.amount_mist, 10 * 1e6); // At least test the USDC we got
    console.log(`✅ Strategy PASS: AI correctly decided to buy SUI to rebalance! (Target Amount: ${decision2.amount_mist / 1e6} USDC)`);
    console.log(`Executing REAL Swap USDC -> SUI for ${safeAmountUsdc / 1e6} USDC on Cetus Mainnet...`);
    // Wait, we need to pass the real usdc balance! Let's get the state!
    let actualState = await sdk.getVaultState(vaultId);
    console.log(`Actual Vault SUI: ${actualState.suiBalance / 1e9}, USDC: ${actualState.usdcBalance / 1e6}`);
    const finalAmountUsdc = Math.min(safeAmountUsdc, actualState.usdcBalance);
    
    await sdk.executeSwapUsdcToSuiCetus(signer, vaultId, agentCapId, finalAmountUsdc, 0, CETUS_POOL_ID, CETUS_GLOBAL_CONFIG_ID);
    console.log('✅ Cetus Swap USDC -> SUI successful!');
  } else {
    throw new Error('DeepSeek failed to choose USDC -> SUI swap in Scenario 2');
  }

  // CLEANUP
  console.log('\n[4/4] Withdrawing all funds (Ragequit) to protect real SUI...');
  const { suiReceived, usdcReceived } = await sdk.ragequit(signer, vaultId, shareObjectId);
  console.log(`✅ Withdraw Successful! Received ${(suiReceived / 1e9).toFixed(4)} SUI and ${(usdcReceived / 1e6).toFixed(4)} USDC.`);
  
  console.log('\n🎉 AI Strategy Scenarios Test Completed Successfully!');
}

runScenarios().catch(err => console.error(err));
