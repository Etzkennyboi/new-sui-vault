import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

async function main() {
  const client = new SuiJsonRpcClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  const PACKAGE_ID = '0x17c09d57a916cd46594c3ceee8bc6e326f53e6ed60abeb8817da3783a5cd60fa';
  
  const res = await client.queryEvents({ 
    query: { MoveEventType: `${PACKAGE_ID}::vault::Deposited` }, 
    limit: 10 
  });
  
  console.log('DEPOSIT EVENTS:', JSON.stringify(res.data, null, 2));
}

main();
