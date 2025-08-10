import React, { useState } from 'react';
import {
  makeStyles,
  tokens,
  shorthands,
  Text,
  Button,
  Input,
  mergeClasses,
} from '@fluentui/react-components';
import {
  ChevronRight16Regular,
  ChevronDown16Regular,
  Folder24Regular,
  FolderOpen24Regular,
  LockClosed24Regular,
  Add16Regular,
  Delete16Regular,
  Edit16Regular,
  MoreVertical16Regular,
} from '@fluentui/react-icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FolderNode as FolderNodeType } from '@/types/templates';

const useStyles = makeStyles({
  node: {
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
  },
  nodeHeader: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalS),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  nodeHeaderSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    '&:hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
    },
  },
  nodeHeaderDragging: {
    opacity: 0.5,
  },
  expandIcon: {
    marginRight: tokens.spacingHorizontalXS,
    transition: 'transform 0.2s',
  },
  folderIcon: {
    marginRight: tokens.spacingHorizontalS,
    color: tokens.colorBrandForeground1,
  },
  nodeName: {
    flexGrow: 1,
    marginRight: tokens.spacingHorizontalS,
  },
  nodeActions: {
    display: 'flex',
    ...shorthands.gap(tokens.spacingHorizontalXS),
    opacity: 0,
    transition: 'opacity 0.2s',
  },
  nodeActionsVisible: {
    opacity: 1,
  },
  lockIcon: {
    color: tokens.colorPaletteDarkOrangeForeground1,
    marginRight: tokens.spacingHorizontalXS,
  },
  requiredBadge: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorPaletteRedForeground1,
    marginLeft: tokens.spacingHorizontalXS,
  },
  children: {
    marginLeft: tokens.spacingHorizontalL,
  },
  editInput: {
    flexGrow: 1,
    marginRight: tokens.spacingHorizontalS,
  },
  dropIndicator: {
    height: '2px',
    backgroundColor: tokens.colorBrandBackground,
    marginLeft: tokens.spacingHorizontalL,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },
});

interface FolderNodeProps {
  node: FolderNodeType;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleExpand: (nodeId: string) => void;
  onSelectNode: (node: FolderNodeType) => void;
  onAddChild: (parentId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onEditProperties: (node: FolderNodeType) => void;
  isDragDisabled?: boolean;
}

export const FolderNodeComponent: React.FC<FolderNodeProps> = ({
  node,
  depth,
  isSelected,
  isExpanded,
  onToggleExpand,
  onSelectNode,
  onAddChild,
  onDeleteNode,
  onRenameNode,
  onEditProperties,
  isDragDisabled = false,
}) => {
  const styles = useStyles();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [isHovered, setIsHovered] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    disabled: isDragDisabled || node.properties.locked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasChildren = node.children && node.children.length > 0;

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggleExpand(node.id);
    }
  };

  const handleSelect = () => {
    if (!isEditing) {
      onSelectNode(node);
    }
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditName(node.name);
  };

  const handleSaveEdit = () => {
    if (editName.trim() && editName !== node.name) {
      onRenameNode(node.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(node.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddChild(node.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete folder "${node.name}" and all its contents?`)) {
      onDeleteNode(node.id);
    }
  };

  const handleEditProperties = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditProperties(node);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={styles.node}
      {...attributes}
    >
      <div
        className={mergeClasses(
          styles.nodeHeader,
          isSelected && styles.nodeHeaderSelected,
          isDragging && styles.nodeHeaderDragging
        )}
        onClick={handleSelect}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...listeners}
      >
        <Button
          appearance="subtle"
          size="small"
          icon={
            hasChildren ? (
              isExpanded ? (
                <ChevronDown16Regular className={styles.expandIcon} />
              ) : (
                <ChevronRight16Regular className={styles.expandIcon} />
              )
            ) : (
              <div style={{ width: '16px' }} />
            )
          }
          onClick={handleToggleExpand}
        />
        
        {isExpanded && hasChildren ? (
          <FolderOpen24Regular className={styles.folderIcon} />
        ) : (
          <Folder24Regular className={styles.folderIcon} />
        )}

        {node.properties.locked && (
          <LockClosed24Regular className={styles.lockIcon} />
        )}

        {isEditing ? (
          <Input
            value={editName}
            onChange={(e, data) => setEditName(data.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyDown}
            className={styles.editInput}
            size="small"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Text className={styles.nodeName} size={300}>
            {node.name}
            {node.properties.required && (
              <span className={styles.requiredBadge}>*</span>
            )}
          </Text>
        )}

        <div
          className={mergeClasses(
            styles.nodeActions,
            isHovered && styles.nodeActionsVisible
          )}
        >
          <Button
            appearance="subtle"
            size="small"
            icon={<Add16Regular />}
            onClick={handleAddChild}
            title="Add subfolder"
          />
          <Button
            appearance="subtle"
            size="small"
            icon={<Edit16Regular />}
            onClick={handleStartEdit}
            title="Rename"
          />
          <Button
            appearance="subtle"
            size="small"
            icon={<MoreVertical16Regular />}
            onClick={handleEditProperties}
            title="Properties"
          />
          {!node.properties.required && (
            <Button
              appearance="subtle"
              size="small"
              icon={<Delete16Regular />}
              onClick={handleDelete}
              title="Delete"
              disabled={node.properties.locked}
            />
          )}
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className={styles.children}>
          {node.children.map((child) => (
            <FolderNodeComponent
              key={child.id}
              node={child}
              depth={depth + 1}
              isSelected={false}
              isExpanded={false}
              onToggleExpand={onToggleExpand}
              onSelectNode={onSelectNode}
              onAddChild={onAddChild}
              onDeleteNode={onDeleteNode}
              onRenameNode={onRenameNode}
              onEditProperties={onEditProperties}
              isDragDisabled={isDragDisabled}
            />
          ))}
        </div>
      )}
    </div>
  );
};