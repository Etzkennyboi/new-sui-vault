import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

async function main() {
  const client = new SuiJsonRpcClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  const PACKAGE_ID = '0x8509610948b6437c3a9dd841af6f1083a3481adaa521625d18c90d08e05b10e9';
  
  const res = await client.queryEvents({ 
    query: { MoveEventType: `${PACKAGE_ID}::vault::Ragequit` }, 
    limit: 10 
  });
  
  console.log('RAGEQUIT EVENTS:', JSON.stringify(res.data, null, 2));
}

main();
