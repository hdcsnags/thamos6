import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  Shield, AlertTriangle, Database, FileText, Target, FileJson, Activity, Scale,
  ChevronDown, ChevronRight, ArrowRight, ArrowUpRight, Bug, Fingerprint, Tag,
} from 'lucide-react';
import { useTheme } from '../../contexts/themecontext';
import { lookupHash } from '../../lib/threatIntel';
import type { HashLookupResult, CalibratedScoring, ScoreContribution } from '../../types';
import VerdictPanel from '../../components/scanner/VerdictPanel';
import VerdictStrip from '../../components/scanner/VerdictStrip';
import { palette, typography } from '../../design-system/tokens';
import {
  ResultShell, ResultLoading, ResultError, ResultEmpty,
  MetricCard, StatCell, Pill, SectionHeader, Callout, ResultCard, SummaryActions, SignalLight,
  type ShellMenuItem, type Tone,
} from '../../components/results';

interface HashResultProps {
  hash: string;
  onScan?: (type: string, value: string) => void;
}

type MenuItem = 'overview' | 'verdict' | 'file-info' | 'detections' | 'behavior' | 'sources' | 'raw';

/**
 * What the /hash edge route actually emits per source. The declared
 * HashLookupResult['sources'] shape (`checked`) predates the route; the live
 * payload carries `found | malicious | details | error`. We read both.
 */
interface HashSourceEntry {
  checked?: boolean;
  found?: boolean;
  malicious?: boolean;
  details?: any;
  error?: string;
  threatScore?: number;
}

/** Every source the /hash route can run, so "Not run" is an honest state. */
const KNOWN_SOURCES: Array<{ key: string; label: string }> = [
  { key: 'virustotal_hash', label: 'VirusTotal' },
  { key: 'malwarebazaar', label: 'MalwareBazaar' },
  { key: 'hybrid_analysis', label: 'Hybrid Analysis' },
  { key: 'alienvault_hash', label: 'AlienVault OTX' },
];

const VERDICT_META: Record<CalibratedScoring['verdict'], { label: string; tone: Tone }> = {
  malicious: { label: 'Malicious', tone: 'danger' },
  suspicious: { label: 'Suspicious', tone: 'warn' },
  low_signal: { label: 'Low signal', tone: 'neutral' },
  no_signal: { label: 'No signal', tone: 'good' },
};

export default function HashResult({ hash, onScan }: HashResultProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HashLookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [proMode, setProMode] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const mainContainer = containerRef.current.closest('[style*="overflow"]');
      if (mainContainer) {
        mainContainer.scrollTop = 0;
      }
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const performLookup = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await lookupHash(hash);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup hash');
      } finally {
        setLoading(false);
      }
    };

    performLookup();
  }, [hash]);

  if (loading && !result) {
    return <div ref={containerRef} className="h-full"><ResultLoading message={`Analyzing ${hash}…`} /></div>;
  }

  if (error) {
    return <div ref={containerRef} className="h-full"><ResultError message={error} /></div>;
  }

  if (!result) {
    return <div ref={containerRef} className="h-full"><ResultEmpty message={`No result data available for ${hash}.`} /></div>;
  }

  const sources = (result.sources || {}) as Record<string, HashSourceEntry>;
  const vtRaw = sources.virustotal_hash?.details;
  const vtData: any = vtRaw?.data?.attributes;
  const vtStats: any = vtData?.last_analysis_stats;
  const mbRaw = sources.malwarebazaar?.details;
  const mbRecord: any = mbRaw?.query_status === 'ok' ? mbRaw?.data?.[0] : undefined;
  const haRaw = sources.hybrid_analysis?.details;
  const haReports: any[] = Array.isArray(haRaw) ? haRaw : [];
  const haPrimary: any = haReports[0];
  const avRaw: any = sources.alienvault_hash?.details;
  const avPulseCount: number = Number(avRaw?.pulse_info?.count ?? 0);

  const anySourceSucceeded = Object.values(sources).some(s => s && !s.error);

  const menuItems: ShellMenuItem<MenuItem>[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'verdict', label: 'Verdict', icon: Scale },
    { id: 'file-info', label: 'File Info', icon: FileText },
    { id: 'detections', label: 'Detections', icon: AlertTriangle },
    { id: 'behavior', label: 'Behavior', icon: Activity },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'raw', label: 'Raw JSON', icon: FileJson },
  ];

  const scoring = result.scoring;
  const verdictMeta = scoring
    ? VERDICT_META[scoring.verdict]
    : !anySourceSucceeded
      ? { label: 'No data', tone: 'neutral' as Tone }
      : { label: result.isMalicious ? 'Malicious' : 'Clean', tone: (result.isMalicious ? 'danger' : 'good') as Tone };
  const headlineScore = scoring ? scoring.calibrated : result.overallThreatScore;

  const vtMalicious = Number(vtStats?.malicious ?? result.detections?.virustotal?.malicious ?? 0);
  const vtSuspicious = Number(vtStats?.suspicious ?? result.detections?.virustotal?.suspicious ?? 0);
  const vtTotal = vtStats ? sumVTStats(vtStats) : Number(result.detections?.virustotal?.total ?? 0);

  const family = mbRecord?.signature
    || result.detections?.malwarebazaar?.signature
    || vtData?.popular_threat_classification?.suggested_threat_label
    || haPrimary?.vx_family
    || result.detections?.hybrid_analysis?.vx_family
    || undefined;

  const vendorNames = collectVendorNames(result, vtData);

  const sandboxHit = haReports.some(r => r?.verdict === 'malicious' || r?.verdict === 'suspicious')
    || Object.values<any>(vtData?.sandbox_verdicts || {}).some(v => v?.category === 'malicious' || v?.category === 'suspicious');

  const getSummary = () => {
    const lines = [
      `Hash: ${hash}`,
      `Verdict: ${verdictMeta.label} (score ${headlineScore})`,
      `File type: ${vtData?.type_description || mbRecord?.file_type || 'Unknown'}`,
      `VirusTotal: ${vtStats ? `${vtMalicious}/${vtTotal} malicious` : 'no data'}`,
      `MalwareBazaar: ${mbRecord ? (mbRecord.signature || 'record found') : 'no record'}`,
      `Family: ${family || 'None reported'}`,
    ];
    if (scoring?.legacy != null && scoring.legacy !== scoring.calibrated) {
      lines.push(`Legacy score: ${scoring.legacy}`);
    }
    return lines.join('\n');
  };

  const signals = (
    <>
      <SignalLight
        label="VT HIT"
        on={vtMalicious > 0 || vtSuspicious > 0}
        tone={vtMalicious > 0 ? 'danger' : 'warn'}
        detail={vtStats ? `${vtMalicious}/${vtTotal}` : undefined}
      />
      <SignalLight label="MALWAREBAZAAR" on={!!mbRecord} tone="danger" />
      <SignalLight label="KNOWN FAMILY" on={!!family} tone="warn" detail={family} />
      <SignalLight label="SANDBOX" on={sandboxHit} tone="warn" />
      <SignalLight label="OTX PULSES" on={avPulseCount > 0} tone="warn" detail={avPulseCount > 0 ? String(avPulseCount) : undefined} />
    </>
  );

  return (
    <div ref={containerRef} className="h-full">
      <ResultShell<MenuItem>
        value={hash}
        typeLabel="File hash"
        verdict={verdictMeta}
        score={headlineScore}
        signals={signals}
        menuItems={menuItems}
        activeMenu={activeMenu}
        onMenuChange={setActiveMenu}
        variant={theme === 'desktop' ? 'tabs' : 'sidebar'}
        proMode={proMode}
        onToggleProMode={() => setProMode(!proMode)}
        headerActions={<SummaryActions getSummary={getSummary} getJson={() => result} />}
      >
        {activeMenu === 'overview' && (
          <OverviewSection
            hash={hash}
            scoring={scoring}
            sources={sources}
            vtData={vtData}
            vtStats={vtStats}
            vtMalicious={vtMalicious}
            vtSuspicious={vtSuspicious}
            vtTotal={vtTotal}
            mbRecord={mbRecord}
            haPrimary={haPrimary}
            family={family}
            vendorNames={vendorNames}
            proMode={proMode}
            onOpenVerdict={() => setActiveMenu('verdict')}
            onScan={onScan}
          />
        )}

        {activeMenu === 'verdict' && (
          <VerdictPanel lookupType="hash" value={hash} scoring={result.scoring} />
        )}

        {activeMenu === 'file-info' && (
          <FileInfoSection hash={hash} vtData={vtData} mbRecord={mbRecord} haPrimary={haPrimary} proMode={proMode} onScan={onScan} />
        )}

        {activeMenu === 'detections' && (
          <DetectionsSection vtData={vtData} vtStats={vtStats} mbRecord={mbRecord} haPrimary={haPrimary} avRaw={avRaw} proMode={proMode} />
        )}

        {activeMenu === 'behavior' && (
          <BehaviorSection vtData={vtData} haReports={haReports} proMode={proMode} onScan={onScan} />
        )}

        {activeMenu === 'sources' && (
          <SourcesSection sources={sources} proMode={proMode} />
        )}

        {activeMenu === 'raw' && (
          <RawJsonSection data={result} />
        )}
      </ResultShell>
    </div>
  );
}

/* ------------------------------- Helpers --------------------------------- */

function sumVTStats(stats: any): number {
  return ['malicious', 'suspicious', 'harmless', 'undetected', 'timeout', 'failure', 'type-unsupported', 'confirmed-timeout']
    .reduce((acc, k) => acc + Number(stats?.[k] ?? 0), 0);
}

/** Vendor detection names: backend-supplied list first, else derived from the raw VT engine results. */
function collectVendorNames(result: HashLookupResult, vtData: any): string[] {
  const supplied = result.detections?.virustotal?.malicious_names;
  if (Array.isArray(supplied) && supplied.length > 0) return supplied.slice(0, 5);
  const engines: Record<string, any> = vtData?.last_analysis_results || {};
  const names: string[] = [];
  for (const r of Object.values(engines)) {
    if (r?.category === 'malicious' && r?.result && !names.includes(r.result)) {
      names.push(String(r.result));
      if (names.length >= 5) break;
    }
  }
  return names;
}

function formatBytes(size?: number | string | null): string | undefined {
  const n = Number(size);
  if (!size || Number.isNaN(n) || n <= 0) return undefined;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** VT timestamps are unix seconds; MalwareBazaar/HA use ISO-ish strings. */
function formatDate(value?: string | number | null): string | undefined {
  if (value == null || value === '') return undefined;
  const date = typeof value === 'number' || /^\d{9,10}$/.test(String(value))
    ? new Date(Number(value) * 1000)
    : new Date(String(value).replace(' ', 'T').replace(/(T\d{2}:\d{2}:\d{2})$/, '$1Z'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isUrlLike(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function Field({ label, value, mono = false, tone = 'neutral', children }: {
  label: string; value?: ReactNode; mono?: boolean; tone?: Tone; children?: ReactNode;
}) {
  const valueColor = tone === 'danger' ? palette.rose : tone === 'warn' ? palette.amber : tone === 'good' ? palette.green : palette.textPrimary;
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium mb-0.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
        {label}
      </div>
      <div
        className="text-sm font-medium leading-snug break-all"
        style={{ color: valueColor, fontFamily: mono ? typography.mono : typography.ui }}
      >
        {value ?? 'Unknown'}
      </div>
      {children}
    </div>
  );
}

/** Small mono chip for tags, vendor names, classifications. */
function Chip({ label, tone = 'neutral', mono = true }: { label: string; tone?: Tone; mono?: boolean }) {
  const color = tone === 'neutral' ? palette.textSecondary : tone === 'danger' ? palette.rose : tone === 'warn' ? palette.amber : tone === 'good' ? palette.green : palette.accent;
  return (
    <span
      className="px-2 py-0.5 rounded text-[11px] font-medium break-all"
      style={{
        background: tone === 'neutral' ? palette.surface : `${color}1a`,
        border: `1px solid ${tone === 'neutral' ? palette.borderSubtle : `${color}40`}`,
        color,
        fontFamily: mono ? typography.mono : typography.ui,
      }}
    >
      {label}
    </span>
  );
}

function ChipRow({ items, tone = 'neutral', mono = true }: { items: unknown[]; tone?: Tone; mono?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, idx) => <Chip key={idx} label={renderScalar(item)} tone={tone} mono={mono} />)}
    </div>
  );
}

function renderScalar(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Pretty JSON block styled per the result spec. */
function JsonBlock({ data, maxHeight = 'max-h-72' }: { data: unknown; maxHeight?: string }) {
  return (
    <pre
      className={`text-[11px] overflow-auto ${maxHeight} p-3`}
      style={{
        background: palette.void,
        color: palette.textSecondary,
        fontFamily: typography.mono,
        borderRadius: '8px',
        border: `1px solid ${palette.borderDefault}`,
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

/** Any nested value: scalars inline, arrays of scalars as chips, objects as JSON. Never `[object Object]`. */
function AnyValue({ value }: { value: unknown }) {
  if (value == null || value === '') return <span style={{ color: palette.textTertiary }}>—</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: palette.textTertiary }}>—</span>;
    if (value.every(v => typeof v !== 'object')) return <ChipRow items={value} />;
    return <JsonBlock data={value} maxHeight="max-h-56" />;
  }
  if (typeof value === 'object') return <JsonBlock data={value} maxHeight="max-h-56" />;
  return <span className="break-all">{String(value)}</span>;
}

function PivotButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline shrink-0"
      style={{ color: palette.accent, fontFamily: typography.ui }}
      title={label}
    >
      {label}
      <ArrowUpRight className="w-3 h-3" />
    </button>
  );
}

function ExpandToggle({ expanded, onClick, label }: { expanded: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 mt-3 text-xs font-medium transition-colors hover:brightness-125"
      style={{ color: palette.accent, fontFamily: typography.ui }}
    >
      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
      {children}
    </div>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-medium mb-1.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
      {children}
    </div>
  );
}

/* ------------------------------- Overview -------------------------------- */

function OverviewSection({
  hash, scoring, sources, vtData, vtStats, vtMalicious, vtSuspicious, vtTotal, mbRecord, haPrimary, family, vendorNames, proMode, onOpenVerdict, onScan,
}: {
  hash: string;
  scoring?: CalibratedScoring;
  sources: Record<string, HashSourceEntry>;
  vtData: any;
  vtStats: any;
  vtMalicious: number;
  vtSuspicious: number;
  vtTotal: number;
  mbRecord: any;
  haPrimary: any;
  family?: string;
  vendorNames: string[];
  proMode: boolean;
  onOpenVerdict: () => void;
  onScan?: (type: string, value: string) => void;
}) {
  const vtEntry = sources.virustotal_hash;
  const ratio = vtTotal > 0 ? vtMalicious / vtTotal : 0;
  const vtTone: Tone = !vtStats ? 'neutral'
    : vtMalicious === 0 && vtSuspicious === 0 ? (vtTotal > 0 ? 'good' : 'neutral')
    : vtMalicious >= 5 || ratio >= 0.25 ? 'danger'
    : 'warn';

  const vtDetail = !vtStats
    ? (vtEntry?.error ? `VirusTotal error: ${vtEntry.error}` : vtEntry ? 'No VirusTotal record' : 'VirusTotal not run')
    : [
        vtSuspicious > 0 ? `${vtSuspicious} suspicious` : null,
        vtData?.last_analysis_date ? `analysed ${formatDate(vtData.last_analysis_date)}` : null,
      ].filter(Boolean).join(' · ') || 'engines flagged this file';

  const familySource = mbRecord?.signature ? 'MalwareBazaar signature'
    : vtData?.popular_threat_classification?.suggested_threat_label ? 'VirusTotal threat label'
    : haPrimary?.vx_family ? 'Hybrid Analysis family'
    : undefined;

  const fileType = vtData?.type_description || mbRecord?.file_type || haPrimary?.type;
  const fileSize = formatBytes(vtData?.size ?? mbRecord?.file_size ?? haPrimary?.size);
  const fileExt = vtData?.type_extension || (mbRecord?.file_type ? String(mbRecord.file_type) : undefined);

  const firstSeen = formatDate(vtData?.first_submission_date) || formatDate(mbRecord?.first_seen);
  const lastSeen = formatDate(vtData?.last_analysis_date) || formatDate(mbRecord?.last_seen) || formatDate(vtData?.last_submission_date);

  const threatNames: any[] = vtData?.popular_threat_classification?.popular_threat_name || [];
  const threatCategories: any[] = vtData?.popular_threat_classification?.popular_threat_category || [];
  const names: string[] = Array.isArray(vtData?.names) ? vtData.names : [];
  const sandboxVerdicts: Record<string, any> = vtData?.sandbox_verdicts || {};
  const mbUrls: string[] = (Array.isArray(mbRecord?.file_information) ? mbRecord.file_information : [])
    .map((fi: any) => fi?.value)
    .filter(isUrlLike);

  return (
    <div className="space-y-4">
      {mbRecord && (
        <Callout
          icon={<Bug className="w-4 h-4" />}
          title={`MalwareBazaar has this sample${mbRecord.signature ? ` — ${mbRecord.signature}` : ''}`}
          detail={[
            mbRecord.first_seen ? `first seen ${formatDate(mbRecord.first_seen)}` : null,
            mbRecord.reporter ? `reported by ${mbRecord.reporter}` : null,
            mbRecord.delivery_method ? `delivery: ${mbRecord.delivery_method}` : null,
          ].filter(Boolean).join(' · ') || 'Known malware corpus match.'}
          tone="danger"
        />
      )}
      {haPrimary?.verdict === 'malicious' && (
        <Callout
          icon={<Activity className="w-4 h-4" />}
          title="Hybrid Analysis sandbox verdict: malicious"
          detail={[
            haPrimary.threat_score != null ? `threat score ${haPrimary.threat_score}` : null,
            haPrimary.vx_family ? `family ${haPrimary.vx_family}` : null,
            haPrimary.environment_description || null,
          ].filter(Boolean).join(' · ') || undefined}
          tone="danger"
        />
      )}

      <VerdictStrip scoring={scoring} />

      <div className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-4 gap-3">
        <MetricCard
          label="VirusTotal detections"
          value={vtStats ? `${vtMalicious} / ${vtTotal}` : 'No data'}
          detail={vtDetail}
          icon={<Shield className="w-3.5 h-3.5" />}
          tone={vtTone}
          highlight={vtTone === 'danger' || vtTone === 'warn'}
          mono={!!vtStats}
        />
        <MetricCard
          label="Malware family"
          value={family || 'None reported'}
          detail={familySource}
          icon={<Bug className="w-3.5 h-3.5" />}
          tone={family ? 'danger' : 'neutral'}
          highlight={!!family}
          mono={!!family}
        />
        <MetricCard
          label="File type"
          value={fileType || 'Unknown'}
          detail={[fileSize, fileExt ? `.${fileExt}` : null].filter(Boolean).join(' · ') || undefined}
          icon={<FileText className="w-3.5 h-3.5" />}
        />
        <MetricCard
          label="First / last seen"
          value={firstSeen || 'Unknown'}
          detail={lastSeen ? `last ${lastSeen}` : undefined}
          icon={<Fingerprint className="w-3.5 h-3.5" />}
        />
      </div>

      {vendorNames.length > 0 && (
        <ResultCard>
          <SectionHeader icon={<Tag className="w-4 h-4" />} title="Top vendor detection names" />
          <div className="mt-3">
            <ChipRow items={vendorNames} tone="danger" />
          </div>
        </ResultCard>
      )}

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {(threatNames.length > 0 || threatCategories.length > 0) && (
            <ResultCard>
              <SectionHeader icon={<AlertTriangle className="w-4 h-4" />} title="Threat classification (VirusTotal)" />
              <div className="space-y-3 mt-4">
                {threatNames.length > 0 && (
                  <div>
                    <SubLabel>Popular threat names</SubLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {threatNames.slice(0, proMode ? undefined : 3).map((n: any, idx: number) => (
                        <Chip key={idx} label={`${renderScalar(n?.value ?? n)}${n?.count != null ? ` (${n.count})` : ''}`} tone="danger" />
                      ))}
                    </div>
                  </div>
                )}
                {threatCategories.length > 0 && (
                  <div>
                    <SubLabel>Popular threat categories</SubLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {threatCategories.map((c: any, idx: number) => (
                        <Chip key={idx} label={`${renderScalar(c?.value ?? c)}${c?.count != null ? ` (${c.count})` : ''}`} tone="warn" mono={false} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ResultCard>
          )}

          <ScoreDriversCard scoring={scoring} onOpenVerdict={onOpenVerdict} />
        </div>

        <div className="space-y-4 min-w-0">
          {names.length > 0 && (
            <ResultCard>
              <SectionHeader icon={<FileText className="w-4 h-4" />} title={`Known file names (${names.length})`} />
              <div className="space-y-1.5 mt-4">
                {names.slice(0, 5).map((name, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 rounded-md text-sm break-all"
                    style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}`, color: palette.textPrimary, fontFamily: typography.mono }}
                  >
                    {name}
                  </div>
                ))}
                {names.length > 5 && (
                  <div className="text-xs pt-1" style={{ color: palette.textTertiary }}>
                    {names.length - 5} more in File Info
                  </div>
                )}
              </div>
            </ResultCard>
          )}

          {Object.keys(sandboxVerdicts).length > 0 && (
            <ResultCard>
              <SectionHeader icon={<Activity className="w-4 h-4" />} title="Sandbox verdicts" />
              <div className="space-y-1.5 mt-4">
                {Object.entries(sandboxVerdicts).slice(0, 2).map(([sandbox, verdict]: [string, any]) => (
                  <div
                    key={sandbox}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                    style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium" style={{ color: palette.textPrimary }}>{sandbox}</div>
                      <div className="text-xs truncate" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>
                        {Array.isArray(verdict?.malware_names) && verdict.malware_names.length > 0 ? verdict.malware_names.join(', ') : '—'}
                      </div>
                    </div>
                    <Pill label={renderScalar(verdict?.category)} tone={sandboxTone(verdict?.category)} />
                  </div>
                ))}
                {Object.keys(sandboxVerdicts).length > 2 && (
                  <div className="text-xs pt-1" style={{ color: palette.textTertiary }}>
                    {Object.keys(sandboxVerdicts).length - 2} more in Behavior
                  </div>
                )}
              </div>
            </ResultCard>
          )}

          {onScan && mbUrls.length > 0 && (
            <ResultCard>
              <SectionHeader icon={<ArrowUpRight className="w-4 h-4" />} title="Pivot: MalwareBazaar delivery URLs" />
              <div className="space-y-1.5 mt-4">
                {mbUrls.slice(0, 5).map((u, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3">
                    <span className="text-xs break-all" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>{u}</span>
                    <PivotButton label="Scan URL" onClick={() => onScan('url', u)} />
                  </div>
                ))}
              </div>
            </ResultCard>
          )}
        </div>
      </div>

      {onScan && typeof vtData?.sha256 === 'string' && vtData.sha256.toLowerCase() !== hash.toLowerCase() && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: palette.textTertiary }}>
          Canonical SHA-256 differs from the queried hash —
          <PivotButton label="open SHA-256 result" onClick={() => onScan('hash', vtData.sha256)} />
        </div>
      )}
    </div>
  );
}

function sandboxTone(category?: string): Tone {
  if (category === 'malicious') return 'danger';
  if (category === 'suspicious') return 'warn';
  if (category === 'harmless' || category === 'clean') return 'good';
  return 'neutral';
}

function ScoreDriversCard({ scoring, onOpenVerdict }: { scoring?: CalibratedScoring; onOpenVerdict: () => void }) {
  if (!scoring) return null;

  const drivers = [...(scoring.contributions || [])]
    .filter(c => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  const informational = (scoring.contributions || []).filter(c => c.points === 0);

  return (
    <ResultCard>
      <SectionHeader
        icon={<Scale className="w-4 h-4" />}
        title="Score drivers"
        actions={
          <button
            onClick={onOpenVerdict}
            className="flex items-center gap-1 text-xs font-medium transition-colors hover:brightness-125"
            style={{ color: palette.accent, fontFamily: typography.ui }}
          >
            Full breakdown
            <ArrowRight className="w-3 h-3" />
          </button>
        }
      />
      <div className="space-y-2 mt-4">
        {drivers.length === 0 && (
          <EmptyNote>No scoring signals — nothing in the feeds is driving this score up.</EmptyNote>
        )}
        {drivers.map((c, idx) => <DriverRow key={idx} contribution={c} />)}
        {informational.length > 0 && (
          <div className="text-xs pt-1" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
            {informational.length} informational note{informational.length > 1 ? 's' : ''} (0 pts) in the full breakdown
          </div>
        )}
      </div>
    </ResultCard>
  );
}

function DriverRow({ contribution }: { contribution: ScoreContribution }) {
  const weightTone: Tone = contribution.weight === 'high' ? 'danger' : contribution.weight === 'medium' ? 'warn' : 'neutral';
  return (
    <div
      className="flex items-start justify-between gap-3 px-3 py-2 rounded-md"
      style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
            {contribution.source}
          </span>
          <Pill label={contribution.weight} tone={weightTone} />
        </div>
        <div className="text-xs mt-0.5" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
          {contribution.note}
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
        +{contribution.points}
      </span>
    </div>
  );
}

/* ------------------------------- File Info ------------------------------- */

function FileInfoSection({ hash, vtData, mbRecord, haPrimary, proMode, onScan }: {
  hash: string;
  vtData: any;
  mbRecord: any;
  haPrimary: any;
  proMode: boolean;
  onScan?: (type: string, value: string) => void;
}) {
  const [showAllNames, setShowAllNames] = useState(false);
  const md5 = vtData?.md5 || mbRecord?.md5_hash || haPrimary?.md5;
  const sha1 = vtData?.sha1 || mbRecord?.sha1_hash || haPrimary?.sha1;
  const sha256 = vtData?.sha256 || mbRecord?.sha256_hash || haPrimary?.sha256;
  const names: string[] = Array.isArray(vtData?.names) ? vtData.names : [];
  const fileInfo: any[] = Array.isArray(mbRecord?.file_information) ? mbRecord.file_information : [];
  const yaraRules: any[] = Array.isArray(mbRecord?.yara_rules) ? mbRecord.yara_rules : [];

  if (!vtData && !mbRecord && !haPrimary) {
    return (
      <div className="space-y-4">
        <SectionHeader icon={<FileText className="w-4 h-4" />} title="File information" />
        <ResultCard><EmptyNote>No source returned file metadata for this hash.</EmptyNote></ResultCard>
      </div>
    );
  }

  const hashField = (label: string, value?: string) => (
    <Field label={label} value={value || 'Unknown'} mono>
      {onScan && value && value.toLowerCase() !== hash.toLowerCase() && (
        <div className="mt-1"><PivotButton label={`Look up ${label}`} onClick={() => onScan('hash', value)} /></div>
      )}
    </Field>
  );

  return (
    <div className="space-y-4">
      <SectionHeader icon={<FileText className="w-4 h-4" />} title="File information" />

      <ResultCard>
        <SectionHeader icon={<Fingerprint className="w-4 h-4" />} title="Identity" />
        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
          {hashField('MD5', md5)}
          {hashField('SHA-1', sha1)}
          {hashField('SHA-256', sha256)}
          <Field label="File size" value={formatBytes(vtData?.size ?? mbRecord?.file_size ?? haPrimary?.size) || 'Unknown'} />
          <Field label="File type" value={vtData?.type_description || mbRecord?.file_type || haPrimary?.type || 'Unknown'} />
          <Field label="Extension" value={vtData?.type_extension || 'Unknown'} mono />
          <Field label="Magic" value={vtData?.magic || 'Unknown'} />
          {(vtData?.meaningful_name || mbRecord?.file_name || haPrimary?.submit_name) && (
            <Field label="Primary file name" value={vtData?.meaningful_name || mbRecord?.file_name || haPrimary?.submit_name} mono />
          )}
          {mbRecord?.file_type_mime && <Field label="MIME type" value={mbRecord.file_type_mime} mono />}
          {proMode && (vtData?.imphash || mbRecord?.imphash) && <Field label="Imphash" value={vtData?.imphash || mbRecord?.imphash} mono />}
          {proMode && (vtData?.ssdeep || mbRecord?.ssdeep) && <Field label="ssdeep" value={vtData?.ssdeep || mbRecord?.ssdeep} mono />}
          {proMode && (vtData?.tlsh || mbRecord?.tlsh) && <Field label="TLSH" value={vtData?.tlsh || mbRecord?.tlsh} mono />}
          {proMode && vtData?.vhash && <Field label="vhash" value={vtData.vhash} mono />}
          {proMode && vtData?.authentihash && <Field label="Authentihash" value={vtData.authentihash} mono />}
        </div>
      </ResultCard>

      {vtData && (
        <ResultCard>
          <SectionHeader icon={<Shield className="w-4 h-4" />} title="VirusTotal submission history" />
          <div className="grid grid-cols-2 @xl:grid-cols-4 gap-x-5 gap-y-3.5 mt-4">
            <Field label="First submitted" value={formatDate(vtData.first_submission_date) || 'Unknown'} />
            <Field label="Last submitted" value={formatDate(vtData.last_submission_date) || 'Unknown'} />
            <Field label="Last analysed" value={formatDate(vtData.last_analysis_date) || 'Unknown'} />
            <Field label="Times submitted" value={vtData.times_submitted != null ? String(vtData.times_submitted) : 'Unknown'} />
            {vtData.reputation != null && (
              <Field label="Community reputation" value={String(vtData.reputation)} tone={vtData.reputation < 0 ? 'warn' : 'neutral'} />
            )}
            {vtData.unique_sources != null && <Field label="Unique sources" value={String(vtData.unique_sources)} />}
          </div>
          {proMode && Array.isArray(vtData.tags) && vtData.tags.length > 0 && (
            <div className="mt-4">
              <SubLabel>File tags</SubLabel>
              <ChipRow items={vtData.tags} />
            </div>
          )}
          {names.length > 0 && (
            <div className="mt-4">
              <SubLabel>Known file names ({names.length})</SubLabel>
              <div className="space-y-1.5">
                {(showAllNames ? names : names.slice(0, 8)).map((name, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-1.5 rounded-md text-xs break-all"
                    style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}`, color: palette.textPrimary, fontFamily: typography.mono }}
                  >
                    {name}
                  </div>
                ))}
              </div>
              {names.length > 8 && (
                <ExpandToggle expanded={showAllNames} onClick={() => setShowAllNames(!showAllNames)} label={showAllNames ? 'Show fewer' : `Show all ${names.length}`} />
              )}
            </div>
          )}
          {proMode && vtData.signature_info && typeof vtData.signature_info === 'object' && (
            <div className="mt-4">
              <SubLabel>Signature info</SubLabel>
              <KeyValueList data={vtData.signature_info} />
            </div>
          )}
          {proMode && Array.isArray(vtData.trid) && vtData.trid.length > 0 && (
            <div className="mt-4">
              <SubLabel>TrID</SubLabel>
              <div className="space-y-1">
                {vtData.trid.map((t: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-3 text-xs" style={{ color: palette.textSecondary }}>
                    <span className="truncate">{renderScalar(t?.file_type ?? t)}</span>
                    {t?.probability != null && <span className="tabular-nums shrink-0">{t.probability}%</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ResultCard>
      )}

      {mbRecord && (
        <ResultCard>
          <SectionHeader icon={<Bug className="w-4 h-4" />} title="MalwareBazaar record" />
          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
            <Field label="Signature" value={mbRecord.signature || 'None'} tone={mbRecord.signature ? 'danger' : 'neutral'} mono={!!mbRecord.signature} />
            <Field label="File name" value={mbRecord.file_name || 'Unknown'} mono />
            <Field label="First seen" value={formatDate(mbRecord.first_seen) || 'Unknown'} />
            <Field label="Last seen" value={formatDate(mbRecord.last_seen) || 'Unknown'} />
            <Field label="Reporter" value={mbRecord.reporter || 'Unknown'} />
            <Field label="Origin country" value={mbRecord.origin_country || 'Unknown'} />
            <Field label="Delivery method" value={mbRecord.delivery_method || 'Unknown'} />
            {mbRecord.anonymous != null && <Field label="Anonymous upload" value={mbRecord.anonymous ? 'Yes' : 'No'} />}
          </div>
          {Array.isArray(mbRecord.tags) && mbRecord.tags.length > 0 && (
            <div className="mt-4">
              <SubLabel>Tags</SubLabel>
              <ChipRow items={mbRecord.tags} />
            </div>
          )}
          {mbRecord.comment && (
            <div className="mt-4">
              <SubLabel>Reporter comment</SubLabel>
              <div className="text-xs whitespace-pre-wrap break-words" style={{ color: palette.textSecondary }}>{String(mbRecord.comment)}</div>
            </div>
          )}
          {fileInfo.length > 0 && (
            <div className="mt-4">
              <SubLabel>File information / context</SubLabel>
              <div className="space-y-1.5">
                {fileInfo.map((fi: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md"
                    style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                  >
                    <span className="text-[11px] shrink-0 w-24" style={{ color: palette.textTertiary }}>{renderScalar(fi?.context)}</span>
                    <span className="text-xs flex-1 min-w-0 break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>
                      {renderScalar(fi?.value)}
                    </span>
                    {onScan && isUrlLike(fi?.value) && <PivotButton label="Scan URL" onClick={() => onScan('url', fi.value)} />}
                  </div>
                ))}
              </div>
            </div>
          )}
          {mbRecord.intelligence && typeof mbRecord.intelligence === 'object' && (
            <div className="mt-4">
              <SubLabel>Intelligence</SubLabel>
              <KeyValueList data={mbRecord.intelligence} />
            </div>
          )}
          {proMode && mbRecord.code_sign && (Array.isArray(mbRecord.code_sign) ? mbRecord.code_sign.length > 0 : true) && (
            <div className="mt-4">
              <SubLabel>Code signing</SubLabel>
              <AnyValue value={mbRecord.code_sign} />
            </div>
          )}
          {yaraRules.length > 0 && (
            <div className="mt-4">
              <SubLabel>YARA rules ({yaraRules.length})</SubLabel>
              <div className="space-y-1.5">
                {yaraRules.slice(0, proMode ? undefined : 5).map((rule: any, idx: number) => (
                  <div key={idx} className="px-3 py-2 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                    <div className="text-sm font-medium" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{renderScalar(rule?.rule_name ?? rule)}</div>
                    {(rule?.description || rule?.author) && (
                      <div className="text-xs mt-0.5" style={{ color: palette.textSecondary }}>
                        {rule.description}{rule.author ? ` — ${rule.author}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}

/** Flat key/value listing for nested objects that used to render as `[object Object]`. */
function KeyValueList({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return <EmptyNote>Empty</EmptyNote>;
  return (
    <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-5 gap-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <div className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>{k}</div>
          <div className="text-xs break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>
            <AnyValue value={v} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Detections ------------------------------ */

function DetectionsSection({ vtData, vtStats, mbRecord, haPrimary, avRaw, proMode }: {
  vtData: any;
  vtStats: any;
  mbRecord: any;
  haPrimary: any;
  avRaw: any;
  proMode: boolean;
}) {
  const [showClean, setShowClean] = useState(false);
  const engines = Object.entries<any>(vtData?.last_analysis_results || {});
  const malicious = engines.filter(([, r]) => r?.category === 'malicious');
  const suspicious = engines.filter(([, r]) => r?.category === 'suspicious');
  const clean = engines.filter(([, r]) => r?.category === 'undetected' || r?.category === 'harmless');
  const other = engines.filter(([, r]) => !['malicious', 'suspicious', 'undetected', 'harmless'].includes(r?.category));
  const pulses: any[] = Array.isArray(avRaw?.pulse_info?.pulses) ? avRaw.pulse_info.pulses : [];
  const pulseCount = Number(avRaw?.pulse_info?.count ?? pulses.length);

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Shield className="w-4 h-4" />} title="Antivirus detections" />

      {vtStats ? (
        <ResultCard>
          <SectionHeader title="VirusTotal engine summary" />
          <div className="grid grid-cols-2 @xl:grid-cols-3 @3xl:grid-cols-6 gap-3 mt-4">
            <StatCell label="Malicious" value={Number(vtStats.malicious ?? 0)} tone={vtStats.malicious ? 'danger' : 'neutral'} />
            <StatCell label="Suspicious" value={Number(vtStats.suspicious ?? 0)} tone={vtStats.suspicious ? 'warn' : 'neutral'} />
            <StatCell label="Undetected" value={Number(vtStats.undetected ?? 0)} />
            <StatCell label="Harmless" value={Number(vtStats.harmless ?? 0)} tone={vtStats.harmless ? 'good' : 'neutral'} />
            <StatCell label="Timeout" value={Number(vtStats.timeout ?? 0)} />
            <StatCell label="Failure" value={Number(vtStats.failure ?? 0)} />
          </div>
          {(vtStats['type-unsupported'] != null || vtStats['confirmed-timeout'] != null) && (
            <div className="text-xs mt-3" style={{ color: palette.textTertiary }}>
              {[
                vtStats['type-unsupported'] != null ? `${vtStats['type-unsupported']} type-unsupported` : null,
                vtStats['confirmed-timeout'] != null ? `${vtStats['confirmed-timeout']} confirmed-timeout` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
        </ResultCard>
      ) : (
        <ResultCard><EmptyNote>No VirusTotal engine results for this hash.</EmptyNote></ResultCard>
      )}

      {malicious.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Malicious detections (${malicious.length})`} />
          <div className="space-y-1.5 mt-4 max-h-96 overflow-y-auto pr-1">
            {malicious.slice(0, proMode ? undefined : 10).map(([engine, r]) => (
              <EngineRow key={engine} engine={engine} result={r} tone="danger" />
            ))}
          </div>
          {!proMode && malicious.length > 10 && (
            <div className="text-xs mt-2" style={{ color: palette.textTertiary }}>{malicious.length - 10} more in Pro mode</div>
          )}
        </ResultCard>
      )}

      {proMode && suspicious.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Suspicious detections (${suspicious.length})`} />
          <div className="space-y-1.5 mt-4 max-h-96 overflow-y-auto pr-1">
            {suspicious.map(([engine, r]) => <EngineRow key={engine} engine={engine} result={r} tone="warn" />)}
          </div>
        </ResultCard>
      )}

      {proMode && (clean.length > 0 || other.length > 0) && (
        <ResultCard>
          <SectionHeader title={`Non-detecting engines (${clean.length + other.length})`} />
          <ExpandToggle expanded={showClean} onClick={() => setShowClean(!showClean)} label={showClean ? 'Hide engines' : 'List engines'} />
          {showClean && (
            <div className="space-y-1.5 mt-3 max-h-96 overflow-y-auto pr-1">
              {[...clean, ...other].map(([engine, r]) => (
                <EngineRow key={engine} engine={engine} result={r} tone={r?.category === 'harmless' ? 'good' : 'neutral'} />
              ))}
            </div>
          )}
        </ResultCard>
      )}

      {haPrimary && (
        <ResultCard>
          <SectionHeader icon={<Activity className="w-4 h-4" />} title="Hybrid Analysis" />
          <div className="grid grid-cols-2 @xl:grid-cols-4 gap-x-5 gap-y-3.5 mt-4">
            <Field label="Verdict" value={haPrimary.verdict || 'Unknown'} tone={haVerdictTone(haPrimary.verdict)} />
            <Field label="Threat score" value={haPrimary.threat_score != null ? String(haPrimary.threat_score) : 'Unknown'} />
            <Field label="AV detect" value={haPrimary.av_detect != null ? `${haPrimary.av_detect}%` : 'Unknown'} />
            <Field label="Family" value={haPrimary.vx_family || 'None'} mono={!!haPrimary.vx_family} tone={haPrimary.vx_family ? 'danger' : 'neutral'} />
          </div>
          {Array.isArray(haPrimary.classification_tags) && haPrimary.classification_tags.length > 0 && (
            <div className="mt-4">
              <SubLabel>Classification tags</SubLabel>
              <ChipRow items={haPrimary.classification_tags} tone="warn" mono={false} />
            </div>
          )}
        </ResultCard>
      )}

      {proMode && mbRecord?.vendor_intel && typeof mbRecord.vendor_intel === 'object' && Object.keys(mbRecord.vendor_intel).length > 0 && (
        <ResultCard>
          <SectionHeader icon={<Bug className="w-4 h-4" />} title={`MalwareBazaar vendor intel (${Object.keys(mbRecord.vendor_intel).length})`} />
          <div className="space-y-3 mt-4">
            {Object.entries<any>(mbRecord.vendor_intel).map(([vendor, intel]) => (
              <div key={vendor}>
                <div className="text-xs font-semibold mb-1" style={{ color: palette.textPrimary }}>{vendor}</div>
                <AnyValue value={intel} />
              </div>
            ))}
          </div>
        </ResultCard>
      )}

      {pulseCount > 0 && (
        <ResultCard>
          <SectionHeader icon={<Database className="w-4 h-4" />} title={`AlienVault OTX pulses (${pulseCount})`} />
          <div className="space-y-2 mt-4">
            {pulses.slice(0, proMode ? 10 : 3).map((pulse: any, idx: number) => (
              <div key={idx} className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-sm font-semibold" style={{ color: palette.textPrimary }}>{renderScalar(pulse?.name)}</div>
                  <span className="text-[11px] shrink-0" style={{ color: palette.textTertiary }}>
                    {formatDate(pulse?.modified || pulse?.created) || ''}
                  </span>
                </div>
                {pulse?.description && (
                  <div className="text-xs mb-1.5" style={{ color: palette.textSecondary }}>{String(pulse.description).slice(0, 280)}</div>
                )}
                {Array.isArray(pulse?.tags) && pulse.tags.length > 0 && <ChipRow items={pulse.tags.slice(0, 6)} mono={false} />}
              </div>
            ))}
            {pulses.length === 0 && <EmptyNote>Pulse details were not included in the OTX response.</EmptyNote>}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

function haVerdictTone(verdict?: string): Tone {
  if (verdict === 'malicious') return 'danger';
  if (verdict === 'suspicious') return 'warn';
  if (verdict === 'whitelisted' || verdict === 'no specific threat') return 'good';
  return 'neutral';
}

function EngineRow({ engine, result, tone }: { engine: string; result: any; tone: Tone }) {
  const label = tone === 'danger' ? 'Detected' : tone === 'warn' ? 'Suspicious' : renderScalar(result?.category);
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
      style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>{engine}</div>
        {result?.result && (
          <div className="text-xs truncate" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>{renderScalar(result.result)}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {result?.engine_version && (
          <span className="text-[11px] tabular-nums" style={{ color: palette.textTertiary, fontFamily: typography.mono }}>
            v{result.engine_version}
          </span>
        )}
        <Pill label={label} tone={tone} />
      </div>
    </div>
  );
}

/* -------------------------------- Behavior ------------------------------- */

function BehaviorSection({ vtData, haReports, proMode, onScan }: {
  vtData: any;
  haReports: any[];
  proMode: boolean;
  onScan?: (type: string, value: string) => void;
}) {
  const sandboxVerdicts = Object.entries<any>(vtData?.sandbox_verdicts || {});
  const sigmaResults: any[] = Array.isArray(vtData?.sigma_analysis_results) ? vtData.sigma_analysis_results : [];
  const idsResults: any[] = Array.isArray(vtData?.crowdsourced_ids_results) ? vtData.crowdsourced_ids_results : [];
  const yaraResults: any[] = Array.isArray(vtData?.crowdsourced_yara_results) ? vtData.crowdsourced_yara_results : [];
  const nothing = sandboxVerdicts.length === 0 && sigmaResults.length === 0 && idsResults.length === 0 && yaraResults.length === 0 && haReports.length === 0;

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Activity className="w-4 h-4" />} title="Behavioral analysis" />

      {nothing && (
        <ResultCard><EmptyNote>No sandbox, Sigma, IDS or YARA behaviour data was returned for this hash.</EmptyNote></ResultCard>
      )}

      {sandboxVerdicts.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Sandbox verdicts (${sandboxVerdicts.length})`} />
          <div className="space-y-2 mt-4">
            {sandboxVerdicts.map(([sandbox, verdict]) => (
              <div key={sandbox} className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="text-sm font-semibold" style={{ color: palette.textPrimary }}>{sandbox}</div>
                  <Pill label={renderScalar(verdict?.category)} tone={sandboxTone(verdict?.category)} />
                </div>
                {Array.isArray(verdict?.malware_names) && verdict.malware_names.length > 0 && (
                  <div className="text-xs mb-1.5" style={{ color: palette.textSecondary }}>
                    <span className="font-medium">Malware:</span>{' '}
                    <span style={{ fontFamily: typography.mono }}>{verdict.malware_names.join(', ')}</span>
                  </div>
                )}
                {Array.isArray(verdict?.malware_classification) && verdict.malware_classification.length > 0 && (
                  <ChipRow items={verdict.malware_classification} tone="warn" mono={false} />
                )}
                {verdict?.confidence != null && (
                  <div className="text-[11px] mt-1.5" style={{ color: palette.textTertiary }}>confidence {verdict.confidence}</div>
                )}
              </div>
            ))}
          </div>
        </ResultCard>
      )}

      {haReports.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Hybrid Analysis sandbox reports (${haReports.length})`} />
          <div className="space-y-3 mt-4">
            {haReports.slice(0, proMode ? undefined : 2).map((report: any, idx: number) => (
              <HybridAnalysisReport key={report?.job_id ?? idx} report={report} proMode={proMode} onScan={onScan} />
            ))}
          </div>
        </ResultCard>
      )}

      {proMode && sigmaResults.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Sigma rule matches (${sigmaResults.length})`} />
          <div className="space-y-2 mt-4">
            {sigmaResults.map((rule: any, idx: number) => (
              <div key={idx} className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-sm font-semibold" style={{ color: palette.textPrimary }}>{renderScalar(rule?.rule_title ?? rule?.rule_id)}</div>
                  <Pill label={renderScalar(rule?.rule_level)} tone={sigmaTone(rule?.rule_level)} />
                </div>
                {rule?.rule_description && <div className="text-xs" style={{ color: palette.textSecondary }}>{String(rule.rule_description)}</div>}
                {(rule?.rule_source || rule?.rule_author) && (
                  <div className="text-[11px] mt-1" style={{ color: palette.textTertiary }}>
                    {[rule.rule_source, rule.rule_author].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ResultCard>
      )}

      {proMode && idsResults.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Crowdsourced IDS alerts (${idsResults.length})`} />
          <div className="space-y-2 mt-4">
            {idsResults.map((alert: any, idx: number) => (
              <div key={idx} className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-sm font-semibold" style={{ color: palette.textPrimary }}>{renderScalar(alert?.rule_msg ?? alert?.rule_id)}</div>
                  {alert?.alert_severity && <Pill label={renderScalar(alert.alert_severity)} tone={sigmaTone(alert.alert_severity)} />}
                </div>
                <div className="text-[11px]" style={{ color: palette.textTertiary }}>
                  {[alert?.rule_category, alert?.rule_source].filter(Boolean).join(' · ')}
                </div>
                {alert?.alert_context && <div className="mt-1.5"><AnyValue value={alert.alert_context} /></div>}
              </div>
            ))}
          </div>
        </ResultCard>
      )}

      {proMode && yaraResults.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Crowdsourced YARA matches (${yaraResults.length})`} />
          <div className="space-y-2 mt-4">
            {yaraResults.map((y: any, idx: number) => (
              <div key={idx} className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                <div className="text-sm font-semibold" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{renderScalar(y?.rule_name)}</div>
                {y?.description && <div className="text-xs mt-0.5" style={{ color: palette.textSecondary }}>{String(y.description)}</div>}
                <div className="text-[11px] mt-1" style={{ color: palette.textTertiary }}>
                  {[y?.ruleset_name, y?.author, y?.source].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

function sigmaTone(level?: string): Tone {
  const l = String(level || '').toLowerCase();
  if (l === 'critical' || l === 'high') return 'danger';
  if (l === 'medium') return 'warn';
  return 'neutral';
}

function HybridAnalysisReport({ report, proMode, onScan }: { report: any; proMode: boolean; onScan?: (type: string, value: string) => void }) {
  const domains: string[] = Array.isArray(report?.domains) ? report.domains : [];
  const hosts: string[] = Array.isArray(report?.hosts) ? report.hosts : [];
  const compromised: string[] = Array.isArray(report?.compromised_hosts) ? report.compromised_hosts : [];
  const mitre: any[] = Array.isArray(report?.mitre_attcks) ? report.mitre_attcks : [];

  return (
    <div className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: palette.textPrimary }}>{report?.environment_description || 'Sandbox run'}</div>
          <div className="text-[11px]" style={{ color: palette.textTertiary }}>
            {[formatDate(report?.analysis_start_time), report?.state, report?.submit_name].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Pill label={renderScalar(report?.verdict)} tone={haVerdictTone(report?.verdict)} />
      </div>
      <div className="grid grid-cols-2 @xl:grid-cols-4 gap-x-4 gap-y-2">
        <Field label="Threat score" value={report?.threat_score != null ? String(report.threat_score) : '—'} />
        <Field label="Network connections" value={report?.total_network_connections != null ? String(report.total_network_connections) : '—'} />
        <Field label="Processes" value={report?.total_processes != null ? String(report.total_processes) : '—'} />
        <Field label="Signatures" value={report?.total_signatures != null ? String(report.total_signatures) : '—'} />
      </div>
      {domains.length > 0 && (
        <PivotList label="Contacted domains" items={domains} type="domain" onScan={onScan} limit={proMode ? 20 : 5} />
      )}
      {hosts.length > 0 && (
        <PivotList label="Contacted hosts" items={hosts} type="ip" onScan={onScan} limit={proMode ? 20 : 5} />
      )}
      {compromised.length > 0 && (
        <PivotList label="Compromised hosts" items={compromised} type="ip" onScan={onScan} limit={proMode ? 20 : 5} tone="danger" />
      )}
      {mitre.length > 0 && proMode && (
        <div className="mt-3">
          <SubLabel>MITRE ATT&amp;CK</SubLabel>
          <div className="flex flex-wrap gap-1.5">
            {mitre.map((m: any, idx: number) => (
              <Chip key={idx} label={`${renderScalar(m?.attck_id ?? '')} ${renderScalar(m?.technique ?? m?.tactic ?? '')}`.trim()} mono={false} />
            ))}
          </div>
        </div>
      )}
      {Array.isArray(report?.tags) && report.tags.length > 0 && proMode && (
        <div className="mt-3">
          <SubLabel>Tags</SubLabel>
          <ChipRow items={report.tags} mono={false} />
        </div>
      )}
    </div>
  );
}

function PivotList({ label, items, type, onScan, limit, tone = 'neutral' }: {
  label: string; items: string[]; type: string; onScan?: (type: string, value: string) => void; limit: number; tone?: Tone;
}) {
  return (
    <div className="mt-3">
      <SubLabel>{label} ({items.length})</SubLabel>
      <div className="space-y-1">
        {items.slice(0, limit).map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3">
            <span className="text-xs break-all" style={{ color: tone === 'danger' ? palette.rose : palette.textPrimary, fontFamily: typography.mono }}>
              {renderScalar(item)}
            </span>
            {onScan && typeof item === 'string' && <PivotButton label={`Scan ${type}`} onClick={() => onScan(type, item)} />}
          </div>
        ))}
        {items.length > limit && (
          <div className="text-[11px]" style={{ color: palette.textTertiary }}>{items.length - limit} more{limit < 20 ? ' in Pro mode' : ''}</div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Sources -------------------------------- */

function SourcesSection({ sources, proMode }: { sources: Record<string, HashSourceEntry>; proMode: boolean }) {
  const rows = [
    ...KNOWN_SOURCES,
    ...Object.keys(sources).filter(k => !KNOWN_SOURCES.some(s => s.key === k)).map(k => ({ key: k, label: k })),
  ];
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(Object.keys(sources)));

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Database className="w-4 h-4" />} title={`Individual sources (${rows.length})`} />

      <div className="space-y-2">
        {rows.map(({ key, label }) => {
          const entry = sources[key];
          const ran = !!entry && entry.checked !== false;
          const hasError = ran && !!entry?.error;
          const status: { label: string; tone: Tone } = !ran
            ? { label: 'Not run', tone: 'neutral' }
            : hasError
              ? { label: 'Error', tone: 'danger' }
              : { label: 'OK', tone: 'good' };
          const isExpanded = expandedKeys.has(key);
          const recordNote = ran && !hasError && entry?.found != null
            ? (entry.found ? 'record found' : 'no record')
            : undefined;

          return (
            <div
              key={key}
              className="rounded-lg overflow-hidden"
              style={{
                background: hasError ? `${palette.rose}0d` : palette.base,
                border: `1px solid ${hasError ? `${palette.rose}40` : palette.borderDefault}`,
                opacity: ran ? 1 : 0.75,
              }}
            >
              <button
                onClick={() => ran && toggle(key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:brightness-110"
                style={{ background: 'transparent', cursor: ran ? 'pointer' : 'default' }}
                title={hasError && entry?.error ? entry.error : undefined}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {ran && (isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                    : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />)}
                  <span className="text-sm font-semibold truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                    {label}
                  </span>
                  <span className="text-[11px] truncate" style={{ color: palette.textTertiary, fontFamily: typography.mono }}>{key}</span>
                  {recordNote && (
                    <span className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>· {recordNote}</span>
                  )}
                  {ran && entry?.threatScore != null && (
                    <span className="text-[11px] tabular-nums" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>· score {entry.threatScore}</span>
                  )}
                </span>
                <Pill label={status.label} tone={status.tone} />
              </button>
              {ran && isExpanded && (
                <div className="px-4 pb-4">
                  {hasError && entry?.error && (
                    <div className="text-xs mb-2" style={{ color: palette.rose, fontFamily: typography.ui }}>{entry.error}</div>
                  )}
                  {proMode ? (
                    <JsonBlock data={entry} />
                  ) : !hasError ? (
                    <div className="text-xs" style={{ color: palette.textTertiary }}>Raw provider payload is shown in Pro mode.</div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Raw JSON ------------------------------- */

function RawJsonSection({ data }: { data: unknown }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={<FileJson className="w-4 h-4" />} title="Raw JSON" />
      <JsonBlock data={data} maxHeight="max-h-[70vh]" />
    </div>
  );
}
