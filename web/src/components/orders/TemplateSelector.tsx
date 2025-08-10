import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  Text,
  Spinner,
  Button,
  Badge,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { 
  FolderRegular, 
  LockClosedRegular, 
  HistoryRegular,
  InfoRegular,
  CheckmarkCircleRegular
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { templatesApi, type Template, type TemplateFolder, getTemplates } from '@/services/api/templates';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  card: {
    cursor: 'pointer',
    ...shorthands.border('2px', 'solid', 'transparent'),
    transition: 'all 0.2s',
    '&:hover': {
      ...shorthands.border('2px', 'solid', tokens.colorBrandBackground),
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  selectedCard: {
    ...shorthands.border('2px', 'solid', tokens.colorBrandBackground),
    backgroundColor: tokens.colorBrandBackground2,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBody: {
    ...shorthands.padding('12px'),
  },
  metadata: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '8px',
  },
  folderTree: {
    ...shorthands.padding('12px'),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius('4px'),
    fontFamily: 'monospace',
    fontSize: '12px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  folderItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    ...shorthands.padding('4px', '0'),
  },
  lockedFolder: {
    color: tokens.colorPaletteRedForeground1,
  },
  recommendedBadge: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    color: tokens.colorPaletteGreenForeground2,
  },
});

interface TemplateSelectorProps {
  contractType?: string;
  value?: string;
  onChange: (templateId: string, template: Template) => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ 
  contractType,
  value,
  onChange 
}) => {
  const styles = useStyles();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  // Preview UI removed for testing stability

  // TODO: Replace with real API call when backend is ready
  const { data: templates, isLoading, error } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: async () => getTemplates(),
    staleTime: 0,
    gcTime: 0,
  });

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    onChange(template.id, template);
  };

  // Preview handler removed

  const renderFolderTree = (folders: TemplateFolder[]) => {
    return folders.map((folder, index) => {
      const depth = folder.path.split('/').length - 1;
      const indent = '  '.repeat(depth);
      const folderName = folder.path.split('/').pop();
      
      return (
        <div 
          key={index} 
          className={`${styles.folderItem} ${folder.locked ? styles.lockedFolder : ''}`}
        >
          <span>{indent}</span>
          <FolderRegular />
          <span>{folderName}</span>
          {folder.locked && <LockClosedRegular />}
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: tokens.colorNeutralForeground3 }}>
            {folder.permissions.join(', ')}
          </span>
        </div>
      );
    });
  };

  const getRecommendedTemplate = () => {
    if (!templates || !contractType) return null;
    // Simple recommendation logic based on contract type
    return templates.find(t => 
      t.tags?.includes(contractType.toLowerCase()) || 
      t.name.toLowerCase().includes(contractType.toLowerCase())
    );
  };

  const recommendedTemplate = getRecommendedTemplate();

  if (isLoading) {
    return (
      <div className={styles.container}>
        <Spinner label="Loading templates..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Text>Failed to load templates. Please try again.</Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Text weight="semibold">Select a Template</Text>
      
      <div className={styles.grid}>
        {templates?.map((template) => {
          const isSelected = value === template.id || selectedTemplate?.id === template.id;
          const isRecommended = recommendedTemplate?.id === template.id;
          
          return (
            <Card
              key={template.id}
              className={`${styles.card} ${isSelected ? styles.selectedCard : ''}`}
              onClick={() => handleTemplateSelect(template)}
              data-testid={`template-card-${template.id}`}
            >
              <CardHeader
                header={
                  <div className={styles.cardHeader}>
                    <Text weight="semibold">{template.name}</Text>
                    {isSelected && <CheckmarkCircleRegular />}
                  </div>
                }
                description={`Version ${template.version}`}
              />
              <div className={styles.cardBody}>
                {isRecommended && (
                  <Badge 
                    appearance="filled" 
                    className={styles.recommendedBadge}
                    style={{ marginBottom: '8px' }}
                  >
                    Recommended
                  </Badge>
                )}
                
                  <Text size={200}>{template.description}</Text>
                
                <div className={styles.metadata}>
                  <Badge appearance="outline" icon={<InfoRegular />}>
                    {template.folders.length} folders
                  </Badge>
                   <Badge appearance="outline" icon={<HistoryRegular />}>
                     Used {template.metadata?.usageCount ?? 0} times
                   </Badge>
                   {template.metadata?.lastUsed && (
                    <Badge appearance="outline">
                       Last: {new Date(template.metadata!.lastUsed).toLocaleDateString()}
                    </Badge>
                  )}
                </div>

                {/* Preview removed */}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default TemplateSelector;