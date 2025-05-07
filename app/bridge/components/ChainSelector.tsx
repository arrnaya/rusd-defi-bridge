import { FormControl, InputLabel, Select, MenuItem, Box } from '@mui/material';
import { CHAINS } from '../../../lib/constants';
import { Chains } from '@/types';

interface ChainSelectorProps {
  label: string;
  selectedChain: Chains;
  onChange: (chain: Chains) => void;
  disabledChains?: number[];
}

export default function ChainSelector({
  label,
  selectedChain,
  onChange,
  disabledChains = [],
}: ChainSelectorProps) {
  return (
    <FormControl fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select
        value={selectedChain.id}
        onChange={(e) => {
          const chain = CHAINS.find((c) => c.id === e.target.value);
          if (chain) onChange(chain);
        }}
        label={label}
      >
        {CHAINS.map((chain) => (
          <MenuItem
            key={chain.id}
            value={chain.id}
            disabled={disabledChains.includes(chain.id)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <img src={chain.logo} alt={chain.name} width={24} height={24} />
              {chain.name}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}