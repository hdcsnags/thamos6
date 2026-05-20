import { useState, useMemo } from 'react';
import { Mail, AlertTriangle, CheckCircle, XCircle, Copy, Check, GitBranch, FileText, List, Zap } from 'lucide-react';
import { useDesktop } from '../contexts/DesktopContext';
import { supabase } from '../lib/supabase';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  cyan: '#00d9ff',
  green: '#00ff9d',
  amber: '#fbbf24',
  pink: '#ff0080',
  rose: '#f43f5e',
};

interface AuthResult {
  status: 'pass' | 'fail' | 'none' | 'neutral';
  details: string;
}

interface HopInfo {
  from: string;
  by: string;
  with: string;
  timestamp: string;
}

interface ExtractedIOC {
  type: 'ip' | 'domain' | 'url' | 'email';
  value: string;
}

interface AnalysisResult {
  headers: {
    from: string;
    to: string;
    subject: string;
    date: string;
    messageId: string;
    returnPath: string;
    replyTo: string;
  };
  authentication: { spf: AuthResult; dkim: AuthResult; dmarc: AuthResult };
  hops: HopInfo[];
  originIP: string | null;
  suspiciousIndicators: string[];
  extractedIOCs: ExtractedIOC[];
  rawHeaders: Record<string, string>;
}

interface EnrichIOCItem {
  value: string;
  enrichment: any;
  isIDN?: boolean;
}

interface EnrichResult {
  iocs: {
    urls: EnrichIOCItem[];
    domains: Array<EnrichIOCItem & { isIDN: boolean }>;
    ips: EnrichIOCItem[];
    emails: EnrichIOCItem[];
  };
  summary: {
    totalScore: number;
    isMalicious: boolean;
    idnDomains: string[];
  };
}

type Tab = 'headers' | 'auth' | 'hops' | 'iocs' | 'raw';

function extractURLs(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"'\])}]+/gi;
  return [...new Set(text.match(urlRegex) || [])];
}

function extractIPs(text: string): string[] {
  const ipRegex = /\b(\d{1,3}\.){3}\d{1,3}\b/g;
  return [...new Set(text.match(ipRegex) || [])].filter(ip =>
    !ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.') && !ip.startsWith('0.')
  );
}

function extractEmails(text: string): string[] {
  const emailRegex = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;
  return [...new Set(text.match(emailRegex) || [])];
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

export default function EmailAnalyzer() {
  const { openWindow } = useDesktop();
  const [rawInput, setRawInput] = useState('');
  const [bodyInput, setBodyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('headers');
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);

  const enrichMap = useMemo(() => {
    const m = new Map<string, any>();
    if (!enrichResult) return m;
    for (const list of [
      enrichResult.iocs.urls,
      enrichResult.iocs.domains,
      enrichResult.iocs.ips,
      enrichResult.iocs.emails,
    ]) {
      for (const item of list) m.set(item.value, item.enrichment);
    }
    return m;
  }, [enrichResult]);

  const idnSet = useMemo(
    () => new Set(enrichResult?.summary.idnDomains ?? []),
    [enrichResult]
  );

  const parseAnalysis = (): AnalysisResult => {
    const raw = rawInput;
    const lines = raw.split(/\r?\n/);
    const headers: Record<string, string> = {};
    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      if (/^\s/.test(line) && currentKey) {
        currentValue += ' ' + line.trim();
      } else {
        if (currentKey) headers[currentKey.toLowerCase()] = currentValue;
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          currentKey = line.substring(0, colonIndex).trim();
          currentValue = line.substring(colonIndex + 1).trim();
        }
      }
    }
    if (currentKey) headers[currentKey.toLowerCase()] = currentValue;

    const authHeader = headers['authentication-results'] || '';
    const parseAuth = (key: string): AuthResult => {
      const m = authHeader.match(new RegExp(`${key}=(\\w+)`, 'i'));
      if (!m) return { status: 'none', details: 'Not found in headers' };
      const s = m[1].toLowerCase();
      return { status: s === 'pass' ? 'pass' : s === 'fail' ? 'fail' : 'neutral', details: `${key.toUpperCase()} ${s}` };
    };

    const hops: HopInfo[] = (raw.match(/^Received:[\s\S]*?(?=^[A-Za-z-]+:|$)/gim) || [])
      .map(r => ({
        from: (r.match(/from\s+([\w.\-]+)/i) || [])[1] || 'Unknown',
        by: (r.match(/by\s+([\w.\-]+)/i) || [])[1] || 'Unknown',
        with: (r.match(/with\s+(\w+)/i) || [])[1] || 'Unknown',
        timestamp: (r.match(/;\s*(.+)$/m) || [])[1]?.trim() || 'Unknown',
      }))
      .reverse();

    let originIP: string | null = null;
    for (const r of (raw.match(/^Received:[\s\S]*?(?=^[A-Za-z-]+:|$)/gim) || [])) {
      const m = r.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
      if (m && !m[1].startsWith('10.') && !m[1].startsWith('192.168.') && !m[1].startsWith('127.')) {
        originIP = m[1];
      }
    }

    const fromEmail = (headers['from'] || '').match(/<([^>]+)>|([^\s<>]+@[^\s<>]+)/)?.[1] || '';
    const returnEmail = (headers['return-path'] || '').match(/<([^>]+)>|([^\s<>]+@[^\s<>]+)/)?.[1] || '';
    const replyEmail = (headers['reply-to'] || '').match(/<([^>]+)>|([^\s<>]+@[^\s<>]+)/)?.[1] || '';

    const indicators: string[] = [];
    if (returnEmail && fromEmail.toLowerCase() !== returnEmail.toLowerCase()) indicators.push('Return-Path differs from From (possible spoofing)');
    if (replyEmail && fromEmail.toLowerCase() !== replyEmail.toLowerCase()) indicators.push('Reply-To differs from From address');
    if (authHeader.includes('spf=fail')) indicators.push('SPF authentication failed');
    if (authHeader.includes('dkim=fail')) indicators.push('DKIM signature failed');
    if (authHeader.includes('dmarc=fail')) indicators.push('DMARC policy check failed');
    const xMailer = headers['x-mailer'] || '';
    if (xMailer && /php|mass.?mail/i.test(xMailer)) indicators.push(`Suspicious X-Mailer: ${xMailer}`);

    const fullText = raw + '\n' + bodyInput;
    const iocs: ExtractedIOC[] = [];
    const seenValues = new Set<string>();

    const addIOC = (type: ExtractedIOC['type'], value: string) => {
      const v = value.trim();
      if (!v || seenValues.has(v)) return;
      seenValues.add(v);
      iocs.push({ type, value: v });
    };

    for (const url of extractURLs(fullText)) {
      addIOC('url', url);
      const domain = extractDomain(url);
      if (domain) addIOC('domain', domain);
    }
    for (const ip of extractIPs(fullText)) addIOC('ip', ip);
    for (const email of extractEmails(fullText)) addIOC('email', email);

    // Flag IDN/punycode domains locally
    for (const ioc of iocs) {
      if (ioc.type === 'domain' && ioc.value.split('.').some(l => l.startsWith('xn--'))) {
        indicators.push(`IDN/Punycode domain: ${ioc.value} (possible homoglyph attack)`);
      }
    }

    return {
      headers: {
        from: headers['from'] || '',
        to: headers['to'] || '',
        subject: headers['subject'] || '',
        date: headers['date'] || '',
        messageId: headers['message-id'] || '',
        returnPath: headers['return-path'] || '',
        replyTo: headers['reply-to'] || '',
      },
      authentication: { spf: parseAuth('spf'), dkim: parseAuth('dkim'), dmarc: parseAuth('dmarc') },
      hops,
      originIP,
      suspiciousIndicators: indicators,
      extractedIOCs: iocs,
      rawHeaders: headers,
    };
  };

  const handleAnalyze = () => {
    if (!rawInput.trim()) return;
    setLoading(true);
    setEnrichResult(null);
    setTimeout(() => {
      setResult(parseAnalysis());
      setLoading(false);
    }, 300);
  };

  const handleEnrich = async () => {
    if (!result || enrichLoading) return;
    setEnrichLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };
      if (session?.access_token) hdrs['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-email`,
        {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({ headers: rawInput, emailBody: bodyInput }),
        }
      );
      if (res.ok) setEnrichResult(await res.json());
    } catch {
      // local parse remains usable
    } finally {
      setEnrichLoading(false);
    }
  };

  const handleScanIOC = (ioc: ExtractedIOC) => {
    const appIdMap: Record<string, string> = {
      ip: 'ip-result', domain: 'domain-result', url: 'url-result', email: 'email-result',
    };
    openWindow({
      appId: appIdMap[ioc.type] as any,
      title: `${ioc.type.toUpperCase()}: ${ioc.value}`,
      data: { value: ioc.value },
    });
  };

  const AuthBadge = ({ r }: { r: AuthResult }) => {
    const color = r.status === 'pass' ? P.green : r.status === 'fail' ? P.rose : P.amber;
    const Icon = r.status === 'pass' ? CheckCircle : r.status === 'fail' ? XCircle : AlertTriangle;
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}>
        <Icon className="w-3 h-3" />
        {r.status.toUpperCase()}
      </span>
    );
  };

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'headers', label: 'Headers', icon: Mail },
    { id: 'auth', label: 'Auth', icon: CheckCircle },
    { id: 'hops', label: 'Hops', icon: GitBranch },
    { id: 'iocs', label: `IOCs${result ? ` (${result.extractedIOCs.length})` : ''}`, icon: List },
    { id: 'raw', label: 'Raw', icon: FileText },
  ];

  const IOC_COLOR: Record<string, string> = { ip: P.cyan, domain: P.green, url: '#ff0080', email: P.amber };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {!result ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4" style={{ color: P.cyan }} />
            <span className="text-sm font-medium tracking-wider" style={{ color: P.cyan }}>EMAIL HEADER ANALYZER</span>
          </div>

          <div>
            <label className="block text-xs tracking-wider mb-1.5" style={{ color: P.dim }}>RAW HEADERS (paste full email headers)</label>
            <textarea
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              rows={10}
              placeholder="Paste raw email headers here...&#10;&#10;Get headers from:&#10;- Gmail: More (⋮) → Show original&#10;- Outlook: File → Properties → Internet headers"
              className="w-full px-3 py-2 text-xs rounded focus:outline-none resize-none"
              style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>

          <div>
            <label className="block text-xs tracking-wider mb-1.5" style={{ color: P.dim }}>EMAIL BODY (optional — for URL/IOC extraction)</label>
            <textarea
              value={bodyInput}
              onChange={e => setBodyInput(e.target.value)}
              rows={6}
              placeholder="Paste email body here to extract URLs and IOCs..."
              className="w-full px-3 py-2 text-xs rounded focus:outline-none resize-none"
              style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !rawInput.trim()}
            className="w-full py-2.5 text-xs font-medium rounded transition-all"
            style={{
              backgroundColor: rawInput.trim() ? `${P.cyan}15` : P.surfaceLight,
              border: `1px solid ${rawInput.trim() ? `${P.cyan}40` : P.border}`,
              color: rawInput.trim() ? P.cyan : P.dim,
            }}
          >
            {loading ? 'ANALYZING...' : 'ANALYZE EMAIL'}
          </button>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex items-center px-3 shrink-0" style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}>
            <button
              onClick={() => setResult(null)}
              className="text-xs px-2 py-2.5 mr-3 transition-all"
              style={{ color: P.dim }}
            >
              ← Back
            </button>
            <div className="w-px h-4 mr-3" style={{ backgroundColor: P.border }} />
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs transition-all border-b-2"
                style={{
                  borderBottomColor: activeTab === t.id ? P.cyan : 'transparent',
                  color: activeTab === t.id ? P.cyan : P.dim,
                }}
              >
                <t.icon className="w-3 h-3" />
                {t.label}
              </button>
            ))}
            <div className="ml-auto">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(JSON.stringify(result, null, 2)).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded transition-all"
                style={{ color: P.dim, border: `1px solid ${P.border}` }}
              >
                {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Export</>}
              </button>
            </div>
          </div>

          {/* Suspicious indicators banner */}
          {result.suspiciousIndicators.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-2.5 shrink-0" style={{ backgroundColor: `${P.rose}10`, borderBottom: `1px solid ${P.rose}30` }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: P.rose }} />
              <div className="space-y-0.5">
                {result.suspiciousIndicators.map((ind, i) => (
                  <p key={i} className="text-xs" style={{ color: P.rose }}>{ind}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'headers' && (
              <div className="space-y-3">
                {[
                  { label: 'FROM', value: result.headers.from },
                  { label: 'TO', value: result.headers.to },
                  { label: 'SUBJECT', value: result.headers.subject },
                  { label: 'DATE', value: result.headers.date },
                  { label: 'RETURN-PATH', value: result.headers.returnPath },
                  { label: 'REPLY-TO', value: result.headers.replyTo },
                  { label: 'MESSAGE-ID', value: result.headers.messageId },
                  { label: 'ORIGIN IP', value: result.originIP || 'Could not determine' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-3 p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    <span className="text-xs flex-shrink-0 w-24" style={{ color: P.dim }}>{label}</span>
                    <code className="text-xs break-all" style={{ color: P.textLight }}>{value || 'N/A'}</code>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'auth' && (
              <div className="grid grid-cols-3 gap-3">
                {(['spf', 'dkim', 'dmarc'] as const).map(key => (
                  <div key={key} className="p-4 rounded space-y-2" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    <span className="text-xs tracking-wider font-bold" style={{ color: P.textLight }}>{key.toUpperCase()}</span>
                    <div><AuthBadge r={result.authentication[key]} /></div>
                    <p className="text-[10px]" style={{ color: P.dim }}>{result.authentication[key].details}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'hops' && (
              <div className="space-y-2">
                {result.hops.length === 0 && (
                  <p className="text-xs text-center py-8" style={{ color: P.dim }}>No routing hops found in headers</p>
                )}
                {result.hops.map((hop, i) => (
                  <div key={i} className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${P.cyan}15`, color: P.cyan }}>{i + 1}</span>
                      <span className="text-xs font-medium" style={{ color: P.textLight }}>{hop.by}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><span style={{ color: P.dim }}>FROM:</span> <code style={{ color: P.text }}>{hop.from}</code></div>
                      <div><span style={{ color: P.dim }}>PROTO:</span> <code style={{ color: P.text }}>{hop.with}</code></div>
                      <div><span style={{ color: P.dim }}>TIME:</span> <code style={{ color: P.text }}>{hop.timestamp}</code></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'iocs' && (
              <div className="space-y-2">
                {result.extractedIOCs.length > 0 && (
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px]" style={{ color: P.dim }}>
                      {result.extractedIOCs.length} IOC{result.extractedIOCs.length !== 1 ? 's' : ''} extracted
                      {enrichResult && (
                        <span className="ml-2" style={{ color: P.green }}>· enriched</span>
                      )}
                    </span>
                    <button
                      onClick={handleEnrich}
                      disabled={enrichLoading}
                      className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded transition-all"
                      style={{
                        backgroundColor: enrichResult ? `${P.green}15` : `${P.cyan}15`,
                        border: `1px solid ${enrichResult ? `${P.green}40` : `${P.cyan}40`}`,
                        color: enrichResult ? P.green : P.cyan,
                        opacity: enrichLoading ? 0.5 : 1,
                      }}
                    >
                      <Zap className="w-3 h-3" />
                      {enrichLoading ? 'ENRICHING...' : enrichResult ? 'RE-ENRICH' : 'ENRICH ALL'}
                    </button>
                  </div>
                )}
                {result.extractedIOCs.length === 0 && (
                  <div className="text-center py-10">
                    <div className="text-2xl opacity-20 mb-2">⬡</div>
                    <p className="text-xs" style={{ color: P.dim }}>No IOCs extracted</p>
                    <p className="text-[10px] mt-1" style={{ color: P.dim }}>Paste the email body to extract URLs, IPs, and domains</p>
                  </div>
                )}
                {result.extractedIOCs.map((ioc, i) => {
                  const color = IOC_COLOR[ioc.type] || P.text;
                  const enrich = enrichMap.get(ioc.value);
                  const score: number | null = enrich ? (enrich.overallThreatScore ?? enrich.maxThreatScore ?? null) : null;
                  const malicious = enrich?.isMalicious === true;
                  const suspicious = enrich?.suspicious === true;
                  const scoreColor = score !== null
                    ? (score >= 70 ? P.rose : score >= 40 ? P.amber : P.dim)
                    : null;
                  const isIDN = idnSet.has(ioc.value) || (
                    ioc.type === 'domain' && ioc.value.split('.').some(l => l.startsWith('xn--'))
                  );

                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 rounded group"
                      style={{ backgroundColor: P.surface, border: `1px solid ${malicious ? P.rose + '40' : P.border}` }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                          style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
                        >
                          {ioc.type}
                        </span>
                        {isIDN && (
                          <span
                            className="text-[9px] px-1 py-0.5 rounded flex-shrink-0 font-bold"
                            style={{ backgroundColor: `${P.amber}15`, color: P.amber }}
                          >
                            IDN
                          </span>
                        )}
                        <code className="text-xs truncate" style={{ color: P.textLight }}>
                          {ioc.value.length > 60 ? ioc.value.slice(0, 60) + '…' : ioc.value}
                        </code>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {malicious && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${P.rose}15`, color: P.rose }}>
                            MALICIOUS
                          </span>
                        )}
                        {!malicious && suspicious && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${P.amber}15`, color: P.amber }}>
                            SUSPICIOUS
                          </span>
                        )}
                        {score !== null && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-bold tabular-nums"
                            style={{ backgroundColor: `${scoreColor}15`, color: scoreColor ?? P.dim }}
                          >
                            {score}
                          </span>
                        )}
                        <button
                          onClick={() => handleScanIOC(ioc)}
                          className="text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all"
                          style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
                        >
                          SCAN →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'raw' && (
              <pre className="text-[10px] leading-relaxed overflow-auto" style={{ color: P.text, fontFamily: 'JetBrains Mono, monospace' }}>
                {JSON.stringify(result.rawHeaders, null, 2)}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
