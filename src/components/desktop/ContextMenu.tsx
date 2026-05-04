import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef } from 'react';
import { palette, typography } from '../../design-system/tokens';

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MenuDivider {
  type: 'divider';
}

type MenuEntry = MenuItem | MenuDivider;

interface ContextMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

interface ContextMenuContextType {
  showContextMenu: (x: number, y: number, items: MenuEntry[]) => void;
  hideContextMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | undefined>(undefined);

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

export type { MenuItem, MenuDivider, MenuEntry };

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const showContextMenu = useCallback((x: number, y: number, items: MenuEntry[]) => {
    // Adjust position to keep menu on screen
    const menuWidth = 200;
    const menuHeight = items.length * 32;
    const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
    const adjustedY = y + menuHeight > window.innerHeight - 44 ? y - menuHeight : y;
    setMenu({ x: Math.max(0, adjustedX), y: Math.max(0, adjustedY), items });
  }, []);

  const hideContextMenu = useCallback(() => {
    setMenu(null);
  }, []);

  // Close on any click or Escape
  useEffect(() => {
    if (!menu) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };

    // Use setTimeout to avoid closing immediately from the same right-click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu]);

  return (
    <ContextMenuContext.Provider value={{ showContextMenu, hideContextMenu }}>
      {children}
      {menu && (
        <div
          ref={menuRef}
          className="fixed rounded-lg overflow-hidden backdrop-blur-xl"
          style={{
            top: menu.y,
            left: menu.x,
            zIndex: 99999,
            minWidth: '180px',
            backgroundColor: `${palette.float}f0`,
            border: `1px solid ${palette.borderActive}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            fontFamily: typography.ui,
            animation: 'ctx-menu-in 100ms cubic-bezier(0.25, 0.1, 0.25, 1)',
          }}
        >
          <div className="py-1">
            {menu.items.map((item, i) => {
              if ('type' in item && item.type === 'divider') {
                return (
                  <div
                    key={`divider-${i}`}
                    className="my-1 mx-2"
                    style={{ height: '1px', backgroundColor: palette.borderDefault }}
                  />
                );
              }

              const menuItem = item as MenuItem;
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (!menuItem.disabled) {
                      menuItem.action();
                      setMenu(null);
                    }
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors"
                  style={{
                    fontSize: '12px',
                    color: menuItem.disabled
                      ? palette.textDisabled
                      : menuItem.danger
                        ? palette.rose
                        : palette.textPrimary,
                    opacity: menuItem.disabled ? 0.5 : 1,
                    cursor: menuItem.disabled ? 'default' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!menuItem.disabled) {
                      e.currentTarget.style.backgroundColor = `${palette.cyan}10`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  disabled={menuItem.disabled}
                >
                  <div className="flex items-center gap-2">
                    {menuItem.icon && <span className="text-xs w-4 text-center">{menuItem.icon}</span>}
                    <span>{menuItem.label}</span>
                  </div>
                  {menuItem.shortcut && (
                    <span
                      className="text-[10px] ml-4"
                      style={{ color: palette.textDisabled, fontFamily: typography.mono }}
                    >
                      {menuItem.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ctx-menu-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </ContextMenuContext.Provider>
  );
}
