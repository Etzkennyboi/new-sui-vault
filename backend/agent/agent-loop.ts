import * as dotenv from 'dotenv';
import * as path from 'path';
import { SuiSyndicateClient } from '../sdk/src/client';
import { WalrusClient } from '../sdk/src/walrus';
import { createTatumClient } from '../sdk/src/tatum';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const SUI_MAINNET_RPC = process.env.SUI_MAINNET_RPC || 'https://sui-mainnet.gateway.tatum.io';
const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

// Vault and Cap config (should be filled from deploy script output)
const VAULT_ID = process.env.VAULT_ID || '0xvault_placeholder';
const AGENT_CAP_ID = process.env.AGENT_CAP_ID || '0xagent_cap_placeholder';

const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '0x4f177e91a1848e3997eae67a7b8e1f0c2a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
const FACTORY_ID = process.env.FACTORY_OBJECT_ID || '0xfac7c32d4f71b54bda02913e95177e91a1848e3997eae672a2b3c4d5e6f7a8b';
const CETUS_POOL_ID = process.env.CETUS_POOL_ID || '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630';
const CETUS_GLOBAL_CONFIG_ID = process.env.CETUS_GLOBAL_CONFIG_ID || '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';

// DeepSeek/NVIDIA API Config
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const AI_MODEL = 'deepseek-ai/deepseek-v4-flash';

async function fetchPythSuiPrice(): Promise<number> {
  try {
    const response = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744');
    const data = await response.json();
    const priceData = data.parsed[0].price;
    return parseFloat(priceData.price) * Math.pow(10, priceData.expo);
  } catch (err) {
    console.error('Pyth Hermes fetch failed, falling back to simulated price.', err);
    return 2.0;
  }
}

async function queryDeepSeek(
  strategy: any,
  vaultState: any,
  liveExchangeRate: number,
  lastLog: any
): Promise<any> {
  console.log(`Querying DeepSeek using strategy profile: ${strategy.strategy_type}...`);

  const systemPromptBase = `You are the core intelligence of SuiSyndicate, an autonomous vault rebalancing agent.
Analyze the current portfolio state against the assigned strategy and decide if a trade is required.
You must reply ONLY with a raw JSON block containing these fields:
- should_rebalance (boolean)
- action ("swap_sui_to_usdc", "swap_usdc_to_sui", or "none")
- amount_mist (number, the SUI/USDC amount to trade, represented in smallest decimals: SUI is 9 decimals, USDC is 6 decimals)
- reasoning (string, short 1-2 sentence description of your trade reasoning)

Do not output any markdown blocks, backticks, or extra conversational text.`;

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

Rule: If one asset dominates by more than ${strategy.parameters.ai_rebalance_trigger_threshold_pct || 2}% over its target allocation, trigger should_rebalance = true and compute the exact amount_mist swap required to restore the target percentages.`;
  } else if (strategy.strategy_type === 'grid_harvesting') {
    const lastPrice = lastLog?.prices?.SUI_USDC || 'None (First trade)';
    userPrompt += `
Strategy: Grid Volatility Harvesting
- Grid Upper Bound: $${strategy.parameters.grid_upper_bound}
- Grid Lower Bound: $${strategy.parameters.grid_lower_bound}
- Number of Grid Steps: ${strategy.parameters.grid_steps}
- Last Trade Execution Price: $${lastPrice}

Rule: If the current price has moved significantly away from the last execution price, and sits within the grid range, execute a partial swap. Sell a portion of SUI (swap_sui_to_usdc) if the price rose into a higher grid tier. Buy a portion of SUI (swap_usdc_to_sui) if the price fell into a lower tier.`;
  } else {
    userPrompt += `\nUnknown strategy type. Do not trade.`;
  }

  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPromptBase },
          { role: 'user', content: userPrompt },
        ],
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
        chat_template_kwargs: { thinking: true, reasoning_effort: 'high' }
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`NVIDIA API response error: ${response.status} ${response.statusText} — ${errorBody}`);
    }

    const result = await response.json();
    const message = result.choices[0]?.message;

    const reasoning = message?.reasoning || message?.reasoning_content;
    if (reasoning) {
      console.log('--- DeepSeek Reasoning Chain ---');
      console.log(reasoning);
      console.log('--- End Reasoning ---');
    }

    let text = message?.content || '{}';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (err: any) {
    console.error('Failed to communicate with DeepSeek:', err.message);
    return {
      should_rebalance: false,
      action: 'none',
      amount_mist: 0,
      reasoning: 'DeepSeek rate-limited/failed. No action taken.',
    };
  }
}

async function runAgent() {
  console.log('--- SuiSyndicate Autonomous Agent Daemon ---');

  if (!PRIVATE_KEY || !TATUM_API_KEY || !DEEPSEEK_API_KEY) {
    console.error('Error: PRIVATE_KEY, TATUM_API_KEY, and DEEPSEEK_API_KEY must be configured.');
    process.exit(1);
  }

  const TARGET_COIN_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
  const suiClient = createTatumClient({ apiKey: TATUM_API_KEY, rpcUrl: SUI_MAINNET_RPC });
  const walrusClient = new WalrusClient(WALRUS_PUBLISHER, WALRUS_AGGREGATOR);
  const sdk = new SuiSyndicateClient(suiClient, walrusClient, {
    packageId: PACKAGE_ID,
    factoryId: FACTORY_ID,
    targetCoinType: TARGET_COIN_TYPE,
  });

  const agentKeypair = SuiSyndicateClient.getKeypairFromPrivateKey(PRIVATE_KEY);
  const agentAddress = agentKeypair.getPublicKey().toSuiAddress();
  console.log(`Running agent daemon under address: ${agentAddress}`);

  while (true) {
    console.log(`\n[${new Date().toISOString()}] Starting monitoring tick...`);

    try {
      console.log(`Fetching vault state for vault: ${VAULT_ID}...`);
      const vaultState = await sdk.getVaultState(VAULT_ID);
      console.log(`Vault Status: Sui Bal = ${vaultState.suiBalance / 1e9} SUI, USDC Bal = ${vaultState.usdcBalance / 1e6} USDC`);

      console.log(`Downloading strategy manifest: ${vaultState.strategyBlobId}...`);
      const strategy = await walrusClient.getBlob(vaultState.strategyBlobId);
      console.log(`Loaded Strategy Type: ${strategy.strategy_type || 'Unknown'}`);

      console.log('Fetching live SUI price from Pyth Hermes Network...');
      const liveExchangeRate = await fetchPythSuiPrice();
      console.log(`Pyth Oracle Price: $${liveExchangeRate.toFixed(4)}`);

      console.log('Fetching last Action Log from Walrus...');
      const logs = await sdk.getVaultLogs(VAULT_ID);
      const lastLog = logs.length > 0 ? logs[0] : null;

      // Simple heuristic gate to save DeepSeek credits for Target Allocation
      if (strategy.strategy_type === 'target_allocation') {
        const suiValueUsdc = (vaultState.suiBalance / 1e9) * liveExchangeRate;
        const usdcValue = (vaultState.usdcBalance / 1e6);
        const totalValueUsdc = suiValueUsdc + usdcValue;

        if (totalValueUsdc > 0) {
          const currentSuiPct = (suiValueUsdc / totalValueUsdc) * 100;
          const targetPct = strategy.parameters?.target_allocation_sui_pct || 50;
          const suiDeviation = Math.abs(currentSuiPct - targetPct);
          
          console.log(`Current SUI Allocation: ${currentSuiPct.toFixed(2)}% | Target: ${targetPct}%`);
          if (suiDeviation < 1.0) {
            console.log(`Deviation is only ${suiDeviation.toFixed(2)}%. Below 1% threshold. Skipping DeepSeek call.`);
            await new Promise((r) => setTimeout(r, strategy.interval_ms || 60000));
            continue;
          }
          console.log(`Deviation is ${suiDeviation.toFixed(2)}%. Waking up DeepSeek AI...`);
        }
      }

      const decision = await queryDeepSeek(strategy, vaultState, liveExchangeRate, lastLog);

      console.log(`DeepSeek Decision: should_rebalance = ${decision.should_rebalance}, Action = ${decision.action}`);
      console.log(`AI Rationale: ${decision.reasoning}`);

      let txDigest: string | null = null;

      if (decision.should_rebalance && decision.action !== 'none') {
        let expectedOut = 0;
        const slippageTolerance = 0.02; // 2% Max Slippage

        if (decision.action === 'swap_sui_to_usdc') {
          expectedOut = (decision.amount_mist / 1e9) * liveExchangeRate * 1e6;
        } else if (decision.action === 'swap_usdc_to_sui') {
          expectedOut = (decision.amount_mist / 1e6) / liveExchangeRate * 1e9;
        }

        const strictMinOut = Math.floor(expectedOut * (1 - slippageTolerance));
        console.log(`Security Protocol: Hardcoding 2% slippage constraint via Pyth Oracle. Min Out enforced: ${strictMinOut}`);

        console.log(`Executing Swap Action: ${decision.action} on Cetus for amount: ${decision.amount_mist}...`);
        if (decision.action === 'swap_sui_to_usdc') {
          txDigest = await sdk.executeSwapCetus(
            agentKeypair,
            VAULT_ID,
            AGENT_CAP_ID,
            decision.amount_mist,
            strictMinOut,
            CETUS_POOL_ID,
            CETUS_GLOBAL_CONFIG_ID
          );
        } else if (decision.action === 'swap_usdc_to_sui') {
          txDigest = await sdk.executeSwapUsdcToSuiCetus(
            agentKeypair,
            VAULT_ID,
            AGENT_CAP_ID,
            decision.amount_mist,
            strictMinOut,
            CETUS_POOL_ID,
            CETUS_GLOBAL_CONFIG_ID
          );
        }
        console.log(`Swap executed successfully on Cetus. Tx Digest: ${txDigest}`);
      } else {
        console.log('No swap executed based on AI decision.');
      }

      const currentEpoch = await suiClient.getCurrentEpoch();
      const logPayload = {
        timestamp: Date.now(),
        vault_id: VAULT_ID,
        agent: agentAddress,
        prices: { SUI_USDC: liveExchangeRate },
        balances: { sui: vaultState.suiBalance, usdc: vaultState.usdcBalance },
        action_taken: decision.action,
        amount_raw: decision.amount_mist,
        tx_digest: txDigest,
        ai_reasoning: decision.reasoning,
      };

      console.log('Uploading ActionLog to Walrus...');
      const logBlobId = await sdk.anchorLog(
        agentKeypair,
        VAULT_ID,
        AGENT_CAP_ID,
        parseInt(currentEpoch.epoch),
        logPayload
      );
      console.log(`ActionLog anchored to Sui in epoch ${currentEpoch.epoch}. Walrus Blob ID: ${logBlobId}`);

      const sleepMs = strategy.interval_ms || 60000;
      console.log(`Sleeping for ${sleepMs / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, sleepMs));

    } catch (err: any) {
      console.error('Error in agent loop tick:', err.message || err);
      console.log('Sleeping for 30 seconds before retry...');
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }
}

// Start the daemon
runAgent().catch((err) => {
  console.error('Agent daemon crashed:', err);
});
