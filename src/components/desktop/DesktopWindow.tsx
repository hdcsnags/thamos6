import { ReactNode, useRef, useState, useEffect, MouseEvent } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';

interface DesktopWindowProps {
  id: string;
  children: ReactNode;
}

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const SNAP_THRESHOLD = 20;

export function DesktopWindow({ id, children }: DesktopWindowProps) {
  const desktop = useDesktop();
  const window = desktop.windows[id];
  const windowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [resizeDirection, setResizeDirection] = useState<string>('');
  const [snapPreview, setSnapPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  if (!window || window.minimized) return null;

  const isActive = desktop.activeWindowId === id;

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    desktop.focusWindow(id);
  };

  const handleTitleBarMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (window.maximized) return;
    e.stopPropagation();

    setIsDragging(true);
    setDragStart({
      x: e.clientX - window.position.x,
      y: e.clientY - window.position.y,
    });
  };

  const handleTitleBarDoubleClick = () => {
    if (window.maximized) {
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
      width: window.size.width,
      height: window.size.height,
    });
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight - 44;

        if (e.clientY < SNAP_THRESHOLD) {
          setSnapPreview({ x: 0, y: 0, width: viewportWidth, height: viewportHeight });
        } else if (e.clientX < SNAP_THRESHOLD) {
          setSnapPreview({ x: 0, y: 0, width: viewportWidth / 2, height: viewportHeight });
        } else if (e.clientX > viewportWidth - SNAP_THRESHOLD) {
          setSnapPreview({ x: viewportWidth / 2, y: 0, width: viewportWidth / 2, height: viewportHeight });
        } else if (e.clientX < SNAP_THRESHOLD && e.clientY < SNAP_THRESHOLD) {
          setSnapPreview({ x: 0, y: 0, width: viewportWidth / 2, height: viewportHeight / 2 });
        } else if (e.clientX > viewportWidth - SNAP_THRESHOLD && e.clientY < SNAP_THRESHOLD) {
          setSnapPreview({ x: viewportWidth / 2, y: 0, width: viewportWidth / 2, height: viewportHeight / 2 });
        } else {
          setSnapPreview(null);
        }

        desktop.updateWindowPosition(id, { x: newX, y: newY });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = window.position.x;
        let newY = window.position.y;

        if (resizeDirection.includes('e')) {
          newWidth = Math.max(MIN_WIDTH, resizeStart.width + deltaX);
        }
        if (resizeDirection.includes('w')) {
          newWidth = Math.max(MIN_WIDTH, resizeStart.width - deltaX);
          if (newWidth > MIN_WIDTH) {
            newX = window.position.x + deltaX;
          }
        }
        if (resizeDirection.includes('s')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStart.height + deltaY);
        }
        if (resizeDirection.includes('n')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStart.height - deltaY);
          if (newHeight > MIN_HEIGHT) {
            newY = window.position.y + deltaY;
          }
        }

        desktop.updateWindowSize(id, { width: newWidth, height: newHeight });
        if (newX !== window.position.x || newY !== window.position.y) {
          desktop.updateWindowPosition(id, { x: newX, y: newY });
        }
      }
    };

    const handleMouseUp = (e: globalThis.MouseEvent) => {
      if (isDragging && snapPreview) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight - 44;

        if (e.clientY < SNAP_THRESHOLD) {
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
  }, [isDragging, isResizing, dragStart, resizeStart, resizeDirection, window.position, window.size, id, desktop, snapPreview]);

  const style: React.CSSProperties = window.maximized
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: 'calc(100vh - 44px)',
        zIndex: window.zIndex,
      }
    : {
        position: 'fixed',
        top: window.position.y,
        left: window.position.x,
        width: window.size.width,
        height: window.size.height,
        zIndex: window.zIndex,
      };

  return (
    <>
      {snapPreview && (
        <div
          className="fixed pointer-events-none border-2 bg-cyan-500/10"
          style={{
            top: snapPreview.y,
            left: snapPreview.x,
            width: snapPreview.width,
            height: snapPreview.height,
            borderColor: window.accentColor,
            zIndex: 9999,
          }}
        />
      )}
      <div
        ref={windowRef}
        className="flex flex-col overflow-hidden rounded-lg shadow-2xl transition-shadow"
        style={{
          ...style,
          backgroundColor: '#0a0e1a',
          border: `1px solid ${window.accentColor}40`,
          boxShadow: isActive
            ? `0 0 0 1px ${window.accentColor}30, 0 12px 48px rgba(0,0,0,0.6)`
            : '0 12px 48px rgba(0,0,0,0.6)',
        }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="flex items-center justify-between px-4 h-10 cursor-move select-none"
          style={{
            background: 'linear-gradient(to bottom, #0f1424, #0a0e1a)',
            borderBottom: `1px solid ${window.accentColor}20`,
          }}
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleTitleBarDoubleClick}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                desktop.closeWindow(id);
              }}
              className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
              aria-label="Close"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                desktop.minimizeWindow(id);
              }}
              className="w-3 h-3 rounded-full bg-amber-500 hover:bg-amber-400 transition-colors"
              aria-label="Minimize"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.maximized) {
                  desktop.restoreWindow(id);
                } else {
                  desktop.maximizeWindow(id);
                }
              }}
              className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors"
              aria-label="Maximize"
            />
          </div>

          <div className="flex items-center gap-2 text-sm font-mono" style={{ color: '#c8cde0' }}>
            <span>{window.icon}</span>
            <span>{window.title}</span>
          </div>

          <div className="w-[60px]" />
        </div>

        <div className="flex-1 overflow-auto" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {children}
        </div>

        {!window.maximized && (
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
