'use client';

import { useCallback, useState, useEffect } from 'react';
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
import { useAccount, useBalance, useConnect, useReadContract, useWriteContract, useSwitchChain, useChainId, useWalletClient } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseUnits, isAddress } from 'viem';
import ChainSelector from './ChainSelector';
import { CHAINS, TOKEN_BRIDGE_ADDRESSES, TOKENS } from '../../../lib/constants';
import TokenBridgeABI from '../../../contracts/TokenBridge.json';
import ERC20ABI from '../../../contracts/ERC20ABI.json';
import { ethers } from 'ethers';
import { Address } from 'viem';

export default function BridgeForm() {
  const { address, isConnected } = useAccount();
  const { connect, isPending: connectPending, error: connectError } = useConnect();
  const { switchChain, error: switchChainError } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const currentChainId = useChainId();
  const [fromChain, setFromChain] = useState(CHAINS[0]);
  const [toChain, setToChain] = useState(CHAINS[1]);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsChainAdd, setNeedsChainAdd] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);

  // Select RUSD token for the current fromChain
  const token = TOKENS.find(t => t.chainId === fromChain.id);
  const supportedChainIds = CHAINS.map(c => c.id); // [56, 97, 7862, 7863]
  const isValidInputs = address && token && isAddress(token.address) && supportedChainIds.includes(fromChain.id);

  const { data: balance, isLoading: balanceLoading, error: balanceError, refetch } = useBalance({
    address,
    token: token?.address,
    chainId: fromChain.id,
    query: {
      enabled: !!isValidInputs,
      staleTime: 30_000,
    },
  });

  // Check allowance for TokenBridge contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token?.address as Address,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: [address, TOKEN_BRIDGE_ADDRESSES[fromChain.id] as Address],
    chainId: fromChain.id,
    query: {
      enabled: !!isValidInputs && !!address && isConnected && !!token,
      staleTime: 30_000,
    },
  });

  // Debug useBalance inputs
  useEffect(() => {
    console.log('useBalance inputs:', {
      address,
      tokenAddress: token?.address,
      chainId: fromChain.id,
      isValidInputs,
      tokenAvailable: !!token,
    });
    if (!token) {
      setError(`RUSD token is not available on ${fromChain.name}`);
    }
  }, [address, token, fromChain.id, isValidInputs]);

  // Handle chain switching
  useEffect(() => {
    if (isConnected && currentChainId !== fromChain.id && supportedChainIds.includes(fromChain.id)) {
      setNeedsChainAdd(false);
      switchChain(
        { chainId: fromChain.id },
        {
          onError: (err: any) => {
            if (err.code === 4902 || err.message.includes('chain not found')) {
              setNeedsChainAdd(true);
              setError(`Please add ${fromChain.name} to your wallet to proceed.`);
            } else {
              setError(err.message || 'Failed to switch chain');
            }
          },
        }
      );
    }
  }, [isConnected, currentChainId, fromChain, switchChain]);

  const handleConnect = useCallback(() => {
    setError(null);
    if (typeof window.ethereum === 'undefined') {
      setError('No wallet detected. Please install MetaMask or another Web3 wallet.');
      return;
    }
    connect({ connector: injected({ target: 'metaMask' }) });
  }, [connect]);

  const handleSwitchChains = () => {
    setError(null);
    const tempChain = fromChain;
    setFromChain(toChain);
    setToChain(tempChain);
  };

  const handleAddChain = async () => {
    if (!walletClient) {
      setError('Wallet client not available. Please try reconnecting your wallet.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await walletClient.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${fromChain.id.toString(16)}`,
            chainName: fromChain.name,
            nativeCurrency: fromChain.nativeCurrency,
            rpcUrls: fromChain.rpcUrls.default.http,
            blockExplorerUrls: fromChain.blockExplorers?.default.url ? [fromChain.blockExplorers.default.url] : undefined,
          },
        ],
      });
      setNeedsChainAdd(false);
      setSuccessMessage(`${fromChain.name} added successfully!`);
      switchChain({ chainId: fromChain.id });
    } catch (err: any) {
      setError(err.message || 'Failed to add chain');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!isConnected) {
      setError('Please connect your wallet');
      return;
    }
    if (!supportedChainIds.includes(fromChain.id)) {
      setError('Selected source chain is not supported');
      return;
    }
    if (!token) {
      setError(`RUSD token is not available on ${fromChain.name}`);
      return;
    }
    if (currentChainId !== fromChain.id) {
      setError(`Please switch to ${fromChain.name} in your wallet`);
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (!recipient || !isAddress(recipient)) {
      setError('Please enter a valid recipient address');
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

      // Check if approval is needed
      if (!allowance || BigInt(Number(allowance)) < amountInWei) {
        setNeedsApproval(true);
        await approveToken({
          abi: ERC20ABI,
          address: token.address as Address,
          functionName: 'approve',
          args: [TOKEN_BRIDGE_ADDRESSES[fromChain.id] as Address, amountInWei],
        });
        setSuccessMessage('Approval successful! Proceeding with transfer...');
        // Wait for allowance to update (optional, depending on wallet/network)
        await refetchAllowance();
      }

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

  const { writeContractAsync: transferToken } = useWriteContract();
  const { writeContractAsync: approveToken } = useWriteContract();

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
          <TextField
            label="Token"
            value="RUSD (Royal Dollar)"
            disabled
            fullWidth
            helperText={token ? `Contract: ${token.address}` : 'Token not available on this chain'}
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
                  ? `Error fetching balance: ${balanceError.message}`
                  : balance && token
                    ? `Balance: ${ethers.formatUnits(balance.value, token.decimals)} RUSD`
                    : !isValidInputs
                      ? 'Connect wallet to view balance'
                      : 'Balance unavailable'
            }
            error={!!balanceError}
          />
          {balanceError && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => refetch()}
              sx={{ mt: 1 }}
            >
              Retry Balance
            </Button>
          )}
          <TextField
            label="Recipient Address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            fullWidth
            error={recipient !== '' && !isAddress(recipient)}
            helperText={recipient !== '' && !isAddress(recipient) ? 'Invalid address' : ''}
          />
          {error && <Alert severity="error">{error}</Alert>}
          {connectError && <Alert severity="error">{connectError.message}</Alert>}
          {switchChainError && <Alert severity="error">{switchChainError.message}</Alert>}
          <Snackbar
            open={!!successMessage}
            autoHideDuration={6000}
            onClose={() => setSuccessMessage(null)}
            message={successMessage}
          />
          {needsChainAdd ? (
            <Button
              variant="contained"
              color="secondary"
              onClick={handleAddChain}
              disabled={loading || connectPending}
              startIcon={loading ? <CircularProgress size={20} /> : null}
              sx={{ py: 1.5 }}
              aria-label={`Add ${fromChain.name} to wallet`}
            >
              {loading ? 'Adding Chain...' : `Add ${fromChain.name} to Wallet`}
            </Button>
          ) : (
            <Button
              variant="contained"
              color="primary"
              onClick={isConnected ? handleSubmit : handleConnect}
              disabled={loading || connectPending || !token || (isConnected && currentChainId !== fromChain.id)}
              startIcon={loading || connectPending ? <CircularProgress size={20} /> : null}
              sx={{ py: 1.5 }}
            >
              {isConnected ? 'Bridge Tokens' : connectPending ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}