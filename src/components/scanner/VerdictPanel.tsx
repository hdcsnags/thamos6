import { useState } from 'react';
import { Sparkles, AlertTriangle, Scale, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CalibratedScoring } from '../../types';
import { palette, typography } from '../../design-system/tokens';
import { type Tone, toneColor, toneBg, toneBorder, cardStyle } from '../results/resultTokens';
import { SectionHeader, Pill, StatCell, Callout } from '../results';
import VarianceCard from './VarianceCard';
import { SCORING_VERDICT_LABEL, CATEGORY_SEVERITY_STYLE } from './verdictStyles';

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

// AI verdict → kit tone. Inconclusive is neutral; benign is the only green.
const VERDICT_TONE: Record<IOCVerdict['verdict'], Tone> = {
  MALICIOUS: 'danger',
  SUSPICIOUS: 'warn',
  LIKELY_BENIGN: 'good',
  INCONCLUSIVE: 'neutral',
};

// Sentence-case labels for the AI verdict enum (a different enum from the
// calibrated-scoring labels in verdictStyles).
const AI_VERDICT_LABEL: Record<IOCVerdict['verdict'], string> = {
  MALICIOUS: 'Malicious',
  SUSPICIOUS: 'Suspicious',
  LIKELY_BENIGN: 'Likely benign',
  INCONCLUSIVE: 'Inconclusive',
};

// Per-source assessment chip tone.
const ASSESSMENT_TONE: Record<string, Tone> = {
  CONFIRMED_SIGNAL: 'danger',
  FALSE_POSITIVE: 'good',
  CONTEXT_ONLY: 'accent',
  NO_SIGNAL: 'neutral',
};

function humanize(code: string): string {
  const s = code.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Eyebrow({ children, color = palette.textTertiary }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="text-[11px] font-semibold" style={{ color, fontFamily: typography.ui, letterSpacing: '0.02em' }}>
      {children}
    </span>
  );
}

const innerRow = {
  background: palette.elevated,
  border: `1px solid ${palette.borderSubtle}`,
  borderRadius: '8px',
} as const;

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

  const verdictTone: Tone = verdict ? (VERDICT_TONE[verdict.verdict] ?? 'neutral') : 'neutral';
  const verdictLabel = verdict ? (AI_VERDICT_LABEL[verdict.verdict] ?? humanize(verdict.verdict)) : '';
  const scoringStyle = scoring ? SCORING_VERDICT_LABEL[scoring.verdict] : null;

  return (
    <div className="space-y-4" style={{ fontFamily: typography.ui }}>
      {/* Calibrated vs legacy score comparison */}
      {scoring && scoringStyle && (
        <div className="p-5" style={cardStyle}>
          <SectionHeader
            icon={<Scale className="w-4 h-4" />}
            title="Score comparison"
            actions={
              <span className="text-[11px] text-right" style={{ color: palette.textTertiary }}>
                Calibrated scoring preview — legacy remains the system default
              </span>
            }
          />
          <div className="grid grid-cols-3 gap-3 mt-4 mb-4">
            <StatCell label="Legacy" value={scoring.legacy ?? '—'} />
            <StatCell label="Calibrated" value={scoring.calibrated} tone="accent" />
            <div
              className="p-3 text-center flex flex-col items-center justify-center"
              style={{
                background: toneBg(scoringStyle.tone, 0.06),
                border: `1px solid ${toneBorder(scoringStyle.tone, 0.18)}`,
                borderRadius: '8px',
              }}
            >
              <div className="text-sm font-semibold" style={{ color: scoringStyle.color }}>
                {scoringStyle.label}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: palette.textTertiary }}>Calibrated read</div>
            </div>
          </div>

          {/* Abuse categories — what the IOC is actually seen doing, not just how bad */}
          {scoring.categories && scoring.categories.length > 0 && (
            <div className="mb-4">
              <div className="mb-2"><Eyebrow>Abuse categories</Eyebrow></div>
              <div className="flex flex-wrap gap-2">
                {scoring.categories.map((c) => {
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
                })}
              </div>
            </div>
          )}

          {scoring.legacyDivergence && (
            <div className="mb-3">
              <Callout
                icon={<AlertTriangle className="w-4 h-4" />}
                title="Legacy and calibrated scores diverge"
                detail={scoring.legacyDivergence}
                tone="warn"
              />
            </div>
          )}

          <button
            onClick={() => setShowContributions(!showContributions)}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: palette.textSecondary }}
          >
            {showContributions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showContributions ? 'Hide' : 'Show'} score breakdown ({scoring.contributions.length} sources)
          </button>

          {showContributions && (
            <div className="mt-3 space-y-1.5">
              {scoring.contributions.map((c, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5" style={innerRow}>
                  <span
                    className="text-xs font-semibold tabular-nums w-10 text-right flex-shrink-0"
                    style={{
                      color: c.points > 0 ? toneColor.danger : c.points < 0 ? toneColor.good : palette.textTertiary,
                      fontFamily: typography.mono,
                    }}
                  >
                    {c.points > 0 ? `+${c.points}` : c.points}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold" style={{ color: palette.textPrimary }}>{c.source}</span>
                    <span className="text-[11px] ml-2" style={{ color: palette.textTertiary }}>{c.weight}</span>
                    <p className="text-xs mt-0.5" style={{ color: palette.textSecondary }}>{c.note}</p>
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
      <div className="p-5" style={cardStyle}>
        <SectionHeader
          icon={<Sparkles className="w-4 h-4" />}
          title="THAMOS verdict"
          actions={
            verdict && !loading ? (
              <button
                onClick={runVerdict}
                className="text-xs rounded-md px-2.5 py-1 transition-colors"
                style={{ color: palette.textSecondary, border: `1px solid ${palette.borderDefault}`, background: palette.elevated }}
              >
                Re-run
              </button>
            ) : undefined
          }
        />

        {!verdict && !loading && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm max-w-lg mx-auto" style={{ color: palette.textSecondary }}>
              Grounded AI review of the per-source evidence — verifies each signal, flags when the
              score is misleading, and explains what to do next. Loads the persisted lookup server-side.
            </p>
            <button
              onClick={runVerdict}
              className="px-4 py-2 rounded-md text-sm font-semibold transition-colors"
              style={{
                color: palette.accent,
                background: toneBg('accent', 0.12),
                border: `1px solid ${toneBorder('accent')}`,
              }}
            >
              Ask THAMOS
            </button>
            {error && <p className="text-sm" style={{ color: toneColor.danger }}>{error}</p>}
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div
              className="w-7 h-7 border-2 rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: palette.accent, borderTopColor: 'transparent' }}
            />
            <p className="text-sm" style={{ color: palette.textSecondary }}>THAMOS is reviewing the evidence…</p>
          </div>
        )}

        {verdict && !loading && (
          <div className="space-y-4 mt-4">
            <div
              className="p-4 text-center"
              style={{
                background: toneBg(verdictTone, 0.08),
                border: `1px solid ${toneBorder(verdictTone)}`,
                borderRadius: '8px',
              }}
            >
              <div
                className="text-lg font-semibold"
                style={{ color: verdictTone === 'neutral' ? palette.textPrimary : toneColor[verdictTone] }}
              >
                {verdictLabel}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: palette.textTertiary }}>
                {humanize(verdict.confidence)} confidence
              </div>
              <p className="text-sm mt-2" style={{ color: palette.textPrimary }}>{verdict.headline}</p>
            </div>

            {verdict.score_assessment && (
              <div
                className="p-3"
                style={{
                  background: verdict.score_assessment.legacy_score_misleading ? toneBg('warn', 0.07) : palette.elevated,
                  border: `1px solid ${verdict.score_assessment.legacy_score_misleading ? toneBorder('warn') : palette.borderSubtle}`,
                  borderRadius: '8px',
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Eyebrow>Score assessment</Eyebrow>
                  {verdict.score_assessment.legacy_score_misleading && <Pill label="Legacy score misleading" tone="warn" />}
                  {verdict.score_assessment.calibrated_score_misleading && <Pill label="Calibrated score misleading" tone="warn" />}
                </div>
                <p className="text-sm mt-1" style={{ color: palette.textSecondary }}>{verdict.score_assessment.explanation}</p>
              </div>
            )}

            {verdict.source_assessments?.length > 0 && (
              <div className="space-y-1.5">
                <Eyebrow>Source verification</Eyebrow>
                {verdict.source_assessments.map((s, i) => {
                  const tone = ASSESSMENT_TONE[s.assessment] ?? 'neutral';
                  return (
                    <div key={i} className="flex items-start gap-2.5 p-2.5" style={innerRow}>
                      <span className="flex-shrink-0 mt-px"><Pill label={humanize(s.assessment)} tone={tone} /></span>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold" style={{ color: palette.textPrimary }}>{s.source}</span>
                        <p className="text-xs mt-0.5" style={{ color: palette.textSecondary }}>{s.reasoning}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {verdict.corroboration && (
              <p className="text-sm" style={{ color: palette.textSecondary }}>
                <span className="font-semibold" style={{ color: palette.textPrimary }}>Corroboration:</span> {verdict.corroboration}
              </p>
            )}

            {verdict.benign_explanations?.length > 0 && (
              <div
                className="p-3"
                style={{ background: toneBg('good', 0.05), border: `1px solid ${toneBorder('good', 0.2)}`, borderRadius: '8px' }}
              >
                <Eyebrow color={toneColor.good}>Plausible benign explanations</Eyebrow>
                <ul className="mt-1 space-y-1">
                  {verdict.benign_explanations.map((b, i) => (
                    <li key={i} className="text-sm flex gap-2" style={{ color: palette.textSecondary }}>
                      <span style={{ color: palette.textTertiary }}>•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-3" style={innerRow}>
              <Eyebrow>Recommendation</Eyebrow>
              <p className="text-sm mt-1" style={{ color: palette.textPrimary }}>{verdict.recommendation}</p>
              {verdict.pivot_suggestions?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {verdict.pivot_suggestions.map((p, i) => (
                    <p key={i} className="text-sm flex gap-2" style={{ color: palette.textSecondary }}>
                      <span style={{ color: palette.accent }}>→</span>
                      <span>{p}</span>
                    </p>
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
