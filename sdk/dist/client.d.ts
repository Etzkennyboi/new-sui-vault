import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { WalrusClient } from './walrus.js';
export interface SDKConfig {
    packageId: string;
    factoryId: string;
    targetCoinType: string;
}
export declare class SuiSyndicateClient {
    private suiClient;
    private walrusClient;
    private config;
    constructor(suiClient: SuiClient, walrusClient: WalrusClient, config: SDKConfig);
    /**
     * Helper to parse bech32 private keys (suiprivkey...) into a Keypair object.
     */
    static getKeypairFromPrivateKey(privateKey: string): Ed25519Keypair;
    /**
     * Deploys a new Vault via the Factory, uploading strategy & metadata to Walrus.
     */
    createVault(creatorKeypair: Ed25519Keypair, name: string, strategyDoc: object, metadataDoc: object): Promise<{
        vaultId: string;
        creatorCapId: string;
    }>;
    /**
     * Issues an AgentCap to a specific address, granting them swap permissions.
     */
    issueAgentCap(creatorKeypair: Ed25519Keypair, creatorCapId: string, vaultId: string, agentAddress: string, spendLimitPerTx: number, spendLimitDaily: number): Promise<string>;
    /**
     * Deposits SUI into the vault, receiving LP Shares in return.
     */
    depositSui(lpKeypair: Ed25519Keypair, vaultId: string, amountMist: number): Promise<string>;
    /**
     * LP burns shares and exits with pro-rata SUI + USDC balance pool.
     */
    ragequit(lpKeypair: Ed25519Keypair, vaultId: string, shareObjectId: string): Promise<{
        suiReceived: number;
        usdcReceived: number;
    }>;
    /**
     * Executes a real concentrated liquidity swap from SUI to USDC on Cetus using the Flash Loan pattern.
     */
    executeSwapCetus(agentKeypair: Ed25519Keypair, vaultId: string, agentCapId: string, amountSuiMist: number, minUsdcOutUnits: number, cetusPoolId: string, cetusGlobalConfigId: string): Promise<string>;
    /**
     * Executes a real concentrated liquidity swap from USDC to SUI on Cetus using the Flash Loan pattern.
     */
    executeSwapUsdcToSuiCetus(agentKeypair: Ed25519Keypair, vaultId: string, agentCapId: string, amountUsdcUnits: number, minSuiOutMist: number, cetusPoolId: string, cetusGlobalConfigId: string): Promise<string>;
    /**
     * Anchor execution records to Walrus and register pointer on-chain.
     */
    anchorLog(agentKeypair: Ed25519Keypair, vaultId: string, agentCapId: string, epoch: number, logData: object): Promise<string>;
    /**
     * Reads standard Vault fields from Tatum SUI ledger.
     */
    getVaultState(vaultId: string): Promise<{
        id: string;
        name: any;
        creator: any;
        suiBalance: number;
        usdcBalance: number;
        totalShares: number;
        strategyBlobId: string;
        metadataBlobId: string;
        paused: any;
    }>;
    /**
     * Fetches the complete chronological history of ActionLogs from Walrus.
     */
    getVaultLogs(vaultId: string): Promise<any[]>;
}
