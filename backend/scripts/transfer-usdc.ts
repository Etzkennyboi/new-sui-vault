import * as dotenv from 'dotenv';
import * as path from 'path';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const decoded = decodeSuiPrivateKey(PRIVATE_KEY);
const agentKeypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
const client = new SuiJsonRpcClient({ url: 'https://fullnode.mainnet.sui.io:443' });

async function main() {
  const TARGET_ADDRESS = '0xb6302f12bea98691767fb74184c52848ed88413d65d8bf02271e121a4c4c3931';
  const NATIVE_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
  
  console.log(`Fetching USDC coins...`);
  const coins = await client.getCoins({
    owner: agentKeypair.getPublicKey().toSuiAddress(),
    coinType: NATIVE_USDC
  });
  
  if (coins.data.length === 0) {
    console.log('No USDC coins found to transfer.');
    return;
  }
  
  const tx = new Transaction();
  
  // Merge all coins of this type
  let primaryCoin = tx.object(coins.data[0].coinObjectId);
  if (coins.data.length > 1) {
    const mergeCoins = coins.data.slice(1).map(c => tx.object(c.coinObjectId));
    tx.mergeCoins(primaryCoin, mergeCoins);
  }
  
  // Transfer to target address
  tx.transferObjects([primaryCoin], tx.pure.address(TARGET_ADDRESS));
  
  console.log(`Executing transfer to ${TARGET_ADDRESS}...`);
  const res = await client.signAndExecuteTransaction({
    signer: agentKeypair,
    transaction: tx,
    options: { showEffects: true }
  });
  
  console.log(`Transfer Executed! Digest: ${res.digest}`);
  console.log(`Status: ${res.effects?.status.status}`);
}

main();
