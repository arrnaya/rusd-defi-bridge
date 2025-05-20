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
            default: { http: ['https://node-testnet.maalscan.io'] },
            public: { http: ['https://node-testnet.maalscan.io'] },
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
            default: { http: [`${process.env.NEXT_PUBLIC_BSC_TESTNET_QUICKNODE_URL}`] },
            public: { http: ['https://data-seed-prebsc-1-s1.binance.org:8545/'] },
        },
        blockExplorers: {
            default: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
        },
    },
    // {
    //     id: 7862,
    //     name: 'MaalChain V2',
    //     logo: '/chains/maalchain.avif',
    //     network: 'maalchain-v2',
    //     nativeCurrency: { name: 'Maal', symbol: 'MAAL', decimals: 18 },
    //     rpcUrls: {
    //         default: { http: ['https://node1-mainnet-new.maalscan.io'] },
    //         public: { http: ['https://node1-mainnet-new.maalscan.io'] },
    //     },
    //     blockExplorers: {
    //         default: { name: 'MaalScan', url: 'https://v2.maalscan.io/' },
    //     },
    // },
    // {
    //     id: 56,
    //     name: 'BSC Mainnet',
    //     logo: '/chains/binance.webp',
    //     network: 'bsc',
    //     nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    //     rpcUrls: {
    //         default: { http: ['https://bsc-pokt.nodies.app/'] },
    //         public: { http: ['https://bsc-dataseed1.binance.org/'] },
    //     },
    //     blockExplorers: {
    //         default: { name: 'BscScan', url: 'https://bscscan.com' },
    //     },
    // },
    {
        id: 17000,
        name: 'Holesky Testnet',
        logo: '/chains/empty-token.webp',
        network: 'holesky',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
            default: { http: [`${process.env.NEXT_PUBLIC_CHAIN_HOLESKY_RPC_URL}`] },
            public: { http: ['https://ethereum-holesky-rpc.publicnode.com/'] },
        },
        blockExplorers: {
            default: { name: 'Holesky-scan', url: 'https://holesky.etherscan.io/' },
        },
    }
];

export const TOKENS: Token[] = [
    {
        address: '0x604756016db44ad0a38d2787B8e2E3563b03Ab4e' as Address,
        symbol: 'RUSD',
        name: 'Royal Dollar',
        decimals: 18,
        chainId: 97,
    },
    {
        address: '0xaCcfdB7767ddcF5f088ec9B8d726A76b29BAB768' as Address,
        symbol: 'RUSD',
        name: 'Royal Dollar',
        decimals: 18,
        chainId: 7863,
    },
    // {
    //     address: '0x6b3b95B0c84f35c9c505fff8C2F35Ee2e502a44D' as Address,
    //     symbol: 'RUSD',
    //     name: 'Royal Dollar',
    //     decimals: 18,
    //     chainId: 56, // BSC Mainnet
    // },
    // {
    //     address: '0x49561Eb00e1E2Ff7a3E2a7c9664cEAa2Ce365a10' as Address,
    //     symbol: 'RUSD',
    //     name: 'Royal Dollar',
    //     decimals: 18,
    //     chainId: 7862, // MaalChain V2
    // }
    {
        address: '0xaCcfdB7767ddcF5f088ec9B8d726A76b29BAB768' as Address,
        symbol: 'USDT',
        name: 'USD Tether',
        decimals: 18,
        chainId: 17000, // Holesky Testnet
    },
    // {
    //     address: '0x49561Eb00e1E2Ff7a3E2a7c9664cEAa2Ce365a10' as Address,
    //     symbol: 'RUSD',
    //     name: 'Royal Dollar',
    //     decimals: 18,
    //     chainId: 11155111, // Sepolia
    // }
];

export const TOKEN_BRIDGE_ADDRESSES: Record<number, Address> = {
    // 56: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_BSC_MAIN! as Address,
    97: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_BSC! as Address,
    17000: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_HOLESKY! as Address,
    7863: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_MAAL! as Address,
    // 7862: process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_MAAL_MAIN! as Address,
};

// Validate environment variables
if (
    !process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_BSC ||
    !process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_HOLESKY ||
    // !process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_BSC_MAIN ||
    !process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_MAAL
    // !process.env.NEXT_PUBLIC_TOKEN_BRIDGE_ADDRESS_MAAL_MAIN
) {
    console.warn('Missing TokenBridge contract addresses in environment variables');
}