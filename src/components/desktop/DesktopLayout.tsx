import { useState, useEffect, useCallback } from 'react';
import { useDesktop, type AppId } from '../../contexts/DesktopContext';
import { DesktopWindow } from './DesktopWindow';
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
import { DesktopWorkshop } from './DesktopWorkshop';
import { DesktopSystemMonitor } from './DesktopSystemMonitor';
import { DesktopIntelDashboard } from './DesktopIntelDashboard';
import { DesktopCaseManager } from './DesktopCaseManager';
import { DesktopBrowser } from './DesktopBrowser';
import { DesktopSettings } from './DesktopSettings';
import { DesktopGitHub } from './DesktopGitHub';
import { DesktopCodeEditor } from '../editor/DesktopCodeEditor';
import { DesktopClock } from './DesktopClock';
import { ToastProvider } from './ToastNotifications';
import { ContextMenuProvider, useContextMenu, type MenuEntry } from './ContextMenu';
import { palette, typography } from '../../design-system/tokens';

function DesktopContent() {
  const desktop = useDesktop();
  const { showContextMenu } = useContextMenu();
  const [showLauncher, setShowLauncher] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [closedHistory, setClosedHistory] = useState<Array<{ appId: string; title: string }>>([]);

  // Restore layout on boot
  useEffect(() => {
    if (desktop.bootComplete && Object.keys(desktop.windows).length === 0) {
      const restored = desktop.restoreSavedLayout();
      if (!restored) {
        desktop.openWindow({
          appId: 'terminal',
          title: 'Terminal',
          position: { x: 100, y: 60 },
          size: { width: 900, height: 550 },
        });
        desktop.openWindow({
          appId: 'monitor',
          title: 'System Monitor',
          pinned: true,
          position: { x: window.innerWidth - 420, y: 20 },
        });
      }
    }
  }, [desktop.bootComplete]);

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
    const vh = window.innerHeight - 44; // taskbar height

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

      if (mod && e.key === 'k') {
        e.preventDefault();
        setShowLauncher(prev => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (showLauncher) { setShowLauncher(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
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
      { label: 'New Terminal', icon: '\u2318', shortcut: 'Ctrl+`', action: () => desktop.openWindow({ appId: 'terminal', title: 'Terminal' }) },
      { label: 'VPS Terminal', icon: '\uD83D\uDDA5', action: () => desktop.openWindow({ appId: 'vps-terminal', title: 'VPS Terminal' }) },
      { type: 'divider' },
      { label: 'App Launcher', icon: '\u2630', shortcut: 'Ctrl+K', action: () => setShowLauncher(true) },
      { label: 'Settings', icon: '\u2699', action: () => desktop.openWindow({ appId: 'settings', title: 'Settings' }) },
      { type: 'divider' },
      { label: 'Workspace 1', action: () => desktop.switchWorkspace(1), shortcut: 'Ctrl+1' },
      { label: 'Workspace 2', action: () => desktop.switchWorkspace(2), shortcut: 'Ctrl+2' },
      { label: 'Workspace 3', action: () => desktop.switchWorkspace(3), shortcut: 'Ctrl+3' },
      { label: 'Workspace 4', action: () => desktop.switchWorkspace(4), shortcut: 'Ctrl+4' },
    ];

    if (closedHistory.length > 0) {
      items.splice(5, 0, {
        label: `Reopen: ${closedHistory[closedHistory.length - 1].title}`,
        icon: '\u21A9',
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
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${palette.base} 0%, ${palette.void} 100%)`,
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(148, 163, 184, 0.3) 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.6) 100%)',
          }}
        />
      </div>

      <DesktopIcons />
      <DesktopClock />

      {visibleWindows.map(window => (
        <DesktopWindow key={window.id} id={window.id}>
          {renderWindowContent(window.appId, window.data)}
        </DesktopWindow>
      ))}

      {showLauncher && <AppLauncher onClose={() => setShowLauncher(false)} />}

      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}

      <Taskbar onOpenLauncher={() => setShowLauncher(true)} />
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

function renderWindowContent(appId: string, data?: any) {
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
      return <DesktopIntelDashboard />;
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
      return <IPResult ip={data?.value} />;
    case 'url-result':
      return <URLResult url={data?.value} />;
    case 'domain-result':
      return <DomainResult domain={data?.value} />;
    case 'hash-result':
      return <HashResult hash={data?.value} />;
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
