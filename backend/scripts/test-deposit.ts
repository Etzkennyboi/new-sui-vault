import * as dotenv from 'dotenv';
import * as path from 'path';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '0x8509610948b6437c3a9dd841af6f1083a3481adaa521625d18c90d08e05b10e9';
const VAULT_ID = '0xadd7421d3d113e9078f64e6ef53411547a0e07eb93e75717a208b110aea3f84e'; // The Safe 50/50 Rebalancer
const USDC_TYPE = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN';

async function testDeposit() {
  console.log('Testing deposit on Mainnet...');
  
  const client = new SuiClient({ url: 'https://sui-mainnet.gateway.tatum.io/?apiKey=t-6a22c2720fcb2bf60e547f9d-e95177e91a1848e3997eae67' });
  
  const { secretKey } = decodeSuiPrivateKey(PRIVATE_KEY);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  
  console.log(`Using Address: ${keypair.toSuiAddress()}`);

  const tx = new Transaction();
  
  // Deposit 0.1 SUI
  const amountMist = 0.1 * 1e9;
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

  const [shareObj] = tx.moveCall({
    target: `${PACKAGE_ID}::vault::deposit_sui`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(VAULT_ID), suiCoin],
  });

  tx.transferObjects([shareObj], tx.pure.address(keypair.toSuiAddress()));

  console.log('Signing and executing transaction...');
  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log(`SUCCESS! Transaction Digest: ${result.digest}`);
    console.log(`Status: ${result.effects?.status.status}`);
  } catch (e: any) {
    console.error('FAILED TO DEPOSIT:', e);
  }
}

testDeposit();
