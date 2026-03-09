import { useState, useCallback } from 'react';
import {
  Search, Globe, Hash, Link, Shield, AlertTriangle, Check,
  Loader2, ChevronDown, ChevronUp, ExternalLink, Zap, Copy
} from 'lucide-react';
import { lookupIP, lookupDomain, scanURL, lookupHash } from '../../lib/threatIntel';

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

function getThreatColor(score: number | undefined, isMalicious: boolean | undefined) {
  if (isMalicious) return 'red';
  if (score === undefined) return 'slate';
  if (score >= 75) return 'red';
  if (score >= 50) return 'orange';
  if (score >= 25) return 'yellow';
  return 'green';
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

  if (iocs.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        No indicators of compromise detected
      </div>
    );
  }

  const safeIOCs = iocs.filter(ioc =>
    classifyIOCType(ioc.ioc_type) === 'domain' && isSafeDomain(ioc.ioc_value)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {enrichedCount > 0 && (
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-slate-700 text-slate-300">
                {enrichedCount}/{scannableIOCs.length} enriched
              </span>
              {maliciousCount > 0 && (
                <span className="px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                  {maliciousCount} malicious
                </span>
              )}
              {highThreatCount > 0 && highThreatCount !== maliciousCount && (
                <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  {highThreatCount} suspicious
                </span>
              )}
            </div>
          )}
        </div>
        {scannableIOCs.length > 0 && (
          <button
            onClick={scanAll}
            disabled={scanningAll}
            className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-cyan-500/30 disabled:opacity-50"
          >
            {scanningAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enriching...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Enrich All ({scannableIOCs.length})
              </>
            )}
          </button>
        )}
      </div>

      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase w-24">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Value</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Source</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase w-24">Threat</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase w-28">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {iocs.map((ioc) => {
              const Icon = getTypeIcon(ioc.ioc_type);
              const enrichment = results[ioc.id];
              const isExpanded = expandedRows.has(ioc.id);
              const type = classifyIOCType(ioc.ioc_type);
              const isSafe = type === 'domain' && isSafeDomain(ioc.ioc_value);
              const canScan = type !== 'unknown' && !isSafe;
              const color = enrichment?.status === 'done'
                ? getThreatColor(enrichment.threatScore, enrichment.isMalicious)
                : 'slate';

              return (
                <tr key={ioc.id} className="group">
                  <td colSpan={5} className="p-0">
                    <div
                      className={`hover:bg-slate-800/50 transition-colors ${
                        enrichment?.isMalicious ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <div className="flex items-center px-4 py-3">
                        <div className="w-24 flex-shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded font-medium">
                            <Icon className="w-3 h-3" />
                            {ioc.ioc_type}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-300 font-mono break-all">
                              {ioc.ioc_value}
                            </span>
                            <button
                              onClick={() => copyValue(ioc.id, ioc.ioc_value)}
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-700 rounded"
                              title="Copy"
                            >
                              {copiedId === ioc.id ? (
                                <Check className="w-3 h-3 text-green-400" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-400" />
                              )}
                            </button>
                          </div>
                          {isSafe && (
                            <span className="text-xs text-slate-500 mt-0.5 block">Known safe infrastructure</span>
                          )}
                        </div>
                        <div className="flex-shrink-0 px-4 text-sm text-slate-400">
                          {ioc.source_file}
                        </div>
                        <div className="w-24 flex-shrink-0">
                          {enrichment?.status === 'done' && (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-${color}-500/20 text-${color}-400 border border-${color}-500/30`}>
                              {enrichment.isMalicious ? (
                                <AlertTriangle className="w-3 h-3" />
                              ) : (
                                <Shield className="w-3 h-3" />
                              )}
                              {enrichment.threatScore}/100
                            </span>
                          )}
                          {enrichment?.status === 'loading' && (
                            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          )}
                          {enrichment?.status === 'error' && (
                            <span className="text-xs text-red-400">Failed</span>
                          )}
                        </div>
                        <div className="w-28 flex-shrink-0 flex justify-end gap-1">
                          {canScan && (
                            <>
                              {enrichment?.status === 'done' ? (
                                <button
                                  onClick={() => toggleRow(ioc.id)}
                                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors flex items-center gap-1"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                  Details
                                </button>
                              ) : (
                                <button
                                  onClick={() => scanIOC(ioc)}
                                  disabled={enrichment?.status === 'loading' || scanningAll}
                                  className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-medium rounded transition-colors flex items-center gap-1 disabled:opacity-50"
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
        <div className="text-xs text-slate-500 flex items-center gap-1.5">
          <Shield className="w-3 h-3" />
          {safeIOCs.length} IOC{safeIOCs.length > 1 ? 's' : ''} skipped (known safe infrastructure like Google, Mozilla, CDNs)
        </div>
      )}
    </div>
  );
}

function EnrichmentDetails({ ioc, enrichment }: { ioc: IOC; enrichment: EnrichmentResult }) {
  const type = classifyIOCType(ioc.ioc_type);
  const color = getThreatColor(enrichment.threatScore, enrichment.isMalicious);
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg bg-${color}-500/20 border border-${color}-500/30 flex items-center justify-center`}>
              <span className={`text-lg font-bold text-${color}-400`}>
                {enrichment.threatScore ?? '?'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold text-${color}-400`}>
                  {enrichment.isMalicious ? 'Malicious' : (enrichment.threatScore ?? 0) >= 50 ? 'Suspicious' : 'Clean'}
                </span>
                <span className="text-xs text-slate-500 uppercase">{type}</span>
              </div>
              <p className="text-sm text-slate-300 mt-0.5">{enrichment.summary}</p>
            </div>
          </div>
        </div>

        {enrichment.sources && enrichment.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {enrichment.sources.map(source => (
              <span
                key={source}
                className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded font-medium"
              >
                {formatSourceName(source)}
              </span>
            ))}
          </div>
        )}

        {type === 'ip' && enrichment.details && <IPDetails data={enrichment.details} />}
        {type === 'domain' && enrichment.details && <DomainDetails data={enrichment.details} />}
        {type === 'hash' && enrichment.details && <HashDetails data={enrichment.details} />}
        {type === 'url' && enrichment.details && <URLDetails data={enrichment.details} />}

        <button
          onClick={() => setShowRaw(!showRaw)}
          className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
        >
          {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Raw JSON
        </button>
        {showRaw && (
          <pre className="mt-2 p-3 bg-slate-900 rounded text-xs text-slate-400 overflow-x-auto max-h-64 overflow-y-auto">
            {JSON.stringify(enrichment.details, null, 2)}
          </pre>
        )}
      </div>
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
    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
      {e.country && (
        <div className="flex justify-between">
          <span className="text-slate-400">Location</span>
          <span className="text-white">{[e.city, e.region, e.country].filter(Boolean).join(', ')}</span>
        </div>
      )}
      {e.isp && (
        <div className="flex justify-between">
          <span className="text-slate-400">ISP</span>
          <span className="text-white truncate ml-2">{e.isp}</span>
        </div>
      )}
      {e.org && (
        <div className="flex justify-between">
          <span className="text-slate-400">Org</span>
          <span className="text-white truncate ml-2">{e.org}</span>
        </div>
      )}
      {e.asn && (
        <div className="flex justify-between">
          <span className="text-slate-400">ASN</span>
          <span className="text-white font-mono">{e.asn}</span>
        </div>
      )}
      {flags.length > 0 && (
        <div className="col-span-2 flex flex-wrap gap-1.5 mt-1">
          {flags.map(f => (
            <span key={f} className="px-2 py-0.5 bg-red-500/15 text-red-300 text-xs rounded border border-red-500/20">
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
    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
      {w.registrar && (
        <div className="flex justify-between">
          <span className="text-slate-400">Registrar</span>
          <span className="text-white truncate ml-2">{w.registrar}</span>
        </div>
      )}
      {w.registrationDate && (
        <div className="flex justify-between">
          <span className="text-slate-400">Registered</span>
          <span className="text-white">{new Date(w.registrationDate).toLocaleDateString()}</span>
        </div>
      )}
      {w.domainAge !== undefined && (
        <div className="flex justify-between">
          <span className="text-slate-400">Age</span>
          <span className="text-white">{w.domainAge} days</span>
        </div>
      )}
      {w.nameservers?.length > 0 && (
        <div className="flex justify-between">
          <span className="text-slate-400">Nameservers</span>
          <span className="text-white text-xs font-mono truncate ml-2">{w.nameservers.slice(0, 2).join(', ')}</span>
        </div>
      )}
      {data.reputation !== undefined && data.reputation !== null && (
        <div className="flex justify-between">
          <span className="text-slate-400">VT Reputation</span>
          <span className={`font-semibold ${data.reputation < 0 ? 'text-red-400' : 'text-green-400'}`}>
            {data.reputation}
          </span>
        </div>
      )}
    </div>
  );
}

function HashDetails({ data }: { data: any }) {
  const vt = data.detections?.virustotal;
  const mb = data.detections?.malwarebazaar;
  const ha = data.detections?.hybrid_analysis;

  return (
    <div className="space-y-2 text-sm">
      {vt && (
        <div className="flex items-center gap-4">
          <span className="text-slate-400 w-28 flex-shrink-0">VirusTotal</span>
          <span className={`font-semibold ${vt.malicious > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {vt.malicious}/{vt.total} detections
          </span>
          {vt.file_type && <span className="text-slate-500 text-xs">{vt.file_type}</span>}
        </div>
      )}
      {mb?.signature && (
        <div className="flex items-center gap-4">
          <span className="text-slate-400 w-28 flex-shrink-0">MalwareBazaar</span>
          <span className="text-red-400 font-semibold">{mb.signature}</span>
        </div>
      )}
      {ha?.verdict && (
        <div className="flex items-center gap-4">
          <span className="text-slate-400 w-28 flex-shrink-0">Hybrid Analysis</span>
          <span className={`font-semibold ${ha.verdict === 'malicious' ? 'text-red-400' : 'text-slate-300'}`}>
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
    <div className="space-y-2 text-sm">
      {data.threatTypes?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.threatTypes.map((t: string) => (
            <span key={t} className="px-2 py-0.5 bg-red-500/15 text-red-300 text-xs rounded border border-red-500/20">
              {t}
            </span>
          ))}
        </div>
      )}
      {Object.entries(results).map(([source, val]: [string, any]) => (
        val?.found && (
          <div key={source} className="flex items-center gap-4">
            <span className="text-slate-400 w-28 flex-shrink-0">{formatSourceName(source)}</span>
            <span className={`font-semibold ${val.malicious ? 'text-red-400' : 'text-green-400'}`}>
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
