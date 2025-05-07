// lib/wagmi.tsx
import { WagmiProvider, createConfig, http } from 'wagmi';
import { bsc, bscTestnet } from '@wagmi/chains';
import { injected } from 'wagmi/connectors';
import { ReactNode } from 'react';
import type { Chain } from 'wagmi';

// Define MaalChain Testnet
const maalChainTestnet: Chain = {
  id: 7863,
  name: 'MaalChain Testnet',
  network: 'maalchain-testnet',
  nativeCurrency: {
    name: 'Maal',
    symbol: 'MAAL',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://node2-testnet.maalscan.io'],
    },
    public: {
      http: ['https://node2-testnet.maalscan.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'MaalScan',
      url: 'https://new-testnet.maalscan.io/',
    },
  },
} as const;

// Define MaalChain V2
const maalChainV2: Chain = {
  id: 7862,
  name: 'MaalChain V2',
  network: 'maalchain-v2',
  nativeCurrency: {
    name: 'Maal',
    symbol: 'MAAL',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://node1-mainnet-new.maalscan.io'],
    },
    public: {
      http: ['https://node1-mainnet-new.maalscan.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'MaalScan',
      url: 'https://v2.maalscan.io/',
    },
  },
} as const;

// Create wagmi config
export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet, maalChainTestnet, maalChainV2],
  connectors: [injected({ target: 'metaMask' })],
  transports: {
    [bsc.id]: http('https://bsc-dataseed1.binance.org/'),
    [bscTestnet.id]: http('https://data-seed-prebsc-1-s1.binance.org:8545/'),
    [maalChainTestnet.id]: http('https://node2-testnet.maalscan.io'),
    [maalChainV2.id]: http('https://node1-mainnet-new.maalscan.io'),
  },
});

// Wrap your app with WagmiProvider
export function WagmiConfigProvider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
}