import type { ReactNode } from 'react';
import { palette, typography } from '../../design-system/tokens';
import { type Tone, toneColor, toneBg, toneBorder } from './resultTokens';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the value. */
  detail?: ReactNode;
  icon?: ReactNode;
  /** Colors the value and, when highlight is set, the card surface. */
  tone?: Tone;
  /** Tint the whole card (reserved for real state: warnings, detections). */
  highlight?: boolean;
  /** Render the value in mono (IOCs, ASNs, coordinates). */
  mono?: boolean;
}

export function MetricCard({ label, value, detail, icon, tone = 'neutral', highlight = false, mono = false }: MetricCardProps) {
  return (
    <div
      className="p-4"
      style={{
        background: highlight ? toneBg(tone) : palette.base,
        border: `1px solid ${highlight ? toneBorder(tone) : palette.borderDefault}`,
        borderRadius: '9px',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1" style={{ color: palette.textTertiary }}>
        {icon}
        <span className="text-[11px] font-medium" style={{ fontFamily: typography.ui, letterSpacing: '0.02em' }}>
          {label}
        </span>
      </div>
      <div
        className="text-base font-semibold leading-snug"
        style={{
          color: tone === 'neutral' ? palette.textPrimary : toneColor[tone],
          fontFamily: mono ? typography.mono : typography.ui,
        }}
      >
        {value}
      </div>
      {detail && (
        <div className="text-xs mt-0.5" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
          {detail}
        </div>
      )}
    </div>
  );
}

interface StatCellProps {
  label: string;
  value: number | string;
  tone?: Tone;
}

/** Compact numeric stat (e.g. VirusTotal malicious/suspicious/clean counts). */
export function StatCell({ label, value, tone = 'neutral' }: StatCellProps) {
  return (
    <div
      className="p-3 text-center"
      style={{
        background: toneBg(tone, 0.06),
        border: `1px solid ${toneBorder(tone, 0.18)}`,
        borderRadius: '8px',
      }}
    >
      <div
        className="text-xl font-bold tabular-nums"
        style={{ color: tone === 'neutral' ? palette.textSecondary : toneColor[tone], fontFamily: typography.ui }}
      >
        {value}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
        {label}
      </div>
    </div>
  );
}
