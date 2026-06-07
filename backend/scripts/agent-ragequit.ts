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
  const PACKAGE_ID = '0x8509610948b6437c3a9dd841af6f1083a3481adaa521625d18c90d08e05b10e9';
  const VAULT_ID = '0x287a655c5e28dfcb01f1b4d139852986dab7f1dcfb46282f5b58ed70153d19c8';
  const TARGET_COIN = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
  
  const agentAddress = agentKeypair.getPublicKey().toSuiAddress();
  console.log(`Fetching Share objects for Agent ${agentAddress}...`);
  
  const objectsReq = await client.getOwnedObjects({
    owner: agentAddress,
    filter: { StructType: `${PACKAGE_ID}::vault::SyndicateShare` },
    options: { showContent: true }
  });
  
  const vaultShares = objectsReq.data.filter(obj => {
    const fields = (obj.data?.content as any)?.fields;
    return fields?.vault_id === VAULT_ID;
  });
  
  if (vaultShares.length === 0) {
    console.log('Agent has NO share objects for this vault!');
    return;
  }
  
  const tx = new Transaction();
  
  for (const share of vaultShares) {
    const shareId = share.data?.objectId;
    console.log(`Burning Share: ${shareId}`);
    
    const [suiCoin, targetCoin] = tx.moveCall({
      target: `${PACKAGE_ID}::vault::ragequit`,
      arguments: [
        tx.object(VAULT_ID),
        tx.object(shareId as string)
      ],
      typeArguments: [TARGET_COIN]
    });
    
    tx.transferObjects([suiCoin, targetCoin], tx.pure.address(agentAddress));
  }
  
  console.log(`Executing Ragequit...`);
  const res = await client.signAndExecuteTransaction({
    signer: agentKeypair,
    transaction: tx,
    options: { showEffects: true }
  });
  
  console.log(`Ragequit Executed! Digest: ${res.digest}`);
  console.log(`Status: ${res.effects?.status.status}`);
}

main();
