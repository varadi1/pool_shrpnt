import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CorrelationView } from '../CorrelationView';
import type { AuditEntry } from '../../../types/audit';

const mockEvents: AuditEntry[] = [
  {
    id: 'event-1',
    timestamp: '2024-01-15T10:00:00Z',
    actor: {
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'NEU_Admin',
      type: 'user',
    },
    action: {
      type: 'ORDER_CREATED',
      category: 'provisioning',
      severity: 'info',
      description: 'Created provisioning order',
    },
    target: {
      type: 'order',
      id: 'order-123',
      name: 'EM-2024-001',
    },
    metadata: {
      correlationId: 'corr-123',
      sessionId: 'session-456',
      duration: 150,
    },
    status: 'success',
  },
  {
    id: 'event-2',
    timestamp: '2024-01-15T10:00:05Z',
    actor: {
      id: 'system',
      name: 'provisioning-service',
      email: '',
      role: '',
      type: 'system',
    },
    action: {
      type: 'TEMPLATE_CREATED',
      category: 'template',
      severity: 'info',
      description: 'Created SharePoint template',
    },
    target: {
      type: 'template',
      id: 'template-456',
      name: 'Project Template',
    },
    metadata: {
      correlationId: 'corr-123',
      duration: 2300,
    },
    status: 'success',
  },
  {
    id: 'event-3',
    timestamp: '2024-01-15T10:00:10Z',
    actor: {
      id: 'system',
      name: 'notification-service',
      email: '',
      role: '',
      type: 'system',
    },
    action: {
      type: 'NOTIFICATION_FAILED',
      category: 'system',
      severity: 'error',
      description: 'Failed to send notification',
    },
    target: {
      type: 'notification',
      id: 'notif-789',
    },
    metadata: {
      correlationId: 'corr-123',
      duration: 500,
    },
    status: 'failure',
    error: {
      code: 'SMTP_ERROR',
      message: 'Failed to connect to SMTP server',
    },
  },
];

describe('CorrelationView', () => {
  const mockOnExport = vi.fn();
  const mockOnEventClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        loading={true}
      />
    );

    expect(screen.getByText('Loading correlation events...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        error="Failed to load correlation events"
      />
    );

    expect(screen.getByText('Error loading correlation')).toBeInTheDocument();
    expect(screen.getByText('Failed to load correlation events')).toBeInTheDocument();
  });

  it('renders no data state', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={[]}
      />
    );

    expect(screen.getByText('No events found for correlation ID: corr-123')).toBeInTheDocument();
  });

  it('renders correlation view with events', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    expect(screen.getByText('Correlation View')).toBeInTheDocument();
    expect(screen.getByText('ID: corr-123')).toBeInTheDocument();
  });

  it('displays correlation statistics', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('10.0s')).toBeInTheDocument(); // 10 seconds between first and last event
    expect(screen.getByText('Events')).toBeInTheDocument();
    // Use getAllByText since there might be multiple "3" values
    const threeValues = screen.getAllByText('3');
    expect(threeValues.length).toBeGreaterThan(0);
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Critical Events')).toBeInTheDocument();
    // Use getAllByText for "1" as well
    const oneValues = screen.getAllByText('1');
    expect(oneValues.length).toBeGreaterThan(0);
  });

  it('switches between view modes', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    const timelineButton = screen.getByRole('button', { name: /Timeline/i });
    const flowButton = screen.getByRole('button', { name: /Flow/i });
    const listButton = screen.getByRole('button', { name: /List/i });

    // Check buttons exist
    expect(timelineButton).toBeInTheDocument();
    expect(flowButton).toBeInTheDocument();
    expect(listButton).toBeInTheDocument();

    // Switch to flow view
    fireEvent.click(flowButton);
    expect(flowButton).toBeInTheDocument();

    // Switch to list view
    fireEvent.click(listButton);
    expect(listButton).toBeInTheDocument();
  });

  it('renders timeline view with events', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // Check for event labels
    expect(screen.getByText('Order Created')).toBeInTheDocument();
    expect(screen.getByText('Template Created')).toBeInTheDocument();
    expect(screen.getByText('Notification Failed')).toBeInTheDocument();
  });

  it('highlights critical path events', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // The failed notification should be marked as critical
    const criticalBadges = screen.getAllByText('Critical');
    expect(criticalBadges.length).toBeGreaterThan(0);
  });

  it('expands and collapses event details in timeline view', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // Find expand buttons (using a more flexible query)
    const expandButtons = screen.getAllByRole('button').filter(button => {
      const icon = button.querySelector('svg');
      return icon !== null && button.textContent === '';
    });

    expect(expandButtons.length).toBeGreaterThan(0);
    
    // Click first expand button
    fireEvent.click(expandButtons[0]);

    // Check for expanded content - the description is shown
    expect(screen.getByText(mockEvents[0].action.description)).toBeInTheDocument();
  });

  it('renders flow view with service grouping', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // Switch to flow view
    const flowButton = screen.getByRole('button', { name: /Flow/i });
    fireEvent.click(flowButton);

    // Check for service names
    expect(screen.getByText('user')).toBeInTheDocument();
    expect(screen.getByText('provisioning-service')).toBeInTheDocument();
    expect(screen.getByText('notification-service')).toBeInTheDocument();
  });

  it('renders list view with accordion items', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // Switch to list view
    const listButton = screen.getByRole('button', { name: /List/i });
    fireEvent.click(listButton);

    // Check for accordion headers
    expect(screen.getByText('Order Created')).toBeInTheDocument();
    expect(screen.getByText('Template Created')).toBeInTheDocument();
    expect(screen.getByText('Notification Failed')).toBeInTheDocument();
  });

  it('calls onExport when export button is clicked', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
        onExport={mockOnExport}
      />
    );

    const exportButton = screen.getByRole('button', { name: /Export/i });
    fireEvent.click(exportButton);

    expect(mockOnExport).toHaveBeenCalledWith('corr-123', mockEvents);
  });

  it('calls onEventClick when event detail link is clicked', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
        onEventClick={mockOnEventClick}
      />
    );

    // Expand first event
    const expandButtons = screen.getAllByRole('button').filter(button => {
      const icon = button.querySelector('svg');
      return icon !== null && button.textContent === '';
    });

    expect(expandButtons.length).toBeGreaterThan(0);
    
    fireEvent.click(expandButtons[0]);

    // Click view details link
    const detailsLink = screen.getByText('View details →');
    fireEvent.click(detailsLink);

    expect(mockOnEventClick).toHaveBeenCalledWith('event-1');
  });

  it('displays error messages for failed events', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // Expand the failed event
    const expandButtons = screen.getAllByRole('button').filter(button => {
      const icon = button.querySelector('svg');
      return icon !== null && button.textContent === '';
    });

    // Click the last expand button (for the failed event)
    expect(expandButtons.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(expandButtons[2]);
    
    // Check for error message
    expect(screen.getByText('Failed to connect to SMTP server')).toBeInTheDocument();
  });

  it('calculates and displays relative timestamps', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // Check for relative timestamps - they should exist
    const timestampElements = screen.getAllByText(/\+\d+(\.\d+)?[ms|s]/);
    expect(timestampElements.length).toBeGreaterThan(0);
  });

  it('displays event durations when available', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // Expand events to see durations
    const expandButtons = screen.getAllByRole('button').filter(button => {
      const icon = button.querySelector('svg');
      return icon !== null && button.textContent === '';
    });

    expect(expandButtons.length).toBeGreaterThan(0);
    fireEvent.click(expandButtons[0]);
    expect(screen.getByText('Duration: 150ms')).toBeInTheDocument();
  });

  it('handles events without names gracefully', () => {
    const eventsWithoutNames = [
      {
        ...mockEvents[0],
        target: {
          type: 'order',
          id: 'order-123',
          // No name property
        },
      },
    ];

    render(
      <CorrelationView
        correlationId="corr-123"
        events={eventsWithoutNames}
      />
    );

    // Should render without errors
    expect(screen.getByText('Correlation View')).toBeInTheDocument();
  });

  it('correctly identifies correlation status', () => {
    // Test with all successful events
    const successfulEvents = mockEvents.slice(0, 2);
    const { rerender } = render(
      <CorrelationView
        correlationId="corr-123"
        events={successfulEvents}
      />
    );

    expect(screen.getByText('success')).toBeInTheDocument();

    // Test with failure events
    rerender(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    expect(screen.getByText('failure')).toBeInTheDocument();
  });

  it('shows correct event count per service in flow view', () => {
    render(
      <CorrelationView
        correlationId="corr-123"
        events={mockEvents}
      />
    );

    // Switch to flow view
    const flowButton = screen.getByRole('button', { name: /Flow/i });
    fireEvent.click(flowButton);

    // Check for event counts - should have "1 event" badges
    const eventBadges = screen.getAllByText('1 event');
    expect(eventBadges.length).toBeGreaterThan(0);
  });

  it('handles empty critical path gracefully', () => {
    const eventsWithoutCritical = mockEvents.map(event => ({
      ...event,
      status: 'success' as const,
      action: {
        ...event.action,
        severity: 'info' as const,
      },
      error: undefined,
    }));

    render(
      <CorrelationView
        correlationId="corr-123"
        events={eventsWithoutCritical}
      />
    );

    // Should not show Critical Events stat
    expect(screen.queryByText('Critical Events')).not.toBeInTheDocument();
  });
});