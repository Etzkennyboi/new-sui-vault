import { NextRequest, NextResponse } from 'next/server';
import { SuiSyndicateClient } from '../../../../../../sdk/src/client';
import { WalrusClient } from '../../../../../../sdk/src/walrus';
import { createTatumClient } from '../../../../../../sdk/src/tatum';

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const SUI_MAINNET_RPC = process.env.SUI_MAINNET_RPC || 'https://sui-mainnet.gateway.tatum.io';
const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || process.env.NEXT_PUBLIC_PACKAGE_ID || '0x4f177e91a1848e3997eae67a7b8e1f0c2a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
import { officialVaults } from '../../../../../lib/config/vaults';
const FACTORY_ID = process.env.FACTORY_OBJECT_ID || '0xfac7c32d4f71b54bda02913e95177e91a1848e3997eae672a2b3c4d5e6f7a8b';
const CETUS_POOL_ID = process.env.CETUS_POOL_ID || '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630';
const CETUS_GLOBAL_CONFIG_ID = process.env.CETUS_GLOBAL_CONFIG_ID || '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';

// DeepSeek/NVIDIA API Config
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const AI_MODEL = 'deepseek-ai/deepseek-v4-flash';

async function fetchPythSuiPrice(): Promise<number> {
  try {
    const response = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744', { cache: 'no-store' });
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
- Exchange Rate: 1 SUI = ${liveExchangeRate.toFixed(4)} USDC\n`;

  if (strategy.strategy_type === 'target_allocation') {
    userPrompt += `
Strategy: Target Allocation Rebalancing
- Target SUI Allocation: ${strategy.parameters.target_allocation_sui_pct}%
- Target USDC Allocation: ${strategy.parameters.target_allocation_usdc_pct}%

Rule: If one asset dominates by more than ${strategy.parameters.ai_rebalance_trigger_threshold_pct || 2}% over its target allocation, trigger should_rebalance = true and compute the exact amount_mist swap required to restore the target percentages.`;
  } else {
    userPrompt += `\nUnknown or unsupported strategy type. Do not trade.`;
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
        max_tokens: 4096
      }),
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API response error: ${response.status}`);
    }

    const result = await response.json();
    let text = result.choices[0]?.message?.content || '{}';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (err: any) {
    console.error('DeepSeek query failed:', err);
    return { should_rebalance: false, action: 'none', amount_mist: 0, reasoning: 'AI Error' };
  }
}

export async function POST(request: NextRequest, context: any) {
  const params = await context.params;
  const vaultId = params.id;
  const vaultConfig = officialVaults.find(v => v.id === vaultId);
  const AGENT_CAP_ID = vaultConfig?.agentCapId || process.env.AGENT_CAP_ID || '';

  if (!PRIVATE_KEY || !TATUM_API_KEY || !DEEPSEEK_API_KEY || !AGENT_CAP_ID) {
    return NextResponse.json({ success: false, error: 'Missing backend environment variables or Agent Cap ID' }, { status: 500 });
  }

  try {
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

    const vaultState = await sdk.getVaultState(vaultId);
    let strategy;
    try {
      strategy = await walrusClient.getBlob(vaultState.strategyBlobId);
    } catch (err) {
      console.warn(`Failed to retrieve strategy blob from Walrus. Using fallback strategy.`);
      strategy = { strategy_type: 'target_allocation', parameters: { target_allocation_sui_pct: 50, target_allocation_usdc_pct: 50, ai_rebalance_trigger_threshold_pct: 2 } };
    }
    const liveExchangeRate = await fetchPythSuiPrice();
    const logs = await sdk.getVaultLogs(vaultId);
    const lastLog = logs.length > 0 ? logs[0] : null;

    const decision = await queryDeepSeek(strategy, vaultState, liveExchangeRate, lastLog);

    let txDigest: string | null = null;
    if (decision.should_rebalance && decision.action !== 'none') {
      let expectedOut = 0;
      const slippageTolerance = 0.05; // 5% Max Slippage to ensure it goes through
      if (decision.action === 'swap_sui_to_usdc') {
        expectedOut = (decision.amount_mist / 1e9) * liveExchangeRate * 1e6;
      } else if (decision.action === 'swap_usdc_to_sui') {
        expectedOut = (decision.amount_mist / 1e6) / liveExchangeRate * 1e9;
      }
      const strictMinOut = Math.floor(expectedOut * (1 - slippageTolerance));

      if (decision.action === 'swap_sui_to_usdc') {
        txDigest = await sdk.executeSwapCetus(agentKeypair, vaultId, AGENT_CAP_ID, decision.amount_mist, strictMinOut, CETUS_POOL_ID, CETUS_GLOBAL_CONFIG_ID);
      } else if (decision.action === 'swap_usdc_to_sui') {
        txDigest = await sdk.executeSwapUsdcToSuiCetus(agentKeypair, vaultId, AGENT_CAP_ID, decision.amount_mist, strictMinOut, CETUS_POOL_ID, CETUS_GLOBAL_CONFIG_ID);
      }
    }

    // Log the action to Walrus
    const currentEpoch = await suiClient.getCurrentEpoch();
    const logPayload = {
      timestamp: Date.now(),
      vault_id: vaultId,
      agent: agentAddress,
      prices: { SUI_USDC: liveExchangeRate },
      balances: { sui: vaultState.suiBalance, usdc: vaultState.usdcBalance },
      action_taken: decision.action,
      amount_raw: decision.amount_mist,
      tx_digest: txDigest,
      ai_reasoning: decision.reasoning,
    };

    const logBlobId = await sdk.anchorLog(agentKeypair, vaultId, AGENT_CAP_ID, parseInt(currentEpoch.epoch), logPayload);

    return NextResponse.json({ success: true, logBlobId, decision });
  } catch (error: any) {
    console.error('Rebalance API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
