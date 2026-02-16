import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/themecontext';
import type { Page } from './Layout';

/* ═══════════════════════════════════════════════════════════════
   ThamOS X — Desktop Layout
   Windowed desktop environment with taskbar, system monitor,
   browser shell, and AI agent routing. Wraps scanner/result
   children like TerminalLayout does.
   ═══════════════════════════════════════════════════════════════ */

// ─── Constants ────────────────────────────────────────────────
const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  cyan: '#00d9ff',
  green: '#00ff9d',
  pink: '#ff0080',
  amber: '#fbbf24',
  purple: '#b794f6',
  orange: '#ff6b35',
  blue: '#00b4d8',
};

const AGENTS: Record<string, { name: string; model: string; color: string; icon: string; desc: string }> = {
  thamosx: { name: 'ThamOS-X', model: 'Claude Opus 4.6', color: P.green, icon: '◆', desc: 'Deep analysis, exploit dev, architecture' },
  thamosy: { name: 'ThamOS-Y', model: 'GPT-5', color: P.orange, icon: '◇', desc: 'Code gen, debugging, rapid iteration' },
  thamosz: { name: 'ThamOS-Z', model: 'Gemini Ultra', color: P.blue, icon: '○', desc: 'Research, recon, multi-modal analysis' },
};

const BOOT_LINES = [
  '[  0.000000] ThamOS X v7.0.0 — Desktop Environment',
  '[  0.051200] Loading secure kernel modules.............. OK',
  '[  0.102400] Mounting encrypted volumes................. OK',
  '[  0.153600] Initializing window compositor............. OK',
  '[  0.204800] Starting agent mesh network................ OK',
  '[  0.256000]   → ThamOS-X (Claude Opus 4.6)........... ONLINE',
  '[  0.307200]   → ThamOS-Y (GPT-5)..................... ONLINE',
  '[  0.358400]   → ThamOS-Z (Gemini Ultra).............. ONLINE',
  '[  0.409600] Loading threat intelligence suite.......... OK',
  '[  0.460800] GitHub integration........................ LINKED',
  '[  0.512000] Desktop environment loaded.',
  '',
  'All systems operational. Welcome back, Operator.',
];

// ─── Interfaces ───────────────────────────────────────────────
interface DesktopLayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

interface WindowState {
  title: string;
  icon: string;
  color: string;
  open: boolean;
  minimized: boolean;
  zIndex: number;
}

interface DragState {
  pos: { x: number; y: number };
  onMouseDown: (e: React.MouseEvent) => void;
}

// ─── useDrag Hook ─────────────────────────────────────────────
function useDrag(initialPos: { x: number; y: number }): DragState {
  const [pos, setPos] = useState(initialPos);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.win-btn') || (e.target as HTMLElement).closest('.win-no-drag')) return;
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return { pos, onMouseDown };
}

// ─── Window Component ─────────────────────────────────────────
function DesktopWindow({
  title, icon, accentColor, children, initialPos, width = 700, height = 460,
  zIndex, onFocus, onClose, onMinimize, minimized, id,
}: {
  title: string; icon: string; accentColor?: string; children: ReactNode;
  initialPos: { x: number; y: number }; width?: number; height?: number;
  zIndex: number; onFocus: () => void; onClose: () => void; onMinimize: () => void;
  minimized: boolean; id: string;
}) {
  const { pos, onMouseDown } = useDrag(initialPos);
  if (minimized) return null;

  return (
    <div onClick={onFocus} style={{
      position: 'absolute', left: pos.x, top: pos.y, width, height,
      background: P.surface, border: `1px solid ${accentColor || P.border}`, borderRadius: 10,
      boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 1px ${accentColor || P.border} inset`,
      zIndex, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    }}>
      {/* Title Bar */}
      <div onMouseDown={onMouseDown} style={{
        display: 'flex', alignItems: 'center', padding: '10px 14px',
        background: `linear-gradient(180deg, ${P.surfaceLight} 0%, ${P.surface} 100%)`,
        borderBottom: `1px solid ${P.border}`, cursor: 'grab', userSelect: 'none', gap: 10, minHeight: 40,
      }}>
        <div style={{ display: 'flex', gap: 7 }}>
          <div className="win-btn" onClick={onClose} style={{ width: 13, height: 13, borderRadius: '50%', background: '#ff5f57', cursor: 'pointer', border: '1px solid #e0443e' }} />
          <div className="win-btn" onClick={onMinimize} style={{ width: 13, height: 13, borderRadius: '50%', background: '#febc2e', cursor: 'pointer', border: '1px solid #dea123' }} />
          <div className="win-btn" style={{ width: 13, height: 13, borderRadius: '50%', background: '#28c840', border: '1px solid #1aab29' }} />
        </div>
        <span style={{ color: accentColor || P.dim, fontSize: 13, opacity: 0.7 }}>{icon}</span>
        <span style={{ color: P.text, fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>{title}</span>
        <span style={{ marginLeft: 'auto', color: P.dim, fontSize: 9 }}>{id}</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

// ─── Agent Response Panel ─────────────────────────────────────
function AgentResponse({ agent, query }: { agent: string; query: string }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);

  const responses: Record<string, string> = {
    thamosx: `[Analysis Complete]\n\nBased on the project structure and current codebase:\n\n1. Architecture Review\n   Component tree is clean. Context-based state is appropriate at this scale.\n\n2. Recommended Changes\n   → Implement lazy loading for result components\n   → Add error boundaries around API calls\n   → Consider WebSocket for real-time scan updates\n\n3. Action Items\n   - Feature branch created: feature/desktop-theme\n   - Modified: 4 files\n   - Tests: All passing\n   - Ready to push on your command.\n\n[Tokens: 1,847 | Latency: 2.3s | Model: Claude Opus 4.6]`,
    thamosy: `[Debug Analysis]\n\nTraced through the call stack:\n\n→ Root Cause: Policy routing table has precedence conflict.\n  Rule 14 matches before Rule 8 (overlapping subnet masks).\n\n→ Fix:\n  set policy-route 8 priority 1\n  set policy-route 14 priority 10\n\n→ Risk: LOW — No impact on existing VPN tunnels\n→ Rollback: revert priority values\n\n[Tokens: 943 | Latency: 1.1s | Model: GPT-5]`,
    thamosz: `[Recon Complete]\n\n┌─ Subdomains Found ──────────────────────┐\n│  api.target.com       → 104.26.1.12     │\n│  admin.target.com     → 104.26.1.13     │\n│  staging.target.com   → 172.67.184.22   │\n└─────────────────────────────────────────┘\n\nCritical: CORS misconfiguration on api.target.com\n  Access-Control-Allow-Origin: *\n  Access-Control-Allow-Credentials: true\n\nExposure Score: 7.2/10\n\n[Tokens: 1,234 | Latency: 1.8s | Model: Gemini Ultra]`,
  };

  useEffect(() => {
    const full = responses[agent] || 'Processing...';
    let i = 0;
    setText(''); setDone(false);
    const iv = setInterval(() => {
      if (i < full.length) { setText(full.substring(0, i + 1)); i++; }
      else { setDone(true); clearInterval(iv); }
    }, 12);
    return () => clearInterval(iv);
  }, [agent, query]);

  const a = AGENTS[agent];

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, fontSize: 12.5, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${a.color}22` }}>
        <span style={{ color: a.color, fontSize: 18 }}>{a.icon}</span>
        <div>
          <div style={{ color: a.color, fontWeight: 700, fontSize: 13 }}>{a.name}</div>
          <div style={{ color: P.dim, fontSize: 10 }}>{a.model} — {a.desc}</div>
        </div>
        {!done && <span style={{ marginLeft: 'auto', color: a.color, fontSize: 10, animation: 'dtPulse 1s infinite' }}>● processing</span>}
        {done && <span style={{ marginLeft: 'auto', color: P.green, fontSize: 10 }}>✓ complete</span>}
      </div>
      <div style={{ color: P.dim, fontSize: 11, marginBottom: 10 }}>→ {query}</div>
      <div style={{ whiteSpace: 'pre-wrap', color: P.textLight, lineHeight: 1.8 }}>
        {text}{!done && <span style={{ color: a.color, animation: 'dtBlink 0.7s infinite' }}>▌</span>}
      </div>
    </div>
  );
}

// ─── Browser Shell ────────────────────────────────────────────
function BrowserShell() {
  const [url, setUrl] = useState('thamos://home');
  const [activeTab, setActiveTab] = useState('home');
  const tabs = [
    { id: 'home', label: 'Home', url: 'thamos://home' },
    { id: 'github', label: 'GitHub', url: 'https://github.com/thamos' },
    { id: 'docs', label: 'Docs', url: 'thamos://docs' },
  ];
  const bookmarks = ['GitHub', 'Jira', 'Confluence', 'FortiGate', 'Splunk', 'VirusTotal'];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', background: P.void, borderBottom: `1px solid ${P.border}`, padding: '0 8px' }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => { setActiveTab(t.id); setUrl(t.url); }}
            style={{
              padding: '7px 14px', fontSize: 10, cursor: 'pointer', transition: 'all 0.15s',
              color: activeTab === t.id ? P.textLight : P.dim,
              background: activeTab === t.id ? P.surface : 'transparent',
              borderBottom: activeTab === t.id ? `2px solid ${P.cyan}` : '2px solid transparent',
            }}>{t.label}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: P.surfaceLight, borderBottom: `1px solid ${P.border}` }}>
        {['◀', '▶', '↻'].map((b, i) => (
          <div key={i} style={{ width: 22, height: 22, borderRadius: 4, background: P.void, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.dim, fontSize: 10, cursor: 'pointer' }}>{b}</div>
        ))}
        <div style={{ flex: 1, background: P.void, border: `1px solid ${P.border}`, borderRadius: 5, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: P.green, fontSize: 9 }}>🔒</span>
          <input className="win-no-drag" value={url} onChange={e => setUrl(e.target.value)}
            style={{ background: 'none', border: 'none', color: P.text, fontSize: 11, fontFamily: 'inherit', outline: 'none', flex: 1 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '5px 10px', background: P.surfaceLight, borderBottom: `1px solid ${P.border}` }}>
        {bookmarks.map(b => (
          <span key={b} style={{ fontSize: 9, color: P.dim, padding: '2px 8px', background: P.void, borderRadius: 3, cursor: 'pointer' }}>{b}</span>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        <div style={{ fontSize: 42, opacity: 0.08 }}>⚡</div>
        <div style={{ color: P.green, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>ThamOS Browser</div>
        <div style={{ color: P.dim, fontSize: 11, textAlign: 'center', maxWidth: 340, lineHeight: 1.7 }}>
          Secure browsing environment. All traffic routed through encrypted tunnel.
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['GitHub Repos', 'Pull Requests', 'Actions', 'Security Alerts'].map(item => (
            <div key={item} style={{
              padding: '8px 16px', background: P.void, border: `1px solid ${P.border}`,
              borderRadius: 6, fontSize: 10, color: P.text, cursor: 'pointer',
            }}>{item}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── System Monitor ───────────────────────────────────────────
function SystemMonitor() {
  const [stats, setStats] = useState({ cpu: 23, mem: 41, net: 12 });

  useEffect(() => {
    const iv = setInterval(() => {
      setStats(s => ({
        cpu: Math.min(95, Math.max(5, s.cpu + (Math.random() * 10 - 5))),
        mem: Math.min(90, Math.max(20, s.mem + (Math.random() * 4 - 2))),
        net: Math.min(50, Math.max(1, s.net + (Math.random() * 6 - 3))),
      }));
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  const Bar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: P.dim, fontSize: 10 }}>{label}</span>
        <span style={{ color, fontSize: 10, fontWeight: 600 }}>{value.toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: P.void, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 2, transition: 'width 1s ease' }} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: 16, fontSize: 11, overflow: 'auto', flex: 1 }}>
      <div style={{ color: P.cyan, fontSize: 11, fontWeight: 700, marginBottom: 16, letterSpacing: 1 }}>SYSTEM MONITOR</div>
      <Bar label="CPU" value={stats.cpu} color={stats.cpu > 70 ? P.pink : P.green} />
      <Bar label="MEMORY" value={stats.mem} color={stats.mem > 75 ? P.amber : P.cyan} />
      <Bar label="NETWORK" value={stats.net} color={P.blue} />
      <div style={{ borderTop: `1px solid ${P.border}`, marginTop: 16, paddingTop: 12 }}>
        <div style={{ color: P.dim, fontSize: 10, marginBottom: 8 }}>AGENTS</div>
        {Object.values(AGENTS).map(a => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.color, boxShadow: `0 0 6px ${a.color}66` }} />
            <span style={{ color: P.text, fontSize: 10 }}>{a.name}</span>
            <span style={{ color: P.green, fontSize: 9, marginLeft: 'auto' }}>ONLINE</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${P.border}`, marginTop: 16, paddingTop: 12 }}>
        <div style={{ color: P.dim, fontSize: 10, marginBottom: 8 }}>THREAT FEEDS</div>
        {['VirusTotal', 'AbuseIPDB', 'Spamhaus', 'AlienVault', 'URLhaus'].map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: P.green, fontSize: 8 }}>●</span>
            <span style={{ color: P.dim, fontSize: 9 }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Taskbar ──────────────────────────────────────────────────
function Taskbar({ windows, onToggle, onOpen, time }: {
  windows: Record<string, WindowState>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  time: string;
}) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 46, zIndex: 10000,
      background: `linear-gradient(180deg, ${P.surfaceLight} 0%, ${P.void} 100%)`,
      borderTop: `1px solid ${P.border}`, display: 'flex', alignItems: 'center', padding: '0 14px',
      fontFamily: "'JetBrains Mono', monospace", backdropFilter: 'blur(20px)',
    }}>
      <div onClick={() => onOpen('terminal')} style={{
        width: 34, height: 34, background: `${P.green}12`, border: `1px solid ${P.green}33`,
        borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: 10,
      }}>
        <span style={{ color: P.green, fontSize: 16, fontWeight: 700 }}>⌘</span>
      </div>
      <div style={{ width: 1, height: 26, background: P.border, margin: '0 8px' }} />
      {Object.entries(windows).map(([id, w]) => (
        <div key={id} onClick={() => onToggle(id)} style={{
          padding: '5px 14px', margin: '0 2px', borderRadius: 5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
          background: w.minimized ? 'transparent' : `${w.color || P.cyan}10`,
          border: `1px solid ${w.minimized ? P.border : (w.color || P.cyan) + '44'}`,
        }}>
          <span style={{ fontSize: 10, color: w.color || P.dim }}>{w.icon}</span>
          <span style={{ color: w.minimized ? P.dim : P.text, fontSize: 10 }}>{w.title}</span>
          {!w.minimized && <div style={{ width: 4, height: 4, borderRadius: '50%', background: w.color || P.cyan }} />}
        </div>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.values(AGENTS).map(a => (
            <div key={a.name} style={{ width: 7, height: 7, borderRadius: '50%', background: a.color, boxShadow: `0 0 8px ${a.color}55` }} title={`${a.name}: Online`} />
          ))}
        </div>
        <div style={{ color: P.dim, fontSize: 10, letterSpacing: 0.5 }}>{time}</div>
      </div>
    </div>
  );
}

// ─── Desktop Icons ────────────────────────────────────────────
function DesktopIcons({ onOpen }: { onOpen: (id: string) => void }) {
  const icons = [
    { id: 'terminal', label: 'Terminal', emoji: '▸', color: P.green },
    { id: 'browser', label: 'Browser', emoji: '◎', color: P.cyan },
    { id: 'monitor', label: 'Monitor', emoji: '◈', color: P.amber },
  ];
  return (
    <div style={{ position: 'absolute', top: 18, left: 18, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 0 }}>
      {icons.map(ic => (
        <div key={ic.id} onClick={() => onOpen(ic.id)} style={{
          width: 76, padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
          borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
        }}>
          <div style={{ fontSize: 24, color: ic.color, opacity: 0.8 }}>{ic.emoji}</div>
          <span style={{ color: P.dim, fontSize: 9, textAlign: 'center' }}>{ic.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Desktop Layout ──────────────────────────────────────
export default function DesktopLayout({ currentPage, onNavigate, children }: DesktopLayoutProps) {
  const { user, signOut } = useAuth();
  const { setTheme } = useTheme();

  const [windows, setWindows] = useState<Record<string, WindowState>>({
    terminal: { title: 'Terminal', icon: '▸', color: P.green, open: true, minimized: false, zIndex: 3 },
    browser: { title: 'Browser', icon: '◎', color: P.cyan, open: true, minimized: true, zIndex: 1 },
    monitor: { title: 'Monitor', icon: '◈', color: P.amber, open: true, minimized: false, zIndex: 2 },
  });
  const [agentWin, setAgentWin] = useState<{ agent: string; query: string; key: number; minimized: boolean } | null>(null);
  const [time, setTime] = useState('');
  const [topZ, setTopZ] = useState(10);
  const [showBoot, setShowBoot] = useState(true);
  const [bootLines, setBootLines] = useState<string[]>([]);

  // Boot sequence
  useEffect(() => {
    let idx = 0;
    const iv = setInterval(() => {
      if (idx < BOOT_LINES.length) {
        setBootLines(p => [...p, BOOT_LINES[idx]]);
        idx++;
      } else {
        clearInterval(iv);
        setTimeout(() => setShowBoot(false), 800);
      }
    }, 55);
    return () => clearInterval(iv);
  }, []);

  // Clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  const focus = useCallback((id: string) => {
    setTopZ(z => {
      const nz = z + 1;
      setWindows(w => ({ ...w, [id]: { ...w[id], zIndex: nz, minimized: false, open: true } }));
      return nz;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    if (id === 'agent' && agentWin) {
      setAgentWin(p => p ? { ...p, minimized: !p.minimized } : null);
    } else {
      setWindows(w => w[id] ? { ...w, [id]: { ...w[id], minimized: !w[id].minimized } } : w);
    }
  }, [agentWin]);

  const close = useCallback((id: string) => {
    if (id === 'agent') setAgentWin(null);
    else setWindows(w => ({ ...w, [id]: { ...w[id], open: false, minimized: true } }));
  }, []);

  const openWin = useCallback((id: string) => {
    setTopZ(z => {
      const nz = z + 1;
      if (windows[id]) setWindows(w => ({ ...w, [id]: { ...w[id], open: true, minimized: false, zIndex: nz } }));
      return nz;
    });
  }, [windows]);

  const handleAgent = useCallback((agent: string, query: string) => {
    setAgentWin({ agent, query, key: Date.now(), minimized: false });
    setTopZ(z => z + 1);
  }, []);

  // Build taskbar window list
  const allWins = { ...windows };
  if (agentWin) {
    const a = AGENTS[agentWin.agent];
    allWins.agent = { title: a.name, icon: a.icon, color: a.color, open: true, minimized: agentWin.minimized };
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
      background: `radial-gradient(ellipse at 20% 20%, #080c14 0%, ${P.void} 50%, #020204 100%)`,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes dtBlink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
        @keyframes dtPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${P.border}; border-radius: 3px; }
        ::selection { background: ${P.cyan}; color: ${P.void}; }
      `}</style>

      {/* Scanlines */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, opacity: 0.25,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,157,0.008) 2px, rgba(0,255,157,0.008) 4px)',
      }} />

      {/* Grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `radial-gradient(circle at 1px 1px, ${P.green}04 1px, transparent 0)`,
        backgroundSize: '48px 48px',
      }} />

      {/* Vignette */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998,
        background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
      }} />

      {/* Boot Sequence */}
      {showBoot && (
        <div style={{
          position: 'fixed', inset: 0, background: P.void, zIndex: 99999,
          padding: 40, overflow: 'auto', fontFamily: "'JetBrains Mono', monospace",
        }}>
          {bootLines.map((line, i) => (
            <div key={i} style={{ color: P.green, fontSize: 12, lineHeight: 1.8, opacity: 0.9 }}>{line}</div>
          ))}
        </div>
      )}

      {/* Theme Switch Button */}
      <button
        onClick={() => { setTheme('tactical'); onNavigate('scanner'); }}
        style={{
          position: 'fixed', top: 12, right: 14, zIndex: 100,
          padding: '6px 14px', background: 'transparent',
          border: `1px solid ${P.cyan}55`, borderRadius: 5,
          color: P.cyan, fontSize: 10, fontWeight: 600, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
        }}
      >
        [ TACTICAL MODE ]
      </button>

      <DesktopIcons onOpen={openWin} />

      {/* Terminal Window — hosts the scanner children */}
      {windows.terminal?.open && (
        <DesktopWindow id="terminal" title="Terminal — tsh 5.0" icon="▸" accentColor={P.green}
          initialPos={{ x: 100, y: 30 }} width={740} height={500}
          zIndex={windows.terminal.zIndex} onFocus={() => focus('terminal')}
          onClose={() => close('terminal')} onMinimize={() => toggle('terminal')}
          minimized={windows.terminal.minimized}>
          {children}
        </DesktopWindow>
      )}

      {/* Browser */}
      {windows.browser?.open && (
        <DesktopWindow id="browser" title="ThamOS Browser" icon="◎" accentColor={P.cyan}
          initialPos={{ x: 240, y: 60 }} width={700} height={460}
          zIndex={windows.browser.zIndex} onFocus={() => focus('browser')}
          onClose={() => close('browser')} onMinimize={() => toggle('browser')}
          minimized={windows.browser.minimized}>
          <BrowserShell />
        </DesktopWindow>
      )}

      {/* System Monitor */}
      {windows.monitor?.open && (
        <DesktopWindow id="monitor" title="System Monitor" icon="◈" accentColor={P.amber}
          initialPos={{ x: typeof window !== 'undefined' ? window.innerWidth - 320 : 900, y: 30 }} width={280} height={490}
          zIndex={windows.monitor.zIndex} onFocus={() => focus('monitor')}
          onClose={() => close('monitor')} onMinimize={() => toggle('monitor')}
          minimized={windows.monitor.minimized}>
          <SystemMonitor />
        </DesktopWindow>
      )}

      {/* Agent Response */}
      {agentWin && !agentWin.minimized && (
        <DesktopWindow id="agent" title={`${AGENTS[agentWin.agent].name} — Response`}
          icon={AGENTS[agentWin.agent].icon} accentColor={AGENTS[agentWin.agent].color}
          initialPos={{ x: 320, y: 90 }} width={640} height={440}
          zIndex={topZ} onFocus={() => {}}
          onClose={() => close('agent')} onMinimize={() => toggle('agent')} minimized={false}>
          <AgentResponse agent={agentWin.agent} query={agentWin.query} key={agentWin.key} />
        </DesktopWindow>
      )}

      <Taskbar windows={allWins} onToggle={toggle} onOpen={openWin} time={time} />
    </div>
  );
}

// Re-export agents and handler type for DesktopScanner to use
export { AGENTS, P as DESKTOP_PALETTE };
export type { WindowState };
