// Shared style maps for the calibrated-verdict UI, so the overview VerdictStrip
// and the Verdict-tab VerdictPanel stay visually in sync. All values are
// token-based (hex / rgba strings, kit Tones) for use in inline `style`.
import type { CalibratedScoring } from '../../types';
import { palette } from '../../design-system/tokens';
import { type Tone, toneColor, toneBg, toneBorder } from '../results/resultTokens';

export interface VerdictLabelStyle {
  label: string;
  /** Text color (hex). */
  color: string;
  tone: Tone;
}

// Calibrated read (scoring.verdict) — label + color + kit tone.
// "Low signal" is inconclusive, so it stays neutral; green is reserved for the
// engine's explicit no-signal conclusion.
export const SCORING_VERDICT_LABEL: Record<CalibratedScoring['verdict'], VerdictLabelStyle> = {
  malicious: { label: 'Malicious', color: toneColor.danger, tone: 'danger' },
  suspicious: { label: 'Suspicious', color: toneColor.warn, tone: 'warn' },
  low_signal: { label: 'Low signal', color: palette.textSecondary, tone: 'neutral' },
  no_signal: { label: 'No signal', color: toneColor.good, tone: 'good' },
};

export interface SeverityStyle {
  color: string;
  bg: string;
  border: string;
}

// Abuse-category chips — colored by severity. Low severity is neutral chrome.
export const CATEGORY_SEVERITY_STYLE: Record<'high' | 'medium' | 'low', SeverityStyle> = {
  high: { color: toneColor.danger, bg: toneBg('danger', 0.12), border: toneBorder('danger') },
  medium: { color: toneColor.warn, bg: toneBg('warn', 0.12), border: toneBorder('warn') },
  low: { color: palette.textSecondary, bg: palette.base, border: palette.borderDefault },
};

// Score tone by threshold (matches the ThreatScore gauge convention).
export function scoreTone(score: number): Tone {
  if (score >= 70) return 'danger';
  if (score >= 40) return 'warn';
  if (score >= 20) return 'neutral';
  return 'good';
}

// Score-number color (hex) by threshold.
export function scoreColor(score: number): string {
  const tone = scoreTone(score);
  return tone === 'neutral' ? palette.textSecondary : toneColor[tone];
}
