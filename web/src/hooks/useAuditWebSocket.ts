import { useEffect, useState, useCallback, useRef } from 'react';
import type { AuditEntry } from '@/types/audit';
import {
  createAuditWebSocket,
  getAuditWebSocket,
  destroyAuditWebSocket,
  type WebSocketMessage,
  type ConnectionStatus,
  type WebSocketConfig,
} from '@/services/auditWebSocket';

export interface UseAuditWebSocketOptions {
  enabled?: boolean;
  url?: string;
  onNewEvents?: (events: AuditEntry[]) => void;
  autoScroll?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface UseAuditWebSocketReturn {
  status: ConnectionStatus;
  isConnected: boolean;
  newEventCount: number;
  lastEventTime: Date | null;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  clearNewEventCount: () => void;
  toggleAutoScroll: () => void;
  autoScrollEnabled: boolean;
}

export function useAuditWebSocket(options: UseAuditWebSocketOptions = {}): UseAuditWebSocketReturn {
  const {
    enabled = true,
    url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/audit`,
    onNewEvents,
    autoScroll: initialAutoScroll = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [newEventCount, setNewEventCount] = useState(0);
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(initialAutoScroll);
  const wsRef = useRef<ReturnType<typeof createAuditWebSocket> | null>(null);
  const cleanupRef = useRef<{ message?: () => void; status?: () => void }>({});

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const config: WebSocketConfig = {
      url,
      reconnectAttempts,
      reconnectDelay,
      enablePolling: true,
      pollingInterval: 5000,
      pingInterval: 30000,
    };

    // Create or get existing WebSocket instance
    wsRef.current = getAuditWebSocket() || createAuditWebSocket(config);

    // Set up event handlers
    cleanupRef.current.message = wsRef.current.onMessage((message: WebSocketMessage) => {
      if (message.type === 'audit_event' && message.payload) {
        const events = message.payload.isBatch 
          ? message.payload.events 
          : [message.payload.event];

        if (events && events.length > 0) {
          setNewEventCount(prev => prev + events.length);
          setLastEventTime(new Date());

          if (onNewEvents) {
            onNewEvents(events);
          }

          // Auto-scroll if enabled
          if (autoScrollEnabled) {
            requestAnimationFrame(() => {
              const tableContainer = document.querySelector('[role="region"][aria-label="Audit napló"] .virtualScrollContainer');
              if (tableContainer) {
                tableContainer.scrollTop = 0;
              }
            });
          }
        }
      }
    });

    cleanupRef.current.status = wsRef.current.onStatusChange((newStatus: ConnectionStatus) => {
      setStatus(newStatus);
    });

    // Connect if not already connected
    if (!wsRef.current.isConnected()) {
      wsRef.current.connect();
    }

    return () => {
      // Clean up event handlers
      if (cleanupRef.current.message) {
        cleanupRef.current.message();
      }
      if (cleanupRef.current.status) {
        cleanupRef.current.status();
      }
    };
  }, [enabled, url, onNewEvents, autoScrollEnabled, reconnectAttempts, reconnectDelay]);

  const connect = useCallback(() => {
    if (wsRef.current && !wsRef.current.isConnected()) {
      wsRef.current.connect();
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect();
    }
  }, []);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.reconnect();
    }
  }, []);

  const clearNewEventCount = useCallback(() => {
    setNewEventCount(0);
  }, []);

  const toggleAutoScroll = useCallback(() => {
    setAutoScrollEnabled(prev => !prev);
  }, []);

  return {
    status,
    isConnected: status === 'connected',
    newEventCount,
    lastEventTime,
    connect,
    disconnect,
    reconnect,
    clearNewEventCount,
    toggleAutoScroll,
    autoScrollEnabled,
  };
}

export default useAuditWebSocket;