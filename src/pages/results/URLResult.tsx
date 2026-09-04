import { useEffect, useMemo, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  Globe, AlertTriangle, Shield, Database, Target, FileJson, Code, Scale, Camera, Loader2,
  ExternalLink, Server, ArrowRight, Link as LinkIcon, ListTree,
} from 'lucide-react';
import { useTheme } from '../../contexts/themecontext';
import { scanURL, fetchUrlscanResult, lookupDomain, type UrlscanDetonation } from '../../lib/threatIntel';
import type { URLLookupResult, DomainLookupResult, CalibratedScoring } from '../../types';
import VerdictPanel from '../../components/scanner/VerdictPanel';
import VerdictStrip from '../../components/scanner/VerdictStrip';
import { palette, typography } from '../../design-system/tokens';
import {
  ResultShell, ResultLoading, ResultError, ResultEmpty,
  StatCell, Pill, SectionHeader, Callout, ResultCard, SummaryActions, SignalLight,
  type ShellMenuItem, type Tone,
} from '../../components/results';

interface URLResultProps {
  url: string;
  /** Pivot handler (ip | url | domain | hash …). Pivot affordances render only when provided. */
  onScan?: (type: string, value: string) => void;
}

type MenuItem = 'overview' | 'verdict' | 'detonation' | 'host' | 'analysis' | 'threats' | 'sources' | 'raw';
type DetonationState = 'idle' | 'pending' | 'ready' | 'timeout';
type HostState = 'idle' | 'loading' | 'ready' | 'error' | 'ip-literal' | 'invalid';

/** Normalised per-source shape produced by `scanURL` in lib/threatIntel.ts. */
interface NormalisedSource {
  found: boolean;
  malicious: boolean;
  details: any;
  error?: string;
  threatScore?: number;
}

const VERDICT_META: Record<CalibratedScoring['verdict'], { label: string; tone: Tone }> = {
  malicious: { label: 'Malicious', tone: 'danger' },
  suspicious: { label: 'Suspicious', tone: 'warn' },
  low_signal: { label: 'Low signal', tone: 'neutral' },
  no_signal: { label: 'No signal', tone: 'good' },
};

const THREAT_TYPE_LABEL: Record<string, string> = {
  malware: 'Malware',
  phishing: 'Phishing',
  unwanted_software: 'Unwanted software',
};

/** Extract the hostname of the scanned URL; returns null when it cannot be parsed. */
function parseHost(url: string): { host: string; isIp: boolean } | null {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`);
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host) return null;
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
    return { host, isIp };
  } catch {
    return null;
  }
}

function isKeyError(error?: string): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return e.includes('401') || e.includes('403') || e.includes('unauthori') || e.includes('not configured') || e.includes('api key');
}

export default function URLResult({ url, onScan }: URLResultProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<URLLookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [proMode, setProMode] = useState(true);
  const [detonation, setDetonation] = useState<UrlscanDetonation | null>(null);
  const [detonationState, setDetonationState] = useState<DetonationState>('idle');
  const [host, setHost] = useState<DomainLookupResult | null>(null);
  const [hostState, setHostState] = useState<HostState>('idle');
  const [hostError, setHostError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const parsedHost = useMemo(() => parseHost(url), [url]);

  useEffect(() => {
    if (containerRef.current) {
      const mainContainer = containerRef.current.closest('[style*="overflow"]');
      if (mainContainer) mainContainer.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, []);

  // URL scan (VT URL, urlscan submit, URLhaus, PhishTank, OpenPhish, Safe Browsing, Tranco).
  useEffect(() => {
    let cancelled = false;
    const performLookup = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await scanURL(url);
        if (!cancelled) setResult(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to lookup URL');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    performLookup();
    return () => { cancelled = true; };
  }, [url]);

  // Host context runs in parallel with the URL scan: a URL verdict is about the
  // page; the analyst also needs to know who owns/hosts it. IP-literal hosts
  // pivot to the IP scanner instead of a domain lookup.
  useEffect(() => {
    if (!parsedHost) { setHostState('invalid'); return; }
    if (parsedHost.isIp) { setHostState('ip-literal'); return; }
    let cancelled = false;
    setHostState('loading');
    setHostError('');
    lookupDomain(parsedHost.host)
      .then(data => { if (!cancelled) { setHost(data); setHostState('ready'); } })
      .catch(err => { if (!cancelled) { setHostError(err?.message || 'Host lookup failed'); setHostState('error'); } });
    return () => { cancelled = true; };
  }, [parsedHost]);

  // urlscan submits are async — poll the result API until the detonation finishes.
  useEffect(() => {
    if (!result) return;
    const details = (result.results?.urlscan as unknown as NormalisedSource | undefined)?.details;
    if (!details) return;
    if (details.ready) {
      setDetonation(details as UrlscanDetonation);
      setDetonationState('ready');
      return;
    }
    if (!details.uuid) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const MAX_ATTEMPTS = 15; // ~80s total

    setDetonationState('pending');
    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetchUrlscanResult(details.uuid, url);
        if (cancelled) return;
        if (res.ready) {
          setDetonation(res);
          setDetonationState('ready');
          return;
        }
      } catch {
        // transient — keep polling
      }
      if (attempts >= MAX_ATTEMPTS) {
        setDetonationState('timeout');
        return;
      }
      timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 7000); // scans are rarely ready before ~10s
    return () => { cancelled = true; clearTimeout(timer); };
  }, [result, url]);

  if (loading && !result) {
    return <div ref={containerRef} className="h-full"><ResultLoading message={`Scanning ${url}…`} /></div>;
  }
  if (error) {
    return <div ref={containerRef} className="h-full"><ResultError message={error} /></div>;
  }
  if (!result) {
    return <div ref={containerRef} className="h-full"><ResultEmpty message={`No result data available for ${url}.`} /></div>;
  }

  const sources = (result.results || {}) as unknown as Record<string, NormalisedSource>;
  const vtData = sources.virustotal?.details?.data?.attributes as any;
  const urlscanSource = sources.urlscan;
  const scoring = result.scoring;
  const verdictMeta = scoring
    ? VERDICT_META[scoring.verdict]
    : { label: result.isMalicious ? 'Malicious' : 'Not flagged', tone: (result.isMalicious ? 'danger' : 'neutral') as Tone };
  const headlineScore = scoring ? scoring.calibrated : result.overallThreatScore;
  const threatTypes = result.threatTypes || [];

  const menuItems: ShellMenuItem<MenuItem>[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'verdict', label: 'Verdict', icon: Scale },
    { id: 'detonation', label: 'Detonation', icon: Camera },
    { id: 'host', label: 'Host', icon: Server },
    { id: 'analysis', label: 'Analysis', icon: Code },
    { id: 'threats', label: 'Threats', icon: AlertTriangle },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'raw', label: 'Raw JSON', icon: FileJson },
  ];

  const getSummary = () => {
    const lines = [
      `URL: ${url}`,
      `Verdict: ${verdictMeta.label} (score ${headlineScore ?? 'n/a'})`,
      `Threat types: ${threatTypes.length ? threatTypes.map(t => THREAT_TYPE_LABEL[t] || t).join(', ') : 'none'}`,
      `Title: ${vtData?.title || 'Unknown'}`,
      `HTTP status: ${vtData?.last_http_response_code || 'Unknown'}`,
    ];
    if (detonation?.verdicts) {
      lines.push(`urlscan.io: score ${detonation.verdicts.score ?? 0}${detonation.verdicts.malicious ? ' (flagged malicious)' : ''}${detonation.verdicts.brands?.length ? ` · brands: ${detonation.verdicts.brands.join(', ')}` : ''}`);
    }
    if (detonation?.page?.ip) lines.push(`Final page IP: ${detonation.page.ip}${detonation.page.country ? ` (${detonation.page.country})` : ''}`);
    if (host?.whois) {
      lines.push(`Host: ${host.domain} · registrar ${host.whois.registrar || 'unknown'} · age ${formatAge(host.whois.domainAge)}`);
    }
    return lines.join('\n');
  };

  const signals = (
    <>
      <SignalLight label="PHISHING" on={threatTypes.includes('phishing')} tone="danger" />
      <SignalLight label="MALWARE" on={threatTypes.includes('malware')} tone="danger" />
      <SignalLight label="UNWANTED" on={threatTypes.includes('unwanted_software')} tone="warn" />
      <SignalLight
        label="DETONATED"
        on={detonationState === 'ready'}
        tone={detonation?.verdicts?.malicious ? 'danger' : 'accent'}
        detail={detonation?.verdicts?.brands?.length ? detonation.verdicts.brands.join(', ') : undefined}
      />
      {detonation?.page?.country && (
        <SignalLight label={String(detonation.page.country).toUpperCase()} on tone="neutral" detail={detonation.page.city || undefined} />
      )}
    </>
  );

  const headerActions = (
    <>
      {onScan && parsedHost && (
        <PivotButton
          label={parsedHost.isIp ? 'Scan host IP' : 'Full domain report'}
          onClick={() => onScan(parsedHost.isIp ? 'ip' : 'domain', parsedHost.host)}
        />
      )}
      <SummaryActions getSummary={getSummary} getJson={() => result} />
    </>
  );

  return (
    <div ref={containerRef} className="h-full">
      <ResultShell<MenuItem>
        value={url}
        typeLabel="URL scan"
        verdict={verdictMeta}
        score={headlineScore}
        signals={signals}
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
            result={result}
            sources={sources}
            vtData={vtData}
            detonation={detonation}
            detonationState={detonationState}
            host={host}
            hostState={hostState}
            hostError={hostError}
            parsedHost={parsedHost}
            onOpen={setActiveMenu}
            onScan={onScan}
          />
        )}
        {activeMenu === 'verdict' && <VerdictPanel lookupType="url" value={url} scoring={scoring} />}
        {activeMenu === 'detonation' && (
          <DetonationSection
            detonation={detonation}
            state={detonationState}
            urlscanDetails={urlscanSource?.details}
            urlscanError={urlscanSource?.error}
            onScan={onScan}
          />
        )}
        {activeMenu === 'host' && (
          <HostSection host={host} state={hostState} error={hostError} parsedHost={parsedHost} proMode={proMode} onScan={onScan} />
        )}
        {activeMenu === 'analysis' && <AnalysisSection vtData={vtData} proMode={proMode} />}
        {activeMenu === 'threats' && <ThreatsSection vtData={vtData} sources={sources} proMode={proMode} />}
        {activeMenu === 'sources' && <SourcesSection sources={sources} proMode={proMode} />}
        {activeMenu === 'raw' && <RawJsonSection data={result} />}
      </ResultShell>
    </div>
  );
}

// ─── Shared local primitives ──────────────────────────────────────────────────

function Field({ label, value, mono = false, tone = 'neutral', className }: {
  label: string; value: ReactNode; mono?: boolean; tone?: Tone; className?: string;
}) {
  const color = tone === 'danger' ? palette.rose : tone === 'warn' ? palette.amber : tone === 'good' ? palette.green : palette.textPrimary;
  return (
    <div className={`min-w-0 ${className || ''}`}>
      <div className="text-[11px] font-medium mb-0.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>{label}</div>
      <div className="text-sm font-medium leading-snug break-all" style={{ color, fontFamily: mono ? typography.mono : typography.ui }}>
        {value}
      </div>
    </div>
  );
}

/** Small accent-outlined action used for pivots into other scanners. */
function PivotButton({ label, onClick, icon }: { label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:brightness-125"
      style={{ background: `${palette.accent}14`, border: `1px solid ${palette.accent}55`, color: palette.accent, fontFamily: typography.ui }}
    >
      {icon ?? <ArrowRight className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

/** Mono value that becomes a pivot when a handler is available. */
function PivotValue({ value, type, onScan }: { value: string; type: string; onScan?: (t: string, v: string) => void }) {
  if (!onScan) {
    return <span className="text-sm break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{value}</span>;
  }
  return (
    <button
      onClick={() => onScan(type, value)}
      title={`Scan ${type}: ${value}`}
      className="inline-flex items-center gap-1.5 text-sm text-left break-all rounded transition-colors hover:brightness-125"
      style={{ color: palette.accent, fontFamily: typography.mono }}
    >
      {value}
      <ArrowRight className="w-3 h-3 shrink-0" />
    </button>
  );
}

function Chip({ children, onClick, title }: { children: ReactNode; onClick?: () => void; title?: string }) {
  const style = {
    background: palette.float,
    border: `1px solid ${palette.borderDefault}`,
    color: onClick ? palette.accent : palette.textSecondary,
    fontFamily: typography.mono,
  };
  if (onClick) {
    return (
      <button onClick={onClick} title={title} className="px-2 py-1 rounded text-xs break-all text-left transition-colors hover:brightness-125" style={style}>
        {children}
      </button>
    );
  }
  return <span className="px-2 py-1 rounded text-xs break-all" style={style}>{children}</span>;
}

function ExternalButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:brightness-125"
      style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary, fontFamily: typography.ui }}
    >
      <ExternalLink className="w-3.5 h-3.5" />
      {label}
    </a>
  );
}

function JsonBlock({ data, maxHeight = '18rem' }: { data: unknown; maxHeight?: string }) {
  return (
    <pre
      className="text-[11px] overflow-auto rounded-md p-3"
      style={{ background: palette.void, color: palette.textSecondary, fontFamily: typography.mono, maxHeight, border: `1px solid ${palette.borderDefault}` }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function formatAge(days?: number | null): string {
  if (days == null || Number.isNaN(days)) return 'unknown';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  const years = Math.floor(days / 365);
  const rem = Math.floor((days % 365) / 30);
  return rem ? `${years} yr ${rem} mo` : `${years} yr`;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

/** Honest per-source status for the feed/blocklist rows. */
function sourceStatus(src?: NormalisedSource): { label: string; tone: Tone; detail?: string } {
  if (!src) return { label: 'Not run', tone: 'neutral' };
  if (src.error) {
    return isKeyError(src.error)
      ? { label: 'Key missing', tone: 'warn', detail: 'Source not authorised — this is a configuration gap, not a clean result.' }
      : { label: 'Error', tone: 'danger', detail: src.error };
  }
  if (src.malicious) return { label: 'Flagged', tone: 'danger' };
  return { label: 'Not listed', tone: 'neutral' };
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewSection({ result, sources, vtData, detonation, detonationState, host, hostState, hostError, parsedHost, onOpen, onScan }: {
  result: URLLookupResult;
  sources: Record<string, NormalisedSource>;
  vtData: any;
  detonation: UrlscanDetonation | null;
  detonationState: DetonationState;
  host: DomainLookupResult | null;
  hostState: HostState;
  hostError: string;
  parsedHost: { host: string; isIp: boolean } | null;
  onOpen: (m: MenuItem) => void;
  onScan?: (type: string, value: string) => void;
}) {
  const threatTypes = result.threatTypes || [];
  const flaggedBy = Object.entries(sources).filter(([, s]) => s?.malicious).map(([k]) => k);
  const stats = vtData?.last_analysis_stats;

  return (
    <div className="space-y-4">
      {threatTypes.length > 0 && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="danger"
          title={`${threatTypes.map(t => THREAT_TYPE_LABEL[t] || t).join(' · ')} URL`}
          detail={flaggedBy.length ? `Flagged by ${flaggedBy.join(', ')}.` : undefined}
        />
      )}
      {detonation?.verdicts?.brands && detonation.verdicts.brands.length > 0 && (
        <Callout
          icon={<Shield className="w-4 h-4" />}
          tone="danger"
          title={`Brand impersonation: ${detonation.verdicts.brands.join(', ')}`}
          detail="urlscan.io matched the rendered page against known brand kits."
        />
      )}

      <VerdictStrip scoring={result.scoring} />

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <ResultCard>
            <SectionHeader icon={<Globe className="w-4 h-4" />} title="Page" />
            <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
              <Field label="Title" value={vtData?.title || 'Unknown'} className="col-span-2" />
              <Field
                label="HTTP status"
                value={vtData?.last_http_response_code || 'Unknown'}
                tone={vtData?.last_http_response_code === 200 ? 'good' : vtData?.last_http_response_code ? 'warn' : 'neutral'}
              />
              <Field label="Content length" value={vtData?.last_http_response_content_length ? `${vtData.last_http_response_content_length} bytes` : 'Unknown'} />
              <Field label="Final URL (VirusTotal)" value={vtData?.last_final_url || 'Unknown'} mono className="col-span-2" />
            </div>
          </ResultCard>

          <ResultCard>
            <SectionHeader icon={<Database className="w-4 h-4" />} title="Feeds and blocklists" />
            <div className="mt-3 divide-y" style={{ borderColor: palette.borderSubtle }}>
              <FeedRow
                name="VirusTotal"
                status={sources.virustotal?.error
                  ? sourceStatus(sources.virustotal)
                  : stats
                    ? { label: `${stats.malicious || 0} / ${(stats.malicious || 0) + (stats.suspicious || 0) + (stats.harmless || 0) + (stats.undetected || 0)} engines`, tone: (stats.malicious || 0) > 0 ? 'danger' : 'neutral' }
                    : { label: 'No data', tone: 'neutral' }}
              />
              <FeedRow name="URLhaus" status={sourceStatus(sources.urlhaus)} />
              <FeedRow name="PhishTank" status={sourceStatus(sources.phishtank)} />
              <FeedRow name="OpenPhish" status={sourceStatus(sources.openphish)} />
              <FeedRow name="Google Safe Browsing" status={sourceStatus(sources.google_safebrowsing)} />
              <FeedRow
                name="Tranco rank (host)"
                status={sources.tranco?.error
                  ? sourceStatus(sources.tranco)
                  : sources.tranco?.details?.rank
                    ? { label: `#${Number(sources.tranco.details.rank).toLocaleString()}`, tone: 'good', detail: 'Host is in the Tranco top 1M — popularity is context, not a verdict.' }
                    : { label: 'Not in top 1M', tone: 'neutral' }}
              />
            </div>
          </ResultCard>
        </div>

        <div className="space-y-4 min-w-0">
          <DetonationSummaryCard detonation={detonation} state={detonationState} urlscan={sources.urlscan} onOpen={() => onOpen('detonation')} />
          <HostSummaryCard host={host} state={hostState} error={hostError} parsedHost={parsedHost} onOpen={() => onOpen('host')} onScan={onScan} />
        </div>
      </div>
    </div>
  );
}

function FeedRow({ name, status }: { name: string; status: { label: string; tone: Tone; detail?: string } }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderColor: palette.borderSubtle }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>{name}</div>
        {status.detail && (
          <div className="text-[11px] mt-0.5 break-words" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>{status.detail}</div>
        )}
      </div>
      <Pill label={status.label} tone={status.tone} />
    </div>
  );
}

function DetonationSummaryCard({ detonation, state, urlscan, onOpen }: {
  detonation: UrlscanDetonation | null; state: DetonationState; urlscan?: NormalisedSource; onOpen: () => void;
}) {
  const v = detonation?.verdicts;
  const notAvailable = !urlscan?.details?.uuid && !detonation;
  return (
    <ResultCard>
      <SectionHeader
        icon={<Camera className="w-4 h-4" />}
        title="Sandbox detonation"
        actions={!notAvailable && <PivotButton label="View" onClick={onOpen} />}
      />
      <div className="mt-3">
        {notAvailable ? (
          <div className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            {isKeyError(urlscan?.error)
              ? 'urlscan.io key not configured — detonation unavailable.'
              : urlscan?.error
                ? `urlscan.io error: ${urlscan.error}`
                : 'No urlscan.io detonation for this URL.'}
          </div>
        ) : state === 'ready' && detonation ? (
          <div className="flex gap-4 items-start">
            {detonation.screenshotUrl && (
              <a href={detonation.reportUrl || detonation.screenshotUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img
                  src={detonation.screenshotUrl}
                  alt="urlscan.io page screenshot"
                  loading="lazy"
                  className="w-32 h-20 object-cover object-top rounded-md"
                  style={{ border: `1px solid ${palette.borderDefault}` }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </a>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: v?.malicious ? palette.rose : palette.textPrimary, fontFamily: typography.ui }}>
                  {v?.score ?? 0}
                </span>
                <Pill label={v?.malicious ? 'Flagged malicious' : 'Not flagged'} tone={v?.malicious ? 'danger' : 'neutral'} />
                {(detonation.maliciousRequests ?? 0) > 0 && <Pill label={`${detonation.maliciousRequests} malicious requests`} tone="danger" />}
              </div>
              <div className="text-xs" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
                {[detonation.page?.domain, detonation.page?.ip, detonation.page?.country].filter(Boolean).join(' · ') || 'Final page details in the Detonation tab.'}
              </div>
              {(detonation.redirectChain?.length ?? 0) > 1 && (
                <div className="text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                  {detonation.redirectChain!.length} navigation hops
                </div>
              )}
            </div>
          </div>
        ) : state === 'timeout' ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: palette.amber, fontFamily: typography.ui }}>
            <AlertTriangle className="w-4 h-4" /> Detonation is taking longer than expected.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: palette.accent }} />
            urlscan.io is rendering the page — results load automatically.
          </div>
        )}
      </div>
    </ResultCard>
  );
}

function HostSummaryCard({ host, state, error, parsedHost, onOpen, onScan }: {
  host: DomainLookupResult | null; state: HostState; error: string;
  parsedHost: { host: string; isIp: boolean } | null; onOpen: () => void; onScan?: (t: string, v: string) => void;
}) {
  const whois = host?.whois;
  const hostVt = host?.sources?.virustotal?.details?.data?.attributes as any;
  const hostStats = hostVt?.last_analysis_stats;
  const young = whois?.domainAge != null && whois.domainAge < 90;

  return (
    <ResultCard>
      <SectionHeader
        icon={<Server className="w-4 h-4" />}
        title="Host"
        actions={state === 'ready' && <PivotButton label="Host tab" onClick={onOpen} />}
      />
      <div className="mt-3">
        {!parsedHost || state === 'invalid' ? (
          <div className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>Could not parse a hostname from this URL.</div>
        ) : state === 'ip-literal' ? (
          <div className="space-y-2">
            <Field label="Host is an IP address" value={<PivotValue value={parsedHost.host} type="ip" onScan={onScan} />} />
            <div className="text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>No domain to enrich. Open the IP result for reputation, ASN and VPN/proxy context.</div>
          </div>
        ) : state === 'loading' || state === 'idle' ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: palette.accent }} />
            Looking up {parsedHost.host}…
          </div>
        ) : state === 'error' ? (
          <div className="text-sm" style={{ color: palette.rose, fontFamily: typography.ui }}>Host lookup failed: {error}</div>
        ) : (
          <div className="space-y-3">
            <Field label="Domain" value={<PivotValue value={parsedHost.host} type="domain" onScan={onScan} />} />
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              <Field label="Registrar" value={whois?.registrar || 'Unknown'} />
              <Field label="Age" value={formatAge(whois?.domainAge)} tone={young ? 'warn' : 'neutral'} />
              <Field label="Registered" value={formatDate(whois?.registrationDate)} />
              <Field
                label="VirusTotal (domain)"
                value={hostStats ? `${hostStats.malicious || 0} malicious · ${hostStats.suspicious || 0} suspicious` : 'No data'}
                tone={hostStats?.malicious > 0 ? 'danger' : 'neutral'}
              />
            </div>
            {young && (
              <div className="text-xs" style={{ color: palette.amber, fontFamily: typography.ui }}>
                Domain registered less than 90 days ago — common for phishing infrastructure.
              </div>
            )}
          </div>
        )}
      </div>
    </ResultCard>
  );
}

// ─── Detonation ───────────────────────────────────────────────────────────────

function DetonationSection({ detonation, state, urlscanDetails, urlscanError, onScan }: {
  detonation: UrlscanDetonation | null; state: DetonationState; urlscanDetails: any; urlscanError?: string;
  onScan?: (type: string, value: string) => void;
}) {
  const reportUrl = detonation?.reportUrl || urlscanDetails?.resultUrl;

  if (!urlscanDetails?.uuid && !detonation) {
    return (
      <ResultCard>
        <div className="py-6 text-center">
          <Camera className="w-8 h-8 mx-auto mb-3" style={{ color: palette.textDisabled }} />
          <p className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            {isKeyError(urlscanError) ? 'urlscan.io key not configured — detonation unavailable for this tier.' : 'No urlscan.io detonation available for this URL.'}
          </p>
          {urlscanError && !isKeyError(urlscanError) && (
            <p className="text-xs mt-2" style={{ color: palette.textTertiary, fontFamily: typography.mono }}>{urlscanError}</p>
          )}
        </div>
      </ResultCard>
    );
  }

  if (state === 'pending' || (state === 'idle' && !detonation)) {
    return (
      <ResultCard>
        <div className="py-8 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" style={{ color: palette.accent }} />
          <p className="text-sm font-semibold" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>Detonating in sandbox…</p>
          <p className="text-xs mt-1" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            urlscan.io is loading the page in a headless browser. Usually 15–45 seconds — results appear here automatically.
          </p>
        </div>
      </ResultCard>
    );
  }

  if (state === 'timeout' && !detonation) {
    return (
      <Callout icon={<AlertTriangle className="w-4 h-4" />} tone="warn" title="Detonation is taking longer than expected">
        {reportUrl && <div className="mt-3"><ExternalButton href={reportUrl} label="Open report on urlscan.io" /></div>}
      </Callout>
    );
  }

  if (!detonation) return null;
  const v = detonation.verdicts;
  const p = detonation.page || ({} as NonNullable<UrlscanDetonation['page']>);

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<Camera className="w-4 h-4" />}
        title="Sandbox detonation (urlscan.io)"
        actions={reportUrl && <ExternalButton href={reportUrl} label="Full report" />}
      />

      <div
        className="p-4 rounded-lg flex items-center gap-4 flex-wrap"
        style={{ background: v?.malicious ? `${palette.rose}12` : palette.base, border: `1px solid ${v?.malicious ? `${palette.rose}40` : palette.borderDefault}` }}
      >
        <span className="text-3xl font-bold tabular-nums leading-none" style={{ color: v?.malicious ? palette.rose : palette.textPrimary, fontFamily: typography.ui }}>
          {v?.score ?? 0}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: v?.malicious ? palette.rose : palette.textPrimary, fontFamily: typography.ui }}>
            {v?.malicious ? 'Flagged malicious' : 'Not flagged'}
          </div>
          <div className="text-xs" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            urlscan.io verdict{v?.categories?.length ? ` · ${v.categories.join(', ')}` : ''}{v?.brands?.length ? ` · impersonating: ${v.brands.join(', ')}` : ''}
            {detonation.time ? ` · ${new Date(detonation.time).toLocaleString()}` : ''}
          </div>
        </div>
        {(detonation.maliciousRequests ?? 0) > 0 && <Pill label={`${detonation.maliciousRequests} malicious requests`} tone="danger" />}
      </div>

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        {detonation.screenshotUrl && (
          <ResultCard>
            <SectionHeader title="Page screenshot" />
            <a href={reportUrl || detonation.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block mt-3">
              <img
                src={detonation.screenshotUrl}
                alt="urlscan.io page screenshot"
                loading="lazy"
                className="w-full rounded-md"
                style={{ border: `1px solid ${palette.borderDefault}` }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </a>
          </ResultCard>
        )}

        <ResultCard>
          <SectionHeader title="Final page" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-3">
            {p.url && <Field label="URL" value={<PivotValue value={p.url} type="url" onScan={onScan} />} className="col-span-2" />}
            {p.domain && <Field label="Domain" value={<PivotValue value={p.domain} type="domain" onScan={onScan} />} />}
            {p.ip && <Field label="IP" value={<PivotValue value={p.ip} type="ip" onScan={onScan} />} />}
            {(p.asn || p.asnname) && <Field label="ASN" value={p.asn && p.asnname ? `${p.asn} · ${p.asnname}` : p.asnname || p.asn} mono />}
            {p.country && <Field label="Location" value={p.city ? `${p.city}, ${p.country}` : p.country} />}
            {p.server && <Field label="Server" value={p.server} mono />}
            {p.status != null && <Field label="HTTP status" value={String(p.status)} />}
            {p.mimeType && <Field label="MIME type" value={p.mimeType} mono />}
            {p.tlsIssuer && <Field label="TLS issuer" value={p.tlsIssuer} />}
            {p.tlsValidFrom && <Field label="TLS valid from" value={formatDate(p.tlsValidFrom)} />}
            {p.title && <Field label="Title" value={p.title} className="col-span-2" />}
          </div>
        </ResultCard>
      </div>

      {(detonation.redirectChain?.length ?? 0) > 1 && (
        <ResultCard>
          <SectionHeader icon={<ListTree className="w-4 h-4" />} title={`Navigation chain (${detonation.redirectChain!.length} hops)`} />
          <div className="mt-3 space-y-1.5">
            {detonation.redirectChain!.map((hop, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="text-xs font-semibold tabular-nums w-5 text-right shrink-0 mt-0.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>{idx + 1}</span>
                <PivotValue value={hop} type="url" onScan={onScan} />
              </div>
            ))}
          </div>
          <div className="text-[11px] mt-3" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
            Document-type requests in load order — multi-hop gate pages show up here.
          </div>
        </ResultCard>
      )}

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        {(detonation.linkDomains?.length ?? 0) > 0 && (
          <ResultCard>
            <SectionHeader icon={<LinkIcon className="w-4 h-4" />} title={`Outgoing link domains (${detonation.linkDomains!.length})`} />
            <div className="flex flex-wrap gap-1.5 mt-3">
              {detonation.linkDomains!.map((d, idx) => (
                <Chip key={idx} onClick={onScan ? () => onScan('domain', d) : undefined} title={onScan ? `Scan domain ${d}` : undefined}>{d}</Chip>
              ))}
            </div>
          </ResultCard>
        )}
        {detonation.counts && (
          <ResultCard>
            <SectionHeader title="Traffic summary" />
            <div className="grid grid-cols-4 gap-2 mt-3">
              <StatCell label="Requests" value={detonation.counts.requests} />
              <StatCell label="URLs" value={detonation.counts.urls} />
              <StatCell label="Domains" value={detonation.counts.domains} />
              <StatCell label="IPs" value={detonation.counts.ips} />
            </div>
          </ResultCard>
        )}
      </div>
    </div>
  );
}

// ─── Host ─────────────────────────────────────────────────────────────────────

function HostSection({ host, state, error, parsedHost, proMode, onScan }: {
  host: DomainLookupResult | null; state: HostState; error: string;
  parsedHost: { host: string; isIp: boolean } | null; proMode: boolean; onScan?: (t: string, v: string) => void;
}) {
  if (!parsedHost || state === 'invalid') {
    return <ResultCard><div className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>Could not parse a hostname from this URL.</div></ResultCard>;
  }
  if (state === 'ip-literal') {
    return (
      <ResultCard>
        <SectionHeader icon={<Server className="w-4 h-4" />} title="Host is an IP address" />
        <div className="mt-3 space-y-2">
          <PivotValue value={parsedHost.host} type="ip" onScan={onScan} />
          <div className="text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
            There is no domain to enrich. The IP result carries reputation, ASN, geolocation and VPN/proxy context.
          </div>
        </div>
      </ResultCard>
    );
  }
  if (state === 'loading' || state === 'idle') {
    return <ResultLoading message={`Looking up ${parsedHost.host}…`} />;
  }
  if (state === 'error' || !host) {
    return <ResultError title="Host lookup failed" message={error || 'No data returned.'} />;
  }

  const whois = host.whois;
  const hostVt = host.sources?.virustotal?.details?.data?.attributes as any;
  const stats = hostVt?.last_analysis_stats;
  const hostAny = host as any;
  const tranco = hostAny.tranco as { rank?: number | null; in_top_1m?: boolean } | null | undefined;
  const pdns: any[] = Array.isArray(hostAny.pdns) ? hostAny.pdns : [];
  const certSubdomains: string[] = Array.isArray(hostAny.certSubdomains) ? hostAny.certSubdomains : [];
  const vtResolutions: any[] = hostAny.vtResolutions?.data ?? [];
  const resolvedIps = Array.from(new Set<string>([
    ...vtResolutions.map((r: any) => r?.attributes?.ip_address).filter(Boolean),
    ...pdns.map((r: any) => r?.ip || r?.rdata || r?.value).filter((v: unknown) => typeof v === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/.test(v as string)),
  ]));
  const hostVerdict = host.scoring ? VERDICT_META[host.scoring.verdict] : undefined;
  const young = whois?.domainAge != null && whois.domainAge < 90;
  const categories = host.categories ? Object.entries(host.categories) : [];

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<Server className="w-4 h-4" />}
        title={`Host context · ${host.domain}`}
        actions={onScan && <PivotButton label="Full domain report" onClick={() => onScan('domain', host.domain)} />}
      />

      {young && (
        <Callout icon={<AlertTriangle className="w-4 h-4" />} tone="warn" title="Recently registered domain" detail={`Registered ${formatAge(whois?.domainAge)} ago (${formatDate(whois?.registrationDate)}). Young domains are common phishing infrastructure; treat as context, not proof.`} />
      )}
      {stats?.malicious > 0 && (
        <Callout icon={<Shield className="w-4 h-4" />} tone="danger" title={`${stats.malicious} VirusTotal engines flag the host domain`} detail="Domain-level detections apply to every URL on this host." />
      )}

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        <ResultCard>
          <SectionHeader title="Registration" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-3">
            <Field label="Domain" value={host.domain} mono className="col-span-2" />
            <Field label="Registrar" value={whois?.registrar || 'Unknown'} />
            <Field label="Age" value={formatAge(whois?.domainAge)} tone={young ? 'warn' : 'neutral'} />
            <Field label="Registered" value={formatDate(whois?.registrationDate)} />
            <Field label="Expires" value={formatDate(whois?.expirationDate)} />
            {whois?.lastChanged && <Field label="Last changed" value={formatDate(whois.lastChanged)} />}
            {hostVerdict && (
              <Field label="Domain verdict" value={<span className="inline-flex items-center gap-2"><Pill label={hostVerdict.label} tone={hostVerdict.tone} /><span style={{ color: palette.textSecondary }}>score {host.scoring?.calibrated}</span></span>} />
            )}
            {whois?.nameservers && whois.nameservers.length > 0 && (
              <Field label="Nameservers" value={<div className="flex flex-wrap gap-1.5 mt-0.5">{whois.nameservers.map(ns => <Chip key={ns}>{ns.toLowerCase()}</Chip>)}</div>} className="col-span-2" />
            )}
            {proMode && whois?.status && whois.status.length > 0 && (
              <Field label="Status" value={whois.status.join(', ')} className="col-span-2" />
            )}
          </div>
        </ResultCard>

        <div className="space-y-4 min-w-0">
          <ResultCard>
            <SectionHeader title="Reputation" />
            <div className="mt-3 space-y-3">
              {stats ? (
                <div className="grid grid-cols-4 gap-2">
                  <StatCell label="Malicious" value={stats.malicious || 0} tone={(stats.malicious || 0) > 0 ? 'danger' : 'neutral'} />
                  <StatCell label="Suspicious" value={stats.suspicious || 0} tone={(stats.suspicious || 0) > 0 ? 'warn' : 'neutral'} />
                  <StatCell label="Harmless" value={stats.harmless || 0} />
                  <StatCell label="Undetected" value={stats.undetected || 0} />
                </div>
              ) : (
                <div className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
                  {host.sources?.virustotal?.error ? `VirusTotal: ${isKeyError(host.sources.virustotal.error) ? 'key not configured' : host.sources.virustotal.error}` : 'No VirusTotal domain data.'}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <Field label="VT community reputation" value={host.reputation ?? 'n/a'} tone={typeof host.reputation === 'number' && host.reputation < 0 ? 'warn' : 'neutral'} />
                <Field
                  label="Tranco rank"
                  value={tranco?.rank ? `#${Number(tranco.rank).toLocaleString()}` : 'Not in top 1M'}
                  tone={tranco?.rank ? 'good' : 'neutral'}
                />
              </div>
              {categories.length > 0 && (
                <Field label="Categories" value={<div className="flex flex-wrap gap-1.5 mt-0.5">{categories.map(([vendor, cat]) => <Chip key={vendor} title={vendor}>{String(cat)}</Chip>)}</div>} />
              )}
            </div>
          </ResultCard>
        </div>
      </div>

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        <ResultCard>
          <SectionHeader title={`Resolved IPs (${resolvedIps.length})`} />
          {resolvedIps.length === 0 ? (
            <div className="text-sm mt-3" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>No passive-DNS or VirusTotal resolutions returned.</div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {resolvedIps.slice(0, proMode ? undefined : 8).map(ip => <div key={ip}><PivotValue value={ip} type="ip" onScan={onScan} /></div>)}
              {!proMode && resolvedIps.length > 8 && (
                <div className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>+{resolvedIps.length - 8} more in Pro mode</div>
              )}
            </div>
          )}
        </ResultCard>

        <ResultCard>
          <SectionHeader title={`Certificate subdomains (${certSubdomains.length})`} />
          {certSubdomains.length === 0 ? (
            <div className="text-sm mt-3" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>No crt.sh subdomains returned.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {certSubdomains.slice(0, proMode ? 60 : 12).map(sub => (
                <Chip key={sub} onClick={onScan ? () => onScan('domain', sub) : undefined} title={onScan ? `Scan domain ${sub}` : undefined}>{sub}</Chip>
              ))}
              {certSubdomains.length > (proMode ? 60 : 12) && (
                <span className="text-[11px] self-center" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>+{certSubdomains.length - (proMode ? 60 : 12)} more</span>
              )}
            </div>
          )}
        </ResultCard>
      </div>

      {proMode && pdns.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Passive DNS records (${pdns.length})`} />
          <div className="mt-3"><JsonBlock data={pdns} /></div>
        </ResultCard>
      )}
    </div>
  );
}

// ─── Analysis / Threats / Sources / Raw ───────────────────────────────────────

function AnalysisSection({ vtData, proMode }: { vtData: any; proMode: boolean }) {
  if (!vtData) {
    return <ResultCard><div className="text-sm" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>No VirusTotal page analysis available for this URL.</div></ResultCard>;
  }
  const headers = vtData.last_http_response_headers ? Object.entries(vtData.last_http_response_headers) : [];
  const meta = vtData.html_meta ? Object.entries(vtData.html_meta as Record<string, string[]>) : [];
  return (
    <div className="space-y-4">
      <ResultCard>
        <SectionHeader icon={<Code className="w-4 h-4" />} title="Page analysis (VirusTotal)" />
        <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-3">
          <Field label="Final URL" value={vtData.last_final_url || 'Unknown'} mono className="col-span-2" />
          <Field label="HTTP response code" value={vtData.last_http_response_code || 'Unknown'} tone={vtData.last_http_response_code === 200 ? 'good' : vtData.last_http_response_code ? 'warn' : 'neutral'} />
          <Field label="Content length" value={vtData.last_http_response_content_length ? `${vtData.last_http_response_content_length} bytes` : 'Unknown'} />
          <Field label="Page title" value={vtData.title || 'Unknown'} className="col-span-2" />
          {vtData.last_http_response_content_sha256 && <Field label="Content SHA-256" value={vtData.last_http_response_content_sha256} mono className="col-span-2" />}
          {vtData.last_analysis_date && <Field label="Last analysed" value={new Date(vtData.last_analysis_date * 1000).toLocaleString()} />}
          {vtData.times_submitted != null && <Field label="Times submitted" value={vtData.times_submitted} />}
        </div>
      </ResultCard>

      {proMode && headers.length > 0 && (
        <ResultCard>
          <SectionHeader title={`HTTP response headers (${headers.length})`} />
          <div className="mt-3 divide-y" style={{ borderColor: palette.borderSubtle }}>
            {headers.map(([key, value]) => (
              <div key={key} className="py-2 grid grid-cols-[minmax(120px,1fr)_2fr] gap-3">
                <span className="text-xs break-all" style={{ color: palette.accent, fontFamily: typography.mono }}>{key}</span>
                <span className="text-xs break-all" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </ResultCard>
      )}

      {meta.length > 0 && (
        <ResultCard>
          <SectionHeader title="Meta tags" />
          <div className="grid grid-cols-1 gap-3 mt-3">
            {meta.map(([key, values]) => (
              <Field key={key} label={key} value={Array.isArray(values) ? values.join(' · ') : String(values)} mono={key === 'viewport'} />
            ))}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

function ThreatsSection({ vtData, sources, proMode }: { vtData: any; sources: Record<string, NormalisedSource>; proMode: boolean }) {
  const engines = Object.entries(vtData?.last_analysis_results || {}) as [string, any][];
  const malicious = engines.filter(([, r]) => r.category === 'malicious');
  const suspicious = engines.filter(([, r]) => r.category === 'suspicious');
  const stats = vtData?.last_analysis_stats;
  const feedHits = (['urlhaus', 'phishtank', 'openphish', 'google_safebrowsing'] as const).filter(k => sources[k]?.malicious);

  return (
    <div className="space-y-4">
      {feedHits.length > 0 && (
        <Callout icon={<AlertTriangle className="w-4 h-4" />} tone="danger" title={`Listed on ${feedHits.length} threat feed${feedHits.length > 1 ? 's' : ''}`} detail={feedHits.join(', ')}>
          {proMode && (
            <div className="mt-3 space-y-2">
              {feedHits.map(k => <JsonBlock key={k} data={sources[k].details} maxHeight="10rem" />)}
            </div>
          )}
        </Callout>
      )}

      <ResultCard>
        <SectionHeader icon={<Shield className="w-4 h-4" />} title="VirusTotal engines" />
        {stats ? (
          <div className="grid grid-cols-4 gap-2 mt-3">
            <StatCell label="Malicious" value={stats.malicious || 0} tone={(stats.malicious || 0) > 0 ? 'danger' : 'neutral'} />
            <StatCell label="Suspicious" value={stats.suspicious || 0} tone={(stats.suspicious || 0) > 0 ? 'warn' : 'neutral'} />
            <StatCell label="Harmless" value={stats.harmless || 0} />
            <StatCell label="Undetected" value={stats.undetected || 0} />
          </div>
        ) : (
          <div className="text-sm mt-3" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
            {sources.virustotal?.error ? (isKeyError(sources.virustotal.error) ? 'VirusTotal key not configured.' : `VirusTotal error: ${sources.virustotal.error}`) : 'No VirusTotal analysis for this URL.'}
          </div>
        )}
      </ResultCard>

      {malicious.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Malicious detections (${malicious.length})`} />
          <div className="mt-3 divide-y max-h-96 overflow-y-auto" style={{ borderColor: palette.borderSubtle }}>
            {malicious.slice(0, proMode ? undefined : 10).map(([engine, r]) => (
              <EngineRow key={engine} engine={engine} result={r.result} tone="danger" />
            ))}
          </div>
        </ResultCard>
      )}

      {proMode && suspicious.length > 0 && (
        <ResultCard>
          <SectionHeader title={`Suspicious detections (${suspicious.length})`} />
          <div className="mt-3 divide-y" style={{ borderColor: palette.borderSubtle }}>
            {suspicious.map(([engine, r]) => <EngineRow key={engine} engine={engine} result={r.result} tone="warn" />)}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

function EngineRow({ engine, result, tone }: { engine: string; result?: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2" style={{ borderColor: palette.borderSubtle }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>{engine}</div>
        {result && <div className="text-xs" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>{result}</div>}
      </div>
      <Pill label={tone === 'danger' ? 'Detected' : 'Suspicious'} tone={tone} />
    </div>
  );
}

function SourcesSection({ sources, proMode }: { sources: Record<string, NormalisedSource>; proMode: boolean }) {
  const keys = Object.keys(sources);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(keys));
  const toggle = (k: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Database className="w-4 h-4" />} title={`Individual sources (${keys.length})`} />
      <div className="space-y-2">
        {keys.map(key => {
          const src = sources[key];
          const status = sourceStatus(src);
          const isOpen = expanded.has(key);
          const hasError = !!src?.error;
          return (
            <div
              key={key}
              className="rounded-lg overflow-hidden"
              style={{ background: hasError && !isKeyError(src.error) ? `${palette.rose}0d` : palette.base, border: `1px solid ${hasError && !isKeyError(src.error) ? `${palette.rose}40` : palette.borderDefault}` }}
            >
              <button onClick={() => toggle(key)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left" title={src?.error || undefined}>
                <span className="text-sm font-semibold truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>{key}</span>
                <Pill label={status.label} tone={status.tone} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-2">
                  {src?.error && <div className="text-xs" style={{ color: isKeyError(src.error) ? palette.amber : palette.rose, fontFamily: typography.ui }}>{src.error}</div>}
                  {status.detail && !src?.error && <div className="text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>{status.detail}</div>}
                  {proMode && !src?.error && <JsonBlock data={src.details} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RawJsonSection({ data }: { data: unknown }) {
  return (
    <div className="space-y-3">
      <SectionHeader icon={<FileJson className="w-4 h-4" />} title="Raw JSON" actions={<SummaryActions getSummary={() => JSON.stringify(data, null, 2)} getJson={() => data} />} />
      <JsonBlock data={data} maxHeight="70vh" />
    </div>
  );
}
