import { SuiJsonRpcClient as SuiClient, SuiEvent } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';
// Remove incompatible Cetus SDK import and hardcode the tick boundaries
const MIN_SQRT_PRICE = "4295048016";
const MAX_SQRT_PRICE = "79226673515401279992447579055";
import { WalrusClient } from './walrus.js';

export interface SDKConfig {
  packageId: string;
  factoryId: string;
  targetCoinType: string;
}

export class SuiSyndicateClient {
  private suiClient: SuiClient;
  private walrusClient: WalrusClient;
  private config: SDKConfig;

  constructor(suiClient: SuiClient, walrusClient: WalrusClient, config: SDKConfig) {
    this.suiClient = suiClient;
    this.walrusClient = walrusClient;
    this.config = config;
  }

  /**
   * Helper to parse bech32 private keys (suiprivkey...) into a Keypair object.
   */
  static getKeypairFromPrivateKey(privateKey: string): Ed25519Keypair {
    const decoded = decodeSuiPrivateKey(privateKey);
    return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  }

  /**
   * Deploys a new Vault via the Factory, uploading strategy & metadata to Walrus.
   */
  async createVault(
    creatorKeypair: Ed25519Keypair,
    name: string,
    strategyDoc: object,
    metadataDoc: object
  ): Promise<{ vaultId: string; creatorCapId: string }> {
    // 1. Store blobs on Walrus
    const strategyBlobId = await this.walrusClient.storeBlob(strategyDoc);
    const metadataBlobId = await this.walrusClient.storeBlob(metadataDoc);

    const tx = new Transaction();

    // Convert string inputs to vector<u8> array arguments
    const strategyBytes = Array.from(Buffer.from(strategyBlobId, 'utf-8'));
    const metadataBytes = Array.from(Buffer.from(metadataBlobId, 'utf-8'));

    const [creatorCap] = tx.moveCall({
      target: `${this.config.packageId}::factory::create_vault`,
      typeArguments: [this.config.targetCoinType],
      arguments: [
        tx.object(this.config.factoryId),
        tx.pure.string(name),
        tx.pure(bcs.vector(bcs.u8()).serialize(strategyBytes)),
        tx.pure(bcs.vector(bcs.u8()).serialize(metadataBytes)),
      ],
    });

    // Transfer CreatorCap to sender
    tx.transferObjects([creatorCap], tx.pure.address(creatorKeypair.getPublicKey().toSuiAddress()));

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: creatorKeypair,
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(`Create Vault failed: ${result.effects?.status.error}`);
    }

    // Parse Vault Created event
    const createdEvent = result.events?.find((e: SuiEvent) =>
      e.type.endsWith('::vault::VaultCreated')
    );

    const vaultId = (createdEvent?.parsedJson as any)?.vault_id;

    // Find the CreatorCap Object ID
    const creatorCapId = (result.objectChanges?.find(
      (change: any) =>
        change.type === 'created' && change.objectType.endsWith('::vault::CreatorCap')
    ) as any)?.objectId;

    if (!vaultId || !creatorCapId) {
      throw new Error('Failed to parse vault or creator cap object IDs from transaction.');
    }

    return { vaultId, creatorCapId };
  }

  /**
   * Issues an AgentCap to a specific address, granting them swap permissions.
   */
  async issueAgentCap(
    creatorKeypair: Ed25519Keypair,
    creatorCapId: string,
    vaultId: string,
    agentAddress: string,
    spendLimitPerTx: number,
    spendLimitDaily: number
  ): Promise<string> {
    const tx = new Transaction();

    const [agentCap] = tx.moveCall({
      target: `${this.config.packageId}::vault::issue_agent_cap`,
      typeArguments: [this.config.targetCoinType],
      arguments: [
        tx.object(creatorCapId),
        tx.object(vaultId),
        tx.pure.address(agentAddress),
        tx.pure.u64(spendLimitPerTx),
        tx.pure.u64(spendLimitDaily),
      ],
    });

    tx.transferObjects([agentCap], tx.pure.address(agentAddress));

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: creatorKeypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(`Issue Agent Cap failed: ${result.effects?.status.error}`);
    }

    const newAgentCapId = result.effects?.created?.find((c: any) =>
      c.owner.AddressOwner === agentAddress
    )?.reference.objectId;

    if (!newAgentCapId) {
      console.log(JSON.stringify(result.effects?.created, null, 2));
      throw new Error('Failed to find AgentCap object ID in transaction response.');
    }

    return newAgentCapId;
  }

  /**
   * Deposits SUI into the vault, receiving LP Shares in return.
   */
  async depositSui(
    lpKeypair: Ed25519Keypair,
    vaultId: string,
    amountMist: number
  ): Promise<string> {
    const tx = new Transaction();

    // Split SUI coin from gas
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

    const [shareObj] = tx.moveCall({
      target: `${this.config.packageId}::vault::deposit_sui`,
      typeArguments: [this.config.targetCoinType],
      arguments: [tx.object(vaultId), suiCoin],
    });

    tx.transferObjects([shareObj], tx.pure.address(lpKeypair.getPublicKey().toSuiAddress()));

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: lpKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(`Deposit SUI failed: ${result.effects?.status.error}`);
    }

    // Get created SyndicateShare object ID
    const shareObjectId = result.effects.created?.find((c: any) =>
      c.owner.AddressOwner === lpKeypair.getPublicKey().toSuiAddress()
    )?.reference.objectId;

    if (!shareObjectId) {
      throw new Error('Failed to find SyndicateShare object ID in deposit response.');
    }

    return shareObjectId;
  }

  /**
   * LP burns shares and exits with pro-rata SUI + USDC balance pool.
   */
  async ragequit(
    lpKeypair: Ed25519Keypair,
    vaultId: string,
    shareObjectId: string
  ): Promise<{ suiReceived: number; usdcReceived: number }> {
    const tx = new Transaction();

    const [suiCoin, usdcCoin] = tx.moveCall({
      target: `${this.config.packageId}::vault::ragequit`,
      typeArguments: [this.config.targetCoinType],
      arguments: [tx.object(vaultId), tx.object(shareObjectId)],
    });

    const recipient = tx.pure.address(lpKeypair.getPublicKey().toSuiAddress());
    tx.transferObjects([suiCoin, usdcCoin], recipient);

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: lpKeypair,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(`Ragequit failed: ${result.effects?.status.error}`);
    }

    // Parse Ragequit event
    const ragequitEvent = result.events?.find((e: SuiEvent) =>
      e.type.endsWith('::vault::Ragequit')
    );

    const parsed = ragequitEvent?.parsedJson as any;
    return {
      suiReceived: parseInt(parsed?.sui_returned || '0'),
      usdcReceived: parseInt(parsed?.target_returned || '0'),
    };
  }

  /**
   * Executes a real concentrated liquidity swap from SUI to USDC on Cetus using the Flash Loan pattern.
   */
  async executeSwapCetus(
    agentKeypair: Ed25519Keypair,
    vaultId: string,
    agentCapId: string,
    amountSuiMist: number,
    minUsdcOutUnits: number,
    cetusPoolId: string,
    cetusGlobalConfigId: string
  ): Promise<string> {
    const tx = new Transaction();

    // 1. Flash borrow SUI from the vault
    const [suiCoin, receipt] = tx.moveCall({
      target: `${this.config.packageId}::actions::initiate_swap_sui`,
      typeArguments: [this.config.targetCoinType],
      arguments: [
        tx.object(vaultId),
        tx.object(agentCapId),
        tx.pure.u64(amountSuiMist)
      ],
    });

    // 2. Execute swap on Cetus (B2A: SUI to USDC since Pool is USDC/SUI)
    const CETUS_PACKAGE_ID = '0x75b2e9ecad34944b8d0c874e568c90db0cf9437f0d7392abfd4cb902972f3e40';
    const SUI_TYPE = '0x2::sui::SUI';
    const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

    const [balanceAOut, balanceBOut, swapReceipt] = tx.moveCall({
      target: `${CETUS_PACKAGE_ID}::pool::flash_swap`,
      arguments: [
        tx.object(cetusGlobalConfigId),
        tx.object(cetusPoolId),
        tx.pure.bool(false), // a2b: false (B2A, SUI to USDC)
        tx.pure.bool(true), // by_amount_in: exact amount in
        tx.pure.u64(amountSuiMist), // amount
        tx.pure.u128(MAX_SQRT_PRICE.toString()), // sqrt_price_limit (MAX for B2A)
        tx.object('0x6'), // Clock ID
      ],
      typeArguments: [USDC_TYPE, SUI_TYPE],
    });

    const suiBalanceIn = tx.moveCall({
      target: '0x2::coin::into_balance',
      arguments: [suiCoin],
      typeArguments: [SUI_TYPE],
    });

    const emptyUsdcBalance = tx.moveCall({
      target: '0x2::balance::zero',
      typeArguments: [USDC_TYPE],
    });

    tx.moveCall({
      target: `${CETUS_PACKAGE_ID}::pool::repay_flash_swap`,
      arguments: [
        tx.object(cetusGlobalConfigId),
        tx.object(cetusPoolId),
        emptyUsdcBalance, // Balance A
        suiBalanceIn,     // Balance B
        swapReceipt,
      ],
      typeArguments: [USDC_TYPE, SUI_TYPE],
    });

    // We get USDC out, which is Balance A
    const usdcCoin = tx.moveCall({
      target: '0x2::coin::from_balance',
      arguments: [balanceAOut],
      typeArguments: [USDC_TYPE],
    });

    tx.moveCall({
      target: '0x2::balance::destroy_zero',
      arguments: [balanceBOut],
      typeArguments: [SUI_TYPE],
    });

    // 3. Return USDC to the vault, fulfilling the Flash Loan
    tx.moveCall({
      target: `${this.config.packageId}::actions::resolve_swap_sui`,
      typeArguments: [this.config.targetCoinType],
      arguments: [
        tx.object(vaultId),
        receipt,
        usdcCoin
      ],
    });

    // 4. Return immediately (no remainder transfer needed because we used exact input balance)
    const result = await this.suiClient.signAndExecuteTransaction({
      signer: agentKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(`Cetus Swap failed: ${result.effects?.status.error}`);
    }

    return result.digest;
  }

  /**
   * Executes a real concentrated liquidity swap from USDC to SUI on Cetus using the Flash Loan pattern.
   */
  async executeSwapUsdcToSuiCetus(
    agentKeypair: Ed25519Keypair,
    vaultId: string,
    agentCapId: string,
    amountUsdcUnits: number,
    minSuiOutMist: number,
    cetusPoolId: string,
    cetusGlobalConfigId: string
  ): Promise<string> {
    const tx = new Transaction();

    // 1. Flash borrow USDC from the vault
    const [usdcCoin, receipt] = tx.moveCall({
      target: `${this.config.packageId}::actions::initiate_swap_target`,
      typeArguments: [this.config.targetCoinType],
      arguments: [
        tx.object(vaultId),
        tx.object(agentCapId),
        tx.pure.u64(amountUsdcUnits)
      ],
    });

    // 2. Execute swap on Cetus (A2B: USDC to SUI since Pool is USDC/SUI)
    const CETUS_PACKAGE_ID = '0x75b2e9ecad34944b8d0c874e568c90db0cf9437f0d7392abfd4cb902972f3e40';
    const SUI_TYPE = '0x2::sui::SUI';
    const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

    const [balanceAOut, balanceBOut, swapReceipt] = tx.moveCall({
      target: `${CETUS_PACKAGE_ID}::pool::flash_swap`,
      arguments: [
        tx.object(cetusGlobalConfigId),
        tx.object(cetusPoolId),
        tx.pure.bool(true), // a2b: true (USDC to SUI)
        tx.pure.bool(true), // by_amount_in: exact amount in
        tx.pure.u64(amountUsdcUnits), // amount
        tx.pure.u128(MIN_SQRT_PRICE.toString()), // sqrt_price_limit (MIN for A2B)
        tx.object('0x6'), // Clock ID
      ],
      typeArguments: [USDC_TYPE, SUI_TYPE],
    });

    const emptySuiBalance = tx.moveCall({
      target: '0x2::balance::zero',
      typeArguments: [SUI_TYPE],
    });

    const usdcBalanceIn = tx.moveCall({
      target: '0x2::coin::into_balance',
      arguments: [usdcCoin],
      typeArguments: [USDC_TYPE],
    });

    tx.moveCall({
      target: `${CETUS_PACKAGE_ID}::pool::repay_flash_swap`,
      arguments: [
        tx.object(cetusGlobalConfigId),
        tx.object(cetusPoolId),
        usdcBalanceIn,    // Balance A
        emptySuiBalance,  // Balance B
        swapReceipt,
      ],
      typeArguments: [USDC_TYPE, SUI_TYPE],
    });

    // We get SUI out, which is Balance B
    const suiCoin = tx.moveCall({
      target: '0x2::coin::from_balance',
      arguments: [balanceBOut],
      typeArguments: [SUI_TYPE],
    });

    tx.moveCall({
      target: '0x2::balance::destroy_zero',
      arguments: [balanceAOut],
      typeArguments: [USDC_TYPE],
    });

    // 3. Return SUI to the vault, fulfilling the Flash Loan
    tx.moveCall({
      target: `${this.config.packageId}::actions::resolve_swap_target`,
      typeArguments: [this.config.targetCoinType],
      arguments: [
        tx.object(vaultId),
        receipt,
        suiCoin
      ],
    });

    // 4. Return immediately (no remainder transfer needed because we used exact input balance)
    const result = await this.suiClient.signAndExecuteTransaction({
      signer: agentKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(`Cetus USDC to SUI Swap failed: ${result.effects?.status.error}`);
    }

    return result.digest;
  }

  /**
   * Anchor execution records to Walrus and register pointer on-chain.
   */
  async anchorLog(
    agentKeypair: Ed25519Keypair,
    vaultId: string,
    agentCapId: string,
    epoch: number,
    logData: object
  ): Promise<string> {
    // 1. Store log details on Walrus
    const blobId = await this.walrusClient.storeBlob(logData);

    // 2. Register blob ID pointer on-chain in the Vault logs table
    const tx = new Transaction();
    const blobIdBytes = Array.from(Buffer.from(blobId, 'utf-8'));

    tx.moveCall({
      target: `${this.config.packageId}::vault::anchor_log`,
      typeArguments: [this.config.targetCoinType],
      arguments: [
        tx.object(vaultId),
        tx.object(agentCapId),
        tx.pure.u64(epoch),
        tx.pure(bcs.vector(bcs.u8()).serialize(blobIdBytes)),
      ],
    });

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: agentKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(`Log anchoring failed: ${result.effects?.status.error}`);
    }

    return blobId;
  }

  /**
   * Reads standard Vault fields from Tatum SUI ledger.
   */
  async getVaultState(vaultId: string) {
    const raw = await this.suiClient.getObject({
      id: vaultId,
      options: { showContent: true },
    });

    if (raw.error || !raw.data?.content) {
      throw new Error(`Failed to load vault ${vaultId}: ${JSON.stringify(raw.error)}`);
    }

    const fields = (raw.data.content as any).fields;

    // Convert vector<u8> arrays back to UTF-8 strings
    const strategyBlob = Buffer.from(fields.walrus_strategy_blob).toString('utf-8');
    const metadataBlob = Buffer.from(fields.walrus_metadata_blob).toString('utf-8');

    return {
      id: vaultId,
      name: fields.name,
      creator: fields.creator,
      suiBalance: parseInt(fields.sui_balance),
      usdcBalance: parseInt(fields.target_balance),
      totalShares: parseInt(fields.total_shares),
      strategyBlobId: strategyBlob,
      metadataBlobId: metadataBlob,
      paused: fields.paused,
    };
  }

  /**
   * Fetches the complete chronological history of ActionLogs from Walrus.
   */
  async getVaultLogs(vaultId: string): Promise<any[]> {
    // Query LogAnchored events emitted by this vault
    const events = await this.suiClient.queryEvents({
      query: {
        MoveEventType: `${this.config.packageId}::vault::LogAnchored`,
      },
    });

    const logs: any[] = [];
    for (const event of events.data) {
      const parsed = event.parsedJson as any;
      if (parsed.vault_id === vaultId) {
        try {
          const blobId = Buffer.from(parsed.blob_id).toString('utf-8');
          const content = await this.walrusClient.getBlob(blobId);
          logs.push({
            epoch: parseInt(parsed.epoch),
            agent: parsed.agent,
            blobId,
            ...content,
          });
        } catch (err) {
          console.error(`Failed to retrieve blob for event: ${JSON.stringify(parsed)}`, err);
        }
      }
    }

    return logs.sort((a, b) => b.timestamp - a.timestamp); // Chronological order
  }
}
