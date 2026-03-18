import { useEffect, useRef } from 'react';
import { useToast } from './ToastNotifications';
import { palette, typography } from '../../design-system/tokens';

interface NotificationCenterProps {
  onClose: () => void;
}

const TOAST_COLORS: Record<string, { accent: string; icon: string }> = {
  info: { accent: palette.cyan, icon: '\u24D8' },
  success: { accent: palette.green, icon: '\u2713' },
  warning: { accent: palette.amber, icon: '\u26A0' },
  error: { accent: palette.rose, icon: '\u2717' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const { history, clearHistory } = useToast();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const reversed = [...history].reverse();

  return (
    <div
      ref={panelRef}
      className="fixed bottom-12 right-3 z-[9998] animate-overlay-open"
      style={{
        width: '340px',
        maxHeight: '480px',
        backgroundColor: palette.elevated,
        border: `1px solid ${palette.borderDefault}`,
        borderRadius: '12px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        fontFamily: typography.ui,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${palette.borderSubtle}` }}
      >
        <span
          className="text-xs font-semibold tracking-wider"
          style={{ color: palette.cyan, fontFamily: typography.mono }}
        >
          NOTIFICATIONS
        </span>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[10px] px-2 py-0.5 rounded transition-colors"
              style={{ color: palette.textTertiary }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${palette.rose}15`; e.currentTarget.style.color = palette.rose; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = palette.textTertiary; }}
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center rounded transition-colors"
            style={{ color: palette.textTertiary }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${palette.cyan}15`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span className="text-xs">&times;</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
        {reversed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span style={{ fontSize: '24px', opacity: 0.2 }}>{'\uD83D\uDD14'}</span>
            <span className="mt-2 text-xs" style={{ color: palette.textDisabled }}>No notifications</span>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {reversed.map((toast) => {
              const colors = TOAST_COLORS[toast.type] || TOAST_COLORS.info;
              return (
                <div
                  key={toast.id}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors"
                  style={{ cursor: 'default' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${palette.surface}`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span
                    className="flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold shrink-0 mt-0.5"
                    style={{ color: colors.accent }}
                  >
                    {colors.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate" style={{ color: palette.textPrimary }}>
                        {toast.title}
                      </span>
                      <span className="text-[10px] shrink-0 tabular-nums" style={{ color: palette.textDisabled }}>
                        {formatTime(toast.timestamp)}
                      </span>
                    </div>
                    {toast.message && (
                      <div className="text-[11px] mt-0.5 leading-tight" style={{ color: palette.textTertiary }}>
                        {toast.message}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
