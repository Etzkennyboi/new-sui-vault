import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const TATUM_API_KEY = process.env.TATUM_API_KEY || '';
const SUI_MAINNET_RPC = process.env.SUI_MAINNET_RPC || 'https://sui-mainnet.gateway.tatum.io';
const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const AI_MODEL = 'deepseek-ai/deepseek-v4-flash';
const PYTH_SUI_FEED = '0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744';

// =============================================
// Test Results Tracker
// =============================================
let passed = 0;
let failed = 0;

function logResult(name: string, success: boolean, detail?: string) {
  if (success) {
    passed++;
    console.log(`  ✅ PASS: ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// =============================================
// TEST 1: Tatum RPC Connection
// =============================================
async function testTatumRPC() {
  console.log('\n═══ TEST 1: Tatum Sui Mainnet RPC ═══');
  try {
    const url = `${SUI_MAINNET_RPC}?apiKey=${TATUM_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getLatestCheckpointSequenceNumber',
        params: []
      }),
    });

    const data = await response.json();
    logResult('Tatum RPC reachable', response.ok, `Status: ${response.status}`);
    logResult('Valid JSON-RPC response', !!data.result, `Latest Checkpoint: ${data.result}`);
    logResult('No RPC errors', !data.error, data.error ? JSON.stringify(data.error) : 'Clean');
  } catch (err: any) {
    logResult('Tatum RPC reachable', false, err.message);
  }
}

// =============================================
// TEST 2: DeepSeek V4 Flash via NVIDIA API
// =============================================
async function testDeepSeekAI() {
  console.log('\n═══ TEST 2: DeepSeek V4 Flash (NVIDIA API) ═══');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a JSON-only trading bot. Reply ONLY with raw JSON. No markdown, no backticks.'
          },
          {
            role: 'user',
            content: `Portfolio State:
- SUI Balance: 500000000000 MIST (500 SUI)
- USDC Balance: 400000000 units (400 USDC)
- Target SUI Allocation: 50%
- Target USDC Allocation: 50%
- Exchange Rate: 1 SUI = 3.50 USDC

Reply with JSON containing: should_rebalance (bool), action (string), amount_mist (number), reasoning (string).`
          },
        ],
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
        chat_template_kwargs: { thinking: true, reasoning_effort: 'high' }
      }),
    });

    logResult('NVIDIA API reachable', response.ok, `Status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      logResult('API response body', false, errText.substring(0, 200));
      return;
    }

    const result = await response.json();
    const message = result.choices[0]?.message;

    logResult('Response has choices', !!result.choices?.length, `Choices: ${result.choices?.length}`);
    logResult('Message content exists', !!message?.content, `Length: ${message?.content?.length || 0} chars`);

    // Check for reasoning/thinking
    const reasoning = message?.reasoning || message?.reasoning_content;
    logResult('Reasoning/thinking present', !!reasoning, reasoning ? `${reasoning.length} chars of reasoning` : 'No reasoning field returned');
    
    if (reasoning) {
      console.log('\n  --- DeepSeek Reasoning Chain (first 500 chars) ---');
      console.log(`  ${reasoning.substring(0, 500)}...`);
      console.log('  --- End Reasoning ---\n');
    }

    // Parse the JSON output
    let text = message?.content || '{}';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const decision = JSON.parse(text);
      logResult('Output is valid JSON', true);
      logResult('Has should_rebalance field', decision.should_rebalance !== undefined, `Value: ${decision.should_rebalance}`);
      logResult('Has action field', !!decision.action, `Value: ${decision.action}`);
      logResult('Has amount_mist field', decision.amount_mist !== undefined, `Value: ${decision.amount_mist}`);
      logResult('Has reasoning field', !!decision.reasoning, `Value: ${decision.reasoning?.substring(0, 100)}`);
      
      console.log('\n  Full AI Decision:');
      console.log(`  ${JSON.stringify(decision, null, 2)}`);
    } catch (parseErr) {
      logResult('Output is valid JSON', false, `Raw output: ${text.substring(0, 200)}`);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logResult('NVIDIA API reachable', false, 'Request timed out after 60s');
    } else {
      logResult('NVIDIA API reachable', false, err.message);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================
// TEST 3: Walrus Storage (Write + Read)
// =============================================
async function testWalrus() {
  console.log('\n═══ TEST 3: Walrus Decentralized Storage ═══');
  
  const testPayload = {
    test: true,
    timestamp: Date.now(),
    vault_id: '0xtest_backend_audit',
    agent: '0xtest_agent',
    action: 'test_connection',
    reasoning: 'Backend integration test for hackathon submission audit.'
  };

  // Write test
  try {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(JSON.stringify(testPayload));

    const storeResponse = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
    });

    logResult('Walrus Publisher reachable', storeResponse.ok, `Status: ${storeResponse.status}`);

    if (!storeResponse.ok) {
      const errText = await storeResponse.text();
      logResult('Walrus store blob', false, errText.substring(0, 200));
      return;
    }

    const storeResult = await storeResponse.json();
    const blobId = storeResult.newlyCreated?.blobObject?.blobId || storeResult.alreadyCertified?.blobId;
    logResult('Blob ID returned', !!blobId, `Blob ID: ${blobId}`);

    if (!blobId) return;

    // Read test
    const readResponse = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    logResult('Walrus Aggregator reachable', readResponse.ok, `Status: ${readResponse.status}`);

    if (readResponse.ok) {
      const arrayBuffer = await readResponse.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
      const readContent = JSON.parse(decoder.decode(arrayBuffer));
      
      logResult('Read content matches write', readContent.vault_id === testPayload.vault_id, `vault_id: ${readContent.vault_id}`);
      logResult('Timestamp preserved', readContent.timestamp === testPayload.timestamp, `ts: ${readContent.timestamp}`);
    }

    // Hash test (Web Crypto)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(testPayload)).buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    logResult('SHA-256 hash computed', hash.length === 64, `Hash: ${hash.substring(0, 32)}...`);

  } catch (err: any) {
    logResult('Walrus connection', false, err.message);
  }
}

// =============================================
// TEST 4: Pyth Hermes Oracle (Live SUI Price)
// =============================================
async function testPythOracle() {
  console.log('\n═══ TEST 4: Pyth Network Oracle (Hermes API) ═══');
  try {
    const response = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_SUI_FEED}`);
    logResult('Pyth Hermes API reachable', response.ok, `Status: ${response.status}`);

    if (!response.ok) return;

    const data = await response.json();
    const priceData = data.parsed?.[0]?.price;
    logResult('Price feed data returned', !!priceData, `Feed ID: ${PYTH_SUI_FEED.substring(0, 16)}...`);

    if (priceData) {
      const price = parseFloat(priceData.price) * Math.pow(10, priceData.expo);
      logResult('SUI/USD price parsed', price > 0, `$${price.toFixed(4)}`);
      logResult('Price is reasonable (between $0.10 and $100)', price > 0.1 && price < 100, `$${price.toFixed(4)}`);
      
      // Test the confidence interval
      const conf = parseFloat(priceData.conf) * Math.pow(10, priceData.expo);
      logResult('Confidence interval available', conf > 0, `±$${conf.toFixed(6)}`);
    }
  } catch (err: any) {
    logResult('Pyth Hermes API reachable', false, err.message);
  }
}

// =============================================
// TEST 5: Agent Wallet Keypair Derivation
// =============================================
async function testKeypair() {
  console.log('\n═══ TEST 5: Agent Wallet Keypair ═══');
  try {
    const { decodeSuiPrivateKey } = await import('@mysten/sui/cryptography');
    const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
    
    const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
    logResult('Private key loaded from .env', PRIVATE_KEY.length > 0, `Length: ${PRIVATE_KEY.length} chars`);
    logResult('Key starts with suiprivkey1', PRIVATE_KEY.startsWith('suiprivkey1'), PRIVATE_KEY.substring(0, 15) + '...');

    const decoded = decodeSuiPrivateKey(PRIVATE_KEY);
    logResult('Key decoded successfully', !!decoded.secretKey, `Schema: ${decoded.schema}`);

    const keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
    const address = keypair.getPublicKey().toSuiAddress();
    logResult('Sui address derived', address.startsWith('0x'), `Address: ${address}`);

    // Check balance on Mainnet
    const { SuiClient } = await import('@mysten/sui/client');
    const client = new SuiClient({ url: `${SUI_MAINNET_RPC}?apiKey=${TATUM_API_KEY}` });
    const balance = await client.getBalance({ owner: address });
    const suiBal = parseInt(balance.totalBalance) / 1e9;
    logResult('Mainnet balance fetched', true, `${suiBal.toFixed(4)} SUI`);
    
    if (suiBal === 0) {
      console.log('  ⚠️  WARNING: Agent wallet has 0 SUI. It needs gas to execute transactions!');
    }
  } catch (err: any) {
    logResult('Keypair derivation', false, err.message);
  }
}

// =============================================
// RUN ALL TESTS
// =============================================
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  SuiSyndicate Backend Integration Test Suite     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);

  await testTatumRPC();
  await testDeepSeekAI();
  await testWalrus();
  await testPythOracle();
  await testKeypair();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total       ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
