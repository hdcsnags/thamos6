import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { vpsTerminalTheme } from '../../lib/vpsTheme';
import { VPSConnection, type ConnectionState } from '../../lib/vpsConnection';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { palette, typography } from '../../design-system/tokens';

interface VPSConfig {
  id: string;
  name: string;
  vps_url: string;
  hostname: string;
}

export function DesktopVPSTerminal() {
  const { user } = useAuth();
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectionRef = useRef<VPSConnection | null>(null);

  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [stateDetail, setStateDetail] = useState('');
  const [latency, setLatency] = useState(0);
  const [termSize, setTermSize] = useState({ cols: 80, rows: 24 });
  const [vpsConfig, setVpsConfig] = useState<VPSConfig | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoadingConfig(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('user_vps_connections')
        .select('id, name, vps_url, hostname')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle();
      if (data) {
        setVpsConfig(data);
        setUrlInput(data.vps_url);
      }
      setLoadingConfig(false);
    })();
  }, [user]);

  const initTerminal = useCallback(() => {
    if (!termRef.current || terminalRef.current) return;

    const term = new Terminal({
      theme: vpsTerminalTheme,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(termRef.current);

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available, canvas renderer used
    }

    fitAddon.fit();
    setTermSize({ cols: term.cols, rows: term.rows });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cleanup = initTerminal();
    return cleanup;
  }, [initTerminal]);

  useEffect(() => {
    if (!termRef.current) return;
    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit();
          const cols = terminalRef.current.cols;
          const rows = terminalRef.current.rows;
          setTermSize({ cols, rows });
          connectionRef.current?.sendResize(cols, rows);
        } catch {
          // ignore resize errors during unmount
        }
      }
    });
    observer.observe(termRef.current);
    return () => observer.disconnect();
  }, []);

  const handleConnect = useCallback((url: string) => {
    if (!terminalRef.current || !url.trim()) return;

    connectionRef.current?.destroy();

    const term = terminalRef.current;
    term.clear();
    term.writeln('\x1b[36m[ThamOS] Connecting to VPS...\x1b[0m');

    const conn = new VPSConnection({
      url,
      onData: (data) => term.write(data),
      onStateChange: (state, detail) => {
        setConnState(state);
        setStateDetail(detail || '');
        if (state === 'connected') {
          term.writeln('\x1b[32m[ThamOS] Connected.\x1b[0m');
          conn.sendResize(term.cols, term.rows);
        } else if (state === 'error') {
          term.writeln(`\x1b[31m[ThamOS] ${detail || 'Connection error'}\x1b[0m`);
        } else if (state === 'reconnecting') {
          term.writeln(`\x1b[33m[ThamOS] ${detail || 'Reconnecting...'}\x1b[0m`);
        }
      },
      onLatencyUpdate: setLatency,
    });

    term.onData((data) => conn.send(data));

    connectionRef.current = conn;
    conn.connect();
  }, []);

  const handleDisconnect = useCallback(() => {
    connectionRef.current?.disconnect();
    terminalRef.current?.writeln('\x1b[33m[ThamOS] Disconnected.\x1b[0m');
  }, []);

  const handleSaveAndConnect = useCallback(async () => {
    const url = urlInput.trim();
    if (!url || !user) return;

    if (vpsConfig) {
      await supabase
        .from('user_vps_connections')
        .update({ vps_url: url, updated_at: new Date().toISOString() })
        .eq('id', vpsConfig.id);
      setVpsConfig({ ...vpsConfig, vps_url: url });
    } else {
      const { data } = await supabase
        .from('user_vps_connections')
        .insert({ user_id: user.id, name: 'Primary VPS', vps_url: url, hostname: '', is_default: true })
        .select('id, name, vps_url, hostname')
        .maybeSingle();
      if (data) setVpsConfig(data);
    }
    handleConnect(url);
  }, [urlInput, user, vpsConfig, handleConnect]);

  useEffect(() => {
    return () => {
      connectionRef.current?.destroy();
    };
  }, []);

  const isConnected = connState === 'connected';
  const isConnecting = connState === 'connecting' || connState === 'reconnecting';

  const statusColor = (() => {
    switch (connState) {
      case 'connected': return palette.green;
      case 'connecting':
      case 'reconnecting': return palette.amber;
      case 'error': return palette.rose;
      default: return palette.textDisabled;
    }
  })();

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: '#060610', color: palette.textTertiary }}>
        <span style={{ fontSize: '12px', fontFamily: typography.mono }}>Sign in to access VPS Terminal</span>
      </div>
    );
  }

  if (loadingConfig) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: '#060610' }}>
        <span style={{ fontSize: '12px', fontFamily: typography.mono, color: palette.textDisabled }}>Loading...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#060610' }}>
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{
          backgroundColor: palette.elevated,
          borderBottom: `1px solid ${isConnected ? palette.amber + '40' : palette.borderSubtle}`,
          fontFamily: typography.mono,
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: isConnected ? palette.amber + '20' : palette.textDisabled + '15',
              color: isConnected ? palette.amber : palette.textDisabled,
              border: `1px solid ${isConnected ? palette.amber + '40' : palette.textDisabled + '20'}`,
            }}
          >
            LIVE
          </span>

          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: statusColor,
                boxShadow: isConnected ? `0 0 6px ${statusColor}60` : 'none',
                animation: isConnecting ? 'pulse 1.5s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: '10px', color: statusColor }}>
              {connState === 'disconnected' ? 'DISCONNECTED' :
               connState === 'connecting' ? 'CONNECTING' :
               connState === 'connected' ? 'CONNECTED' :
               connState === 'reconnecting' ? 'RECONNECTING' :
               'ERROR'}
            </span>
          </div>

          {isConnected && vpsConfig?.hostname && (
            <span style={{ fontSize: '10px', color: palette.textTertiary }}>
              {vpsConfig.hostname}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isConnected && latency > 0 && (
            <span style={{ fontSize: '10px', color: palette.textDisabled }}>{latency}ms</span>
          )}
          {isConnected && (
            <span style={{ fontSize: '10px', color: palette.textDisabled }}>
              {termSize.cols}x{termSize.rows}
            </span>
          )}
          {isConnected && (
            <button
              onClick={handleDisconnect}
              className="text-[10px] px-2 py-0.5 rounded transition-colors"
              style={{
                color: palette.rose,
                border: `1px solid ${palette.rose}30`,
                backgroundColor: palette.rose + '10',
              }}
            >
              DISCONNECT
            </button>
          )}
          {connState === 'error' && (
            <button
              onClick={() => handleConnect(urlInput)}
              className="text-[10px] px-2 py-0.5 rounded transition-colors"
              style={{
                color: palette.amber,
                border: `1px solid ${palette.amber}30`,
                backgroundColor: palette.amber + '10',
              }}
            >
              RECONNECT
            </button>
          )}
          {connState === 'reconnecting' && (
            <button
              onClick={() => connectionRef.current?.reconnectNow()}
              className="text-[10px] px-2 py-0.5 rounded transition-colors"
              style={{
                color: palette.amber,
                border: `1px solid ${palette.amber}30`,
                backgroundColor: palette.amber + '10',
              }}
            >
              RECONNECT NOW
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <div ref={termRef} className="absolute inset-0" style={{ padding: '4px' }} />

        {connState === 'disconnected' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#060610ee' }}>
            <div className="w-80 space-y-4" style={{ fontFamily: typography.mono }}>
              <div className="text-center">
                <div className="text-lg mb-1" style={{ color: palette.cyan }}>VPS Terminal</div>
                <div className="text-[10px]" style={{ color: palette.textDisabled }}>
                  Connect to your remote server
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] block" style={{ color: palette.textTertiary }}>
                  TUNNEL URL
                </label>
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="terminal.yourdomain.com"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAndConnect(); }}
                  className="w-full px-3 py-2 text-xs rounded"
                  style={{
                    backgroundColor: palette.surface,
                    border: `1px solid ${palette.borderDefault}`,
                    color: palette.textPrimary,
                    fontFamily: typography.mono,
                    outline: 'none',
                  }}
                />
              </div>

              <button
                onClick={handleSaveAndConnect}
                disabled={!urlInput.trim()}
                className="w-full py-2 text-xs font-medium rounded transition-all"
                style={{
                  backgroundColor: urlInput.trim() ? palette.cyan + '15' : palette.surface,
                  border: `1px solid ${urlInput.trim() ? palette.cyan + '40' : palette.borderDefault}`,
                  color: urlInput.trim() ? palette.cyan : palette.textDisabled,
                }}
              >
                CONNECT
              </button>

              <div
                className="text-center p-2 rounded"
                style={{
                  backgroundColor: palette.surface,
                  border: `1px solid ${palette.borderSubtle}`,
                }}
              >
                <span className="text-[10px]" style={{ color: palette.textDisabled }}>
                  Requires ttyd or custom relay running behind a Cloudflare Tunnel.
                  Configure in Settings {'>'} VPS.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-between px-3 py-1 shrink-0"
        style={{
          backgroundColor: palette.elevated,
          borderTop: `1px solid ${palette.borderSubtle}`,
          fontFamily: typography.ui,
        }}
      >
        <div className="flex items-center gap-4" style={{ fontSize: '10px', color: palette.textDisabled }}>
          <span>vps</span>
          <span>UTF-8</span>
          {isConnected && <span>bash</span>}
        </div>
        <div className="flex items-center gap-4" style={{ fontSize: '10px', color: palette.textDisabled }}>
          {stateDetail && connState !== 'connected' && (
            <span style={{ color: statusColor }}>{stateDetail}</span>
          )}
          <span style={{ color: isConnected ? palette.amber : palette.textDisabled }}>
            {isConnected ? 'LIVE' : 'SAFE'}
          </span>
        </div>
      </div>
    </div>
  );
}
