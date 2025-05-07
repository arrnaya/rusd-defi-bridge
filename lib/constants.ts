import { Token } from '@/types';
import { Address } from 'viem';

export const CHAINS = [
    {
        id: 7863, 
        name: 'MaalChain', 
        logo: '/chains/maalchain.avif', 
        network: 'maalchain',
        nativeCurrency: { name: 'Maal', symbol: 'MAAL', decimals: 18 },
        rpcUrls: {
            default: { http: ['https://node2-testnet.maalscan.io'] },
            public: { http: ['https://node2-testnet.maalscan.io'] },
        },
        blockExplorers: {
            default: { name: 'MaalScan', url: 'https://new-testnet.maalscan.io/' },
        },
    },
    { 
        id: 97, 
        name: 'BSC Testnet Chain', 
        logo: '/chains/binance.webp',
        network: 'bsc',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: {
          default: { http: ['https://bsc-dataseed.binance.org/'] },
          public: { http: ['https://bsc-dataseed.binance.org/'] },
        },
        blockExplorers: {
          default: { name: 'BscScan', url: 'https://bscscan.com' },
        },
      },
    ];

export const TOKENS: Token[] = [
    {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // USDC on Ethereum
        symbol: 'USDT',
        name: 'USD Tether',
        decimals: 18,
    },
    {
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address, // DAI on Ethereum
        symbol: 'RUSD',
        name: 'Royal Dollar',
        decimals: 18,
    },
];

export const TOKEN_BRIDGE_ADDRESSES: Record<number, Address> = {
    97: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_A! as Address,
    7863: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_B! as Address,
};