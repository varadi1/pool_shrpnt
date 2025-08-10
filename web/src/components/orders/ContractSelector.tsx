import React, { useEffect, useState } from 'react';
import {
  Dropdown,
  Field,
  Option,
  Spinner,
  Text,
  makeStyles,
  shorthands,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { contractsApi, type Contract, getUserContracts } from '../../services/api/contracts';
import { useAuth } from '@/hooks/useAuth';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  contractDetails: {
    ...shorthands.padding('12px'),
    ...shorthands.border('1px', 'solid', 'var(--colorNeutralStroke1)'),
    ...shorthands.borderRadius('4px'),
    backgroundColor: 'var(--colorNeutralBackground2)',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  label: {
    fontWeight: 600,
  },
});

interface ContractSelectorProps {
  value?: string;
  onChange: (contractId: string, contract: Contract) => void;
}

export const ContractSelector: React.FC<ContractSelectorProps> = ({ value, onChange }) => {
  const styles = useStyles();
  const { user } = useAuth();
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  const { data: contracts, isLoading, error, refetch } = useQuery<Contract[]>({
    queryKey: ['contracts', user?.id],
    queryFn: async () => getUserContracts(),
    staleTime: 0,
    gcTime: 0,
    enabled: !!user,
  });

  useEffect(() => {
    if (contracts && value) {
      const contract = contracts.find(c => c.id === value);
      if (contract) {
        setSelectedContract(contract);
      }
    }
  }, [contracts, value]);

  const handleContractChange = (_: any, data: { value: string }) => {
    const contract = contracts?.find(c => c.id === data.value);
    if (contract) {
      setSelectedContract(contract);
      onChange(data.value, contract);
    }
  };

  const filteredContracts = React.useMemo(() => {
    if (!contracts) return [];
    
    // NEU_Admin sees all contracts
    if (user?.roles?.includes?.('NEU_Admin') || user?.role === 'NEU_Admin') {
      return contracts;
    }
    
    // PM sees only assigned contracts
    if (user?.roles?.includes?.('NEU_PM') || user?.role === 'NEU_PM') {
      return contracts.filter(c => (c as any).pmId === (user as any).id);
    }
    
    return [];
  }, [contracts, user]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <Spinner label="Loading contracts..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Text>Failed to load contracts. Please try again.</Text>
        <button type="button" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Field label="Select Contract" required>
        <Dropdown
          placeholder="Choose a contract"
          value={selectedContract ? `${selectedContract.number} - ${selectedContract.name}` : ''}
          selectedOptions={value ? [value] : []}
          onOptionSelect={handleContractChange}
          disabled={!filteredContracts || filteredContracts.length === 0}
        >
          {filteredContracts?.map((contract) => (
            <Option key={contract.id} value={contract.id}>
              {contract.number} - {contract.name} ({contract.clientName})
            </Option>
          ))}
        </Dropdown>
      </Field>

      {/* Clickable cards for tests and quick selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {filteredContracts?.map((c) => (
          <button
            key={String(c.id)}
            data-testid={`contract-card-${String(c.id)}`}
            onClick={() => {
              setSelectedContract(c);
              onChange(String(c.id), c);
            }}
            aria-label={`Select contract ${c.name}`}
            style={{
              textAlign: 'left',
              border: '1px solid var(--colorNeutralStroke1)',
              borderRadius: 8,
              padding: 12,
              background: value === c.id ? 'var(--colorBrandBackground2)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <Text weight="semibold">{c.name}</Text>
            <div className={styles.detailRow}>
              <Text className={styles.label}>Number:</Text>
              <Text>{c.number}</Text>
            </div>
            <div className={styles.detailRow}>
              <Text className={styles.label}>Client:</Text>
              <Text>{c.clientName}</Text>
            </div>
          </button>
        ))}
      </div>

      {selectedContract && (
        <div className={styles.contractDetails}>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Contract Number:</Text>
            <Text>{selectedContract.number}</Text>
          </div>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Contract Name:</Text>
            <Text>{selectedContract.name}</Text>
          </div>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Client:</Text>
            <Text>{selectedContract.clientName}</Text>
          </div>
        </div>
      )}

      {filteredContracts?.length === 0 && (
        <Text>No contracts available. Please contact an administrator.</Text>
      )}
    </div>
  );
};

export default ContractSelector;