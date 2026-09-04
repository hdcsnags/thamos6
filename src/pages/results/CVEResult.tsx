import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  ShieldAlert, Target, FileJson, ExternalLink, Flame, Bug, Database, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useTheme } from '../../contexts/themecontext';
import { lookupCVE } from '../../lib/threatIntel';
import type { CVELookupResult } from '../../types';
import { palette, typography } from '../../design-system/tokens';
import {
  ResultShell, ResultLoading, ResultError, ResultEmpty,
  MetricCard, Pill, SectionHeader, Callout, ResultCard, SummaryActions, SignalLight,
  type ShellMenuItem, type Tone,
} from '../../components/results';

interface CVEResultProps {
  cve: string;
  onScan?: (type: string, value: string) => void;
}

type MenuItem = 'overview' | 'references' | 'sources' | 'raw';

type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** CVSS v3 severity, falling back to the base-score bands when NVD omits the label. */
function severityLevel(severity: string | null, score: number | null): SeverityLevel {
  const s = (severity || '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH' || s === 'MEDIUM' || s === 'LOW') return s;
  if (score == null) return 'UNKNOWN';
  return score >= 9 ? 'CRITICAL' : score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW';
}

const SEVERITY_TONE: Record<SeverityLevel, Tone> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warn',
  LOW: 'neutral',
  UNKNOWN: 'neutral',
};

const SEVERITY_LABEL: Record<SeverityLevel, string> = {
  CRITICAL: 'Critical severity',
  HIGH: 'High severity',
  MEDIUM: 'Medium severity',
  LOW: 'Low severity',
  UNKNOWN: 'Unscored',
};

// Backend source keys → analyst-facing names. All three run on every CVE lookup.
const SOURCE_LABELS: Record<string, string> = {
  nvd: 'NVD (NIST)',
  cisa_kev: 'CISA KEV catalog',
  epss: 'FIRST EPSS',
};
const EXPECTED_SOURCES = ['nvd', 'cisa_kev', 'epss'];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CVEResult({ cve }: CVEResultProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CVELookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const mainContainer = containerRef.current.closest('[style*="overflow"]');
      if (mainContainer) mainContainer.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const performLookup = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await lookupCVE(cve);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup CVE');
      } finally {
        setLoading(false);
      }
    };
    performLookup();
  }, [cve]);

  if (loading && !result) {
    return <div ref={containerRef} className="h-full"><ResultLoading message={`Correlating NVD, CISA KEV and EPSS for ${cve}…`} /></div>;
  }

  if (error) {
    return <div ref={containerRef} className="h-full"><ResultError message={error} /></div>;
  }

  if (!result) {
    return <div ref={containerRef} className="h-full"><ResultEmpty message={`No result data available for ${cve}.`} /></div>;
  }

  const level = severityLevel(result.cvss_v3_severity, result.cvss_v3_score);
  const severityTone = SEVERITY_TONE[level];
  const ransomwareKnown = (result.kev_ransomware_use || '').toLowerCase() === 'known';
  const epssPct = result.epss_score != null ? result.epss_score * 100 : null;
  const epssPercentile = result.epss_percentile != null ? result.epss_percentile * 100 : null;
  // EPSS at or above the 90th percentile is a genuine exploitation-likelihood warning.
  const epssTone: Tone = result.epss_percentile != null && result.epss_percentile >= 0.9 ? 'warn' : 'neutral';

  const sources = result.sources || {};
  const kevData = (sources.cisa_kev?.data || {}) as Record<string, any>;
  const epssData = (sources.epss?.data || {}) as Record<string, any>;

  const verdict = result.is_kev
    ? { label: 'In CISA KEV', tone: 'danger' as Tone }
    : { label: SEVERITY_LABEL[level], tone: severityTone };

  const menuItems: ShellMenuItem<MenuItem>[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'references', label: `References (${result.references.length})`, icon: ExternalLink },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'raw', label: 'Raw JSON', icon: FileJson },
  ];

  const getSummary = () => {
    const lines = [
      `CVE: ${result.cve_id}`,
      `Severity: ${level}${result.cvss_v3_score != null ? ` (CVSS v3 ${result.cvss_v3_score})` : ''}`,
      `KEV (actively exploited): ${result.is_kev ? 'YES' : 'no'}`,
      result.is_kev && result.kev_ransomware_use ? `Known ransomware use: ${result.kev_ransomware_use}` : '',
      `EPSS (exploit probability): ${epssPct != null ? `${epssPct.toFixed(2)}%` : 'n/a'}${epssPercentile != null ? ` (${epssPercentile.toFixed(0)}th percentile)` : ''}`,
      result.cwe ? `Weakness: ${result.cwe}` : '',
      `Threat score: ${result.overall_threat_score}/100`,
      result.description ? `\n${result.description}` : '',
    ];
    return lines.filter(Boolean).join('\n');
  };

  const signals = (
    <>
      <SignalLight label="KEV" on={result.is_kev} tone="danger" />
      <SignalLight label="RANSOMWARE USE" on={ransomwareKnown} tone="danger" />
      <Pill
        label={result.cvss_v3_score != null ? `CVSS ${result.cvss_v3_score} · ${level}` : 'CVSS v3 unavailable'}
        tone={severityTone}
      />
      <Pill
        label={epssPct != null
          ? `EPSS ${epssPct.toFixed(1)}%${epssPercentile != null ? ` · ${epssPercentile.toFixed(0)}th pct` : ''}`
          : 'EPSS unavailable'}
        tone={epssTone}
      />
    </>
  );

  return (
    <div ref={containerRef} className="h-full">
      <ResultShell<MenuItem>
        value={result.cve_id}
        typeLabel="Vulnerability"
        verdict={verdict}
        score={result.overall_threat_score}
        signals={signals}
        menuItems={menuItems}
        activeMenu={activeMenu}
        onMenuChange={setActiveMenu}
        variant={theme === 'desktop' ? 'tabs' : 'sidebar'}
        headerActions={<SummaryActions getSummary={getSummary} getJson={() => result} />}
      >
        {activeMenu === 'overview' && (
          <OverviewSection
            result={result}
            level={level}
            severityTone={severityTone}
            ransomwareKnown={ransomwareKnown}
            epssPct={epssPct}
            epssPercentile={epssPercentile}
            epssTone={epssTone}
            kevData={kevData}
            epssData={epssData}
          />
        )}

        {activeMenu === 'references' && <ReferencesSection references={result.references} />}

        {activeMenu === 'sources' && <SourcesSection sources={sources} />}

        {activeMenu === 'raw' && (
          <div className="space-y-4">
            <SectionHeader icon={<FileJson className="w-4 h-4" />} title="Raw JSON" />
            <pre
              className="overflow-auto max-h-[600px] p-4"
              style={{
                background: palette.void,
                color: palette.textSecondary,
                fontFamily: typography.mono,
                fontSize: '11px',
                borderRadius: '8px',
                border: `1px solid ${palette.borderDefault}`,
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </ResultShell>
    </div>
  );
}

/* ------------------------------- Overview -------------------------------- */

function OverviewSection({ result, level, severityTone, ransomwareKnown, epssPct, epssPercentile, epssTone, kevData, epssData }: {
  result: CVELookupResult;
  level: SeverityLevel;
  severityTone: Tone;
  ransomwareKnown: boolean;
  epssPct: number | null;
  epssPercentile: number | null;
  epssTone: Tone;
  kevData: Record<string, any>;
  epssData: Record<string, any>;
}) {
  const kevProduct = [kevData.vendor_project, kevData.product].filter(Boolean).join(' ');

  return (
    <div className="space-y-4">
      {/* Real findings first — only KEV and ransomware use are tinted. */}
      {result.is_kev && (
        <Callout
          icon={<ShieldAlert className="w-4 h-4" />}
          tone="danger"
          title="Listed in the CISA Known Exploited Vulnerabilities catalog"
          detail={
            <>
              Confirmed exploited in the wild — prioritise patching.
              {result.kev_date_added && <> Added {formatDate(result.kev_date_added)}.</>}
              {result.kev_due_date && <> Federal remediation due {formatDate(result.kev_due_date)}.</>}
            </>
          }
        >
          {(kevData.vulnerability_name || kevProduct || kevData.required_action) && (
            <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-5 gap-y-3 mt-3">
              {kevData.vulnerability_name && <Field label="KEV name" value={kevData.vulnerability_name} />}
              {kevProduct && <Field label="Affected product" value={kevProduct} />}
              {kevData.required_action && (
                <div className="@xl:col-span-2">
                  <Field label="Required action" value={kevData.required_action} />
                </div>
              )}
            </div>
          )}
        </Callout>
      )}

      {ransomwareKnown && (
        <Callout
          icon={<Flame className="w-4 h-4" />}
          tone="danger"
          title="Known ransomware campaign use"
          detail="CISA reports this vulnerability has been used in ransomware campaigns."
        />
      )}

      <div className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-4 gap-3">
        <MetricCard
          label="CVSS v3"
          value={result.cvss_v3_score != null ? result.cvss_v3_score : '—'}
          detail={result.cvss_v3_score != null ? level : 'Not scored by NVD'}
          tone={severityTone}
          highlight={severityTone !== 'neutral'}
        />
        <MetricCard
          label="CVSS v2 (legacy)"
          value={result.cvss_v2_score != null ? result.cvss_v2_score : '—'}
          detail={result.cvss_v2_score != null ? 'Legacy base score' : 'Not scored'}
        />
        <MetricCard
          label="EPSS · 30-day exploit probability"
          value={epssPct != null ? `${epssPct.toFixed(2)}%` : '—'}
          detail={epssPercentile != null ? `More likely than ${epssPercentile.toFixed(0)}% of all CVEs` : 'No EPSS score available'}
          tone={epssTone}
          highlight={epssTone !== 'neutral'}
        />
        <MetricCard
          label="Composite threat score"
          value={<>{result.overall_threat_score}<span className="text-xs font-medium" style={{ color: palette.textTertiary }}> /100</span></>}
          detail="Blends CVSS severity, KEV status and EPSS"
        />
      </div>

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        <ResultCard>
          <SectionHeader icon={<Bug className="w-4 h-4" />} title="Description" />
          <p className="text-sm leading-relaxed mt-4" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            {result.description || 'No description available from NVD.'}
          </p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
            <Field label="Weakness (CWE)" value={result.cwe || 'Not classified'} mono={!!result.cwe} />
            <Field label="NVD status" value={result.vuln_status || 'Unknown'} />
          </div>
        </ResultCard>

        <ResultCard>
          <SectionHeader icon={<Database className="w-4 h-4" />} title="Timeline" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
            <Field label="Published" value={formatDate(result.published)} />
            <Field label="Last modified" value={formatDate(result.last_modified)} />
            <Field
              label="KEV added"
              value={result.is_kev ? formatDate(result.kev_date_added) : 'Not listed'}
              tone={result.is_kev ? 'danger' : 'neutral'}
            />
            <Field
              label="KEV due date"
              value={result.is_kev ? formatDate(result.kev_due_date) : 'Not listed'}
              tone={result.is_kev ? 'danger' : 'neutral'}
            />
            {result.is_kev && (
              <Field
                label="Ransomware use"
                value={result.kev_ransomware_use || 'Unknown'}
                tone={ransomwareKnown ? 'danger' : 'neutral'}
              />
            )}
            {epssData.date && <Field label="EPSS as of" value={formatDate(String(epssData.date))} />}
            <Field label="Checked" value={formatDate(result.checked_at)} />
          </div>
        </ResultCard>
      </div>
    </div>
  );
}

function Field({ label, value, tone = 'neutral', mono = false }: {
  label: string; value: ReactNode; tone?: Tone; mono?: boolean;
}) {
  const valueColor = tone === 'danger' ? palette.rose : tone === 'warn' ? palette.amber : palette.textPrimary;
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium mb-0.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
        {label}
      </div>
      <div
        className="text-sm font-medium leading-snug break-words"
        style={{ color: valueColor, fontFamily: mono ? typography.mono : typography.ui }}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------ References ------------------------------- */

function ReferencesSection({ references }: { references: string[] }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={<ExternalLink className="w-4 h-4" />} title={`References (${references.length})`} />
      {references.length > 0 ? (
        <div className="space-y-1.5">
          {references.map((ref, idx) => (
            <a
              key={idx}
              href={ref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:brightness-125"
              style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
              <span className="text-xs break-all" style={{ color: palette.accent, fontFamily: typography.mono }}>{ref}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>No references provided by NVD.</p>
      )}
      <p className="text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
        NVD references are capped at 10 by the lookup service.
      </p>
    </div>
  );
}

/* -------------------------------- Sources -------------------------------- */

type SourceState = { label: string; tone: Tone };

function sourceState(entry: { data: Record<string, unknown>; error?: string } | undefined): SourceState {
  if (!entry) return { label: 'Not returned', tone: 'neutral' };
  if (entry.error) {
    return /not configured/i.test(entry.error)
      ? { label: 'Not configured', tone: 'neutral' }
      : { label: 'Error', tone: 'danger' };
  }
  if (!entry.data || Object.keys(entry.data).length === 0) return { label: 'No data', tone: 'neutral' };
  return { label: 'OK', tone: 'good' };
}

function SourcesSection({ sources }: { sources: CVELookupResult['sources'] }) {
  const keys = [...EXPECTED_SOURCES, ...Object.keys(sources).filter(k => !EXPECTED_SOURCES.includes(k))];
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(keys));

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Database className="w-4 h-4" />} title={`Individual sources (${keys.length})`} />
      <div className="space-y-2">
        {keys.map(key => {
          const entry = sources[key];
          const state = sourceState(entry);
          const isError = state.tone === 'danger';
          const isExpanded = expandedKeys.has(key);
          return (
            <div
              key={key}
              className="rounded-lg overflow-hidden"
              style={{
                background: isError ? `${palette.rose}0d` : palette.base,
                border: `1px solid ${isError ? `${palette.rose}40` : palette.borderDefault}`,
              }}
            >
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:brightness-110"
                style={{ background: 'transparent' }}
                title={entry?.error || undefined}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                    : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />}
                  <span className="text-sm font-semibold truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                    {SOURCE_LABELS[key] || key}
                  </span>
                  <span className="text-[11px] shrink-0" style={{ color: palette.textTertiary, fontFamily: typography.mono }}>{key}</span>
                </span>
                <Pill label={state.label} tone={state.tone} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4">
                  {entry?.error && (
                    <div className="text-xs mb-2" style={{ color: isError ? palette.rose : palette.textSecondary, fontFamily: typography.ui }}>
                      {entry.error}
                    </div>
                  )}
                  {!entry && (
                    <div className="text-xs" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
                      The lookup service did not return a result for this source.
                    </div>
                  )}
                  {entry && (
                    <pre
                      className="text-xs overflow-auto max-h-72 rounded-md p-3"
                      style={{ background: palette.void, color: palette.textSecondary, fontFamily: typography.mono }}
                    >
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
