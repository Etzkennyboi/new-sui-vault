import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

async function main() {
  const client = new SuiJsonRpcClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  const res = await client.queryTransactionBlocks({ filter: { ToAddress: '0x5a72bd3ade781d5e65b132dd5eef6278a059f61d5034c7944f06df0b3cc6abfb' }, options: { showInput: true }, limit: 1 });
  console.log('USER ADDRESS:', res.data[0].transaction?.data.sender);
}

main();
