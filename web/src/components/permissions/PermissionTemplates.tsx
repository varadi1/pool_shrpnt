import React, { useState, useCallback, useMemo } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardPreview,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Dropdown,
  Option,
  Field,
  Input,
  Textarea,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHeaderCell,
  Toolbar,
  ToolbarButton,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Text,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Tooltip,
  makeStyles,
  shorthands,
  tokens,
  mergeClasses,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  DocumentTextRegular,
  ShieldRegular,
  MoneyRegular,
  LockClosedRegular,
  ClockRegular,
  SaveRegular,
  EditRegular,
  DeleteRegular,
  AddRegular,
  CopyRegular,
  CheckmarkCircleRegular,
  InfoRegular,
  MoreVerticalRegular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PermissionTemplate,
  RoleType,
  PermissionLevel,
  RolePermission,
  FolderPermission,
} from '../../types/permissions';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    ...shorthands.gap('16px'),
  },
  toolbar: {
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.padding('8px'),
  },
  templatesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    ...shorthands.gap('16px'),
    ...shorthands.padding('16px'),
  },
  templateCard: {
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: tokens.shadow16,
    },
  },
  selectedCard: {
    ...shorthands.border('2px', 'solid', tokens.colorBrandForeground1),
  },
  templateIcon: {
    fontSize: '32px',
    color: tokens.colorBrandForeground1,
  },
  previewTable: {
    width: '100%',
    marginTop: '16px',
  },
  permissionCell: {
    textAlign: 'center',
  },
  customizeSection: {
    ...shorthands.padding('16px'),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  folderPattern: {
    fontFamily: 'monospace',
    fontSize: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.padding('2px', '4px'),
    ...shorthands.borderRadius('2px'),
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '200px',
  },
});

interface PermissionTemplatesProps {
  orderId?: string;
  onTemplateSelect?: (template: PermissionTemplate) => void;
  onTemplateApply?: (template: PermissionTemplate) => void;
  allowCustomization?: boolean;
  showApplyButton?: boolean;
}

// Predefined standard templates
const standardTemplates: PermissionTemplate[] = [
  {
    id: 'default-rbac',
    name: 'Default RBAC Matrix',
    description: 'Standard role-based access control for typical orders',
    matrix: [
      { roleType: 'NEU_Admin', level: 'full', source: 'role' },
      { roleType: 'NEU_PM', level: 'read', source: 'role' },
      { roleType: 'Company_Admin', level: 'write', source: 'role' },
      { roleType: 'Expert', level: 'write', source: 'role' },
      { roleType: 'NEU_QA', level: 'read', source: 'role' },
    ],
    applicableFor: ['standard', 'default'],
  },
  {
    id: 'financial-segregation',
    name: 'Financial Segregation',
    description: 'Restricted access for financial folders with TIG paths',
    matrix: [
      { roleType: 'NEU_Admin', level: 'full', source: 'role' },
      { roleType: 'NEU_PM', level: 'none', source: 'role' },
      { roleType: 'Company_Admin', level: 'none', source: 'role' },
      { roleType: 'Expert', level: 'none', source: 'role' },
      { roleType: 'NEU_QA', level: 'read', source: 'role' },
    ],
    applicableFor: ['financial', 'tig'],
  },
  {
    id: 'partner-specific',
    name: 'Partner-Specific Template',
    description: 'Enhanced permissions for partner company administrators',
    matrix: [
      { roleType: 'NEU_Admin', level: 'full', source: 'role' },
      { roleType: 'NEU_PM', level: 'read', source: 'role' },
      { roleType: 'Company_Admin', level: 'full', source: 'role' },
      { roleType: 'Expert', level: 'write', source: 'role' },
      { roleType: 'NEU_QA', level: 'read', source: 'role' },
    ],
    applicableFor: ['partner', 'collaborative'],
  },
  {
    id: 'time-based-lock',
    name: 'Time-Based Lock Template',
    description: 'Progressive lock-down based on project timeline',
    matrix: [
      { roleType: 'NEU_Admin', level: 'full', source: 'role' },
      { roleType: 'NEU_PM', level: 'read', source: 'role' },
      { roleType: 'Company_Admin', level: 'read', source: 'role' },
      { roleType: 'Expert', level: 'read', source: 'role' },
      { roleType: 'NEU_QA', level: 'write', source: 'role' },
    ],
    applicableFor: ['deadline', 'time-sensitive'],
  },
];

const roleLabels: Record<RoleType, string> = {
  NEU_Admin: 'NEÜ Admin',
  NEU_PM: 'NEÜ PM',
  Company_Admin: 'Company Admin',
  Expert: 'Expert',
  NEU_QA: 'NEÜ QA',
};

const getTemplateIcon = (templateId: string) => {
  switch (templateId) {
    case 'default-rbac':
      return <ShieldRegular />;
    case 'financial-segregation':
      return <MoneyRegular />;
    case 'partner-specific':
      return <DocumentTextRegular />;
    case 'time-based-lock':
      return <ClockRegular />;
    default:
      return <DocumentRegular />;
  }
};

export const PermissionTemplates: React.FC<PermissionTemplatesProps> = ({
  orderId,
  onTemplateSelect,
  onTemplateApply,
  allowCustomization = true,
  showApplyButton = true,
}) => {
  const styles = useStyles();
  const queryClient = useQueryClient();

  const [selectedTemplate, setSelectedTemplate] = useState<PermissionTemplate | null>(null);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [customTemplate, setCustomTemplate] = useState<Partial<PermissionTemplate>>({});
  const [editingMatrix, setEditingMatrix] = useState<RolePermission[]>([]);

  // Fetch custom templates from API
  const { data: customTemplates = [], isLoading } = useQuery({
    queryKey: ['permission-templates', 'custom'],
    queryFn: async () => {
      // Mock API call - replace with actual API
      return [] as PermissionTemplate[];
    },
  });

  // Save custom template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (template: PermissionTemplate) => {
      // Mock API call - replace with actual API
      await new Promise(resolve => setTimeout(resolve, 500));
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-templates'] });
      setShowSaveDialog(false);
    },
  });

  // Apply template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: async ({
      templateId,
      orderId,
    }: {
      templateId: string;
      orderId: string;
    }) => {
      // Mock API call - replace with actual API
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', orderId] });
    },
  });

  // Delete custom template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      // Mock API call - replace with actual API
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-templates'] });
    },
  });

  const allTemplates = useMemo(() => {
    return [...standardTemplates, ...customTemplates];
  }, [customTemplates]);

  const handleTemplateSelect = useCallback((template: PermissionTemplate) => {
    setSelectedTemplate(template);
    if (onTemplateSelect) {
      onTemplateSelect(template);
    }
  }, [onTemplateSelect]);

  const handleCustomize = useCallback(() => {
    if (selectedTemplate) {
      setCustomTemplate({
        ...selectedTemplate,
        id: `custom-${Date.now()}`,
        name: `${selectedTemplate.name} (Custom)`,
      });
      setEditingMatrix([...selectedTemplate.matrix]);
      setShowCustomDialog(true);
    }
  }, [selectedTemplate]);

  const handleSaveTemplate = useCallback(() => {
    if (customTemplate.name && editingMatrix.length > 0) {
      const newTemplate: PermissionTemplate = {
        id: customTemplate.id || `custom-${Date.now()}`,
        name: customTemplate.name,
        description: customTemplate.description || '',
        matrix: editingMatrix,
        applicableFor: customTemplate.applicableFor || [],
      };
      saveTemplateMutation.mutate(newTemplate);
    }
  }, [customTemplate, editingMatrix, saveTemplateMutation]);

  const handleApplyTemplate = useCallback(() => {
    if (selectedTemplate && orderId) {
      applyTemplateMutation.mutate({
        templateId: selectedTemplate.id,
        orderId,
      });
      if (onTemplateApply) {
        onTemplateApply(selectedTemplate);
      }
    }
  }, [selectedTemplate, orderId, applyTemplateMutation, onTemplateApply]);

  const handlePermissionChange = useCallback((role: RoleType, level: PermissionLevel) => {
    setEditingMatrix(prev => {
      const updated = [...prev];
      const index = updated.findIndex(p => p.roleType === role);
      if (index >= 0) {
        updated[index] = { ...updated[index], level };
      } else {
        updated.push({ roleType: role, level, source: 'explicit' });
      }
      return updated;
    });
  }, []);

  const renderTemplateCard = (template: PermissionTemplate) => {
    const isSelected = selectedTemplate?.id === template.id;
    const isCustom = !standardTemplates.find(t => t.id === template.id);

    return (
      <Card
        key={template.id}
        className={mergeClasses(
          styles.templateCard,
          isSelected && styles.selectedCard
        )}
        onClick={() => handleTemplateSelect(template)}
      >
        <CardHeader
          image={<div className={styles.templateIcon}>{getTemplateIcon(template.id)}</div>}
          header={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text weight="semibold">{template.name}</Text>
              {isCustom && <Badge appearance="tint">Custom</Badge>}
            </div>
          }
          description={<Text size={200}>{template.description}</Text>}
          action={
            isCustom ? (
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    icon={<MoreVerticalRegular />}
                    size="small"
                  />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem icon={<EditRegular />}>Edit</MenuItem>
                    <MenuItem
                      icon={<DeleteRegular />}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplateMutation.mutate(template.id);
                      }}
                    >
                      Delete
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            ) : undefined
          }
        />
        <CardPreview>
          <div style={{ padding: '8px' }}>
            <Text size={200} weight="semibold">Permission Levels:</Text>
            <div style={{ marginTop: '8px' }}>
              {template.matrix.slice(0, 3).map(perm => (
                <div key={perm.roleType} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <Text size={100}>{roleLabels[perm.roleType]}:</Text>
                  <Badge
                    appearance="filled"
                    color={
                      perm.level === 'full' ? 'success' :
                      perm.level === 'write' ? 'warning' :
                      perm.level === 'read' ? 'informative' : 'subtle'
                    }
                    size="small"
                  >
                    {perm.level}
                  </Badge>
                </div>
              ))}
              {template.matrix.length > 3 && (
                <Text size={100} style={{ fontStyle: 'italic' }}>
                  +{template.matrix.length - 3} more...
                </Text>
              )}
            </div>
            {template.applicableFor.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <Text size={100}>Applicable for: {template.applicableFor.join(', ')}</Text>
              </div>
            )}
          </div>
        </CardPreview>
      </Card>
    );
  };

  const renderPermissionMatrix = (matrix: RolePermission[]) => {
    const roles: RoleType[] = ['NEU_Admin', 'NEU_PM', 'Company_Admin', 'Expert', 'NEU_QA'];
    
    return (
      <Table className={styles.previewTable}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Role</TableHeaderCell>
            <TableHeaderCell className={styles.permissionCell}>Permission Level</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map(role => {
            const permission = matrix.find(p => p.roleType === role);
            return (
              <TableRow key={role}>
                <TableCell>
                  <Text weight="medium">{roleLabels[role]}</Text>
                </TableCell>
                <TableCell className={styles.permissionCell}>
                  <Badge
                    appearance="filled"
                    color={
                      permission?.level === 'full' ? 'success' :
                      permission?.level === 'write' ? 'warning' :
                      permission?.level === 'read' ? 'informative' : 'subtle'
                    }
                  >
                    {permission?.level || 'none'}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="large" label="Loading templates..." />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Toolbar className={styles.toolbar}>
        <ToolbarButton
          icon={<AddRegular />}
          onClick={() => {
            setCustomTemplate({
              id: `custom-${Date.now()}`,
              name: '',
              description: '',
              matrix: [],
              applicableFor: [],
            });
            setEditingMatrix([]);
            setShowSaveDialog(true);
          }}
        >
          Create Template
        </ToolbarButton>
        {selectedTemplate && allowCustomization && (
          <ToolbarButton
            icon={<EditRegular />}
            onClick={handleCustomize}
          >
            Customize Selected
          </ToolbarButton>
        )}
        {selectedTemplate && showApplyButton && orderId && (
          <ToolbarButton
            icon={<CheckmarkCircleRegular />}
            onClick={handleApplyTemplate}
            disabled={applyTemplateMutation.isPending}
          >
            Apply to Order
          </ToolbarButton>
        )}
      </Toolbar>

      {applyTemplateMutation.isSuccess && (
        <MessageBar intent="success">
          <MessageBarBody>
            <MessageBarTitle>Template applied successfully</MessageBarTitle>
            The permission template has been applied to the order.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.templatesGrid}>
        {allTemplates.map(template => renderTemplateCard(template))}
      </div>

      {selectedTemplate && (
        <Card>
          <CardHeader
            header={<Text weight="semibold">Selected Template Preview</Text>}
            description={selectedTemplate.description}
          />
          <div style={{ padding: '16px' }}>
            {renderPermissionMatrix(selectedTemplate.matrix)}
          </div>
        </Card>
      )}

      {/* Customize Template Dialog */}
      <Dialog open={showCustomDialog} onOpenChange={(_, data) => setShowCustomDialog(data.open)}>
        <DialogSurface style={{ maxWidth: '600px' }}>
          <DialogBody>
            <DialogTitle>Customize Template</DialogTitle>
            <DialogContent>
              <Field label="Template Name" required>
                <Input
                  value={customTemplate.name || ''}
                  onChange={(_, data) => setCustomTemplate(prev => ({ ...prev, name: data.value }))}
                />
              </Field>
              
              <Field label="Description" style={{ marginTop: '16px' }}>
                <Textarea
                  value={customTemplate.description || ''}
                  onChange={(_, data) => setCustomTemplate(prev => ({ ...prev, description: data.value }))}
                  rows={3}
                />
              </Field>

              <div className={styles.customizeSection} style={{ marginTop: '16px' }}>
                <Text weight="semibold">Permission Matrix</Text>
                <Table style={{ marginTop: '8px' }}>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Role</TableHeaderCell>
                      <TableHeaderCell>Permission Level</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(['NEU_Admin', 'NEU_PM', 'Company_Admin', 'Expert', 'NEU_QA'] as RoleType[]).map(role => {
                      const current = editingMatrix.find(p => p.roleType === role);
                      return (
                        <TableRow key={role}>
                          <TableCell>{roleLabels[role]}</TableCell>
                          <TableCell>
                            <Dropdown
                              value={current?.level || 'none'}
                              onOptionSelect={(_, data) => {
                                if (data.optionValue) {
                                  handlePermissionChange(role, data.optionValue as PermissionLevel);
                                }
                              }}
                            >
                              <Option value="none">None</Option>
                              <Option value="read">Read</Option>
                              <Option value="write">Write</Option>
                              <Option value="full">Full</Option>
                            </Dropdown>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowCustomDialog(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                icon={<SaveRegular />}
                onClick={() => {
                  setShowCustomDialog(false);
                  setShowSaveDialog(true);
                }}
              >
                Save as Custom Template
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Save Template Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={(_, data) => setShowSaveDialog(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Save Custom Template</DialogTitle>
            <DialogContent>
              <Field label="Template Name" required>
                <Input
                  value={customTemplate.name || ''}
                  onChange={(_, data) => setCustomTemplate(prev => ({ ...prev, name: data.value }))}
                />
              </Field>
              
              <Field label="Description" style={{ marginTop: '16px' }}>
                <Textarea
                  value={customTemplate.description || ''}
                  onChange={(_, data) => setCustomTemplate(prev => ({ ...prev, description: data.value }))}
                  rows={3}
                />
              </Field>

              <Field label="Applicable For" style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {['standard', 'financial', 'partner', 'deadline'].map(type => (
                    <Checkbox
                      key={type}
                      label={type.charAt(0).toUpperCase() + type.slice(1)}
                      checked={customTemplate.applicableFor?.includes(type) || false}
                      onChange={(_, data) => {
                        setCustomTemplate(prev => ({
                          ...prev,
                          applicableFor: data.checked
                            ? [...(prev.applicableFor || []), type]
                            : (prev.applicableFor || []).filter(t => t !== type),
                        }));
                      }}
                    />
                  ))}
                </div>
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                icon={<SaveRegular />}
                onClick={handleSaveTemplate}
                disabled={!customTemplate.name || saveTemplateMutation.isPending}
              >
                Save Template
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};