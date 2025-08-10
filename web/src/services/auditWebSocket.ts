import type { AuditEntry, AuditFilter } from '@/types/audit';

export interface WebSocketMessage {
  type: 'connected' | 'audit_event' | 'error' | 'ping' | 'pong' | 'reconnecting';
  payload?: any;
  timestamp: string;
}

export interface AuditEventMessage extends WebSocketMessage {
  type: 'audit_event';
  payload: {
    event: AuditEntry;
    affectedFilters?: AuditFilter;
  };
}

export interface WebSocketConfig {
  url: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  pingInterval?: number;
  enablePolling?: boolean;
  pollingInterval?: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

export type WebSocketEventHandler = (message: WebSocketMessage) => void;
export type ConnectionStatusHandler = (status: ConnectionStatus) => void;

class AuditWebSocketService {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private reconnectAttempts = 0;
  private reconnectDelay: number;
  private pingInterval: NodeJS.Timeout | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private eventHandlers: Set<WebSocketEventHandler> = new Set();
  private statusHandlers: Set<ConnectionStatusHandler> = new Set();
  private currentStatus: ConnectionStatus = 'disconnected';
  private isIntentionallyClosed = false;
  private messageQueue: AuditEventMessage[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private lastEventTimestamp: string | null = null;

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      reconnectAttempts: config.reconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 1000,
      pingInterval: config.pingInterval ?? 30000,
      enablePolling: config.enablePolling ?? true,
      pollingInterval: config.pollingInterval ?? 5000,
    };
    this.reconnectDelay = this.config.reconnectDelay;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.isIntentionallyClosed = false;
    this.updateStatus('connecting');

    try {
      const wsUrl = this.config.url.replace('http://', 'ws://').replace('https://', 'wss://');
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.updateStatus('error');
      this.fallbackToPolling();
    }
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.cleanup();
    this.updateStatus('disconnected');
  }

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.updateStatus('connected');
    this.reconnectAttempts = 0;
    this.reconnectDelay = this.config.reconnectDelay;
    this.startPingInterval();
    
    // Send initial subscription message if needed
    this.send({
      type: 'subscribe',
      payload: {
        timestamp: this.lastEventTimestamp,
      },
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      if (message.type === 'pong') {
        // Handle pong response
        return;
      }

      if (message.type === 'audit_event') {
        const auditMessage = message as AuditEventMessage;
        this.lastEventTimestamp = auditMessage.payload.event.timestamp;
        this.queueMessage(auditMessage);
      } else {
        this.notifyEventHandlers(message);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleError(error: Event): void {
    console.error('WebSocket error:', error);
    this.updateStatus('error');
  }

  private handleClose(): void {
    console.log('WebSocket closed');
    this.stopPingInterval();

    if (!this.isIntentionallyClosed) {
      this.updateStatus('reconnecting');
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.config.reconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.config.reconnectAttempts}`);
      
      setTimeout(() => {
        if (!this.isIntentionallyClosed) {
          this.connect();
        }
      }, this.reconnectDelay);

      // Exponential backoff with max 30 seconds
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    } else {
      console.log('Max reconnection attempts reached, falling back to polling');
      this.updateStatus('disconnected');
      this.fallbackToPolling();
    }
  }

  private fallbackToPolling(): void {
    if (!this.config.enablePolling || this.pollingInterval) {
      return;
    }

    console.log('Starting polling fallback');
    this.pollingInterval = setInterval(async () => {
      try {
        const response = await fetch(`${this.config.url.replace(/\/ws.*/, '')}/api/audit/logs/latest`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.entries && data.entries.length > 0) {
            data.entries.forEach((event: AuditEntry) => {
              if (!this.lastEventTimestamp || event.timestamp > this.lastEventTimestamp) {
                this.queueMessage({
                  type: 'audit_event',
                  payload: { event },
                  timestamp: new Date().toISOString(),
                });
                this.lastEventTimestamp = event.timestamp;
              }
            });
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, this.config.pollingInterval);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({
          type: 'ping',
          timestamp: new Date().toISOString(),
        });
      }
    }, this.config.pingInterval);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private queueMessage(message: AuditEventMessage): void {
    this.messageQueue.push(message);

    // Clear existing batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Process batch after 100ms or when queue reaches 10 messages
    if (this.messageQueue.length >= 10) {
      this.processBatch();
    } else {
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, 100);
    }
  }

  private processBatch(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    const batch = [...this.messageQueue];
    this.messageQueue = [];

    // Notify handlers with batched events
    const batchMessage: WebSocketMessage = {
      type: 'audit_event',
      payload: {
        events: batch.map(m => m.payload.event),
        isBatch: true,
      },
      timestamp: new Date().toISOString(),
    };

    this.notifyEventHandlers(batchMessage);
  }

  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private updateStatus(status: ConnectionStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.notifyStatusHandlers(status);
    }
  }

  private notifyEventHandlers(message: WebSocketMessage): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    });
  }

  private notifyStatusHandlers(status: ConnectionStatus): void {
    this.statusHandlers.forEach(handler => {
      try {
        handler(status);
      } catch (error) {
        console.error('Error in status handler:', error);
      }
    });
  }

  private cleanup(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.stopPingInterval();

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    this.messageQueue = [];
  }

  // Public API
  onMessage(handler: WebSocketEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  onStatusChange(handler: ConnectionStatusHandler): () => void {
    this.statusHandlers.add(handler);
    // Immediately notify of current status
    handler(this.currentStatus);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  getStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  isConnected(): boolean {
    return this.currentStatus === 'connected';
  }

  reconnect(): void {
    this.disconnect();
    setTimeout(() => {
      this.connect();
    }, 100);
  }
}

// Singleton instance
let instance: AuditWebSocketService | null = null;

export function createAuditWebSocket(config: WebSocketConfig): AuditWebSocketService {
  if (!instance) {
    instance = new AuditWebSocketService(config);
  }
  return instance;
}

export function getAuditWebSocket(): AuditWebSocketService | null {
  return instance;
}

export function destroyAuditWebSocket(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}

export default AuditWebSocketService;