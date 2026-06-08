import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { WalrusClient } from './walrus.js';
export interface SDKConfig {
    packageId: string;
    factoryId: string;
    coinTypeA: string;
    coinTypeB: string;
}
export declare class SuiSyndicateClient {
    private suiClient;
    private walrusClient;
    private config;
    private SCALLOP_MARKET;
    private SCALLOP_VERSION;
    private SCALLOP_PACKAGE;
    private SUI_TYPE;
    private USDC_TYPE;
    constructor(suiClient: SuiClient, walrusClient: WalrusClient, config: SDKConfig);
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
     * Deposits SUI, wraps it into sSUI via Scallop, and deposits sSUI into the Vault.
     */
    depositSui(lpKeypair: Ed25519Keypair, vaultId: string, amountMist: number): Promise<string>;
    /**
     * LP burns shares, withdraws sSUI + sUSDC from Vault, and unwraps them on Scallop back to raw SUI + USDC.
     */
    ragequit(lpKeypair: Ed25519Keypair, vaultId: string, shareObjectId: string): Promise<{
        suiReceived: number;
        usdcReceived: number;
    }>;
    /**
     * Executes atomic rebalance: Borrows sSUI -> Redeems raw SUI -> Swaps Cetus SUI to USDC -> Mints sUSDC -> Returns sUSDC.
     */
    executeSwapCetus(agentKeypair: Ed25519Keypair, vaultId: string, agentCapId: string, amountSuiMist: number, minUsdcOutUnits: number, cetusPoolId: string, cetusGlobalConfigId: string): Promise<string>;
    /**
     * Executes atomic rebalance: Borrows sUSDC -> Redeems raw USDC -> Swaps Cetus USDC to SUI -> Mints sSUI -> Returns sSUI.
     */
    executeSwapUsdcToSuiCetus(agentKeypair: Ed25519Keypair, vaultId: string, agentCapId: string, amountUsdcUnits: number, minSuiOutMist: number, cetusPoolId: string, cetusGlobalConfigId: string): Promise<string>;
    /**
     * Anchor execution records to Walrus.
     */
    anchorLog(agentKeypair: Ed25519Keypair, vaultId: string, agentCapId: string, epoch: number, logData: object): Promise<string>;
    /**
     * Reads Vault state from Sui Mainnet.
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
     * Fetches chronological history of ActionLogs from Walrus.
     */
    getVaultLogs(vaultId: string): Promise<any[]>;
}
