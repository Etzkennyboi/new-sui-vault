import * as dotenv from 'dotenv';
import * as path from 'path';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { createTatumClient } from '../../sdk/src/tatum';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const decoded = decodeSuiPrivateKey(PRIVATE_KEY);
const agentKeypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
const agentAddress = agentKeypair.getPublicKey().toSuiAddress();

const client = createTatumClient({ apiKey: process.env.TATUM_API_KEY || '', rpcUrl: 'https://sui-mainnet.gateway.tatum.io' });

async function swapToken(coinTypeIn: string, amountIn: string) {
  console.log(`\nSwapping ${amountIn} of ${coinTypeIn} to SUI...`);
  
  // 1. Get Quote
  const quoteReq = await fetch(`https://api.hop.ag/v1/quote?token_in=${coinTypeIn}&token_out=0x2::sui::SUI&amount_in=${amountIn}`);
  if (!quoteReq.ok) {
    console.error('Quote failed:', await quoteReq.text());
    return;
  }
  const quoteRes = await quoteReq.json();
  const trade = quoteRes;
  
  // 2. Build Tx
  const txReq = await fetch('https://api.hop.ag/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trade: trade,
      sui_address: agentAddress,
      gas_budget: 20000000,
      supported_fee_coins: ["0x2::sui::SUI"]
    })
  });
  
  if (!txReq.ok) {
    console.error('Swap build failed:', await txReq.text());
    return;
  }
  
  const txRes = await txReq.json();
  const txb = Transaction.from(txRes.transaction);
  
  // 3. Sign and Execute
  const res = await client.signAndExecuteTransaction({
    signer: agentKeypair,
    transaction: txb,
    options: { showEffects: true }
  });
  
  console.log(`Swap Executed! Digest: ${res.digest}`);
  console.log(`Status: ${res.effects?.status.status}`);
}

async function main() {
  console.log(`Agent Address: ${agentAddress}`);
  
  // Wormhole USDC
  await swapToken('0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN', '35671');
  
  // Native USDC
  await swapToken('0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', '2100044');
  
  console.log('\nAll swaps completed.');
}

main();
