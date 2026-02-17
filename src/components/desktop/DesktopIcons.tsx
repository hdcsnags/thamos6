import { useDesktop } from '../../contexts/DesktopContext';
import { palette, typography } from '../../design-system/tokens';
import { getDesktopIcons } from '../../design-system/appRegistry';

export function DesktopIcons() {
  const desktop = useDesktop();
  const icons = getDesktopIcons();

  const handleDoubleClick = (app: ReturnType<typeof getDesktopIcons>[number]) => {
    desktop.openWindow({
      appId: app.id,
      title: app.name,
      icon: app.icon,
      accentColor: app.accentColor,
    });
  };

  return (
    <div className="fixed top-4 left-4 flex flex-col gap-3 z-10 pointer-events-none">
      {icons.map(app => (
        <button
          key={app.id}
          onDoubleClick={() => handleDoubleClick(app)}
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all hover:bg-white/5 pointer-events-auto group"
          style={{ width: '76px' }}
        >
          <div
            className="text-2xl transition-transform group-hover:scale-110"
            style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }}
          >
            {app.icon}
          </div>
          <div
            className="text-center leading-tight"
            style={{
              fontSize: '10px',
              fontFamily: typography.ui,
              fontWeight: 500,
              color: palette.textSecondary,
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              letterSpacing: '-0.01em',
            }}
          >
            {app.name}
          </div>
        </button>
      ))}
    </div>
  );
}
