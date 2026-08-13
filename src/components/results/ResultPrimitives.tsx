import type { ReactNode } from 'react';
import { palette, typography } from '../../design-system/tokens';
import { type Tone, toneColor, toneBg, toneBorder, cardStyle } from './resultTokens';

interface PillProps {
  label: string;
  tone?: Tone;
}

/** Compact status pill — reserved for real state (verdicts, source status). */
export function Pill({ label, tone = 'neutral' }: PillProps) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold"
      style={{
        color: tone === 'neutral' ? palette.textSecondary : toneColor[tone],
        background: toneBg(tone, 0.12),
        border: `1px solid ${toneBorder(tone)}`,
        fontFamily: typography.ui,
      }}
    >
      {label}
    </span>
  );
}

interface SectionHeaderProps {
  icon?: ReactNode;
  title: string;
  actions?: ReactNode;
}

export function SectionHeader({ icon, title, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2
        className="flex items-center gap-2 text-sm font-semibold"
        style={{ color: palette.textPrimary, fontFamily: typography.ui, letterSpacing: '0.01em' }}
      >
        <span style={{ color: palette.textTertiary }}>{icon}</span>
        {title}
      </h2>
      {actions}
    </div>
  );
}

interface CalloutProps {
  icon?: ReactNode;
  title: string;
  detail?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
}

/** Tinted callout for genuinely notable findings (blocklists, Tor, detections). */
export function Callout({ icon, title, detail, tone = 'warn', children }: CalloutProps) {
  return (
    <div
      className="p-4 rounded-lg"
      style={{ background: toneBg(tone, 0.07), border: `1px solid ${toneBorder(tone)}` }}
    >
      <div className="flex items-start gap-3">
        {icon && <span className="mt-0.5 shrink-0" style={{ color: toneColor[tone] }}>{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: toneColor[tone], fontFamily: typography.ui }}>
            {title}
          </div>
          {detail && (
            <div className="text-xs mt-0.5" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
              {detail}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

interface SignalLightProps {
  label: string;
  /** Lit = the condition is present. Unlit lights render dim for constant scan positions. */
  on: boolean;
  tone?: Tone;
  /** Optional detail appended when lit, e.g. the VPN provider name. */
  detail?: string;
}

/**
 * OS-style status light: fixed-position chip with a small dot that "comes on"
 * when the condition is detected (Tor / VPN / Proxy / Hosting). Unlit chips
 * stay dim so analysts can scan the same row on every result.
 */
export function SignalLight({ label, on, tone = 'warn', detail }: SignalLightProps) {
  const litColor = toneColor[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold"
      style={{
        background: on ? toneBg(tone, 0.1) : palette.base,
        border: `1px solid ${on ? toneBorder(tone, 0.32) : palette.borderSubtle}`,
        color: on ? litColor : palette.textTertiary,
        fontFamily: typography.ui,
        letterSpacing: '0.04em',
        opacity: on ? 1 : 0.65,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: on ? litColor : palette.borderActive,
          boxShadow: on ? `0 0 5px ${litColor}88` : 'none',
        }}
      />
      {label}
      {on && detail && (
        <span className="font-medium normal-case" style={{ color: palette.textSecondary, letterSpacing: 0 }}>
          · {detail}
        </span>
      )}
    </span>
  );
}

interface ResultCardProps {
  children: ReactNode;
  className?: string;
}

/** Plain neutral card surface for grouped content. */
export function ResultCard({ children, className }: ResultCardProps) {
  return (
    <div className={`p-5 ${className || ''}`} style={cardStyle}>
      {children}
    </div>
  );
}
