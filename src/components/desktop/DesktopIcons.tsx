import { useDesktop, AppId } from '../../contexts/DesktopContext';

interface DesktopIcon {
  id: AppId;
  name: string;
  icon: string;
  accentColor: string;
}

const DESKTOP_ICONS: DesktopIcon[] = [
  { id: 'terminal', name: 'Terminal', icon: '⌘', accentColor: '#00ff9d' },
  { id: 'scanner', name: 'Scanner', icon: '🔍', accentColor: '#00d9ff' },
  { id: 'browser', name: 'Browser', icon: '🌐', accentColor: '#00d9ff' },
  { id: 'files', name: 'Files', icon: '📁', accentColor: '#b794f6' },
  { id: 'settings', name: 'Settings', icon: '⚙️', accentColor: '#8a8fa8' },
];

export function DesktopIcons() {
  const desktop = useDesktop();

  const handleDoubleClick = (icon: DesktopIcon) => {
    desktop.openWindow({
      appId: icon.id,
      title: icon.name,
      icon: icon.icon,
      accentColor: icon.accentColor,
    });
  };

  return (
    <div className="fixed top-4 left-4 flex flex-col gap-4 z-10 pointer-events-none">
      {DESKTOP_ICONS.map(icon => (
        <button
          key={icon.id}
          onDoubleClick={() => handleDoubleClick(icon)}
          className="flex flex-col items-center gap-1 p-3 rounded-lg transition-all hover:bg-white/5 pointer-events-auto group"
          style={{
            width: '80px',
          }}
        >
          <div
            className="text-3xl transition-transform group-hover:scale-110"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
          >
            {icon.icon}
          </div>
          <div
            className="text-xs font-mono text-center font-semibold"
            style={{
              color: icon.accentColor,
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            }}
          >
            {icon.name}
          </div>
        </button>
      ))}
    </div>
  );
}
