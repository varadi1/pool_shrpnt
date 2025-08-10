import type { FolderNode, Template } from '@/types/templates';
import { templateService } from './templates';

export interface ValidationError {
  path: string;
  field: string;
  message: string;
  severity?: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
}

export class TemplateValidationService {
  private maxDepth = 6;
  private requiredFolders = ['Documents', 'Financial', 'Contracts'];
  private systemFolders = ['root', 'archive'];
  private namePattern = /^[a-zA-Z0-9_\-\s]+$/;

  validateTemplate(template: Partial<Template>, rootNode: FolderNode): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate template metadata
    if (!template.name || template.name.trim().length < 3) {
      errors.push({
        path: 'template',
        field: 'name',
        message: 'Template name must be at least 3 characters',
      });
    }

    if (template.name && template.name.length > 100) {
      errors.push({
        path: 'template',
        field: 'name',
        message: 'Template name must not exceed 100 characters',
      });
    }

    if (template.description && template.description.length > 500) {
      errors.push({
        path: 'template',
        field: 'description',
        message: 'Template description must not exceed 500 characters',
      });
    }

    // Validate folder structure
    const structureErrors = this.validateFolderStructure(rootNode);
    errors.push(...structureErrors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateFolderStructure(rootNode: FolderNode): ValidationError[] {
    const errors: ValidationError[] = [];
    const visitedPaths = new Set<string>();

    // Check for required folders
    const foundFolders = this.findFoldersByName(rootNode);
    for (const required of this.requiredFolders) {
      if (!foundFolders.has(required.toLowerCase())) {
        errors.push({
          path: 'structure',
          field: 'requiredFolders',
          message: `Required folder "${required}" is missing`,
        });
      }
    }

    // Validate each node
    this.validateNode(rootNode, '', 0, visitedPaths, errors);

    // Check for circular references
    const circularErrors = this.detectCircularReferences(rootNode);
    errors.push(...circularErrors);

    return errors;
  }

  private validateNode(
    node: FolderNode,
    parentPath: string,
    depth: number,
    visitedPaths: Set<string>,
    errors: ValidationError[]
  ): void {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

    // Check depth limit
    if (depth > this.maxDepth) {
      errors.push({
        path: currentPath,
        field: 'depth',
        message: `Folder depth exceeds maximum of ${this.maxDepth} levels`,
      });
      return;
    }

    // Validate folder name
    if (!node.name || node.name.trim().length === 0) {
      errors.push({
        path: currentPath,
        field: 'name',
        message: 'Folder name cannot be empty',
      });
    }

    if (!this.namePattern.test(node.name)) {
      errors.push({
        path: currentPath,
        field: 'name',
        message: 'Folder name contains invalid characters. Use only letters, numbers, underscore, hyphen, and spaces',
      });
    }

    // Check for duplicate paths
    if (visitedPaths.has(currentPath.toLowerCase())) {
      errors.push({
        path: currentPath,
        field: 'path',
        message: 'Duplicate folder path detected',
      });
    }
    visitedPaths.add(currentPath.toLowerCase());

    // Validate folder properties
    if (node.properties) {
      this.validateFolderProperties(node, currentPath, errors);
    }

    // Check for duplicate child names
    const childNames = new Set<string>();
    for (const child of node.children) {
      const childNameLower = child.name.toLowerCase();
      if (childNames.has(childNameLower)) {
        errors.push({
          path: `${currentPath}/${child.name}`,
          field: 'name',
          message: 'Duplicate folder name at the same level',
        });
      }
      childNames.add(childNameLower);
    }

    // Recursively validate children
    for (const child of node.children) {
      this.validateNode(child, currentPath, depth + 1, visitedPaths, errors);
    }
  }

  private validateFolderProperties(
    node: FolderNode,
    path: string,
    errors: ValidationError[]
  ): void {
    const { properties } = node;

    // Validate naming pattern if provided
    if (properties.namingPattern) {
      try {
        new RegExp(properties.namingPattern);
      } catch (e) {
        errors.push({
          path,
          field: 'namingPattern',
          message: 'Invalid regex pattern for naming convention',
        });
      }
    }

    // Validate max size
    if (properties.maxSize !== undefined && properties.maxSize <= 0) {
      errors.push({
        path,
        field: 'maxSize',
        message: 'Maximum size must be greater than 0',
      });
    }

    // Validate allowed file types
    if (properties.allowedFileTypes) {
      for (const fileType of properties.allowedFileTypes) {
        if (!fileType || fileType.trim().length === 0) {
          errors.push({
            path,
            field: 'allowedFileTypes',
            message: 'File type cannot be empty',
          });
        }
      }
    }

    // Validate lock schedule
    if (properties.locked && properties.lockSchedule) {
      const hasAnySchedule = Object.values(properties.lockSchedule).some(v => v === true);
      if (!hasAnySchedule) {
        errors.push({
          path,
          field: 'lockSchedule',
          message: 'Locked folder must have at least one lock schedule period',
        });
      }
    }
  }

  private findFoldersByName(node: FolderNode): Set<string> {
    const folders = new Set<string>();
    
    const traverse = (n: FolderNode) => {
      folders.add(n.name.toLowerCase());
      n.children.forEach(traverse);
    };
    
    traverse(node);
    return folders;
  }

  private detectCircularReferences(rootNode: FolderNode): ValidationError[] {
    const errors: ValidationError[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (node: FolderNode, path: string): boolean => {
      visited.add(node.id);
      recursionStack.add(node.id);

      for (const child of node.children) {
        const childPath = `${path}/${child.name}`;
        
        if (!visited.has(child.id)) {
          if (detectCycle(child, childPath)) {
            return true;
          }
        } else if (recursionStack.has(child.id)) {
          errors.push({
            path: childPath,
            field: 'structure',
            message: 'Circular reference detected in folder structure',
          });
          return true;
        }
      }

      recursionStack.delete(node.id);
      return false;
    };

    detectCycle(rootNode, rootNode.name);
    return errors;
  }

  validateDragDrop(
    sourceId: string,
    targetId: string,
    rootNode: FolderNode
  ): ValidationResult {
    const errors: ValidationError[] = [];

    const sourceNode = this.findNodeById(rootNode, sourceId);
    const targetNode = this.findNodeById(rootNode, targetId);

    if (!sourceNode || !targetNode) {
      errors.push({
        path: '',
        field: 'drag',
        message: 'Invalid source or target node',
      });
      return { valid: false, errors };
    }

    // Check if target is descendant of source
    if (this.isDescendant(sourceNode, targetId)) {
      errors.push({
        path: sourceNode.name,
        field: 'drag',
        message: 'Cannot move folder into its own descendant',
      });
    }

    // Check depth constraint
    const targetDepth = this.getNodeDepth(rootNode, targetId);
    const sourceSubtreeDepth = this.getSubtreeDepth(sourceNode);
    
    if (targetDepth + sourceSubtreeDepth + 1 > this.maxDepth) {
      errors.push({
        path: sourceNode.name,
        field: 'drag',
        message: `Moving this folder would exceed the maximum depth of ${this.maxDepth} levels`,
      });
    }

    // Check if target is locked
    if (targetNode.properties.locked) {
      errors.push({
        path: targetNode.name,
        field: 'drag',
        message: 'Cannot move folders into a locked folder',
      });
    }

    // Check if source is a system folder
    if (this.systemFolders.includes(sourceNode.name.toLowerCase())) {
      errors.push({
        path: sourceNode.name,
        field: 'drag',
        message: 'System folders cannot be moved',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private findNodeById(node: FolderNode, id: string): FolderNode | null {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = this.findNodeById(child, id);
      if (found) return found;
    }
    return null;
  }

  private isDescendant(node: FolderNode, targetId: string): boolean {
    for (const child of node.children) {
      if (child.id === targetId) return true;
      if (this.isDescendant(child, targetId)) return true;
    }
    return false;
  }

  private getNodeDepth(node: FolderNode, id: string, depth = 0): number {
    if (node.id === id) return depth;
    for (const child of node.children) {
      const childDepth = this.getNodeDepth(child, id, depth + 1);
      if (childDepth > -1) return childDepth;
    }
    return -1;
  }

  private getSubtreeDepth(node: FolderNode): number {
    if (!node.children || node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(child => this.getSubtreeDepth(child)));
  }

  /**
   * Perform server-side validation via API
   */
  async validateWithServer(template: Partial<Template>, rootNode: FolderNode): Promise<ValidationResult> {
    try {
      // First perform client-side validation
      const clientValidation = this.validateTemplate(template, rootNode);
      
      // If client-side validation fails, return immediately
      if (!clientValidation.valid) {
        return clientValidation;
      }

      // Send to server for additional validation
      const serverResponse = await templateService.validateTemplate({
        ...template,
        structure: rootNode
      } as any);

      // Merge client and server validation results
      const allErrors = [...clientValidation.errors];
      const warnings: ValidationError[] = [];

      if (!serverResponse.valid && serverResponse.errors) {
        // Convert server errors to our format
        serverResponse.errors.forEach(error => {
          allErrors.push({
            path: 'server',
            field: 'validation',
            message: error,
            severity: 'error'
          });
        });
      }

      return {
        valid: allErrors.length === 0,
        errors: allErrors,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      // If server validation fails, fall back to client-side only
      console.warn('Server validation failed, using client-side only:', error);
      return this.validateTemplate(template, rootNode);
    }
  }

  /**
   * Validate inline (real-time) as user types
   */
  validateField(field: string, value: any): ValidationError | null {
    switch (field) {
      case 'templateName':
        if (!value || value.trim().length < 3) {
          return {
            path: 'template',
            field: 'name',
            message: 'Template name must be at least 3 characters'
          };
        }
        if (value.length > 100) {
          return {
            path: 'template',
            field: 'name',
            message: 'Template name must not exceed 100 characters'
          };
        }
        break;

      case 'folderName':
        if (!value || value.trim().length === 0) {
          return {
            path: 'folder',
            field: 'name',
            message: 'Folder name cannot be empty'
          };
        }
        if (!this.namePattern.test(value)) {
          return {
            path: 'folder',
            field: 'name',
            message: 'Invalid characters. Use only letters, numbers, underscore, hyphen, and spaces'
          };
        }
        break;

      case 'description':
        if (value && value.length > 500) {
          return {
            path: 'template',
            field: 'description',
            message: 'Description must not exceed 500 characters'
          };
        }
        break;

      case 'namingPattern':
        if (value) {
          try {
            new RegExp(value);
          } catch (e) {
            return {
              path: 'folder',
              field: 'namingPattern',
              message: 'Invalid regex pattern'
            };
          }
        }
        break;
    }

    return null;
  }

  /**
   * Get validation summary for display
   */
  getValidationSummary(result: ValidationResult): string {
    if (result.valid) {
      return 'Template validation passed';
    }

    const errorCount = result.errors.length;
    const warningCount = result.warnings?.length || 0;

    let summary = `Found ${errorCount} error${errorCount !== 1 ? 's' : ''}`;
    if (warningCount > 0) {
      summary += ` and ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
    }

    return summary;
  }

  /**
   * Check if a template can be published
   */
  canPublish(template: Partial<Template>, rootNode: FolderNode): boolean {
    const validation = this.validateTemplate(template, rootNode);
    
    // Must have no errors
    if (!validation.valid) return false;
    
    // Must have required metadata
    if (!template.name || !template.description) return false;
    
    // Must have at least one folder besides root
    if (!rootNode.children || rootNode.children.length === 0) return false;
    
    // Must have all required folders
    const foundFolders = this.findFoldersByName(rootNode);
    for (const required of this.requiredFolders) {
      if (!foundFolders.has(required.toLowerCase())) {
        return false;
      }
    }
    
    return true;
  }
}

export const templateValidation = new TemplateValidationService();