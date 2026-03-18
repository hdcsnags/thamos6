import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef } from 'react';
import { palette, typography } from '../../design-system/tokens';

type ToastType = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  timestamp: number;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => void;
  toasts: Toast[];
  history: Toast[];
  clearHistory: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

const TOAST_COLORS: Record<ToastType, { accent: string; icon: string }> = {
  info: { accent: palette.cyan, icon: '\u24D8' },
  success: { accent: palette.green, icon: '\u2713' },
  warning: { accent: palette.amber, icon: '\u26A0' },
  error: { accent: palette.rose, icon: '\u2717' },
};

const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [history, setHistory] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id' | 'timestamp'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newToast: Toast = { ...toast, id, timestamp: Date.now() };
    const duration = toast.duration ?? DEFAULT_DURATION;

    setToasts(prev => [...prev.slice(-4), newToast]); // Keep max 5
    setHistory(prev => [...prev.slice(-49), newToast]); // Keep last 50 in history

    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    timersRef.current.set(id, timer);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  return (
    <ToastContext.Provider value={{ addToast, toasts, history, clearHistory }}>
      {children}
      <div
        className="fixed bottom-14 right-3 flex flex-col gap-2 z-[9999]"
        style={{ maxWidth: '360px', pointerEvents: 'none' }}
      >
        {toasts.map((toast, i) => {
          const colors = TOAST_COLORS[toast.type];
          return (
            <div
              key={toast.id}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg backdrop-blur-xl"
              style={{
                backgroundColor: `${palette.elevated}ee`,
                border: `1px solid ${colors.accent}30`,
                boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${colors.accent}10`,
                pointerEvents: 'auto',
                animation: 'toast-slide-in 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                opacity: 1,
              }}
            >
              <span
                className="flex items-center justify-center w-5 h-5 rounded-md text-xs font-bold shrink-0 mt-0.5"
                style={{
                  backgroundColor: `${colors.accent}15`,
                  color: colors.accent,
                  border: `1px solid ${colors.accent}25`,
                }}
              >
                {colors.icon}
              </span>

              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-medium leading-tight"
                  style={{ color: palette.textPrimary }}
                >
                  {toast.title}
                </div>
                {toast.message && (
                  <div
                    className="text-[11px] leading-tight mt-0.5"
                    style={{ color: palette.textTertiary }}
                  >
                    {toast.message}
                  </div>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-xs shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center rounded hover:bg-white/5 transition-colors"
                style={{ color: palette.textDisabled }}
              >
                &times;
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateX(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
