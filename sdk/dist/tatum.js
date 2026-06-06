import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
export function createTatumClient(config) {
    const urlWithKey = `${config.rpcUrl.replace(/\/$/, '')}?apiKey=${config.apiKey}`;
    return new SuiClient({
        url: urlWithKey,
        network: 'mainnet'
    });
}
