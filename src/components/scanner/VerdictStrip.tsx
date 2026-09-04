import type { CalibratedScoring } from '../../types';
import { palette, typography } from '../../design-system/tokens';
import { cardStyle } from '../results/resultTokens';
import { SCORING_VERDICT_LABEL, CATEGORY_SEVERITY_STYLE, scoreColor } from './verdictStyles';

interface VerdictStripProps {
  scoring?: CalibratedScoring;
}

/**
 * Compact, verdict-forward summary for the TOP of a result page's overview.
 * Answers "how bad / what is it" at a glance: calibrated score + verdict as the
 * hero, legacy shown small for comparison, and the abuse-category chips. The
 * deep breakdown / variance / Ask-THAMOS live in the dedicated Verdict tab.
 */
export default function VerdictStrip({ scoring }: VerdictStripProps) {
  if (!scoring) return null;

  const { calibrated, legacy, verdict, categories } = scoring;
  const v = SCORING_VERDICT_LABEL[verdict];
  const diverges = legacy != null && Math.abs(legacy - calibrated) >= 10;
  const delta = legacy != null ? (calibrated < legacy ? '▼' : calibrated > legacy ? '▲' : '') : '';

  return (
    <div
      className="p-4 flex items-center gap-4 flex-wrap"
      style={{ ...cardStyle, fontFamily: typography.ui }}
    >
      {/* Hero: calibrated score + verdict */}
      <div className="flex items-center gap-3">
        <span
          className="text-3xl font-bold tabular-nums leading-none"
          style={{ color: scoreColor(calibrated) }}
        >
          {calibrated}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold" style={{ color: v.color }}>{v.label}</span>
          <span className="text-[11px]" style={{ color: palette.textTertiary }}>
            Calibrated
            {legacy != null && (
              <span className="ml-1.5" style={{ color: diverges ? palette.amber : palette.textDisabled }}>
                · legacy {legacy} {delta}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch hidden sm:block" style={{ background: palette.borderSubtle }} />

      {/* What it is — abuse-category chips */}
      <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
        {categories && categories.length > 0 ? (
          categories.map((c) => {
            const s = CATEGORY_SEVERITY_STYLE[c.severity];
            return (
              <span
                key={c.key}
                title={`${c.evidence}${c.sources.length ? ` — ${c.sources.join(', ')}` : ''}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
                style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
              >
                {c.label}
                <span className="text-[10px]" style={{ color: palette.textTertiary }}>{c.sources.length}</span>
              </span>
            );
          })
        ) : (
          <span className="text-xs self-center" style={{ color: palette.textTertiary }}>No abuse categories flagged</span>
        )}
      </div>

      {/* Hint to the Verdict tab */}
      <span className="text-[11px] self-center hidden md:block" style={{ color: palette.textTertiary }}>
        Details in Verdict tab →
      </span>
    </div>
  );
}
