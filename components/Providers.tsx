'use client';

import { http, createConfig, WagmiProvider } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBaseAccountSDK } from '@base-org/account';
import { ReactNode } from 'react';

const queryClient = new QueryClient();

// ─── Base Account SDK (Sub Accounts + Paymaster) ────────────
// Lazily initialized on first access — must not run during SSR
// because the SDK uses browser APIs (window, crypto, etc.).
let _baseSDK: ReturnType<typeof createBaseAccountSDK> | null = null;

export function getBaseSDK() {
  if (!_baseSDK && typeof window !== 'undefined') {
    _baseSDK = createBaseAccountSDK({
      appName: 'Base Runner: Psych-Out Arcade',
      appLogoUrl: null,
      appChainIds: [baseSepolia.id],
      subAccounts: {
        creation: 'on-connect',
        defaultAccount: 'sub',
        funding: 'manual',
      },
      ...(process.env.NEXT_PUBLIC_PAYMASTER_URL
        ? { paymasterUrls: { [baseSepolia.id]: process.env.NEXT_PUBLIC_PAYMASTER_URL } }
        : {}),
    });
  }
  return _baseSDK!;
}

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
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
