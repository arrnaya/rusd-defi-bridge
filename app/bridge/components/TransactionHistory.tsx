'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import { CHAINS, TOKEN_BRIDGE_ADDRESSES, TOKENS } from '../../../lib/constants';
import { ethers } from 'ethers';
import { Transaction } from '@/types';
import { createPublicClient, http } from 'viem';
import { getBlockNumber, getLogs } from 'viem/actions';
import TokenBridgeABI from '../../../contracts/TokenBridge.json';
import { Address } from 'viem';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const fetchTransactions = async () => {
      const newTransactions: Transaction[] = [];

      for (const chain of CHAINS) {
        const token = TOKENS.find(t => t.chainId === chain.id);
        if (!token || !TOKEN_BRIDGE_ADDRESSES[chain.id]) {
          console.warn(`Skipping chain ${chain.id} (${chain.name}): Missing token or bridge address`);
          continue;
        }

        try {
          const publicClient = createPublicClient({
            chain,
            transport: http(chain.rpcUrls.default.http[0]),
          });

          const currentBlock = await getBlockNumber(publicClient);
          const fromBlock = BigInt(currentBlock) - BigInt(10000); // Last ~10000 blocks

          const logs = await getLogs(publicClient, {
            address: TOKEN_BRIDGE_ADDRESSES[chain.id] as Address,
            event: {
              type: 'event',
              name: 'MessageSent',
              inputs: [
                { type: 'bytes32', indexed: true, name: 'messageId' },
                { type: 'address', indexed: true, name: 'sender' },
                { type: 'address', indexed: true, name: 'target' },
                { type: 'bytes', indexed: false, name: 'data' },
                { type: 'uint256', indexed: false, name: 'nonce' },
              ],
            },
            fromBlock,
            toBlock: 'latest',
          });

          const iface = new ethers.Interface(TokenBridgeABI);
          for (const log of logs) {
            if (
              !log.args.messageId ||
              !log.args.sender ||
              !log.args.target ||
              !log.args.data ||
              !log.transactionHash
            ) {
              console.warn(`Skipping log with missing fields for chain ${chain.id}`, log);
              continue;
            }

            try {
              const decodedData = iface.decodeFunctionData('handleBridgedTokens', log.args.data);
              const recipient = decodedData[0]; // recipient
              const tokenAddress = decodedData[1]; // token
              const amount = decodedData[2].toString(); // value
              const toChainId =
                CHAINS.find(
                  c =>
                    c.id !== chain.id &&
                    TOKEN_BRIDGE_ADDRESSES[c.id]?.toLowerCase() === log.args.target.toLowerCase()
                )?.id || chain.id;

              newTransactions.push({
                id: log.args.messageId,
                fromChainId: chain.id,
                toChainId,
                tokenAddress,
                amount,
                recipient,
                status: 'completed', // Adjust if relayer status is needed
                txHash: log.transactionHash,
                timestamp: log.blockNumber ? Number(log.blockNumber) : Date.now(),
              });
            } catch (decodeError) {
              console.error(`Failed to decode log data for chain ${chain.id}:`, decodeError);
              continue;
            }
          }
        } catch (err: any) {
          console.error(`Failed to fetch transactions for chain ${chain.name}:`, err);
        }
      }

      setTransactions(newTransactions.sort((a, b) => b.timestamp - a.timestamp)); // Newest first
    };

    fetchTransactions();
    const interval = setInterval(fetchTransactions, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Transaction History
        </Typography>
        {transactions.length === 0 ? (
          <Typography color="text.secondary">No transactions found</Typography>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>From Chain</TableCell>
                <TableCell>To Chain</TableCell>
                <TableCell>Token</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Recipient</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>TxHash</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((tx) => {
                const token = TOKENS.find(
                  t => t.address.toLowerCase() === tx.tokenAddress.toLowerCase() && t.chainId === tx.fromChainId
                );
                return (
                  <TableRow key={tx.id}>
                    <TableCell>{CHAINS.find((c) => c.id === tx.fromChainId)?.name || 'Unknown'}</TableCell>
                    <TableCell>{CHAINS.find((c) => c.id === tx.toChainId)?.name || 'Unknown'}</TableCell>
                    <TableCell>{token?.symbol || 'RUSD'}</TableCell>
                    <TableCell>
                      {token ? ethers.formatUnits(tx.amount, token.decimals) : ethers.formatUnits(tx.amount, 18)}
                    </TableCell>
                    <TableCell>
                      {tx.recipient.slice(0, 6)}...{tx.recipient.slice(-4)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={tx.status}
                        color={tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'warning' : 'error'}
                      />
                    </TableCell>
                    <TableCell>txHash</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}