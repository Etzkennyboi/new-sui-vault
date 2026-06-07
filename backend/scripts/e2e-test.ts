import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';
import { SuiSyndicateClient } from '../../sdk/src/client';
import { WalrusClient } from '../../sdk/src/walrus';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';

const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '';
const FACTORY_ID = process.env.FACTORY_OBJECT_ID || '';
const TARGET_COIN_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'; // Native USDC
const CETUS_POOL_ID = process.env.CETUS_POOL_ID || '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630';
const CETUS_GLOBAL_CONFIG_ID = process.env.CETUS_GLOBAL_CONFIG_ID || '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));

async function main() {
  console.log('--- SuiSyndicate E2E Mainnet Test ---');

  if (!PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY must be configured in .env');
    process.exit(1);
  }

  console.log('Initializing SUI Mainnet Official RPC and Walrus client...');
  // Use official RPC to bypass Tatum 429
  const suiClient = new SuiClient({ url: getFullnodeUrl('mainnet') });
  const walrusClient = new WalrusClient(WALRUS_PUBLISHER, WALRUS_AGGREGATOR);
  const sdk = new SuiSyndicateClient(suiClient, walrusClient, {
    packageId: PACKAGE_ID,
    factoryId: FACTORY_ID,
    targetCoinType: TARGET_COIN_TYPE,
  });

  const signer = SuiSyndicateClient.getKeypairFromPrivateKey(PRIVATE_KEY);
  const senderAddress = signer.getPublicKey().toSuiAddress();
  console.log(`Using Wallet Address: ${senderAddress}`);

  console.log('\n--- Phase 1: Deploy & Deposit ---');
  
  const strategyDoc = {
    strategy_type: 'target_allocation',
    parameters: {
      target_allocation_sui_pct: 50,
      target_allocation_usdc_pct: 50,
      ai_rebalance_trigger_threshold_pct: 2,
    },
    risk_level: 'medium',
    interval_ms: 60000,
    allowed_protocols: [CETUS_POOL_ID],
    version: '2.0.0',
  };

  const metadataDoc = {
    vault_name: 'E2E Test Vault',
    description: 'Vault for testing full end-to-end execution on Mainnet.',
    creator: senderAddress,
    logo_url: 'https://raw.githubusercontent.com/sui-syndicate/logo/main/logo.png',
    created_at: Date.now(),
  };

  console.log('Creating Vault...');
  const { vaultId, creatorCapId } = await sdk.createVault(signer, 'E2E Test Vault', strategyDoc, metadataDoc);
  console.log(`Vault Created! Vault ID: ${vaultId}`);
  console.log(`CreatorCap ID: ${creatorCapId}`);

  console.log('Issuing AgentCap...');
  const agentCapId = await sdk.issueAgentCap(
    signer,
    creatorCapId,
    vaultId,
    senderAddress,
    200000000, // 0.2 SUI per tx limit
    500000000  // 0.5 SUI daily limit
  );
  console.log(`AgentCap Issued! ID: ${agentCapId}`);

  console.log('Depositing 0.1 SUI into the Vault...');
  const depositAmountMist = 100_000_000; // 0.1 SUI
  const shareObjId = await sdk.depositSui(signer, vaultId, depositAmountMist);
  console.log(`Deposited 0.1 SUI. SyndicateShare ID: ${shareObjId}`);

  console.log('\n--- Phase 2: AI Swap Execution ---');
  console.log('Since the vault is currently 100% SUI, we will force the AI to swap roughly 0.05 SUI to USDC on Cetus.');
  
  // Hardcode the swap values to save time instead of invoking DeepSeek for the script
  // We want to swap 0.05 SUI to USDC
  const swapAmountMist = 50_000_000; 
  console.log(`Executing Flash Loan Cetus Swap (0.05 SUI -> USDC) via SDK...`);
  const txDigest = await sdk.executeSwapCetus(
    signer,
    vaultId,
    agentCapId,
    swapAmountMist,
    0, // Min USDC out (0 for testing simplicity, since Cetus handles exact input logic)
    CETUS_POOL_ID,
    CETUS_GLOBAL_CONFIG_ID
  );
  console.log(`Swap Executed! Transaction Digest: ${txDigest}`);

  console.log('\n--- Phase 3: Verification ---');
  const vaultState = await sdk.getVaultState(vaultId);
  console.log(`Vault Status after swap:`);
  console.log(`  Sui Balance:  ${vaultState.suiBalance / 1e9} SUI`);
  console.log(`  USDC Balance: ${vaultState.usdcBalance / 1e6} USDC`);
  
  // Wait for user before proceeding
  console.log(`\nYou can now inspect the vault on the frontend: http://localhost:3002/vaults/${vaultId}`);
  await askQuestion('\nPress ENTER to proceed to Ragequit and withdraw your funds...');

  console.log('\n--- Phase 4: Ragequit & Withdraw ---');
  console.log('Burning SyndicateShare and returning funds to wallet...');
  const withdrawResult = await sdk.ragequit(signer, vaultId, shareObjId);
  
  console.log(`Ragequit Successful!`);
  console.log(`  SUI Received:  ${withdrawResult.suiReceived / 1e9} SUI`);
  console.log(`  USDC Received: ${withdrawResult.usdcReceived / 1e6} USDC`);
  
  console.log('\n--- E2E Test Completed Successfully! ---');
  process.exit(0);
}

main().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
