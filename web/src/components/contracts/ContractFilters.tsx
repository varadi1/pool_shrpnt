import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import {
  SearchBox,
  Dropdown,
  Option,
  Button,
  makeStyles,
  tokens,
  Label,
  Input,
} from '@fluentui/react-components';
import {
  Dismiss20Regular,
  Filter20Regular,
} from '@fluentui/react-icons';
import type { ContractFilters as IContractFilters } from '@/types/contracts';
import { debounce } from 'lodash';

interface ContractFiltersProps {
  filters: IContractFilters;
  onFiltersChange: (filters: IContractFilters) => void;
  onClearFilters: () => void;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  filterRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  searchBox: {
    minWidth: '250px',
    flex: '1 1 300px',
  },
  dropdown: {
    minWidth: '150px',
  },
  datePicker: {
    minWidth: '150px',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  clearButton: {
    marginLeft: 'auto',
  },
  activeFilters: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  '@media (max-width: 768px)': {
    filterRow: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    searchBox: {
      width: '100%',
    },
  },
});

export const ContractFilters: React.FC<ContractFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
}) => {
  const styles = useStyles();
  const [localSearch, setLocalSearch] = useState(filters.search || '');
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchFocusedRef = useRef(false);
  const filtersRef = useRef<IContractFilters>(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Debounced search handler
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        // use latest filters snapshot to avoid recreating debounce and losing focus
        onFiltersChange({ ...filtersRef.current, search: value });
      }, 300),
    [onFiltersChange]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // After any render, if user was typing, ensure the input keeps focus
  useLayoutEffect(() => {
    if (searchFocusedRef.current) {
      const input = searchBoxRef.current?.querySelector('input');
      input?.focus();
    }
  });

  // Update local search when filters change externally
  useEffect(() => {
    setLocalSearch(filters.search || '');
    // If user was typing and focus disappeared due to re-render, restore it
    if (searchFocusedRef.current) {
      const input = searchBoxRef.current?.querySelector('input');
      input?.focus();
    }
  }, [filters.search]);

  const handleSearchChange = useCallback(
    (_: any, data: { value: string }) => {
      setLocalSearch(data.value);
      debouncedSearch(data.value);
    },
    [debouncedSearch]
  );

  const handleStatusChange = useCallback(
    (_: any, data: { optionValue?: string }) => {
      const status = (data.optionValue || undefined) as IContractFilters['status'];
      onFiltersChange({ ...filters, status });
    },
    [filters, onFiltersChange]
  );


  const handleClearFilters = useCallback(() => {
    setLocalSearch('');
    onClearFilters();
  }, [onClearFilters]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.status && filters.status !== 'all') count++;
    if (filters.startDate) count++;
    if (filters.endDate) count++;
    if (filters.clientName) count++;
    return count;
  }, [filters]);

  return (
    <div className={styles.root}>
      <div className={styles.filterRow}>
        <SearchBox
          className={styles.searchBox}
          placeholder="Keresés szerződésszám, név vagy ügyfél alapján..."
          value={localSearch}
          onChange={handleSearchChange}
          appearance="outline"
          size="medium"
          contentBefore={<Filter20Regular />}
          aria-label="Search contracts"
          ref={searchBoxRef}
          onFocus={() => (searchFocusedRef.current = true)}
          onBlur={() => (searchFocusedRef.current = false)}
        />

        <div className={styles.filterGroup}>
          <Label htmlFor="status-filter">Státusz</Label>
          <Dropdown
            id="status-filter"
            className={styles.dropdown}
            placeholder="Minden státusz"
            value={filters.status || 'all'}
            onOptionSelect={handleStatusChange}
            aria-label="Filter by status"
          >
            <Option value="all">Minden státusz</Option>
            <Option value="active">Aktív</Option>
            <Option value="inactive">Inaktív</Option>
            <Option value="expired">Lejárt</Option>
          </Dropdown>
        </div>

        <div className={styles.filterGroup}>
          <Label htmlFor="start-date-filter">Kezdés dátuma -tól</Label>
          <Input
            id="start-date-filter"
            className={styles.datePicker}
            type="date"
            value={filters.startDate || ''}
            onChange={(_, data) => {
              onFiltersChange({ ...filters, startDate: data.value || undefined });
            }}
            aria-label="Filter by start date from"
          />
        </div>

        <div className={styles.filterGroup}>
          <Label htmlFor="end-date-filter">Lejárat dátuma -ig</Label>
          <Input
            id="end-date-filter"
            className={styles.datePicker}
            type="date"
            value={filters.endDate || ''}
            onChange={(_, data) => {
              onFiltersChange({ ...filters, endDate: data.value || undefined });
            }}
            aria-label="Filter by end date to"
          />
        </div>

        {activeFilterCount > 0 && (
          <Button
            className={styles.clearButton}
            appearance="subtle"
            icon={<Dismiss20Regular />}
            onClick={handleClearFilters}
            aria-label={`Clear ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}`}
          >
            Szűrők törlése ({activeFilterCount})
          </Button>
        )}
      </div>

      {activeFilterCount > 0 && (
        <div className={styles.activeFilters}>
          <span>Aktív szűrők: {activeFilterCount}</span>
        </div>
      )}
    </div>
  );
};