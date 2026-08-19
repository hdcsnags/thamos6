import type { Tone } from '../results';
import type { BulkIPResult } from '../../types';

export const VERDICT_TONE: Record<string, { label: string; tone: Tone }> = {
  malicious: { label: 'Malicious', tone: 'danger' },
  suspicious: { label: 'Suspicious', tone: 'warn' },
  low_signal: { label: 'Low signal', tone: 'accent' },
  no_signal: { label: 'No signal', tone: 'good' },
};

/** Calibrated verdict → tone, matching the single-IP result page's mapping. Shared by every Bulk Lookup tab. */
export function verdictFor(result: BulkIPResult): { label: string; tone: Tone } {
  if (result.scoring) return VERDICT_TONE[result.scoring.verdict] ?? VERDICT_TONE.no_signal;
  return result.isMalicious ? VERDICT_TONE.malicious : VERDICT_TONE.no_signal;
}
