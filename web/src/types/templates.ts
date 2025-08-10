export type TemplateStatus = 'draft' | 'active' | 'default' | 'deprecated' | 'archived';

export interface Template {
  id: string;
  name: string;
  description: string;
  status: TemplateStatus;
  currentVersion: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  tags: string[];
}

export type VersionTag = 'stable' | 'beta' | 'deprecated' | 'archived';

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: string;
  structure: FolderNode;
  changelog: string;
  author: string;
  publishedAt: Date;
  isPublished: boolean;
  usageCount: number;
  tags?: VersionTag[];
}

export interface FolderNode {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  children: FolderNode[];
  properties: FolderProperties;
  permissions: PermissionSet;
  metadata: Record<string, any>;
}

export interface FolderProperties {
  namingPattern?: string;
  description?: string;
  required: boolean;
  locked: boolean;
  lockSchedule?: {
    t3?: boolean;
    t1?: boolean;
    t0?: boolean;
    t8?: boolean;
  };
  maxSize?: number;
  allowedFileTypes?: string[];
}

export interface PermissionSet {
  inherit: boolean;
  breakInheritance: boolean;
  groups: {
    groupId: string;
    groupName: string;
    permission: 'read' | 'write' | 'full';
  }[];
}

export interface TemplateListResponse {
  templates: Template[];
  total: number;
  page: number;
  page_size: number;
}

export interface TemplateFilters {
  search?: string;
  status?: TemplateStatus[];
  tags?: string[];
  createdBy?: string;
}

export interface TemplateSortOptions {
  field: 'name' | 'date' | 'usage' | 'status';
  direction: 'asc' | 'desc';
}

export interface VersionUsage {
  orderId: string;
  orderName: string;
  deployedAt: Date;
  status: 'active' | 'archived';
}

export interface VersionUsageResponse {
  version: string;
  totalOrders: number;
  orders: VersionUsage[];
}

export interface DiffResult {
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  changes: DiffNode[];
}

export interface DiffNode {
  path: string;
  name: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldValue?: FolderNode;
  newValue?: FolderNode;
  propertyChanges?: PropertyChange[];
  children?: DiffNode[];
}

export interface PropertyChange {
  field: string;
  oldValue: any;
  newValue: any;
  type: 'added' | 'removed' | 'modified';
}

export interface TemplateExport {
  exportVersion: string;
  exportDate: string;
  templates: TemplateExportData[];
}

export interface TemplateExportData extends Template {
  versions?: TemplateVersion[];
}

export interface TemplateImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
  templates: Template[];
}

export interface TemplateShare {
  id: string;
  templateIds: string[];
  shareUrl: string;
  expiry: string;
  createdAt: Date;
  createdBy: string;
}

export interface TemplateMigration {
  fromVersion: string;
  toVersion: string;
  breaking: boolean;
  migrations: MigrationStep[];
}

export interface MigrationStep {
  type: 'add_folder' | 'remove_folder' | 'rename_folder' | 'move_folder' | 'update_permissions';
  path: string;
  action: Record<string, any>;
  rollback: Record<string, any>;
}

export interface MigrationResult {
  success: boolean;
  requiresManualReview: boolean;
  changes: MigrationStep[];
  errors?: string[];
}