import * as dotenv from 'dotenv';
import * as path from 'path';
import { SuiSyndicateClient } from '../../sdk/src/client';
import { WalrusClient } from '../../sdk/src/walrus';
import { createTatumClient } from '../../sdk/src/tatum';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const SUI_MAINNET_RPC = 'https://fullnode.mainnet.sui.io:443';

async function run() {
  const suiClient = createTatumClient({ apiKey: TATUM_API_KEY, rpcUrl: SUI_MAINNET_RPC });
  const walrusClient = new WalrusClient('', '');
  const sdk = new SuiSyndicateClient(suiClient, walrusClient, {
    packageId: process.env.FACTORY_PACKAGE_ID || '',
    factoryId: '',
    coinTypeA: '0x2702b6cae761cd63ac87522d7011d7d0b3677e9684980e4438403a67a3d8f24f::ssui::SSUI',
    coinTypeB: '0x2702b6cae761cd63ac87522d7011d7d0b3677e9684980e4438403a67a3d8f24f::susdc::SUSDC',
  });

  const oldVaultId = '0xadd7421d3d113e9078f64e6ef53411547a0e07eb93e75717a208b110aea3f84e';
  const newVaultId = '0x287a655c5e28dfcb01f1b4d139852986dab7f1dcfb46282f5b58ed70153d19c8';

  try {
    const oldVault = await sdk.getVaultState(oldVaultId);
    console.log(`OLD Vault (Wormhole): ${oldVault.suiBalance / 1e9} SUI | ${oldVault.usdcBalance / 1e6} USDC`);
  } catch (e) { console.error('Failed to get old vault'); }

  try {
    const newVault = await sdk.getVaultState(newVaultId);
    console.log(`NEW Vault (Native): ${newVault.suiBalance / 1e9} SUI | ${newVault.usdcBalance / 1e6} USDC`);
  } catch (e) { console.error('Failed to get new vault'); }
}

run();
