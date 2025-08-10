import type { FolderNode, DiffResult, DiffNode, PropertyChange } from '@/types/templates';

export class TemplateDiffService {
  /**
   * Compare two template versions
   * Algorithm:
   * 1. Build path maps for both versions
   * 2. Find added paths (in new, not in old)
   * 3. Find removed paths (in old, not in new)
   * 4. Find common paths and compare properties
   * 5. Build hierarchical diff tree
   */
  calculateDiff(oldVersion: FolderNode, newVersion: FolderNode): DiffResult {
    const oldPaths = this.buildPathMap(oldVersion);
    const newPaths = this.buildPathMap(newVersion);
    
    const added = this.findAddedPaths(oldPaths, newPaths);
    const removed = this.findRemovedPaths(oldPaths, newPaths);
    const modified = this.findModifiedPaths(oldPaths, newPaths);
    
    const changes = this.buildDiffTree(oldVersion, newVersion, added, removed, modified);
    
    return {
      summary: {
        added: added.size,
        removed: removed.size,
        modified: modified.size,
        unchanged: this.countUnchanged(oldPaths, newPaths, modified),
      },
      changes,
    };
  }
  
  private buildPathMap(node: FolderNode, parentPath = ''): Map<string, FolderNode> {
    const map = new Map<string, FolderNode>();
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    
    map.set(currentPath, node);
    
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const childMap = this.buildPathMap(child, currentPath);
        childMap.forEach((value, key) => map.set(key, value));
      }
    }
    
    return map;
  }
  
  private findAddedPaths(
    oldPaths: Map<string, FolderNode>,
    newPaths: Map<string, FolderNode>
  ): Set<string> {
    const added = new Set<string>();
    newPaths.forEach((_, path) => {
      if (!oldPaths.has(path)) {
        added.add(path);
      }
    });
    return added;
  }
  
  private findRemovedPaths(
    oldPaths: Map<string, FolderNode>,
    newPaths: Map<string, FolderNode>
  ): Set<string> {
    const removed = new Set<string>();
    oldPaths.forEach((_, path) => {
      if (!newPaths.has(path)) {
        removed.add(path);
      }
    });
    return removed;
  }
  
  private findModifiedPaths(
    oldPaths: Map<string, FolderNode>,
    newPaths: Map<string, FolderNode>
  ): Set<string> {
    const modified = new Set<string>();
    oldPaths.forEach((oldNode, path) => {
      const newNode = newPaths.get(path);
      if (newNode && this.hasChanges(oldNode, newNode)) {
        modified.add(path);
      }
    });
    return modified;
  }
  
  private hasChanges(oldNode: FolderNode, newNode: FolderNode): boolean {
    // Check properties
    const propChanges = this.compareProperties(oldNode.properties, newNode.properties);
    if (propChanges.length > 0) return true;
    
    // Check permissions
    const permChanges = this.comparePermissions(oldNode.permissions, newNode.permissions);
    if (permChanges.length > 0) return true;
    
    // Check metadata
    const metaChanges = this.compareMetadata(oldNode.metadata, newNode.metadata);
    if (metaChanges.length > 0) return true;
    
    return false;
  }
  
  private compareProperties(
    oldProps: FolderNode['properties'],
    newProps: FolderNode['properties']
  ): PropertyChange[] {
    const changes: PropertyChange[] = [];
    const allKeys = new Set([
      ...Object.keys(oldProps || {}),
      ...Object.keys(newProps || {}),
    ]);
    
    for (const key of allKeys) {
      const oldValue = oldProps?.[key as keyof typeof oldProps];
      const newValue = newProps?.[key as keyof typeof newProps];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: key,
          oldValue,
          newValue,
          type: !oldValue ? 'added' : !newValue ? 'removed' : 'modified',
        });
      }
    }
    
    return changes;
  }
  
  private comparePermissions(
    oldPerms: FolderNode['permissions'],
    newPerms: FolderNode['permissions']
  ): PropertyChange[] {
    const changes: PropertyChange[] = [];
    
    if (oldPerms?.inherit !== newPerms?.inherit) {
      changes.push({
        field: 'inherit',
        oldValue: oldPerms?.inherit,
        newValue: newPerms?.inherit,
        type: 'modified',
      });
    }
    
    if (oldPerms?.breakInheritance !== newPerms?.breakInheritance) {
      changes.push({
        field: 'breakInheritance',
        oldValue: oldPerms?.breakInheritance,
        newValue: newPerms?.breakInheritance,
        type: 'modified',
      });
    }
    
    // Compare groups
    const oldGroups = oldPerms?.groups || [];
    const newGroups = newPerms?.groups || [];
    
    if (JSON.stringify(oldGroups) !== JSON.stringify(newGroups)) {
      changes.push({
        field: 'groups',
        oldValue: oldGroups,
        newValue: newGroups,
        type: 'modified',
      });
    }
    
    return changes;
  }
  
  private compareMetadata(
    oldMeta: Record<string, any>,
    newMeta: Record<string, any>
  ): PropertyChange[] {
    const changes: PropertyChange[] = [];
    const allKeys = new Set([
      ...Object.keys(oldMeta || {}),
      ...Object.keys(newMeta || {}),
    ]);
    
    for (const key of allKeys) {
      const oldValue = oldMeta?.[key];
      const newValue = newMeta?.[key];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: `metadata.${key}`,
          oldValue,
          newValue,
          type: !oldValue ? 'added' : !newValue ? 'removed' : 'modified',
        });
      }
    }
    
    return changes;
  }
  
  private buildDiffTree(
    oldRoot: FolderNode,
    newRoot: FolderNode,
    added: Set<string>,
    removed: Set<string>,
    modified: Set<string>
  ): DiffNode[] {
    const buildNode = (
      oldNode: FolderNode | undefined,
      newNode: FolderNode | undefined,
      path: string
    ): DiffNode => {
      let type: DiffNode['type'] = 'unchanged';
      let propertyChanges: PropertyChange[] = [];
      
      if (added.has(path)) {
        type = 'added';
      } else if (removed.has(path)) {
        type = 'removed';
      } else if (modified.has(path) && oldNode && newNode) {
        type = 'modified';
        propertyChanges = [
          ...this.compareProperties(oldNode.properties, newNode.properties),
          ...this.comparePermissions(oldNode.permissions, newNode.permissions),
          ...this.compareMetadata(oldNode.metadata, newNode.metadata),
        ];
      }
      
      const node: DiffNode = {
        path,
        name: newNode?.name || oldNode?.name || '',
        type,
        oldValue: oldNode,
        newValue: newNode,
        propertyChanges: propertyChanges.length > 0 ? propertyChanges : undefined,
        children: [],
      };
      
      // Build children
      const oldChildren = oldNode?.children || [];
      const newChildren = newNode?.children || [];
      const childNames = new Set([
        ...oldChildren.map(c => c.name),
        ...newChildren.map(c => c.name),
      ]);
      
      for (const childName of childNames) {
        const oldChild = oldChildren.find(c => c.name === childName);
        const newChild = newChildren.find(c => c.name === childName);
        const childPath = `${path}/${childName}`;
        
        if (oldChild || newChild) {
          node.children?.push(buildNode(oldChild, newChild, childPath));
        }
      }
      
      return node;
    };
    
    return [buildNode(oldRoot, newRoot, oldRoot?.name || newRoot?.name || 'root')];
  }
  
  private countUnchanged(
    oldPaths: Map<string, FolderNode>,
    newPaths: Map<string, FolderNode>,
    modified: Set<string>
  ): number {
    let unchanged = 0;
    oldPaths.forEach((oldNode, path) => {
      const newNode = newPaths.get(path);
      if (newNode && !modified.has(path)) {
        unchanged++;
      }
    });
    return unchanged;
  }
  
  /**
   * Export diff as a readable report
   */
  exportDiffReport(diff: DiffResult): string {
    const lines: string[] = [];
    
    lines.push('Template Version Comparison Report');
    lines.push('=' .repeat(50));
    lines.push('');
    lines.push('Summary:');
    lines.push(`  Added:     ${diff.summary.added} folders`);
    lines.push(`  Removed:   ${diff.summary.removed} folders`);
    lines.push(`  Modified:  ${diff.summary.modified} folders`);
    lines.push(`  Unchanged: ${diff.summary.unchanged} folders`);
    lines.push('');
    lines.push('Detailed Changes:');
    lines.push('-'.repeat(50));
    lines.push('');
    
    const printNode = (node: DiffNode, indent = 0) => {
      const prefix = '  '.repeat(indent);
      const marker = node.type === 'added' ? '+' : 
                     node.type === 'removed' ? '-' : 
                     node.type === 'modified' ? '~' : ' ';
      
      lines.push(`${prefix}${marker} ${node.name}`);
      
      if (node.propertyChanges && node.propertyChanges.length > 0) {
        for (const change of node.propertyChanges) {
          lines.push(`${prefix}    ${change.field}:`);
          lines.push(`${prefix}      - ${JSON.stringify(change.oldValue)}`);
          lines.push(`${prefix}      + ${JSON.stringify(change.newValue)}`);
        }
      }
      
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          printNode(child, indent + 1);
        }
      }
    };
    
    for (const node of diff.changes) {
      printNode(node);
    }
    
    return lines.join('\n');
  }
}

export const templateDiffService = new TemplateDiffService();