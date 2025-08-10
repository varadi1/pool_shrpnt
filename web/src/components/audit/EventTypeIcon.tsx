import React from 'react';
import {
  Document20Regular,
  DocumentAdd20Regular,
  DocumentEdit20Regular,
  DocumentDismiss20Regular,
  History20Regular,
  BoxMultiple20Regular,
  Checkmark20Regular,
  Archive20Regular,
  BoxDismiss20Regular,
  ShieldCheckmark20Regular,
  ShieldDismiss20Regular,
  Shield20Regular,
  LockClosed20Regular,
  LockOpen20Regular,
  TaskListAdd20Regular,
  Checkmark20Filled,
  PersonAdd20Regular,
  PersonDelete20Regular,
  PeopleEdit20Regular,
  DocumentData20Regular,
  ArrowExportUp20Regular,
  Mail20Regular,
  MailDismiss20Regular,
  Settings20Regular,
  People20Regular,
  Shield20Regular,
  Box20Regular,
  Info20Regular,
  Warning20Regular,
  ErrorCircle20Regular,
} from '@fluentui/react-icons';
import { tokens } from '@fluentui/react-components';
import type { AuditActionType, AuditCategory, AuditSeverity } from '../../types/audit';
import { AUDIT_EVENT_METADATA, AUDIT_CATEGORY_METADATA, AUDIT_SEVERITY_METADATA } from '../../types/audit';

interface EventTypeIconProps {
  type?: AuditActionType;
  category?: AuditCategory;
  severity?: AuditSeverity;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const iconSizeMap = {
  small: 16,
  medium: 20,
  large: 24,
};

export const EventTypeIcon: React.FC<EventTypeIconProps> = ({
  type,
  category,
  severity,
  size = 'medium',
  className,
}) => {
  const iconSize = iconSizeMap[size];
  const style = { fontSize: `${iconSize}px` };

  if (type) {
    const metadata = AUDIT_EVENT_METADATA[type];
    if (!metadata) return null;

    const color = metadata.color ? (tokens as any)[metadata.color] : undefined;
    const iconStyle = { ...style, color };

    switch (metadata.icon) {
      case 'DocumentAdd':
        return <DocumentAdd20Regular style={iconStyle} className={className} />;
      case 'DocumentEdit':
        return <DocumentEdit20Regular style={iconStyle} className={className} />;
      case 'DocumentDismiss':
        return <DocumentDismiss20Regular style={iconStyle} className={className} />;
      case 'History':
        return <History20Regular style={iconStyle} className={className} />;
      case 'BoxMultiple':
        return <BoxMultiple20Regular style={iconStyle} className={className} />;
      case 'BoxCheckmark':
        return <Checkmark20Regular style={iconStyle} className={className} />;
      case 'Archive':
        return <Archive20Regular style={iconStyle} className={className} />;
      case 'BoxDismiss':
        return <BoxDismiss20Regular style={iconStyle} className={className} />;
      case 'ShieldCheckmark':
        return <ShieldCheckmark20Regular style={iconStyle} className={className} />;
      case 'ShieldDismiss':
        return <ShieldDismiss20Regular style={iconStyle} className={className} />;
      case 'ShieldSettings':
        return <Shield20Regular style={iconStyle} className={className} />;
      case 'Lock':
        return <LockClosed20Regular style={iconStyle} className={className} />;
      case 'LockOpen':
        return <LockOpen20Regular style={iconStyle} className={className} />;
      case 'TaskListAdd':
        return <TaskListAdd20Regular style={iconStyle} className={className} />;
      case 'TaskListSquareCheckmark':
        return <Checkmark20Filled style={iconStyle} className={className} />;
      case 'PersonAdd':
        return <PersonAdd20Regular style={iconStyle} className={className} />;
      case 'PersonDelete':
        return <PersonDelete20Regular style={iconStyle} className={className} />;
      case 'PeopleSettings':
        return <PeopleEdit20Regular style={iconStyle} className={className} />;
      case 'DocumentData':
        return <DocumentData20Regular style={iconStyle} className={className} />;
      case 'ArrowExportUp':
        return <ArrowExportUp20Regular style={iconStyle} className={className} />;
      case 'Mail':
        return <Mail20Regular style={iconStyle} className={className} />;
      case 'MailDismiss':
        return <MailDismiss20Regular style={iconStyle} className={className} />;
      default:
        return <Document20Regular style={iconStyle} className={className} />;
    }
  }

  if (category) {
    const metadata = AUDIT_CATEGORY_METADATA[category];
    if (!metadata) return null;

    const color = metadata.color ? (tokens as any)[metadata.color] : undefined;
    const iconStyle = { ...style, color };

    switch (metadata.icon) {
      case 'Document':
        return <Document20Regular style={iconStyle} className={className} />;
      case 'Box':
        return <Box20Regular style={iconStyle} className={className} />;
      case 'Shield':
        return <Shield20Regular style={iconStyle} className={className} />;
      case 'Lock':
        return <LockClosed20Regular style={iconStyle} className={className} />;
      case 'People':
        return <People20Regular style={iconStyle} className={className} />;
      case 'Settings':
        return <Settings20Regular style={iconStyle} className={className} />;
      default:
        return <Document20Regular style={iconStyle} className={className} />;
    }
  }

  if (severity) {
    const metadata = AUDIT_SEVERITY_METADATA[severity];
    if (!metadata) return null;

    const color = metadata.color ? (tokens as any)[metadata.color] : undefined;
    const iconStyle = { ...style, color };

    switch (metadata.icon) {
      case 'Info':
        return <Info20Regular style={iconStyle} className={className} />;
      case 'Warning':
        return <Warning20Regular style={iconStyle} className={className} />;
      case 'ErrorCircle':
        return <ErrorCircle20Regular style={iconStyle} className={className} />;
      default:
        return <Info20Regular style={iconStyle} className={className} />;
    }
  }

  return null;
};

export const getEventColor = (type?: AuditActionType, category?: AuditCategory, severity?: AuditSeverity): string => {
  if (type) {
    const metadata = AUDIT_EVENT_METADATA[type];
    return metadata?.color || 'colorNeutralBackground3';
  }

  if (category) {
    const metadata = AUDIT_CATEGORY_METADATA[category];
    return metadata?.color || 'colorNeutralBackground3';
  }

  if (severity) {
    const metadata = AUDIT_SEVERITY_METADATA[severity];
    return metadata?.color || 'colorNeutralForeground1';
  }

  return 'colorNeutralBackground3';
};

export const getEventDescription = (type: AuditActionType): string => {
  const metadata = AUDIT_EVENT_METADATA[type];
  return metadata?.description || 'Unknown event';
};

export const getCategoryLabel = (category: AuditCategory): string => {
  const metadata = AUDIT_CATEGORY_METADATA[category];
  return metadata?.label || category;
};

export const getSeverityLabel = (severity: AuditSeverity): string => {
  const metadata = AUDIT_SEVERITY_METADATA[severity];
  return metadata?.label || severity;
};