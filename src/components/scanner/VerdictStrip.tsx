import type { CalibratedScoring } from '../../types';
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
      className="rounded-xl p-4 flex items-center gap-4 flex-wrap"
      style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}
    >
      {/* Hero: calibrated score + verdict */}
      <div className="flex items-center gap-3">
        <span className={`text-4xl font-black tabular-nums leading-none ${scoreColor(calibrated)}`}>
          {calibrated}
        </span>
        <div className="flex flex-col">
          <span className={`text-sm font-bold tracking-wider ${v.cls}`}>{v.label}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Calibrated
            {legacy != null && (
              <span className={diverges ? 'text-amber-400/80 ml-1.5' : 'text-slate-600 ml-1.5'}>
                · legacy {legacy} {delta}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-white/5 hidden sm:block" />

      {/* What it is — abuse-category chips */}
      <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
        {categories && categories.length > 0 ? (
          categories.map((c) => (
            <span
              key={c.key}
              title={`${c.evidence}${c.sources.length ? ` — ${c.sources.join(', ')}` : ''}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${CATEGORY_SEVERITY_STYLE[c.severity]}`}
            >
              {c.label}
              <span className="text-[10px] opacity-60">{c.sources.length}</span>
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-600 self-center">No abuse categories flagged</span>
        )}
      </div>

      {/* Hint to the Verdict tab */}
      <span className="text-[10px] uppercase tracking-wider text-slate-600 self-center hidden md:block">
        details in Verdict tab →
      </span>
    </div>
  );
}
