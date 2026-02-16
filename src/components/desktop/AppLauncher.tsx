import { useState, useEffect, useRef } from 'react';
import { useDesktop, AppId } from '../../contexts/DesktopContext';

interface AppLauncherProps {
  onClose: () => void;
}

interface App {
  id: AppId;
  name: string;
  icon: string;
  description: string;
  accentColor: string;
}

const APPS: App[] = [
  { id: 'terminal', name: 'Terminal', icon: '\u2318', description: 'Command line interface', accentColor: '#00ff9d' },
  { id: 'scanner', name: 'Scanner', icon: '\uD83D\uDD0D', description: 'Threat intelligence scanner', accentColor: '#00d9ff' },
  { id: 'browser', name: 'Browser', icon: '\uD83C\uDF10', description: 'Internal tools browser', accentColor: '#00d9ff' },
  { id: 'workshop', name: 'AI Workshop', icon: '\uD83E\uDD16', description: 'Multi-agent chat interface', accentColor: '#00ff9d' },
  { id: 'intel', name: 'Intel Dashboard', icon: '\uD83D\uDCE1', description: 'Threat feeds and news', accentColor: '#00d9ff' },
  { id: 'cases', name: 'Case Manager', icon: '\uD83D\uDCCB', description: 'Incident case notes', accentColor: '#00ff9d' },
  { id: 'files', name: 'File Manager', icon: '\uD83D\uDCC1', description: 'GitHub repository browser', accentColor: '#b794f6' },
  { id: 'editor', name: 'Code Editor', icon: '\uD83D\uDCDD', description: 'Code editing workspace', accentColor: '#fbbf24' },
  { id: 'monitor', name: 'System Monitor', icon: '\uD83D\uDCCA', description: 'System status and metrics', accentColor: '#fbbf24' },
  { id: 'settings', name: 'Settings', icon: '\u2699\uFE0F', description: 'Application settings', accentColor: '#8a8fa8' },
];

export function AppLauncher({ onClose }: AppLauncherProps) {
  const desktop = useDesktop();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? APPS.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase())
      )
    : APPS;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === 'ArrowRight') {
        setSelectedIndex(i => {
          const cols = 5;
          const next = i + cols;
          return next < filtered.length ? next : i;
        });
      }
      if (e.key === 'ArrowLeft') {
        setSelectedIndex(i => {
          const cols = 5;
          const prev = i - cols;
          return prev >= 0 ? prev : i;
        });
      }
      if (e.key === 'Enter' && filtered.length > 0) {
        handleAppClick(filtered[selectedIndex]);
      }
    };

    globalThis.window.addEventListener('keydown', handleKeyDown);
    return () => globalThis.window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onClose]);

  const handleAppClick = (app: App) => {
    desktop.openWindow({
      appId: app.id,
      title: app.name,
      icon: app.icon,
      accentColor: app.accentColor,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: '#06061080' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl p-6 rounded-xl"
        style={{
          backgroundColor: '#0a0e1a',
          border: '1px solid #1a1f35',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search applications..."
            className="w-full px-4 py-3 text-sm rounded-lg focus:outline-none font-mono"
            style={{
              backgroundColor: '#0f1424',
              border: '1px solid #1a1f35',
              color: '#c8cde0',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <span className="text-sm font-mono" style={{ color: '#3a3f55' }}>No matching apps</span>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {filtered.map((app, i) => (
              <button
                key={app.id}
                onClick={() => handleAppClick(app)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg transition-all group"
                style={{
                  backgroundColor: i === selectedIndex ? `${app.accentColor}10` : '#0f1424',
                  border: `1px solid ${i === selectedIndex ? `${app.accentColor}40` : '#1a1f35'}`,
                }}
              >
                <div
                  className="text-3xl mb-1 transition-transform group-hover:scale-110"
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
                >
                  {app.icon}
                </div>
                <div className="text-xs font-mono font-semibold text-center" style={{ color: app.accentColor }}>
                  {app.name}
                </div>
                <div className="text-[10px] font-mono text-center leading-tight" style={{ color: '#8a8fa8' }}>
                  {app.description}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#0f1424', border: '1px solid #1a1f35', color: '#3a3f55' }}>
              arrows
            </span>
            <span className="text-[10px] font-mono" style={{ color: '#3a3f55' }}>navigate</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#0f1424', border: '1px solid #1a1f35', color: '#3a3f55' }}>
              enter
            </span>
            <span className="text-[10px] font-mono" style={{ color: '#3a3f55' }}>launch</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#0f1424', border: '1px solid #1a1f35', color: '#3a3f55' }}>
              esc
            </span>
            <span className="text-[10px] font-mono" style={{ color: '#3a3f55' }}>close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
