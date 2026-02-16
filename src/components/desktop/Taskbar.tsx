import { useState, useEffect } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { useAlerts } from '../../contexts/AlertContext';
import { Bell } from 'lucide-react';

interface TaskbarProps {
  onOpenLauncher: () => void;
}

export function Taskbar({ onOpenLauncher }: TaskbarProps) {
  const desktop = useDesktop();
  const { unreadCount } = useAlerts();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const openWindows = Object.values(desktop.windows).filter(
    w => w.workspaceId === desktop.activeWorkspace || w.pinned
  );

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-11 flex items-center justify-between px-3 gap-3 backdrop-blur-xl z-50"
      style={{
        backgroundColor: '#0a0e1a99',
        borderTop: '1px solid #1a1f35',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenLauncher}
          className="flex items-center justify-center w-8 h-8 rounded transition-colors hover:bg-cyan-500/10"
          style={{ color: '#00d9ff' }}
          aria-label="Open App Launcher"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
          </svg>
        </button>

        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map(num => (
            <button
              key={num}
              onClick={() => desktop.switchWorkspace(num)}
              className="flex items-center justify-center w-8 h-8 rounded text-xs font-mono transition-all"
              style={{
                backgroundColor: desktop.activeWorkspace === num ? '#00d9ff20' : 'transparent',
                color: desktop.activeWorkspace === num ? '#00d9ff' : '#8a8fa8',
                border: desktop.activeWorkspace === num ? '1px solid #00d9ff40' : '1px solid transparent',
              }}
              aria-label={`Switch to workspace ${num}`}
            >
              {num}
            </button>
          ))}
        </div>

        <div className="w-px h-6" style={{ backgroundColor: '#1a1f35' }} />

        <div className="flex items-center gap-2 overflow-x-auto max-w-2xl">
          {openWindows.map(window => (
            <button
              key={window.id}
              onClick={() => {
                if (window.minimized) {
                  desktop.restoreWindow(window.id);
                } else {
                  desktop.focusWindow(window.id);
                }
              }}
              className="flex items-center gap-2 px-3 h-8 rounded text-xs font-mono transition-all whitespace-nowrap"
              style={{
                backgroundColor: desktop.activeWindowId === window.id ? `${window.accentColor}20` : 'transparent',
                color: desktop.activeWindowId === window.id ? window.accentColor : '#8a8fa8',
                border: `1px solid ${desktop.activeWindowId === window.id ? window.accentColor + '40' : 'transparent'}`,
                opacity: window.minimized ? 0.5 : 1,
              }}
              aria-label={`Focus ${window.title}`}
            >
              <span>{window.icon}</span>
              <span className="max-w-[120px] truncate">{window.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1" title="Agent Status">
            <div className="w-2 h-2 rounded-full bg-green-500" title="ThamOS-X: Online" />
            <div className="w-2 h-2 rounded-full bg-orange-500" title="ThamOS-Y: Online" />
            <div className="w-2 h-2 rounded-full bg-blue-500" title="ThamOS-Z: Online" />
          </div>

          <div className="w-px h-4" style={{ backgroundColor: '#1a1f35' }} />

          <div className="relative">
            <button
              className="flex items-center justify-center w-8 h-8 rounded transition-colors hover:bg-amber-500/10"
              style={{ color: '#fbbf24' }}
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold"
                  style={{ backgroundColor: '#ff0080', color: '#fff' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="text-xs font-mono" style={{ color: '#c8cde0' }}>
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      </div>
    </div>
  );
}
