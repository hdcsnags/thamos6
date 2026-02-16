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
  { id: 'terminal', name: 'Terminal', icon: '⌘', description: 'Command line interface', accentColor: '#00ff9d' },
  { id: 'scanner', name: 'Scanner', icon: '🔍', description: 'Threat intelligence scanner', accentColor: '#00d9ff' },
  { id: 'browser', name: 'Browser', icon: '🌐', description: 'Internal tools browser', accentColor: '#00d9ff' },
  { id: 'workshop', name: 'AI Workshop', icon: '🤖', description: 'Multi-agent chat interface', accentColor: '#00ff9d' },
  { id: 'intel', name: 'Intel Dashboard', icon: '📡', description: 'Threat feeds and news', accentColor: '#00d9ff' },
  { id: 'cases', name: 'Case Manager', icon: '📋', description: 'Incident case notes', accentColor: '#00ff9d' },
  { id: 'files', name: 'File Manager', icon: '📁', description: 'GitHub repository browser', accentColor: '#b794f6' },
  { id: 'editor', name: 'Code Editor', icon: '📝', description: 'Code editing workspace', accentColor: '#fbbf24' },
  { id: 'monitor', name: 'System Monitor', icon: '📊', description: 'System status and metrics', accentColor: '#fbbf24' },
  { id: 'settings', name: 'Settings', icon: '⚙️', description: 'Application settings', accentColor: '#8a8fa8' },
];

export function AppLauncher({ onClose }: AppLauncherProps) {
  const desktop = useDesktop();

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
        className="w-full max-w-4xl p-8 rounded-xl"
        style={{
          backgroundColor: '#0a0e1a',
          border: '1px solid #1a1f35',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 className="text-2xl font-mono font-bold" style={{ color: '#00d9ff' }}>
            Applications
          </h2>
          <p className="text-sm font-mono mt-1" style={{ color: '#8a8fa8' }}>
            Select an app to launch
          </p>
        </div>

        <div className="grid grid-cols-5 gap-4">
          {APPS.map(app => (
            <button
              key={app.id}
              onClick={() => handleAppClick(app)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg transition-all hover:scale-105 group"
              style={{
                backgroundColor: '#0f1424',
                border: '1px solid #1a1f35',
              }}
            >
              <div
                className="text-3xl mb-2 transition-transform group-hover:scale-110"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
              >
                {app.icon}
              </div>
              <div className="text-sm font-mono font-semibold text-center" style={{ color: app.accentColor }}>
                {app.name}
              </div>
              <div className="text-xs font-mono text-center" style={{ color: '#8a8fa8' }}>
                {app.description}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded font-mono text-sm transition-colors"
            style={{
              backgroundColor: '#1a1f35',
              color: '#c8cde0',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
