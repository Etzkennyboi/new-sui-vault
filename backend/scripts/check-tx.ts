import * as dotenv from 'dotenv';
import * as path from 'path';
import { createTatumClient } from '../../sdk/src/tatum';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function checkTx() {
  try {
    const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
    const SUI_MAINNET_RPC = process.env.SUI_MAINNET_RPC || 'https://sui-mainnet.gateway.tatum.io';
    
    const client = createTatumClient({ apiKey: TATUM_API_KEY, rpcUrl: SUI_MAINNET_RPC });
    const txDigest = 'GGNmVnpWRiZLQaeevE7V6hT1csJryH68ssBtDN4zDQiM';
    
    console.log(`Fetching transaction ${txDigest}...`);
    const tx = await client.getTransactionBlock({
      digest: txDigest,
      options: { showEffects: true, showObjectChanges: true, showInput: true, showBalanceChanges: true }
    });
    
    console.log(JSON.stringify(tx.balanceChanges, null, 2));
    console.log(JSON.stringify(tx.objectChanges, null, 2));
    
  } catch (err) {
    console.error('Failed to fetch transaction:', err);
  }
}

checkTx();
