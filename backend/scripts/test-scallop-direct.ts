import * as dotenv from 'dotenv';
import * as path from 'path';
import { Transaction } from '@mysten/sui/transactions';
import { SuiSyndicateClient } from '../../sdk/src/client';
import { WalrusClient } from '../../sdk/src/walrus';
import { createTatumClient } from '../../sdk/src/tatum';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const SUI_MAINNET_RPC = 'https://fullnode.mainnet.sui.io:443';

// Scallop Contract Configurations from JSON
const SCALLOP_MARKET = '0xa757975255146dc9686aa823b7838b507f315d704f428cbadad2f4ea061939d9';
const SCALLOP_VERSION = '0x07871c4b3c847a0f674510d4978d5cf6f960452795e8ff6f189fd2088a3f6ac7';

// Try standard package IDs
const SCALLOP_PROTOCOL_PACKAGES = [
  '0xde5c09ad171544aa3724dc67216668c80e754860f419136a68d78504eb2e2805', // latest protocol package
  '0xefe8b36d5b2e43728cc323298626b83177803521d195cfb11e15b910e892fddf', // core package
  '0x578374a1f5182013268bbe9b2b080c5d14cbed1a48f9990c5f8a1c33bf100e69'  // protocol package
];

const SUI_TYPE = '0x2::sui::SUI';
const sSUI_TYPE = '0xefe8b36d5b2e43728cc323298626b83177803521d195cfb11e15b910e892fddf::reserve::MarketCoin<0x2::sui::SUI>';

async function runDirectTest() {
  console.log('=== Scallop SUI Mint & Redeem Integration Debug (Mainnet) ===\n');
  
  if (!PRIVATE_KEY) {
    console.error('Missing PRIVATE_KEY in .env');
    return;
  }

  const suiClient = createTatumClient({ apiKey: TATUM_API_KEY, rpcUrl: SUI_MAINNET_RPC });
  const agentKeypair = SuiSyndicateClient.getKeypairFromPrivateKey(PRIVATE_KEY);
  const agentAddress = agentKeypair.getPublicKey().toSuiAddress();
  
  console.log(`Agent Address: ${agentAddress}`);
  
  // 1. Check current agent SUI balance
  const balance = await suiClient.getBalance({ owner: agentAddress });
  const rawBalance = parseInt(balance.totalBalance);
  console.log(`Agent SUI Balance: ${rawBalance / 1e9} SUI`);
  
  if (rawBalance < 0.1 * 1e9) {
    console.error('Insufficient SUI balance to run mainnet debug test. Need at least 0.1 SUI.');
    return;
  }

  let successPackage = '';
  
  // 2. Test Mint (Supply SUI -> Receive sSUI)
  for (const pkg of SCALLOP_PROTOCOL_PACKAGES) {
    console.log(`\nTesting Mint transaction using package: ${pkg}...`);
    try {
      const tx = new Transaction();
      const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(0.01 * 1e9)]); // minting 0.01 SUI
      
      const [sCoin] = tx.moveCall({
        target: `${pkg}::mint::mint`,
        arguments: [
          tx.object(SCALLOP_VERSION),
          tx.object(SCALLOP_MARKET),
          suiCoin,
          tx.object('0x6'), // Clock
        ],
        typeArguments: [SUI_TYPE],
      });
      
      tx.transferObjects([sCoin], tx.pure.address(agentAddress));
      
      console.log('Signing and executing transaction...');
      const res = await suiClient.signAndExecuteTransaction({
        signer: agentKeypair,
        transaction: tx,
        options: { showEffects: true },
      });
      
      if (res.effects?.status.status === 'success') {
        console.log(`✓ Mint Successful! Transaction Digest: ${res.digest}`);
        successPackage = pkg;
        break;
      } else {
        console.error(`✗ Mint Transaction executed but failed: ${res.effects?.status.error}`);
      }
    } catch (err: any) {
      console.warn(`⚠ Failed to execute mint on package ${pkg}: ${err.message || err}`);
    }
  }

  if (!successPackage) {
    console.error('\n✗ All tested Scallop packages failed to execute mint.');
    return;
  }

  // 3. Find the minted sSUI Coin object
  console.log('\nQuerying agent wallet for minted sSUI Coin objects...');
  const coins = await suiClient.getCoins({
    owner: agentAddress,
    coinType: sSUI_TYPE
  });

  const sCoinObject = coins.data[0];
  if (!sCoinObject) {
    console.error('✗ No sSUI coin objects found in wallet. Cannot run redeem test.');
    return;
  }
  
  const sCoinId = sCoinObject.coinObjectId;
  const sCoinBalance = parseInt(sCoinObject.balance);
  console.log(`✓ Found sSUI Coin Object: ${sCoinId} with balance: ${sCoinBalance}`);

  // 4. Test Redeem (sSUI -> SUI)
  console.log(`\nTesting Redeem transaction using package: ${successPackage}...`);
  try {
    const tx = new Transaction();
    const [suiCoin] = tx.moveCall({
      target: `${successPackage}::redeem::redeem`,
      arguments: [
        tx.object(SCALLOP_VERSION),
        tx.object(SCALLOP_MARKET),
        tx.object(sCoinId),
        tx.object('0x6'), // Clock
      ],
      typeArguments: [SUI_TYPE],
    });
    
    tx.transferObjects([suiCoin], tx.pure.address(agentAddress));
    
    console.log('Signing and executing transaction...');
    const res = await suiClient.signAndExecuteTransaction({
      signer: agentKeypair,
      transaction: tx,
      options: { showEffects: true },
    });
    
    if (res.effects?.status.status === 'success') {
      console.log(`✓ Redeem Successful! Transaction Digest: ${res.digest}`);
      console.log('\n🎉 SCALLOP MAINNET YIELD-WRAPPING INTEGRATION VERIFIED 100% CORRECT!');
    } else {
      console.error(`✗ Redeem Transaction executed but failed: ${res.effects?.status.error}`);
    }
  } catch (err: any) {
    console.error(`✗ Failed to execute redeem transaction: ${err.message || err}`);
  }
}

runDirectTest().catch(console.error);
