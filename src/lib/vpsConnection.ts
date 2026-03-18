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

// Protocol type bytes — raw values, mapped to wire format via cmdByte()/msgType()
const MSG_OUTPUT = 0;
const MSG_SET_TITLE = 1;
const MSG_SET_PREFS = 2;

const CMD_INPUT = 0;
const CMD_RESIZE = 1;

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
  private authToken = '';
  private authenticated = false;
  private pendingResize: { cols: number; rows: number } | null = null;
  private lastKnownSize: { cols: number; rows: number } | null = null;
  // ttyd protocol auto-detection: newer versions (>=1.7) use ASCII chars ('0'=0x30),
  // older versions use raw byte values (0x00). null = not yet detected.
  private asciiProtocol: boolean | null = null;

  get state() { return this._state; }

  constructor(options: VPSConnectionOptions) {
    this.options = options;
  }

  async connect() {
    this.intentionalClose = false;
    this.authenticated = false;
    this.asciiProtocol = null;
    this.cleanup();
    this.setState('connecting');

    try {
      this.authToken = '';
      this.openWebSocket();
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : 'Failed to connect');
      this.scheduleReconnect();
    }
  }

  private openWebSocket() {
    if (this.intentionalClose) return;

    const wsUrl = this.buildWsUrl(this.options.url);
    this.ws = new WebSocket(wsUrl, ['tty']);
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
      this.sendAuth();
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Detect protocol version from first binary message's type byte
        if (this.asciiProtocol === null) {
          const firstByte = new Uint8Array(event.data)[0];
          // ttyd >=1.7 sends '0' (0x30=48), older sends 0x00
          this.asciiProtocol = firstByte >= 0x30 && firstByte <= 0x39;
        }
        if (!this.authenticated) {
          this.onAuthenticated();
        }
        this.handleBinaryMessage(event.data);
      } else if (typeof event.data === 'string') {
        if (!this.authenticated) {
          this.onAuthenticated();
        }
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
  }

  private sendAuth() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const authPayload = JSON.stringify({ AuthToken: this.authToken });
    this.ws.send(authPayload);
  }

  disconnect() {
    this.intentionalClose = true;
    this.cleanup();
    this.setState('disconnected');
  }

  /** Convert a raw command type (0, 1) to the wire byte based on detected protocol. */
  private cmdByte(type: number): number {
    return this.asciiProtocol ? type + 0x30 : type;
  }

  /** Normalize a received wire byte to a raw type (0, 1, 2) for internal handling. */
  private normalizeMsg(wireByte: number): number {
    return this.asciiProtocol ? wireByte - 0x30 : wireByte;
  }

  send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = this.textEncoder.encode(data);
      const msg = new Uint8Array(payload.length + 1);
      msg[0] = this.cmdByte(CMD_INPUT);
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
      this.lastKnownSize = { cols, rows };
      const json = JSON.stringify({ columns: cols, rows });
      const payload = this.textEncoder.encode(json);
      const msg = new Uint8Array(payload.length + 1);
      msg[0] = this.cmdByte(CMD_RESIZE);
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

  private handleBinaryMessage(buffer: ArrayBuffer) {
    const data = new Uint8Array(buffer);
    if (data.length === 0) return;

    const msgType = this.normalizeMsg(data[0]);
    const payload = data.slice(1);

    // Measure latency from the last ping to the next server response
    if (this.lastPingTime > 0) {
      const latency = Math.round(performance.now() - this.lastPingTime);
      this.lastPingTime = 0;
      this.options.onLatencyUpdate(latency);
    }

    switch (msgType) {
      case MSG_OUTPUT:
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
        break;
      default:
        if (data.length > 0) {
          this.options.onData(this.textDecoder.decode(data));
        }
        break;
    }
  }

  private onAuthenticated() {
    this.authenticated = true;
    this.setState('connected');
    this.startPing();
    if (this.pendingResize) {
      this.doSendResize(this.pendingResize.cols, this.pendingResize.rows);
      this.pendingResize = null;
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

  /** Keep the WebSocket alive by re-sending the current terminal size (harmless no-op). */
  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN && this.lastKnownSize) {
        this.lastPingTime = performance.now();
        this.doSendResize(this.lastKnownSize.cols, this.lastKnownSize.rows);
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
