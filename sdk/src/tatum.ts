import { SuiClient } from '@mysten/sui/client';

export interface TatumClientConfig {
  apiKey: string;
  rpcUrl: string;
}

export function createTatumClient(config: TatumClientConfig): SuiClient {
  const urlWithKey = `${config.rpcUrl.replace(/\/$/, '')}?apiKey=${config.apiKey}`;
  return new SuiClient({
    url: urlWithKey
  });
}
