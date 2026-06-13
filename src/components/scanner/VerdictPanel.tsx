import { useState } from 'react';
import { Sparkles, AlertTriangle, Scale, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CalibratedScoring } from '../../types';
import VarianceCard from './VarianceCard';

interface IOCVerdict {
  verdict: 'MALICIOUS' | 'SUSPICIOUS' | 'LIKELY_BENIGN' | 'INCONCLUSIVE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  headline: string;
  score_assessment: {
    legacy_score_misleading: boolean;
    calibrated_score_misleading: boolean;
    explanation: string;
  };
  source_assessments: Array<{ source: string; assessment: string; reasoning: string }>;
  corroboration: string;
  benign_explanations: string[];
  recommendation: string;
  pivot_suggestions: string[];
}

interface VerdictPanelProps {
  lookupType: 'ip' | 'domain' | 'url' | 'hash';
  value: string;
  scoring?: CalibratedScoring;
}

const VERDICT_STYLE: Record<string, string> = {
  MALICIOUS: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  SUSPICIOUS: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  LIKELY_BENIGN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  INCONCLUSIVE: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const ASSESSMENT_STYLE: Record<string, string> = {
  CONFIRMED_SIGNAL: 'bg-rose-500/20 text-rose-400',
  FALSE_POSITIVE: 'bg-emerald-500/20 text-emerald-400',
  CONTEXT_ONLY: 'bg-cyan-500/20 text-cyan-400',
  NO_SIGNAL: 'bg-slate-500/20 text-slate-400',
};

const SCORING_VERDICT_LABEL: Record<CalibratedScoring['verdict'], { label: string; cls: string }> = {
  malicious: { label: 'MALICIOUS', cls: 'text-rose-400' },
  suspicious: { label: 'SUSPICIOUS', cls: 'text-amber-400' },
  low_signal: { label: 'LOW SIGNAL', cls: 'text-cyan-400' },
  no_signal: { label: 'NO SIGNAL', cls: 'text-emerald-400' },
};

export default function VerdictPanel({ lookupType, value, scoring }: VerdictPanelProps) {
  const [verdict, setVerdict] = useState<IOCVerdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showContributions, setShowContributions] = useState(false);

  const runVerdict = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ioc-verdict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ lookup_type: lookupType, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server error: ${res.status}`);
      setVerdict(data.verdict as IOCVerdict);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Calibrated vs legacy score comparison */}
      {scoring && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Scale className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">Score Comparison</h3>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider ml-2">calibrated scoring preview — legacy remains the system default</span>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-2xl font-bold text-slate-300">{scoring.legacy ?? '—'}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Legacy</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <div className="text-2xl font-bold text-cyan-400">{scoring.calibrated}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Calibrated</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 flex flex-col items-center justify-center">
              <div className={`text-sm font-bold ${SCORING_VERDICT_LABEL[scoring.verdict].cls}`}>{SCORING_VERDICT_LABEL[scoring.verdict].label}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Calibrated read</div>
            </div>
          </div>
          {scoring.legacyDivergence && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-200/90">{scoring.legacyDivergence}</p>
            </div>
          )}
          <button
            onClick={() => setShowContributions(!showContributions)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-all"
          >
            {showContributions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showContributions ? 'Hide' : 'Show'} score breakdown ({scoring.contributions.length} sources)
          </button>
          {showContributions && (
            <div className="mt-3 space-y-1.5">
              {scoring.contributions.map((c, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900/50 border border-slate-800">
                  <span className={`text-xs font-bold tabular-nums w-10 text-right flex-shrink-0 ${
                    c.points > 0 ? 'text-rose-400' : c.points < 0 ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    {c.points > 0 ? `+${c.points}` : c.points}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-200">{c.source}</span>
                    <span className="text-[10px] text-slate-500 ml-2 uppercase">{c.weight}</span>
                    <p className="text-xs text-slate-400 mt-0.5">{c.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cross-source disagreement */}
      {scoring && <VarianceCard variances={scoring.variances} />}

      {/* Ask THAMOS */}
      <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">THAMOS Verdict</h3>
          </div>
          {verdict && !loading && (
            <button onClick={runVerdict} className="text-xs text-slate-500 hover:text-white border border-slate-700/50 rounded px-2 py-1 transition-all">
              RE-RUN
            </button>
          )}
        </div>

        {!verdict && !loading && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              Grounded AI review of the per-source evidence — verifies each signal, flags when the
              score is misleading, and explains what to do next. Loads the persisted lookup server-side.
            </p>
            <button
              onClick={runVerdict}
              className="px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-all"
            >
              Ask THAMOS
            </button>
            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-cyan-400">THAMOS is reviewing the evidence…</p>
          </div>
        )}

        {verdict && !loading && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg border text-center ${VERDICT_STYLE[verdict.verdict] ?? VERDICT_STYLE.INCONCLUSIVE}`}>
              <div className="text-xl font-bold">{verdict.verdict.replace('_', ' ')}</div>
              <div className="text-xs uppercase tracking-wider opacity-80 mt-0.5">{verdict.confidence} confidence</div>
              <p className="text-sm mt-2 text-slate-200">{verdict.headline}</p>
            </div>

            {verdict.score_assessment && (
              <div className={`p-3 rounded-lg border ${verdict.score_assessment.legacy_score_misleading ? 'bg-amber-500/10 border-amber-500/20' : 'bg-slate-800/50 border-slate-700/50'}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Score assessment</span>
                {verdict.score_assessment.legacy_score_misleading && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">LEGACY SCORE MISLEADING</span>
                )}
                <p className="text-sm text-slate-300 mt-1">{verdict.score_assessment.explanation}</p>
              </div>
            )}

            {verdict.source_assessments?.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Source verification</span>
                {verdict.source_assessments.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-900/50 border border-slate-800">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${ASSESSMENT_STYLE[s.assessment] ?? ASSESSMENT_STYLE.NO_SIGNAL}`}>
                      {s.assessment.replace(/_/g, ' ')}
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-200">{s.source}</span>
                      <p className="text-xs text-slate-400 mt-0.5">{s.reasoning}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {verdict.corroboration && (
              <p className="text-sm text-slate-400"><span className="font-bold text-slate-300">Corroboration:</span> {verdict.corroboration}</p>
            )}

            {verdict.benign_explanations?.length > 0 && (
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Plausible benign explanations</span>
                {verdict.benign_explanations.map((b, i) => (
                  <p key={i} className="text-sm text-slate-300 mt-1">• {b}</p>
                ))}
              </div>
            )}

            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Recommendation</span>
              <p className="text-sm text-slate-200 mt-1">{verdict.recommendation}</p>
              {verdict.pivot_suggestions?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {verdict.pivot_suggestions.map((p, i) => (
                    <p key={i} className="text-sm text-cyan-300">→ {p}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
