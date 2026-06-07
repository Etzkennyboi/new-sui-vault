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

const CETUS_PACKAGE_ID = '0x75b2e9ecad34944b8d0c874e568c90db0cf9437f0d7392abfd4cb902972f3e40';
const MIN_SQRT_PRICE = "4295048016";
const CETUS_GLOBAL_CONFIG = '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';

async function swapCetus(coinTypeIn: string, poolId: string, amountUnits: number) {
  console.log(`Swapping ${amountUnits} of ${coinTypeIn} on Cetus...`);
  
  const coins = await client.getCoins({
    owner: agentKeypair.getPublicKey().toSuiAddress(),
    coinType: coinTypeIn
  });
  
  if (coins.data.length === 0) {
    console.log('No coins found to swap.');
    return;
  }
  
  const tx = new Transaction();
  
  // Merge all coins of this type
  let primaryCoin = tx.object(coins.data[0].coinObjectId);
  if (coins.data.length > 1) {
    const mergeCoins = coins.data.slice(1).map(c => tx.object(c.coinObjectId));
    tx.mergeCoins(primaryCoin, mergeCoins);
  }
  
  const SUI_TYPE = '0x2::sui::SUI';
  
  const [balanceAOut, balanceBOut, swapReceipt] = tx.moveCall({
    target: `${CETUS_PACKAGE_ID}::pool::flash_swap`,
    arguments: [
      tx.object(CETUS_GLOBAL_CONFIG),
      tx.object(poolId),
      tx.pure.bool(true), // a2b: true (USDC to SUI)
      tx.pure.bool(true), // by_amount_in: exact amount in
      tx.pure.u64(amountUnits), // amount
      tx.pure.u128(MIN_SQRT_PRICE.toString()), // sqrt_price_limit (MIN for A2B)
      tx.object('0x6'), // Clock ID
    ],
    typeArguments: [coinTypeIn, SUI_TYPE],
  });

  const emptySuiBalance = tx.moveCall({
    target: '0x2::balance::zero',
    typeArguments: [SUI_TYPE],
  });

  // Split the primary coin into exact amount
  const [swapInputCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountUnits)]);

  const usdcBalanceIn = tx.moveCall({
    target: '0x2::coin::into_balance',
    arguments: [swapInputCoin],
    typeArguments: [coinTypeIn],
  });

  tx.moveCall({
    target: `${CETUS_PACKAGE_ID}::pool::repay_flash_swap`,
    arguments: [
      tx.object(CETUS_GLOBAL_CONFIG),
      tx.object(poolId),
      usdcBalanceIn,    // Balance A
      emptySuiBalance,  // Balance B
      swapReceipt,
    ],
    typeArguments: [coinTypeIn, SUI_TYPE],
  });

  // We get SUI out, which is Balance B
  const suiCoinOut = tx.moveCall({
    target: '0x2::coin::from_balance',
    arguments: [balanceBOut],
    typeArguments: [SUI_TYPE],
  });

  tx.moveCall({
    target: '0x2::balance::destroy_zero',
    arguments: [balanceAOut],
    typeArguments: [coinTypeIn],
  });

  // Transfer SUI to self
  tx.transferObjects([suiCoinOut], tx.pure.address(agentKeypair.getPublicKey().toSuiAddress()));

  const res = await client.signAndExecuteTransaction({
    signer: agentKeypair,
    transaction: tx,
    options: { showEffects: true }
  });
  
  console.log(`Swap Executed! Digest: ${res.digest}`);
  console.log(`Status: ${res.effects?.status.status}`);
}

async function main() {
  const NATIVE_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
  const NATIVE_POOL = '0x5eb2dfcdd1b15d2021328258f6d5ec081e9a028a59f26f7f50244ec4cc00ca68';
  
  const WORMHOLE_USDC = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN';
  const WORMHOLE_POOL = '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630';

  await swapCetus(WORMHOLE_USDC, WORMHOLE_POOL, 35671);
  await swapCetus(NATIVE_USDC, NATIVE_POOL, 2100044);
}

main();
