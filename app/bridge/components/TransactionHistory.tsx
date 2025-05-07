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
import { Transaction, CHAINS, TOKENS } from '../../../lib/constants';
import { ethers } from 'ethers';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Mock data or fetch from contract events
  useEffect(() => {
    // In a real app, fetch events from TokenBridge contract using ethers.js or Wagmi
    const mockTransactions: Transaction[] = [
      {
        id: '0x123',
        fromChainId: 1,
        toChainId: 56,
        tokenAddress: TOKENS[0].address,
        amount: '1000000',
        recipient: '0xRecipientAddress',
        status: 'completed',
        txHash: '0xTxHash',
        timestamp: Date.now(),
      },
    ];
    setTransactions(mockTransactions);
  }, []);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Transaction History
        </Typography>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>From Chain</TableCell>
              <TableCell>To Chain</TableCell>
              <TableCell>Token</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Recipient</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>{CHAINS.find((c) => c.id === tx.fromChainId)?.name}</TableCell>
                <TableCell>{CHAINS.find((c) => c.id === tx.toChainId)?.name}</TableCell>
                <TableCell>{TOKENS.find((t) => t.address === tx.tokenAddress)?.symbol}</TableCell>
                <TableCell>
                  {ethers.formatUnits(tx.amount, TOKENS.find((t) => t.address === tx.tokenAddress)?.decimals)}
                </TableCell>
                <TableCell>{tx.recipient.slice(0, 6)}...{tx.recipient.slice(-4)}</TableCell>
                <TableCell>
                  <Chip
                    label={tx.status}
                    color={tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'warning' : 'error'}
                  />
                </TableCell>
                <TableCell>{new Date(tx.timestamp).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}