export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role: string;
    type: 'user' | 'system';
  };
  action: {
    type: AuditActionType;
    category: AuditCategory;
    severity: AuditSeverity;
    description: string;
  };
  target: {
    type: string;
    id: string;
    name?: string;
    path?: string;
  };
  changes?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  metadata: {
    correlationId: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    duration?: number;
  };
  status: 'success' | 'failure';
  error?: {
    code: string;
    message: string;
  };
}

export type AuditActionType = 
  | 'TEMPLATE_CREATED' | 'TEMPLATE_UPDATED' | 'TEMPLATE_DELETED' | 'TEMPLATE_VERSIONED'
  | 'ORDER_CREATED' | 'ORDER_PROVISIONED' | 'ORDER_ARCHIVED' | 'ORDER_FAILED'
  | 'PERMISSION_GRANTED' | 'PERMISSION_REVOKED' | 'PERMISSION_MODIFIED'
  | 'LOCK_APPLIED' | 'LOCK_RELEASED' | 'CR_OPENED' | 'CR_CLOSED'
  | 'USER_INVITED' | 'USER_REMOVED' | 'GROUP_MODIFIED'
  | 'REPORT_GENERATED' | 'REPORT_EXPORTED'
  | 'NOTIFICATION_SENT' | 'NOTIFICATION_FAILED';

export type AuditCategory = 'template' | 'provisioning' | 'security' | 'lock' | 'user' | 'system';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditEventMetadata {
  type: AuditActionType;
  category: AuditCategory;
  label: string;
  description: string;
  severity: AuditSeverity;
  icon?: string;
  color?: string;
}

export const AUDIT_EVENT_METADATA: Record<AuditActionType, AuditEventMetadata> = {
  TEMPLATE_CREATED: {
    type: 'TEMPLATE_CREATED',
    category: 'template',
    label: 'Template Created',
    description: 'Template created',
    severity: 'info',
    icon: 'DocumentAdd',
    color: 'colorPaletteGreenBackground3'
  },
  TEMPLATE_UPDATED: {
    type: 'TEMPLATE_UPDATED',
    category: 'template',
    label: 'Template Updated',
    description: 'Template updated',
    severity: 'info',
    icon: 'DocumentEdit',
    color: 'colorPaletteBlueBBackground3'
  },
  TEMPLATE_DELETED: {
    type: 'TEMPLATE_DELETED',
    category: 'template',
    label: 'Template Deleted',
    description: 'Template deleted',
    severity: 'warning',
    icon: 'DocumentDismiss',
    color: 'colorPaletteRedBackground3'
  },
  TEMPLATE_VERSIONED: {
    type: 'TEMPLATE_VERSIONED',
    category: 'template',
    label: 'Template Versioned',
    description: 'Template version created',
    severity: 'info',
    icon: 'History',
    color: 'colorPalettePurpleBackground3'
  },
  ORDER_CREATED: {
    type: 'ORDER_CREATED',
    category: 'provisioning',
    label: 'Order Created',
    description: 'Order created',
    severity: 'info',
    icon: 'BoxMultiple',
    color: 'colorPaletteGreenBackground3'
  },
  ORDER_PROVISIONED: {
    type: 'ORDER_PROVISIONED',
    category: 'provisioning',
    label: 'Order Provisioned',
    description: 'Order provisioned',
    severity: 'info',
    icon: 'BoxCheckmark',
    color: 'colorPaletteGreenBackground3'
  },
  ORDER_ARCHIVED: {
    type: 'ORDER_ARCHIVED',
    category: 'provisioning',
    label: 'Order Archived',
    description: 'Order archived',
    severity: 'info',
    icon: 'Archive',
    color: 'colorNeutralBackground3'
  },
  ORDER_FAILED: {
    type: 'ORDER_FAILED',
    category: 'provisioning',
    label: 'Order Failed',
    description: 'Order provisioning failed',
    severity: 'error',
    icon: 'BoxDismiss',
    color: 'colorPaletteRedBackground3'
  },
  PERMISSION_GRANTED: {
    type: 'PERMISSION_GRANTED',
    category: 'security',
    label: 'Permission Granted',
    description: 'Permission granted',
    severity: 'info',
    icon: 'ShieldCheckmark',
    color: 'colorPaletteGreenBackground3'
  },
  PERMISSION_REVOKED: {
    type: 'PERMISSION_REVOKED',
    category: 'security',
    label: 'Permission Revoked',
    description: 'Permission revoked',
    severity: 'warning',
    icon: 'ShieldDismiss',
    color: 'colorPaletteOrangeBackground3'
  },
  PERMISSION_MODIFIED: {
    type: 'PERMISSION_MODIFIED',
    category: 'security',
    label: 'Permission Modified',
    description: 'Permission modified',
    severity: 'info',
    icon: 'ShieldSettings',
    color: 'colorPaletteBlueBBackground3'
  },
  LOCK_APPLIED: {
    type: 'LOCK_APPLIED',
    category: 'lock',
    label: 'Lock Applied',
    description: 'Lock applied',
    severity: 'warning',
    icon: 'Lock',
    color: 'colorPaletteYellowBackground3'
  },
  LOCK_RELEASED: {
    type: 'LOCK_RELEASED',
    category: 'lock',
    label: 'Lock Released',
    description: 'Lock released',
    severity: 'info',
    icon: 'LockOpen',
    color: 'colorPaletteGreenBackground3'
  },
  CR_OPENED: {
    type: 'CR_OPENED',
    category: 'lock',
    label: 'CR Opened',
    description: 'Change request opened',
    severity: 'info',
    icon: 'TaskListAdd',
    color: 'colorPaletteBlueBBackground3'
  },
  CR_CLOSED: {
    type: 'CR_CLOSED',
    category: 'lock',
    label: 'CR Closed',
    description: 'Change request closed',
    severity: 'info',
    icon: 'TaskListSquareCheckmark',
    color: 'colorPaletteGreenBackground3'
  },
  USER_INVITED: {
    type: 'USER_INVITED',
    category: 'user',
    label: 'User Invited',
    description: 'User invited',
    severity: 'info',
    icon: 'PersonAdd',
    color: 'colorPaletteGreenBackground3'
  },
  USER_REMOVED: {
    type: 'USER_REMOVED',
    category: 'user',
    label: 'User Removed',
    description: 'User removed',
    severity: 'warning',
    icon: 'PersonDelete',
    color: 'colorPaletteRedBackground3'
  },
  GROUP_MODIFIED: {
    type: 'GROUP_MODIFIED',
    category: 'user',
    label: 'Group Modified',
    description: 'Group modified',
    severity: 'info',
    icon: 'PeopleSettings',
    color: 'colorPaletteBlueBBackground3'
  },
  REPORT_GENERATED: {
    type: 'REPORT_GENERATED',
    category: 'system',
    label: 'Report Generated',
    description: 'Report generated',
    severity: 'info',
    icon: 'DocumentData',
    color: 'colorPaletteBlueBBackground3'
  },
  REPORT_EXPORTED: {
    type: 'REPORT_EXPORTED',
    category: 'system',
    label: 'Report Exported',
    description: 'Report exported',
    severity: 'info',
    icon: 'ArrowExportUp',
    color: 'colorPaletteGreenBackground3'
  },
  NOTIFICATION_SENT: {
    type: 'NOTIFICATION_SENT',
    category: 'system',
    label: 'Notification Sent',
    description: 'Notification sent',
    severity: 'info',
    icon: 'Mail',
    color: 'colorPaletteGreenBackground3'
  },
  NOTIFICATION_FAILED: {
    type: 'NOTIFICATION_FAILED',
    category: 'system',
    label: 'Notification Failed',
    description: 'Notification failed',
    severity: 'error',
    icon: 'MailDismiss',
    color: 'colorPaletteRedBackground3'
  }
};

export const AUDIT_CATEGORY_METADATA: Record<AuditCategory, {
  label: string;
  description: string;
  icon: string;
  color: string;
}> = {
  template: {
    label: 'Template',
    description: 'Template creation, modification, and versioning events',
    icon: 'Document',
    color: 'colorPalettePurpleBackground3'
  },
  provisioning: {
    label: 'Provisioning',
    description: 'Order creation and provisioning lifecycle events',
    icon: 'Box',
    color: 'colorPaletteBlueBBackground3'
  },
  security: {
    label: 'Security',
    description: 'Permission and access control changes',
    icon: 'Shield',
    color: 'colorPaletteOrangeBackground3'
  },
  lock: {
    label: 'Lock Management',
    description: 'Lock and change request operations',
    icon: 'Lock',
    color: 'colorPaletteYellowBackground3'
  },
  user: {
    label: 'User Management',
    description: 'User and group management activities',
    icon: 'People',
    color: 'colorPaletteTealBackground3'
  },
  system: {
    label: 'System',
    description: 'System operations, reports, and notifications',
    icon: 'Settings',
    color: 'colorNeutralBackground3'
  }
};

export const AUDIT_SEVERITY_METADATA: Record<AuditSeverity, {
  label: string;
  icon: string;
  color: string;
  priority: number;
}> = {
  info: {
    label: 'Information',
    icon: 'Info',
    color: 'colorPaletteBlueForeground1',
    priority: 1
  },
  warning: {
    label: 'Warning',
    icon: 'Warning',
    color: 'colorPaletteYellowForeground2',
    priority: 2
  },
  error: {
    label: 'Error',
    icon: 'ErrorCircle',
    color: 'colorPaletteOrangeForeground1',
    priority: 3
  },
  critical: {
    label: 'Critical',
    icon: 'ErrorCircle',
    color: 'colorPaletteRedForeground1',
    priority: 4
  }
};

export interface AuditFilter {
  dateRange?: {
    from: Date;
    to: Date;
  };
  actors?: string[];
  actionTypes?: AuditActionType[];
  categories?: AuditCategory[];
  targetTypes?: string[];
  correlationId?: string;
  status?: ('success' | 'failure')[];
  searchText?: string;
}

export interface CorrelationGroup {
  correlationId: string;
  events: AuditEntry[];
  startTime: string;
  endTime: string;
  duration: number;
  services: string[];
  status: 'success' | 'partial' | 'failure';
  criticalPath: string[];
}

export interface ExportJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  format: 'csv' | 'xlsx';
  filters: AuditFilter;
  createdAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  error?: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
}

export interface AuditPaginatedResponse {
  entries: AuditEntry[];
  pagination: {
    cursor?: string;
    hasMore: boolean;
    totalCount: number;
  };
}

export interface AuditStats {
  totalEvents: number;
  eventsPerDay: Array<{
    date: string;
    count: number;
  }>;
  topActors: Array<{
    actor: string;
    count: number;
  }>;
  actionBreakdown: Array<{
    action: AuditActionType;
    count: number;
  }>;
  categoryBreakdown: Array<{
    category: AuditCategory;
    count: number;
  }>;
  failureRate: number;
  averageResponseTime: number;
}

export interface WebSocketMessage {
  type: 'connected' | 'audit_event' | 'error' | 'ping' | 'pong';
  payload?: unknown;
  timestamp: string;
}

export interface AuditEventMessage extends WebSocketMessage {
  type: 'audit_event';
  payload: {
    event: AuditEntry;
    affectedFilters?: AuditFilter;
  };
}