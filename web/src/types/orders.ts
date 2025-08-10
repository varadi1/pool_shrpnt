export interface OrderFormData {
  contractId: string;
  contractName: string;
  
  orderName: string;
  orderCode: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  orderType: 'standard' | 'urgent' | 'special';
  
  templateId: string;
  templateVersion: string;
  
  parts: PartConfiguration[];
  
  partners: PartnerAssignment[];
}

export interface PartConfiguration {
  type: 'A' | 'B' | 'C';
  deadline: Date;
  lockSchedule: {
    t3: Date;
    t1: Date;
    t0: Date;
    t8: Date;
  };
  responsibleUserId?: string;
  responsibleTeamId?: string;
}

export interface LockTimeline {
  partId: 'A' | 'B' | 'C';
  deadline: Date;
  events: LockTimelineEvent[];
}

export interface LockTimelineEvent {
  timestamp: Date;
  type: 'T-3' | 'T-1' | 'T+0' | 'T+8';
  action: 'notify' | 'lock_write' | 'lock_read';
  color: string;
  label: string;
}

export interface PartnerAssignment {
  companyId: string;
  companyName: string;
  accessLevel: 'read' | 'write' | 'admin';
  folders: string[];
  parts: ('A' | 'B' | 'C')[];
  expiryDate?: Date;
}

export interface OrderSubmissionPayload {
  contractId: string;
  name: string;
  code: string;
  description?: string;
  startDate: string;
  endDate: string;
  templateId: string;
  templateVersion: string;
  parts: Array<{
    type: string;
    deadline: string;
    lockSchedule: Record<string, string>;
  }>;
  partners: Array<{
    companyId: string;
    accessLevel: string;
    folders: string[];
    expiryDate?: string;
  }>;
}

export interface ProvisioningStep {
  id?: string;
  name: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  error?: string;
}

export interface AuditLogEntry {
  id?: string;
  timestamp: string;
  action: string;
  details?: string;
  user?: string;
  correlationId?: string;
}