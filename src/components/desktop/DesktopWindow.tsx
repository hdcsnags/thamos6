import { ReactNode, useRef, useState, useEffect, useCallback, MouseEvent } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { useContextMenu, type MenuEntry } from './ContextMenu';
import { palette, typography, accentBorder } from '../../design-system/tokens';
import { Maximize2, Minimize2, Square, Pin, PinOff, X } from 'lucide-react';

interface DesktopWindowProps {
  id: string;
  children: ReactNode;
}

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const SNAP_THRESHOLD = 20;
const TITLE_BAR_HEIGHT = 38;

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
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [genieTarget, setGenieTarget] = useState<{ x: number; y: number } | null>(null);
  const prevMinimizedRef = useRef(win?.minimized ?? false);

  // ── Minimize animation + genie target ──────────────────────────────────────
  useEffect(() => {
    const wasMinimized = prevMinimizedRef.current;
    const nowMinimized = win?.minimized ?? false;
    prevMinimizedRef.current = nowMinimized; // always update before returning
    if (nowMinimized && !wasMinimized) {
      const tabEl = document.querySelector(`[data-window-tab="${id}"]`);
      if (tabEl) {
        const rect = tabEl.getBoundingClientRect();
        setGenieTarget({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
      setIsMinimizing(true);
      const timer = setTimeout(() => {
        setIsMinimizing(false);
        setGenieTarget(null);
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [win?.minimized, id]);

  // ── Drag + resize handlers ─────────────────────────────────────────────────
  // IMPORTANT: declared before the early return below — React Rules of Hooks
  // require hooks to be called unconditionally on every render.
  useEffect(() => {
    if ((!isDragging && !isResizing) || !win) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (isDragging) {
        const rawX = e.clientX - dragStart.x;
        const rawY = e.clientY - dragStart.y;

        const viewportWidth = globalThis.window.innerWidth;
        const viewportHeight = globalThis.window.innerHeight - 48;

        // Keep at least 120 px of the window on-screen horizontally and the
        // full title bar on-screen vertically so the window is never lost.
        const clampedX = Math.max(-(win.size.width - 120), Math.min(viewportWidth - 120, rawX));
        const clampedY = Math.max(0, Math.min(viewportHeight - TITLE_BAR_HEIGHT, rawY));

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

        desktop.updateWindowPosition(id, { x: clampedX, y: clampedY });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = win.position.x;
        let newY = win.position.y;

        if (resizeDirection.includes('e')) newWidth = Math.max(MIN_WIDTH, resizeStart.width + deltaX);
        if (resizeDirection.includes('w')) {
          newWidth = Math.max(MIN_WIDTH, resizeStart.width - deltaX);
          if (newWidth > MIN_WIDTH) newX = win.position.x + deltaX;
        }
        if (resizeDirection.includes('s')) newHeight = Math.max(MIN_HEIGHT, resizeStart.height + deltaY);
        if (resizeDirection.includes('n')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStart.height - deltaY);
          if (newHeight > MIN_HEIGHT) newY = win.position.y + deltaY;
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
        const viewportHeight = globalThis.window.innerHeight - 48;

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
  }, [isDragging, isResizing, dragStart, resizeStart, resizeDirection, win?.position, win?.size, id, desktop, snapPreview]);

  // ── Right-click context menu ───────────────────────────────────────────────
  // Also a hook — must be before the early return.
  const handleTitleBarRightClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!win) return;

    const workspaceItems: MenuEntry[] = [1, 2, 3, 4]
      .filter(n => n !== win.workspaceId)
      .map(n => ({
        label: `Move to Workspace ${n}`,
        icon: `${n}`,
        action: () => desktop.moveToWorkspace(id, n),
      }));

    const items: MenuEntry[] = [
      win.maximized
        ? { label: 'Restore', icon: <Square size={14} />, action: () => desktop.restoreWindow(id) }
        : { label: 'Maximize', icon: <Maximize2 size={14} />, action: () => desktop.maximizeWindow(id) },
      { label: 'Minimize', icon: <Minimize2 size={14} />, action: () => desktop.minimizeWindow(id) },
      { type: 'divider' },
      {
        label: win.pinned ? 'Unpin from All Workspaces' : 'Pin to All Workspaces',
        icon: win.pinned ? <PinOff size={14} /> : <Pin size={14} />,
        action: () => desktop.togglePinWindow(id),
      },
      ...workspaceItems,
      { type: 'divider' },
      { label: 'Close', icon: <X size={14} />, shortcut: 'Ctrl+W', action: () => desktop.closeWindow(id), danger: true },
    ];

    showContextMenu(e.clientX, e.clientY, items);
  }, [id, win, desktop, showContextMenu]);

  // ── All hooks declared — early return is now safe ──────────────────────────
  if (!win || (win.minimized && !isMinimizing)) return null;

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
    setDragStart({ x: e.clientX - win.position.x, y: e.clientY - win.position.y });
  };

  const handleTitleBarDoubleClick = () => {
    if (win.maximized) desktop.restoreWindow(id);
    else desktop.maximizeWindow(id);
  };

  const handleResizeMouseDown = (e: MouseEvent, direction: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    setResizeStart({ x: e.clientX, y: e.clientY, width: win.size.width, height: win.size.height });
  };

  // ── Genie minimize transform ───────────────────────────────────────────────
  // Translates + scales the window toward its taskbar tab.
  // translate(dx,dy) scale(s): scale around center, then translate by (dx,dy).
  let genieTransform = 'translate(0,0) scale(1)';
  if (isMinimizing) {
    if (genieTarget && !win.maximized) {
      const centerX = win.position.x + win.size.width / 2;
      const centerY = win.position.y + win.size.height / 2;
      const dx = genieTarget.x - centerX;
      const dy = genieTarget.y - centerY;
      genieTransform = `translate(${dx}px, ${dy}px) scale(0.05)`;
    } else {
      genieTransform = 'translate(0, 60px) scale(0.05)';
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const style: React.CSSProperties = win.maximized
    ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: 'calc(100vh - 48px)', zIndex: win.zIndex }
    : { position: 'fixed', top: win.position.y, left: win.position.x, width: win.size.width, height: win.size.height, zIndex: win.zIndex };

  // Layered shadow: contact + mid + ambient, plus subtle ring on active
  const boxShadow = isActive
    ? `0 0 0 1px ${win.accentColor}20, 0 1px 3px rgba(0,0,0,0.55), 0 6px 20px rgba(0,0,0,0.48), 0 28px 64px rgba(0,0,0,0.62), 0 0 48px ${win.accentColor}08`
    : '0 1px 2px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.38), 0 18px 44px rgba(0,0,0,0.48)';

  const activeBorder = isActive ? accentBorder(win.accentColor, 0.3) : palette.borderSubtle;

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
          backgroundColor: 'rgba(17, 20, 26, 0.82)',
          border: `1px solid ${activeBorder}`,
          backdropFilter: 'blur(24px)',
          boxShadow,
          // Inactive windows: full opacity but dimmer chrome (handled in title bar gradient)
          opacity: isMinimizing ? 0 : 1,
          transform: genieTransform,
          pointerEvents: isMinimizing ? 'none' : 'auto',
          transition: isDragging || isResizing
            ? 'box-shadow 300ms ease, border-color 300ms ease'
            : [
                'top 250ms cubic-bezier(0.25,0.1,0.25,1)',
                'left 250ms cubic-bezier(0.25,0.1,0.25,1)',
                'width 250ms cubic-bezier(0.25,0.1,0.25,1)',
                'height 250ms cubic-bezier(0.25,0.1,0.25,1)',
                'box-shadow 300ms ease',
                'border-color 300ms ease',
                'border-radius 250ms ease-out',
                'opacity 280ms cubic-bezier(0.4,0,1,1)',
                'transform 280ms cubic-bezier(0.4,0,1,1)',
              ].join(', '),
        }}
        onMouseDown={handleMouseDown}
      >
        {/* ── Title bar ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-3 select-none cursor-move"
          style={{
            height: `${TITLE_BAR_HEIGHT}px`,
            flexShrink: 0,
            // Inactive windows get a noticeably darker, muted chrome — not just dimmer opacity
            background: isActive
              ? 'linear-gradient(to bottom, rgba(30,34,43,0.95), rgba(17,20,26,0.88))'
              : 'linear-gradient(to bottom, rgba(14,16,20,0.96), rgba(10,12,16,0.92))',
            boxShadow: isActive
              ? `inset 0 1px 0 ${win.accentColor}15, inset 0 -1px 0 ${win.accentColor}08`
              : 'none',
            borderBottom: `1px solid ${isActive ? accentBorder(win.accentColor, 0.1) : palette.borderSubtle}`,
            fontFamily: typography.ui,
          }}
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleTitleBarDoubleClick}
          onContextMenu={handleTitleBarRightClick}
          onMouseEnter={() => setTitleHovered(true)}
          onMouseLeave={() => setTitleHovered(false)}
        >
          <div className="flex items-center gap-2 pl-1">
            <span style={{ color: isActive ? win.accentColor : palette.textDisabled }}>
              <win.icon size={14} />
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: isActive ? palette.textPrimary : palette.textDisabled,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontFamily: typography.mono,
              }}
            >
              {win.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {win.pinned && (
              <span title="Pinned to all workspaces" style={{ color: palette.cyan, opacity: 0.7 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
                </svg>
              </span>
            )}
            <div className="w-px h-4 mx-1" style={{ backgroundColor: palette.borderSubtle }} />

            {/* Traffic lights — relative + z-10 so they always win hit-test against resize handles */}
            <div className="relative z-10 flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); desktop.minimizeWindow(id); }}
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
                  if (win.maximized) desktop.restoreWindow(id);
                  else desktop.maximizeWindow(id);
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
              <button
                onClick={(e) => { e.stopPropagation(); desktop.closeWindow(id); }}
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
            </div>
          </div>
        </div>

        {/* ── Content area ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto" style={{ fontFamily: typography.mono }}>
          {children}
        </div>

        {/* ── Resize handles ────────────────────────────────────────────── */}
        {!win.maximized && (
          <>
            {/* Edge handles */}
            <div
              className="absolute top-0 left-0 w-full cursor-n-resize"
              style={{ height: '4px' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
            />
            <div
              className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 's')}
            />
            <div
              className="absolute left-0 cursor-w-resize"
              style={{ top: TITLE_BAR_HEIGHT, bottom: 0, width: '4px' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
            />
            <div
              className="absolute right-0 cursor-e-resize"
              style={{ top: TITLE_BAR_HEIGHT, bottom: 0, width: '4px' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
            />
            {/* Corner handles — start BELOW the title bar to avoid blocking the traffic-light buttons */}
            <div
              className="absolute left-0 w-6 h-6 cursor-nw-resize"
              style={{ top: TITLE_BAR_HEIGHT }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
            />
            <div
              className="absolute right-0 w-6 h-6 cursor-ne-resize"
              style={{ top: TITLE_BAR_HEIGHT }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
            />
            <div
              className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
            />
            <div
              className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize"
              onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
            />
          </>
        )}
      </div>
    </>
  );
}
