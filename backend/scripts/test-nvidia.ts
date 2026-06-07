import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

async function testNvidia() {
  console.log("Using API key prefix:", DEEPSEEK_API_KEY.slice(0, 10) + "...");
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  
  console.log("Sending minimal payload to deepseek-ai/deepseek-v4-flash...");
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-ai/deepseek-v4-flash',
        messages: [
          { role: 'user', content: 'Say hello.' }
        ]
      })
    });
    
    console.log("Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Response text:", text);
  } catch (err: any) {
    console.error("Error:", err);
  }
}

testNvidia();
