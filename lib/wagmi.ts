import { createConfig, http } from 'wagmi';
import { mainnet, bsc } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [mainnet, bsc],
  connectors: [
    injected({ target: 'metaMask' }), // Explicitly target MetaMask
  ],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_CHAIN_A_RPC_URL),
    [bsc.id]: http(process.env.NEXT_PUBLIC_CHAIN_B_RPC_URL),
  },
});