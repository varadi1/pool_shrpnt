import React, { useState, useMemo, useCallback } from 'react';
import {
  makeStyles,
  shorthands,
  tokens,
  SearchBox,
  Checkbox,
  Label,
  Card,
  Button,
  Text,
  Dropdown,
  Option,
  Badge,
  Persona,
  Avatar,
  Input,
} from '@fluentui/react-components';
import {
  Building24Regular,
  People24Regular,
  Delete24Regular,
  Calendar24Regular,
  Folder24Regular,
  Shield24Regular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import type { PartnerAssignment as PartnerAssign } from '@/types/orders';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
  },
  searchSection: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('12px'),
  },
  partnerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    ...shorthands.gap('12px'),
    maxHeight: '300px',
    overflowY: 'auto',
    ...shorthands.padding('4px'),
  },
  partnerCard: {
    ...shorthands.padding('12px'),
    cursor: 'pointer',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius('4px'),
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      ...shorthands.border('1px', 'solid', tokens.colorBrandBackground),
    },
  },
  selectedPartnerCard: {
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorBrandBackground),
  },
  selectedPartners: {
    marginTop: '24px',
    ...shorthands.padding('16px'),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius('4px'),
  },
  selectedPartnerItem: {
    ...shorthands.padding('12px'),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius('4px'),
    marginBottom: '12px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  partnerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  partnerConfig: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    ...shorthands.gap('12px'),
  },
  folderSelection: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('8px'),
    marginTop: '8px',
  },
  partCheckboxes: {
    display: 'flex',
    ...shorthands.gap('16px'),
    flexWrap: 'wrap',
  },
  noPartners: {
    ...shorthands.padding('24px'),
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  partnerInfo: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('8px'),
  },
});

interface Company {
  id: string;
  name: string;
  type: 'partner' | 'client' | 'internal';
  contactEmail?: string;
  contactPerson?: string;
  activeProjects?: number;
}

interface Props {
  value: PartnerAssign[];
  availableParts: ('A' | 'B' | 'C')[];
  onChange: (partners: PartnerAssign[]) => void;
}

const mockCompanies: Company[] = [
  {
    id: '1',
    name: 'BuildCorp Kft.',
    type: 'partner',
    contactEmail: 'info@buildcorp.hu',
    contactPerson: 'Nagy László',
    activeProjects: 3,
  },
  {
    id: '2',
    name: 'ConstructPro Zrt.',
    type: 'partner',
    contactEmail: 'office@constructpro.hu',
    contactPerson: 'Kovács Andrea',
    activeProjects: 5,
  },
  {
    id: '3',
    name: 'TechBuild Solutions',
    type: 'partner',
    contactEmail: 'contact@techbuild.hu',
    contactPerson: 'Szabó Péter',
    activeProjects: 2,
  },
  {
    id: '4',
    name: 'Infrastructure Partners',
    type: 'partner',
    contactEmail: 'hello@infra-partners.hu',
    contactPerson: 'Tóth Márta',
    activeProjects: 7,
  },
  {
    id: '5',
    name: 'GreenBuild Kft.',
    type: 'partner',
    contactEmail: 'green@greenbuild.hu',
    contactPerson: 'Kiss János',
    activeProjects: 1,
  },
];

const defaultFolders = [
  '01_Tervezés',
  '02_Kivitelezés',
  '03_Dokumentáció',
  '04_Pénzügy',
];

export const PartnerAssignment: React.FC<Props> = ({ 
  value = [], 
  availableParts = [],
  onChange 
}) => {
  const styles = useStyles();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPartners, setSelectedPartners] = useState<PartnerAssign[]>(value);

  // Mock API call - replace with real API when backend is ready
  const { data: companies = mockCompanies, isLoading } = useQuery<Company[]>({
    queryKey: ['companies', 'partner'],
    queryFn: async () => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockCompanies;
    },
  });

  const filteredCompanies = useMemo(() => {
    if (!searchTerm) return companies;
    const term = searchTerm.toLowerCase();
    return companies.filter(
      company =>
        company.name.toLowerCase().includes(term) ||
        company.contactPerson?.toLowerCase().includes(term) ||
        company.contactEmail?.toLowerCase().includes(term)
    );
  }, [companies, searchTerm]);

  const handleCompanySelect = useCallback((company: Company) => {
    const existing = selectedPartners.find(p => p.companyId === company.id);
    if (existing) {
      // Remove if already selected
      const updated = selectedPartners.filter(p => p.companyId !== company.id);
      setSelectedPartners(updated);
      onChange(updated);
    } else {
      // Add new partner with default configuration
      const newPartner: PartnerAssign = {
        companyId: company.id,
        companyName: company.name,
        accessLevel: 'read',
        folders: [...defaultFolders],
        parts: [...availableParts],
      };
      const updated = [...selectedPartners, newPartner];
      setSelectedPartners(updated);
      onChange(updated);
    }
  }, [selectedPartners, availableParts, onChange]);

  const updatePartnerConfig = useCallback((
    companyId: string,
    updates: Partial<PartnerAssign>
  ) => {
    const updated = selectedPartners.map(p =>
      p.companyId === companyId ? { ...p, ...updates } : p
    );
    setSelectedPartners(updated);
    onChange(updated);
  }, [selectedPartners, onChange]);

  const removePartner = useCallback((companyId: string) => {
    const updated = selectedPartners.filter(p => p.companyId !== companyId);
    setSelectedPartners(updated);
    onChange(updated);
  }, [selectedPartners, onChange]);

  const isCompanySelected = (companyId: string) => {
    return selectedPartners.some(p => p.companyId === companyId);
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchSection}>
        <Label weight="semibold">Select Partner Companies</Label>
        <SearchBox
          placeholder="Search companies by name, contact, or email..."
          value={searchTerm}
          onChange={(_, data) => setSearchTerm(data.value)}
        />
        
        {isLoading ? (
          <Text>Loading companies...</Text>
        ) : (
          <div className={styles.partnerGrid}>
            {filteredCompanies.map(company => (
              <Card
                key={company.id}
                className={`${styles.partnerCard} ${
                  isCompanySelected(company.id) ? styles.selectedPartnerCard : ''
                }`}
                onClick={() => handleCompanySelect(company)}
              >
                <div className={styles.partnerInfo}>
                  <Building24Regular />
                  <div style={{ flex: 1 }}>
                    <Text weight="semibold">{company.name}</Text>
                    {company.contactPerson && (
                      <Text size={200} block>
                        <People24Regular style={{ width: '14px', height: '14px', marginRight: '4px' }} />
                        {company.contactPerson}
                      </Text>
                    )}
                    {company.activeProjects !== undefined && (
                      <Badge appearance="outline" size="small">
                        {company.activeProjects} active projects
                      </Badge>
                    )}
                  </div>
                  {isCompanySelected(company.id) && (
                    <Badge appearance="filled" color="brand">
                      Selected
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedPartners.length > 0 ? (
        <div className={styles.selectedPartners}>
          <Label weight="semibold" size="large">
            Selected Partners ({selectedPartners.length})
          </Label>
          
          {selectedPartners.map(partner => (
            <div key={partner.companyId} className={styles.selectedPartnerItem}>
              <div className={styles.partnerHeader}>
                <Text weight="semibold">
                  <Building24Regular style={{ marginRight: '8px' }} />
                  {partner.companyName}
                </Text>
                <Button
                  appearance="subtle"
                  icon={<Delete24Regular />}
                  onClick={() => removePartner(partner.companyId)}
                />
              </div>

              <div className={styles.partnerConfig}>
                <div>
                  <Label required>Access Level</Label>
                  <Dropdown
                    value={
                      partner.accessLevel === 'read' ? 'Read Only' :
                      partner.accessLevel === 'write' ? 'Read/Write' : 'Admin'
                    }
                    selectedOptions={[partner.accessLevel]}
                    onOptionSelect={(_, data) => {
                      updatePartnerConfig(partner.companyId, {
                        accessLevel: data.optionValue as 'read' | 'write' | 'admin',
                      });
                    }}
                  >
                    <Option value="read" text="Read Only">
                      <Shield24Regular style={{ marginRight: '8px', color: tokens.colorPaletteGreenForeground1 }} />
                      Read Only
                    </Option>
                    <Option value="write" text="Read/Write">
                      <Shield24Regular style={{ marginRight: '8px', color: tokens.colorPaletteYellowForeground1 }} />
                      Read/Write
                    </Option>
                    <Option value="admin" text="Admin">
                      <Shield24Regular style={{ marginRight: '8px', color: tokens.colorPaletteRedForeground1 }} />
                      Admin
                    </Option>
                  </Dropdown>
                </div>

                <div>
                  <Label>Expiry Date (Optional)</Label>
                  <Input
                    type="date"
                    value={partner.expiryDate ? partner.expiryDate.toISOString().split('T')[0] : ''}
                    onChange={(_, data) => {
                      updatePartnerConfig(partner.companyId, {
                        expiryDate: data.value ? new Date(data.value) : undefined,
                      });
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    contentAfter={<Calendar24Regular />}
                  />
                </div>
              </div>

              {availableParts.length > 0 && (
                <div className={styles.folderSelection}>
                  <Label>Assign to Parts</Label>
                  <div className={styles.partCheckboxes}>
                    {availableParts.map(part => (
                      <Checkbox
                        key={part}
                        label={`Part ${part}`}
                        checked={partner.parts?.includes(part) ?? false}
                        onChange={(_, data) => {
                          const currentParts = partner.parts || [];
                          const updatedParts = data.checked
                            ? [...currentParts, part]
                            : currentParts.filter(p => p !== part);
                          updatePartnerConfig(partner.companyId, {
                            parts: updatedParts,
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.folderSelection}>
                <Label>Folder Access</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {defaultFolders.map(folder => (
                    <Checkbox
                      key={folder}
                      label={
                        <>
                          <Folder24Regular style={{ width: '16px', height: '16px', marginRight: '4px' }} />
                          {folder}
                        </>
                      }
                      checked={partner.folders.includes(folder)}
                      onChange={(_, data) => {
                        const updatedFolders = data.checked
                          ? [...partner.folders, folder]
                          : partner.folders.filter(f => f !== folder);
                        updatePartnerConfig(partner.companyId, {
                          folders: updatedFolders,
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.noPartners}>
          <People24Regular style={{ fontSize: '48px', marginBottom: '12px' }} />
          <Text size={400}>No partners selected</Text>
          <Text size={200}>Select at least one partner company from the list above</Text>
        </div>
      )}
    </div>
  );
};

export default PartnerAssignment;