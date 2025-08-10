import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AuditWebSocketService, {
  createAuditWebSocket,
  getAuditWebSocket,
  destroyAuditWebSocket,
  type WebSocketConfig,
  type ConnectionStatus,
} from '../auditWebSocket';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string): void {
    // Mock send
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new Event('close'));
    }
  }
}

// @ts-ignore
global.WebSocket = MockWebSocket as any;

// Mock fetch
global.fetch = vi.fn();

describe('AuditWebSocketService', () => {
  let service: AuditWebSocketService;
  const config: WebSocketConfig = {
    url: 'ws://localhost:3000/ws/audit',
    reconnectAttempts: 3,
    reconnectDelay: 100,
    pingInterval: 1000,
    enablePolling: true,
    pollingInterval: 500,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    destroyAuditWebSocket();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (service) {
      service.disconnect();
    }
    destroyAuditWebSocket();
  });

  describe('Connection Management', () => {
    it('should create WebSocket connection', () => {
      service = new AuditWebSocketService(config);
      service.connect();

      expect(service.getStatus()).toBe('connecting');
    });

    it('should update status to connected when WebSocket opens', async () => {
      service = new AuditWebSocketService(config);
      const statusHandler = vi.fn();
      
      service.onStatusChange(statusHandler);
      service.connect();

      // Wait for connection to open
      await vi.advanceTimersByTimeAsync(20);

      expect(statusHandler).toHaveBeenCalledWith('connecting');
      expect(statusHandler).toHaveBeenCalledWith('connected');
      expect(service.isConnected()).toBe(true);
    });

    it('should disconnect and update status', () => {
      service = new AuditWebSocketService(config);
      service.connect();
      
      service.disconnect();
      
      expect(service.getStatus()).toBe('disconnected');
      expect(service.isConnected()).toBe(false);
    });

    it('should handle reconnection', async () => {
      service = new AuditWebSocketService(config);
      service.connect();
      
      await vi.advanceTimersByTimeAsync(20);
      
      service.reconnect();
      
      await vi.advanceTimersByTimeAsync(120);
      
      expect(service.getStatus()).toBe('connecting');
    });
  });

  describe('Message Handling', () => {
    it('should handle audit event messages', async () => {
      service = new AuditWebSocketService(config);
      const messageHandler = vi.fn();
      
      service.onMessage(messageHandler);
      service.connect();
      
      await vi.advanceTimersByTimeAsync(20);

      // Simulate receiving a message
      const ws = (service as any).ws as MockWebSocket;
      const auditEvent = {
        type: 'audit_event',
        payload: {
          event: {
            id: '1',
            timestamp: '2025-08-10T10:00:00Z',
            actor: { id: 'user1', name: 'User 1', email: 'user1@example.com', role: 'Admin', type: 'user' },
            action: { type: 'CREATE', category: 'template', severity: 'info', description: 'Created template' },
            target: { type: 'template', id: 'tmpl1' },
            metadata: { correlationId: 'corr1' },
            status: 'success',
          },
        },
        timestamp: '2025-08-10T10:00:00Z',
      };

      if (ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify(auditEvent),
        }));
      }

      // Wait for batch processing
      await vi.advanceTimersByTimeAsync(150);

      expect(messageHandler).toHaveBeenCalled();
    });

    it('should batch multiple messages', async () => {
      service = new AuditWebSocketService(config);
      const messageHandler = vi.fn();
      
      service.onMessage(messageHandler);
      service.connect();
      
      await vi.advanceTimersByTimeAsync(20);

      const ws = (service as any).ws as MockWebSocket;

      // Send multiple messages quickly
      for (let i = 0; i < 5; i++) {
        const auditEvent = {
          type: 'audit_event',
          payload: {
            event: {
              id: `${i}`,
              timestamp: `2025-08-10T10:0${i}:00Z`,
              actor: { id: 'user1', name: 'User 1', email: 'user1@example.com', role: 'Admin', type: 'user' },
              action: { type: 'CREATE', category: 'template', severity: 'info', description: 'Created template' },
              target: { type: 'template', id: `tmpl${i}` },
              metadata: { correlationId: `corr${i}` },
              status: 'success',
            },
          },
          timestamp: `2025-08-10T10:0${i}:00Z`,
        };

        if (ws.onmessage) {
          ws.onmessage(new MessageEvent('message', {
            data: JSON.stringify(auditEvent),
          }));
        }
      }

      // Wait for batch processing
      await vi.advanceTimersByTimeAsync(150);

      // Should receive batched events
      expect(messageHandler).toHaveBeenCalledTimes(1);
      const call = messageHandler.mock.calls[0][0];
      expect(call.payload.isBatch).toBe(true);
      expect(call.payload.events).toHaveLength(5);
    });
  });

  describe('Reconnection Logic', () => {
    it('should attempt reconnection on connection loss', async () => {
      service = new AuditWebSocketService({
        ...config,
        reconnectDelay: 100,
        reconnectAttempts: 3,
      });
      
      const statusHandler = vi.fn();
      service.onStatusChange(statusHandler);
      service.connect();
      
      await vi.advanceTimersByTimeAsync(20);
      expect(service.isConnected()).toBe(true);

      // Simulate connection loss
      const ws = (service as any).ws as MockWebSocket;
      ws.close();

      expect(statusHandler).toHaveBeenCalledWith('reconnecting');

      // Wait for reconnection attempt
      await vi.advanceTimersByTimeAsync(150);

      // Should have attempted to reconnect
      expect(statusHandler).toHaveBeenCalledWith('connecting');
    });

    it('should use exponential backoff for reconnection', async () => {
      service = new AuditWebSocketService({
        ...config,
        reconnectDelay: 100,
        reconnectAttempts: 3,
      });
      
      service.connect();
      await vi.advanceTimersByTimeAsync(20);

      // First reconnection attempt
      let ws = (service as any).ws as MockWebSocket;
      ws.close();
      await vi.advanceTimersByTimeAsync(100); // First delay

      // Second reconnection attempt - should wait 200ms
      ws = (service as any).ws as MockWebSocket;
      ws.close();
      await vi.advanceTimersByTimeAsync(200); // Second delay (doubled)

      // Third reconnection attempt - should wait 400ms
      ws = (service as any).ws as MockWebSocket;
      ws.close();
      await vi.advanceTimersByTimeAsync(400); // Third delay (doubled again)

      expect((service as any).reconnectAttempts).toBe(3);
    });

    it('should fall back to polling after max reconnection attempts', async () => {
      const fetchMock = vi.mocked(global.fetch);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ entries: [] }),
      } as Response);

      service = new AuditWebSocketService({
        ...config,
        reconnectAttempts: 1,
        reconnectDelay: 50,
        pollingInterval: 200,
      });
      
      service.connect();
      await vi.advanceTimersByTimeAsync(20);

      // Close connection to trigger reconnection
      let ws = (service as any).ws as MockWebSocket;
      ws.close();

      // Wait for reconnection attempt
      await vi.advanceTimersByTimeAsync(60);

      // Close again to exceed max attempts
      ws = (service as any).ws as MockWebSocket;
      ws.close();

      // Wait for fallback to polling
      await vi.advanceTimersByTimeAsync(100);

      // Should start polling
      await vi.advanceTimersByTimeAsync(250);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/audit/logs/latest'),
        expect.any(Object)
      );
    });
  });

  describe('Polling Fallback', () => {
    it('should poll for updates when WebSocket fails', async () => {
      const fetchMock = vi.mocked(global.fetch);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          entries: [
            {
              id: '1',
              timestamp: '2025-08-10T10:00:00Z',
              actor: { id: 'user1', name: 'User 1', email: 'user1@example.com', role: 'Admin', type: 'user' },
              action: { type: 'CREATE', category: 'template', severity: 'info', description: 'Created template' },
              target: { type: 'template', id: 'tmpl1' },
              metadata: { correlationId: 'corr1' },
              status: 'success',
            },
          ],
        }),
      } as Response);

      service = new AuditWebSocketService({
        ...config,
        reconnectAttempts: 0, // No reconnection attempts
        pollingInterval: 200,
      });

      const messageHandler = vi.fn();
      service.onMessage(messageHandler);
      
      service.connect();
      await vi.advanceTimersByTimeAsync(20);

      // Close connection to trigger immediate fallback
      const ws = (service as any).ws as MockWebSocket;
      ws.close();

      // Wait for polling to start
      await vi.advanceTimersByTimeAsync(250);

      expect(fetchMock).toHaveBeenCalled();
      expect(messageHandler).toHaveBeenCalled();
    });
  });

  describe('Singleton Management', () => {
    it('should create singleton instance', () => {
      const instance1 = createAuditWebSocket(config);
      const instance2 = createAuditWebSocket(config);
      
      expect(instance1).toBe(instance2);
    });

    it('should get existing instance', () => {
      const created = createAuditWebSocket(config);
      const retrieved = getAuditWebSocket();
      
      expect(retrieved).toBe(created);
    });

    it('should destroy instance', () => {
      createAuditWebSocket(config);
      destroyAuditWebSocket();
      
      const retrieved = getAuditWebSocket();
      expect(retrieved).toBeNull();
    });
  });

  describe('Event Handlers', () => {
    it('should add and remove message handlers', () => {
      service = new AuditWebSocketService(config);
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      const unsubscribe1 = service.onMessage(handler1);
      const unsubscribe2 = service.onMessage(handler2);
      
      // Both handlers should be called
      (service as any).notifyEventHandlers({ type: 'test', timestamp: '2025-08-10' });
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      
      // Remove first handler
      unsubscribe1();
      
      // Only second handler should be called
      (service as any).notifyEventHandlers({ type: 'test', timestamp: '2025-08-10' });
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(2);
    });

    it('should add and remove status handlers', () => {
      service = new AuditWebSocketService(config);
      const handler = vi.fn();
      
      const unsubscribe = service.onStatusChange(handler);
      
      // Should be called immediately with current status
      expect(handler).toHaveBeenCalledWith('disconnected');
      
      service.connect();
      expect(handler).toHaveBeenCalledWith('connecting');
      
      unsubscribe();
      
      // Should not be called after unsubscribe
      service.disconnect();
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});