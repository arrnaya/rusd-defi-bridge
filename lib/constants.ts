import { Chains, Token } from '@/types';
import { Address } from 'viem';

export const CHAINS: Chains[] = [
    {
        id: 7863,
        name: 'MaalChain Testnet',
        logo: '/chains/maalchain.avif',
        network: 'maalchain-testnet',
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
        name: 'BSC Testnet',
        logo: '/chains/binance.webp',
        network: 'bsc-testnet',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: {
            default: { http: ['https://data-seed-prebsc-2-s1.bnbchain.org:8545/'] },
            public: { http: ['https://data-seed-prebsc-1-s1.binance.org:8545/'] },
        },
        blockExplorers: {
            default: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
        },
    },
    {
        id: 7862,
        name: 'MaalChain V2',
        logo: '/chains/maalchain.avif',
        network: 'maalchain-v2',
        nativeCurrency: { name: 'Maal', symbol: 'MAAL', decimals: 18 },
        rpcUrls: {
            default: { http: ['https://node1-mainnet-new.maalscan.io'] },
            public: { http: ['https://node1-mainnet-new.maalscan.io'] },
        },
        blockExplorers: {
            default: { name: 'MaalScan', url: 'https://v2.maalscan.io/' },
        },
    },
    {
        id: 56,
        name: 'BSC Mainnet',
        logo: '/chains/binance.webp',
        network: 'bsc',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: {
            default: { http: ['https://bsc-pokt.nodies.app/'] },
            public: { http: ['https://bsc-dataseed1.binance.org/'] },
        },
        blockExplorers: {
            default: { name: 'BscScan', url: 'https://bscscan.com' },
        },
    },
];

export const TOKENS: Token[] = [
    {
        address: '0x7Ce29FdAd93890d20dD5a168f88c9442559112cd' as Address,
        symbol: 'GCS',
        name: 'GCS',
        decimals: 18,
    },
    {
        address: '0xaCcfdB7767ddcF5f088ec9B8d726A76b29BAB768' as Address,
        symbol: 'RUSD',
        name: 'Royal Dollar',
        decimals: 18,
    },
];

export const TOKEN_BRIDGE_ADDRESSES: Record<number, Address> = {
    56: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_A_MAIN! as Address,
    97: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_A! as Address,
    7863: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_B! as Address,
    7862: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_B_MAIN! as Address,
};