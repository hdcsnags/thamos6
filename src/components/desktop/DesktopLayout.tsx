import { useState, useEffect } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { DesktopWindow } from './DesktopWindow';
import { Taskbar } from './Taskbar';
import { BootSequence } from './BootSequence';
import { AppLauncher } from './AppLauncher';
import { DesktopIcons } from './DesktopIcons';
import { DesktopTerminal } from './DesktopTerminal';
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
import { palette, typography } from '../../design-system/tokens';

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
    <div className="fixed inset-0 overflow-hidden" style={{ fontFamily: typography.ui }}>
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

