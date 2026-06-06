import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

async function listModels() {
  console.log('Fetching available models from NVIDIA API...');
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    console.log('Available models:');
    const models = data.data?.map((m: any) => m.id) || [];
    console.log(models.filter((m: string) => m.toLowerCase().includes('deepseek')));
  } catch (err: any) {
    console.error('Error listing models:', err.message);
  }
}

listModels();
