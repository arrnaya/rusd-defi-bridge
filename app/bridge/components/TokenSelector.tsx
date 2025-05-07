import { FormControl, InputLabel, Select, MenuItem, Box } from '@mui/material';
import { TOKENS, Token } from '../../../lib/constants';

interface TokenSelectorProps {
  label: string;
  selectedToken: Token;
  onChange: (token: Token) => void;
  chainId: number;
}

export default function TokenSelector({
  label,
  selectedToken,
  onChange,
  chainId,
}: TokenSelectorProps) {
  return (
    <FormControl fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select
        value={selectedToken.address}
        onChange={(e) => {
          const token = TOKENS.find((t) => t.address === e.target.value);
          if (token) onChange(token);
        }}
        label={label}
      >
        {TOKENS.map((token) => (
          <MenuItem key={token.address} value={token.address}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {token.symbol} - {token.name}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}