export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

interface VPSConnectionOptions {
  url: string;
  onData: (data: string) => void;
  onStateChange: (state: ConnectionState, detail?: string) => void;
  onLatencyUpdate: (ms: number) => void;
}

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const PING_INTERVAL = 5000;

export class VPSConnection {
  private ws: WebSocket | null = null;
  private options: VPSConnectionOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private lastPingTime = 0;
  private _state: ConnectionState = 'disconnected';

  get state() { return this._state; }

  constructor(options: VPSConnectionOptions) {
    this.options = options;
  }

  connect() {
    this.intentionalClose = false;
    this.cleanup();
    this.setState('connecting');

    try {
      const wsUrl = this.buildWsUrl(this.options.url);
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        if (this._state === 'connecting') {
          this.ws?.close();
          this.setState('error', 'Connection timed out');
          this.scheduleReconnect();
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.reconnectDelay = INITIAL_RECONNECT_DELAY;
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(event.data);
          this.options.onData(text);
        } else {
          this.options.onData(event.data);
        }
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        this.stopPing();
        if (!this.intentionalClose) {
          this.setState('error', `Connection closed (code ${event.code})`);
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        if (this._state !== 'error') {
          this.setState('error', 'Connection failed');
        }
      };
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : 'Failed to connect');
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.intentionalClose = true;
    this.cleanup();
    this.setState('disconnected');
  }

  send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendResize(cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  reconnectNow() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  private buildWsUrl(url: string): string {
    let wsUrl = url.trim();
    if (wsUrl.startsWith('http://')) {
      wsUrl = 'ws://' + wsUrl.slice(7);
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = 'wss://' + wsUrl.slice(8);
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = 'wss://' + wsUrl;
    }
    if (!wsUrl.includes('/ws')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
    }
    return wsUrl;
  }

  private setState(state: ConnectionState, detail?: string) {
    this._state = state;
    this.options.onStateChange(state, detail);
  }

  private scheduleReconnect() {
    if (this.intentionalClose) return;
    this.reconnectAttempts++;
    this.setState('reconnecting', `Attempt ${this.reconnectAttempts} in ${Math.round(this.reconnectDelay / 1000)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingTime = performance.now();
        this.ws.send('');
        requestAnimationFrame(() => {
          const latency = Math.round(performance.now() - this.lastPingTime);
          this.options.onLatencyUpdate(latency);
        });
      }
    }, PING_INTERVAL);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanup() {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  destroy() {
    this.intentionalClose = true;
    this.cleanup();
  }
}
