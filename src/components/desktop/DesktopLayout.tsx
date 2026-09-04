import { useState, useEffect, useCallback } from 'react';
import { useDesktop, type AppId } from '../../contexts/DesktopContext';
import { DesktopWindow, TASKBAR_HEIGHT } from './DesktopWindow';
import { Taskbar } from './Taskbar';
import { BootSequence } from './BootSequence';
import { AppLauncher } from './AppLauncher';
import { DesktopIcons } from './DesktopIcons';
import { DesktopTerminal } from './DesktopTerminal';
import { DesktopVPSTerminal } from './DesktopVPSTerminal';
import { DesktopScanner } from './DesktopScanner';
import IPResult from '../../pages/results/IPResult';
import URLResult from '../../pages/results/URLResult';
import DomainResult from '../../pages/results/DomainResult';
import HashResult from '../../pages/results/HashResult';
import CVEResult from '../../pages/results/CVEResult';
import WalletResult from '../../pages/results/WalletResult';
import EmailResult from '../../pages/results/EmailResult';
import ExtensionScanner from '../../pages/ExtensionScanner';
import DecoderTool from '../../pages/DecoderTool';
import DefangTool from '../../pages/DefangTool';
import EmailAnalyzer from '../../pages/EmailAnalyzer';
import DocAnalyzer from '../../pages/DocAnalyzer';
import IOCExtractor from '../../pages/IOCExtractor';
import BulkLookup from '../../pages/BulkLookup';
import { DesktopWorkshop } from './DesktopWorkshop';
import { DesktopSystemMonitor } from './DesktopSystemMonitor';
import { DesktopIntelDashboard } from './DesktopIntelDashboard';
import { IntelWidget, readIntelWidgetState, writeIntelWidgetState } from './IntelWidget';
import { DesktopCaseManager } from './DesktopCaseManager';
import { DesktopBrowser } from './DesktopBrowser';
import { DesktopSettings } from './DesktopSettings';
import { DesktopGitHub } from './DesktopGitHub';
import { DesktopCodeEditor } from '../editor/DesktopCodeEditor';
import { DesktopClock } from './DesktopClock';
import { SpotlightSearch } from './SpotlightSearch';
import { ToastProvider } from './ToastNotifications';
import { ContextMenuProvider, useContextMenu, type MenuEntry } from './ContextMenu';
import { palette, typography } from '../../design-system/tokens';
import { getSavedWallpaper, getWallpaperById } from '../../design-system/wallpapers';
import { Terminal, Monitor, LayoutGrid, Settings, Undo2, RadioTower } from 'lucide-react';
import { AppIconTile } from '../../design-system/icons';

function DesktopContent() {
  const desktop = useDesktop();
  const { showContextMenu } = useContextMenu();
  const [showLauncher, setShowLauncher] = useState(false);
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMissionControl, setShowMissionControl] = useState(false);
  const [closedHistory, setClosedHistory] = useState<Array<{ appId: string; title: string }>>([]);
  const [workspaceFlash, setWorkspaceFlash] = useState<number | null>(null);
  const [wallpaper, setWallpaper] = useState(getSavedWallpaper);

  // Listen for wallpaper changes from Settings
  useEffect(() => {
    const handler = () => setWallpaper(getSavedWallpaper());
    window.addEventListener('thamos:wallpaper-changed', handler);
    return () => window.removeEventListener('thamos:wallpaper-changed', handler);
  }, []);

  // Restore layout on boot — clean desktop, no forced windows
  useEffect(() => {
    if (desktop.bootComplete && Object.keys(desktop.windows).length === 0) {
      desktop.restoreSavedLayout();
      // Intentionally blank: no fallback windows open on fresh load
    }
  }, [desktop.bootComplete]);

  // --- Workspace switch indicator ---
  useEffect(() => {
    if (!desktop.bootComplete) return;
    setWorkspaceFlash(desktop.activeWorkspace);
    const timer = setTimeout(() => setWorkspaceFlash(null), 800);
    return () => clearTimeout(timer);
  }, [desktop.activeWorkspace]);

  // --- Keyboard shortcut helpers ---
  const closeActiveWindow = useCallback(() => {
    if (!desktop.activeWindowId) return;
    const win = desktop.windows[desktop.activeWindowId];
    if (win) {
      setClosedHistory(prev => [...prev.slice(-9), { appId: win.appId, title: win.title }]);
      desktop.closeWindow(desktop.activeWindowId);
    }
  }, [desktop]);

  const reopenLastClosed = useCallback(() => {
    if (closedHistory.length === 0) return;
    const last = closedHistory[closedHistory.length - 1];
    setClosedHistory(prev => prev.slice(0, -1));
    desktop.openWindow({ appId: last.appId as AppId, title: last.title });
  }, [closedHistory, desktop]);

  const cycleWindows = useCallback((reverse = false) => {
    const visible = desktop.getVisibleWindows().filter(w => !w.minimized);
    if (visible.length < 2) return;
    const currentIdx = visible.findIndex(w => w.id === desktop.activeWindowId);
    const nextIdx = reverse
      ? (currentIdx - 1 + visible.length) % visible.length
      : (currentIdx + 1) % visible.length;
    desktop.focusWindow(visible[nextIdx].id);
  }, [desktop]);

  const showDesktop = useCallback(() => {
    const visible = desktop.getVisibleWindows().filter(w => !w.minimized);
    if (visible.length > 0) {
      visible.forEach(w => desktop.minimizeWindow(w.id));
    } else {
      // Restore all minimized windows on current workspace
      Object.values(desktop.windows)
        .filter(w => w.minimized && (w.workspaceId === desktop.activeWorkspace || w.pinned))
        .forEach(w => desktop.restoreWindow(w.id));
    }
  }, [desktop]);

  const focusTerminal = useCallback(() => {
    const terminalWin = Object.values(desktop.windows).find(
      w => w.appId === 'terminal' && (w.workspaceId === desktop.activeWorkspace || w.pinned)
    );
    if (terminalWin) {
      desktop.focusWindow(terminalWin.id);
    } else {
      desktop.openWindow({ appId: 'terminal', title: 'Terminal' });
    }
  }, [desktop]);

  const tileActiveWindow = useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
    if (!desktop.activeWindowId) return;
    const win = desktop.windows[desktop.activeWindowId];
    if (!win) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight - TASKBAR_HEIGHT;

    if (direction === 'up') {
      if (win.maximized) return;
      desktop.maximizeWindow(desktop.activeWindowId);
      return;
    }
    if (direction === 'down') {
      if (win.maximized) {
        desktop.restoreWindow(desktop.activeWindowId);
      } else {
        desktop.minimizeWindow(desktop.activeWindowId);
      }
      return;
    }

    // Restore first if maximized
    if (win.maximized) desktop.restoreWindow(desktop.activeWindowId);

    const halfW = Math.floor(vw / 2);
    if (direction === 'left') {
      desktop.updateWindowPosition(desktop.activeWindowId, { x: 0, y: 0 });
      desktop.updateWindowSize(desktop.activeWindowId, { width: halfW, height: vh });
    } else {
      desktop.updateWindowPosition(desktop.activeWindowId, { x: halfW, y: 0 });
      desktop.updateWindowSize(desktop.activeWindowId, { width: halfW, height: vh });
    }
  }, [desktop]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const activeEl = document.activeElement;
      const isInputFocused = activeEl instanceof HTMLInputElement
        || activeEl instanceof HTMLTextAreaElement
        || activeEl?.closest('.xterm');

      if (mod && (e.key === 'k' || e.key === ' ')) {
        e.preventDefault();
        setShowSpotlight(prev => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (showMissionControl) { setShowMissionControl(false); return; }
        if (showSpotlight) { setShowSpotlight(false); return; }
        if (showLauncher) { setShowLauncher(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
      }

      if (mod && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setShowMissionControl(prev => !prev);
        return;
      }

      if (mod && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        desktop.switchWorkspace(parseInt(e.key));
        return;
      }

      if (isInputFocused) return;

      if (mod && e.key === 'w') {
        e.preventDefault();
        closeActiveWindow();
        return;
      }

      if (mod && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        reopenLastClosed();
        return;
      }

      if (mod && e.key === 'Tab') {
        e.preventDefault();
        cycleWindows(e.shiftKey);
        return;
      }

      if (mod && e.key === '`') {
        e.preventDefault();
        focusTerminal();
        return;
      }

      if (mod && e.key === 'd') {
        e.preventDefault();
        showDesktop();
        return;
      }

      // Window tiling — Ctrl+Arrow
      if (mod && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const dir = e.key.replace('Arrow', '').toLowerCase() as 'left' | 'right' | 'up' | 'down';
        tileActiveWindow(dir);
        return;
      }

      // Shortcuts help — ?
      if (e.key === '?' && !isInputFocused) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLauncher, desktop, closeActiveWindow, reopenLastClosed, cycleWindows, focusTerminal, tileActiveWindow, showDesktop]);

  // --- Right-click on desktop background ---
  const handleDesktopRightClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger if clicking on a window, icon, or taskbar
    const target = e.target as HTMLElement;
    if (target.closest('[data-window]') || target.closest('[data-taskbar]') || target.closest('[data-icon]')) return;
    e.preventDefault();

    const items: MenuEntry[] = [
      { label: 'New Terminal', icon: <Terminal size={14} />, shortcut: 'Ctrl+`', action: () => desktop.openWindow({ appId: 'terminal', title: 'Terminal' }) },
      { label: 'VPS Terminal', icon: <Monitor size={14} />, action: () => desktop.openWindow({ appId: 'vps-terminal', title: 'VPS Terminal' }) },
      { type: 'divider' },
      { label: 'App Launcher', icon: <LayoutGrid size={14} />, shortcut: 'Ctrl+K', action: () => setShowLauncher(true) },
      { label: 'Settings', icon: <Settings size={14} />, action: () => desktop.openWindow({ appId: 'settings', title: 'Settings' }) },
      {
        label: readIntelWidgetState() === 'hidden' ? 'Show Intel Widget' : 'Hide Intel Widget',
        icon: <RadioTower size={14} />,
        action: () => {
          const isHidden = readIntelWidgetState() === 'hidden';
          writeIntelWidgetState(isHidden ? 'collapsed' : 'hidden');
          window.dispatchEvent(new Event('thamos:intel-widget-changed'));
        },
      },
      { type: 'divider' },
      { label: 'Workspace 1', action: () => desktop.switchWorkspace(1), shortcut: 'Ctrl+1' },
      { label: 'Workspace 2', action: () => desktop.switchWorkspace(2), shortcut: 'Ctrl+2' },
      { label: 'Workspace 3', action: () => desktop.switchWorkspace(3), shortcut: 'Ctrl+3' },
      { label: 'Workspace 4', action: () => desktop.switchWorkspace(4), shortcut: 'Ctrl+4' },
    ];

    if (closedHistory.length > 0) {
      items.splice(5, 0, {
        label: `Reopen: ${closedHistory[closedHistory.length - 1].title}`,
        icon: <Undo2 size={14} />,
        shortcut: 'Ctrl+Shift+T',
        action: reopenLastClosed,
      });
    }

    showContextMenu(e.clientX, e.clientY, items);
  }, [desktop, showContextMenu, closedHistory, reopenLastClosed]);

  if (!desktop.bootComplete) {
    return <BootSequence onComplete={desktop.setBootComplete} />;
  }

  const visibleWindows = desktop.getVisibleWindows();

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ fontFamily: typography.ui }}
      onContextMenu={handleDesktopRightClick}
    >
      <div className="absolute inset-0" style={getWallpaperById(wallpaper).style}>
        {/* Quiet texture keeps the browser-desktop illusion without a HUD grid. */}
        <div
          className="absolute inset-0 opacity-[0.012]"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(184, 196, 207, 0.24) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.34) 100%)',
          }}
        />
      </div>

      {workspaceFlash !== null && (
        <div
          className="fixed inset-0 flex items-center justify-center pointer-events-none z-[80]"
          style={{ animation: 'wsFlash 800ms ease-out forwards' }}
        >
          <div
            style={{
              fontSize: '120px',
              fontWeight: 200,
              fontFamily: typography.mono,
              color: palette.textSecondary,
              opacity: 0.09,
              letterSpacing: '-0.05em',
            }}
          >
            {workspaceFlash}
          </div>
        </div>
      )}

      <DesktopIcons />
      <DesktopClock />
      {/* Sits above the wallpaper/icons layer (z-15) but below windows (z>=101), so open windows overlap it. */}
      <IntelWidget />

      {visibleWindows.map(window => (
        <DesktopWindow key={window.id} id={window.id}>
          {renderWindowContent(window.appId, window.data, desktop.openWindow)}
        </DesktopWindow>
      ))}

      {showSpotlight && <SpotlightSearch onClose={() => setShowSpotlight(false)} />}
      {showLauncher && <AppLauncher onClose={() => setShowLauncher(false)} />}

      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {showMissionControl && <MissionControl onClose={() => setShowMissionControl(false)} />}

      <Taskbar onOpenLauncher={() => setShowSpotlight(true)} />
    </div>
  );
}

export function DesktopLayout() {
  return (
    <ContextMenuProvider>
      <ToastProvider>
        <DesktopContent />
      </ToastProvider>
    </ContextMenuProvider>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: 'Ctrl + K', desc: 'App Launcher' },
    { keys: 'Ctrl + W', desc: 'Close active window' },
    { keys: 'Ctrl + Shift + T', desc: 'Reopen last closed' },
    { keys: 'Ctrl + Tab', desc: 'Cycle windows forward' },
    { keys: 'Ctrl + Shift + Tab', desc: 'Cycle windows backward' },
    { keys: 'Ctrl + `', desc: 'Focus terminal' },
    { keys: 'Ctrl + 1-4', desc: 'Switch workspace' },
    { keys: 'Ctrl + \u2190/\u2192', desc: 'Tile window left / right' },
    { keys: 'Ctrl + \u2191', desc: 'Maximize window' },
    { keys: 'Ctrl + \u2193', desc: 'Restore / minimize window' },
    { keys: 'Ctrl + D', desc: 'Show desktop / restore all' },
    { keys: 'Ctrl + Shift + M', desc: 'Mission Control — all windows' },
    { keys: '?', desc: 'Toggle this overlay' },
    { keys: 'Escape', desc: 'Close overlay / launcher' },
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="rounded-xl p-6 shadow-2xl animate-overlay-open"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: palette.base,
          border: `1px solid ${palette.borderSubtle}`,
          minWidth: '360px',
          maxWidth: '440px',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <span
            className="text-sm font-semibold tracking-wide"
            style={{ color: palette.cyan, fontFamily: typography.mono }}
          >
            KEYBOARD SHORTCUTS
          </span>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
            style={{ color: palette.textTertiary }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${palette.cyan}15`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            ✕
          </button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1">
              <span
                className="text-xs"
                style={{ color: palette.textSecondary, fontFamily: typography.ui }}
              >
                {s.desc}
              </span>
              <kbd
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  backgroundColor: palette.void,
                  border: `1px solid ${palette.borderSubtle}`,
                  color: palette.textPrimary,
                  fontFamily: typography.mono,
                  fontSize: '11px',
                }}
              >
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <div
          className="mt-4 pt-3 text-center"
          style={{ borderTop: `1px solid ${palette.borderSubtle}` }}
        >
          <span className="text-[10px]" style={{ color: palette.textTertiary, fontFamily: typography.mono }}>
            Press ? or Escape to close
          </span>
        </div>
      </div>
    </div>
  );
}

/** Result-window app id for each IOC type `detectIOCType` / result pages can pivot to. */
const PIVOT_APP_ID: Record<string, AppId> = {
  ip: 'ip-result',
  url: 'url-result',
  domain: 'domain-result',
  hash: 'hash-result',
  cve: 'cve-result',
  wallet: 'wallet-result',
  email: 'email-result',
  extension: 'extension-result',
};

const PIVOT_TITLE_PREFIX: Record<string, string> = {
  ip: 'IP', url: 'URL', domain: 'Domain', hash: 'Hash', cve: 'CVE', wallet: 'Wallet', email: 'Email', extension: 'Extension',
};

function renderWindowContent(appId: string, data?: any, openWindow?: (config: Partial<{ appId: AppId; title: string; data?: any }> & { appId: AppId; title: string }) => string) {
  // Pivot handler handed to every result page: clicking a resolved IP, a
  // detonation domain, a cert subdomain, etc. opens a sibling result window.
  // Without it the pages hide their pivot affordances (RelatedIOCs, Host tab…).
  const pivot = openWindow
    ? (type: string, value: string) => {
        const target = PIVOT_APP_ID[type];
        if (!target || !value) return;
        const shown = type === 'hash' && value.length > 16 ? `${value.slice(0, 12)}…` : value;
        openWindow({ appId: target, title: `${PIVOT_TITLE_PREFIX[type] ?? type}: ${shown}`, data: { value } });
      }
    : undefined;

  switch (appId) {
    case 'terminal':
      return <DesktopTerminal />;
    case 'vps-terminal':
      return <DesktopVPSTerminal />;
    case 'scanner':
      return <DesktopScanner />;
    case 'browser':
      return <DesktopBrowser />;
    case 'workshop':
      return <DesktopWorkshop />;
    case 'intel':
      return <DesktopIntelDashboard data={data} />;
    case 'cases':
      return <DesktopCaseManager />;
    case 'files':
      return <DesktopGitHub />;
    case 'editor':
      return <DesktopCodeEditor initialFile={data?.initialFile} />;
    case 'monitor':
      return <DesktopSystemMonitor />;
    case 'settings':
      return <DesktopSettings />;
    case 'ip-result':
      return data?.value ? <IPResult ip={data.value} artifactId={data?.artifactId} onScan={pivot} /> : <DesktopScanner />;
    case 'url-result':
      return data?.value ? <URLResult url={data.value} onScan={pivot} /> : <DesktopScanner />;
    case 'domain-result':
      return data?.value ? <DomainResult domain={data.value} onScan={pivot} /> : <DesktopScanner />;
    case 'hash-result':
      return data?.value ? <HashResult hash={data.value} onScan={pivot} /> : <DesktopScanner />;
    case 'extension-result':
      return <ExtensionScanner initialUrl={data?.value} />;
    case 'cve-result':
      return data?.value ? <CVEResult cve={data.value} onScan={pivot} /> : <DesktopScanner />;
    case 'wallet-result':
      return data?.value ? <WalletResult address={data.value} onScan={pivot} /> : <DesktopScanner />;
    case 'email-result':
      return data?.value ? <EmailResult email={data.value} onScan={pivot} /> : <DesktopScanner />;
    case 'decoder':
      return <DecoderTool />;
    case 'defang':
      return <DefangTool />;
    case 'email-analyzer':
      return <EmailAnalyzer />;
    case 'doc-analyzer':
      return <DocAnalyzer />;
    case 'ioc-extractor':
      return <IOCExtractor />;
    case 'bulk-lookup':
      return (
        <BulkLookup
          initialIPs={data?.ips}
          onDrillDown={openWindow ? (ip: string, artifactId?: string) => openWindow({ appId: 'ip-result', title: `IP: ${ip}`, data: { value: ip, artifactId } }) : undefined}
        />
      );
    case 'extension-scanner':
      return <ExtensionScanner />;
    default:
      return (
        <div
          className="h-full flex items-center justify-center"
          style={{ backgroundColor: palette.void, color: palette.textTertiary }}
        >
          <span style={{ fontSize: '12px', fontFamily: typography.mono }}>Unknown: {appId}</span>
        </div>
      );
  }
}

function MissionControl({ onClose }: { onClose: () => void }) {
  const desktop = useDesktop();
  const allWindows = Object.values(desktop.windows);

  const byWorkspace: Record<number, typeof allWindows> = {};
  for (const w of allWindows) {
    const ws = w.pinned ? 0 : w.workspaceId;
    if (!byWorkspace[ws]) byWorkspace[ws] = [];
    byWorkspace[ws].push(w);
  }

  return (
    <div
      className="fixed inset-0 z-[9990] flex flex-col"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(10,12,14,0.84)', backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center justify-between px-8 pt-6 pb-3">
        <span style={{ color: palette.textPrimary, fontFamily: typography.ui, fontSize: '13px', fontWeight: 600 }}>Window overview</span>
        <span style={{ color: palette.textTertiary, fontFamily: typography.mono, fontSize: '11px' }}>Ctrl+Shift+M · Esc to close</span>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-6" onClick={e => e.stopPropagation()}>
        {[0, 1, 2, 3, 4].map(ws => {
          const wins = byWorkspace[ws];
          if (!wins?.length) return null;
          return (
            <div key={ws}>
              <p style={{ color: palette.textTertiary, fontFamily: typography.mono, fontSize: '10px', marginBottom: '10px' }}>
                {ws === 0 ? 'PINNED' : `WORKSPACE ${ws}`} · {wins.length} window{wins.length !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-3">
                {wins.map(win => (
                  <button
                    key={win.id}
                    onClick={() => {
                      if (win.minimized) desktop.restoreWindow(win.id);
                      else desktop.focusWindow(win.id);
                      if (win.workspaceId && !win.pinned) desktop.switchWorkspace(win.workspaceId);
                      onClose();
                    }}
                    className="flex flex-col items-start gap-2 p-3 rounded-md transition-colors text-left"
                    style={{
                      width: '160px',
                      backgroundColor: desktop.activeWindowId === win.id ? palette.surface : palette.elevated,
                      border: `1px solid ${desktop.activeWindowId === win.id ? palette.borderActive : palette.borderSubtle}`,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = palette.surface; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = desktop.activeWindowId === win.id ? palette.surface : palette.elevated; }}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <AppIconTile icon={win.icon} color={win.accentColor} size={26} iconSize={13} active={desktop.activeWindowId === win.id} />
                      <span className="text-xs font-medium truncate flex-1" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                        {win.title.length > 18 ? win.title.slice(0, 18) + '…' : win.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {win.minimized && (
                        <span className="text-[9px] px-1 rounded" style={{ backgroundColor: `${palette.amber}20`, color: palette.amber }}>MIN</span>
                      )}
                      {win.maximized && (
                        <span className="text-[9px] px-1 rounded" style={{ backgroundColor: `${palette.cyan}20`, color: palette.cyan }}>MAX</span>
                      )}
                      {win.pinned && (
                        <span className="text-[9px] px-1 rounded" style={{ backgroundColor: `${palette.green}20`, color: palette.green }}>PIN</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {allWindows.length === 0 && (
          <div className="flex-1 flex items-center justify-center" style={{ color: palette.textTertiary, fontFamily: typography.mono, fontSize: '12px' }}>
            No open windows
          </div>
        )}
      </div>
    </div>
  );
}
