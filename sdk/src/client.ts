import { SuiJsonRpcClient as SuiClient, SuiEvent } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';

const MIN_SQRT_PRICE = "4295048016";
const MAX_SQRT_PRICE = "79226673515401279992447579055";
import { WalrusClient } from './walrus.js';

export interface SDKConfig {
  packageId: string;
  factoryId: string;
  coinTypeA: string; // sSUI coin type
  coinTypeB: string; // sUSDC coin type
}

export class SuiSyndicateClient {
  private suiClient: SuiClient;
  private walrusClient: WalrusClient;
  private config: SDKConfig;

  // Scallop Constants on Sui Mainnet
  private SCALLOP_MARKET = '0xa757975255146dc9686aa823b7838b507f315d704f428cbadad2f4ea061939d9';
  private SCALLOP_VERSION = '0x07871c4b3c847a0f674510d4978d5cf6f960452795e8ff6f189fd2088a3f6ac7';
  private SCALLOP_PACKAGE = '0xde5c09ad171544aa3724dc67216668c80e754860f419136a68d78504eb2e2805';
  private SUI_TYPE = '0x2::sui::SUI';
  private USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

  constructor(suiClient: SuiClient, walrusClient: WalrusClient, config: SDKConfig) {
    this.suiClient = suiClient;
    this.walrusClient = walrusClient;
    this.config = config;
  }

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
    const strategyBlobId = await this.walrusClient.storeBlob(strategyDoc);
    const metadataBlobId = await this.walrusClient.storeBlob(metadataDoc);

    const tx = new Transaction();
    const strategyBytes = Array.from(Buffer.from(strategyBlobId, 'utf-8'));
    const metadataBytes = Array.from(Buffer.from(metadataBlobId, 'utf-8'));

    const [creatorCap] = tx.moveCall({
      target: `${this.config.packageId}::factory::create_vault`,
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
      arguments: [
        tx.object(this.config.factoryId),
        tx.pure.string(name),
        tx.pure(bcs.vector(bcs.u8()).serialize(strategyBytes)),
        tx.pure(bcs.vector(bcs.u8()).serialize(metadataBytes)),
      ],
    });

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

    const createdEvent = result.events?.find((e: SuiEvent) =>
      e.type.endsWith('::vault::VaultCreated')
    );

    const vaultId = (createdEvent?.parsedJson as any)?.vault_id;
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
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
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
      throw new Error('Failed to find AgentCap object ID in transaction response.');
    }

    return newAgentCapId;
  }

  /**
   * Deposits SUI, wraps it into sSUI via Scallop, and deposits sSUI into the Vault.
   */
  async depositSui(
    lpKeypair: Ed25519Keypair,
    vaultId: string,
    amountMist: number
  ): Promise<string> {
    const tx = new Transaction();

    // 1. Split raw SUI from gas
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

    // 2. Mint sSUI on Scallop
    const [sCoinA] = tx.moveCall({
      target: `${this.SCALLOP_PACKAGE}::mint::mint`,
      arguments: [
        tx.object(this.SCALLOP_VERSION),
        tx.object(this.SCALLOP_MARKET),
        suiCoin,
        tx.object('0x6'), // Clock
      ],
      typeArguments: [this.SUI_TYPE],
    });

    // 3. Deposit sSUI (Asset A) into the vault
    const [shareObj] = tx.moveCall({
      target: `${this.config.packageId}::vault::deposit_a`,
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
      arguments: [tx.object(vaultId), sCoinA],
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

    const shareObjectId = result.effects.created?.find((c: any) =>
      c.owner.AddressOwner === lpKeypair.getPublicKey().toSuiAddress()
    )?.reference.objectId;

    if (!shareObjectId) {
      throw new Error('Failed to find SyndicateShare object ID in deposit response.');
    }

    return shareObjectId;
  }

  /**
   * LP burns shares, withdraws sSUI + sUSDC from Vault, and unwraps them on Scallop back to raw SUI + USDC.
   */
  async ragequit(
    lpKeypair: Ed25519Keypair,
    vaultId: string,
    shareObjectId: string
  ): Promise<{ suiReceived: number; usdcReceived: number }> {
    const tx = new Transaction();

    // 1. Withdraw sSUI and sUSDC from the vault
    const [sCoinA, sCoinB] = tx.moveCall({
      target: `${this.config.packageId}::vault::ragequit`,
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
      arguments: [tx.object(vaultId), tx.object(shareObjectId)],
    });

    // 2. Redeem sSUI back to SUI
    const [suiCoin] = tx.moveCall({
      target: `${this.SCALLOP_PACKAGE}::redeem::redeem`,
      arguments: [
        tx.object(this.SCALLOP_VERSION),
        tx.object(this.SCALLOP_MARKET),
        sCoinA,
        tx.object('0x6'),
      ],
      typeArguments: [this.SUI_TYPE],
    });

    // 3. Redeem sUSDC back to USDC
    const [usdcCoin] = tx.moveCall({
      target: `${this.SCALLOP_PACKAGE}::redeem::redeem`,
      arguments: [
        tx.object(this.SCALLOP_VERSION),
        tx.object(this.SCALLOP_MARKET),
        sCoinB,
        tx.object('0x6'),
      ],
      typeArguments: [this.USDC_TYPE],
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

    const ragequitEvent = result.events?.find((e: SuiEvent) =>
      e.type.endsWith('::vault::Ragequit')
    );

    const parsed = ragequitEvent?.parsedJson as any;
    return {
      suiReceived: parseInt(parsed?.amount_a_returned || '0'),
      usdcReceived: parseInt(parsed?.amount_b_returned || '0'),
    };
  }

  /**
   * Executes atomic rebalance: Borrows sSUI -> Redeems raw SUI -> Swaps Cetus SUI to USDC -> Mints sUSDC -> Returns sUSDC.
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

    // 1. Flash borrow sSUI from the vault
    const [sCoinA, receipt] = tx.moveCall({
      target: `${this.config.packageId}::actions::initiate_swap_a`,
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
      arguments: [
        tx.object(vaultId),
        tx.object(agentCapId),
        tx.pure.u64(amountSuiMist)
      ],
    });

    // 2. Redeem sSUI back to raw SUI on Scallop
    const [suiCoin] = tx.moveCall({
      target: `${this.SCALLOP_PACKAGE}::redeem::redeem`,
      arguments: [
        tx.object(this.SCALLOP_VERSION),
        tx.object(this.SCALLOP_MARKET),
        sCoinA,
        tx.object('0x6'),
      ],
      typeArguments: [this.SUI_TYPE],
    });

    // 3. Swap SUI to USDC on Cetus
    const CETUS_PACKAGE_ID = '0x75b2e9ecad34944b8d0c874e568c90db0cf9437f0d7392abfd4cb902972f3e40';

    const [balanceAOut, balanceBOut, swapReceipt] = tx.moveCall({
      target: `${CETUS_PACKAGE_ID}::pool::flash_swap`,
      arguments: [
        tx.object(cetusGlobalConfigId),
        tx.object(cetusPoolId),
        tx.pure.bool(false), // a2b: false (SUI to USDC)
        tx.pure.bool(true), // by_amount_in
        tx.pure.u64(amountSuiMist),
        tx.pure.u128(MAX_SQRT_PRICE.toString()),
        tx.object('0x6'),
      ],
      typeArguments: [this.USDC_TYPE, this.SUI_TYPE],
    });

    const suiBalanceIn = tx.moveCall({
      target: '0x2::coin::into_balance',
      arguments: [suiCoin],
      typeArguments: [this.SUI_TYPE],
    });

    const emptyUsdcBalance = tx.moveCall({
      target: '0x2::balance::zero',
      typeArguments: [this.USDC_TYPE],
    });

    tx.moveCall({
      target: `${CETUS_PACKAGE_ID}::pool::repay_flash_swap`,
      arguments: [
        tx.object(cetusGlobalConfigId),
        tx.object(cetusPoolId),
        emptyUsdcBalance,
        suiBalanceIn,
        swapReceipt,
      ],
      typeArguments: [this.USDC_TYPE, this.SUI_TYPE],
    });

    const usdcCoin = tx.moveCall({
      target: '0x2::coin::from_balance',
      arguments: [balanceAOut],
      typeArguments: [this.USDC_TYPE],
    });

    tx.moveCall({
      target: '0x2::balance::destroy_zero',
      arguments: [balanceBOut],
      typeArguments: [this.SUI_TYPE],
    });

    // 4. Mint sUSDC on Scallop
    const [sCoinB] = tx.moveCall({
      target: `${this.SCALLOP_PACKAGE}::mint::mint`,
      arguments: [
        tx.object(this.SCALLOP_VERSION),
        tx.object(this.SCALLOP_MARKET),
        usdcCoin,
        tx.object('0x6'),
      ],
      typeArguments: [this.USDC_TYPE],
    });

    // 5. Repay Flash Loan returning sUSDC
    tx.moveCall({
      target: `${this.config.packageId}::actions::resolve_swap_a`,
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
      arguments: [
        tx.object(vaultId),
        receipt,
        sCoinB
      ],
    });

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
   * Executes atomic rebalance: Borrows sUSDC -> Redeems raw USDC -> Swaps Cetus USDC to SUI -> Mints sSUI -> Returns sSUI.
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

    // 1. Flash borrow sUSDC from the vault
    const [sCoinB, receipt] = tx.moveCall({
      target: `${this.config.packageId}::actions::initiate_swap_b`,
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
      arguments: [
        tx.object(vaultId),
        tx.object(agentCapId),
        tx.pure.u64(amountUsdcUnits)
      ],
    });

    // 2. Redeem sUSDC back to raw USDC on Scallop
    const [usdcCoin] = tx.moveCall({
      target: `${this.SCALLOP_PACKAGE}::redeem::redeem`,
      arguments: [
        tx.object(this.SCALLOP_VERSION),
        tx.object(this.SCALLOP_MARKET),
        sCoinB,
        tx.object('0x6'),
      ],
      typeArguments: [this.USDC_TYPE],
    });

    // 3. Swap USDC to SUI on Cetus
    const CETUS_PACKAGE_ID = '0x75b2e9ecad34944b8d0c874e568c90db0cf9437f0d7392abfd4cb902972f3e40';

    const [balanceAOut, balanceBOut, swapReceipt] = tx.moveCall({
      target: `${CETUS_PACKAGE_ID}::pool::flash_swap`,
      arguments: [
        tx.object(cetusGlobalConfigId),
        tx.object(cetusPoolId),
        tx.pure.bool(true), // a2b: true (USDC to SUI)
        tx.pure.bool(true), // by_amount_in
        tx.pure.u64(amountUsdcUnits),
        tx.pure.u128(MIN_SQRT_PRICE.toString()),
        tx.object('0x6'),
      ],
      typeArguments: [this.USDC_TYPE, this.SUI_TYPE],
    });

    const emptySuiBalance = tx.moveCall({
      target: '0x2::balance::zero',
      typeArguments: [this.SUI_TYPE],
    });

    const usdcBalanceIn = tx.moveCall({
      target: '0x2::coin::into_balance',
      arguments: [usdcCoin],
      typeArguments: [this.USDC_TYPE],
    });

    tx.moveCall({
      target: `${CETUS_PACKAGE_ID}::pool::repay_flash_swap`,
      arguments: [
        tx.object(cetusGlobalConfigId),
        tx.object(cetusPoolId),
        usdcBalanceIn,
        emptySuiBalance,
        swapReceipt,
      ],
      typeArguments: [this.USDC_TYPE, this.SUI_TYPE],
    });

    const suiCoin = tx.moveCall({
      target: '0x2::coin::from_balance',
      arguments: [balanceBOut],
      typeArguments: [this.SUI_TYPE],
    });

    tx.moveCall({
      target: '0x2::balance::destroy_zero',
      arguments: [balanceAOut],
      typeArguments: [this.USDC_TYPE],
    });

    // 4. Mint sSUI on Scallop
    const [sCoinA] = tx.moveCall({
      target: `${this.SCALLOP_PACKAGE}::mint::mint`,
      arguments: [
        tx.object(this.SCALLOP_VERSION),
        tx.object(this.SCALLOP_MARKET),
        suiCoin,
        tx.object('0x6'),
      ],
      typeArguments: [this.SUI_TYPE],
    });

    // 5. Repay Flash Loan returning sSUI
    tx.moveCall({
      target: `${this.config.packageId}::actions::resolve_swap_b`,
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
      arguments: [
        tx.object(vaultId),
        receipt,
        sCoinA
      ],
    });

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
   * Anchor execution records to Walrus.
   */
  async anchorLog(
    agentKeypair: Ed25519Keypair,
    vaultId: string,
    agentCapId: string,
    epoch: number,
    logData: object
  ): Promise<string> {
    const blobId = await this.walrusClient.storeBlob(logData);
    const tx = new Transaction();
    const blobIdBytes = Array.from(Buffer.from(blobId, 'utf-8'));

    tx.moveCall({
      target: `${this.config.packageId}::vault::anchor_log`,
      typeArguments: [this.config.coinTypeA, this.config.coinTypeB],
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
   * Reads Vault state from Sui Mainnet.
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
    const strategyBlob = Buffer.from(fields.walrus_strategy_blob).toString('utf-8');
    const metadataBlob = Buffer.from(fields.walrus_metadata_blob).toString('utf-8');

    return {
      id: vaultId,
      name: fields.name,
      creator: fields.creator,
      suiBalance: parseInt(fields.balance_a), // balance of A (sSUI)
      usdcBalance: parseInt(fields.balance_b), // balance of B (sUSDC)
      totalShares: parseInt(fields.total_shares),
      strategyBlobId: strategyBlob,
      metadataBlobId: metadataBlob,
      paused: fields.paused,
    };
  }

  /**
   * Fetches chronological history of ActionLogs from Walrus.
   */
  async getVaultLogs(vaultId: string): Promise<any[]> {
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

    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }
}
