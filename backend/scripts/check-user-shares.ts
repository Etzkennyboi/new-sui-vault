import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { bcs } from '@mysten/sui/bcs';

async function main() {
  const client = new SuiJsonRpcClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  const PACKAGE_ID = '0x17c09d57a916cd46594c3ceee8bc6e326f53e6ed60abeb8817da3783a5cd60fa';
  const TARGET_ADDRESS = '0x5a72bd3ade781d5e65b132dd5eef6278a059f61d5034c7944f06df0b3cc6abfb';
  
  console.log(`Fetching Share objects for user ${TARGET_ADDRESS}...`);
  const objectsReq = await client.getOwnedObjects({
    owner: TARGET_ADDRESS,
    filter: { StructType: `${PACKAGE_ID}::vault::Share` },
    options: { showContent: true }
  });
  
  if (objectsReq.data.length === 0) {
    console.log('User has NO share objects!');
    return;
  }
  
  objectsReq.data.forEach((obj, i) => {
    const fields = (obj.data?.content as any)?.fields;
    console.log(`\nShare #${i + 1}`);
    console.log(`Object ID: ${obj.data?.objectId}`);
    console.log(`Vault ID: ${fields?.vault_id}`);
    console.log(`Shares Amount: ${fields?.shares}`);
  });
}

main();
