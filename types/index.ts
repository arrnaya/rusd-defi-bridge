export interface Chain {
    id: number;
    name: string;
    logo: string;
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