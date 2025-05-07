export interface Chains {
  id: number;
  name: string;
  logo: string;
  network: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: {
    default: { http: string[] };
    public: { http: string[] };
  };
  blockExplorers: {
    default: { name: string; url: string };
  };
}
  
  export interface Token {
    address: `0x${string}`;
    symbol: string;
    name: string;
    decimals: number;
  }
  
  export interface Transaction {
    id: string;
    fromChainId: number;
    toChainId: number;
    tokenAddress: string;
    amount: string;
    recipient: string;
    status: 'pending' | 'completed' | 'failed';
    txHash: string;
    timestamp: number;
  }