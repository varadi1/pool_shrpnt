import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  Button,
  Dropdown,
  Option,
  Combobox,
  Text,
  Badge,
  Label,
  makeStyles,
  tokens,
  Input,
  Checkbox,
  Tag,
  TagGroup,
  InteractionTag,
  InteractionTagPrimary,
  InteractionTagSecondary,
  Field,
} from '@fluentui/react-components';
import {
  Filter24Regular,
  Dismiss24Regular,
  Save24Regular,
  CalendarLtr24Regular,
  Clock24Regular,
  ChevronDown20Regular,
  ChevronUp20Regular,
} from '@fluentui/react-icons';
import type { AuditFilter, AuditActionType, AuditCategory } from '@/types/audit';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
  },
  filterSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  filterRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  quickFilters: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  dateRange: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  collapsibleSection: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalM,
  },
  expandButton: {
    justifyContent: 'flex-start',
    paddingLeft: '0',
  },
  filterActions: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  savedPresets: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  activeFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalS,
  },
  filterCount: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    borderRadius: tokens.borderRadiusCircular,
    padding: '2px 8px',
    fontSize: tokens.fontSizeBase200,
    marginLeft: tokens.spacingHorizontalXS,
  },
});

interface AuditFiltersProps {
  filters: AuditFilter;
  onFiltersChange: (filters: AuditFilter) => void;
  onClearFilters: () => void;
  availableActors?: Array<{ id: string; name: string; email: string }>;
  isLoading?: boolean;
}

const ACTION_TYPE_OPTIONS: Array<{ value: AuditActionType; label: string }> = [
  { value: 'TEMPLATE_CREATED', label: 'Sablon létrehozva' },
  { value: 'TEMPLATE_UPDATED', label: 'Sablon módosítva' },
  { value: 'TEMPLATE_DELETED', label: 'Sablon törölve' },
  { value: 'TEMPLATE_VERSIONED', label: 'Sablon verzionálva' },
  { value: 'ORDER_CREATED', label: 'Megrendelés létrehozva' },
  { value: 'ORDER_PROVISIONED', label: 'Megrendelés kiépítve' },
  { value: 'ORDER_ARCHIVED', label: 'Megrendelés archiválva' },
  { value: 'ORDER_FAILED', label: 'Megrendelés sikertelen' },
  { value: 'PERMISSION_GRANTED', label: 'Jogosultság megadva' },
  { value: 'PERMISSION_REVOKED', label: 'Jogosultság visszavonva' },
  { value: 'PERMISSION_MODIFIED', label: 'Jogosultság módosítva' },
  { value: 'LOCK_APPLIED', label: 'Zárolás alkalmazva' },
  { value: 'LOCK_RELEASED', label: 'Zárolás feloldva' },
  { value: 'CR_OPENED', label: 'CR megnyitva' },
  { value: 'CR_CLOSED', label: 'CR lezárva' },
  { value: 'USER_INVITED', label: 'Felhasználó meghívva' },
  { value: 'USER_REMOVED', label: 'Felhasználó eltávolítva' },
  { value: 'GROUP_MODIFIED', label: 'Csoport módosítva' },
  { value: 'REPORT_GENERATED', label: 'Jelentés generálva' },
  { value: 'REPORT_EXPORTED', label: 'Jelentés exportálva' },
  { value: 'NOTIFICATION_SENT', label: 'Értesítés elküldve' },
  { value: 'NOTIFICATION_FAILED', label: 'Értesítés sikertelen' },
];

const CATEGORY_OPTIONS: Array<{ value: AuditCategory; label: string }> = [
  { value: 'template', label: 'Sablonok' },
  { value: 'provisioning', label: 'Kiépítés' },
  { value: 'security', label: 'Biztonság' },
  { value: 'lock', label: 'Zárolások' },
  { value: 'user', label: 'Felhasználók' },
  { value: 'system', label: 'Rendszer' },
];

const TARGET_TYPE_OPTIONS = [
  { value: 'order', label: 'Megrendelés' },
  { value: 'template', label: 'Sablon' },
  { value: 'permission', label: 'Jogosultság' },
  { value: 'user', label: 'Felhasználó' },
  { value: 'group', label: 'Csoport' },
  { value: 'lock', label: 'Zárolás' },
  { value: 'report', label: 'Jelentés' },
  { value: 'notification', label: 'Értesítés' },
];

interface FilterPreset {
  id: string;
  name: string;
  filters: AuditFilter;
}

const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: 'security',
    name: 'Biztonsági események',
    filters: {
      categories: ['security'],
      actionTypes: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'PERMISSION_MODIFIED', 'USER_INVITED', 'USER_REMOVED'],
    },
  },
  {
    id: 'failures',
    name: 'Sikertelen műveletek',
    filters: {
      status: ['failure'],
    },
  },
  {
    id: 'templates',
    name: 'Sablon műveletek',
    filters: {
      categories: ['template'],
      targetTypes: ['template'],
    },
  },
];

export const AuditFilters: React.FC<AuditFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  availableActors = [],
  isLoading = false,
}) => {
  const classes = useStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [savedPresets, setSavedPresets] = useState<FilterPreset[]>(() => {
    const saved = localStorage.getItem('auditFilterPresets');
    return saved ? JSON.parse(saved) : DEFAULT_PRESETS;
  });

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange) count++;
    if (filters.actors?.length) count += filters.actors.length;
    if (filters.actionTypes?.length) count += filters.actionTypes.length;
    if (filters.categories?.length) count += filters.categories.length;
    if (filters.targetTypes?.length) count += filters.targetTypes.length;
    if (filters.correlationId) count++;
    if (filters.status?.length) count += filters.status.length;
    if (filters.searchText) count++;
    return count;
  }, [filters]);

  useEffect(() => {
    const params: Record<string, string> = {};
    
    if (filters.dateRange) {
      params.from = filters.dateRange.from.toISOString();
      params.to = filters.dateRange.to.toISOString();
    }
    if (filters.actors?.length) params.actors = filters.actors.join(',');
    if (filters.actionTypes?.length) params.actions = filters.actionTypes.join(',');
    if (filters.categories?.length) params.categories = filters.categories.join(',');
    if (filters.targetTypes?.length) params.targets = filters.targetTypes.join(',');
    if (filters.correlationId) params.correlation = filters.correlationId;
    if (filters.status?.length) params.status = filters.status.join(',');
    if (filters.searchText) params.search = filters.searchText;

    setSearchParams(params);
  }, [filters, setSearchParams]);

  const handleQuickFilter = useCallback((preset: 'today' | 'week' | 'month') => {
    const now = new Date();
    const from = new Date();
    
    switch (preset) {
      case 'today':
        from.setHours(0, 0, 0, 0);
        break;
      case 'week':
        from.setDate(from.getDate() - 7);
        break;
      case 'month':
        from.setMonth(from.getMonth() - 1);
        break;
    }

    onFiltersChange({
      ...filters,
      dateRange: { from, to: now },
    });
  }, [filters, onFiltersChange]);

  const handleDateChange = useCallback((field: 'from' | 'to', date: Date | null) => {
    if (!date) return;
    
    const newDateRange = filters.dateRange || { from: new Date(), to: new Date() };
    newDateRange[field] = date;
    
    if (newDateRange.from > newDateRange.to) {
      if (field === 'from') {
        newDateRange.to = date;
      } else {
        newDateRange.from = date;
      }
    }
    
    onFiltersChange({
      ...filters,
      dateRange: newDateRange,
    });
  }, [filters, onFiltersChange]);

  const handleActorChange = useCallback((selectedOptions: string[]) => {
    onFiltersChange({
      ...filters,
      actors: selectedOptions,
    });
  }, [filters, onFiltersChange]);

  const handleActionTypeChange = useCallback((selectedOptions: string[]) => {
    onFiltersChange({
      ...filters,
      actionTypes: selectedOptions as AuditActionType[],
    });
  }, [filters, onFiltersChange]);

  const handleCategoryChange = useCallback((selectedOptions: string[]) => {
    onFiltersChange({
      ...filters,
      categories: selectedOptions as AuditCategory[],
    });
  }, [filters, onFiltersChange]);

  const handleTargetTypeChange = useCallback((selectedOptions: string[]) => {
    onFiltersChange({
      ...filters,
      targetTypes: selectedOptions,
    });
  }, [filters, onFiltersChange]);

  const handleStatusChange = useCallback((status: 'success' | 'failure', checked: boolean) => {
    const currentStatus = filters.status || [];
    const newStatus = checked
      ? [...currentStatus, status]
      : currentStatus.filter(s => s !== status);
    
    onFiltersChange({
      ...filters,
      status: newStatus.length > 0 ? newStatus : undefined,
    });
  }, [filters, onFiltersChange]);

  const handleCorrelationIdChange = useCallback((value: string) => {
    onFiltersChange({
      ...filters,
      correlationId: value || undefined,
    });
  }, [filters, onFiltersChange]);

  const handleSearchTextChange = useCallback((value: string) => {
    onFiltersChange({
      ...filters,
      searchText: value || undefined,
    });
  }, [filters, onFiltersChange]);

  const handleApplyPreset = useCallback((preset: FilterPreset) => {
    onFiltersChange(preset.filters);
  }, [onFiltersChange]);

  const handleSaveCurrentAsPreset = useCallback(() => {
    const name = prompt('Szűrő előbeállítás neve:');
    if (!name) return;

    const newPreset: FilterPreset = {
      id: `custom-${Date.now()}`,
      name,
      filters: { ...filters },
    };

    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    localStorage.setItem('auditFilterPresets', JSON.stringify(updated));
  }, [filters, savedPresets]);

  const handleRemovePreset = useCallback((presetId: string) => {
    const updated = savedPresets.filter(p => p.id !== presetId);
    setSavedPresets(updated);
    localStorage.setItem('auditFilterPresets', JSON.stringify(updated));
  }, [savedPresets]);

  return (
    <Card className={classes.container}>
      <div className={classes.filterSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <Filter24Regular />
            <Text weight="semibold">Szűrők</Text>
            {activeFilterCount > 0 && (
              <Badge appearance="filled" color="brand">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          <Button
            appearance="subtle"
            icon={<Dismiss24Regular />}
            onClick={onClearFilters}
            disabled={activeFilterCount === 0}
          >
            Szűrők törlése
          </Button>
        </div>

        <div className={classes.quickFilters}>
          <Text>Gyors szűrők:</Text>
          <Button
            appearance="outline"
            size="small"
            icon={<Clock24Regular />}
            onClick={() => handleQuickFilter('today')}
          >
            Ma
          </Button>
          <Button
            appearance="outline"
            size="small"
            icon={<CalendarLtr24Regular />}
            onClick={() => handleQuickFilter('week')}
          >
            Elmúlt 7 nap
          </Button>
          <Button
            appearance="outline"
            size="small"
            icon={<CalendarLtr24Regular />}
            onClick={() => handleQuickFilter('month')}
          >
            Elmúlt 30 nap
          </Button>
        </div>

        <div className={classes.filterRow}>
          <Field label="Keresés">
            <Input
              placeholder="Szabad szöveges keresés..."
              value={filters.searchText || ''}
              onChange={(e, data) => handleSearchTextChange(data.value)}
            />
          </Field>

          <Field label="Korrelációs ID">
            <Input
              placeholder="Korrelációs azonosító..."
              value={filters.correlationId || ''}
              onChange={(e, data) => handleCorrelationIdChange(data.value)}
            />
          </Field>
        </div>

        <div className={classes.dateRange}>
          <Field label="Dátum ettől">
            <Input
              type="datetime-local"
              value={filters.dateRange?.from ? new Date(filters.dateRange.from).toISOString().slice(0, 16) : ''}
              onChange={(e, data) => {
                if (data.value) {
                  handleDateChange('from', new Date(data.value));
                }
              }}
            />
          </Field>
          <Field label="Dátum eddig">
            <Input
              type="datetime-local"
              value={filters.dateRange?.to ? new Date(filters.dateRange.to).toISOString().slice(0, 16) : ''}
              onChange={(e, data) => {
                if (data.value) {
                  handleDateChange('to', new Date(data.value));
                }
              }}
            />
          </Field>
        </div>

        <Button
          className={classes.expandButton}
          appearance="subtle"
          icon={isAdvancedOpen ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        >
          Speciális szűrők {!isAdvancedOpen && activeFilterCount > 3 && `(${activeFilterCount})`}
        </Button>

        {isAdvancedOpen && (
          <div className={classes.collapsibleSection}>
            <div className={classes.filterRow}>
              <Field label="Felhasználó/Aktor">
                <Combobox
                  placeholder="Válassz felhasználót..."
                  multiselect
                  selectedOptions={filters.actors || []}
                  onOptionSelect={(e, data) => handleActorChange(data.selectedOptions)}
                >
                  {availableActors.map(actor => (
                    <Option key={actor.id} value={actor.id}>
                      {actor.name} ({actor.email})
                    </Option>
                  ))}
                </Combobox>
              </Field>

              <Field label="Művelet típus">
                <Dropdown
                  placeholder="Válassz műveletet..."
                  multiselect
                  selectedOptions={filters.actionTypes || []}
                  onOptionSelect={(e, data) => handleActionTypeChange(data.selectedOptions)}
                >
                  {ACTION_TYPE_OPTIONS.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>

            <div className={classes.filterRow}>
              <Field label="Kategória">
                <Dropdown
                  placeholder="Válassz kategóriát..."
                  multiselect
                  selectedOptions={filters.categories || []}
                  onOptionSelect={(e, data) => handleCategoryChange(data.selectedOptions)}
                >
                  {CATEGORY_OPTIONS.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              <Field label="Cél entitás típusa">
                <Dropdown
                  placeholder="Válassz entitás típust..."
                  multiselect
                  selectedOptions={filters.targetTypes || []}
                  onOptionSelect={(e, data) => handleTargetTypeChange(data.selectedOptions)}
                >
                  {TARGET_TYPE_OPTIONS.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>

            <Field label="Státusz">
              <div style={{ display: 'flex', gap: tokens.spacingHorizontalM }}>
                <Checkbox
                  label="Sikeres"
                  checked={filters.status?.includes('success') || false}
                  onChange={(e, data) => handleStatusChange('success', data.checked as boolean)}
                />
                <Checkbox
                  label="Sikertelen"
                  checked={filters.status?.includes('failure') || false}
                  onChange={(e, data) => handleStatusChange('failure', data.checked as boolean)}
                />
              </div>
            </Field>
          </div>
        )}

        {activeFilterCount > 0 && (
          <div>
            <Text size={200}>Aktív szűrők:</Text>
            <TagGroup className={classes.activeFilters}>
              {filters.searchText && (
                <InteractionTag appearance="brand" size="small">
                  <InteractionTagPrimary>Keresés: {filters.searchText}</InteractionTagPrimary>
                  <InteractionTagSecondary onClick={() => handleSearchTextChange('')} />
                </InteractionTag>
              )}
              {filters.correlationId && (
                <InteractionTag appearance="brand" size="small">
                  <InteractionTagPrimary>Korreláció: {filters.correlationId}</InteractionTagPrimary>
                  <InteractionTagSecondary onClick={() => handleCorrelationIdChange('')} />
                </InteractionTag>
              )}
              {filters.dateRange && (
                <InteractionTag appearance="brand" size="small">
                  <InteractionTagPrimary>
                    {filters.dateRange.from.toLocaleDateString()} - {filters.dateRange.to.toLocaleDateString()}
                  </InteractionTagPrimary>
                  <InteractionTagSecondary onClick={() => onFiltersChange({ ...filters, dateRange: undefined })} />
                </InteractionTag>
              )}
              {filters.actors?.map(actor => (
                <InteractionTag key={actor} appearance="outline" size="small">
                  <InteractionTagPrimary>
                    {availableActors.find(a => a.id === actor)?.name || actor}
                  </InteractionTagPrimary>
                  <InteractionTagSecondary
                    onClick={() => handleActorChange(filters.actors!.filter(a => a !== actor))}
                  />
                </InteractionTag>
              ))}
              {filters.actionTypes?.map(action => (
                <InteractionTag key={action} appearance="outline" size="small">
                  <InteractionTagPrimary>
                    {ACTION_TYPE_OPTIONS.find(a => a.value === action)?.label || action}
                  </InteractionTagPrimary>
                  <InteractionTagSecondary
                    onClick={() => handleActionTypeChange(filters.actionTypes!.filter(a => a !== action))}
                  />
                </InteractionTag>
              ))}
            </TagGroup>
          </div>
        )}
      </div>

      <div className={classes.filterActions}>
        <div className={classes.savedPresets}>
          <Text>Előbeállítások:</Text>
          <Dropdown placeholder="Válassz előbeállítást...">
            {savedPresets.map(preset => (
              <Option key={preset.id} onClick={() => handleApplyPreset(preset)}>
                {preset.name}
              </Option>
            ))}
          </Dropdown>
          {activeFilterCount > 0 && (
            <Button
              appearance="subtle"
              icon={<Save24Regular />}
              onClick={handleSaveCurrentAsPreset}
            >
              Mentés előbeállításként
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};