export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

interface VPSConnectionOptions {
  url: string;
  onData: (data: string) => void;
  onStateChange: (state: ConnectionState, detail?: string) => void;
  onLatencyUpdate: (ms: number) => void;
  onTitleChange?: (title: string) => void;
}

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const PING_INTERVAL = 30000;

const MSG_OUTPUT = 0;
const MSG_SET_TITLE = 1;
const MSG_SET_PREFS = 2;
const MSG_SET_RECONNECT = 3;
const MSG_OUTPUT_SYNC = 4;

const CMD_INPUT = 0;
const CMD_RESIZE = 1;
const CMD_PAUSE = 2;
const CMD_RESUME = 3;
const CMD_JSON_DATA = 4;

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
  private textEncoder = new TextEncoder();
  private textDecoder = new TextDecoder();
  private authenticated = false;
  private pendingResize: { cols: number; rows: number } | null = null;

  get state() { return this._state; }

  constructor(options: VPSConnectionOptions) {
    this.options = options;
  }

  connect() {
    this.intentionalClose = false;
    this.authenticated = false;
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
          this.handleBinaryMessage(event.data);
        } else if (typeof event.data === 'string') {
          this.handleTextMessage(event.data);
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
      const payload = this.textEncoder.encode(data);
      const msg = new Uint8Array(payload.length + 1);
      msg[0] = CMD_INPUT;
      msg.set(payload, 1);
      this.ws.send(msg.buffer);
    }
  }

  sendResize(cols: number, rows: number) {
    if (!this.authenticated) {
      this.pendingResize = { cols, rows };
      return;
    }
    this.doSendResize(cols, rows);
  }

  private doSendResize(cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const json = JSON.stringify({ columns: cols, rows });
      const payload = this.textEncoder.encode(json);
      const msg = new Uint8Array(payload.length + 1);
      msg[0] = CMD_RESIZE;
      msg.set(payload, 1);
      this.ws.send(msg.buffer);
    }
  }

  reconnectNow() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  private sendAuthToken(token: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const json = JSON.stringify({ AuthToken: token });
    const payload = this.textEncoder.encode(json);
    const msg = new Uint8Array(payload.length + 1);
    msg[0] = CMD_JSON_DATA;
    msg.set(payload, 1);
    this.ws.send(msg.buffer);
  }

  private handleTextMessage(text: string) {
    this.options.onData(text);
  }

  private handleBinaryMessage(buffer: ArrayBuffer) {
    const data = new Uint8Array(buffer);
    if (data.length === 0) return;

    const msgType = data[0];
    const payload = data.slice(1);

    switch (msgType) {
      case MSG_OUTPUT:
        if (!this.authenticated) {
          this.authenticated = true;
          this.sendAuthToken('');
          if (this.pendingResize) {
            this.doSendResize(this.pendingResize.cols, this.pendingResize.rows);
            this.pendingResize = null;
          }
        }
        if (payload.length > 0) {
          this.options.onData(this.textDecoder.decode(payload));
        }
        break;
      case MSG_SET_TITLE: {
        const title = this.textDecoder.decode(payload);
        this.options.onTitleChange?.(title);
        break;
      }
      case MSG_SET_PREFS:
        if (!this.authenticated) {
          this.authenticated = true;
          this.sendAuthToken('');
          if (this.pendingResize) {
            this.doSendResize(this.pendingResize.cols, this.pendingResize.rows);
            this.pendingResize = null;
          }
        }
        break;
      case MSG_SET_RECONNECT:
        break;
      case MSG_OUTPUT_SYNC:
        if (payload.length > 0) {
          this.options.onData(this.textDecoder.decode(payload));
        }
        this.sendAck();
        break;
      default:
        if (payload.length > 0) {
          this.options.onData(this.textDecoder.decode(data));
        }
        break;
    }
  }

  private sendAck() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg = new Uint8Array([CMD_RESUME]);
      this.ws.send(msg.buffer);
    }
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
        const msg = new Uint8Array([CMD_PAUSE]);
        this.ws.send(msg.buffer);
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
