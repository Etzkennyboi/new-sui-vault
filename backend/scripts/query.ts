async function main() {
  const req = await fetch('https://fullnode.mainnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getAllBalances',
      params: ['0x5a72bd3ade781d5e65b132dd5eef6278a059f61d5034c7944f06df0b3cc6abfb']
    })
  });
  const res = await req.json();
  console.log(JSON.stringify(res.result, null, 2));
}
main();
