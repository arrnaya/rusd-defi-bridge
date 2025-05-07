'use client';

import { useCallback, useState } from 'react';
import {
  Card,
  CardContent,
  TextField,
  Button,
  CircularProgress,
  Box,
  Typography,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
} from '@mui/material';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { useAccount, useContractWrite, useBalance, useConnect, useWriteContract, injected } from 'wagmi';
import { parseUnits } from 'viem';
import ChainSelector from './ChainSelector';
import TokenSelector from './TokenSelector';
import { CHAINS, TOKEN_BRIDGE_ADDRESSES, TOKENS } from '../../../lib/constants';
import TokenBridgeABI from '../../../contracts/TokenBridge.json';
import { ethers } from 'ethers';
import { Address } from 'viem';

export default function BridgeForm() {
  const { address, isConnected } = useAccount();
  const { connect, isPending: connectPending, error: connectError } = useConnect();
  const [fromChain, setFromChain] = useState(CHAINS[0]);
  const [toChain, setToChain] = useState(CHAINS[1]);
  const [token, setToken] = useState(TOKENS[0]);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: balance, isLoading: balanceLoading, error: balanceError } = useBalance({
    address,
    token: token.address,
    chainId: fromChain.id,
    query: {
      staleTime: 30_000, // Cache balance for 30 seconds
    },
  });

  const { writeContractAsync: transferToken } = useWriteContract();

  const handleConnect = useCallback(() => {
    setError(null);
    if (typeof window.ethereum === 'undefined') {
      setError('No wallet detected. Please install MetaMask or another Web3 wallet.');
      return;
    }
    connect({ connector: injected({ target: 'metaMask' }) });
  }, [connect]);

  const handleSwitchChains = () => {
    setError(null); // Clear any existing errors
    const tempChain = fromChain;
    setFromChain(toChain);
    setToChain(tempChain);
  };

  const handleSubmit = async () => {
    if (!isConnected) {
      setError('Please connect your wallet');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (!recipient) {
      setError('Please enter a recipient address');
      return;
    }
    if (fromChain.id === toChain.id) {
      setError('Source and destination chains cannot be the same');
      return;
    }
    if (balance && parseUnits(amount, token.decimals) > balance.value) {
      setError('Insufficient balance');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const amountInWei = parseUnits(amount, token.decimals);
      await transferToken({
        abi: TokenBridgeABI,
        address: TOKEN_BRIDGE_ADDRESSES[fromChain.id],
        functionName: 'transferToken',
        args: [recipient as Address, token.address, amountInWei],
      });
      setAmount('');
      setRecipient('');
      setError(null);
      setSuccessMessage('Transaction successful!');
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Bridge Tokens
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ChainSelector
            label="From Chain"
            selectedChain={fromChain}
            onChange={setFromChain}
            disabledChains={[toChain.id]}
          />
          <Box sx={{ display: 'flex', justifyContent: 'center', my: -1 }}>
            <Tooltip title="Switch chains">
              <IconButton
                onClick={handleSwitchChains}
                sx={{
                  bgcolor: 'background.paper',
                  '&:hover': { bgcolor: 'action.hover' },
                  borderRadius: '50%',
                  boxShadow: 1,
                }}
              >
                <SwapVertIcon />
              </IconButton>
            </Tooltip>
          </Box>
          <ChainSelector
            label="To Chain"
            selectedChain={toChain}
            onChange={setToChain}
            disabledChains={[fromChain.id]}
          />
          <TokenSelector
            label="Token"
            selectedToken={token}
            onChange={setToken}
            chainId={fromChain.id}
          />
          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            helperText={
              balanceLoading
                ? 'Loading balance...'
                : balanceError
                ? 'Error fetching balance'
                : balance
                ? `Balance: ${ethers.formatUnits(balance.value, token.decimals)} ${token.symbol}`
                : 'Balance unavailable'
            }
            error={!!balanceError}
          />
          <TextField
            label="Recipient Address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
          {connectError && <Alert severity="error">{connectError.message}</Alert>}
          <Snackbar
            open={!!successMessage}
            autoHideDuration={6000}
            onClose={() => setSuccessMessage(null)}
            message={successMessage}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={isConnected ? handleSubmit : handleConnect}
            disabled={loading || connectPending}
            startIcon={loading || connectPending ? <CircularProgress size={20} /> : null}
            sx={{ py: 1.5 }}
          >
            {isConnected ? 'Bridge Tokens' : connectPending ? 'Connecting...' : 'Connect Wallet'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}