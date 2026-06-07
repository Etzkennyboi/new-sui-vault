import * as dotenv from 'dotenv';
import * as path from 'path';
import { SuiSyndicateClient } from '../../sdk/src/client';
import { WalrusClient } from '../../sdk/src/walrus';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const SUI_MAINNET_RPC = 'https://fullnode.mainnet.sui.io:443';
const PACKAGE_ID = process.env.FACTORY_PACKAGE_ID || '';
const FACTORY_ID = process.env.FACTORY_OBJECT_ID || '';
const TARGET_COIN_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

async function recover() {
  const { SuiClient } = await import('@mysten/sui/client');
  const suiClient = new SuiClient({ url: SUI_MAINNET_RPC });
  const walrusClient = new WalrusClient('', '');
  
  const sdk = new SuiSyndicateClient(suiClient, walrusClient, {
    packageId: PACKAGE_ID,
    factoryId: FACTORY_ID,
    targetCoinType: TARGET_COIN_TYPE,
  });

  const signer = SuiSyndicateClient.getKeypairFromPrivateKey(PRIVATE_KEY);
  
  const vaultId = '0x24a0e1a0fd4b41fa1717d1b8eb5ef97b09b6d0735e8b04065872fc2d3118d90f';
  const shareObjectId = '0xc56ed8310c379a29d47913cf0eb6c6532483d34089c15d482cd93fc2d1eb97f1';
  // Wait I didn't get the shareObjectId printed in the last run. Let me look it up via suiClient.
  
  const shares = await suiClient.getOwnedObjects({
    owner: signer.getPublicKey().toSuiAddress(),
    filter: { StructType: `${PACKAGE_ID}::vault::SyndicateShare` }
  });
  
  for (const obj of shares.data) {
    console.log(`Recovering share: ${obj.data?.objectId}`);
    try {
        await sdk.ragequit(signer, vaultId, obj.data?.objectId!);
        console.log('Recovered!');
    } catch(e) {}
  }
}
recover();
