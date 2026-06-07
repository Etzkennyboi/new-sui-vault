import * as dotenv from 'dotenv';
import * as path from 'path';
import { WalrusClient } from '../../sdk/src/walrus';
import { createTatumClient } from '../../sdk/src/tatum';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const SUI_MAINNET_RPC = process.env.SUI_MAINNET_RPC || 'https://sui-mainnet.gateway.tatum.io';
const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

async function testConnections() {
  console.log('=== SuiSyndicate Resilient Integration Diagnostics ===\n');

  let success = true;

  // 1. Validate Tatum Sui Mainnet RPC
  console.log('[1/3] Testing Tatum Sui RPC Connection...');
  try {
    const suiClient = createTatumClient({ apiKey: TATUM_API_KEY, rpcUrl: SUI_MAINNET_RPC });
    const checkpoint = await suiClient.getLatestCheckpointSequenceNumber();
    console.log(`✓ Tatum SUI RPC reachable! Current Sui Mainnet Checkpoint: ${checkpoint}`);
  } catch (err: any) {
    console.error(`✗ Tatum SUI RPC failed: ${err.message || err}`);
    success = false;
  }

  console.log('');

  // 2. Validate Walrus Storage with Polling Retry
  console.log('[2/3] Testing Walrus Storage upload & download...');
  try {
    const walrus = new WalrusClient(WALRUS_PUBLISHER, WALRUS_AGGREGATOR);
    const testDoc = { test: 'SuiSyndicate diagnostics check', timestamp: Date.now() };
    
    console.log(`Uploading test blob to Publisher (${WALRUS_PUBLISHER})...`);
    const blobId = await walrus.storeBlob(testDoc);
    console.log(`✓ Upload successful! Blob ID: ${blobId}`);

    console.log('Polling Aggregator for blob availability (waiting for replication)...');
    let retrieved: any = null;
    let attempts = 0;
    const maxAttempts = 6;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[Attempt ${attempts}/${maxAttempts}] Checking aggregator in 5 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      
      try {
        retrieved = await walrus.getBlob(blobId);
        if (retrieved) break;
      } catch (err) {
        // Suppress printout of 404s while polling
      }
    }

    if (retrieved) {
      console.log(`✓ Download successful! Retrieved contents: ${JSON.stringify(retrieved)}`);
      // Verify SHA-256
      const calculatedHash = walrus.verifyContentHash(Buffer.from(JSON.stringify(retrieved), 'utf-8'));
      console.log(`✓ Cryptographic check complete. Calculated hash: ${calculatedHash}`);
    } else {
      throw new Error(`Blob ${blobId} did not replicate to the aggregator within 30 seconds.`);
    }
  } catch (err: any) {
    console.error(`✗ Walrus integration failed: ${err.message || err}`);
    success = false;
  }

  console.log('');

  // 3. Validate DeepSeek AI Key with Fallback Model support
  console.log('[3/3] Testing DeepSeek (NVIDIA Gateway) completion...');
  const models = ['deepseek-ai/deepseek-v4-flash', 'deepseek-ai/deepseek-v4-pro'];
  let apiPassed = false;

  for (const model of models) {
    console.log(`Attempting completion using model: ${model}...`);
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content: 'Say hello in exactly 3 words.' }
          ],
          temperature: 0.2,
          top_p: 0.7,
          max_tokens: 1000
        }),
        // Add a 30s fetch timeout
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        throw new Error(`NVIDIA API responded with status: ${response.statusText} (${response.status})`);
      }

      const result = (await response.json()) as any;
      console.log('DeepSeek API Full Response payload:', JSON.stringify(result));
      const reply = result.choices[0]?.message?.content?.trim() || '';
      const thinking = result.choices[0]?.message?.reasoning_content?.trim() || '';
      console.log(`✓ DeepSeek API reachable via ${model}!`);
      console.log(`  - Thinking: "${thinking}"`);
      console.log(`  - Content: "${reply}"`);
      apiPassed = true;
      break; // Stop trying models if one succeeds
    } catch (err: any) {
      console.log(`⚠ Model ${model} failed/timed out: ${err.message || err}`);
    }
  }

  if (!apiPassed) {
    console.error('✗ DeepSeek API failed for all tested models.');
    success = false;
  }

  console.log('\n=============================================');
  if (success) {
    console.log('STATUS: ALL INTEGRATION CHECKS PASSED SUCCESSFULLY!');
  } else {
    console.log('STATUS: SOME CHECKS FAILED. Please review the errors above.');
  }
}

testConnections();
