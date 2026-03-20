import type { WSMessage } from '@vardko/shared';
import {
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from '@vardko/shared';

type WSMessageType = WSMessage['type'];

type MessageHandler<T extends WSMessageType = WSMessageType> = (
  data: Extract<WSMessage, { type: T }>['data'],
) => void;

interface QueueWebSocketOptions {
  /** Override base reconnect delay (ms). Default 1 000. */
  baseDelay?: number;
  /** Override max reconnect delay (ms). Default 30 000. */
  maxDelay?: number;
}

/**
 * Managed WebSocket client for the VårdKö queue system.
 *
 * Features:
 * - Automatic reconnection with exponential back-off
 * - Heartbeat / pong handling
 * - Type-safe event emitter for each WSMessage type
 *
 * Usage:
 * ```ts
 * const ws = new QueueWebSocket();
 * ws.on('QUEUE_UPDATE', (data) => { ... });
 * ws.on('YOUR_TURN', (data) => { ... });
 * ws.connect('wss://api.vardko.se/api/v1/ws/patient/abc123');
 * ```
 */
export class QueueWebSocket {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private listeners = new Map<WSMessageType, Set<MessageHandler>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private baseDelay: number;
  private maxDelay: number;

  constructor(options?: QueueWebSocketOptions) {
    this.baseDelay = options?.baseDelay ?? RECONNECT_BASE_DELAY_MS;
    this.maxDelay = options?.maxDelay ?? RECONNECT_MAX_DELAY_MS;
  }

  // ── public API ─────────────────────────────────────────────────────

  connect(url: string): void {
    this.url = url;
    this.intentionalClose = false;
    this.open();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnect();
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to a specific message type.
   * Returns an unsubscribe function.
   */
  on<T extends WSMessageType>(
    type: T,
    handler: (data: Extract<WSMessage, { type: T }>['data']) => void,
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler as MessageHandler);
    return () => { set!.delete(handler as MessageHandler); };
  }

  /**
   * Remove all listeners, optionally filtered by type.
   */
  off(type?: WSMessageType): void {
    if (type) {
      this.listeners.delete(type);
    } else {
      this.listeners.clear();
    }
  }

  // ── internals ──────────────────────────────────────────────────────

  private open(): void {
    if (!this.url) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnection is handled there
    };
  }

  private handleMessage(event: MessageEvent): void {
    let msg: WSMessage;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
    } catch {
      return;
    }

    // Respond to server heartbeat
    if (msg.type === 'HEARTBEAT') {
      // Send a pong-like acknowledgement so the server knows we're alive.
      // The native WebSocket pong frame is handled automatically by the
      // browser, but we also echo the heartbeat back as an application-level
      // message in case the server uses it.
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'HEARTBEAT', data: {} }));
      }
    }

    const handlers = this.listeners.get(msg.type);
    if (handlers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (msg as any).data;
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[QueueWebSocket] handler error for ${msg.type}:`, err);
        }
      }
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempt),
      this.maxDelay,
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
