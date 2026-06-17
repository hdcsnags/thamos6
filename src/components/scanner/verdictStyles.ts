// Shared style maps for the calibrated-verdict UI, so the overview VerdictStrip
// and the Verdict-tab VerdictPanel stay visually in sync.
import type { CalibratedScoring } from '../../types';

// Calibrated read (scoring.verdict) — label + text color.
export const SCORING_VERDICT_LABEL: Record<CalibratedScoring['verdict'], { label: string; cls: string }> = {
  malicious: { label: 'MALICIOUS', cls: 'text-rose-400' },
  suspicious: { label: 'SUSPICIOUS', cls: 'text-amber-400' },
  low_signal: { label: 'LOW SIGNAL', cls: 'text-cyan-400' },
  no_signal: { label: 'NO SIGNAL', cls: 'text-emerald-400' },
};

// Abuse-category chips — colored by severity.
export const CATEGORY_SEVERITY_STYLE: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-slate-500/15 text-slate-300 border-slate-600/40',
};

// Score-number color by threshold (matches the ThreatScore gauge convention).
export function scoreColor(score: number): string {
  if (score >= 70) return 'text-rose-400';
  if (score >= 40) return 'text-amber-400';
  if (score >= 20) return 'text-yellow-400';
  return 'text-emerald-400';
}
