import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorrelationView } from '../CorrelationView';
import type { AuditEntry } from '@/types/audit';

const generateCorrelatedEvents = (correlationId: string, count: number): AuditEntry[] => {
  const baseTime = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `event-${i}`,
    timestamp: new Date(baseTime + i * 1000).toISOString(),
    actor: {
      id: `actor-${i % 2}`,
      name: `Actor ${i % 2}`,
      email: `actor${i % 2}@example.com`,
      role: 'User',
      type: 'user' as const,
    },
    action: {
      type: i === 0 ? 'ORDER_CREATED' : i === count - 1 ? 'ORDER_PROVISIONED' : 'TEMPLATE_UPDATED',
      category: i === 0 || i === count - 1 ? 'provisioning' : 'template',
      severity: i === count - 1 && count > 5 ? 'error' : 'info',
      description: `Action ${i}`,
    },
    target: {
      type: 'order',
      id: 'order-123',
      name: 'Test Order',
    },
    metadata: {
      correlationId,
      duration: 100 + i * 50,
      sessionId: 'session-abc',
    },
    status: i === count - 1 && count > 5 ? 'failure' : 'success',
  }));
};

describe('CorrelationView - Enhanced Correlation Grouping Tests', () => {
  const defaultProps = {
    correlationId: 'corr-123',
    events: generateCorrelatedEvents('corr-123', 5),
    onClose: vi.fn(),
    onExport: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(<CorrelationView {...defaultProps} {...props} />);
  };

  describe('Correlation Grouping Logic', () => {
    it('groups events by correlation ID correctly', () => {
      renderComponent();
      
      expect(screen.getByText('Korrelációs ID: corr-123')).toBeInTheDocument();
      expect(screen.getByText('5 kapcsolódó esemény')).toBeInTheDocument();
    });

    it('calculates total duration for correlation chain', () => {
      const events = generateCorrelatedEvents('corr-456', 10);
      renderComponent({ events, correlationId: 'corr-456' });
      
      const firstTime = new Date(events[0].timestamp).getTime();
      const lastTime = new Date(events[9].timestamp).getTime();
      const duration = lastTime - firstTime;
      
      // Duration should be displayed in seconds
      expect(screen.getByText(`${(duration / 1000).toFixed(2)}s`)).toBeInTheDocument();
    });

    it('identifies unique services in correlation chain', () => {
      const events: AuditEntry[] = [
        ...generateCorrelatedEvents('corr-789', 2),
        {
          id: 'event-3',
          timestamp: new Date().toISOString(),
          actor: {
            id: 'system',
            name: 'System',
            email: 'system@example.com',
            role: 'System',
            type: 'system',
          },
          action: {
            type: 'NOTIFICATION_SENT',
            category: 'system',
            severity: 'info',
            description: 'Notification sent',
          },
          target: {
            type: 'notification',
            id: 'notif-1',
          },
          metadata: {
            correlationId: 'corr-789',
            service: 'notification-service',
          },
          status: 'success',
        },
      ];
      
      renderComponent({ events, correlationId: 'corr-789' });
      
      // Should show multiple services
      expect(screen.getByText(/szolgáltatások/i)).toBeInTheDocument();
    });

    it('determines overall status based on event outcomes', () => {
      // All success
      const successEvents = generateCorrelatedEvents('corr-success', 3);
      const { rerender } = renderComponent({ events: successEvents, correlationId: 'corr-success' });
      
      expect(screen.getByText('Sikeres')).toBeInTheDocument();
      
      // Contains failure
      const failureEvents = [
        ...generateCorrelatedEvents('corr-fail', 2),
        {
          ...generateCorrelatedEvents('corr-fail', 1)[0],
          id: 'event-fail',
          status: 'failure' as const,
        },
      ];
      
      rerender(<CorrelationView {...defaultProps} events={failureEvents} correlationId="corr-fail" />);
      
      expect(screen.getByText('Sikertelen')).toBeInTheDocument();
    });

    it('identifies critical path events', () => {
      const events = generateCorrelatedEvents('corr-critical', 10);
      // Mark some events as critical (e.g., long duration)
      events[3].metadata.duration = 5000; // 5 seconds
      events[7].metadata.duration = 3000; // 3 seconds
      
      renderComponent({ events, correlationId: 'corr-critical' });
      
      // Critical path events should be highlighted
      const criticalEvents = screen.getAllByTestId(/critical-path/);
      expect(criticalEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Timeline View', () => {
    it('displays events in chronological order', () => {
      renderComponent();
      
      const timelineButton = screen.getByRole('tab', { name: /idővonal/i });
      fireEvent.click(timelineButton);
      
      const timelineItems = screen.getAllByTestId(/timeline-item/);
      expect(timelineItems).toHaveLength(5);
      
      // Verify chronological order
      const timestamps = timelineItems.map(item => 
        item.querySelector('[data-timestamp]')?.getAttribute('data-timestamp')
      );
      
      for (let i = 1; i < timestamps.length; i++) {
        expect(new Date(timestamps[i]!).getTime()).toBeGreaterThan(
          new Date(timestamps[i - 1]!).getTime()
        );
      }
    });

    it('shows duration between events', () => {
      renderComponent();
      
      const timelineButton = screen.getByRole('tab', { name: /idővonal/i });
      fireEvent.click(timelineButton);
      
      // Should show time gaps between events
      const durations = screen.getAllByTestId(/event-gap-duration/);
      expect(durations.length).toBeGreaterThan(0);
    });

    it('highlights slow events in timeline', () => {
      const events = generateCorrelatedEvents('corr-slow', 5);
      events[2].metadata.duration = 10000; // 10 seconds - slow event
      
      renderComponent({ events, correlationId: 'corr-slow' });
      
      const timelineButton = screen.getByRole('tab', { name: /idővonal/i });
      fireEvent.click(timelineButton);
      
      // Slow event should be highlighted
      const slowEvent = screen.getByTestId('slow-event-2');
      expect(slowEvent).toHaveClass('slow-event');
    });

    it('expands timeline items to show details', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const timelineButton = screen.getByRole('tab', { name: /idővonal/i });
      await user.click(timelineButton);
      
      const firstItem = screen.getAllByTestId(/timeline-item/)[0];
      const expandButton = within(firstItem).getByRole('button', { name: /részletek/i });
      
      await user.click(expandButton);
      
      // Should show expanded details
      expect(within(firstItem).getByText(/metaadatok/i)).toBeInTheDocument();
    });
  });

  describe('Flow View', () => {
    it('displays service flow diagram', () => {
      const events = [
        ...generateCorrelatedEvents('corr-flow', 2),
        {
          ...generateCorrelatedEvents('corr-flow', 1)[0],
          id: 'graph-event',
          metadata: {
            correlationId: 'corr-flow',
            service: 'graph-service',
          },
        },
        {
          ...generateCorrelatedEvents('corr-flow', 1)[0],
          id: 'sharepoint-event',
          metadata: {
            correlationId: 'corr-flow',
            service: 'sharepoint-service',
          },
        },
      ] as AuditEntry[];
      
      renderComponent({ events, correlationId: 'corr-flow' });
      
      const flowButton = screen.getByRole('tab', { name: /folyamat/i });
      fireEvent.click(flowButton);
      
      // Should show service nodes
      expect(screen.getByText('graph-service')).toBeInTheDocument();
      expect(screen.getByText('sharepoint-service')).toBeInTheDocument();
    });

    it('shows event flow between services', () => {
      const events = generateCorrelatedEvents('corr-services', 6);
      events[0].metadata.service = 'api';
      events[1].metadata.service = 'worker';
      events[2].metadata.service = 'graph';
      events[3].metadata.service = 'sharepoint';
      events[4].metadata.service = 'worker';
      events[5].metadata.service = 'api';
      
      renderComponent({ events, correlationId: 'corr-services' });
      
      const flowButton = screen.getByRole('tab', { name: /folyamat/i });
      fireEvent.click(flowButton);
      
      // Should show service flow
      const flowItems = screen.getAllByTestId(/flow-step/);
      expect(flowItems.length).toBe(6);
    });

    it('indicates failed steps in flow', () => {
      const events = generateCorrelatedEvents('corr-fail-flow', 4);
      events[2].status = 'failure';
      
      renderComponent({ events, correlationId: 'corr-fail-flow' });
      
      const flowButton = screen.getByRole('tab', { name: /folyamat/i });
      fireEvent.click(flowButton);
      
      const failedStep = screen.getByTestId('flow-step-2');
      expect(failedStep).toHaveClass('failed');
    });
  });

  describe('List View', () => {
    it('displays events in accordion format', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const listButton = screen.getByRole('tab', { name: /lista/i });
      await user.click(listButton);
      
      const accordionItems = screen.getAllByRole('button', { name: /action/i });
      expect(accordionItems).toHaveLength(5);
    });

    it('expands accordion items to show full details', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const listButton = screen.getByRole('tab', { name: /lista/i });
      await user.click(listButton);
      
      const firstAccordion = screen.getAllByRole('button', { name: /action 0/i })[0];
      await user.click(firstAccordion);
      
      // Should show detailed information
      expect(screen.getByText(/actor 0/i)).toBeInTheDocument();
      expect(screen.getByText(/order-123/i)).toBeInTheDocument();
    });

    it('allows multiple accordion items to be expanded', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const listButton = screen.getByRole('tab', { name: /lista/i });
      await user.click(listButton);
      
      const accordions = screen.getAllByRole('button', { name: /action/i });
      
      // Expand first two items
      await user.click(accordions[0]);
      await user.click(accordions[1]);
      
      // Both should be expanded
      const expandedPanels = screen.getAllByRole('region');
      expect(expandedPanels.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Critical Path Analysis', () => {
    it('identifies bottleneck events', () => {
      const events = generateCorrelatedEvents('corr-bottleneck', 10);
      // Create a bottleneck
      events[5].metadata.duration = 15000; // 15 seconds
      
      renderComponent({ events, correlationId: 'corr-bottleneck' });
      
      // Bottleneck should be marked
      const bottleneckIndicator = screen.getByTestId('bottleneck-event-5');
      expect(bottleneckIndicator).toBeInTheDocument();
    });

    it('calculates critical path correctly', () => {
      const events = generateCorrelatedEvents('corr-critical-path', 8);
      // Mark events that form critical path
      events[0].metadata.duration = 1000;
      events[2].metadata.duration = 3000;
      events[5].metadata.duration = 2000;
      events[7].metadata.duration = 4000;
      
      renderComponent({ events, correlationId: 'corr-critical-path' });
      
      // Critical path should include longest duration events
      const criticalPath = screen.getByTestId('critical-path-summary');
      expect(criticalPath).toHaveTextContent(/10s/); // Sum of critical path
    });

    it('highlights dependency chains', () => {
      const events = generateCorrelatedEvents('corr-deps', 6);
      // Add dependency information
      events[1].metadata.dependsOn = events[0].id;
      events[2].metadata.dependsOn = events[1].id;
      events[4].metadata.dependsOn = events[1].id;
      
      renderComponent({ events, correlationId: 'corr-deps' });
      
      // Should show dependency relationships
      const dependencies = screen.getAllByTestId(/dependency-link/);
      expect(dependencies.length).toBeGreaterThan(0);
    });
  });

  describe('Export Functionality', () => {
    it('exports correlation chain data', async () => {
      const mockOnExport = vi.fn();
      renderComponent({ onExport: mockOnExport });
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      expect(mockOnExport).toHaveBeenCalledWith({
        correlationId: 'corr-123',
        events: expect.arrayContaining([
          expect.objectContaining({ id: 'event-0' }),
        ]),
        statistics: expect.objectContaining({
          totalEvents: 5,
          duration: expect.any(Number),
          services: expect.any(Array),
          status: expect.any(String),
        }),
      });
    });

    it('exports with selected view format', async () => {
      const mockOnExport = vi.fn();
      renderComponent({ onExport: mockOnExport });
      
      // Switch to flow view
      const flowButton = screen.getByRole('tab', { name: /folyamat/i });
      fireEvent.click(flowButton);
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      expect(mockOnExport).toHaveBeenCalledWith(
        expect.objectContaining({
          viewType: 'flow',
        })
      );
    });
  });

  describe('Performance with Large Correlation Chains', () => {
    it('handles large number of correlated events', () => {
      const largeEventSet = generateCorrelatedEvents('corr-large', 100);
      
      const { container } = renderComponent({ 
        events: largeEventSet, 
        correlationId: 'corr-large' 
      });
      
      expect(screen.getByText('100 kapcsolódó esemény')).toBeInTheDocument();
      
      // Should paginate or virtualize for performance
      const visibleItems = container.querySelectorAll('[data-testid^="timeline-item"]');
      expect(visibleItems.length).toBeLessThanOrEqual(20); // Initial visible items
    });

    it('lazy loads event details', async () => {
      const events = generateCorrelatedEvents('corr-lazy', 50);
      renderComponent({ events, correlationId: 'corr-lazy' });
      
      const user = userEvent.setup();
      
      // Initially, detailed data should not be loaded
      expect(screen.queryByText(/részletes metaadatok/i)).not.toBeInTheDocument();
      
      // Expand an item
      const listButton = screen.getByRole('tab', { name: /lista/i });
      await user.click(listButton);
      
      const firstAccordion = screen.getAllByRole('button')[0];
      await user.click(firstAccordion);
      
      // Now details should be loaded
      await waitFor(() => {
        expect(screen.getByText(/metaadatok/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('handles missing correlation ID gracefully', () => {
      renderComponent({ correlationId: undefined });
      
      expect(screen.getByText(/nincs korrelációs azonosító/i)).toBeInTheDocument();
    });

    it('handles empty event list', () => {
      renderComponent({ events: [] });
      
      expect(screen.getByText(/nincsenek kapcsolódó események/i)).toBeInTheDocument();
    });

    it('handles malformed event data', () => {
      const malformedEvents = [
        {
          id: 'bad-event',
          timestamp: 'invalid-date',
          // Missing required fields
        } as unknown as AuditEntry,
      ];
      
      renderComponent({ events: malformedEvents });
      
      // Should show error or handle gracefully
      expect(screen.getByText(/hiba/i)).toBeInTheDocument();
    });
  });

  describe('Interactive Features', () => {
    it('allows filtering events within correlation', async () => {
      const events = generateCorrelatedEvents('corr-filter', 10);
      renderComponent({ events, correlationId: 'corr-filter' });
      
      const user = userEvent.setup();
      
      // Find filter input
      const filterInput = screen.getByPlaceholderText(/szűrés/i);
      await user.type(filterInput, 'Action 5');
      
      // Should filter to matching event
      await waitFor(() => {
        const visibleEvents = screen.getAllByTestId(/event-item/);
        expect(visibleEvents).toHaveLength(1);
      });
    });

    it('allows navigation between related correlations', () => {
      const events = generateCorrelatedEvents('corr-nav', 3);
      events[1].metadata.relatedCorrelationId = 'corr-related';
      
      renderComponent({ events, correlationId: 'corr-nav' });
      
      // Should show link to related correlation
      const relatedLink = screen.getByRole('link', { name: /corr-related/i });
      expect(relatedLink).toBeInTheDocument();
    });

    it('copies correlation ID to clipboard', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });
      
      renderComponent();
      
      const copyButton = screen.getByRole('button', { name: /másolás/i });
      fireEvent.click(copyButton);
      
      expect(mockClipboard.writeText).toHaveBeenCalledWith('corr-123');
    });
  });
});