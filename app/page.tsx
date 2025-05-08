'use client';

import { Container, Typography, Box } from '@mui/material';
import { WagmiConfigProvider } from '../lib/wagmi';
import BridgeForm from '../app/bridge/components/BridgeFrom';
import TransactionHistory from './bridge/components/TransactionHistory';

export default function BridgePage() {
  return (
    <WagmiConfigProvider>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom align="center">
          Cross-Chain RUSD Bridge
        </Typography>
        <Box sx={{ mt: 4 }}>
          <BridgeForm />
        </Box>
        <Box sx={{ mt: 4 }}>
          <TransactionHistory />
        </Box>
      </Container>
    </WagmiConfigProvider>
  );
}