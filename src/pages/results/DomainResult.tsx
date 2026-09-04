import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, Shield, Database, Server, Target, GitBranch, Scale, Globe, FileJson,
  Camera, ChevronDown, ChevronRight, Lock, Copy, Check, ArrowRight, Network,
} from 'lucide-react';
import { useTheme } from '../../contexts/themecontext';
import { lookupDomain } from '../../lib/threatIntel';
import type { DomainLookupResult, CalibratedScoring, ScoreContribution } from '../../types';
import { RelatedIOCs } from '../../components/RelatedIOCs';
import VerdictPanel from '../../components/scanner/VerdictPanel';
import VerdictStrip from '../../components/scanner/VerdictStrip';
import { palette, typography } from '../../design-system/tokens';
import {
  ResultShell, ResultLoading, ResultError, ResultEmpty,
  StatCell, Pill, SectionHeader, Callout, ResultCard, SummaryActions,
  type ShellMenuItem, type Tone,
} from '../../components/results';

interface DomainResultProps {
  domain: string;
  onScan?: (type: string, value: string) => void;
}

type MenuItem = 'overview' | 'verdict' | 'whois' | 'dns' | 'security' | 'pivot' | 'sources' | 'raw';

/** Passive-DNS record as aggregated by the backend (`aggregatePDNS`). */
interface PDNSRecord {
  rrtype: string;
  rrname: string;
  rdata: string;
  first_seen: string | null;
  last_seen: string | null;
  count: number | null;
  source: string;
}

interface TrancoData {
  domain?: string;
  rank?: number | null;
  in_top_1m?: boolean;
  source?: string;
}

/** The `/domain` edge route returns more than `DomainLookupResult` declares. */
type DomainResultData = DomainLookupResult & {
  tranco?: TrancoData | null;
  vtResolutions?: any;
  pdns?: PDNSRecord[];
  certSubdomains?: string[];
};

type SourceEntry = { found: boolean; malicious: boolean; details: any; error?: string; threatScore?: number };

const VERDICT_META: Record<CalibratedScoring['verdict'], { label: string; tone: Tone }> = {
  malicious: { label: 'Malicious', tone: 'danger' },
  suspicious: { label: 'Suspicious', tone: 'warn' },
  low_signal: { label: 'Low signal', tone: 'neutral' },
  no_signal: { label: 'No signal', tone: 'good' },
};

const YOUNG_DOMAIN_DAYS = 90;

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-f:]+$/i;
function isIPAddress(value: string): boolean {
  if (!value) return false;
  if (IPV4_RE.test(value)) return true;
  return value.includes(':') && IPV6_RE.test(value);
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatAge(days?: number | null): { value: string; detail?: string } {
  if (days == null) return { value: 'Unknown' };
  const years = Math.floor(days / 365);
  const rem = days % 365;
  return {
    value: years > 0 ? `${years}y ${rem}d` : `${days}d`,
    detail: `${days.toLocaleString()} days`,
  };
}

export default function DomainResult({ domain, onScan }: DomainResultProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DomainResultData | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [proMode, setProMode] = useState(true);
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
        const data = await lookupDomain(domain);
        setResult(data as DomainResultData);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup domain');
      } finally {
        setLoading(false);
      }
    };
    performLookup();
  }, [domain]);

  if (loading && !result) {
    return <div ref={containerRef} className="h-full"><ResultLoading message={`Analyzing ${domain}…`} /></div>;
  }

  if (error) {
    return <div ref={containerRef} className="h-full"><ResultError message={error} /></div>;
  }

  if (!result) {
    return <div ref={containerRef} className="h-full"><ResultEmpty message={`No result data available for ${domain}.`} /></div>;
  }

  const sources: Record<string, SourceEntry> = result.sources || {};
  const whois = result.whois || null;
  const vtAttrs = sources.virustotal?.details?.data?.attributes as any;
  const vtStats = vtAttrs?.last_analysis_stats;
  // The /domain route registers URLhaus under `urlhaus_url` (URL endpoint); keep the host key as a fallback.
  const urlhaus = sources.urlhaus_url?.details ?? sources.urlhaus?.details;
  const urlhausHit = urlhaus?.query_status === 'ok';
  const otx = sources.alienvault?.details;
  const otxPulseCount: number = otx?.pulse_info?.count ?? 0;
  const tranco: TrancoData | null = result.tranco ?? (sources.tranco?.details as TrancoData | undefined) ?? null;
  const pdns: PDNSRecord[] = Array.isArray(result.pdns) ? result.pdns : [];
  // Backend `vtResolutions` reads `.data` off the normalised source (which has `.details`), so it is
  // always null today — fall back to the raw source payload so the resolutions still render.
  const vtResolutions: any[] = result.vtResolutions?.data
    ?? sources.virustotal_resolutions?.details?.data
    ?? [];
  const crtsh = sources.crtsh?.details;
  const certSubdomains: string[] = Array.isArray(result.certSubdomains)
    ? result.certSubdomains
    : (crtsh?.subdomains ?? []);
  const categories: Record<string, string> | null = result.categories ?? vtAttrs?.categories ?? null;
  const reputation: number | null = result.reputation ?? vtAttrs?.reputation ?? null;

  const menuItems: ShellMenuItem<MenuItem>[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'verdict', label: 'Verdict', icon: Scale },
    { id: 'whois', label: 'WHOIS', icon: Globe },
    { id: 'dns', label: 'DNS', icon: Server },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'pivot', label: 'Pivot Graph', icon: GitBranch },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'raw', label: 'Raw JSON', icon: FileJson },
  ];

  const scoring = result.scoring;
  const verdictMeta = scoring
    ? VERDICT_META[scoring.verdict]
    : { label: result.isMalicious ? 'Malicious' : 'Clean', tone: (result.isMalicious ? 'danger' : 'good') as Tone };
  const headlineScore = scoring ? scoring.calibrated : result.overallThreatScore;

  const getSummary = () => {
    const age = formatAge(whois?.domainAge);
    const lines = [
      `Domain: ${domain}`,
      `Verdict: ${verdictMeta.label} (score ${headlineScore})`,
      `Registrar: ${whois?.registrar || 'Unknown'}`,
      `Registered: ${whois?.registrationDate ? formatDate(whois.registrationDate) : 'Unknown'} (age ${age.value})`,
      `Expires: ${whois?.expirationDate ? formatDate(whois.expirationDate) : 'Unknown'}`,
    ];
    if (vtStats) lines.push(`VirusTotal: ${vtStats.malicious || 0} malicious / ${vtStats.suspicious || 0} suspicious / ${vtStats.harmless || 0} clean`);
    if (tranco) lines.push(`Tranco rank: ${tranco.rank != null ? `#${tranco.rank}` : 'not in top 1M'}`);
    if (urlhausHit) lines.push('URLhaus: listed');
    if (otxPulseCount > 0) lines.push(`AlienVault OTX: ${otxPulseCount} pulse(s)`);
    if (scoring?.legacy != null && scoring.legacy !== scoring.calibrated) lines.push(`Legacy score: ${scoring.legacy}`);
    return lines.join('\n');
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      {onScan && (
        <button
          onClick={() => onScan('url', `https://${domain}/`)}
          title={`Submit https://${domain}/ to the URL scanner for urlscan.io detonation`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:brightness-125"
          style={{
            background: palette.float,
            border: `1px solid ${palette.borderDefault}`,
            color: palette.textSecondary,
            fontFamily: typography.ui,
          }}
        >
          <Camera className="w-3.5 h-3.5" />
          Detonate root
        </button>
      )}
      <SummaryActions getSummary={getSummary} getJson={() => result} />
    </div>
  );

  return (
    <div ref={containerRef} className="h-full">
      <ResultShell<MenuItem>
        value={domain}
        typeLabel="Domain intelligence"
        verdict={verdictMeta}
        score={headlineScore}
        menuItems={menuItems}
        activeMenu={activeMenu}
        onMenuChange={setActiveMenu}
        variant={theme === 'desktop' ? 'tabs' : 'sidebar'}
        proMode={proMode}
        onToggleProMode={() => setProMode(!proMode)}
        headerActions={headerActions}
      >
        {activeMenu === 'overview' && (
          <OverviewSection
            whois={whois}
            scoring={scoring}
            vtAttrs={vtAttrs}
            tranco={tranco}
            categories={categories}
            reputation={reputation}
            urlhaus={urlhaus}
            urlhausHit={urlhausHit}
            otxPulseCount={otxPulseCount}
            proMode={proMode}
            onOpenVerdict={() => setActiveMenu('verdict')}
          />
        )}

        {activeMenu === 'verdict' && (
          <VerdictPanel lookupType="domain" value={domain} scoring={result.scoring} />
        )}

        {activeMenu === 'whois' && <WhoisSection whois={whois} proMode={proMode} />}

        {activeMenu === 'dns' && (
          <DNSSection vtAttrs={vtAttrs} pdns={pdns} vtResolutions={vtResolutions} proMode={proMode} onScan={onScan} />
        )}

        {activeMenu === 'security' && (
          <SecuritySection
            vtAttrs={vtAttrs}
            categories={categories}
            reputation={reputation}
            urlhaus={urlhaus}
            urlhausHit={urlhausHit}
            otx={otx}
            crtsh={crtsh}
            certSubdomains={certSubdomains}
            proMode={proMode}
            onScan={onScan}
          />
        )}

        {activeMenu === 'pivot' && (
          <div className="space-y-4">
            <SectionHeader icon={<GitBranch className="w-4 h-4" />} title="IOC pivot graph" />
            <RelatedIOCs iocType="domain" iocValue={domain} onScan={onScan} />
          </div>
        )}

        {activeMenu === 'sources' && (
          <SourcesSection sources={sources} proMode={proMode} checkedAt={result.checkedAt} tier={result.tier} />
        )}

        {activeMenu === 'raw' && <RawJsonSection data={result} />}
      </ResultShell>
    </div>
  );
}

/* ------------------------------- Overview -------------------------------- */

function OverviewSection({ whois, scoring, vtAttrs, tranco, categories, reputation, urlhaus, urlhausHit, otxPulseCount, proMode, onOpenVerdict }: {
  whois: DomainLookupResult['whois'];
  scoring?: CalibratedScoring;
  vtAttrs: any;
  tranco: TrancoData | null;
  categories: Record<string, string> | null;
  reputation: number | null;
  urlhaus: any;
  urlhausHit: boolean;
  otxPulseCount: number;
  proMode: boolean;
  onOpenVerdict: () => void;
}) {
  const vtStats = vtAttrs?.last_analysis_stats;
  const ageDays = whois?.domainAge;
  const isYoung = ageDays != null && ageDays < YOUNG_DOMAIN_DAYS;
  const vtMalicious: number = vtStats?.malicious || 0;

  return (
    <div className="space-y-4">
      {/* Real findings only — no callout when nothing fired */}
      {isYoung && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="warn"
          title={`Young domain — registered ${ageDays} day${ageDays === 1 ? '' : 's'} ago`}
          detail={`Domains under ${YOUNG_DOMAIN_DAYS} days old are disproportionately used for phishing and short-lived campaigns. Registered ${formatDate(whois?.registrationDate)}.`}
        />
      )}
      {vtMalicious > 0 && (
        <Callout
          icon={<Shield className="w-4 h-4" />}
          tone="danger"
          title={`VirusTotal: ${vtMalicious} engine${vtMalicious === 1 ? '' : 's'} flag this domain as malicious`}
          detail={`${vtStats.suspicious || 0} suspicious · ${vtStats.harmless || 0} clean · ${vtStats.undetected || 0} undetected. Flagging engines are listed under Security.`}
        />
      )}
      {urlhausHit && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="danger"
          title="URLhaus lists this host as a malware distribution site"
          detail={[urlhaus?.threat, urlhaus?.url_status ? `status ${urlhaus.url_status}` : null, urlhaus?.date_added ? `added ${formatDate(urlhaus.date_added)}` : null]
            .filter(Boolean).join(' · ') || 'Details under Security.'}
        />
      )}
      {otxPulseCount > 0 && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="warn"
          title={`AlienVault OTX: ${otxPulseCount} threat pulse${otxPulseCount === 1 ? '' : 's'} reference this domain`}
          detail="Community-reported indicator. Pulse names and tags are listed under Security."
        />
      )}

      <VerdictStrip scoring={scoring} />

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <ContextCard whois={whois} tranco={tranco} categories={categories} reputation={reputation} proMode={proMode} />
        </div>
        <div className="space-y-4 min-w-0">
          <VirusTotalCard vtAttrs={vtAttrs} />
          <ScoreDriversCard scoring={scoring} onOpenVerdict={onOpenVerdict} />
        </div>
      </div>
    </div>
  );
}

function ContextCard({ whois, tranco, categories, reputation, proMode }: {
  whois: DomainLookupResult['whois'];
  tranco: TrancoData | null;
  categories: Record<string, string> | null;
  reputation: number | null;
  proMode: boolean;
}) {
  const age = formatAge(whois?.domainAge);
  const isYoung = whois?.domainAge != null && whois.domainAge < YOUNG_DOMAIN_DAYS;
  const nameservers = whois?.nameservers || [];
  const status = whois?.status || [];
  const categoryEntries = categories ? Object.entries(categories) : [];
  const reputationTone: Tone = reputation == null ? 'neutral' : reputation < 0 ? 'danger' : reputation > 0 ? 'good' : 'neutral';

  return (
    <ResultCard>
      <SectionHeader icon={<Globe className="w-4 h-4" />} title="Context" />
      <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
        <ContextField label="Registrar" value={whois?.registrar || 'Unknown'} />
        <ContextField
          label="Registered"
          value={whois?.registrationDate ? formatDate(whois.registrationDate) : 'Unknown'}
        />
        <ContextField label="Age" value={age.value} detail={age.detail} tone={isYoung ? 'warn' : 'neutral'} />
        <ContextField label="Expires" value={whois?.expirationDate ? formatDate(whois.expirationDate) : 'Unknown'} />
        <ContextField label="Last changed" value={whois?.lastChanged ? formatDate(whois.lastChanged) : 'Unknown'} />
        {tranco && (
          <ContextField
            label="Tranco rank"
            value={tranco.rank != null ? `#${tranco.rank.toLocaleString()}` : 'Not in top 1M'}
            detail={tranco.rank != null ? 'Widely-used domain — compromise possible, but the bar is higher' : undefined}
            mono={tranco.rank != null}
          />
        )}
        {reputation != null && (
          <ContextField
            label="VirusTotal reputation"
            value={reputation > 0 ? `+${reputation}` : String(reputation)}
            detail="Community votes; negative = leaning malicious"
            tone={reputationTone}
          />
        )}
      </div>

      <div className="mt-4">
        <div className="text-[11px] font-medium mb-1.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
          Nameservers
        </div>
        {nameservers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {nameservers.map((ns, idx) => <MonoChip key={idx} value={ns.toLowerCase()} />)}
          </div>
        ) : (
          <div className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>Unknown</div>
        )}
      </div>

      {status.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-medium mb-1.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
            Status
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(proMode ? status : status.slice(0, 3)).map((s, idx) => <TextChip key={idx} label={s} />)}
            {!proMode && status.length > 3 && <TextChip label={`+${status.length - 3} more`} />}
          </div>
        </div>
      )}

      {categoryEntries.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-medium mb-1.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
            Categories (VirusTotal vendors)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categoryEntries.map(([vendor, category]) => (
              <TextChip key={vendor} label={category} title={vendor} />
            ))}
          </div>
        </div>
      )}
    </ResultCard>
  );
}

function ContextField({ label, value, detail, tone = 'neutral', mono = false }: {
  label: string; value: ReactNode; detail?: string; tone?: Tone; mono?: boolean;
}) {
  const valueColor = tone === 'danger' ? palette.rose : tone === 'warn' ? palette.amber : tone === 'good' ? palette.green : palette.textPrimary;
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

/** Neutral text chip (status flags, categories, tags). */
function TextChip({ label, title }: { label: string; title?: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-[11px] font-medium"
      title={title}
      style={{ background: palette.surface, color: palette.textSecondary, fontFamily: typography.ui }}
    >
      {label}
    </span>
  );
}

/** Mono chip for IOC-ish values (nameservers, subdomains, IPs). Becomes a pivot button when onPivot is given. */
function MonoChip({ value, onPivot, pivotLabel }: { value: string; onPivot?: () => void; pivotLabel?: string }) {
  if (onPivot) {
    return (
      <button
        onClick={onPivot}
        title={pivotLabel}
        className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors hover:brightness-125 break-all text-left"
        style={{
          background: palette.surface,
          color: palette.accent,
          border: `1px solid ${palette.borderSubtle}`,
          fontFamily: typography.mono,
        }}
      >
        {value}
      </button>
    );
  }
  return (
    <span
      className="px-2 py-0.5 rounded text-[11px] font-medium break-all"
      style={{ background: palette.surface, color: palette.textPrimary, fontFamily: typography.mono }}
    >
      {value}
    </span>
  );
}

/** Inline IP value: pivot button when onScan is available, plain mono text otherwise. */
function IPValue({ ip, onScan }: { ip: string; onScan?: (type: string, value: string) => void }) {
  if (onScan && isIPAddress(ip)) {
    return (
      <button
        onClick={() => onScan('ip', ip)}
        title={`Open IP reputation for ${ip}`}
        className="text-sm font-medium hover:underline break-all text-left"
        style={{ color: palette.accent, fontFamily: typography.mono }}
      >
        {ip}
      </button>
    );
  }
  return (
    <span className="text-sm font-medium break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>
      {ip}
    </span>
  );
}

/** "Why this score" — top calibrated contributions with a jump to the full breakdown. */
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

/** VirusTotal stats with click-to-expand flagging engines. */
function VirusTotalCard({ vtAttrs }: { vtAttrs: any }) {
  const [expanded, setExpanded] = useState(false);
  const vtStats = vtAttrs?.last_analysis_stats;
  if (!vtStats) return null;

  const analysisResults: Record<string, any> = vtAttrs?.last_analysis_results || {};
  const flagged = Object.entries(analysisResults)
    .filter(([, r]: [string, any]) => r?.category === 'malicious' || r?.category === 'suspicious')
    .sort(([, a]: [string, any], [, b]: [string, any]) => (a.category === 'malicious' ? -1 : 1) - (b.category === 'malicious' ? -1 : 1));

  return (
    <ResultCard>
      <SectionHeader icon={<Shield className="w-4 h-4" />} title="VirusTotal" />
      <div className="grid grid-cols-2 @xl:grid-cols-4 gap-3 mt-4">
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

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
      {children}
    </div>
  );
}

/* --------------------------------- WHOIS --------------------------------- */

function WhoisSection({ whois, proMode }: { whois: DomainLookupResult['whois']; proMode: boolean }) {
  const age = formatAge(whois?.domainAge);
  const nameservers = whois?.nameservers || [];
  const status = whois?.status || [];

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Globe className="w-4 h-4" />} title="WHOIS / RDAP registration" />

      {!whois && <ResultCard><EmptyNote>No RDAP registration data was returned for this domain.</EmptyNote></ResultCard>}

      {whois && (
        <>
          <ResultCard>
            <div className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-3 gap-x-5 gap-y-3.5">
              <ContextField label="Domain" value={whois.domain || 'Unknown'} mono />
              <ContextField label="Registrar" value={whois.registrar || 'Unknown'} />
              <ContextField
                label="Domain age"
                value={age.value}
                detail={age.detail}
                tone={whois.domainAge != null && whois.domainAge < YOUNG_DOMAIN_DAYS ? 'warn' : 'neutral'}
              />
              <ContextField label="Registration date" value={whois.registrationDate ? formatDate(whois.registrationDate) : 'Unknown'} detail={whois.registrationDate || undefined} />
              <ContextField label="Expiration date" value={whois.expirationDate ? formatDate(whois.expirationDate) : 'Unknown'} detail={whois.expirationDate || undefined} />
              <ContextField label="Last changed" value={whois.lastChanged ? formatDate(whois.lastChanged) : 'Unknown'} detail={whois.lastChanged || undefined} />
            </div>
          </ResultCard>

          <ResultCard>
            <SectionHeader icon={<Server className="w-4 h-4" />} title={`Nameservers (${nameservers.length})`} />
            {nameservers.length > 0 ? (
              <div className="grid grid-cols-1 @xl:grid-cols-2 gap-1.5 mt-4">
                {nameservers.map((ns, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 rounded-md text-sm break-all"
                    style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}`, color: palette.textPrimary, fontFamily: typography.mono }}
                  >
                    {ns.toLowerCase()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4"><EmptyNote>No nameservers listed in RDAP.</EmptyNote></div>
            )}
          </ResultCard>

          {proMode && status.length > 0 && (
            <ResultCard>
              <SectionHeader title={`EPP status flags (${status.length})`} />
              <div className="flex flex-wrap gap-1.5 mt-4">
                {status.map((s, idx) => <TextChip key={idx} label={s} />)}
              </div>
            </ResultCard>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------- DNS ---------------------------------- */

const DNS_TYPE_ORDER = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA', 'SRV'];

function DNSSection({ vtAttrs, pdns, vtResolutions, proMode, onScan }: {
  vtAttrs: any;
  pdns: PDNSRecord[];
  vtResolutions: any[];
  proMode: boolean;
  onScan?: (type: string, value: string) => void;
}) {
  const dnsRecords: any[] = Array.isArray(vtAttrs?.last_dns_records) ? vtAttrs.last_dns_records : [];
  const presentTypes = [...new Set(dnsRecords.map(r => String(r.type || '').toUpperCase()).filter(Boolean))];
  const orderedTypes = [
    ...DNS_TYPE_ORDER.filter(t => presentTypes.includes(t)),
    ...presentTypes.filter(t => !DNS_TYPE_ORDER.includes(t)).sort(),
  ];
  const pdnsShown = proMode ? pdns : pdns.slice(0, 10);
  const nothing = dnsRecords.length === 0 && pdns.length === 0 && vtResolutions.length === 0;

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Server className="w-4 h-4" />} title="DNS" />

      {nothing && <ResultCard><EmptyNote>No DNS records, passive DNS or resolution history were returned by any configured source.</EmptyNote></ResultCard>}

      {dnsRecords.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Current records — VirusTotal (${dnsRecords.length})`} />
          <div className="space-y-4 mt-4">
            {orderedTypes.map(type => {
              const records = dnsRecords.filter(r => String(r.type || '').toUpperCase() === type);
              const shown = proMode ? records : records.slice(0, 3);
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="px-1.5 py-0.5 rounded text-[11px] font-semibold"
                      style={{ background: palette.surface, color: palette.textSecondary, fontFamily: typography.mono }}
                    >
                      {type}
                    </span>
                    <span className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                      {records.length} record{records.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {shown.map((record, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                        style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                      >
                        <IPValue ip={String(record.value ?? '')} onScan={onScan} />
                        <span className="text-[11px] shrink-0 tabular-nums" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                          {record.priority != null ? `priority ${record.priority}` : ''}
                          {record.priority != null && record.ttl != null ? ' · ' : ''}
                          {record.ttl != null ? `TTL ${record.ttl}` : ''}
                        </span>
                      </div>
                    ))}
                    {!proMode && records.length > shown.length && (
                      <div className="text-[11px] px-1" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                        +{records.length - shown.length} more in Pro mode
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ResultCard>
      )}

      {pdns.length > 0 && (
        <ResultCard>
          <SectionHeader icon={<Network className="w-4 h-4" />} title={`Passive DNS (${pdns.length})`} />
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left" style={{ fontFamily: typography.ui }}>
              <thead>
                <tr className="text-[11px]" style={{ color: palette.textTertiary }}>
                  <th className="font-medium pb-2 pr-3">Type</th>
                  <th className="font-medium pb-2 pr-3">Name</th>
                  <th className="font-medium pb-2 pr-3">Data</th>
                  <th className="font-medium pb-2 pr-3 whitespace-nowrap">First seen</th>
                  <th className="font-medium pb-2 pr-3 whitespace-nowrap">Last seen</th>
                  <th className="font-medium pb-2 pr-3">Count</th>
                  <th className="font-medium pb-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {pdnsShown.map((r, idx) => (
                  <tr key={idx} style={{ borderTop: `1px solid ${palette.borderSubtle}` }}>
                    <td className="py-1.5 pr-3 text-xs" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>{r.rrtype}</td>
                    <td className="py-1.5 pr-3 text-xs break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>
                      {onScan && !isIPAddress(r.rrname) ? (
                        <button
                          onClick={() => onScan('domain', r.rrname.toLowerCase())}
                          title={`Open domain intelligence for ${r.rrname}`}
                          className="hover:underline text-left break-all"
                          style={{ color: palette.accent, fontFamily: typography.mono }}
                        >
                          {r.rrname}
                        </button>
                      ) : r.rrname}
                    </td>
                    <td className="py-1.5 pr-3 text-xs break-all">
                      {isIPAddress(r.rdata)
                        ? <IPValue ip={r.rdata} onScan={onScan} />
                        : <span style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{r.rdata}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-xs whitespace-nowrap tabular-nums" style={{ color: palette.textSecondary }}>{formatDate(r.first_seen) || '—'}</td>
                    <td className="py-1.5 pr-3 text-xs whitespace-nowrap tabular-nums" style={{ color: palette.textSecondary }}>{formatDate(r.last_seen) || '—'}</td>
                    <td className="py-1.5 pr-3 text-xs tabular-nums" style={{ color: palette.textSecondary }}>{r.count != null ? r.count.toLocaleString() : '—'}</td>
                    <td className="py-1.5 text-xs whitespace-nowrap" style={{ color: palette.textSecondary }}>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!proMode && pdns.length > pdnsShown.length && (
            <div className="text-[11px] mt-2" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
              +{pdns.length - pdnsShown.length} more in Pro mode
            </div>
          )}
        </ResultCard>
      )}

      {vtResolutions.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Resolution history — VirusTotal (${vtResolutions.length})`} />
          <div className="space-y-1 mt-4">
            {vtResolutions.map((item: any, idx: number) => {
              const attrs = item?.attributes ?? {};
              const ip = String(attrs.ip_address ?? '');
              const date = attrs.date ? new Date(attrs.date * 1000).toISOString() : null;
              return (
                <div
                  key={item?.id ?? idx}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                  style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                >
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    {ip ? <IPValue ip={ip} onScan={onScan} /> : <span className="text-sm" style={{ color: palette.textTertiary }}>—</span>}
                    {attrs.host_name && (
                      <span className="text-xs break-all" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>
                        {attrs.host_name}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] shrink-0 tabular-nums" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                    {formatDate(date) || ''}
                  </span>
                </div>
              );
            })}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

/* -------------------------------- Security ------------------------------- */

function SecuritySection({ vtAttrs, categories, reputation, urlhaus, urlhausHit, otx, crtsh, certSubdomains, proMode, onScan }: {
  vtAttrs: any;
  categories: Record<string, string> | null;
  reputation: number | null;
  urlhaus: any;
  urlhausHit: boolean;
  otx: any;
  crtsh: any;
  certSubdomains: string[];
  proMode: boolean;
  onScan?: (type: string, value: string) => void;
}) {
  const [subsExpanded, setSubsExpanded] = useState(false);
  const vtStats = vtAttrs?.last_analysis_stats;
  const cert = vtAttrs?.last_https_certificate;
  const popularity: Record<string, any> = vtAttrs?.popularity_ranks || {};
  const popularityEntries = Object.entries(popularity);
  const votes = vtAttrs?.total_votes;
  const tags: string[] = Array.isArray(vtAttrs?.tags) ? vtAttrs.tags : [];
  const categoryEntries = categories ? Object.entries(categories) : [];
  const pulses: any[] = Array.isArray(otx?.pulse_info?.pulses) ? otx.pulse_info.pulses : [];
  const sans: string[] = Array.isArray(cert?.extensions?.subject_alternative_name) ? cert.extensions.subject_alternative_name : [];
  const recentCerts: any[] = Array.isArray(crtsh?.recent_certs) ? crtsh.recent_certs : [];
  const subsShown = subsExpanded || proMode ? certSubdomains : certSubdomains.slice(0, 24);

  const hasAnything = vtStats || categoryEntries.length > 0 || popularityEntries.length > 0 || reputation != null || cert
    || urlhausHit || pulses.length > 0 || certSubdomains.length > 0 || recentCerts.length > 0;

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Shield className="w-4 h-4" />} title="Security analysis" />

      {!hasAnything && <ResultCard><EmptyNote>No security findings were returned by the configured sources.</EmptyNote></ResultCard>}

      {vtStats && (
        <ResultCard>
          <SectionHeader title="VirusTotal analysis" />
          <div className="grid grid-cols-2 @xl:grid-cols-4 gap-3 mt-4">
            <StatCell label="Malicious" value={vtStats.malicious || 0} tone={vtStats.malicious ? 'danger' : 'neutral'} />
            <StatCell label="Suspicious" value={vtStats.suspicious || 0} tone={vtStats.suspicious ? 'warn' : 'neutral'} />
            <StatCell label="Clean" value={vtStats.harmless || 0} tone={vtStats.harmless ? 'good' : 'neutral'} />
            <StatCell label="Undetected" value={vtStats.undetected || 0} />
          </div>
          {(reputation != null || votes || tags.length > 0 || (proMode && vtAttrs?.jarm)) && (
            <div className="grid grid-cols-2 @xl:grid-cols-3 gap-x-5 gap-y-3.5 mt-4">
              {reputation != null && (
                <ContextField
                  label="Community reputation"
                  value={reputation > 0 ? `+${reputation}` : String(reputation)}
                  tone={reputation < 0 ? 'danger' : reputation > 0 ? 'good' : 'neutral'}
                />
              )}
              {votes && (
                <ContextField
                  label="Community votes"
                  value={`${votes.harmless ?? 0} harmless · ${votes.malicious ?? 0} malicious`}
                  tone={(votes.malicious ?? 0) > (votes.harmless ?? 0) ? 'warn' : 'neutral'}
                />
              )}
              {vtAttrs?.last_analysis_date && (
                <ContextField label="Last analysed" value={formatDate(new Date(vtAttrs.last_analysis_date * 1000).toISOString())} />
              )}
              {proMode && vtAttrs?.jarm && <ContextField label="JARM" value={vtAttrs.jarm} mono />}
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {tags.map((t, idx) => <TextChip key={idx} label={t} />)}
            </div>
          )}
        </ResultCard>
      )}

      {urlhausHit && (
        <Callout icon={<AlertTriangle className="w-4 h-4" />} tone="danger" title="URLhaus — malware distribution listing">
          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-5 gap-y-3 mt-3">
            {urlhaus?.url && <ContextField label="Listed URL" value={urlhaus.url} mono />}
            {urlhaus?.url_status && <ContextField label="Status" value={urlhaus.url_status} tone={urlhaus.url_status === 'online' ? 'danger' : 'neutral'} />}
            {urlhaus?.threat && <ContextField label="Threat" value={urlhaus.threat} />}
            {urlhaus?.date_added && <ContextField label="Added" value={formatDate(urlhaus.date_added)} />}
            {urlhaus?.host && <ContextField label="Host" value={urlhaus.host} mono />}
          </div>
          {Array.isArray(urlhaus?.tags) && urlhaus.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {urlhaus.tags.map((t: string, idx: number) => <TextChip key={idx} label={t} />)}
            </div>
          )}
          {urlhaus?.urlhaus_reference && (
            <a
              href={urlhaus.urlhaus_reference}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-xs hover:underline"
              style={{ color: palette.accent, fontFamily: typography.ui }}
            >
              View on URLhaus
            </a>
          )}
        </Callout>
      )}

      {pulses.length > 0 && (
        <ResultCard>
          <SectionHeader title={`AlienVault OTX threat pulses (${otx?.pulse_info?.count ?? pulses.length})`} />
          <div className="space-y-2 mt-4">
            {pulses.slice(0, proMode ? 10 : 3).map((pulse: any, idx: number) => (
              <div key={pulse.id ?? idx} className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-sm font-semibold" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>{pulse.name}</div>
                  <span className="text-[11px] shrink-0" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                    {pulse.modified_text || formatDate(pulse.modified)}
                  </span>
                </div>
                {pulse.description && (
                  <div className="text-xs mb-1.5" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
                    {String(pulse.description).slice(0, 280)}{String(pulse.description).length > 280 ? '…' : ''}
                  </div>
                )}
                {Array.isArray(pulse.tags) && pulse.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pulse.tags.slice(0, 8).map((tag: string, tagIdx: number) => <TextChip key={tagIdx} label={tag} />)}
                  </div>
                )}
              </div>
            ))}
            {pulses.length > (proMode ? 10 : 3) && (
              <div className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                +{pulses.length - (proMode ? 10 : 3)} more pulses in the alienvault source payload
              </div>
            )}
          </div>
        </ResultCard>
      )}

      {(categoryEntries.length > 0 || popularityEntries.length > 0) && (
        <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4 items-start">
          {categoryEntries.length > 0 && (
            <ResultCard>
              <SectionHeader title={`Categories (${categoryEntries.length})`} />
              <div className="space-y-1 mt-4">
                {categoryEntries.map(([vendor, category]) => (
                  <div
                    key={vendor}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                    style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                  >
                    <span className="text-xs truncate" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>{vendor}</span>
                    <span className="text-sm font-medium text-right" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>{category}</span>
                  </div>
                ))}
              </div>
            </ResultCard>
          )}
          {popularityEntries.length > 0 && (
            <ResultCard>
              <SectionHeader title={`Popularity ranks (${popularityEntries.length})`} />
              <div className="space-y-1 mt-4">
                {popularityEntries.map(([provider, info]: [string, any]) => (
                  <div
                    key={provider}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                    style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                  >
                    <span className="text-xs truncate" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>{provider}</span>
                    <span className="text-sm font-medium tabular-nums" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>
                      {info?.rank != null ? `#${Number(info.rank).toLocaleString()}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </ResultCard>
          )}
        </div>
      )}

      {cert && (
        <ResultCard>
          <SectionHeader icon={<Lock className="w-4 h-4" />} title="TLS certificate (VirusTotal last observed)" />
          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
            <ContextField label="Subject" value={cert.subject?.CN || 'Unknown'} mono />
            <ContextField label="Issuer" value={[cert.issuer?.O, cert.issuer?.CN].filter(Boolean).join(' — ') || 'Unknown'} />
            <ContextField label="Valid from" value={cert.validity?.not_before || 'Unknown'} mono />
            <ContextField label="Valid until" value={cert.validity?.not_after || 'Unknown'} mono />
            {proMode && cert.serial_number && <ContextField label="Serial" value={cert.serial_number} mono />}
            {proMode && cert.thumbprint_sha256 && <ContextField label="SHA-256 thumbprint" value={cert.thumbprint_sha256} mono />}
            {proMode && cert.signature_algorithm && <ContextField label="Signature algorithm" value={cert.signature_algorithm} mono />}
          </div>
          {proMode && sans.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium mb-1.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                Subject alternative names ({sans.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sans.map((san, idx) => (
                  <MonoChip
                    key={idx}
                    value={san}
                    onPivot={onScan && !san.startsWith('*.') ? () => onScan('domain', san.toLowerCase()) : undefined}
                    pivotLabel={`Open domain intelligence for ${san}`}
                  />
                ))}
              </div>
            </div>
          )}
        </ResultCard>
      )}

      {(certSubdomains.length > 0 || recentCerts.length > 0 || crtsh?.cert_count != null) && (
        <ResultCard>
          <SectionHeader icon={<Lock className="w-4 h-4" />} title="Certificate transparency (crt.sh)" />
          <div className="grid grid-cols-2 @xl:grid-cols-3 gap-3 mt-4">
            <StatCell label="Certificates logged" value={crtsh?.cert_count ?? certSubdomains.length} />
            <StatCell label="Distinct subdomains" value={crtsh?.subdomain_count ?? certSubdomains.length} />
            {crtsh?.subdomain_count != null && crtsh.subdomain_count > certSubdomains.length && (
              <StatCell label="Returned (capped)" value={certSubdomains.length} />
            )}
          </div>

          {certSubdomains.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium mb-1.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                Subdomains seen in certificates{onScan ? ' — click to pivot' : ''}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {subsShown.map((sub, idx) => (
                  <MonoChip
                    key={idx}
                    value={sub}
                    onPivot={onScan ? () => onScan('domain', sub) : undefined}
                    pivotLabel={`Open domain intelligence for ${sub}`}
                  />
                ))}
              </div>
              {!proMode && certSubdomains.length > subsShown.length && (
                <ExpandToggle
                  expanded={subsExpanded}
                  onClick={() => setSubsExpanded(!subsExpanded)}
                  label={`Show ${certSubdomains.length - subsShown.length} more`}
                />
              )}
              {!proMode && subsExpanded && certSubdomains.length > 24 && (
                <ExpandToggle expanded onClick={() => setSubsExpanded(false)} label="Show fewer" />
              )}
            </div>
          )}

          {proMode && recentCerts.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium mb-1.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                Recent certificates ({recentCerts.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ fontFamily: typography.ui }}>
                  <thead>
                    <tr className="text-[11px]" style={{ color: palette.textTertiary }}>
                      <th className="font-medium pb-2 pr-3">Common name</th>
                      <th className="font-medium pb-2 pr-3">Issuer</th>
                      <th className="font-medium pb-2 pr-3 whitespace-nowrap">Not before</th>
                      <th className="font-medium pb-2 pr-3 whitespace-nowrap">Not after</th>
                      <th className="font-medium pb-2 whitespace-nowrap">Logged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCerts.map((c, idx) => (
                      <tr key={idx} style={{ borderTop: `1px solid ${palette.borderSubtle}` }}>
                        <td className="py-1.5 pr-3 text-xs break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{c.common_name || '—'}</td>
                        <td className="py-1.5 pr-3 text-xs" style={{ color: palette.textSecondary }}>{c.issuer || '—'}</td>
                        <td className="py-1.5 pr-3 text-xs whitespace-nowrap tabular-nums" style={{ color: palette.textSecondary }}>{formatDate(c.not_before) || '—'}</td>
                        <td className="py-1.5 pr-3 text-xs whitespace-nowrap tabular-nums" style={{ color: palette.textSecondary }}>{formatDate(c.not_after) || '—'}</td>
                        <td className="py-1.5 text-xs whitespace-nowrap tabular-nums" style={{ color: palette.textSecondary }}>{formatDate(c.logged_at) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}

/* -------------------------------- Sources -------------------------------- */

function sourceStatus(entry: SourceEntry | undefined): { label: string; tone: Tone } {
  if (!entry) return { label: 'No data', tone: 'neutral' };
  if (entry.error) return { label: 'Error', tone: 'danger' };
  if (entry.malicious) return { label: 'Flagged', tone: 'danger' };
  if (entry.found) return { label: 'OK', tone: 'good' };
  return { label: 'No data', tone: 'neutral' };
}

function SourcesSection({ sources, proMode, checkedAt, tier }: {
  sources: Record<string, SourceEntry>;
  proMode: boolean;
  checkedAt?: string;
  tier?: string;
}) {
  // Details JSON starts collapsed; analysts open what they need.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const sourceKeys = Object.keys(sources);

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const meta = [
    checkedAt ? `Checked ${new Date(checkedAt).toLocaleString()}` : null,
    tier ? `tier ${tier}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<Database className="w-4 h-4" />}
        title={`Individual sources (${sourceKeys.length})`}
        actions={meta ? <span className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>{meta}</span> : undefined}
      />

      {sourceKeys.length === 0 && <ResultCard><EmptyNote>No sources responded for this lookup.</EmptyNote></ResultCard>}

      <div className="space-y-2">
        {sourceKeys.map((sourceKey) => {
          const entry = sources[sourceKey];
          const status = sourceStatus(entry);
          const hasError = status.label === 'Error';
          const isExpanded = expandedKeys.has(sourceKey);
          const canExpand = proMode && entry?.details != null;
          return (
            <div
              key={sourceKey}
              className="rounded-lg overflow-hidden"
              style={{
                background: hasError ? `${palette.rose}0d` : palette.base,
                border: `1px solid ${hasError ? `${palette.rose}40` : palette.borderDefault}`,
              }}
            >
              <button
                onClick={() => canExpand && toggle(sourceKey)}
                disabled={!canExpand}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:brightness-110 disabled:cursor-default"
                style={{ background: 'transparent' }}
                title={hasError && entry?.error ? entry.error : undefined}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {canExpand
                    ? (isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                      : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />)
                    : <span className="w-3.5 h-3.5 shrink-0" />}
                  <span className="text-sm font-semibold truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                    {sourceKey}
                  </span>
                  {entry?.threatScore != null && entry.threatScore > 0 && (
                    <span className="text-[11px] tabular-nums shrink-0" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                      score {entry.threatScore}
                    </span>
                  )}
                </span>
                <Pill label={status.label} tone={status.tone} />
              </button>
              {hasError && entry?.error && (
                <div className="px-4 pb-3 -mt-1 text-xs break-words" style={{ color: palette.rose, fontFamily: typography.ui }}>
                  {entry.error}
                </div>
              )}
              {isExpanded && canExpand && (
                <div className="px-4 pb-4">
                  <pre
                    className="text-xs overflow-auto max-h-72 rounded-md p-3"
                    style={{ background: palette.void, color: palette.textSecondary, fontFamily: typography.mono, border: `1px solid ${palette.borderDefault}` }}
                  >
                    {JSON.stringify(entry.details, null, 2)}
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

/* -------------------------------- Raw JSON ------------------------------- */

function RawJsonSection({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<FileJson className="w-4 h-4" />}
        title="Raw JSON"
        actions={
          <button
            onClick={copyJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:brightness-125"
            style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary, fontFamily: typography.ui }}
          >
            {copied ? <Check className="w-3.5 h-3.5" style={{ color: palette.green }} /> : <Copy className="w-3.5 h-3.5" />}
            Copy JSON
          </button>
        }
      />
      <pre
        className="overflow-auto max-h-[70vh] p-4"
        style={{
          background: palette.void,
          color: palette.textSecondary,
          fontFamily: typography.mono,
          fontSize: '11px',
          borderRadius: '8px',
          border: `1px solid ${palette.borderDefault}`,
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
