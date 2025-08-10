import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  shorthands,
  Text,
  Input,
  Textarea,
  Button,
  Label,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
} from '@fluentui/react-components';
import {
  Save24Regular,
  Dismiss24Regular,
  Copy24Regular,
} from '@fluentui/react-icons';
import { FolderTree } from '@/components/templates/FolderTree';
import { FolderPropertiesPanel } from '@/components/templates/FolderPropertiesPanel';
import { TemplatePreview } from '@/components/templates/TemplatePreview';
import { templatesApi } from '@/services/templates';
import { templateValidation } from '@/services/templateValidation';
import type { Template, FolderNode, FolderProperties } from '@/types/templates';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke1),
  },
  headerInfo: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  headerActions: {
    display: 'flex',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  content: {
    display: 'flex',
    flexGrow: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '300px',
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.padding(tokens.spacingVerticalM),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRight('1px', 'solid', tokens.colorNeutralStroke1),
  },
  mainArea: {
    flexGrow: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 350px',
    ...shorthands.gap(tokens.spacingHorizontalM),
    ...shorthands.padding(tokens.spacingVerticalM),
  },
  treeContainer: {
    height: '100%',
  },
  propertiesContainer: {
    height: '100%',
  },
  previewContainer: {
    width: '400px',
    ...shorthands.padding(tokens.spacingVerticalM),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderLeft('1px', 'solid', tokens.colorNeutralStroke1),
  },
  metadataField: {
    marginBottom: tokens.spacingVerticalM,
  },
  validationErrors: {
    marginTop: tokens.spacingVerticalM,
  },
  spinner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
});

const createDefaultRootNode = (): FolderNode => ({
  id: 'root',
  name: 'Root',
  path: '/',
  type: 'folder',
  children: [],
  properties: {
    required: true,
    locked: false,
  },
  permissions: {
    inherit: false,
    breakInheritance: false,
    groups: [],
  },
  metadata: {},
});

export const TemplateEditor: React.FC = () => {
  const styles = useStyles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: templateId } = useParams<{ id: string }>();
  const isCloning = window.location.pathname.includes('/clone');
  const isEditing = !!templateId && !isCloning;

  const [template, setTemplate] = useState<Partial<Template>>({
    name: '',
    description: '',
    status: 'draft',
  });
  const [rootNode, setRootNode] = useState<FolderNode>(createDefaultRootNode());
  const [selectedNode, setSelectedNode] = useState<FolderNode | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load existing template if editing or cloning
  const { data: existingTemplate, isLoading } = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => templatesApi.getTemplate(templateId!),
    enabled: !!templateId,
  });

  useEffect(() => {
    if (existingTemplate) {
      if (isCloning) {
        setTemplate({
          ...existingTemplate,
          name: `${existingTemplate.name} (Copy)`,
          status: 'draft',
        });
      } else {
        setTemplate(existingTemplate);
      }
      // Load the template structure from the latest version
      // This would normally fetch the version structure
      // For now, we'll use a placeholder structure
      const loadedStructure = createDefaultRootNode();
      // Add some sample folders if cloning or editing
      if (existingTemplate.name) {
        loadedStructure.children = [
          {
            id: 'documents',
            name: 'Documents',
            path: '/Documents',
            type: 'folder',
            children: [],
            properties: { required: true, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          {
            id: 'financial',
            name: 'Financial',
            path: '/Financial',
            type: 'folder',
            children: [],
            properties: { required: true, locked: true, lockSchedule: { t3: true } },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          {
            id: 'contracts',
            name: 'Contracts',
            path: '/Contracts',
            type: 'folder',
            children: [],
            properties: { required: true, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
        ];
      }
      setRootNode(loadedStructure);
    }
  }, [existingTemplate, isCloning]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validation = templateValidation.validateTemplate(template, rootNode);
      if (!validation.valid) {
        throw new Error('Validation failed');
      }

      const templateData = {
        ...template,
        structure: rootNode,
      };

      if (isEditing) {
        return await templatesApi.updateTemplate(templateId!, templateData);
      } else {
        return await templatesApi.createTemplate(templateData);
      }
    },
    onSuccess: (savedTemplate) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      navigate(`/templates/${savedTemplate.id}`);
    },
    onError: (error) => {
      console.error('Failed to save template:', error);
    },
  });

  const handleNodeSelect = useCallback((node: FolderNode) => {
    setSelectedNode(node);
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, updates: Partial<FolderNode>) => {
    const updateNode = (node: FolderNode): FolderNode => {
      if (node.id === nodeId) {
        return { ...node, ...updates };
      }
      return {
        ...node,
        children: node.children.map(updateNode),
      };
    };
    setRootNode((prev) => updateNode(prev));
  }, []);

  const handleNodeAdd = useCallback((parentId: string, newNode: FolderNode) => {
    const addNode = (node: FolderNode): FolderNode => {
      if (node.id === parentId) {
        return {
          ...node,
          children: [...node.children, newNode],
        };
      }
      return {
        ...node,
        children: node.children.map(addNode),
      };
    };
    setRootNode((prev) => addNode(prev));
  }, []);

  const handleNodeDelete = useCallback((nodeId: string) => {
    const deleteNode = (node: FolderNode): FolderNode => {
      return {
        ...node,
        children: node.children
          .filter((child) => child.id !== nodeId)
          .map(deleteNode),
      };
    };
    setRootNode((prev) => deleteNode(prev));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  }, [selectedNode]);

  const handleNodeMove = useCallback((nodeId: string, newParentId: string, index: number) => {
    // First, find and remove the node from its current location
    let movedNode: FolderNode | null = null;
    
    const removeNode = (node: FolderNode): FolderNode => {
      const childIndex = node.children.findIndex((child) => child.id === nodeId);
      if (childIndex !== -1) {
        movedNode = node.children[childIndex];
        return {
          ...node,
          children: node.children.filter((_, i) => i !== childIndex),
        };
      }
      return {
        ...node,
        children: node.children.map(removeNode),
      };
    };

    // Then add it to the new location
    const addNode = (node: FolderNode): FolderNode => {
      if (node.id === newParentId && movedNode) {
        const newChildren = [...node.children];
        newChildren.splice(index, 0, movedNode);
        return {
          ...node,
          children: newChildren,
        };
      }
      return {
        ...node,
        children: node.children.map(addNode),
      };
    };

    setRootNode((prev) => {
      const afterRemoval = removeNode(prev);
      return addNode(afterRemoval);
    });
  }, []);

  const handlePropertiesSave = useCallback((nodeId: string, properties: FolderProperties) => {
    handleNodeUpdate(nodeId, { properties });
  }, [handleNodeUpdate]);

  const handlePropertiesCancel = useCallback(() => {
    // Properties panel handles its own state
  }, []);

  const handleValidate = useCallback(() => {
    const validation = templateValidation.validateTemplate(template, rootNode);
    if (validation.valid) {
      setValidationErrors([]);
    } else {
      setValidationErrors(validation.errors.map((e) => `${e.path}: ${e.message}`));
    }
    return validation.valid;
  }, [template, rootNode]);

  const handleSave = useCallback(() => {
    if (handleValidate()) {
      saveMutation.mutate();
    }
  }, [handleValidate, saveMutation]);

  const handleCancel = useCallback(() => {
    navigate('/templates');
  }, [navigate]);

  if (isLoading) {
    return (
      <div className={styles.spinner}>
        <Spinner size="large" label="Loading template..." />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <Text size={600} weight="semibold">
            {isEditing ? 'Edit Template' : isCloning ? 'Clone Template' : 'Create Template'}
          </Text>
          {template.name && (
            <Text size={300} className="text-neutral-foreground-3">
              {template.name}
            </Text>
          )}
        </div>
        <div className={styles.headerActions}>
          <Button
            appearance="secondary"
            icon={<Dismiss24Regular />}
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            appearance="primary"
            icon={<Save24Regular />}
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.sidebar}>
          <div className={styles.metadataField}>
            <Label htmlFor="templateName" required>
              Template Name
            </Label>
            <Input
              id="templateName"
              value={template.name || ''}
              onChange={(e, data) => setTemplate({ ...template, name: data.value })}
              placeholder="Enter template name..."
            />
          </div>

          <div className={styles.metadataField}>
            <Label htmlFor="templateDescription">Description</Label>
            <Textarea
              id="templateDescription"
              value={template.description || ''}
              onChange={(e, data) => setTemplate({ ...template, description: data.value })}
              placeholder="Enter template description..."
              resize="vertical"
            />
          </div>

          {validationErrors.length > 0 && (
            <MessageBar intent="error" className={styles.validationErrors}>
              <MessageBarBody>
                <MessageBarTitle>Validation Errors</MessageBarTitle>
                <ul>
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </MessageBarBody>
            </MessageBar>
          )}

          {saveMutation.isError && (
            <MessageBar intent="error" className={styles.validationErrors}>
              <MessageBarBody>
                <MessageBarTitle>Save Failed</MessageBarTitle>
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : 'An unexpected error occurred'}
              </MessageBarBody>
            </MessageBar>
          )}
        </div>

        <div className={styles.mainArea}>
          <div className={styles.treeContainer}>
            <FolderTree
              rootNode={rootNode}
              onNodeSelect={handleNodeSelect}
              onNodeUpdate={handleNodeUpdate}
              onNodeAdd={handleNodeAdd}
              onNodeDelete={handleNodeDelete}
              onNodeMove={handleNodeMove}
              onEditProperties={handleNodeSelect}
            />
          </div>

          <div className={styles.propertiesContainer}>
            <FolderPropertiesPanel
              selectedNode={selectedNode}
              onSave={handlePropertiesSave}
              onCancel={handlePropertiesCancel}
            />
          </div>
        </div>

        <div className={styles.previewContainer}>
          <TemplatePreview rootNode={rootNode} title="Live Preview" />
        </div>
      </div>
    </div>
  );
};