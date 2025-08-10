import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  makeStyles,
  tokens,
  shorthands,
  Text,
  Button,
} from '@fluentui/react-components';
import { Add24Regular } from '@fluentui/react-icons';
import { FolderNodeComponent } from './FolderNode';
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke1),
  },
  tree: {
    flexGrow: 1,
    overflowY: 'auto',
    ...shorthands.padding(tokens.spacingVerticalS),
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  dragOverlay: {
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalS),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke1),
    boxShadow: tokens.shadow16,
  },
});

interface FolderTreeProps {
  rootNode: FolderNode;
  onNodeSelect: (node: FolderNode) => void;
  onNodeUpdate: (nodeId: string, updates: Partial<FolderNode>) => void;
  onNodeAdd: (parentId: string, newNode: FolderNode) => void;
  onNodeDelete: (nodeId: string) => void;
  onNodeMove: (nodeId: string, newParentId: string, index: number) => void;
  onEditProperties: (node: FolderNode) => void;
  maxDepth?: number;
  systemFolders?: string[];
}

export const FolderTree: React.FC<FolderTreeProps> = ({
  rootNode,
  onNodeSelect,
  onNodeUpdate,
  onNodeAdd,
  onNodeDelete,
  onNodeMove,
  onEditProperties,
  maxDepth = 6,
  systemFolders = [],
}) => {
  const styles = useStyles();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([rootNode.id]));
  const [selectedNode, setSelectedNode] = useState<FolderNode | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleSelectNode = useCallback((node: FolderNode) => {
    setSelectedNode(node);
    onNodeSelect(node);
  }, [onNodeSelect]);

  const generateNewNode = (parentId: string): FolderNode => {
    const timestamp = Date.now();
    return {
      id: `folder-${timestamp}`,
      name: 'New Folder',
      path: '',
      type: 'folder',
      children: [],
      properties: {
        required: false,
        locked: false,
      },
      permissions: {
        inherit: true,
        breakInheritance: false,
        groups: [],
      },
      metadata: {},
    };
  };

  const handleAddChild = useCallback((parentId: string) => {
    const newNode = generateNewNode(parentId);
    onNodeAdd(parentId, newNode);
    setExpandedNodes((prev) => new Set([...prev, parentId]));
  }, [onNodeAdd]);

  const handleRenameNode = useCallback((nodeId: string, newName: string) => {
    onNodeUpdate(nodeId, { name: newName });
  }, [onNodeUpdate]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    onNodeDelete(nodeId);
  }, [onNodeDelete]);

  const findNode = (node: FolderNode, id: string): FolderNode | null => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
    return null;
  };

  const getNodeDepth = (node: FolderNode, id: string, depth = 0): number => {
    if (node.id === id) return depth;
    for (const child of node.children) {
      const childDepth = getNodeDepth(child, id, depth + 1);
      if (childDepth > -1) return childDepth;
    }
    return -1;
  };

  const getSubtreeDepth = (node: FolderNode): number => {
    if (!node.children || node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(getSubtreeDepth));
  };

  const isDescendant = (node: FolderNode, ancestorId: string): boolean => {
    if (node.id === ancestorId) return false;
    const ancestor = findNode(rootNode, ancestorId);
    if (!ancestor) return false;
    return findNode(ancestor, node.id) !== null;
  };

  const canDrop = (draggedId: string, targetId: string): boolean => {
    if (draggedId === targetId) return false;
    
    const draggedNode = findNode(rootNode, draggedId);
    const targetNode = findNode(rootNode, targetId);
    
    if (!draggedNode || !targetNode) return false;
    
    if (systemFolders.includes(draggedNode.id)) return false;
    
    if (targetNode.properties.locked) return false;
    
    if (isDescendant(targetNode, draggedId)) return false;
    
    const targetDepth = getNodeDepth(rootNode, targetId);
    const draggedSubtreeDepth = getSubtreeDepth(draggedNode);
    if (targetDepth + draggedSubtreeDepth + 1 > maxDepth) return false;
    
    return true;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const draggedId = active.id as string;
    const targetId = over.id as string;

    if (!canDrop(draggedId, targetId)) return;

    onNodeMove(draggedId, targetId, 0);
  };

  const getAllNodeIds = (node: FolderNode): string[] => {
    const ids = [node.id];
    node.children.forEach((child) => {
      ids.push(...getAllNodeIds(child));
    });
    return ids;
  };

  const sortableItems = useMemo(() => getAllNodeIds(rootNode), [rootNode]);

  const activeNode = activeId ? findNode(rootNode, activeId) : null;

  const renderEmptyState = () => (
    <div className={styles.emptyState}>
      <Text size={400}>No folders yet</Text>
      <Button
        appearance="primary"
        icon={<Add24Regular />}
        onClick={() => handleAddChild(rootNode.id)}
      >
        Add First Folder
      </Button>
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <Text weight="semibold">Folder Structure</Text>
          <Button
            appearance="subtle"
            icon={<Add24Regular />}
            onClick={() => handleAddChild(rootNode.id)}
            title="Add root folder"
          />
        </div>

        <div className={styles.tree}>
          {rootNode.children.length === 0 ? (
            renderEmptyState()
          ) : (
            <SortableContext
              items={sortableItems}
              strategy={verticalListSortingStrategy}
            >
              {rootNode.children.map((child) => (
                <FolderNodeComponent
                  key={child.id}
                  node={child}
                  depth={0}
                  isSelected={selectedNode?.id === child.id}
                  isExpanded={expandedNodes.has(child.id)}
                  onToggleExpand={toggleExpand}
                  onSelectNode={handleSelectNode}
                  onAddChild={handleAddChild}
                  onDeleteNode={handleDeleteNode}
                  onRenameNode={handleRenameNode}
                  onEditProperties={onEditProperties}
                  isDragDisabled={false}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeNode && (
          <div className={styles.dragOverlay}>
            <Text>{activeNode.name}</Text>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};