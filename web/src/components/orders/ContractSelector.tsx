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
import { getUserContracts } from '../../services/api/contracts';
import type { Contract } from '@/types/contracts';
import { useAuth } from '@/hooks/useAuth';
import { isE2EMode } from '@/config/auth.config';

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
  const { user, userRoles } = useAuth();
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  const { data: contracts, isLoading, error, refetch } = useQuery<Contract[]>({
    queryKey: ['contracts', (user as any)?.username || (user as any)?.localAccountId || 'mock'],
    queryFn: async () => getUserContracts(),
    staleTime: 0,
    gcTime: 0,
    // In mock/E2E/dev mode there might be no real MSAL account present.
    // Ensure we still fetch contracts when mock auth is enabled.
    enabled: !!user || isE2EMode(),
  });

  useEffect(() => {
    if (contracts && value) {
      const contract = contracts.find(c => c.id.toString() === value);
      if (contract) {
        setSelectedContract(contract);
      }
    }
  }, [contracts, value]);

  const handleContractChange = (_: any, data: any) => {
    const selected = String(data.optionValue ?? data.value ?? '');
    const contract = contracts?.find(c => c.id.toString() === selected);
    if (contract) {
      setSelectedContract(contract);
      onChange(selected, contract);
    }
  };

  const filteredContracts = React.useMemo(() => {
    if (!contracts) return [];

    // Prefer robust role detection from our auth hook
    const isAdmin = Array.isArray(userRoles) && userRoles.includes('NEU_Admin');
    const isPm = Array.isArray(userRoles) && userRoles.includes('NEU_PM');

    if (isAdmin) return contracts;

    if (isPm) {
      // Try to match by known identifiers if available; otherwise, backend should scope results
      const userOid = (user as any)?.id || (user as any)?.localAccountId || (user?.idTokenClaims as any)?.oid;
      if (userOid) {
        return contracts.filter((c: any) => String(c.pmId || '') === String(userOid));
      }
      return contracts;
    }

    // Default to showing what the backend returned; it should already be RBAC-filtered
    return contracts;
  }, [contracts, user, userRoles]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <Spinner label="Szerződések betöltése..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Text>Nem sikerült betölteni a szerződéseket. Kérjük, próbálja újra.</Text>
        <button type="button" onClick={() => refetch()}>Újrapróbálkozás</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Field label="Szerződés kiválasztása" required>
        <Dropdown
          placeholder="Válasszon szerződést"
          value={selectedContract ? `${selectedContract.contractNumber ?? (selectedContract as any).number} - ${selectedContract.name}` : ''}
          selectedOptions={value ? [value] : []}
          onOptionSelect={handleContractChange}
          disabled={!filteredContracts || filteredContracts.length === 0}
        >
          {filteredContracts?.map((contract) => (
            <Option key={contract.id} value={contract.id.toString()}>
              {(contract.contractNumber ?? (contract as any).number)} - {contract.name}
            </Option>
          ))}
        </Dropdown>
      </Field>

      {/* Clickable cards for tests and quick selection */}
      <div className="contract-cards-grid">
          {filteredContracts?.map((c) => (
          <button
            key={String(c.id)}
            data-testid={`contract-card-${String(c.id)}`}
            onClick={() => {
              setSelectedContract(c);
              onChange(String(c.id), c);
            }}
            aria-label={`Szerződés kiválasztása: ${c.name}`}
            style={{
              textAlign: 'left',
              border: value === c.id.toString() ? '2px solid var(--colorBrandStroke1)' : '1px solid var(--colorNeutralStroke1)',
              borderRadius: 8,
              padding: 12,
              background: value === c.id.toString() ? 'var(--colorBrandBackground2)' : 'var(--colorNeutralBackground1)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Text weight="semibold">{c.name}</Text>
            <div className={styles.detailRow}>
              <Text className={styles.label}>Szám:</Text>
              <Text>{c.contractNumber}</Text>
            </div>
          </button>
        ))}
      </div>

      {selectedContract && (
        <div className={styles.contractDetails}>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Szerződés száma:</Text>
            <Text>{selectedContract.contractNumber}</Text>
          </div>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Szerződés neve:</Text>
            <Text>{selectedContract.name}</Text>
          </div>
        </div>
      )}

      {filteredContracts?.length === 0 && (
        <Text>Nincsenek elérhető szerződések. Kérjük, forduljon a rendszergazdához.</Text>
      )}
    </div>
  );
};

export default ContractSelector;