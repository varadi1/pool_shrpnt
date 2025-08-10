import React, { useState, useRef } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  DialogActions,
  Dropdown,
  Option,
  Field,
  Textarea,
  Radio,
  RadioGroup,
  Checkbox,
  ProgressBar,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  makeStyles,
  tokens,
  Spinner,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHeaderCell,
} from '@fluentui/react-components';
import {
  ArrowDownload24Regular,
  ArrowUpload24Regular,
  Document24Regular,
  FolderZip24Regular,
  Share24Regular,
  ArrowSync24Regular,
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  Warning24Regular,
  Info24Regular,
  Copy24Regular,
  Mail24Regular,
} from '@fluentui/react-icons';
import type { Template, TemplateVersion, FolderNode } from '@/types/templates';
import { validateTemplate } from '@/services/templateValidation';
import { templatesApi } from '@/services/templates';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
  },
  dialog: {
    maxWidth: '800px',
    minHeight: '400px',
  },
  section: {
    marginBottom: tokens.spacingVerticalL,
  },
  formatSelector: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  previewArea: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
    maxHeight: '400px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
  },
  fileInput: {
    display: 'none',
  },
  dropZone: {
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:hover': {
      borderColor: tokens.colorBrandBackground,
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  dropZoneActive: {
    borderColor: tokens.colorBrandBackground,
    backgroundColor: tokens.colorBrandBackground2,
  },
  progressSection: {
    marginTop: tokens.spacingVerticalL,
  },
  templateList: {
    maxHeight: '300px',
    overflowY: 'auto',
  },
  templateRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  selectedRow: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  shareSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  shareLink: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  linkInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '12px',
  },
});

export type ExportFormat = 'json' | 'yaml';
export type ImportValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  template?: Template;
};

export interface ImportExportProps {
  templates?: Template[];
  onImport?: (templates: Template[]) => void;
  onExport?: (templateIds: string[]) => void;
  className?: string;
}

export const ImportExport: React.FC<ImportExportProps> = ({
  templates = [],
  onImport,
  onExport,
  className,
}) => {
  const styles = useStyles();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [includeVersions, setIncludeVersions] = useState(true);
  const [exportPreview, setExportPreview] = useState<string>('');
  
  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importContent, setImportContent] = useState<string>('');
  const [importValidation, setImportValidation] = useState<ImportValidationResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  
  // Backup state
  const [backupOpen, setBackupOpen] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  
  // Share state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareExpiry, setShareExpiry] = useState('24h');
  
  // Migration state
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [sourceVersion, setSourceVersion] = useState('');
  const [targetVersion, setTargetVersion] = useState('');

  // Helper function to convert template to export format
  const convertToExportFormat = async (templateIds: string[], format: ExportFormat): Promise<string> => {
    const exportData: any = {
      exportVersion: '1.0.0',
      exportDate: new Date().toISOString(),
      templates: [],
    };

    for (const id of templateIds) {
      const template = templates.find(t => t.id === id);
      if (!template) continue;

      const templateData: any = {
        ...template,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      };

      if (includeVersions) {
        try {
          const versions = await templatesApi.getTemplateVersions(id);
          templateData.versions = versions;
        } catch (error) {
          console.error(`Failed to fetch versions for template ${id}:`, error);
        }
      }

      exportData.templates.push(templateData);
    }

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    } else {
      // Simple YAML conversion
      return convertToYaml(exportData);
    }
  };

  // Simple YAML converter
  const convertToYaml = (obj: any, indent = 0): string => {
    let yaml = '';
    const spaces = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml += `${spaces}${key}: null\n`;
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else if (typeof value === 'string') {
        yaml += `${spaces}${key}: "${value}"\n`;
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach(item => {
          if (typeof item === 'object') {
            yaml += `${spaces}  -\n`;
            const itemYaml = convertToYaml(item, indent + 2);
            yaml += itemYaml.split('\n').map(line => line ? `  ${line}` : '').join('\n');
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        });
      } else if (typeof value === 'object') {
        yaml += `${spaces}${key}:\n`;
        yaml += convertToYaml(value, indent + 1);
      }
    }

    return yaml;
  };

  // Handle export
  const handleExport = async () => {
    if (selectedTemplates.length === 0) return;

    const exportContent = await convertToExportFormat(selectedTemplates, exportFormat);
    setExportPreview(exportContent);

    // Trigger download
    const blob = new Blob([exportContent], { 
      type: exportFormat === 'json' ? 'application/json' : 'text/yaml' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates-export-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (onExport) {
      onExport(selectedTemplates);
    }
  };

  // Parse import content
  const parseImportContent = (content: string): ImportValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let parsed: any = null;

    try {
      // Try to parse as JSON first
      parsed = JSON.parse(content);
    } catch (jsonError) {
      // Try to parse as YAML (basic parsing)
      try {
        // Very basic YAML parsing - in production, use a proper YAML parser
        errors.push('YAML parsing not fully implemented. Please use JSON format.');
        return { valid: false, errors, warnings };
      } catch (yamlError) {
        errors.push('Invalid file format. Expected JSON or YAML.');
        return { valid: false, errors, warnings };
      }
    }

    // Validate structure
    if (!parsed.templates || !Array.isArray(parsed.templates)) {
      errors.push('Invalid export file structure. Missing templates array.');
      return { valid: false, errors, warnings };
    }

    // Validate each template
    for (const template of parsed.templates) {
      const validation = validateTemplate(template);
      if (!validation.isValid) {
        errors.push(...validation.errors.map(e => `${template.name}: ${e.message}`));
      }
      if (validation.warnings) {
        warnings.push(...validation.warnings.map(w => `${template.name}: ${w.message}`));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      template: parsed,
    };
  };

  // Handle import
  const handleImport = async () => {
    if (!importContent) return;

    const validation = parseImportContent(importContent);
    setImportValidation(validation);

    if (validation.valid && validation.template) {
      setImportProgress(0);
      const templates = validation.template.templates;
      const totalTemplates = templates.length;

      for (let i = 0; i < totalTemplates; i++) {
        // Simulate import progress
        await new Promise(resolve => setTimeout(resolve, 500));
        setImportProgress((i + 1) / totalTemplates * 100);
      }

      if (onImport) {
        onImport(templates);
      }

      // Reset state
      setTimeout(() => {
        setImportOpen(false);
        setImportContent('');
        setImportValidation(null);
        setImportProgress(0);
      }, 1000);
    }
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/json' || file.name.endsWith('.yaml') || file.name.endsWith('.yml'))) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportContent(content);
        const validation = parseImportContent(content);
        setImportValidation(validation);
      };
      reader.readAsText(file);
    }
  };

  // Handle backup creation
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);

    // Select all templates for backup
    const allTemplateIds = templates.map(t => t.id);
    const backupContent = await convertToExportFormat(allTemplateIds, 'json');

    // Create backup with timestamp
    const blob = new Blob([backupContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates-backup-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsCreatingBackup(false);
    setBackupOpen(false);
  };

  // Handle share
  const handleShare = async () => {
    if (selectedTemplates.length === 0) return;

    // Generate share link (mock implementation)
    const shareId = Math.random().toString(36).substring(7);
    const link = `${window.location.origin}/templates/shared/${shareId}`;
    setShareLink(link);

    // In a real implementation, this would call an API to create the share
    try {
      // await templatesApi.createShare(selectedTemplates, shareExpiry);
      console.log('Creating share link with expiry:', shareExpiry);
    } catch (error) {
      console.error('Failed to create share link:', error);
    }
  };

  // Copy share link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
  };

  return (
    <div className={`${styles.container} ${className || ''}`}>
      {/* Export Button */}
      <Dialog open={exportOpen} onOpenChange={(_, data) => setExportOpen(data.open)}>
        <DialogTrigger disableButtonEnhancement>
          <Button icon={<ArrowDownload24Regular />}>Export Templates</Button>
        </DialogTrigger>
        <DialogSurface className={styles.dialog}>
          <DialogTitle>Export Templates</DialogTitle>
          <DialogContent>
            <DialogBody>
              <div className={styles.section}>
                <Field label="Select Templates to Export">
                  <div className={styles.templateList}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Select</TableHeaderCell>
                          <TableHeaderCell>Name</TableHeaderCell>
                          <TableHeaderCell>Version</TableHeaderCell>
                          <TableHeaderCell>Status</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {templates.map(template => (
                          <TableRow
                            key={template.id}
                            className={`${styles.templateRow} ${
                              selectedTemplates.includes(template.id) ? styles.selectedRow : ''
                            }`}
                            onClick={() => {
                              setSelectedTemplates(prev =>
                                prev.includes(template.id)
                                  ? prev.filter(id => id !== template.id)
                                  : [...prev, template.id]
                              );
                            }}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedTemplates.includes(template.id)}
                                onChange={(_, data) => {
                                  if (data.checked) {
                                    setSelectedTemplates(prev => [...prev, template.id]);
                                  } else {
                                    setSelectedTemplates(prev => prev.filter(id => id !== template.id));
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>{template.name}</TableCell>
                            <TableCell>{template.currentVersion}</TableCell>
                            <TableCell>
                              <Badge appearance="filled" color={template.status === 'active' ? 'success' : 'neutral'}>
                                {template.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Field>
              </div>

              <div className={styles.section}>
                <Field label="Export Format">
                  <RadioGroup value={exportFormat} onChange={(_, data) => setExportFormat(data.value as ExportFormat)}>
                    <Radio value="json" label="JSON" />
                    <Radio value="yaml" label="YAML" />
                  </RadioGroup>
                </Field>
              </div>

              <div className={styles.section}>
                <Checkbox
                  checked={includeVersions}
                  onChange={(_, data) => setIncludeVersions(data.checked as boolean)}
                  label="Include all version history"
                />
              </div>

              {exportPreview && (
                <div className={styles.section}>
                  <Field label="Preview">
                    <div className={styles.previewArea}>
                      {exportPreview.substring(0, 1000)}
                      {exportPreview.length > 1000 && '...'}
                    </div>
                  </Field>
                </div>
              )}
            </DialogBody>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              icon={<ArrowDownload24Regular />}
              onClick={handleExport}
              disabled={selectedTemplates.length === 0}
            >
              Export ({selectedTemplates.length} selected)
            </Button>
          </DialogActions>
        </DialogSurface>
      </Dialog>

      {/* Import Button */}
      <Dialog open={importOpen} onOpenChange={(_, data) => setImportOpen(data.open)}>
        <DialogTrigger disableButtonEnhancement>
          <Button icon={<ArrowUpload24Regular />}>Import Templates</Button>
        </DialogTrigger>
        <DialogSurface className={styles.dialog}>
          <DialogTitle>Import Templates</DialogTitle>
          <DialogContent>
            <DialogBody>
              <div className={styles.section}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.yaml,.yml"
                  className={styles.fileInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const content = event.target?.result as string;
                        setImportContent(content);
                        const validation = parseImportContent(content);
                        setImportValidation(validation);
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                <div
                  className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Document24Regular />
                  <Text>Drop template file here or click to browse</Text>
                  <Text size={200}>Supports JSON and YAML formats</Text>
                </div>
              </div>

              {importContent && (
                <div className={styles.section}>
                  <Field label="Import Content">
                    <Textarea
                      value={importContent}
                      onChange={(_, data) => {
                        setImportContent(data.value);
                        const validation = parseImportContent(data.value);
                        setImportValidation(validation);
                      }}
                      rows={10}
                      resize="vertical"
                    />
                  </Field>
                </div>
              )}

              {importValidation && (
                <div className={styles.section}>
                  {importValidation.errors.length > 0 && (
                    <MessageBar intent="error" icon={<ErrorCircle24Regular />}>
                      <MessageBarBody>
                        <MessageBarTitle>Validation Errors</MessageBarTitle>
                        <ul>
                          {importValidation.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </MessageBarBody>
                    </MessageBar>
                  )}

                  {importValidation.warnings.length > 0 && (
                    <MessageBar intent="warning" icon={<Warning24Regular />}>
                      <MessageBarBody>
                        <MessageBarTitle>Warnings</MessageBarTitle>
                        <ul>
                          {importValidation.warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </MessageBarBody>
                    </MessageBar>
                  )}

                  {importValidation.valid && (
                    <MessageBar intent="success" icon={<CheckmarkCircle24Regular />}>
                      <MessageBarBody>
                        <MessageBarTitle>Validation Successful</MessageBarTitle>
                        Ready to import {importValidation.template?.templates?.length || 0} template(s)
                      </MessageBarBody>
                    </MessageBar>
                  )}
                </div>
              )}

              {importProgress > 0 && (
                <div className={styles.progressSection}>
                  <Field label={`Importing... ${Math.round(importProgress)}%`}>
                    <ProgressBar value={importProgress / 100} />
                  </Field>
                </div>
              )}
            </DialogBody>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              icon={<ArrowUpload24Regular />}
              onClick={handleImport}
              disabled={!importValidation?.valid || importProgress > 0}
            >
              {importProgress > 0 ? 'Importing...' : 'Import Templates'}
            </Button>
          </DialogActions>
        </DialogSurface>
      </Dialog>

      {/* Backup Button */}
      <Dialog open={backupOpen} onOpenChange={(_, data) => setBackupOpen(data.open)}>
        <DialogTrigger disableButtonEnhancement>
          <Button icon={<FolderZip24Regular />}>Create Backup</Button>
        </DialogTrigger>
        <DialogSurface>
          <DialogTitle>Create Template Backup</DialogTitle>
          <DialogContent>
            <DialogBody>
              <MessageBar intent="info" icon={<Info24Regular />}>
                <MessageBarBody>
                  <MessageBarTitle>Backup Information</MessageBarTitle>
                  This will create a complete backup of all {templates.length} templates including their version history.
                  The backup will be downloaded as a JSON file with timestamp.
                </MessageBarBody>
              </MessageBar>
            </DialogBody>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              icon={isCreatingBackup ? <Spinner size="tiny" /> : <FolderZip24Regular />}
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
            >
              {isCreatingBackup ? 'Creating Backup...' : 'Create Backup'}
            </Button>
          </DialogActions>
        </DialogSurface>
      </Dialog>

      {/* Share Button */}
      <Dialog open={shareOpen} onOpenChange={(_, data) => setShareOpen(data.open)}>
        <DialogTrigger disableButtonEnhancement>
          <Button icon={<Share24Regular />}>Share Templates</Button>
        </DialogTrigger>
        <DialogSurface className={styles.dialog}>
          <DialogTitle>Share Templates</DialogTitle>
          <DialogContent>
            <DialogBody>
              <div className={styles.section}>
                <Field label="Templates to Share">
                  <Text>{selectedTemplates.length} template(s) selected</Text>
                </Field>
              </div>

              <div className={styles.section}>
                <Field label="Share Link Expiry">
                  <Dropdown
                    value={shareExpiry}
                    onOptionSelect={(_, data) => setShareExpiry(data.optionValue as string)}
                  >
                    <Option value="1h">1 hour</Option>
                    <Option value="24h">24 hours</Option>
                    <Option value="7d">7 days</Option>
                    <Option value="30d">30 days</Option>
                    <Option value="never">Never expires</Option>
                  </Dropdown>
                </Field>
              </div>

              {shareLink && (
                <div className={styles.shareSection}>
                  <Field label="Share Link">
                    <div className={styles.shareLink}>
                      <input
                        type="text"
                        value={shareLink}
                        readOnly
                        className={styles.linkInput}
                      />
                      <Button
                        icon={<Copy24Regular />}
                        onClick={handleCopyLink}
                        title="Copy to clipboard"
                      />
                      <Button
                        icon={<Mail24Regular />}
                        onClick={() => {
                          window.location.href = `mailto:?subject=Shared Templates&body=${encodeURIComponent(shareLink)}`;
                        }}
                        title="Send via email"
                      />
                    </div>
                  </Field>
                </div>
              )}
            </DialogBody>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Close</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              icon={<Share24Regular />}
              onClick={handleShare}
              disabled={selectedTemplates.length === 0}
            >
              Generate Share Link
            </Button>
          </DialogActions>
        </DialogSurface>
      </Dialog>

      {/* Migration Tools Button */}
      <Button icon={<ArrowSync24Regular />} onClick={() => setMigrationOpen(true)}>
        Migration Tools
      </Button>
      <Dialog open={migrationOpen} onOpenChange={(_, data) => setMigrationOpen(data.open)}>
        <DialogSurface className={styles.dialog}>
          <DialogTitle>Template Migration Tools</DialogTitle>
          <DialogContent>
            <DialogBody>
              <div className={styles.section}>
                <Field label="Source Version">
                  <Dropdown
                    placeholder="Select source version"
                    value={sourceVersion}
                    onOptionSelect={(_, data) => setSourceVersion(data.optionValue as string)}
                  >
                    <Option value="1.0.0">v1.0.0 - Initial Release</Option>
                    <Option value="1.1.0">v1.1.0 - Added Financial Folders</Option>
                    <Option value="1.2.0">v1.2.0 - Permission Updates</Option>
                    <Option value="2.0.0">v2.0.0 - Major Restructure</Option>
                  </Dropdown>
                </Field>
              </div>

              <div className={styles.section}>
                <Field label="Target Version">
                  <Dropdown
                    placeholder="Select target version"
                    value={targetVersion}
                    onOptionSelect={(_, data) => setTargetVersion(data.optionValue as string)}
                  >
                    <Option value="1.1.0">v1.1.0 - Added Financial Folders</Option>
                    <Option value="1.2.0">v1.2.0 - Permission Updates</Option>
                    <Option value="2.0.0">v2.0.0 - Major Restructure</Option>
                    <Option value="2.1.0">v2.1.0 - Latest</Option>
                  </Dropdown>
                </Field>
              </div>

              {sourceVersion && targetVersion && (
                <div className={styles.section}>
                  <MessageBar intent="info" icon={<Info24Regular />}>
                    <MessageBarBody>
                      <MessageBarTitle>Migration Analysis</MessageBarTitle>
                      <Text>
                        Migrating from v{sourceVersion} to v{targetVersion}
                        {parseFloat(targetVersion) - parseFloat(sourceVersion) >= 1 && (
                          <><br />⚠️ Major version change detected - manual review required</>
                        )}
                      </Text>
                    </MessageBarBody>
                  </MessageBar>
                </div>
              )}
            </DialogBody>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              icon={<ArrowSync24Regular />}
              disabled={!sourceVersion || !targetVersion}
            >
              Generate Migration Plan
            </Button>
          </DialogActions>
        </DialogSurface>
      </Dialog>
    </div>
  );
};