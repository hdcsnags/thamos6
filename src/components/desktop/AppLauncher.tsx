import { useState, useEffect, useRef } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { palette, typography } from '../../design-system/tokens';
import { getLaunchableApps, searchApps, getAppsByCategory, type AppDefinition } from '../../design-system/appRegistry';
import { Search } from 'lucide-react';

interface AppLauncherProps {
  onClose: () => void;
}

type Category = 'all' | 'core' | 'intel' | 'tools' | 'system';

const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: 'all', label: 'All', color: palette.cyan },
  { id: 'core', label: 'Core', color: palette.green },
  { id: 'intel', label: 'Intel', color: palette.cyan },
  { id: 'tools', label: 'Tools', color: palette.amber },
  { id: 'system', label: 'System', color: palette.textSecondary },
];

export function AppLauncher({ onClose }: AppLauncherProps) {
  const desktop = useDesktop();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? searchApps(search)
    : category === 'all'
      ? getLaunchableApps()
      : getAppsByCategory(category).filter(a => a.keywords.length > 0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search, category]);

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

  const handleAppClick = (app: AppDefinition) => {
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
      style={{ backgroundColor: `${palette.void}80` }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl p-5 animate-launcher-open"
        style={{
          backgroundColor: palette.elevated,
          border: `1px solid ${palette.borderDefault}`,
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          fontFamily: typography.ui,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="mb-3">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              backgroundColor: palette.base,
              border: `1px solid ${palette.borderSubtle}`,
            }}
          >
            <Search className="w-4 h-4" style={{ color: palette.textTertiary }} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setCategory('all'); }}
              placeholder="Search apps, commands..."
              className="flex-1 bg-transparent focus:outline-none"
              style={{
                fontSize: '14px',
                color: palette.textPrimary,
                fontFamily: typography.ui,
              }}
            />
            <kbd
              className="px-1.5 py-0.5 rounded text-[10px]"
              style={{
                backgroundColor: palette.float,
                color: palette.textDisabled,
                border: `1px solid ${palette.borderSubtle}`,
              }}
            >
              ESC
            </kbd>
          </div>
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="flex items-center gap-1 mb-3">
            {CATEGORIES.map(cat => {
              const isActive = category === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor: isActive ? `${cat.color}12` : 'transparent',
                    color: isActive ? cat.color : palette.textTertiary,
                    border: `1px solid ${isActive ? `${cat.color}25` : 'transparent'}`,
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}

        {/* App grid */}
        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <span style={{ fontSize: '13px', color: palette.textTertiary }}>No matching apps</span>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {filtered.map((app, i) => (
              <button
                key={app.id}
                onClick={() => handleAppClick(app)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all group"
                style={{
                  backgroundColor: i === selectedIndex ? `${app.accentColor}10` : palette.base,
                  border: `1px solid ${i === selectedIndex ? `${app.accentColor}30` : palette.borderSubtle}`,
                }}
              >
                <div
                  className="mb-0.5 transition-transform group-hover:scale-110"
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))', color: app.accentColor }}
                >
                  <app.icon size={28} />
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: i === selectedIndex ? app.accentColor : palette.textPrimary,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {app.name}
                </div>
                <div
                  className="text-center leading-tight"
                  style={{
                    fontSize: '10px',
                    color: palette.textTertiary,
                  }}
                >
                  {app.description}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Footer hints */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {[
              { key: 'arrows', label: 'navigate' },
              { key: 'enter', label: 'launch' },
              { key: 'esc', label: 'close' },
            ].map(hint => (
              <div key={hint.key} className="flex items-center gap-1.5">
                <kbd
                  className="px-1.5 py-0.5 rounded"
                  style={{
                    fontSize: '10px',
                    backgroundColor: palette.base,
                    border: `1px solid ${palette.borderSubtle}`,
                    color: palette.textDisabled,
                  }}
                >
                  {hint.key}
                </kbd>
                <span style={{ fontSize: '10px', color: palette.textDisabled }}>{hint.label}</span>
              </div>
            ))}
          </div>
          <span className="text-[10px]" style={{ color: palette.textDisabled }}>
            {filtered.length} app{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
