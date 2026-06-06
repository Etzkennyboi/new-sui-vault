import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';

export interface TatumClientConfig {
  apiKey: string;
  rpcUrl: string;
}

export function createTatumClient(config: TatumClientConfig): SuiClient {
  const urlWithKey = `${config.rpcUrl.replace(/\/$/, '')}?apiKey=${config.apiKey}`;
  return new SuiClient({
    url: urlWithKey,
    network: 'mainnet'
  });
}
