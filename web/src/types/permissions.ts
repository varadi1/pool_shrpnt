export type PermissionLevel = 'none' | 'read' | 'write' | 'full';
export type RoleType = 'NEU_Admin' | 'NEU_PM' | 'Company_Admin' | 'Expert' | 'NEU_QA';
export type InheritanceState = 'inherited' | 'explicit' | 'broken';

export interface PermissionMatrix {
  orderId: string;
  folders: FolderPermission[];
  roles: RoleDefinition[];
  lastModified: Date;
  syncStatus: SyncStatus;
}

export interface FolderPermission {
  folderId: string;
  path: string;
  name: string;
  depth: number;
  inheritanceState: InheritanceState;
  permissions: RolePermission[];
  specialFlags?: {
    isFinancial?: boolean;
    isNeuOnly?: boolean;
    isLocked?: boolean;
    lockReason?: string;
  };
  children?: FolderPermission[];
}

export interface RolePermission {
  roleType: RoleType;
  level: PermissionLevel;
  source: 'role' | 'explicit' | 'inherited' | 'group';
  appliedBy?: string;
  appliedAt?: Date;
}

export interface EffectivePermission {
  userId: string;
  folderId: string;
  calculatedLevel: PermissionLevel;
  sources: PermissionSource[];
  conflicts?: PermissionConflict[];
}

export interface PermissionSource {
  type: 'role' | 'group' | 'explicit' | 'inherited';
  level: PermissionLevel;
  priority: number;
  sourceName: string;
}

export interface PermissionConflict {
  sources: PermissionSource[];
  resolution: {
    method: 'priority' | 'manual' | 'policy';
    selectedLevel: PermissionLevel;
    reason: string;
  };
}

export interface LockState {
  folderId: string;
  lockType: 'manual' | 'time_based' | 'cr_unlock';
  locked: boolean;
  lockedBy?: string;
  lockedAt?: Date;
  unlockAt?: Date;
  reason: string;
}

export interface RoleDefinition {
  roleType: RoleType;
  displayName: string;
  description: string;
  defaultPermissions: {
    pattern: string;
    level: PermissionLevel;
  }[];
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'error' | 'pending';
  lastSync?: Date;
  pendingChanges: number;
  currentOperation?: string;
  error?: string;
  progress?: {
    current: number;
    total: number;
  };
}

export interface PermissionTemplate {
  id: string;
  name: string;
  description: string;
  matrix: RolePermission[];
  applicableFor: string[];
}

export interface BulkOperation {
  type: 'add' | 'remove' | 'update';
  targets: {
    users?: string[];
    groups?: string[];
    folders?: string[];
  };
  permission: PermissionLevel;
  limits: {
    maxUsers: 100;
    maxFolders: 50;
    maxGroups: 20;
  };
}

export interface OrderPermissionSummary {
  orderId: string;
  orderCode: string;
  orderName: string;
  contractName: string;
  status: 'active' | 'draft' | 'completed' | 'provisioning';
  partners: {
    id: string;
    name: string;
    userCount: number;
  }[];
  userCount: number;
  groupCount: number;
  lastModified?: Date;
  lockStatus: {
    hasLocks: boolean;
    lockedFolders: number;
    totalFolders: number;
  };
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  userPrincipalName: string;
  department?: string;
  jobTitle?: string;
  type: 'Member' | 'Guest';
  isNEU?: boolean;
}

export interface Group {
  id: string;
  displayName: string;
  description?: string;
  mailEnabled: boolean;
  mailNickname?: string;
  memberCount?: number;
  groupType: 'Security' | 'Microsoft365';
}

export interface UserGroupAssignment {
  principalId: string;
  principalType: 'user' | 'group';
  displayName: string;
  email?: string;
  roleType: RoleType;
  folders: string[];
  assignedBy: string;
  assignedAt: Date;
}