import { useState, useRef, useCallback } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { useContextMenu } from './ContextMenu';
import { palette, typography } from '../../design-system/tokens';
import { getDesktopIcons } from '../../design-system/appRegistry';

const GRID_COL = 84;
const GRID_ROW = 92;
const MARGIN_X = 16;
const MARGIN_Y = 16;
const DRAG_THRESHOLD = 5;
const POSITIONS_KEY = 'thamos6-desktop-icon-positions';

interface IconPos {
  col: number;
  row: number;
}

function loadPositions(): Record<string, IconPos> {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePositions(positions: Record<string, IconPos>) {
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {}
}

export function DesktopIcons() {
  const desktop = useDesktop();
  const { showContextMenu } = useContextMenu();
  const icons = getDesktopIcons();
  const containerRef = useRef<HTMLDivElement>(null);

  const defaultPositions = Object.fromEntries(
    icons.map((app, i) => [app.id, { col: 0, row: i }])
  );

  const [positions, setPositions] = useState<Record<string, IconPos>>(() => {
    const saved = loadPositions();
    return { ...defaultPositions, ...saved };
  });

  const [dragging, setDragging] = useState<string | null>(null);
  const dragState = useRef<{
    appId: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    hasDragged: boolean;
  } | null>(null);

  const handleDoubleClick = (app: ReturnType<typeof getDesktopIcons>[number]) => {
    desktop.openWindow({
      appId: app.id,
      title: app.name,
      icon: app.icon,
      accentColor: app.accentColor,
    });
  };

  const snapToGrid = useCallback((clientX: number, clientY: number) => {
    const col = Math.round((clientX - MARGIN_X) / GRID_COL);
    const row = Math.round((clientY - MARGIN_Y) / GRID_ROW);
    return {
      col: Math.max(0, col),
      row: Math.max(0, row),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, appId: string) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    dragState.current = {
      appId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      hasDragged: false,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const state = dragState.current;
      if (!state) return;

      const dx = Math.abs(ev.clientX - state.startX);
      const dy = Math.abs(ev.clientY - state.startY);

      if (!state.hasDragged && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        state.hasDragged = true;
        setDragging(appId);
      }

      if (state.hasDragged) {
        const el = containerRef.current?.querySelector(`[data-icon-id="${appId}"]`) as HTMLElement;
        if (el) {
          el.style.left = `${ev.clientX - state.offsetX}px`;
          el.style.top = `${ev.clientY - state.offsetY}px`;
          el.style.zIndex = '100';
        }
      }
    };

    const handleMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const state = dragState.current;
      dragState.current = null;

      if (!state) return;

      const el = containerRef.current?.querySelector(`[data-icon-id="${appId}"]`) as HTMLElement;
      if (el) {
        el.style.left = '';
        el.style.top = '';
        el.style.zIndex = '';
      }

      if (state.hasDragged) {
        const snapped = snapToGrid(
          ev.clientX - state.offsetX + GRID_COL / 2,
          ev.clientY - state.offsetY + GRID_ROW / 2
        );
        setPositions(prev => {
          const next = { ...prev, [appId]: snapped };
          savePositions(next);
          return next;
        });
        setDragging(null);
      }
      // If !hasDragged, this was just a click — do nothing, let onDoubleClick handle it
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  }, [snapToGrid]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-10 pointer-events-none">
      {icons.map(app => {
        const pos = positions[app.id] || { col: 0, row: 0 };
        const isDragging = dragging === app.id;

        return (
          <button
            key={app.id}
            data-icon="true"
            data-icon-id={app.id}
            onDoubleClick={() => handleDoubleClick(app)}
            onMouseDown={(e) => handleMouseDown(e, app.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              showContextMenu(e.clientX, e.clientY, [
                { label: `Open ${app.name}`, icon: <app.icon size={14} />, action: () => handleDoubleClick(app) },
                { label: 'Open in Workspace 2', icon: <span className="text-[10px] font-mono">2</span>, action: () => desktop.openWindow({ appId: app.id, title: app.name, icon: app.icon, accentColor: app.accentColor, workspaceId: 2 }) },
                { label: 'Open in Workspace 3', icon: <span className="text-[10px] font-mono">3</span>, action: () => desktop.openWindow({ appId: app.id, title: app.name, icon: app.icon, accentColor: app.accentColor, workspaceId: 3 }) },
              ]);
            }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all hover:bg-white/5 pointer-events-auto group absolute"
            style={{
              width: `${GRID_COL - 8}px`,
              left: isDragging ? undefined : `${MARGIN_X + pos.col * GRID_COL}px`,
              top: isDragging ? undefined : `${MARGIN_Y + pos.row * GRID_ROW}px`,
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          >
            <div
              className="transition-transform group-hover:scale-110"
              style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))', color: app.accentColor }}
            >
              <app.icon size={28} />
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
        );
      })}
    </div>
  );
}
