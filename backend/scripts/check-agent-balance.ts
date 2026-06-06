import * as dotenv from 'dotenv';
import * as path from 'path';
import { createTatumClient } from '../../sdk/src/tatum';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function checkBalance() {
  try {
    const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
    if (!PRIVATE_KEY) {
      console.log('No PRIVATE_KEY found in .env');
      return;
    }

    const keypair = Ed25519Keypair.fromSecretKey(PRIVATE_KEY);
    const address = keypair.getPublicKey().toSuiAddress();
    console.log(`Agent Address: ${address}`);

    const client = createTatumClient({ apiKey: process.env.TATUM_API_KEY || '', rpcUrl: 'https://sui-mainnet.gateway.tatum.io' });
    const balance = await client.getBalance({ owner: address });
    
    console.log(`Agent Balance: ${Number(balance.totalBalance) / 1e9} SUI`);
  } catch (err) {
    console.error('Failed to check balance:', err);
  }
}

checkBalance();
