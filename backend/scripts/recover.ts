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
  
  const vaultId = '0xd04f63d01f3d951427539558e75db68d183169f0418dc2a8063f297ecf8c7530';
  const shareObjectId = '0x7eef9374550beb0c1e37aade48bcb716c717a4afbc69057ac002804df31a4ce4';
  
  await sdk.ragequit(signer, vaultId, shareObjectId);
  console.log('Recovered!');
}
recover();
