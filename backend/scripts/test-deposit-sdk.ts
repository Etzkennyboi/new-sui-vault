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
const VAULT_ID = process.env.VAULT_ID || '';

async function runDepositTest() {
  console.log('=== SDK Yield-Bearing Deposit Verification (Mainnet) ===\n');

  if (!PRIVATE_KEY || !PACKAGE_ID || !VAULT_ID) {
    console.error('Missing required environment variables in .env');
    return;
  }

  const suiClient = createTatumClient({ apiKey: TATUM_API_KEY, rpcUrl: SUI_MAINNET_RPC });
  const walrusClient = new WalrusClient(WALRUS_PUBLISHER, WALRUS_AGGREGATOR);
  const sdk = new SuiSyndicateClient(suiClient, walrusClient, {
    packageId: PACKAGE_ID,
    factoryId: process.env.FACTORY_OBJECT_ID || '',
    coinTypeA: '0xefe8b36d5b2e43728cc323298626b83177803521d195cfb11e15b910e892fddf::reserve::MarketCoin<0x2::sui::SUI>',
    coinTypeB: '0xefe8b36d5b2e43728cc323298626b83177803521d195cfb11e15b910e892fddf::reserve::MarketCoin<0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC>',
  });

  const lpKeypair = SuiSyndicateClient.getKeypairFromPrivateKey(PRIVATE_KEY);
  const lpAddress = lpKeypair.getPublicKey().toSuiAddress();
  console.log(`LP Address: ${lpAddress}`);
  console.log(`Target Vault: ${VAULT_ID}`);

  // Get current SUI balance
  const balance = await suiClient.getBalance({ owner: lpAddress });
  const rawBalance = parseInt(balance.totalBalance);
  console.log(`Current Balance: ${rawBalance / 1e9} SUI`);

  if (rawBalance < 0.1 * 1e9) {
    console.error('Insufficient SUI balance to run deposit test. Need at least 0.1 SUI.');
    return;
  }

  const depositAmountSui = 0.01;
  const depositAmountMist = depositAmountSui * 1e9;
  console.log(`\nInitiating deposit of ${depositAmountSui} SUI...`);
  console.log('Under the hood: SUI -> Scallop sSUI (MarketCoin) -> Syndicate Vault');

  try {
    const shareObjectId = await sdk.depositSui(lpKeypair, VAULT_ID, depositAmountMist);
    console.log('\n----------------------------------------');
    console.log('✓ DEPOSIT TRANSACTION COMPLETED SUCCESSFULLY!');
    console.log(`SyndicateShare (LP Token) Object ID: ${shareObjectId}`);
    console.log('----------------------------------------');

    // Query vault state to verify it now holds the sSUI
    console.log('\nQuerying Vault State to verify balances...');
    const state = await sdk.getVaultState(VAULT_ID);
    console.log(`Vault Name: ${state.name}`);
    console.log(`sSUI (Asset A) Balance in Vault: ${state.suiBalance}`);
    console.log(`sUSDC (Asset B) Balance in Vault: ${state.usdcBalance}`);
    console.log(`Total LP Shares Issued: ${state.totalShares}`);
  } catch (err: any) {
    console.error('\n✗ Deposit transaction failed:', err.message || err);
  }
}

runDepositTest().catch(console.error);
