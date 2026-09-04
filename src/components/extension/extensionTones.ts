import type { CSSProperties } from 'react';
import { palette, typography } from '../../design-system/tokens';
import { type Tone, toneColor, toneBg, toneBorder } from '../../components/results/resultTokens';

export type { Tone };
export { toneColor, toneBg, toneBorder };

/** Scanner risk level / finding severity → semantic tone. Low is neutral (not "good"). */
export function riskTone(level: string | undefined | null): Tone {
  switch ((level || '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'danger';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

/** Enrichment threat score → tone. Only a verified clean result (sources answered) is "good". */
export function threatTone(score: number | undefined, isMalicious: boolean | undefined, hasSources: boolean): Tone {
  if (isMalicious) return 'danger';
  if (score === undefined) return 'neutral';
  if (score >= 75) return 'danger';
  if (score >= 50) return 'warn';
  if (score >= 25) return 'neutral';
  return hasSources ? 'good' : 'neutral';
}

export function threatLabel(score: number | undefined, isMalicious: boolean | undefined, hasSources: boolean): string {
  if (isMalicious) return 'Malicious';
  if ((score ?? 0) >= 50) return 'Suspicious';
  if ((score ?? 0) >= 25) return 'Low signal';
  return hasSources ? 'Clean' : 'No signal';
}

/** Inline style for a compact state chip. */
export function chipStyle(tone: Tone, mono = false): CSSProperties {
  return {
    color: tone === 'neutral' ? palette.textSecondary : toneColor[tone],
    background: toneBg(tone, 0.12),
    border: `1px solid ${toneBorder(tone)}`,
    fontFamily: mono ? typography.mono : typography.ui,
  };
}

/** Neutral secondary button (border + float surface). */
export const secondaryButtonStyle: CSSProperties = {
  background: palette.float,
  color: palette.textSecondary,
  border: `1px solid ${palette.borderDefault}`,
  fontFamily: typography.ui,
};

/** Primary action button. */
export const primaryButtonStyle: CSSProperties = {
  background: palette.accent,
  color: palette.void,
  border: '1px solid transparent',
  fontFamily: typography.ui,
};

export const disabledButtonStyle: CSSProperties = {
  background: palette.surface,
  color: palette.textDisabled,
  border: `1px solid ${palette.borderSubtle}`,
  fontFamily: typography.ui,
  cursor: 'not-allowed',
};

/** Small section label used inside cards (11px, tertiary). */
export const fieldLabelStyle: CSSProperties = {
  color: palette.textTertiary,
  fontFamily: typography.ui,
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.02em',
};

/** Section title: sentence case, 13px semibold. */
export const sectionTitleStyle: CSSProperties = {
  color: palette.textPrimary,
  fontFamily: typography.ui,
  fontSize: '13px',
  fontWeight: 600,
};

/** Raw code / evidence block. */
export const codeBlockStyle: CSSProperties = {
  background: palette.void,
  color: palette.textSecondary,
  border: `1px solid ${palette.borderDefault}`,
  borderRadius: '8px',
  fontFamily: typography.mono,
  fontSize: '11px',
};
