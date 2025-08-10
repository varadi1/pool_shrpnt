import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditWebSocketService } from '../auditWebSocket';
import type { AuditEntry, WebSocketMessage } from '@/types/audit';

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    
    // Simulate connection after a delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

// @ts-ignore
global.WebSocket = MockWebSocket;

describe('AuditWebSocketService - Enhanced Connection Tests', () => {
  let service: AuditWebSocketService;
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    mockConfig = {
      ws: {
        baseUrl: 'ws://localhost:8000',
      },
    };
    
    // Mock config import
    vi.mock('@/config/env.config', () => ({
      default: mockConfig,
    }));
    
    service = new AuditWebSocketService();
  });

  afterEach(() => {
    service.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Connection Management', () => {
    it('establishes WebSocket connection successfully', async () => {
      const connectSpy = vi.spyOn(service, 'connect');
      
      service.connect();
      
      // Fast-forward connection timeout
      vi.advanceTimersByTime(20);
      
      expect(connectSpy).toHaveBeenCalled();
      expect(service.getConnectionStatus()).toBe('connected');
    });

    it('handles connection failure gracefully', () => {
      const ws = service.connect();
      
      // Simulate connection error
      if (ws && ws.onerror) {
        ws.onerror(new Event('error'));
      }
      
      expect(service.getConnectionStatus()).toBe('error');
    });

    it('implements automatic reconnection with exponential backoff', () => {
      const connectSpy = vi.spyOn(service, 'connect');
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      // Simulate connection close
      const ws = (service as any).ws;
      if (ws) {
        ws.close();
      }
      
      // First reconnect attempt after 1 second
      vi.advanceTimersByTime(1000);
      expect(connectSpy).toHaveBeenCalledTimes(2);
      
      // Simulate another failure
      if ((service as any).ws) {
        (service as any).ws.close();
      }
      
      // Second reconnect attempt after 2 seconds (exponential backoff)
      vi.advanceTimersByTime(2000);
      expect(connectSpy).toHaveBeenCalledTimes(3);
    });

    it('limits reconnection attempts to maximum', () => {
      const connectSpy = vi.spyOn(service, 'connect');
      const fallbackSpy = vi.spyOn(service as any, 'fallbackToPolling');
      
      service.connect();
      
      // Simulate 5 failed connection attempts
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(20);
        const ws = (service as any).ws;
        if (ws) {
          ws.close();
        }
        vi.advanceTimersByTime(Math.pow(2, i) * 1000);
      }
      
      // After 5 attempts, should fallback to polling
      expect(fallbackSpy).toHaveBeenCalled();
      expect(connectSpy).toHaveBeenCalledTimes(6); // Initial + 5 retries
    });

    it('maintains connection with periodic ping', () => {
      const sendSpy = vi.fn();
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      if (ws) {
        ws.send = sendSpy;
      }
      
      // Advance time to trigger ping (30 seconds)
      vi.advanceTimersByTime(30000);
      
      expect(sendSpy).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'ping',
          timestamp: expect.any(String),
        })
      );
    });

    it('handles pong responses correctly', () => {
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      const pongMessage: WebSocketMessage = {
        type: 'pong',
        timestamp: new Date().toISOString(),
      };
      
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify(pongMessage),
        }));
      }
      
      // Should not trigger any errors
      expect(service.getConnectionStatus()).toBe('connected');
    });
  });

  describe('Message Handling', () => {
    it('processes audit event messages correctly', () => {
      const mockEntry: AuditEntry = {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        actor: {
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
          role: 'Admin',
          type: 'user',
        },
        action: {
          type: 'TEMPLATE_CREATED',
          category: 'template',
          severity: 'info',
          description: 'Template created',
        },
        target: {
          type: 'template',
          id: 'template-1',
          name: 'Test Template',
        },
        metadata: {
          correlationId: 'corr-123',
        },
        status: 'success',
      };
      
      const subscriber = vi.fn();
      service.subscribe('test', subscriber);
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      const message: WebSocketMessage = {
        type: 'audit_event',
        payload: { event: mockEntry },
        timestamp: new Date().toISOString(),
      };
      
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify(message),
        }));
      }
      
      expect(subscriber).toHaveBeenCalledWith(mockEntry);
    });

    it('batches multiple messages to prevent UI flooding', () => {
      const subscriber = vi.fn();
      service.subscribe('test', subscriber);
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      
      // Send multiple messages rapidly
      for (let i = 0; i < 15; i++) {
        const message: WebSocketMessage = {
          type: 'audit_event',
          payload: {
            event: {
              id: `audit-${i}`,
              timestamp: new Date().toISOString(),
              actor: { id: 'user-1', name: 'User', email: 'user@test.com', role: 'User', type: 'user' },
              action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: 'Test' },
              target: { type: 'template', id: `template-${i}` },
              metadata: { correlationId: `corr-${i}` },
              status: 'success',
            },
          },
          timestamp: new Date().toISOString(),
        };
        
        if (ws && ws.onmessage) {
          ws.onmessage(new MessageEvent('message', {
            data: JSON.stringify(message),
          }));
        }
      }
      
      // Should batch messages (max 10 per batch)
      expect(subscriber).toHaveBeenCalledTimes(2); // 10 + 5
      
      // First batch should have 10 events
      expect(subscriber.mock.calls[0][0]).toHaveLength(10);
      
      // Second batch should have 5 events
      expect(subscriber.mock.calls[1][0]).toHaveLength(5);
    });

    it('handles malformed messages gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      
      // Send malformed JSON
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: '{ invalid json }',
        }));
      }
      
      expect(errorSpy).toHaveBeenCalled();
      expect(service.getConnectionStatus()).toBe('connected'); // Should stay connected
      
      errorSpy.mockRestore();
    });

    it('filters messages based on subscription filters', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();
      
      service.subscribe('sub1', subscriber1, {
        categories: ['template'],
      });
      
      service.subscribe('sub2', subscriber2, {
        categories: ['security'],
      });
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      
      // Send template event
      const templateMessage: WebSocketMessage = {
        type: 'audit_event',
        payload: {
          event: {
            id: 'audit-1',
            timestamp: new Date().toISOString(),
            actor: { id: 'user-1', name: 'User', email: 'user@test.com', role: 'User', type: 'user' },
            action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: 'Test' },
            target: { type: 'template', id: 'template-1' },
            metadata: { correlationId: 'corr-1' },
            status: 'success',
          },
          affectedFilters: { categories: ['template'] },
        },
        timestamp: new Date().toISOString(),
      };
      
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify(templateMessage),
        }));
      }
      
      // Only subscriber1 should be called
      expect(subscriber1).toHaveBeenCalled();
      expect(subscriber2).not.toHaveBeenCalled();
    });
  });

  describe('Fallback to Polling', () => {
    it('falls back to polling after max reconnection attempts', () => {
      const pollingSpy = vi.spyOn(service as any, 'startPolling');
      
      service.connect();
      
      // Simulate max failed attempts
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(20);
        const ws = (service as any).ws;
        if (ws) {
          ws.close();
        }
        vi.advanceTimersByTime(Math.pow(2, i) * 1000);
      }
      
      expect(pollingSpy).toHaveBeenCalled();
      expect(service.getConnectionStatus()).toBe('polling');
    });

    it('polls for updates at regular intervals', async () => {
      const getLatestEventsSpy = vi.fn().mockResolvedValue([]);
      
      // Mock audit service
      vi.mock('@/services/audit', () => ({
        getLatestEvents: getLatestEventsSpy,
      }));
      
      (service as any).fallbackToPolling();
      
      // Advance time for multiple polling intervals (5 seconds each)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(5000);
        await Promise.resolve(); // Let promises resolve
      }
      
      expect(getLatestEventsSpy).toHaveBeenCalledTimes(3);
    });

    it('processes polled events same as WebSocket events', async () => {
      const subscriber = vi.fn();
      service.subscribe('test', subscriber);
      
      const mockEvents = [
        {
          id: 'audit-1',
          timestamp: new Date().toISOString(),
          actor: { id: 'user-1', name: 'User', email: 'user@test.com', role: 'User', type: 'user' },
          action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: 'Test' },
          target: { type: 'template', id: 'template-1' },
          metadata: { correlationId: 'corr-1' },
          status: 'success' as const,
        },
      ];
      
      vi.mock('@/services/audit', () => ({
        getLatestEvents: vi.fn().mockResolvedValue(mockEvents),
      }));
      
      (service as any).fallbackToPolling();
      
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      
      expect(subscriber).toHaveBeenCalledWith(mockEvents[0]);
    });
  });

  describe('Subscription Management', () => {
    it('handles multiple subscribers', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();
      const subscriber3 = vi.fn();
      
      service.subscribe('sub1', subscriber1);
      service.subscribe('sub2', subscriber2);
      service.subscribe('sub3', subscriber3);
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      const message: WebSocketMessage = {
        type: 'audit_event',
        payload: {
          event: {
            id: 'audit-1',
            timestamp: new Date().toISOString(),
            actor: { id: 'user-1', name: 'User', email: 'user@test.com', role: 'User', type: 'user' },
            action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: 'Test' },
            target: { type: 'template', id: 'template-1' },
            metadata: { correlationId: 'corr-1' },
            status: 'success',
          },
        },
        timestamp: new Date().toISOString(),
      };
      
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify(message),
        }));
      }
      
      expect(subscriber1).toHaveBeenCalled();
      expect(subscriber2).toHaveBeenCalled();
      expect(subscriber3).toHaveBeenCalled();
    });

    it('allows unsubscribing', () => {
      const subscriber = vi.fn();
      
      service.subscribe('test', subscriber);
      service.unsubscribe('test');
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      const message: WebSocketMessage = {
        type: 'audit_event',
        payload: {
          event: {
            id: 'audit-1',
            timestamp: new Date().toISOString(),
            actor: { id: 'user-1', name: 'User', email: 'user@test.com', role: 'User', type: 'user' },
            action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: 'Test' },
            target: { type: 'template', id: 'template-1' },
            metadata: { correlationId: 'corr-1' },
            status: 'success',
          },
        },
        timestamp: new Date().toISOString(),
      };
      
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify(message),
        }));
      }
      
      expect(subscriber).not.toHaveBeenCalled();
    });

    it('prevents duplicate subscriptions with same ID', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();
      
      service.subscribe('test', subscriber1);
      service.subscribe('test', subscriber2); // Should replace first subscription
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      const message: WebSocketMessage = {
        type: 'audit_event',
        payload: {
          event: {
            id: 'audit-1',
            timestamp: new Date().toISOString(),
            actor: { id: 'user-1', name: 'User', email: 'user@test.com', role: 'User', type: 'user' },
            action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: 'Test' },
            target: { type: 'template', id: 'template-1' },
            metadata: { correlationId: 'corr-1' },
            status: 'success',
          },
        },
        timestamp: new Date().toISOString(),
      };
      
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify(message),
        }));
      }
      
      expect(subscriber1).not.toHaveBeenCalled();
      expect(subscriber2).toHaveBeenCalled();
    });
  });

  describe('Connection Status', () => {
    it('reports correct connection status', () => {
      expect(service.getConnectionStatus()).toBe('disconnected');
      
      service.connect();
      expect(service.getConnectionStatus()).toBe('connecting');
      
      vi.advanceTimersByTime(20);
      expect(service.getConnectionStatus()).toBe('connected');
      
      service.disconnect();
      expect(service.getConnectionStatus()).toBe('disconnected');
    });

    it('updates status during reconnection', () => {
      service.connect();
      vi.advanceTimersByTime(20);
      expect(service.getConnectionStatus()).toBe('connected');
      
      // Simulate connection loss
      const ws = (service as any).ws;
      if (ws) {
        ws.close();
      }
      
      expect(service.getConnectionStatus()).toBe('reconnecting');
    });

    it('maintains event queue during disconnection', () => {
      service.connect();
      vi.advanceTimersByTime(20);
      
      // Add some events to queue
      const ws = (service as any).ws;
      for (let i = 0; i < 3; i++) {
        const message: WebSocketMessage = {
          type: 'audit_event',
          payload: {
            event: {
              id: `audit-${i}`,
              timestamp: new Date().toISOString(),
              actor: { id: 'user-1', name: 'User', email: 'user@test.com', role: 'User', type: 'user' },
              action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: 'Test' },
              target: { type: 'template', id: `template-${i}` },
              metadata: { correlationId: `corr-${i}` },
              status: 'success',
            },
          },
          timestamp: new Date().toISOString(),
        };
        
        if (ws && ws.onmessage) {
          ws.onmessage(new MessageEvent('message', {
            data: JSON.stringify(message),
          }));
        }
      }
      
      const queue = service.getEventQueue();
      expect(queue).toHaveLength(3);
      
      // Disconnect should preserve queue
      service.disconnect();
      expect(service.getEventQueue()).toHaveLength(3);
    });
  });

  describe('Error Recovery', () => {
    it('recovers from temporary network issues', () => {
      const connectSpy = vi.spyOn(service, 'connect');
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      // Simulate temporary network issue
      const ws = (service as any).ws;
      if (ws && ws.onerror) {
        ws.onerror(new Event('error'));
      }
      
      // Should attempt reconnection
      vi.advanceTimersByTime(1000);
      expect(connectSpy).toHaveBeenCalledTimes(2);
    });

    it('handles WebSocket close codes appropriately', () => {
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws = (service as any).ws;
      
      // Normal closure (1000) - should not reconnect
      if (ws && ws.onclose) {
        ws.onclose(new CloseEvent('close', { code: 1000 }));
      }
      
      expect(service.getConnectionStatus()).toBe('disconnected');
      
      // Abnormal closure (1006) - should reconnect
      service.connect();
      vi.advanceTimersByTime(20);
      
      const ws2 = (service as any).ws;
      if (ws2 && ws2.onclose) {
        ws2.onclose(new CloseEvent('close', { code: 1006 }));
      }
      
      expect(service.getConnectionStatus()).toBe('reconnecting');
    });

    it('clears resources on disconnect', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      service.connect();
      vi.advanceTimersByTime(20);
      
      service.disconnect();
      
      expect(clearIntervalSpy).toHaveBeenCalled(); // Ping interval
      expect(clearTimeoutSpy).toHaveBeenCalled(); // Batch timeout
    });
  });
});