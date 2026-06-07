import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

async function main() {
  const client = new SuiJsonRpcClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  const VAULT_ID = '0x287a655c5e28dfcb01f1b4d139852986dab7f1dcfb46282f5b58ed70153d19c8';
  
  const res = await client.queryTransactionBlocks({ 
    filter: { ChangedObject: VAULT_ID }, 
    options: { showInput: true, showEffects: true }, 
    limit: 5 
  });
  
  console.log('Recent transactions interacting with the vault:');
  res.data.forEach((tx, i) => {
    console.log(`[${i}] Digest: ${tx.digest} | Sender: ${tx.transaction?.data.sender} | Status: ${tx.effects?.status.status}`);
  });
}

main();
