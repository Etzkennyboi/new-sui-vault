import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
export interface TatumClientConfig {
    apiKey: string;
    rpcUrl: string;
}
export declare function createTatumClient(config: TatumClientConfig): SuiClient;
