import { SuiClient } from '@mysten/sui/client';
async function main() {
  const client = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  const bals = await client.getAllBalances({ owner: '0x5a72bd3ade781d5e65b132dd5eef6278a059f61d5034c7944f06df0b3cc6abfb' });
  console.log(JSON.stringify(bals, null, 2));
}
main();
