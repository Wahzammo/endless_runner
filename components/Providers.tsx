'use client';

import { http, createConfig, WagmiProvider } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBaseAccountSDK } from '@base-org/account';
import { ReactNode } from 'react';

const queryClient = new QueryClient();

// ─── Base Account SDK (Sub Accounts + Paymaster) ────────────
// Runs alongside wagmi — wagmi handles reads/score submission,
// the SDK handles sub-account creation and silent burns.
export const baseSDK = createBaseAccountSDK({
  appName: 'Base Runner: Psych-Out Arcade',
  appLogoUrl: null,
  appChainIds: [baseSepolia.id],
  subAccounts: {
    creation: 'on-connect',
    defaultAccount: 'sub',
    funding: 'manual', // no auto spend-permission popup
  },
  ...(process.env.NEXT_PUBLIC_PAYMASTER_URL
    ? { paymasterUrls: { [baseSepolia.id]: process.env.NEXT_PUBLIC_PAYMASTER_URL } }
    : {}),
});

// ─── Wagmi config (unchanged) ───────────────────────────────
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    coinbaseWallet({ appName: 'Base Runner' }),
    injected(),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={baseSepolia}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
