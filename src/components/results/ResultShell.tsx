import type { ReactNode, ComponentType } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import type { Tone } from './resultTokens';
import { Pill } from './ResultPrimitives';

export interface ShellMenuItem<T extends string = string> {
  id: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface ResultShellProps<T extends string> {
  /** The IOC being presented, rendered in mono. */
  value: string;
  /** Small type caption above the value, e.g. "IP reputation". */
  typeLabel: string;
  /** Verdict pill next to the value. */
  verdict?: { label: string; tone: Tone };
  /** Calibrated/threat score shown beside the verdict. */
  score?: number | string;
  menuItems: ShellMenuItem<T>[];
  activeMenu: T;
  onMenuChange: (id: T) => void;
  /** 'tabs' = horizontal strip (Desktop windows); 'sidebar' = left nav (Tactical). */
  variant: 'tabs' | 'sidebar';
  proMode?: boolean;
  onToggleProMode?: () => void;
  /** Extra header actions (e.g. SummaryActions). */
  headerActions?: ReactNode;
  /** Signal-light row rendered under the verdict line (Tor/VPN/Proxy/geo chips). */
  signals?: ReactNode;
  children: ReactNode;
}

/**
 * Shared chrome for scanner result pages: header (IOC + verdict + score),
 * section navigation, and content region. Neutral operator-workstation
 * styling from tokens.ts — no scanlines, glows, or per-app halos.
 */
export function ResultShell<T extends string>({
  value, typeLabel, verdict, score, menuItems, activeMenu, onMenuChange,
  variant, proMode, onToggleProMode, headerActions, signals, children,
}: ResultShellProps<T>) {
  const nav = variant === 'sidebar' ? (
    <div
      className="w-56 flex-shrink-0 overflow-y-auto"
      style={{ background: palette.base, borderRight: `1px solid ${palette.borderDefault}` }}
    >
      <div className="p-4">
        <div className="text-[11px] font-semibold mb-3" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
          Analysis sections
        </div>
        <div className="space-y-0.5">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeMenu === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onMenuChange(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors"
                style={{
                  background: isActive ? palette.surface : 'transparent',
                  color: isActive ? palette.textPrimary : palette.textSecondary,
                  fontFamily: typography.ui,
                }}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[13px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ) : (
    <div
      className="sticky top-0 z-20 px-5"
      style={{ background: palette.elevated, borderBottom: `1px solid ${palette.borderDefault}` }}
    >
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = activeMenu === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onMenuChange(item.id)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors"
              style={{
                color: isActive ? palette.textPrimary : palette.textTertiary,
                borderBottom: `2px solid ${isActive ? palette.accent : 'transparent'}`,
                fontFamily: typography.ui,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex h-full" style={{ background: palette.elevated, fontFamily: typography.ui }}>
      {variant === 'sidebar' && nav}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {variant === 'tabs' && nav}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-7xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
              <div className="min-w-0">
                <div className="text-[11px] font-medium mb-1" style={{ color: palette.textTertiary }}>
                  {typeLabel}
                </div>
                <h1
                  className="text-2xl font-semibold break-all leading-tight"
                  style={{ color: palette.textPrimary, fontFamily: typography.mono }}
                >
                  {value}
                </h1>
                <div className="flex items-center gap-2.5 mt-2">
                  {verdict && <Pill label={verdict.label} tone={verdict.tone} />}
                  {score !== undefined && (
                    <span className="text-xs" style={{ color: palette.textSecondary }}>
                      Score <span className="font-semibold tabular-nums" style={{ color: palette.textPrimary }}>{score}</span>
                    </span>
                  )}
                </div>
                {signals && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                    {signals}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {headerActions}
                {onToggleProMode && (
                  <button
                    onClick={onToggleProMode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: proMode ? `${palette.accent}1f` : palette.float,
                      border: `1px solid ${proMode ? `${palette.accent}55` : palette.borderDefault}`,
                      color: proMode ? palette.accent : palette.textSecondary,
                      fontFamily: typography.ui,
                    }}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {proMode ? 'Pro mode' : 'Simple mode'}
                  </button>
                )}
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ResultLoadingProps {
  message: string;
}

export function ResultLoading({ message }: ResultLoadingProps) {
  return (
    <div className="flex items-center justify-center py-16" style={{ background: palette.elevated, height: '100%' }}>
      <div className="text-center">
        <div
          className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4"
          style={{ borderColor: palette.borderActive, borderTopColor: palette.accent }}
        />
        <p className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
          {message}
        </p>
      </div>
    </div>
  );
}

interface ResultErrorProps {
  title?: string;
  message: string;
}

export function ResultError({ title = 'Lookup failed', message }: ResultErrorProps) {
  return (
    <div className="flex items-center justify-center py-16 px-6" style={{ background: palette.elevated, height: '100%' }}>
      <div
        className="p-5 rounded-lg max-w-md w-full"
        style={{ background: `${palette.rose}12`, border: `1px solid ${palette.rose}40` }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: palette.rose }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: palette.rose, fontFamily: typography.ui }}>
              {title}
            </div>
            <div className="text-sm mt-1" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
              {message}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ResultEmptyProps {
  message: string;
}

export function ResultEmpty({ message }: ResultEmptyProps) {
  return (
    <div className="flex items-center justify-center py-16" style={{ background: palette.elevated, height: '100%' }}>
      <p className="text-sm" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
        {message}
      </p>
    </div>
  );
}
