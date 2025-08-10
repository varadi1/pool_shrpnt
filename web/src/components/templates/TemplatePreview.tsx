import React from 'react';
import {
  makeStyles,
  tokens,
  shorthands,
  Text,
  Tree,
  TreeItem,
  TreeItemLayout,
} from '@fluentui/react-components';
import {
  Folder24Regular,
  LockClosed24Regular,
} from '@fluentui/react-icons';
import type { FolderNode } from '@/types/templates';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke1),
  },
  preview: {
    flexGrow: 1,
    overflowY: 'auto',
    ...shorthands.padding(tokens.spacingVerticalM),
  },
  folderIcon: {
    marginRight: tokens.spacingHorizontalS,
    color: tokens.colorBrandForeground1,
  },
  lockIcon: {
    marginLeft: tokens.spacingHorizontalXS,
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  requiredBadge: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorPaletteRedForeground1,
    marginLeft: tokens.spacingHorizontalXS,
  },
  metadata: {
    marginTop: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalS),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },
  metadataItem: {
    display: 'flex',
    ...shorthands.gap(tokens.spacingHorizontalS),
    marginBottom: tokens.spacingVerticalXS,
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
  },
});

interface TemplatePreviewProps {
  rootNode: FolderNode | null;
  title?: string;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  rootNode,
  title = 'Preview',
}) => {
  const styles = useStyles();

  const renderTreeItem = (node: FolderNode, level: number = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;

    return (
      <TreeItem key={node.id} value={node.id}>
        <TreeItemLayout>
          <Folder24Regular className={styles.folderIcon} />
          <Text size={300}>
            {node.name}
            {node.properties.required && (
              <span className={styles.requiredBadge}>*</span>
            )}
            {node.properties.locked && (
              <LockClosed24Regular className={styles.lockIcon} />
            )}
          </Text>
        </TreeItemLayout>
        {hasChildren && (
          <Tree>
            {node.children.map((child) => renderTreeItem(child, level + 1))}
          </Tree>
        )}
      </TreeItem>
    );
  };

  const countFolders = (node: FolderNode): number => {
    let count = 1;
    if (node.children) {
      node.children.forEach((child) => {
        count += countFolders(child);
      });
    }
    return count;
  };

  const getMaxDepth = (node: FolderNode, currentDepth: number = 0): number => {
    if (!node.children || node.children.length === 0) {
      return currentDepth;
    }
    return Math.max(
      ...node.children.map((child) => getMaxDepth(child, currentDepth + 1))
    );
  };

  const countLockedFolders = (node: FolderNode): number => {
    let count = node.properties.locked ? 1 : 0;
    if (node.children) {
      node.children.forEach((child) => {
        count += countLockedFolders(child);
      });
    }
    return count;
  };

  const countRequiredFolders = (node: FolderNode): number => {
    let count = node.properties.required ? 1 : 0;
    if (node.children) {
      node.children.forEach((child) => {
        count += countRequiredFolders(child);
      });
    }
    return count;
  };

  if (!rootNode) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Text weight="semibold">{title}</Text>
        </div>
        <div className={styles.emptyState}>
          <Text size={300}>No template structure to preview</Text>
        </div>
      </div>
    );
  }

  const totalFolders = countFolders(rootNode) - 1; // Exclude root
  const maxDepth = getMaxDepth(rootNode);
  const lockedFolders = countLockedFolders(rootNode);
  const requiredFolders = countRequiredFolders(rootNode);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text weight="semibold">{title}</Text>
      </div>
      <div className={styles.preview}>
        <Tree aria-label="Template folder structure">
          {rootNode.children.map((child) => renderTreeItem(child))}
        </Tree>
        
        <div className={styles.metadata}>
          <Text size={300} weight="semibold" block>
            Template Statistics
          </Text>
          <div className={styles.metadataItem}>
            <Text size={200}>Total Folders:</Text>
            <Text size={200} weight="medium">{totalFolders}</Text>
          </div>
          <div className={styles.metadataItem}>
            <Text size={200}>Max Depth:</Text>
            <Text size={200} weight="medium">{maxDepth} levels</Text>
          </div>
          <div className={styles.metadataItem}>
            <Text size={200}>Required Folders:</Text>
            <Text size={200} weight="medium">{requiredFolders}</Text>
          </div>
          <div className={styles.metadataItem}>
            <Text size={200}>Locked Folders:</Text>
            <Text size={200} weight="medium">{lockedFolders}</Text>
          </div>
        </div>
      </div>
    </div>
  );
};