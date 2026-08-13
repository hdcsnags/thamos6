import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, Shield, Database, MapPin, Server, Wifi,
  ExternalLink, Target, GitBranch, Scale, ChevronDown, ChevronRight, ArrowRight,
} from 'lucide-react';
import { useTheme } from '../../contexts/themecontext';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult, CalibratedScoring, ScoreContribution } from '../../types';
import { RelatedIOCs } from '../../components/RelatedIOCs';
import VerdictPanel from '../../components/scanner/VerdictPanel';
import VerdictStrip from '../../components/scanner/VerdictStrip';
import { palette, typography } from '../../design-system/tokens';
import {
  ResultShell, ResultLoading, ResultError, ResultEmpty,
  MetricCard, StatCell, Pill, SectionHeader, Callout, ResultCard, SummaryActions, SignalLight,
  type ShellMenuItem, type Tone,
} from '../../components/results';

interface IPResultProps {
  ip: string;
  onScan?: (type: string, value: string) => void;
}

type MenuItem = 'overview' | 'verdict' | 'threats' | 'vpn' | 'pivot' | 'sources';

// AbuseIPDB report category IDs → analyst-facing labels (official taxonomy).
const ABUSEIPDB_CATEGORIES: Record<number, string> = {
  1: 'DNS Compromise', 2: 'DNS Poisoning', 3: 'Fraud Orders', 4: 'DDoS Attack',
  5: 'FTP Brute-Force', 6: 'Ping of Death', 7: 'Phishing', 8: 'Fraud VoIP',
  9: 'Open Proxy', 10: 'Web Spam', 11: 'Email Spam', 12: 'Blog Spam',
  13: 'VPN IP', 14: 'Port Scan', 15: 'Hacking', 16: 'SQL Injection',
  17: 'Spoofing', 18: 'Brute-Force', 19: 'Bad Web Bot', 20: 'Exploited Host',
  21: 'Web App Attack', 22: 'SSH Abuse', 23: 'IoT Targeted',
};

const VERDICT_META: Record<CalibratedScoring['verdict'], { label: string; tone: Tone }> = {
  malicious: { label: 'Malicious', tone: 'danger' },
  suspicious: { label: 'Suspicious', tone: 'warn' },
  low_signal: { label: 'Low signal', tone: 'neutral' },
  no_signal: { label: 'No signal', tone: 'good' },
};

// ProxyCheck v3 nests the result under the queried IP key; normalize to the
// entry object ({ detections, network, location, operator }).
function normalizeProxyCheck(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.network || raw.detections || raw.operator) return raw;
  const key = raw.ip || Object.keys(raw).find(k => k.includes('.') || k.includes(':'));
  return key && raw[key] && typeof raw[key] === 'object' ? raw[key] : null;
}

export default function IPResult({ ip, onScan }: IPResultProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [proMode, setProMode] = useState(false);
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
        const data = await lookupIP(ip);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup IP');
      } finally {
        setLoading(false);
      }
    };

    performLookup();
  }, [ip]);

  if (loading && !result) {
    return <div ref={containerRef} className="h-full"><ResultLoading message={`Analyzing ${ip}…`} /></div>;
  }

  if (error) {
    return <div ref={containerRef} className="h-full"><ResultError message={error} /></div>;
  }

  if (!result) {
    return <div ref={containerRef} className="h-full"><ResultEmpty message={`No result data available for ${ip}.`} /></div>;
  }

  const enrichment = result.enrichment || {};
  // Edge function payload carries per-provider raw data in `sources`; the
  // IPLookupResult type only declares the aggregated `results` map.
  const sources: Record<string, any> = (result as unknown as { sources?: Record<string, any> }).sources || {};

  const spamhausData = sources.spamhaus as any;
  const alienVaultData = sources.alienvault as any;
  const proxyCheckEntry = normalizeProxyCheck(sources.proxycheck);
  const virusTotalData = sources.virustotal as any;
  const abuseIPDBData = sources.abuseipdb as any;
  const teamCymruData = sources.teamcymru as any;

  const menuItems: ShellMenuItem<MenuItem>[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'verdict', label: 'Verdict', icon: Scale },
    { id: 'threats', label: 'Threats', icon: AlertTriangle },
    { id: 'vpn', label: 'VPN/Proxy', icon: Wifi },
    { id: 'pivot', label: 'Pivot Graph', icon: GitBranch },
    { id: 'sources', label: 'Sources', icon: Database },
  ];

  // Calibrated verdict is the headline — the legacy score/isMalicious pipeline
  // over-weights informational listings (Spamhaus PBL, VPN) and erodes trust.
  const scoring = result.scoring;
  const verdictMeta = scoring
    ? VERDICT_META[scoring.verdict]
    : { label: result.isMalicious ? 'Malicious' : 'Clean', tone: (result.isMalicious ? 'danger' : 'good') as Tone };
  const headlineScore = scoring ? scoring.calibrated : result.overallThreatScore;

  const getSummary = () => {
    const e = result.enrichment || {};
    const lines = [
      `IP: ${ip}`,
      `Verdict: ${verdictMeta.label} (score ${headlineScore})`,
      `Country: ${e.country || 'Unknown'}`,
      `Org: ${e.org || 'Unknown'}`,
      `Tor: ${e.isTor ? 'Yes' : 'No'} | VPN: ${e.isVPN ? (e.vpnService || 'Yes') : 'No'} | Proxy: ${e.isProxy ? 'Yes' : 'No'}`,
    ];
    if (scoring?.legacy != null && scoring.legacy !== scoring.calibrated) {
      lines.push(`Legacy score: ${scoring.legacy}`);
    }
    return lines.join('\n');
  };

  const signals = (
    <>
      <SignalLight label="TOR" on={!!enrichment.isTor} tone="danger" />
      <SignalLight label="VPN" on={!!enrichment.isVPN} tone="warn" detail={enrichment.vpnService || undefined} />
      <SignalLight label="PROXY" on={!!enrichment.isProxy} tone="warn" />
      <SignalLight label="HOSTING" on={!!enrichment.isHosting} tone="accent" />
      {enrichment.countryCode && (
        <SignalLight
          label={enrichment.countryCode.toUpperCase()}
          on
          tone="neutral"
          detail={enrichment.city || enrichment.country || undefined}
        />
      )}
    </>
  );

  return (
    <div ref={containerRef} className="h-full">
      <ResultShell<MenuItem>
        value={ip}
        typeLabel="IP reputation"
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
            enrichment={enrichment}
            scoring={scoring}
            spamhausData={spamhausData}
            abuseIPDBData={abuseIPDBData}
            virusTotalData={virusTotalData}
            teamCymruData={teamCymruData}
            proMode={proMode}
            onOpenVerdict={() => setActiveMenu('verdict')}
          />
        )}

        {activeMenu === 'verdict' && (
          <VerdictPanel lookupType="ip" value={ip} scoring={result.scoring} />
        )}

        {activeMenu === 'threats' && (
          <ThreatsSection spamhausData={spamhausData} alienVaultData={alienVaultData} virusTotalData={virusTotalData} proMode={proMode} />
        )}

        {activeMenu === 'vpn' && (
          <VPNSection enrichment={enrichment} sources={sources} proxyCheckEntry={proxyCheckEntry} />
        )}

        {activeMenu === 'pivot' && (
          <div className="space-y-4">
            <SectionHeader icon={<GitBranch className="w-4 h-4" />} title="IOC pivot graph" />
            <RelatedIOCs iocType="ip" iocValue={ip} onScan={onScan} />
          </div>
        )}

        {activeMenu === 'sources' && (
          <SourcesSection sources={sources} />
        )}
      </ResultShell>
    </div>
  );
}

/* ------------------------------- Overview -------------------------------- */

function OverviewSection({ enrichment, scoring, spamhausData, abuseIPDBData, virusTotalData, teamCymruData, proMode, onOpenVerdict }: {
  enrichment: any;
  scoring?: CalibratedScoring;
  spamhausData: any;
  abuseIPDBData: any;
  virusTotalData: any;
  teamCymruData: any;
  proMode: boolean;
  onOpenVerdict: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Notable findings first — tinted only when the state is real */}
      {enrichment.spamhausListed && spamhausData?.listedIn && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          title="Spamhaus blocklist detected"
          detail={`Listed in ${spamhausData.listedIn.length} blocklist(s) — details in Threats. PBL-only listings are informational (residential policy list), not maliciousness.`}
          tone="warn"
        />
      )}
      {enrichment.isTor && (
        <Callout
          icon={<Shield className="w-4 h-4" />}
          title="Tor exit node"
          detail="Traffic from this address is anonymised through the Tor network — automatic review flag for student traffic."
          tone="danger"
        />
      )}

      <VerdictStrip scoring={scoring} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <ContextCard enrichment={enrichment} teamCymruData={teamCymruData} proMode={proMode} />
          <ScoreDriversCard scoring={scoring} onOpenVerdict={onOpenVerdict} />
        </div>
        <div className="space-y-4 min-w-0">
          <AbuseIPDBCard abuseIPDBData={abuseIPDBData} />
          <VirusTotalCard virusTotalData={virusTotalData} />
        </div>
      </div>
    </div>
  );
}

/** Merged Network + Location context — everything an analyst geo/attribution
 *  checks in one card, instead of two thin tabs. */
function ContextCard({ enrichment, teamCymruData, proMode }: { enrichment: any; teamCymruData: any; proMode: boolean }) {
  const vpnActive = enrichment.isVPN || enrichment.isProxy;

  return (
    <ResultCard>
      <SectionHeader icon={<Server className="w-4 h-4" />} title="Context" />
      <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
        <ContextField
          label="Location"
          value={enrichment.country || 'Unknown'}
          detail={[enrichment.city, enrichment.region].filter(Boolean).join(', ') || undefined}
        />
        <ContextField label="Timezone" value={enrichment.timezone || 'Unknown'} />
        <ContextField label="Organization" value={enrichment.org || 'Unknown'} />
        <ContextField label="ISP" value={enrichment.isp || 'Unknown'} />
        <ContextField label="ASN" value={enrichment.asn || 'Unknown'} mono />
        <ContextField
          label="Hosting / datacenter"
          value={enrichment.isHosting ? 'Yes' : 'No'}
          tone={enrichment.isHosting ? 'warn' : 'neutral'}
        />
        <ContextField
          label="Anonymity"
          value={
            enrichment.isTor ? 'Tor exit node'
            : enrichment.isVPN ? `VPN${enrichment.vpnService ? ` — ${enrichment.vpnService}` : ''}`
            : enrichment.isProxy ? 'Proxy'
            : 'None detected'
          }
          tone={enrichment.isTor ? 'danger' : vpnActive ? 'warn' : 'neutral'}
        />
        {enrichment.confidence != null && (
          <ContextField label="Detection confidence" value={`${enrichment.confidence}%`} />
        )}
        {proMode && (
          <>
            <ContextField label="Coordinates" value={enrichment.lat != null ? `${enrichment.lat}, ${enrichment.lon}` : 'Unknown'} mono />
            {teamCymruData?.bgp_prefix && <ContextField label="BGP prefix" value={teamCymruData.bgp_prefix} mono />}
            {teamCymruData?.registry && <ContextField label="Registry" value={String(teamCymruData.registry).toUpperCase()} />}
            {teamCymruData?.allocated && <ContextField label="Allocated" value={teamCymruData.allocated} />}
          </>
        )}
      </div>
    </ResultCard>
  );
}

function ContextField({ label, value, detail, tone = 'neutral', mono = false }: {
  label: string; value: ReactNode; detail?: string; tone?: Tone; mono?: boolean;
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
      {detail && (
        <div className="text-xs mt-0.5" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>{detail}</div>
      )}
    </div>
  );
}

/** "Why this score" — top calibrated contributions, with a jump to the full
 *  Verdict breakdown. Answers "largely due to X" at a glance. */
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
          <div className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            No scoring signals — nothing in the feeds is driving this score up.
          </div>
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

/** AbuseIPDB confidence with click-to-expand actual reports (verbose payload). */
function AbuseIPDBCard({ abuseIPDBData }: { abuseIPDBData: any }) {
  const [expanded, setExpanded] = useState(false);
  const data = abuseIPDBData?.data;
  if (!data) return null;

  const abuseScore = data.abuseConfidenceScore || 0;
  const totalReports = data.totalReports || 0;
  const reports: any[] = Array.isArray(data.reports) ? data.reports : [];
  const scoreTone: Tone = abuseScore > 50 ? 'danger' : abuseScore > 0 ? 'warn' : 'neutral';

  return (
    <ResultCard>
      <SectionHeader icon={<AlertTriangle className="w-4 h-4" />} title="AbuseIPDB" />
      <div className="grid grid-cols-3 gap-3 mt-4">
        <StatCell label="Confidence" value={`${abuseScore}%`} tone={scoreTone} />
        <StatCell label="Reports (90d)" value={totalReports} tone={totalReports > 0 ? 'warn' : 'neutral'} />
        <StatCell label="Distinct users" value={data.numDistinctUsers ?? 0} />
      </div>
      {data.lastReportedAt && (
        <div className="text-xs mt-3" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
          Last reported {formatDate(data.lastReportedAt)}
          {data.usageType ? ` · ${data.usageType}` : ''}
        </div>
      )}
      {reports.length > 0 && (
        <>
          <ExpandToggle
            expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            label={expanded ? 'Hide reports' : `View ${reports.length} report${reports.length > 1 ? 's' : ''}`}
          />
          {expanded && (
            <div className="space-y-2 mt-3 max-h-96 overflow-y-auto pr-1">
              {reports.map((report, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2.5 rounded-md"
                  style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex flex-wrap gap-1">
                      {(report.categories || []).map((catId: number, cIdx: number) => (
                        <span
                          key={cIdx}
                          className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                          style={{ background: palette.surface, color: palette.textSecondary, fontFamily: typography.ui }}
                        >
                          {ABUSEIPDB_CATEGORIES[catId] || `Category ${catId}`}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px] shrink-0 tabular-nums" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                      {formatDate(report.reportedAt)}
                      {report.reporterCountryCode ? ` · ${report.reporterCountryCode}` : ''}
                    </span>
                  </div>
                  {report.comment && (
                    <div className="text-xs break-words" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
                      {String(report.comment).slice(0, 280)}
                      {String(report.comment).length > 280 ? '…' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ResultCard>
  );
}

/** VirusTotal stats with click-to-expand flagging engines. */
function VirusTotalCard({ virusTotalData }: { virusTotalData: any }) {
  const [expanded, setExpanded] = useState(false);
  const attributes = virusTotalData?.data?.attributes;
  const vtStats = attributes?.last_analysis_stats;
  if (!vtStats) return null;

  const analysisResults: Record<string, any> = attributes?.last_analysis_results || {};
  const flagged = Object.entries(analysisResults)
    .filter(([, r]: [string, any]) => r?.category === 'malicious' || r?.category === 'suspicious')
    .sort(([, a]: [string, any], [, b]: [string, any]) => (a.category === 'malicious' ? -1 : 1) - (b.category === 'malicious' ? -1 : 1));

  return (
    <ResultCard>
      <SectionHeader icon={<Shield className="w-4 h-4" />} title="VirusTotal" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <StatCell label="Malicious" value={vtStats.malicious || 0} tone={vtStats.malicious ? 'danger' : 'neutral'} />
        <StatCell label="Suspicious" value={vtStats.suspicious || 0} tone={vtStats.suspicious ? 'warn' : 'neutral'} />
        <StatCell label="Clean" value={vtStats.harmless || 0} tone={vtStats.harmless ? 'good' : 'neutral'} />
        <StatCell label="Undetected" value={vtStats.undetected || 0} />
      </div>
      {flagged.length > 0 && (
        <>
          <ExpandToggle
            expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            label={expanded ? 'Hide detections' : `View ${flagged.length} flagging engine${flagged.length > 1 ? 's' : ''}`}
          />
          {expanded && (
            <div className="space-y-1.5 mt-3 max-h-96 overflow-y-auto pr-1">
              {flagged.map(([engine, r]: [string, any]) => (
                <div
                  key={engine}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                  style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                >
                  <span className="text-sm font-medium truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                    {engine}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.result && r.result !== r.category && (
                      <span className="text-xs" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>
                        {r.result}
                      </span>
                    )}
                    <Pill label={r.category} tone={r.category === 'malicious' ? 'danger' : 'warn'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ResultCard>
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

function formatDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/* -------------------------------- Threats -------------------------------- */

function ThreatsSection({ spamhausData, alienVaultData, virusTotalData, proMode }: any) {
  const vtStats = virusTotalData?.data?.attributes?.last_analysis_stats;

  return (
    <div className="space-y-4">
      <SectionHeader icon={<AlertTriangle className="w-4 h-4" />} title="Threat intelligence" />

      {spamhausData?.listedIn && spamhausData.listedIn.length > 0 && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          title={`Spamhaus blocklists (${spamhausData.listedIn.length})`}
          tone="danger"
        >
          <div className="space-y-1.5 mt-2">
            {spamhausData.listedIn.slice(0, proMode ? undefined : 3).map((list: string, idx: number) => (
              <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                   style={{ background: palette.base, border: `1px solid ${palette.borderSubtle}` }}>
                <span className="text-sm font-medium" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{list}</span>
                <Pill label="Listed" tone="danger" />
              </div>
            ))}
          </div>
        </Callout>
      )}

      {proMode && alienVaultData?.pulse_info?.pulses && alienVaultData.pulse_info.pulses.length > 0 && (
        <ResultCard>
          <SectionHeader title={`AlienVault threat pulses (${alienVaultData.pulse_info.count})`} />
          <div className="space-y-2 mt-4">
            {alienVaultData.pulse_info.pulses.slice(0, 5).map((pulse: any, idx: number) => (
              <div key={idx} className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-sm font-semibold" style={{ color: palette.textPrimary }}>{pulse.name}</div>
                  <span className="text-[11px] shrink-0" style={{ color: palette.textTertiary }}>{pulse.modified_text}</span>
                </div>
                {pulse.description && (
                  <div className="text-xs mb-1.5" style={{ color: palette.textSecondary }}>{pulse.description}</div>
                )}
                {pulse.tags && pulse.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pulse.tags.slice(0, 5).map((tag: string, tagIdx: number) => (
                      <span key={tagIdx} className="px-1.5 py-0.5 rounded text-[11px]"
                            style={{ background: palette.surface, color: palette.textSecondary }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ResultCard>
      )}

      {vtStats && (
        <ResultCard>
          <SectionHeader title="VirusTotal analysis" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <StatCell label="Malicious" value={vtStats.malicious || 0} tone={vtStats.malicious ? 'danger' : 'neutral'} />
            <StatCell label="Suspicious" value={vtStats.suspicious || 0} tone={vtStats.suspicious ? 'warn' : 'neutral'} />
            <StatCell label="Clean" value={vtStats.harmless || 0} tone={vtStats.harmless ? 'good' : 'neutral'} />
            <StatCell label="Undetected" value={vtStats.undetected || 0} />
          </div>
        </ResultCard>
      )}
    </div>
  );
}

/* ------------------------------- VPN/Proxy ------------------------------- */

interface ProviderReport {
  source: string;
  detection: string;
  provider: string | null;
  tone: Tone;
}

/** Aggregate anonymity findings from every source that reports one, so the
 *  analyst sees ALL reported VPN/proxy provider names side by side (proxycheck
 *  is the most reliable, but the others often add corroborating names). */
function collectProviderReports(sources: Record<string, any>, proxyCheckEntry: any): ProviderReport[] {
  const reports: ProviderReport[] = [];
  const add = (source: string, detection: string, provider: string | null, tone: Tone = 'neutral') => {
    reports.push({ source, detection, provider, tone });
  };

  if (proxyCheckEntry) {
    const det = proxyCheckEntry.detections || {};
    const op = proxyCheckEntry.operator || {};
    const net = proxyCheckEntry.network || {};
    const detection = det.vpn ? 'VPN' : det.proxy ? 'Proxy' : det.tor ? 'Tor' : 'Clean';
    add('ProxyCheck', detection, op.name || (det.vpn || det.proxy ? net.provider : null) || null,
      detection === 'Clean' ? 'good' : 'warn');
  }

  const ip2proxy = sources.ip2proxy;
  if (ip2proxy && !ip2proxy.error && Object.keys(ip2proxy).length > 0) {
    const type = ip2proxy.proxy_type;
    const detection = type === 'VPN' ? 'VPN' : type === 'TOR' ? 'Tor' : type === 'PUB' ? 'Public proxy'
      : type === 'DCH' ? 'Datacenter' : ip2proxy.is_proxy ? (type || 'Proxy') : 'Clean';
    add('IP2Proxy', detection, ip2proxy.provider || (ip2proxy.is_proxy ? ip2proxy.isp : null) || null,
      detection === 'Clean' ? 'good' : detection === 'Datacenter' ? 'neutral' : 'warn');
  }

  const ipqs = sources.ipqualityscore;
  if (ipqs && !ipqs.error && Object.keys(ipqs).length > 0) {
    const detection = ipqs.vpn || ipqs.active_vpn ? 'VPN' : ipqs.tor || ipqs.active_tor ? 'Tor' : ipqs.proxy ? 'Proxy' : 'Clean';
    add('IPQualityScore', detection, detection !== 'Clean' ? (ipqs.organization || ipqs.ISP || null) : null,
      detection === 'Clean' ? 'good' : 'warn');
  }

  const vpnapi = sources.vpnapi;
  if (vpnapi && !vpnapi.error && vpnapi.security) {
    const sec = vpnapi.security;
    const detection = sec.vpn ? 'VPN' : sec.tor ? 'Tor' : sec.proxy ? 'Proxy' : sec.relay ? 'Relay' : 'Clean';
    add('VPNAPI.io', detection,
      detection !== 'Clean' ? (vpnapi.network?.autonomous_system_organization || null) : null,
      detection === 'Clean' ? 'good' : 'warn');
  }

  const iphub = sources.iphub;
  if (iphub && !iphub.error && iphub.block != null) {
    const detection = iphub.block === 1 ? 'Proxy/VPN/Hosting' : iphub.block === 2 ? 'Possible proxy' : 'Clean';
    add('IPHub', detection, iphub.block > 0 ? (iphub.isp || null) : null,
      iphub.block === 1 ? 'warn' : iphub.block === 2 ? 'neutral' : 'good');
  }

  const vpnDb = sources.vpn_provider;
  if (vpnDb && vpnDb.provider) {
    add('ThamOS VPN DB', 'Known VPN ASN/org', vpnDb.provider, 'warn');
  }

  return reports;
}

function VPNSection({ enrichment, sources, proxyCheckEntry }: {
  enrichment: any;
  sources: Record<string, any>;
  proxyCheckEntry: any;
}) {
  const providerReports = collectProviderReports(sources, proxyCheckEntry);
  const namedProviders = [...new Set(providerReports.map(r => r.provider).filter(Boolean))] as string[];
  const operator = proxyCheckEntry?.operator;

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Wifi className="w-4 h-4" />} title="VPN / proxy analysis" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="VPN status"
          value={enrichment.isVPN ? 'VPN detected' : 'No VPN'}
          tone={enrichment.isVPN ? 'warn' : 'neutral'}
          highlight={!!enrichment.isVPN}
        />
        <MetricCard
          label="Proxy status"
          value={enrichment.isProxy ? 'Proxy detected' : 'No proxy'}
          tone={enrichment.isProxy ? 'warn' : 'neutral'}
          highlight={!!enrichment.isProxy}
        />
        <MetricCard
          label="Tor"
          value={enrichment.isTor ? 'Tor exit node' : 'Not Tor'}
          tone={enrichment.isTor ? 'danger' : 'neutral'}
          highlight={!!enrichment.isTor}
        />
        <MetricCard
          label="Reported providers"
          value={namedProviders.length > 0 ? namedProviders.join(', ') : 'None named'}
          detail={enrichment.confidence != null ? `${enrichment.confidence}% confidence` : undefined}
          tone={namedProviders.length > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {providerReports.length > 0 && (
        <ResultCard>
          <SectionHeader title="Per-source detections" />
          <div className="space-y-1.5 mt-4">
            {providerReports.map((report, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
              >
                <span className="text-sm font-medium w-36 shrink-0" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                  {report.source}
                </span>
                <span className="text-sm flex-1 min-w-0 truncate" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
                  {report.provider || '—'}
                </span>
                <Pill label={report.detection} tone={report.tone} />
              </div>
            ))}
          </div>
        </ResultCard>
      )}

      {operator && (operator.name || operator.url) && (
        <ResultCard>
          <SectionHeader title={`Operator${operator.name ? ` — ${operator.name}` : ''} (ProxyCheck)`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {operator.anonymity && (
              <div>
                <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>Anonymity level</div>
                <div className="text-sm font-medium capitalize" style={{ color: palette.textPrimary }}>
                  {operator.anonymity}
                </div>
              </div>
            )}
            {operator.popularity && (
              <div>
                <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>Popularity</div>
                <div className="text-sm font-medium capitalize" style={{ color: palette.textPrimary }}>
                  {operator.popularity}
                </div>
              </div>
            )}
          </div>

          {operator.url && (
            <div className="mt-4">
              <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>Website</div>
              <a
                href={operator.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm hover:underline"
                style={{ color: palette.accent }}
              >
                {operator.url}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {operator.protocols && Array.isArray(operator.protocols) && operator.protocols.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] mb-2" style={{ color: palette.textTertiary }}>Protocols</div>
              <div className="flex flex-wrap gap-1.5">
                {operator.protocols.map((protocol: string, idx: number) => (
                  <span key={idx} className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: palette.surface, color: palette.textSecondary, fontFamily: typography.mono }}>
                    {protocol}
                  </span>
                ))}
              </div>
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}

/* -------------------------------- Sources -------------------------------- */

function SourcesSection({ sources }: { sources: Record<string, any> }) {
  // Open everything by default — analysts close what they don't need.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(Object.keys(sources)));
  const sourceKeys = Object.keys(sources);

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
      <SectionHeader icon={<Database className="w-4 h-4" />} title={`Individual sources (${sourceKeys.length})`} />

      <div className="space-y-2">
        {sourceKeys.map((sourceKey) => {
          const sourceData = sources[sourceKey];
          const hasError = !!sourceData?.error;
          const isExpanded = expandedKeys.has(sourceKey);
          return (
            <div key={sourceKey} className="rounded-lg overflow-hidden" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
              <button
                onClick={() => toggle(sourceKey)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:brightness-110"
                style={{ background: 'transparent' }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                    : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />}
                  <span className="text-sm font-semibold truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                    {sourceKey}
                  </span>
                </span>
                <Pill label={hasError ? 'Error' : 'OK'} tone={hasError ? 'danger' : 'good'} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4">
                  {hasError && (
                    <div className="text-xs mb-2" style={{ color: palette.rose, fontFamily: typography.ui }}>{sourceData.error}</div>
                  )}
                  <pre
                    className="text-xs overflow-auto max-h-72 rounded-md p-3"
                    style={{ background: palette.void, color: palette.textSecondary, fontFamily: typography.mono }}
                  >
                    {JSON.stringify(sourceData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
