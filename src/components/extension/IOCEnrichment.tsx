import { useState, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Search, Globe, Hash, Link, Shield, AlertTriangle, Check,
  Loader2, ChevronDown, ChevronUp, Zap, Copy
} from 'lucide-react';
import { lookupIP, lookupDomain, scanURL, lookupHash } from '../../lib/threatIntel';
import { palette, typography } from '../../design-system/tokens';
import { Pill, cardStyle, type Tone } from '../../components/results';
import {
  threatTone, threatLabel, toneColor, toneBg, toneBorder, chipStyle,
  primaryButtonStyle, secondaryButtonStyle, disabledButtonStyle, codeBlockStyle,
} from './extensionTones';

interface IOC {
  id: string;
  ioc_type: string;
  ioc_value: string;
  source_file: string;
  context: string;
}

interface EnrichmentResult {
  status: 'idle' | 'loading' | 'done' | 'error';
  threatScore?: number;
  isMalicious?: boolean;
  summary?: string;
  details?: Record<string, any>;
  error?: string;
  sources?: string[];
}

interface IOCEnrichmentProps {
  iocs: IOC[];
}

const KNOWN_SAFE_DOMAINS = new Set([
  'chrome.google.com',
  'chromewebstore.google.com',
  'developer.chrome.com',
  'googleapis.com',
  'google.com',
  'gstatic.com',
  'chromium.org',
  'mozilla.org',
  'w3.org',
  'github.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

function isSafeDomain(value: string): boolean {
  const lower = value.toLowerCase();
  for (const safe of KNOWN_SAFE_DOMAINS) {
    if (lower === safe || lower.endsWith('.' + safe)) return true;
  }
  return false;
}

function classifyIOCType(iocType: string): 'ip' | 'domain' | 'url' | 'hash' | 'unknown' {
  const t = iocType.toLowerCase();
  if (t === 'ip' || t === 'ipv4' || t === 'ipv6' || t === 'ip_address') return 'ip';
  if (t === 'domain' || t === 'hostname') return 'domain';
  if (t === 'url' || t === 'uri') return 'url';
  if (t === 'hash' || t === 'md5' || t === 'sha1' || t === 'sha256' || t === 'file_hash') return 'hash';
  return 'unknown';
}

function getTypeIcon(type: string) {
  switch (classifyIOCType(type)) {
    case 'ip': return Globe;
    case 'domain': return Globe;
    case 'url': return Link;
    case 'hash': return Hash;
    default: return Shield;
  }
}

function summarizeIPResult(data: any): { summary: string; sources: string[] } {
  const parts: string[] = [];
  const sources: string[] = [];

  if (data.enrichment?.country) parts.push(data.enrichment.country);
  if (data.enrichment?.org) parts.push(data.enrichment.org);
  if (data.enrichment?.isVPN) parts.push('VPN');
  if (data.enrichment?.isTor) parts.push('Tor');
  if (data.enrichment?.isProxy) parts.push('Proxy');
  if (data.enrichment?.isHosting) parts.push('Hosting');
  if (data.enrichment?.spamhausListed) parts.push('Spamhaus listed');

  if (data.results) {
    for (const [key, val] of Object.entries(data.results)) {
      if ((val as any)?.data && !(val as any)?.error) sources.push(key);
    }
  }

  return {
    summary: parts.length ? parts.join(' | ') : 'No notable flags',
    sources,
  };
}

function summarizeDomainResult(data: any): { summary: string; sources: string[] } {
  const parts: string[] = [];
  const sources: string[] = [];

  if (data.whois?.registrar) parts.push(`Registrar: ${data.whois.registrar}`);
  if (data.whois?.domainAge !== undefined) {
    parts.push(`Age: ${data.whois.domainAge}d`);
  }
  if (data.reputation !== undefined && data.reputation !== null) {
    parts.push(`Reputation: ${data.reputation}`);
  }

  if (data.sources) {
    for (const [key, val] of Object.entries(data.sources)) {
      if ((val as any)?.found) sources.push(key);
    }
  }

  return {
    summary: parts.length ? parts.join(' | ') : 'No notable findings',
    sources,
  };
}

function summarizeURLResult(data: any): { summary: string; sources: string[] } {
  const parts: string[] = [];
  const sources: string[] = [];

  if (data.threatTypes?.length) parts.push(`Threats: ${data.threatTypes.join(', ')}`);
  if (data.isMalicious) parts.push('Flagged malicious');

  if (data.results) {
    for (const [key, val] of Object.entries(data.results)) {
      if ((val as any)?.found) sources.push(key);
    }
  }

  return {
    summary: parts.length ? parts.join(' | ') : 'No threats detected',
    sources,
  };
}

function summarizeHashResult(data: any): { summary: string; sources: string[] } {
  const parts: string[] = [];
  const sources: string[] = [];

  const vt = data.detections?.virustotal;
  if (vt) {
    parts.push(`VT: ${vt.malicious}/${vt.total} detections`);
    if (vt.file_type) parts.push(vt.file_type);
    sources.push('virustotal');
  }
  const mb = data.detections?.malwarebazaar;
  if (mb?.signature) {
    parts.push(`MalwareBazaar: ${mb.signature}`);
    sources.push('malwarebazaar');
  }
  const ha = data.detections?.hybrid_analysis;
  if (ha?.verdict) {
    parts.push(`HA: ${ha.verdict}`);
    sources.push('hybrid_analysis');
  }

  if (data.sources) {
    for (const [key, val] of Object.entries(data.sources)) {
      if ((val as any)?.checked && !sources.includes(key)) sources.push(key);
    }
  }

  return {
    summary: parts.length ? parts.join(' | ') : 'Not found in threat databases',
    sources,
  };
}

const HEADER_CELL: CSSProperties = {
  color: palette.textTertiary,
  fontFamily: typography.ui,
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.02em',
};

export default function IOCEnrichment({ iocs }: IOCEnrichmentProps) {
  const [results, setResults] = useState<Record<string, EnrichmentResult>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [scanningAll, setScanningAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scannableIOCs = iocs.filter(ioc => {
    const type = classifyIOCType(ioc.ioc_type);
    if (type === 'unknown') return false;
    if (type === 'domain' && isSafeDomain(ioc.ioc_value)) return false;
    return true;
  });

  const scanIOC = useCallback(async (ioc: IOC) => {
    const type = classifyIOCType(ioc.ioc_type);
    if (type === 'unknown') return;

    setResults(prev => ({
      ...prev,
      [ioc.id]: { status: 'loading' },
    }));

    try {
      let data: any;
      let summary = '';
      let sources: string[] = [];
      let threatScore = 0;
      let isMalicious = false;

      switch (type) {
        case 'ip': {
          data = await lookupIP(ioc.ioc_value);
          threatScore = data.overallThreatScore ?? data.maxThreatScore ?? 0;
          isMalicious = data.isMalicious ?? false;
          const ipSummary = summarizeIPResult(data);
          summary = ipSummary.summary;
          sources = ipSummary.sources;
          break;
        }
        case 'domain': {
          data = await lookupDomain(ioc.ioc_value);
          threatScore = data.overallThreatScore ?? data.maxThreatScore ?? 0;
          isMalicious = data.isMalicious ?? false;
          const domainSummary = summarizeDomainResult(data);
          summary = domainSummary.summary;
          sources = domainSummary.sources;
          break;
        }
        case 'url': {
          data = await scanURL(ioc.ioc_value);
          threatScore = (data as any).overallThreatScore ?? 0;
          isMalicious = data.isMalicious ?? false;
          const urlSummary = summarizeURLResult(data);
          summary = urlSummary.summary;
          sources = urlSummary.sources;
          break;
        }
        case 'hash': {
          data = await lookupHash(ioc.ioc_value);
          threatScore = data.overallThreatScore ?? data.maxThreatScore ?? 0;
          isMalicious = data.isMalicious ?? false;
          const hashSummary = summarizeHashResult(data);
          summary = hashSummary.summary;
          sources = hashSummary.sources;
          break;
        }
      }

      setResults(prev => ({
        ...prev,
        [ioc.id]: {
          status: 'done',
          threatScore,
          isMalicious,
          summary,
          details: data,
          sources,
        },
      }));
    } catch (err: any) {
      setResults(prev => ({
        ...prev,
        [ioc.id]: {
          status: 'error',
          error: err.message || 'Enrichment failed',
        },
      }));
    }
  }, []);

  const scanAll = async () => {
    setScanningAll(true);
    const toScan = scannableIOCs.filter(ioc => {
      const r = results[ioc.id];
      return !r || r.status === 'idle' || r.status === 'error';
    });

    for (const ioc of toScan) {
      await scanIOC(ioc);
      await new Promise(r => setTimeout(r, 300));
    }
    setScanningAll(false);
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyValue = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const enrichedCount = Object.values(results).filter(r => r.status === 'done').length;
  const maliciousCount = Object.values(results).filter(r => r.isMalicious).length;
  const highThreatCount = Object.values(results).filter(r => (r.threatScore ?? 0) >= 50).length;
  const errorCount = Object.values(results).filter(r => r.status === 'error').length;

  if (iocs.length === 0) {
    return (
      <div className="text-center py-8 text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
        No indicators of compromise detected
      </div>
    );
  }

  const safeIOCs = iocs.filter(ioc =>
    classifyIOCType(ioc.ioc_type) === 'domain' && isSafeDomain(ioc.ioc_value)
  );

  return (
    <div className="space-y-3" style={{ fontFamily: typography.ui }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {enrichedCount > 0 && (
            <Pill label={`${enrichedCount}/${scannableIOCs.length} enriched`} tone="neutral" />
          )}
          {maliciousCount > 0 && <Pill label={`${maliciousCount} malicious`} tone="danger" />}
          {highThreatCount > 0 && highThreatCount !== maliciousCount && (
            <Pill label={`${highThreatCount} suspicious`} tone="warn" />
          )}
          {errorCount > 0 && <Pill label={`${errorCount} failed`} tone="warn" />}
        </div>
        {scannableIOCs.length > 0 && (
          <button
            onClick={scanAll}
            disabled={scanningAll}
            className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors hover:brightness-110 flex items-center gap-1.5"
            style={scanningAll ? disabledButtonStyle : primaryButtonStyle}
          >
            {scanningAll ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Enriching…
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                Enrich all ({scannableIOCs.length})
              </>
            )}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg" style={{ border: `1px solid ${palette.borderDefault}` }}>
        <table className="w-full">
          <thead style={{ background: palette.elevated }}>
            <tr>
              <th className="px-4 py-2.5 text-left w-24" style={HEADER_CELL}>Type</th>
              <th className="px-4 py-2.5 text-left" style={HEADER_CELL}>Value</th>
              <th className="px-4 py-2.5 text-left" style={HEADER_CELL}>Source</th>
              <th className="px-4 py-2.5 text-left w-24" style={HEADER_CELL}>Threat</th>
              <th className="px-4 py-2.5 text-right w-28" style={HEADER_CELL}>Action</th>
            </tr>
          </thead>
          <tbody>
            {iocs.map((ioc, rowIdx) => {
              const Icon = getTypeIcon(ioc.ioc_type);
              const enrichment = results[ioc.id];
              const isExpanded = expandedRows.has(ioc.id);
              const type = classifyIOCType(ioc.ioc_type);
              const isSafe = type === 'domain' && isSafeDomain(ioc.ioc_value);
              const canScan = type !== 'unknown' && !isSafe;
              const hasSources = (enrichment?.sources?.length ?? 0) > 0;
              const tone: Tone = enrichment?.status === 'done'
                ? threatTone(enrichment.threatScore, enrichment.isMalicious, hasSources)
                : 'neutral';

              return (
                <tr key={ioc.id} className="group">
                  <td colSpan={5} className="p-0" style={{ borderTop: rowIdx === 0 ? `1px solid ${palette.borderDefault}` : `1px solid ${palette.borderSubtle}` }}>
                    <div
                      className="transition-colors"
                      style={{ background: enrichment?.isMalicious ? toneBg('danger', 0.05) : palette.base }}
                    >
                      <div className="flex items-center px-4 py-2.5">
                        <div className="w-24 shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded" style={chipStyle('neutral')}>
                            <Icon className="w-3 h-3" />
                            {ioc.ioc_type}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>
                              {ioc.ioc_value}
                            </span>
                            <button
                              onClick={() => copyValue(ioc.id, ioc.ioc_value)}
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                              style={{ color: copiedId === ioc.id ? palette.green : palette.textTertiary }}
                              title="Copy"
                            >
                              {copiedId === ioc.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          {isSafe && (
                            <span className="text-[11px] mt-0.5 block" style={{ color: palette.textTertiary }}>Known safe infrastructure</span>
                          )}
                        </div>
                        <div
                          className="shrink-0 px-4 text-xs max-w-[140px] truncate"
                          style={{ color: palette.textSecondary, fontFamily: typography.mono }}
                          title={ioc.source_file}
                        >
                          {ioc.source_file.split('/').pop()}
                        </div>
                        <div className="w-24 shrink-0">
                          {enrichment?.status === 'done' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums" style={chipStyle(tone)}>
                              {enrichment.isMalicious ? <AlertTriangle className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                              {enrichment.threatScore}/100
                            </span>
                          )}
                          {enrichment?.status === 'loading' && (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: palette.textTertiary }} />
                          )}
                          {enrichment?.status === 'error' && (
                            <span className="text-[11px]" style={{ color: palette.rose }} title={enrichment.error}>Failed</span>
                          )}
                        </div>
                        <div className="w-28 shrink-0 flex justify-end gap-1">
                          {canScan && (
                            <>
                              {enrichment?.status === 'done' ? (
                                <button
                                  onClick={() => toggleRow(ioc.id)}
                                  className="px-2 py-1 text-[11px] rounded-md transition-colors hover:brightness-125 flex items-center gap-1"
                                  style={secondaryButtonStyle}
                                >
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  Details
                                </button>
                              ) : (
                                <button
                                  onClick={() => scanIOC(ioc)}
                                  disabled={enrichment?.status === 'loading' || scanningAll}
                                  className="px-2 py-1 text-[11px] font-medium rounded-md transition-colors hover:brightness-125 flex items-center gap-1 disabled:opacity-50"
                                  style={secondaryButtonStyle}
                                >
                                  <Search className="w-3 h-3" />
                                  Scan
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {isExpanded && enrichment?.status === 'done' && (
                        <div className="px-4 pb-4">
                          <EnrichmentDetails
                            ioc={ioc}
                            enrichment={enrichment}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {safeIOCs.length > 0 && (
        <div className="text-[11px] flex items-center gap-1.5" style={{ color: palette.textTertiary }}>
          <Shield className="w-3 h-3" />
          {safeIOCs.length} IOC{safeIOCs.length > 1 ? 's' : ''} skipped (known safe infrastructure like Google, Mozilla, CDNs)
        </div>
      )}
    </div>
  );
}

function EnrichmentDetails({ ioc, enrichment }: { ioc: IOC; enrichment: EnrichmentResult }) {
  const type = classifyIOCType(ioc.ioc_type);
  const hasSources = (enrichment.sources?.length ?? 0) > 0;
  const tone = threatTone(enrichment.threatScore, enrichment.isMalicious, hasSources);
  const toneText = tone === 'neutral' ? palette.textSecondary : toneColor[tone];
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="overflow-hidden" style={cardStyle}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: toneBg(tone, 0.12), border: `1px solid ${toneBorder(tone)}` }}
            >
              <span className="text-base font-semibold tabular-nums" style={{ color: toneText, fontFamily: typography.ui }}>
                {enrichment.threatScore ?? '?'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: toneText }}>
                  {threatLabel(enrichment.threatScore, enrichment.isMalicious, hasSources)}
                </span>
                <span className="text-[11px]" style={{ color: palette.textTertiary }}>{type}</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: palette.textSecondary }}>{enrichment.summary}</p>
            </div>
          </div>
        </div>

        {hasSources ? (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {enrichment.sources!.map(source => (
              <span key={source} className="px-2 py-0.5 text-[11px] rounded" style={chipStyle('neutral')}>
                {formatSourceName(source)}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[11px] mb-3" style={{ color: palette.textTertiary }}>
            No source returned data for this indicator — score is not a verified clean result.
          </div>
        )}

        {type === 'ip' && enrichment.details && <IPDetails data={enrichment.details} />}
        {type === 'domain' && enrichment.details && <DomainDetails data={enrichment.details} />}
        {type === 'hash' && enrichment.details && <HashDetails data={enrichment.details} />}
        {type === 'url' && enrichment.details && <URLDetails data={enrichment.details} />}

        <button
          onClick={() => setShowRaw(!showRaw)}
          className="mt-3 text-[11px] transition-colors hover:brightness-125 flex items-center gap-1"
          style={{ color: palette.textTertiary }}
        >
          {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Raw JSON
        </button>
        {showRaw && (
          <pre className="mt-2 p-3 overflow-auto max-h-64" style={codeBlockStyle}>
            {JSON.stringify(enrichment.details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false, color }: { label: string; value: ReactNode; mono?: boolean; color?: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span style={{ color: palette.textTertiary }}>{label}</span>
      <span
        className="truncate text-right"
        style={{ color: color || palette.textPrimary, fontFamily: mono ? typography.mono : typography.ui }}
      >
        {value}
      </span>
    </div>
  );
}

function IPDetails({ data }: { data: any }) {
  const e = data.enrichment || {};
  const flags: string[] = [];
  if (e.isVPN) flags.push('VPN');
  if (e.isTor) flags.push('Tor Exit Node');
  if (e.isProxy) flags.push('Proxy');
  if (e.isHosting) flags.push('Hosting/DC');
  if (e.isBot) flags.push('Bot');
  if (e.isMassScanner) flags.push('Mass Scanner');
  if (e.spamhausListed) flags.push('Spamhaus');

  return (
    <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-8 gap-y-1.5">
      {e.country && <DetailRow label="Location" value={[e.city, e.region, e.country].filter(Boolean).join(', ')} />}
      {e.isp && <DetailRow label="ISP" value={e.isp} />}
      {e.org && <DetailRow label="Org" value={e.org} />}
      {e.asn && <DetailRow label="ASN" value={e.asn} mono />}
      {flags.length > 0 && (
        <div className="col-span-full flex flex-wrap gap-1.5 mt-1">
          {flags.map(f => (
            <span key={f} className="px-2 py-0.5 text-[11px] rounded" style={chipStyle('warn')}>
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainDetails({ data }: { data: any }) {
  const w = data.whois || {};
  return (
    <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-8 gap-y-1.5">
      {w.registrar && <DetailRow label="Registrar" value={w.registrar} />}
      {w.registrationDate && <DetailRow label="Registered" value={new Date(w.registrationDate).toLocaleDateString()} />}
      {w.domainAge !== undefined && <DetailRow label="Age" value={`${w.domainAge} days`} />}
      {w.nameservers?.length > 0 && <DetailRow label="Nameservers" value={w.nameservers.slice(0, 2).join(', ')} mono />}
      {data.reputation !== undefined && data.reputation !== null && (
        <DetailRow
          label="VT reputation"
          value={data.reputation}
          color={data.reputation < 0 ? palette.rose : palette.green}
        />
      )}
    </div>
  );
}

function HashDetails({ data }: { data: any }) {
  const vt = data.detections?.virustotal;
  const mb = data.detections?.malwarebazaar;
  const ha = data.detections?.hybrid_analysis;

  return (
    <div className="space-y-1.5 text-xs">
      {vt && (
        <div className="flex items-center gap-4">
          <span className="w-28 shrink-0" style={{ color: palette.textTertiary }}>VirusTotal</span>
          <span className="font-semibold tabular-nums" style={{ color: vt.malicious > 0 ? palette.rose : palette.green }}>
            {vt.malicious}/{vt.total} detections
          </span>
          {vt.file_type && <span className="text-[11px]" style={{ color: palette.textTertiary }}>{vt.file_type}</span>}
        </div>
      )}
      {mb?.signature && (
        <div className="flex items-center gap-4">
          <span className="w-28 shrink-0" style={{ color: palette.textTertiary }}>MalwareBazaar</span>
          <span className="font-semibold" style={{ color: palette.rose, fontFamily: typography.mono }}>{mb.signature}</span>
        </div>
      )}
      {ha?.verdict && (
        <div className="flex items-center gap-4">
          <span className="w-28 shrink-0" style={{ color: palette.textTertiary }}>Hybrid Analysis</span>
          <span className="font-semibold" style={{ color: ha.verdict === 'malicious' ? palette.rose : palette.textSecondary }}>
            {ha.verdict}
          </span>
        </div>
      )}
    </div>
  );
}

function URLDetails({ data }: { data: any }) {
  const results = data.results || {};
  return (
    <div className="space-y-1.5 text-xs">
      {data.threatTypes?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.threatTypes.map((t: string) => (
            <span key={t} className="px-2 py-0.5 text-[11px] rounded" style={chipStyle('danger')}>
              {t}
            </span>
          ))}
        </div>
      )}
      {Object.entries(results).map(([source, val]: [string, any]) => (
        val?.found && (
          <div key={source} className="flex items-center gap-4">
            <span className="w-28 shrink-0" style={{ color: palette.textTertiary }}>{formatSourceName(source)}</span>
            <span className="font-semibold" style={{ color: val.malicious ? palette.rose : palette.green }}>
              {val.malicious ? 'Flagged' : 'Clean'}
            </span>
          </div>
        )
      ))}
    </div>
  );
}

function formatSourceName(source: string): string {
  const map: Record<string, string> = {
    virustotal: 'VirusTotal',
    virustotal_hash: 'VirusTotal',
    virustotal_domain: 'VirusTotal',
    abuseipdb: 'AbuseIPDB',
    proxycheck: 'ProxyCheck',
    ipqualityscore: 'IPQualityScore',
    alienvault: 'AlienVault OTX',
    otx: 'AlienVault OTX',
    urlhaus: 'URLhaus',
    urlscan: 'urlscan.io',
    shodan: 'Shodan',
    greynoise: 'GreyNoise',
    threatfox: 'ThreatFox',
    malwarebazaar: 'MalwareBazaar',
    hybrid_analysis: 'Hybrid Analysis',
    whois: 'WHOIS/RDAP',
    rdap: 'RDAP',
    spamhaus: 'Spamhaus',
    ipapi: 'IP-API',
    ip2proxy: 'IP2Proxy',
    teoh: 'Teoh',
  };
  return map[source] || source;
}
