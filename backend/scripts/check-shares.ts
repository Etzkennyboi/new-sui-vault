import * as dotenv from 'dotenv';
import * as path from 'path';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const SUI_MAINNET_RPC = 'https://fullnode.mainnet.sui.io:443';
const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '';

async function run() {
  const client = new SuiClient({ url: SUI_MAINNET_RPC });
  const owner = '0x5a72bd3ade781d5e65b132dd5eef6278a059f61d5034c7944f06df0b3cc6abfb';
  
  const shares = await client.getOwnedObjects({
    owner,
    filter: { StructType: `${PACKAGE_ID}::vault::SyndicateShare` },
    options: { showContent: true }
  });

  console.log('SyndicateShares owned by agent:');
  for (const obj of shares.data) {
    if (obj.data && obj.data.content && 'fields' in obj.data.content) {
      console.log(`Object ID: ${obj.data.objectId}`);
      console.log(`Vault ID: ${obj.data.content.fields.vault_id}`);
    }
  }
}

run();
