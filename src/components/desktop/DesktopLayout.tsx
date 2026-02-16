import { useState, useEffect } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { DesktopWindow } from './DesktopWindow';
import { Taskbar } from './Taskbar';
import { BootSequence } from './BootSequence';
import { AppLauncher } from './AppLauncher';
import { DesktopIcons } from './DesktopIcons';
import { DesktopTerminal } from './DesktopTerminal';
import { DesktopIPResult } from './DesktopIPResult';
import { DesktopURLResult } from './DesktopURLResult';
import { DesktopDomainResult } from './DesktopDomainResult';
import { DesktopHashResult } from './DesktopHashResult';

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
      return <ScannerPlaceholder />;
    case 'browser':
      return <BrowserPlaceholder />;
    case 'workshop':
      return <WorkshopPlaceholder />;
    case 'intel':
      return <IntelPlaceholder />;
    case 'cases':
      return <CasesPlaceholder />;
    case 'files':
      return <FilesPlaceholder />;
    case 'editor':
      return <EditorPlaceholder />;
    case 'monitor':
      return <MonitorPlaceholder />;
    case 'settings':
      return <SettingsPlaceholder />;
    case 'ip-result':
      return <DesktopIPResult ip={data?.value} flags={data?.flags} />;
    case 'url-result':
      return <DesktopURLResult url={data?.value} flags={data?.flags} />;
    case 'domain-result':
      return <DesktopDomainResult domain={data?.value} flags={data?.flags} />;
    case 'hash-result':
      return <DesktopHashResult hash={data?.value} flags={data?.flags} />;
    default:
      return <div className="p-8">Unknown app: {appId}</div>;
  }
}

function TerminalPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#00ff9d' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">⌘</div>
        <div className="text-xl mb-2">Terminal</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Coming soon...</div>
      </div>
    </div>
  );
}

function ScannerPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#00d9ff' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">🔍</div>
        <div className="text-xl mb-2">Scanner</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Coming soon...</div>
      </div>
    </div>
  );
}

function BrowserPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#00d9ff' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">🌐</div>
        <div className="text-xl mb-2">Browser</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Coming soon...</div>
      </div>
    </div>
  );
}

function WorkshopPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#00ff9d' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">🤖</div>
        <div className="text-xl mb-2">AI Workshop</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Phase 2</div>
      </div>
    </div>
  );
}

function IntelPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#00d9ff' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">📡</div>
        <div className="text-xl mb-2">Intel Dashboard</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Coming soon...</div>
      </div>
    </div>
  );
}

function CasesPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#00ff9d' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">📋</div>
        <div className="text-xl mb-2">Case Manager</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Coming soon...</div>
      </div>
    </div>
  );
}

function FilesPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#b794f6' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">📁</div>
        <div className="text-xl mb-2">File Manager</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Phase 3</div>
      </div>
    </div>
  );
}

function EditorPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#fbbf24' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">📝</div>
        <div className="text-xl mb-2">Code Editor</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Phase 4</div>
      </div>
    </div>
  );
}

function MonitorPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#fbbf24' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">📊</div>
        <div className="text-xl mb-2">System Monitor</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Coming soon...</div>
      </div>
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#8a8fa8' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">⚙️</div>
        <div className="text-xl mb-2">Settings</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Coming soon...</div>
      </div>
    </div>
  );
}

function ResultPlaceholder({ type, data }: { type: string; data?: any }) {
  return (
    <div className="h-full p-6 flex items-center justify-center" style={{ backgroundColor: '#060610', color: '#00d9ff' }}>
      <div className="text-center">
        <div className="text-6xl mb-4">🔍</div>
        <div className="text-xl mb-2">{type} Result</div>
        <div className="text-sm" style={{ color: '#8a8fa8' }}>Coming soon...</div>
      </div>
    </div>
  );
}
