'use client';
import dynamic from 'next/dynamic';
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
    Chip,
} from '@mui/material';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { useAccount, useBalance, useConnect, useReadContract, useWriteContract, useSwitchChain, useChainId, useWalletClient } from 'wagmi';
import { injected } from 'wagmi/connectors';
import ChainSelector from './ChainSelector';
import { CHAINS, TOKEN_BRIDGE_ADDRESSES, TOKENS } from '../../../lib/constants';
import TokenBridgeABI from '../../../contracts/TokenBridge.json';
import ERC20ABI from '../../../contracts/ERC20ABI.json';
import { Address, encodeFunctionData, parseUnits, isAddress, formatUnits } from 'viem';

// Dynamically import Chip to avoid SSR
const DynamicChip = dynamic(() => import('@mui/material').then(mod => mod.Chip), { ssr: false });

export default function BridgeForm() {
    const { address, isConnected } = useAccount();
    const { connect, isPending: connectPending, error: connectError } = useConnect();
    const { switchChainAsync, error: switchChainError } = useSwitchChain();
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
    const [needsChainSwitch, setNeedsChainSwitch] = useState(false);
    const [isClient, setIsClient] = useState(false);

    // Set isClient to true after mounting
    useEffect(() => {
        setIsClient(true);
    }, []);

    // Select RUSD token for the current fromChain
    const token = TOKENS.find(t => t.chainId === fromChain.id);
    const supportedChainIds = CHAINS.map(c => c.id);
    const isValidInputs = address && token && isAddress(token.address) && supportedChainIds.includes(fromChain.id);

    // Fetch user balance
    const { data: balance, isLoading: balanceLoading, error: balanceError, refetch: refetchBalance } = useBalance({
        address,
        token: token?.address,
        chainId: fromChain.id,
        query: {
            enabled: !!isValidInputs,
            staleTime: 30_000,
        },
    });

    // Fetch TokenBridge contract balance on toChain
    const toToken = TOKENS.find(t => t.chainId === toChain.id);
    const { data: bridgeBalance, isLoading: bridgeBalanceLoading, error: bridgeBalanceError, refetch: refetchBridgeBalance } = useBalance({
        address: TOKEN_BRIDGE_ADDRESSES[toChain.id] as Address,
        token: toToken?.address,
        chainId: toChain.id,
        query: {
            enabled: !!toToken && isAddress(toToken.address) && !!TOKEN_BRIDGE_ADDRESSES[toChain.id] && supportedChainIds.includes(toChain.id),
            staleTime: 30_000,
        },
    });

    // Fetch bridge fee from TokenBridge contract
    const { data: bridgeFee, isLoading: bridgeFeeLoading, error: bridgeFeeError, refetch: refetchBridgeFee } = useReadContract({
        address: TOKEN_BRIDGE_ADDRESSES[fromChain.id] as `0x${string}`,
        abi: TokenBridgeABI,
        functionName: 'bridgeFee',
        chainId: fromChain.id,
        query: {
            enabled: !!isValidInputs && !!TOKEN_BRIDGE_ADDRESSES[fromChain.id] && supportedChainIds.includes(fromChain.id),
            staleTime: 60_000,
            // Add block range limit
            // blockTag: 'latest', // Use latest block instead of a range
        },
    });

    // Calculate receivable amount
    const calculateReceivableAmount = () => {
        if (!amount || parseFloat(amount) <= 0 || !token || bridgeFee === undefined) {
            return '0';
        }
        try {
            const amountInWei = parseUnits(amount, token.decimals);
            const feeInWei = BigInt((Number(amountInWei) * (Number(bridgeFee))) / 10000); // 10000 basis points = 100%
            if (amountInWei <= feeInWei) {
                return '0';
            }
            const receivableInWei = amountInWei - feeInWei;
            return formatUnits(receivableInWei, token.decimals);
        } catch (err) {
            console.error('Error calculating receivable amount:', err);
            return '0';
        }
    };

    const receivableAmount = calculateReceivableAmount();

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

    // Set recipient to connected wallet address
    useEffect(() => {
        if (isConnected && address && !recipient) {
            setRecipient(address);
        }
    }, [isConnected, address, recipient]);

    // Check if chain switch is needed
    useEffect(() => {
        if (isConnected && currentChainId !== fromChain.id && supportedChainIds.includes(fromChain.id)) {
            setNeedsChainSwitch(true);
            setError(`Please switch to ${fromChain.name} in your wallet to proceed.`);
        } else {
            setNeedsChainSwitch(false);
            setNeedsChainAdd(false);
            if (error?.includes('Please switch to')) {
                setError(null);
            }
        }
    }, [isConnected, currentChainId, fromChain, supportedChainIds, error]);

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

    const handleSwitchChain = async () => {
        if (!isConnected) {
            setError('Please connect your wallet');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await switchChainAsync({ chainId: fromChain.id });
            setNeedsChainSwitch(false);
            setSuccessMessage(`Switched to ${fromChain.name} successfully!`);
        } catch (err: any) {
            if (err.code === 4902 || err.message.includes('chain not found')) {
                setNeedsChainAdd(true);
                setError(`Please add ${fromChain.name} to your wallet to proceed.`);
            } else {
                setError(err.message || 'Failed to switch chain');
            }
        } finally {
            setLoading(false);
        }
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
            await switchChainAsync({ chainId: fromChain.id });
            setNeedsChainSwitch(false);
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
        if (bridgeBalance && parseUnits(amount, token.decimals) > bridgeBalance.value) {
            setError('Amount exceeds TokenBridge contract balance');
            return;
        }

        setError(null);
        setLoading(true);

        // Define amountInWei early
        let amountInWei;
        try {
            amountInWei = parseUnits(amount, token.decimals);
        } catch (err) {
            setError('Invalid amount format');
            setLoading(false);
            return;
        }

        try {
            // Prepare calls for EIP-7702 transaction
            const calls = [];

            // Add approve call if allowance is insufficient
            if (!allowance || BigInt(Number(allowance)) < amountInWei) {
                calls.push({
                    contractAddress: token.address as `0x${string}`,
                    callData: encodeFunctionData({
                        abi: ERC20ABI,
                        functionName: 'approve',
                        args: [TOKEN_BRIDGE_ADDRESSES[fromChain.id], amountInWei],
                    }) as `0x${string}`,
                });
            }

            // Add transferToken call
            calls.push({
                contractAddress: TOKEN_BRIDGE_ADDRESSES[fromChain.id] as `0x${string}`,
                callData: encodeFunctionData({
                    abi: TokenBridgeABI,
                    functionName: 'transferToken',
                    args: [toChain.id, recipient, token.address, amountInWei],
                }) as `0x${string}`,
            });

            // Construct EIP-7702 transaction
            const transaction = {
                from: address as `0x${string}`,
                to: TOKEN_BRIDGE_ADDRESSES[fromChain.id] as `0x${string}`,
                data: '0x' as `0x${string}`,
                chainId: `0x${fromChain.id.toString(16)}`,
                type: '0x04' as const, // EIP-7702 transaction type
                authorizationList: calls,
                gas: '0x' + (300000).toString(16), // Adjust based on testing
                maxFeePerGas: '0x' + parseUnits('100', 9).toString(16), // 100 gwei
                maxPriorityFeePerGas: '0x' + parseUnits('2', 9).toString(16), // 2 gwei
            };

            // Send transaction using walletClient
            if (!walletClient) {
                throw new Error('Wallet client not available');
            }

            // Type assertion to bypass TypeScript if viem doesn't support authorizationList
            const txHash = await walletClient.request({
                method: 'eth_sendTransaction',
                params: [transaction as any], // Use 'any' as a fallback; replace with proper type if viem supports EIP-7702
            });

            setAmount('');
            setRecipient(address || '');
            setSuccessMessage(`Transaction successful! Tx Hash: ${txHash}`);
            await Promise.all([refetchBalance(), refetchBridgeBalance(), refetchAllowance()]);
        } catch (err: any) {
            console.error('EIP-7702 transaction error:', err);
            // Fallback to sequential calls
            if (err.code === 'UNSUPPORTED_OPERATION' || err.message.includes('EIP-7702')) {
                console.warn('EIP-7702 not supported, falling back to sequential calls');
                setSuccessMessage('EIP-7702 not supported, processing with separate approval and transfer...');
                try {
                    if (!allowance || BigInt(Number(allowance)) < amountInWei) {
                        await approveToken({
                            abi: ERC20ABI,
                            address: token.address as `0x${string}`,
                            functionName: 'approve',
                            args: [TOKEN_BRIDGE_ADDRESSES[fromChain.id], amountInWei],
                        });
                        setSuccessMessage('Approval successful! Proceeding with transfer...');
                        await refetchAllowance();
                    }

                    await transferToken({
                        abi: TokenBridgeABI,
                        address: TOKEN_BRIDGE_ADDRESSES[fromChain.id] as `0x${string}`,
                        functionName: 'transferToken',
                        args: [toChain.id, recipient, token.address, amountInWei],
                    });
                    setAmount('');
                    setRecipient(address || '');
                    setSuccessMessage('Transaction successful!');
                    await Promise.all([refetchBalance(), refetchBridgeBalance()]);
                } catch (fallbackErr: any) {
                    setError(fallbackErr.message || 'Transaction failed');
                }
            } else {
                setError(err.message || 'Transaction failed');
            }
        } finally {
            setLoading(false);
        }
    };

    const { writeContractAsync: transferToken } = useWriteContract();
    const { writeContractAsync: approveToken } = useWriteContract();

    const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    return (
        <Box sx={{ position: 'relative', maxWidth: 860, mx: 'auto', py: 2 }}>
            {isClient && isConnected && address && (
                <DynamicChip
                    label={formatAddress(address)}
                    color="primary"
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        fontWeight: 'bold',
                        bgcolor: 'primary.main',
                        color: 'white',
                        '&:hover': { bgcolor: 'primary.dark' },
                    }}
                />
            )}
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Bridge Tokens
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <ChainSelector
                            label="From Chain"
                            selectedChain={fromChain}
                            onChange={(chain) => {
                                setFromChain(chain);
                                setNeedsChainSwitch(currentChainId !== chain.id);
                            }}
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
                                balanceLoading || bridgeBalanceLoading || bridgeFeeLoading
                                    ? 'Loading balances and fees...'
                                    : balanceError
                                        ? `Error fetching balance: ${balanceError.message}`
                                        : bridgeBalanceError
                                            ? `Error fetching bridge balance on ${toChain.name}: ${bridgeBalanceError.message}`
                                            : bridgeFeeError
                                                ? `Error fetching bridge fee: ${bridgeFeeError.message}`
                                                : balance && bridgeBalance && token && toToken && bridgeFee !== undefined
                                                    ? `User Balance: ${formatUnits(balance.value, token.decimals)} RUSD | Bridge Balance on ${toChain.name}: ${formatUnits(bridgeBalance.value, toToken.decimals)} RUSD`
                                                    : !isValidInputs
                                                        ? 'Connect wallet to view balances'
                                                        : !toToken
                                                            ? `RUSD token not available on ${toChain.name}`
                                                            : 'Balances or fee unavailable'
                            }
                            error={!!balanceError || !!bridgeBalanceError || !!bridgeFeeError}
                        />
                        <Tooltip title="A 0.25% fee is charged by the TokenBridge contract for cross-chain transfers.">
                            <TextField
                                label="Receivable Amount"
                                disabled
                                value={bridgeFeeLoading ? 'Loading...' : receivableAmount}
                                fullWidth
                                helperText={
                                    bridgeFeeLoading
                                        ? 'Fetching bridge fee...'
                                        : bridgeFeeError
                                            ? 'Error fetching bridge fee'
                                            : bridgeFee !== undefined && token
                                                ? `After ${Number(bridgeFee) / 100}% bridge fee`
                                                : 'Fee unavailable'
                                }
                                error={!!bridgeFeeError}
                            />
                        </Tooltip>
                        {(balanceError || bridgeBalanceError || bridgeFeeError) && (
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => {
                                    refetchBalance();
                                    refetchBridgeBalance();
                                    refetchBridgeFee();
                                }}
                                sx={{ mt: 1 }}
                            >
                                Retry Balances and Fee
                            </Button>
                        )}
                        <TextField
                            label="Recipient Address"
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            fullWidth
                            error={recipient !== '' && !isAddress(recipient)}
                            helperText={
                                recipient !== '' && !isAddress(recipient)
                                    ? 'Invalid address'
                                    : isConnected && recipient === address
                                        ? 'Set to your connected wallet'
                                        : ''
                            }
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
                        ) : needsChainSwitch ? (
                            <Button
                                variant="contained"
                                color="secondary"
                                onClick={handleSwitchChain}
                                disabled={loading || connectPending || !isConnected}
                                startIcon={loading ? <CircularProgress size={20} /> : null}
                                sx={{ py: 1.5 }}
                                aria-label={`Switch to ${fromChain.name}`}
                            >
                                {loading ? 'Switching Chain...' : `Switch to ${fromChain.name}`}
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={isConnected ? handleSubmit : handleConnect}
                                disabled={loading || connectPending || !token || (isConnected && needsChainSwitch)}
                                startIcon={loading || connectPending ? <CircularProgress size={20} /> : null}
                                sx={{ py: 1.5 }}
                            >
                                {isConnected ? 'Bridge Tokens' : connectPending ? 'Connecting...' : 'Connect Wallet'}
                            </Button>
                        )}
                    </Box>
                </CardContent>
            </Card>
        </Box>
    );
}