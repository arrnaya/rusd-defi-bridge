'use client';

import { Container, Typography, Box } from '@mui/material';
import BridgeForm from './components/BridgeFrom';
import TransactionHistory from './components/TransactionHistory';

export default function BridgePage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        Cross-Chain Token Bridge
      </Typography>
      <Box sx={{ mt: 4 }}>
        <BridgeForm />
      </Box>
      <Box sx={{ mt: 4 }}>
        <TransactionHistory />
      </Box>
    </Container>
  );
}