import { useState, useEffect } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { DesktopWindow } from './DesktopWindow';
import { Taskbar } from './Taskbar';
import { BootSequence } from './BootSequence';
import { AppLauncher } from './AppLauncher';
import { DesktopIcons } from './DesktopIcons';
import { DesktopTerminal } from './DesktopTerminal';
import { DesktopScanner } from './DesktopScanner';
import { DesktopIPResult } from './DesktopIPResult';
import { DesktopURLResult } from './DesktopURLResult';
import { DesktopDomainResult } from './DesktopDomainResult';
import { DesktopHashResult } from './DesktopHashResult';
import { DesktopWorkshop } from './DesktopWorkshop';
import { DesktopSystemMonitor } from './DesktopSystemMonitor';
import { DesktopIntelDashboard } from './DesktopIntelDashboard';
import { DesktopCaseManager } from './DesktopCaseManager';
import { DesktopBrowser } from './DesktopBrowser';
import { DesktopSettings } from './DesktopSettings';

export function DesktopLayout() {
  const desktop = useDesktop();
  const [showLauncher, setShowLauncher] = useState(false);

  useEffect(() => {
    if (desktop.bootComplete && Object.keys(desktop.windows).length === 0) {
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
  }, [desktop.bootComplete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowLauncher(prev => !prev);
      }

      if (e.key === 'Escape' && showLauncher) {
        setShowLauncher(false);
      }

      if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        desktop.switchWorkspace(parseInt(e.key));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLauncher, desktop]);

  if (!desktop.bootComplete) {
    return <BootSequence onComplete={desktop.setBootComplete} />;
  }

  const visibleWindows = desktop.getVisibleWindows();

  return (
    <div className="fixed inset-0 overflow-hidden font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, #080c14 0%, #020204 100%)',
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, #fff 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 255, 157, 0.3) 2px,
              rgba(0, 255, 157, 0.3) 4px
            )`,
          }}
        />

        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.8) 100%)',
          }}
        />
      </div>

      <DesktopIcons />

      {visibleWindows.map(window => (
        <DesktopWindow key={window.id} id={window.id}>
          {renderWindowContent(window.appId, window.data)}
        </DesktopWindow>
      ))}

      {showLauncher && <AppLauncher onClose={() => setShowLauncher(false)} />}

      <Taskbar onOpenLauncher={() => setShowLauncher(true)} />
    </div>
  );
}

function renderWindowContent(appId: string, data?: any) {
  switch (appId) {
    case 'terminal':
      return <DesktopTerminal />;
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
      return <FilesPlaceholder />;
    case 'editor':
      return <EditorPlaceholder />;
    case 'monitor':
      return <DesktopSystemMonitor />;
    case 'settings':
      return <DesktopSettings />;
    case 'ip-result':
      return <DesktopIPResult ip={data?.value} flags={data?.flags} />;
    case 'url-result':
      return <DesktopURLResult url={data?.value} flags={data?.flags} />;
    case 'domain-result':
      return <DesktopDomainResult domain={data?.value} flags={data?.flags} />;
    case 'hash-result':
      return <DesktopHashResult hash={data?.value} flags={data?.flags} />;
    default:
      return <div className="h-full flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#8a8fa8', fontFamily: 'JetBrains Mono, monospace' }}><span className="text-xs">Unknown: {appId}</span></div>;
  }
}

function FilesPlaceholder() {
  return (
    <div className="h-full flex flex-col items-center justify-center" style={{ backgroundColor: '#060610', fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(183, 148, 246, 0.08)', border: '1px solid rgba(183, 148, 246, 0.2)' }}>
        <span className="text-2xl" style={{ color: '#b794f6' }}>&#9670;</span>
      </div>
      <span className="text-xs font-medium mb-1" style={{ color: '#c8cde0' }}>File Manager</span>
      <span className="text-xs" style={{ color: '#3a3f55' }}>Requires GitHub OAuth (Phase 3)</span>
    </div>
  );
}

function EditorPlaceholder() {
  return (
    <div className="h-full flex flex-col items-center justify-center" style={{ backgroundColor: '#060610', fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
        <span className="text-2xl" style={{ color: '#fbbf24' }}>&#9670;</span>
      </div>
      <span className="text-xs font-medium mb-1" style={{ color: '#c8cde0' }}>Code Editor</span>
      <span className="text-xs" style={{ color: '#3a3f55' }}>Requires CodeMirror (Phase 4)</span>
    </div>
  );
}
