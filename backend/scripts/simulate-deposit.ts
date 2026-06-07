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

const VAULT_ID = process.env.VAULT_ID || '';
const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '';
const FACTORY_ID = process.env.FACTORY_OBJECT_ID || '';

async function run() {
  console.log('--- Simulating 1 SUI Deposit ---');
  if (!PRIVATE_KEY || !VAULT_ID || !PACKAGE_ID) {
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
  
  console.log(`Depositing 4 SUI (4000000000 MIST) into Vault ${VAULT_ID}...`);
  try {
    const shareId = await sdk.depositSui(agentKeypair, VAULT_ID, 4000000000);
    console.log(`Deposit successful! Received SyndicateShare: ${shareId}`);
  } catch (err) {
    console.error('Deposit failed:', err);
  }
}

run();
