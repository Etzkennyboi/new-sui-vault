import * as dotenv from 'dotenv';
import * as path from 'path';
import { SuiSyndicateClient } from '../../sdk/src/client';
import { WalrusClient } from '../../sdk/src/walrus';
import { createTatumClient } from '../../sdk/src/tatum';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const SUI_MAINNET_RPC = 'https://fullnode.mainnet.sui.io:443';
const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';

const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '';
const FACTORY_ID = process.env.FACTORY_OBJECT_ID || '';
const TARGET_COIN_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

async function run() {
  console.log('--- Deploying Native USDC Vault ---');
  if (!PRIVATE_KEY || !PACKAGE_ID || !FACTORY_ID) {
    console.error('Missing config');
    return;
  }

  const suiClient = createTatumClient({ apiKey: TATUM_API_KEY, rpcUrl: SUI_MAINNET_RPC });
  const walrusClient = new WalrusClient(WALRUS_PUBLISHER, WALRUS_AGGREGATOR);
  const sdk = new SuiSyndicateClient(suiClient, walrusClient, {
    packageId: PACKAGE_ID,
    factoryId: FACTORY_ID,
    coinTypeA: '0x2702b6cae761cd63ac87522d7011d7d0b3677e9684980e4438403a67a3d8f24f::ssui::SSUI',
    coinTypeB: '0x2702b6cae761cd63ac87522d7011d7d0b3677e9684980e4438403a67a3d8f24f::susdc::SUSDC',
  });

  const agentKeypair = SuiSyndicateClient.getKeypairFromPrivateKey(PRIVATE_KEY);
  const agentAddress = agentKeypair.getPublicKey().toSuiAddress();
  
  const strategyDoc = {
    strategy_type: "target_allocation",
    parameters: { target_allocation_sui_pct: 50, target_allocation_usdc_pct: 50, ai_rebalance_trigger_threshold_pct: 2 }
  };
  const metadataDoc = { name: "Native USDC 50/50 Strategy", description: "Autonomously rebalances SUI and Native USDC." };

  console.log('Creating Vault...');
  const { vaultId, creatorCapId } = await sdk.createVault(agentKeypair, "Native USDC 50/50", strategyDoc, metadataDoc);
  console.log(`Vault Created! ID: ${vaultId}`);
  console.log(`CreatorCap ID: ${creatorCapId}`);

  console.log('Issuing Agent Cap...');
  const agentCapId = await sdk.issueAgentCap(agentKeypair, creatorCapId, vaultId, agentAddress, 10000000000, 100000000000);
  console.log(`AgentCap Issued! ID: ${agentCapId}`);
}

run();
