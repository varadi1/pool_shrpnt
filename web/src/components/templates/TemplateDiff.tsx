import React, { useState, useMemo } from 'react';
import {
  Text,
  Button,
  ToggleButton,
  makeStyles,
  tokens,
  shorthands,
  Card,
  CardHeader,
  Badge,
  Divider,
  Tooltip,
  Tree,
  TreeItem,
  TreeItemLayout,
  TreeItemValue,
  CounterBadge,
  Menu,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuPopover,
} from '@fluentui/react-components';
import {
  ArrowSync24Regular,
  Document24Regular,
  Folder24Regular,
  FolderOpen24Regular,
  Add24Regular,
  Delete24Regular,
  Edit24Regular,
  ArrowDownload24Regular,
  Eye24Regular,
  EyeOff24Regular,
  ChevronRight24Regular,
  Shield24Regular,
  Info24Regular,
} from '@fluentui/react-icons';
import type { DiffResult, DiffNode, PropertyChange, TemplateVersion } from '@/types/templates';
import { templateDiffService } from '@/services/templateDiff';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    height: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  summary: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  summaryItem: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    alignItems: 'center',
  },
  controls: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  diffContainer: {
    flex: 1,
    ...shorthands.overflow('auto'),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sideBySide: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    height: '100%',
  },
  unified: {
    ...shorthands.padding(tokens.spacingVerticalM),
  },
  sidePanel: {
    ...shorthands.padding(tokens.spacingVerticalM),
    ...shorthands.overflow('auto'),
  },
  sidePanelLeft: {
    ...shorthands.borderRight('1px', 'solid', tokens.colorNeutralStroke1),
  },
  sidePanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalS,
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke1),
  },
  nodeAdded: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    ...shorthands.borderLeft('3px', 'solid', tokens.colorPaletteGreenBorder1),
  },
  nodeRemoved: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    ...shorthands.borderLeft('3px', 'solid', tokens.colorPaletteRedBorder1),
  },
  nodeModified: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    ...shorthands.borderLeft('3px', 'solid', tokens.colorPaletteYellowBorder1),
  },
  nodeUnchanged: {
    opacity: 0.7,
  },
  propertyChanges: {
    marginTop: tokens.spacingVerticalS,
    marginLeft: tokens.spacingHorizontalL,
    fontSize: tokens.fontSizeBase200,
  },
  propertyChange: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalS),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },
  propertyOld: {
    color: tokens.colorPaletteRedForeground1,
    textDecoration: 'line-through',
  },
  propertyNew: {
    color: tokens.colorPaletteGreenForeground1,
  },
  treeItem: {
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalS),
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    marginBottom: '2px',
  },
  diffIcon: {
    marginRight: tokens.spacingHorizontalXS,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
});

interface TemplateDiffProps {
  oldVersion: TemplateVersion;
  newVersion: TemplateVersion;
  onExport?: () => void;
}

export const TemplateDiff: React.FC<TemplateDiffProps> = ({
  oldVersion,
  newVersion,
  onExport,
}) => {
  const styles = useStyles();
  const [viewMode, setViewMode] = useState<'sideBySide' | 'unified'>('sideBySide');
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const diff = useMemo(() => {
    if (!oldVersion?.structure || !newVersion?.structure) return null;
    return templateDiffService.calculateDiff(oldVersion.structure, newVersion.structure);
  }, [oldVersion, newVersion]);

  const handleNodeToggle = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleExport = () => {
    if (!diff) return;
    
    const report = templateDiffService.exportDiffReport(diff);
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-diff-${oldVersion.version}-to-${newVersion.version}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    onExport?.();
  };

  const getNodeIcon = (node: DiffNode) => {
    switch (node.type) {
      case 'added':
        return <Add24Regular className={styles.diffIcon} color={tokens.colorPaletteGreenForeground1} />;
      case 'removed':
        return <Delete24Regular className={styles.diffIcon} color={tokens.colorPaletteRedForeground1} />;
      case 'modified':
        return <Edit24Regular className={styles.diffIcon} color={tokens.colorPaletteYellowForeground1} />;
      default:
        return expandedNodes.has(node.path) ? <FolderOpen24Regular /> : <Folder24Regular />;
    }
  };

  const getNodeStyle = (node: DiffNode) => {
    switch (node.type) {
      case 'added':
        return styles.nodeAdded;
      case 'removed':
        return styles.nodeRemoved;
      case 'modified':
        return styles.nodeModified;
      default:
        return styles.nodeUnchanged;
    }
  };

  const renderPropertyChanges = (changes: PropertyChange[]) => {
    return (
      <div className={styles.propertyChanges}>
        {changes.map((change, index) => (
          <div key={index} className={styles.propertyChange}>
            <Text size={200} weight="semibold">
              {change.field}:
            </Text>
            {change.type === 'added' ? (
              <Text size={200} className={styles.propertyNew}>
                + {JSON.stringify(change.newValue)}
              </Text>
            ) : change.type === 'removed' ? (
              <Text size={200} className={styles.propertyOld}>
                - {JSON.stringify(change.oldValue)}
              </Text>
            ) : (
              <>
                <Text size={200} className={styles.propertyOld}>
                  - {JSON.stringify(change.oldValue)}
                </Text>
                <Text size={200} className={styles.propertyNew}>
                  + {JSON.stringify(change.newValue)}
                </Text>
              </>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderDiffNode = (node: DiffNode, depth = 0): React.ReactNode => {
    if (!showUnchanged && node.type === 'unchanged') {
      return null;
    }

    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.path);
    const nodeId = `node-${node.path}`;

    return (
      <TreeItem
        key={nodeId}
        itemType={hasChildren ? 'branch' : 'leaf'}
        value={nodeId}
        open={isExpanded}
        onOpenChange={() => handleNodeToggle(node.path)}
      >
        <TreeItemLayout
          className={styles.treeItem}
          style={{ 
            ...((node.type === 'added' && { backgroundColor: tokens.colorPaletteGreenBackground1, borderLeft: `3px solid ${tokens.colorPaletteGreenBorder1}` }) ||
               (node.type === 'removed' && { backgroundColor: tokens.colorPaletteRedBackground1, borderLeft: `3px solid ${tokens.colorPaletteRedBorder1}` }) ||
               (node.type === 'modified' && { backgroundColor: tokens.colorPaletteYellowBackground1, borderLeft: `3px solid ${tokens.colorPaletteYellowBorder1}` }) ||
               (node.type === 'unchanged' && { opacity: 0.7 }))
          }}
          iconBefore={getNodeIcon(node)}
        >
          <Text size={300}>
            {node.name}
            {node.type !== 'unchanged' && (
              <Badge
                appearance="tint"
                color={
                  node.type === 'added' ? 'success' :
                  node.type === 'removed' ? 'danger' :
                  'warning'
                }
                size="small"
                style={{ marginLeft: '8px' }}
              >
                {node.type}
              </Badge>
            )}
          </Text>
        </TreeItemLayout>
        {isExpanded && (
          <>
            {node.propertyChanges && node.propertyChanges.length > 0 && 
              renderPropertyChanges(node.propertyChanges)}
            {hasChildren && (
              <Tree>
                {node.children?.map(child => renderDiffNode(child, depth + 1))}
              </Tree>
            )}
          </>
        )}
      </TreeItem>
    );
  };

  const renderSideBySideView = () => {
    if (!diff) return null;

    return (
      <div className={styles.sideBySide}>
        <div className={`${styles.sidePanel} ${styles.sidePanelLeft}`}>
          <div className={styles.sidePanelHeader}>
            <Text weight="semibold">Version {oldVersion.version}</Text>
            <Badge appearance="tint" color="neutral">Old</Badge>
          </div>
          <Tree>
            {oldVersion.structure && renderDiffNode({
              path: oldVersion.structure.path,
              name: oldVersion.structure.name,
              type: 'unchanged',
              oldValue: oldVersion.structure,
              children: diff.changes,
            })}
          </Tree>
        </div>
        <div className={styles.sidePanel}>
          <div className={styles.sidePanelHeader}>
            <Text weight="semibold">Version {newVersion.version}</Text>
            <Badge appearance="tint" color="brand">New</Badge>
          </div>
          <Tree>
            {newVersion.structure && renderDiffNode({
              path: newVersion.structure.path,
              name: newVersion.structure.name,
              type: 'unchanged',
              newValue: newVersion.structure,
              children: diff.changes,
            })}
          </Tree>
        </div>
      </div>
    );
  };

  const renderUnifiedView = () => {
    if (!diff) return null;

    return (
      <div className={styles.unified}>
        <Tree>
          {diff.changes.map(node => renderDiffNode(node))}
        </Tree>
      </div>
    );
  };

  if (!diff) {
    return (
      <div className={styles.emptyState}>
        <ArrowSync24Regular style={{ fontSize: '48px' }} />
        <Text size={400}>No differences to display</Text>
        <Text size={200}>Select two different versions to compare</Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.summary}>
          <Text weight="semibold">
            Comparing {oldVersion.version} → {newVersion.version}
          </Text>
          <Divider vertical />
          <div className={styles.summaryItem}>
            <Add24Regular fontSize={16} color={tokens.colorPaletteGreenForeground1} />
            <Text size={200}>{diff.summary.added} added</Text>
          </div>
          <div className={styles.summaryItem}>
            <Delete24Regular fontSize={16} color={tokens.colorPaletteRedForeground1} />
            <Text size={200}>{diff.summary.removed} removed</Text>
          </div>
          <div className={styles.summaryItem}>
            <Edit24Regular fontSize={16} color={tokens.colorPaletteYellowForeground1} />
            <Text size={200}>{diff.summary.modified} modified</Text>
          </div>
          <div className={styles.summaryItem}>
            <Document24Regular fontSize={16} />
            <Text size={200}>{diff.summary.unchanged} unchanged</Text>
          </div>
        </div>
        <div className={styles.controls}>
          <ToggleButton
            checked={showUnchanged}
            onClick={() => setShowUnchanged(!showUnchanged)}
            icon={showUnchanged ? <Eye24Regular /> : <EyeOff24Regular />}
            size="small"
          >
            {showUnchanged ? 'Hide' : 'Show'} Unchanged
          </ToggleButton>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance="subtle"
                icon={viewMode === 'sideBySide' ? <ChevronRight24Regular /> : <Document24Regular />}
                size="small"
              >
                {viewMode === 'sideBySide' ? 'Side by Side' : 'Unified'}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem
                  onClick={() => setViewMode('sideBySide')}
                  icon={<ChevronRight24Regular />}
                >
                  Side by Side View
                </MenuItem>
                <MenuItem
                  onClick={() => setViewMode('unified')}
                  icon={<Document24Regular />}
                >
                  Unified View
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Button
            appearance="subtle"
            icon={<ArrowDownload24Regular />}
            onClick={handleExport}
            size="small"
          >
            Export
          </Button>
        </div>
      </div>
      
      <div className={styles.diffContainer}>
        {viewMode === 'sideBySide' ? renderSideBySideView() : renderUnifiedView()}
      </div>
    </div>
  );
};