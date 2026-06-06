"use client";

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';

const { networkConfig } = createNetworkConfig({
  mainnet: { 
    url: 'https://fullnode.mainnet.sui.io:443',
    network: 'mainnet'
  },
  testnet: {
    url: 'https://fullnode.testnet.sui.io:443',
    network: 'testnet'
  },
  devnet: {
    url: 'https://fullnode.devnet.sui.io:443',
    network: 'devnet'
  }
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider 
        networks={networkConfig} 
        defaultNetwork="mainnet"
      >
        <WalletProvider autoConnect>
          {mounted ? children : null}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
