import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function check() {
    const response = await fetch(`${process.env.SUI_MAINNET_RPC}?apiKey=${process.env.TATUM_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sui_getObject',
            params: [process.env.FACTORY_PACKAGE_ID]
        }),
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

check();
