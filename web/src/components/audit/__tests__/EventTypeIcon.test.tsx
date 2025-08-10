import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventTypeIcon, getEventColor, getEventDescription, getCategoryLabel, getSeverityLabel } from '../EventTypeIcon';
import { AUDIT_EVENT_METADATA, AUDIT_CATEGORY_METADATA, AUDIT_SEVERITY_METADATA } from '../../../types/audit';

describe('EventTypeIcon', () => {
  describe('Action Type Icons', () => {
    it('should render correct icon for TEMPLATE_CREATED', () => {
      const { container } = render(<EventTypeIcon type="TEMPLATE_CREATED" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for ORDER_PROVISIONED', () => {
      const { container } = render(<EventTypeIcon type="ORDER_PROVISIONED" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for PERMISSION_GRANTED', () => {
      const { container } = render(<EventTypeIcon type="PERMISSION_GRANTED" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for LOCK_APPLIED', () => {
      const { container } = render(<EventTypeIcon type="LOCK_APPLIED" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for USER_INVITED', () => {
      const { container } = render(<EventTypeIcon type="USER_INVITED" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for NOTIFICATION_SENT', () => {
      const { container } = render(<EventTypeIcon type="NOTIFICATION_SENT" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render all defined event type icons', () => {
      Object.keys(AUDIT_EVENT_METADATA).forEach((eventType) => {
        const { container } = render(<EventTypeIcon type={eventType as any} />);
        expect(container.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  describe('Category Icons', () => {
    it('should render correct icon for template category', () => {
      const { container } = render(<EventTypeIcon category="template" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for provisioning category', () => {
      const { container } = render(<EventTypeIcon category="provisioning" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for security category', () => {
      const { container } = render(<EventTypeIcon category="security" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for lock category', () => {
      const { container } = render(<EventTypeIcon category="lock" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for user category', () => {
      const { container } = render(<EventTypeIcon category="user" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for system category', () => {
      const { container } = render(<EventTypeIcon category="system" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render all defined category icons', () => {
      Object.keys(AUDIT_CATEGORY_METADATA).forEach((category) => {
        const { container } = render(<EventTypeIcon category={category as any} />);
        expect(container.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  describe('Severity Icons', () => {
    it('should render correct icon for info severity', () => {
      const { container } = render(<EventTypeIcon severity="info" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for warning severity', () => {
      const { container } = render(<EventTypeIcon severity="warning" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for error severity', () => {
      const { container } = render(<EventTypeIcon severity="error" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render correct icon for critical severity', () => {
      const { container } = render(<EventTypeIcon severity="critical" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render all defined severity icons', () => {
      Object.keys(AUDIT_SEVERITY_METADATA).forEach((severity) => {
        const { container } = render(<EventTypeIcon severity={severity as any} />);
        expect(container.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  describe('Icon Sizes', () => {
    it('should render small size icon', () => {
      const { container } = render(<EventTypeIcon type="TEMPLATE_CREATED" size="small" />);
      const icon = container.querySelector('svg');
      expect(icon).toHaveStyle({ fontSize: '16px' });
    });

    it('should render medium size icon', () => {
      const { container } = render(<EventTypeIcon type="TEMPLATE_CREATED" size="medium" />);
      const icon = container.querySelector('svg');
      expect(icon).toHaveStyle({ fontSize: '20px' });
    });

    it('should render large size icon', () => {
      const { container } = render(<EventTypeIcon type="TEMPLATE_CREATED" size="large" />);
      const icon = container.querySelector('svg');
      expect(icon).toHaveStyle({ fontSize: '24px' });
    });

    it('should default to medium size', () => {
      const { container } = render(<EventTypeIcon type="TEMPLATE_CREATED" />);
      const icon = container.querySelector('svg');
      expect(icon).toHaveStyle({ fontSize: '20px' });
    });
  });

  describe('Priority and Precedence', () => {
    it('should prioritize type over category when both provided', () => {
      const { container } = render(<EventTypeIcon type="TEMPLATE_CREATED" category="system" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should prioritize type over severity when both provided', () => {
      const { container } = render(<EventTypeIcon type="ORDER_FAILED" severity="info" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should prioritize category over severity when both provided', () => {
      const { container } = render(<EventTypeIcon category="template" severity="error" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should return null for undefined type', () => {
      const { container } = render(<EventTypeIcon type={undefined} />);
      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    it('should return null for undefined category', () => {
      const { container } = render(<EventTypeIcon category={undefined} />);
      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    it('should return null for undefined severity', () => {
      const { container } = render(<EventTypeIcon severity={undefined} />);
      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    it('should return null when no props provided', () => {
      const { container } = render(<EventTypeIcon />);
      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<EventTypeIcon type="TEMPLATE_CREATED" className="custom-class" />);
      const icon = container.querySelector('svg');
      expect(icon).toHaveClass('custom-class');
    });
  });
});

describe('Utility Functions', () => {
  describe('getEventColor', () => {
    it('should return correct color for event type', () => {
      expect(getEventColor('TEMPLATE_CREATED')).toBe('colorPaletteGreenBackground3');
      expect(getEventColor('ORDER_FAILED')).toBe('colorPaletteRedBackground3');
      expect(getEventColor('LOCK_APPLIED')).toBe('colorPaletteYellowBackground3');
    });

    it('should return correct color for category', () => {
      expect(getEventColor(undefined, 'template')).toBe('colorPalettePurpleBackground3');
      expect(getEventColor(undefined, 'security')).toBe('colorPaletteOrangeBackground3');
      expect(getEventColor(undefined, 'system')).toBe('colorNeutralBackground3');
    });

    it('should return correct color for severity', () => {
      expect(getEventColor(undefined, undefined, 'info')).toBe('colorPaletteBlueForeground1');
      expect(getEventColor(undefined, undefined, 'warning')).toBe('colorPaletteYellowForeground2');
      expect(getEventColor(undefined, undefined, 'critical')).toBe('colorPaletteRedForeground1');
    });

    it('should return default color when no params provided', () => {
      expect(getEventColor()).toBe('colorNeutralBackground3');
    });

    it('should prioritize type over category and severity', () => {
      expect(getEventColor('TEMPLATE_CREATED', 'system', 'error')).toBe('colorPaletteGreenBackground3');
    });
  });

  describe('getEventDescription', () => {
    it('should return correct description for event types', () => {
      expect(getEventDescription('TEMPLATE_CREATED')).toBe('Template created');
      expect(getEventDescription('ORDER_PROVISIONED')).toBe('Order provisioned');
      expect(getEventDescription('PERMISSION_GRANTED')).toBe('Permission granted');
      expect(getEventDescription('LOCK_APPLIED')).toBe('Lock applied');
      expect(getEventDescription('USER_INVITED')).toBe('User invited');
      expect(getEventDescription('NOTIFICATION_FAILED')).toBe('Notification failed');
    });

    it('should return default description for unknown type', () => {
      expect(getEventDescription('UNKNOWN_TYPE' as any)).toBe('Unknown event');
    });

    it('should return descriptions for all defined event types', () => {
      Object.keys(AUDIT_EVENT_METADATA).forEach((eventType) => {
        const description = getEventDescription(eventType as any);
        expect(description).toBeTruthy();
        expect(description).not.toBe('Unknown event');
      });
    });
  });

  describe('getCategoryLabel', () => {
    it('should return correct label for categories', () => {
      expect(getCategoryLabel('template')).toBe('Template');
      expect(getCategoryLabel('provisioning')).toBe('Provisioning');
      expect(getCategoryLabel('security')).toBe('Security');
      expect(getCategoryLabel('lock')).toBe('Lock Management');
      expect(getCategoryLabel('user')).toBe('User Management');
      expect(getCategoryLabel('system')).toBe('System');
    });

    it('should return category name for unknown category', () => {
      expect(getCategoryLabel('unknown' as any)).toBe('unknown');
    });

    it('should return labels for all defined categories', () => {
      Object.keys(AUDIT_CATEGORY_METADATA).forEach((category) => {
        const label = getCategoryLabel(category as any);
        expect(label).toBeTruthy();
        expect(label).not.toBe(category);
      });
    });
  });

  describe('getSeverityLabel', () => {
    it('should return correct label for severities', () => {
      expect(getSeverityLabel('info')).toBe('Information');
      expect(getSeverityLabel('warning')).toBe('Warning');
      expect(getSeverityLabel('error')).toBe('Error');
      expect(getSeverityLabel('critical')).toBe('Critical');
    });

    it('should return severity name for unknown severity', () => {
      expect(getSeverityLabel('unknown' as any)).toBe('unknown');
    });

    it('should return labels for all defined severities', () => {
      Object.keys(AUDIT_SEVERITY_METADATA).forEach((severity) => {
        const label = getSeverityLabel(severity as any);
        expect(label).toBeTruthy();
        expect(label).not.toBe(severity);
      });
    });
  });
});

describe('Event Metadata Consistency', () => {
  it('should have metadata for all event types', () => {
    const eventTypes: string[] = [
      'TEMPLATE_CREATED', 'TEMPLATE_UPDATED', 'TEMPLATE_DELETED', 'TEMPLATE_VERSIONED',
      'ORDER_CREATED', 'ORDER_PROVISIONED', 'ORDER_ARCHIVED', 'ORDER_FAILED',
      'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'PERMISSION_MODIFIED',
      'LOCK_APPLIED', 'LOCK_RELEASED', 'CR_OPENED', 'CR_CLOSED',
      'USER_INVITED', 'USER_REMOVED', 'GROUP_MODIFIED',
      'REPORT_GENERATED', 'REPORT_EXPORTED',
      'NOTIFICATION_SENT', 'NOTIFICATION_FAILED'
    ];

    eventTypes.forEach((eventType) => {
      const metadata = AUDIT_EVENT_METADATA[eventType as any];
      expect(metadata).toBeDefined();
      expect(metadata.type).toBe(eventType);
      expect(metadata.category).toBeDefined();
      expect(metadata.description).toBeDefined();
      expect(metadata.severity).toBeDefined();
      expect(metadata.icon).toBeDefined();
      expect(metadata.color).toBeDefined();
    });
  });

  it('should have metadata for all categories', () => {
    const categories = ['template', 'provisioning', 'security', 'lock', 'user', 'system'];

    categories.forEach((category) => {
      const metadata = AUDIT_CATEGORY_METADATA[category as any];
      expect(metadata).toBeDefined();
      expect(metadata.label).toBeDefined();
      expect(metadata.description).toBeDefined();
      expect(metadata.icon).toBeDefined();
      expect(metadata.color).toBeDefined();
    });
  });

  it('should have metadata for all severities', () => {
    const severities = ['info', 'warning', 'error', 'critical'];

    severities.forEach((severity) => {
      const metadata = AUDIT_SEVERITY_METADATA[severity as any];
      expect(metadata).toBeDefined();
      expect(metadata.label).toBeDefined();
      expect(metadata.icon).toBeDefined();
      expect(metadata.color).toBeDefined();
      expect(metadata.priority).toBeDefined();
    });
  });

  it('should have ascending priority for severities', () => {
    expect(AUDIT_SEVERITY_METADATA.info.priority).toBeLessThan(AUDIT_SEVERITY_METADATA.warning.priority);
    expect(AUDIT_SEVERITY_METADATA.warning.priority).toBeLessThan(AUDIT_SEVERITY_METADATA.error.priority);
    expect(AUDIT_SEVERITY_METADATA.error.priority).toBeLessThan(AUDIT_SEVERITY_METADATA.critical.priority);
  });
});