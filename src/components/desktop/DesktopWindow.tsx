import { ReactNode, useRef, useState, useEffect, useCallback, MouseEvent } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { useContextMenu, type MenuEntry } from './ContextMenu';
import { palette, typography, shadows, accentBorder } from '../../design-system/tokens';

interface DesktopWindowProps {
  id: string;
  children: ReactNode;
}

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const SNAP_THRESHOLD = 20;

export function DesktopWindow({ id, children }: DesktopWindowProps) {
  const desktop = useDesktop();
  const { showContextMenu } = useContextMenu();
  const win = desktop.windows[id];
  const windowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [resizeDirection, setResizeDirection] = useState<string>('');
  const [snapPreview, setSnapPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [titleHovered, setTitleHovered] = useState(false);

  if (!win || win.minimized) return null;

  const isActive = desktop.activeWindowId === id;

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    desktop.focusWindow(id);
  };

  const handleTitleBarMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (win.maximized) return;
    e.stopPropagation();

    setIsDragging(true);
    setDragStart({
      x: e.clientX - win.position.x,
      y: e.clientY - win.position.y,
    });
  };

  const handleTitleBarDoubleClick = () => {
    if (win.maximized) {
      desktop.restoreWindow(id);
    } else {
      desktop.maximizeWindow(id);
    }
  };

  const handleTitleBarRightClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const workspaceItems: MenuEntry[] = [1, 2, 3, 4]
      .filter(n => n !== win.workspaceId)
      .map(n => ({
        label: `Move to Workspace ${n}`,
        icon: `${n}`,
        action: () => desktop.moveToWorkspace(id, n),
      }));

    const items: MenuEntry[] = [
      win.maximized
        ? { label: 'Restore', icon: '\u2750', action: () => desktop.restoreWindow(id) }
        : { label: 'Maximize', icon: '\u2B1C', action: () => desktop.maximizeWindow(id) },
      { label: 'Minimize', icon: '\u2500', action: () => desktop.minimizeWindow(id) },
      { type: 'divider' },
      { label: win.pinned ? 'Unpin from All Workspaces' : 'Pin to All Workspaces', icon: '\uD83D\uDCCC', action: () => desktop.togglePinWindow(id) },
      ...workspaceItems,
      { type: 'divider' },
      { label: 'Close', icon: '\u2717', shortcut: 'Ctrl+W', action: () => desktop.closeWindow(id), danger: true },
    ];

    showContextMenu(e.clientX, e.clientY, items);
  }, [id, win, desktop, showContextMenu]);

  const handleResizeMouseDown = (e: MouseEvent, direction: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    setIsResizing(true);
    setResizeDirection(direction);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: win.size.width,
      height: win.size.height,
    });
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;

        const viewportWidth = globalThis.window.innerWidth;
        const viewportHeight = globalThis.window.innerHeight - 44;

        if (e.clientX < SNAP_THRESHOLD && e.clientY < SNAP_THRESHOLD) {
          setSnapPreview({ x: 0, y: 0, width: viewportWidth / 2, height: viewportHeight / 2 });
        } else if (e.clientX > viewportWidth - SNAP_THRESHOLD && e.clientY < SNAP_THRESHOLD) {
          setSnapPreview({ x: viewportWidth / 2, y: 0, width: viewportWidth / 2, height: viewportHeight / 2 });
        } else if (e.clientY < SNAP_THRESHOLD) {
          setSnapPreview({ x: 0, y: 0, width: viewportWidth, height: viewportHeight });
        } else if (e.clientX < SNAP_THRESHOLD) {
          setSnapPreview({ x: 0, y: 0, width: viewportWidth / 2, height: viewportHeight });
        } else if (e.clientX > viewportWidth - SNAP_THRESHOLD) {
          setSnapPreview({ x: viewportWidth / 2, y: 0, width: viewportWidth / 2, height: viewportHeight });
        } else {
          setSnapPreview(null);
        }

        desktop.updateWindowPosition(id, { x: newX, y: newY });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = win.position.x;
        let newY = win.position.y;

        if (resizeDirection.includes('e')) {
          newWidth = Math.max(MIN_WIDTH, resizeStart.width + deltaX);
        }
        if (resizeDirection.includes('w')) {
          newWidth = Math.max(MIN_WIDTH, resizeStart.width - deltaX);
          if (newWidth > MIN_WIDTH) {
            newX = win.position.x + deltaX;
          }
        }
        if (resizeDirection.includes('s')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStart.height + deltaY);
        }
        if (resizeDirection.includes('n')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStart.height - deltaY);
          if (newHeight > MIN_HEIGHT) {
            newY = win.position.y + deltaY;
          }
        }

        desktop.updateWindowSize(id, { width: newWidth, height: newHeight });
        if (newX !== win.position.x || newY !== win.position.y) {
          desktop.updateWindowPosition(id, { x: newX, y: newY });
        }
      }
    };

    const handleMouseUp = (e: globalThis.MouseEvent) => {
      if (isDragging && snapPreview) {
        const viewportWidth = globalThis.window.innerWidth;
        const viewportHeight = globalThis.window.innerHeight - 44;

        if (e.clientX < SNAP_THRESHOLD && e.clientY < SNAP_THRESHOLD) {
          desktop.updateWindowPosition(id, { x: 0, y: 0 });
          desktop.updateWindowSize(id, { width: viewportWidth / 2, height: viewportHeight / 2 });
        } else if (e.clientX > viewportWidth - SNAP_THRESHOLD && e.clientY < SNAP_THRESHOLD) {
          desktop.updateWindowPosition(id, { x: viewportWidth / 2, y: 0 });
          desktop.updateWindowSize(id, { width: viewportWidth / 2, height: viewportHeight / 2 });
        } else if (e.clientY < SNAP_THRESHOLD) {
          desktop.maximizeWindow(id);
        } else if (e.clientX < SNAP_THRESHOLD) {
          desktop.updateWindowPosition(id, { x: 0, y: 0 });
          desktop.updateWindowSize(id, { width: viewportWidth / 2, height: viewportHeight });
        } else if (e.clientX > viewportWidth - SNAP_THRESHOLD) {
          desktop.updateWindowPosition(id, { x: viewportWidth / 2, y: 0 });
          desktop.updateWindowSize(id, { width: viewportWidth / 2, height: viewportHeight });
        }
        setSnapPreview(null);
      }

      setIsDragging(false);
      setIsResizing(false);
      setResizeDirection('');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart, resizeDirection, win.position, win.size, id, desktop, snapPreview]);

  const style: React.CSSProperties = win.maximized
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: 'calc(100vh - 44px)',
        zIndex: win.zIndex,
      }
    : {
        position: 'fixed',
        top: win.position.y,
        left: win.position.x,
        width: win.size.width,
        height: win.size.height,
        zIndex: win.zIndex,
      };

  const activeBorder = isActive
    ? accentBorder(win.accentColor, 0.3)
    : palette.borderSubtle;

  const activeGlow = isActive
    ? `0 0 40px ${win.accentColor}10, ${shadows.windowActive}`
    : shadows.window;

  return (
    <>
      {snapPreview && (
        <div
          className="fixed pointer-events-none rounded-xl"
          style={{
            top: snapPreview.y + 4,
            left: snapPreview.x + 4,
            width: snapPreview.width - 8,
            height: snapPreview.height - 8,
            background: `${win.accentColor}08`,
            border: `2px solid ${win.accentColor}40`,
            zIndex: 9999,
          }}
        />
      )}
      <div
        ref={windowRef}
        data-window="true"
        className="flex flex-col overflow-hidden animate-window-open"
        style={{
          ...style,
          borderRadius: win.maximized ? 0 : '12px',
          backgroundColor: palette.elevated,
          border: `1px solid ${activeBorder}`,
          backdropFilter: 'blur(24px)',
          boxShadow: activeGlow,
          transition: isDragging || isResizing ? 'none' : 'box-shadow 300ms cubic-bezier(0.25, 0.1, 0.25, 1), border-color 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
          opacity: isActive ? 1 : 0.85,
        }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="flex items-center justify-between px-3 select-none cursor-move"
          style={{
            height: '38px',
            background: isActive 
              ? `linear-gradient(to bottom, ${palette.surface}, ${palette.elevated})`
              : `linear-gradient(to bottom, ${palette.float}, ${palette.elevated})`,
            borderBottom: `1px solid ${isActive ? accentBorder(win.accentColor, 0.1) : palette.borderSubtle}`,
            fontFamily: typography.ui,
          }}
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleTitleBarDoubleClick}
          onContextMenu={handleTitleBarRightClick}
          onMouseEnter={() => setTitleHovered(true)}
          onMouseLeave={() => setTitleHovered(false)}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                desktop.closeWindow(id);
              }}
              className="w-3 h-3 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90"
              style={{ backgroundColor: '#f43f5e', boxShadow: isActive ? '0 0 8px #f43f5e40' : 'none' }}
              aria-label="Close"
            >
              {titleHovered && (
                <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                  <path d="M1 1L5 5M5 1L1 5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                desktop.minimizeWindow(id);
              }}
              className="w-3 h-3 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90"
              style={{ backgroundColor: '#f59e0b', boxShadow: isActive ? '0 0 8px #f59e0b40' : 'none' }}
              aria-label="Minimize"
            >
              {titleHovered && (
                <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                  <path d="M1 3H5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (win.maximized) {
                  desktop.restoreWindow(id);
                } else {
                  desktop.maximizeWindow(id);
                }
              }}
              className="w-3 h-3 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90"
              style={{ backgroundColor: '#00ff9d', boxShadow: isActive ? '0 0 8px #00ff9d40' : 'none' }}
              aria-label="Maximize"
            >
              {titleHovered && (
                <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                  <path d="M1 1.5H5V4.5H1V1.5Z" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2 transition-all"
               style={{ opacity: isActive ? 1 : 0.6 }}>
            <span className="text-sm">{win.icon}</span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: isActive ? palette.textPrimary : palette.textSecondary,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontFamily: typography.mono,
              }}
            >
              {win.title}
            </span>
          </div>

          <div className="flex items-center gap-3 pr-1">
            {win.pinned && (
              <span title="Pinned to all workspaces" style={{ color: palette.cyan }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
                </svg>
              </span>
            )}
            <div className="text-[10px] font-mono text-slate-500 opacity-40">
              {win.size.width}x{win.size.height}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto" style={{ fontFamily: typography.mono }}>
          {children}
        </div>

        {!win.maximized && (
          <>
            <div
              className="absolute top-0 left-0 w-full h-1 cursor-n-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
            />
            <div
              className="absolute bottom-0 left-0 w-full h-1 cursor-s-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 's')}
            />
            <div
              className="absolute top-0 left-0 h-full w-1 cursor-w-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
            />
            <div
              className="absolute top-0 right-0 h-full w-1 cursor-e-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
            />
            <div
              className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
            />
            <div
              className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
            />
            <div
              className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
            />
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
            />
          </>
        )}
      </div>
    </>
  );
}
