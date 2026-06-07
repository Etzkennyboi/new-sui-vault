import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { bcs } from '@mysten/sui/bcs';

async function main() {
  const client = new SuiJsonRpcClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  const PACKAGE_ID = '0x8509610948b6437c3a9dd841af6f1083a3481adaa521625d18c90d08e05b10e9';
  const TARGET_ADDRESS = '0xb6302f12bea98691767fb74184c52848ed88413d65d8bf02271e121a4c4c3931';
  
  console.log(`Fetching Share objects for user ${TARGET_ADDRESS}...`);
  const objectsReq = await client.getOwnedObjects({
    owner: TARGET_ADDRESS,
    filter: { StructType: `${PACKAGE_ID}::vault::SyndicateShare` },
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
