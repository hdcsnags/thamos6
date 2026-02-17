import { ReactNode, useRef, useState, useEffect, MouseEvent } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
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
    ? accentBorder(win.accentColor, 0.15)
    : palette.borderSubtle;

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
        className="flex flex-col overflow-hidden animate-window-open"
        style={{
          ...style,
          borderRadius: win.maximized ? 0 : '12px',
          backgroundColor: palette.elevated,
          border: `1px solid ${activeBorder}`,
          backdropFilter: 'blur(24px)',
          boxShadow: isActive ? shadows.windowActive : shadows.window,
          transition: isDragging || isResizing ? 'none' : 'box-shadow 250ms cubic-bezier(0.25, 0.1, 0.25, 1), border-color 250ms cubic-bezier(0.25, 0.1, 0.25, 1)',
          opacity: isActive ? 1 : 0.92,
        }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="flex items-center justify-between px-3 select-none cursor-move"
          style={{
            height: '36px',
            background: `linear-gradient(to bottom, ${palette.float}, ${palette.elevated})`,
            borderBottom: `1px solid ${palette.borderSubtle}`,
            fontFamily: typography.ui,
          }}
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleTitleBarDoubleClick}
          onMouseEnter={() => setTitleHovered(true)}
          onMouseLeave={() => setTitleHovered(false)}
        >
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                desktop.closeWindow(id);
              }}
              className="w-3 h-3 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: '#f43f5e' }}
              aria-label="Close"
            >
              {titleHovered && (
                <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                  <path d="M1 1L5 5M5 1L1 5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                desktop.minimizeWindow(id);
              }}
              className="w-3 h-3 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: '#f59e0b' }}
              aria-label="Minimize"
            >
              {titleHovered && (
                <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                  <path d="M1 3H5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" strokeLinecap="round" />
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
              className="w-3 h-3 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: '#00d9a3' }}
              aria-label="Maximize"
            >
              {titleHovered && (
                <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                  <path d="M1 1.5H5V4.5H1V1.5Z" stroke="rgba(0,0,0,0.5)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
            <span className="text-xs" style={{ opacity: 0.6 }}>{win.icon}</span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: palette.textSecondary,
                letterSpacing: '-0.01em',
              }}
            >
              {win.title}
            </span>
          </div>

          <div className="w-[60px]" />
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
