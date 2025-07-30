'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { base } from 'viem/chains';   // only import Base
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['wallet'],
        appearance: {
          theme: 'light',
          accentColor: '#676FFF',
          walletChainType: 'ethereum-only',
          walletList: ['detected_ethereum_wallets'], // only external detected wallets
        },
        defaultChain: base,
        supportedChains: [base],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
