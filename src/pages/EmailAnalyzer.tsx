import { useState, useMemo, useRef } from 'react';
import { Mail, AlertTriangle, CheckCircle, XCircle, Copy, Check, GitBranch, FileText, List, Zap, Upload, Shield, Sparkles, FileWarning } from 'lucide-react';
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

interface DefenderSignal {
  key: string;
  value: string;
  severity: 'info' | 'warn' | 'high';
  meaning: string;
}

interface DefenderIntel {
  present: boolean;
  scl: string | null;
  cat: string | null;
  sfty: string | null;
  cip: string | null;
  ctry: string | null;
  compauth: string | null;
  compauthReason: string | null;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  crossTenantAuthAs: string | null;
  correlationId: string | null;
  authenticatedSender: string | null;
  signals: DefenderSignal[];
}

interface DecodedArtifact {
  token: string;
  decoded: string;
  sourceUrl: string;
  kind: 'email' | 'url' | 'domain' | 'text';
}

interface UrlIntel {
  original: string;
  final: string;
  unwrapChain: string[];
  wrapper: 'safelinks' | 'mimecast' | 'urldefense' | null;
  finalHost: string;
  decodedArtifacts: DecodedArtifact[];
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
  // present only for server-parsed (.eml upload) analyses
  serverParsed?: boolean;
  defender?: DefenderIntel;
  bodyFindings?: string[];
  bodyText?: string;
  urls?: UrlIntel[];
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

interface EmailVerdict {
  verdict: 'PHISHING' | 'SUSPICIOUS' | 'SPAM' | 'LEGITIMATE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  attack_type: string;
  recommended_action: string;
  headline: string;
  signal_assessments: Array<{ signal: string; assessment: 'CONFIRMED' | 'REFUTED' | 'UNCERTAIN'; reasoning: string }>;
  misleading_signals: string[];
  kill_chain: string[];
  iocs_to_block: Array<{ type: string; value: string; reason: string }>;
  victim_context?: { targeted_recipient?: string; identity_prefill?: string | null };
  recommendation: string;
  analyst_next_steps: string[];
}

type Tab = 'headers' | 'auth' | 'defender' | 'hops' | 'iocs' | 'body' | 'thamos' | 'raw';

const MAX_UPLOAD_MB = 5;

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
  const [rawEmail, setRawEmail] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [verdict, setVerdict] = useState<EmailVerdict | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    };
    if (session?.access_token) hdrs['Authorization'] = `Bearer ${session.access_token}`;
    return hdrs;
  };

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

  /** Map the server parse (analyze-email rawEmail mode) into the result shape. */
  const mapServerParsed = (parsed: any): AnalysisResult => {
    const defender: DefenderIntel = parsed.defender;
    const toAuth = (value: string | null, key: string): AuthResult => {
      if (!value) return { status: 'none', details: 'Not found in headers' };
      if (value === 'bestguesspass') {
        return { status: 'neutral', details: 'bestguesspass — no DMARC record; Microsoft guessed (NOT verified)' };
      }
      return {
        status: value === 'pass' ? 'pass' : value === 'fail' ? 'fail' : 'neutral',
        details: `${key.toUpperCase()} ${value}`,
      };
    };

    const iocs: ExtractedIOC[] = [];
    const seen = new Set<string>();
    const add = (type: ExtractedIOC['type'], value: string) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      iocs.push({ type, value });
    };
    for (const u of parsed.urls ?? []) add('url', u.final);
    for (const d of parsed.domains ?? []) add('domain', d);
    for (const ip of parsed.ips ?? []) add('ip', ip);
    for (const e of parsed.emails ?? []) add('email', e);

    return {
      headers: {
        from: parsed.from || '',
        to: parsed.to || '',
        subject: parsed.subject || '',
        date: parsed.date || '',
        messageId: parsed.messageId || '',
        returnPath: parsed.returnPath || '',
        replyTo: parsed.replyTo || '',
      },
      authentication: {
        spf: toAuth(defender?.spf ?? null, 'spf'),
        dkim: toAuth(defender?.dkim ?? null, 'dkim'),
        dmarc: toAuth(defender?.dmarc ?? null, 'dmarc'),
      },
      hops: parsed.hops ?? [],
      originIP: parsed.originIP ?? null,
      suspiciousIndicators: parsed.suspiciousIndicators ?? [],
      extractedIOCs: iocs,
      rawHeaders: parsed.headers ?? {},
      serverParsed: true,
      defender,
      bodyFindings: parsed.bodyFindings ?? [],
      bodyText: parsed.bodyText ?? '',
      urls: parsed.urls ?? [],
    };
  };

  const analyzeFile = async (file: File) => {
    setUploadError(null);
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`File too large (max ${MAX_UPLOAD_MB}MB)`);
      return;
    }
    setLoading(true);
    setEnrichResult(null);
    setVerdict(null);
    setVerdictError(null);
    try {
      const text = await file.text();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-email`,
        {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ rawEmail: text }),
        }
      );
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setRawEmail(text);
      setResult(mapServerParsed(data.parsed));
      setActiveTab(data.parsed?.defender?.present ? 'defender' : 'headers');
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    if (!rawInput.trim()) return;
    setLoading(true);
    setEnrichResult(null);
    setRawEmail(null);
    setVerdict(null);
    setVerdictError(null);
    setTimeout(() => {
      setResult(parseAnalysis());
      setActiveTab('headers');
      setLoading(false);
    }, 300);
  };

  const handleEnrich = async () => {
    if (!result || enrichLoading) return;
    setEnrichLoading(true);
    try {
      const body = rawEmail
        ? { rawEmail, enrich: true }
        : { headers: rawInput, emailBody: bodyInput };
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-email`,
        { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) }
      );
      if (res.ok) {
        const data = await res.json();
        setEnrichResult(rawEmail ? data.enrichment : data);
      }
    } catch {
      // local parse remains usable
    } finally {
      setEnrichLoading(false);
    }
  };

  const runThamosVerdict = async () => {
    if (!rawEmail || verdictLoading) return;
    setVerdictLoading(true);
    setVerdictError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-verdict`,
        {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ raw_email: rawEmail, enrichment: enrichResult?.summary ?? null }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server error: ${res.status}`);
      setVerdict(data.verdict as EmailVerdict);
    } catch (e) {
      setVerdictError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerdictLoading(false);
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

  const SEVERITY_COLOR: Record<DefenderSignal['severity'], string> = {
    info: P.cyan,
    warn: P.amber,
    high: P.rose,
  };

  const VERDICT_COLOR: Record<string, string> = {
    PHISHING: P.rose,
    SUSPICIOUS: P.amber,
    SPAM: P.pink,
    LEGITIMATE: P.green,
  };

  const ASSESSMENT_COLOR: Record<string, string> = {
    CONFIRMED: P.rose,
    REFUTED: P.green,
    UNCERTAIN: P.amber,
  };

  const TABS: { id: Tab; label: string; icon: any; show: boolean }[] = [
    { id: 'headers', label: 'Headers', icon: Mail, show: true },
    { id: 'auth', label: 'Auth', icon: CheckCircle, show: true },
    { id: 'defender', label: 'Defender', icon: Shield, show: Boolean(result?.serverParsed) },
    { id: 'hops', label: 'Hops', icon: GitBranch, show: true },
    { id: 'iocs', label: `IOCs${result ? ` (${result.extractedIOCs.length})` : ''}`, icon: List, show: true },
    { id: 'body', label: 'Body', icon: FileWarning, show: Boolean(result?.serverParsed) },
    { id: 'thamos', label: 'THAMOS', icon: Sparkles, show: Boolean(result?.serverParsed) },
    { id: 'raw', label: 'Raw', icon: FileText, show: true },
  ];

  const IOC_COLOR: Record<string, string> = { ip: P.cyan, domain: P.green, url: '#ff0080', email: P.amber };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {!result ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4" style={{ color: P.cyan }} />
            <span className="text-sm font-medium tracking-wider" style={{ color: P.cyan }}>EMAIL ANALYZER</span>
          </div>

          {/* .eml / .txt upload */}
          <div
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) analyzeFile(f); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            className="rounded p-6 text-center cursor-pointer transition-all"
            style={{
              backgroundColor: dragOver ? `${P.cyan}10` : P.surfaceLight,
              border: `1px dashed ${dragOver ? P.cyan : P.border}`,
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".eml,.txt,.msg,message/rfc822,text/plain"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeFile(f); e.target.value = ''; }}
            />
            <Upload className="w-5 h-5 mx-auto mb-2" style={{ color: dragOver ? P.cyan : P.dim }} />
            <p className="text-xs" style={{ color: P.textLight }}>
              {loading ? 'PARSING…' : 'Drop a .eml / .txt export here, or click to browse'}
            </p>
            <p className="text-[10px] mt-1" style={{ color: P.dim }}>
              Full MIME decode · Defender header intelligence · SafeLink unwrap · base64 artifact decode
            </p>
          </div>
          {uploadError && (
            <p className="text-xs" style={{ color: P.rose }}>{uploadError}</p>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ backgroundColor: P.border }} />
            <span className="text-[10px]" style={{ color: P.dim }}>OR PASTE</span>
            <div className="flex-1 h-px" style={{ backgroundColor: P.border }} />
          </div>

          <div>
            <label className="block text-xs tracking-wider mb-1.5" style={{ color: P.dim }}>RAW HEADERS (paste full email headers)</label>
            <textarea
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              rows={8}
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
              rows={5}
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
          <div className="flex items-center px-3 shrink-0 overflow-x-auto" style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}>
            <button
              onClick={() => { setResult(null); setRawEmail(null); setVerdict(null); setEnrichResult(null); }}
              className="text-xs px-2 py-2.5 mr-3 transition-all"
              style={{ color: P.dim }}
            >
              ← Back
            </button>
            <div className="w-px h-4 mr-3" style={{ backgroundColor: P.border }} />
            {TABS.filter(t => t.show).map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs transition-all border-b-2 whitespace-nowrap"
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
                  await navigator.clipboard.writeText(JSON.stringify({ ...result, verdict }, null, 2)).catch(() => {});
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
            <div className="flex items-start gap-3 px-4 py-2.5 shrink-0 max-h-32 overflow-y-auto" style={{ backgroundColor: `${P.rose}10`, borderBottom: `1px solid ${P.rose}30` }}>
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
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {(['spf', 'dkim', 'dmarc'] as const).map(key => (
                    <div key={key} className="p-4 rounded space-y-2" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                      <span className="text-xs tracking-wider font-bold" style={{ color: P.textLight }}>{key.toUpperCase()}</span>
                      <div><AuthBadge r={result.authentication[key]} /></div>
                      <p className="text-[10px]" style={{ color: P.dim }}>{result.authentication[key].details}</p>
                    </div>
                  ))}
                </div>
                {result.defender?.compauth && (
                  <div className="p-4 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    <span className="text-xs tracking-wider font-bold" style={{ color: P.textLight }}>COMPOSITE AUTH (compauth)</span>
                    <p className="text-xs mt-2" style={{ color: result.defender.compauthReason === '109' ? P.amber : P.text }}>
                      {result.defender.compauth}{result.defender.compauthReason ? ` (reason=${result.defender.compauthReason})` : ''}
                      {result.defender.compauthReason === '109' && ' — pass via implicit/guessed signals only'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'defender' && result.defender && (
              <div className="space-y-4">
                {!result.defender.present && (
                  <p className="text-xs text-center py-8" style={{ color: P.dim }}>
                    No Defender/EOP headers found — message may not have transited Microsoft 365.
                  </p>
                )}
                {result.defender.present && (
                  <>
                    <p className="text-[10px]" style={{ color: P.dim }}>
                      Microsoft computed these verdicts before delivery — read them, they're free intelligence.
                    </p>
                    <div className="space-y-2">
                      {result.defender.signals.map((s, i) => {
                        const color = SEVERITY_COLOR[s.severity];
                        return (
                          <div key={i} className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${color}30` }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${color}15`, color }}>
                                {s.severity.toUpperCase()}
                              </span>
                              <code className="text-xs font-bold" style={{ color: P.textLight }}>{s.key}: {s.value}</code>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: P.text }}>{s.meaning}</p>
                          </div>
                        );
                      })}
                    </div>
                    {result.defender.authenticatedSender && (
                      <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                        <span className="text-xs flex-shrink-0" style={{ color: P.dim }}>X-AUTHENTICATED-SENDER</span>
                        <code className="text-xs break-all block mt-1" style={{ color: P.textLight }}>{result.defender.authenticatedSender}</code>
                      </div>
                    )}
                    {result.defender.correlationId && (
                      <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                        <span className="text-xs flex-shrink-0" style={{ color: P.dim }}>FILTERING CORRELATION ID (for Defender/Sentinel cross-ref)</span>
                        <code className="text-xs break-all block mt-1" style={{ color: P.textLight }}>{result.defender.correlationId}</code>
                      </div>
                    )}
                  </>
                )}
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
                {/* URL unwrap / decode intelligence (server-parsed only) */}
                {result.urls && result.urls.some(u => u.wrapper || u.decodedArtifacts.length > 0) && (
                  <div className="p-3 rounded mb-3 space-y-2" style={{ backgroundColor: `${P.amber}08`, border: `1px solid ${P.amber}30` }}>
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: P.amber }}>URL DECODE CHAINS</span>
                    {result.urls.filter(u => u.wrapper || u.decodedArtifacts.length > 0).map((u, i) => (
                      <div key={i} className="text-xs space-y-0.5">
                        {u.wrapper && (
                          <p style={{ color: P.text }}>
                            <span style={{ color: P.amber }}>{u.wrapper}</span> wrapper → real destination: <code style={{ color: P.textLight }}>{u.finalHost}</code>
                          </p>
                        )}
                        {u.decodedArtifacts.map((a, j) => (
                          <p key={j} style={{ color: P.text }}>
                            base64 <code style={{ color: P.dim }}>{a.token.length > 30 ? a.token.slice(0, 30) + '…' : a.token}</code> → <code style={{ color: P.rose }}>{a.decoded}</code> <span style={{ color: P.dim }}>({a.kind})</span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {result.extractedIOCs.length > 0 && (
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px]" style={{ color: P.dim }}>
                      {result.extractedIOCs.length} IOC{result.extractedIOCs.length !== 1 ? 's' : ''} extracted
                      {result.serverParsed && <span className="ml-2" style={{ color: P.cyan }}>· wrappers unwrapped</span>}
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

            {activeTab === 'body' && (
              <div className="space-y-3">
                {(result.bodyFindings?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    {result.bodyFindings!.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded" style={{ backgroundColor: `${P.rose}10`, border: `1px solid ${P.rose}30` }}>
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: P.rose }} />
                        <p className="text-xs leading-relaxed" style={{ color: P.rose }}>{f}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                  <span className="text-[10px] tracking-wider" style={{ color: P.dim }}>DECODED BODY TEXT (MIME + base64 decoded, HTML stripped)</span>
                  <pre className="text-xs mt-2 whitespace-pre-wrap break-words leading-relaxed" style={{ color: P.text, fontFamily: 'JetBrains Mono, monospace' }}>
                    {result.bodyText || '(empty body)'}
                  </pre>
                </div>
              </div>
            )}

            {activeTab === 'thamos' && (
              <div className="space-y-4">
                {!verdict && !verdictLoading && (
                  <div className="text-center py-10 space-y-3">
                    <Sparkles className="w-6 h-6 mx-auto" style={{ color: P.cyan }} />
                    <p className="text-xs" style={{ color: P.text }}>
                      Ask THAMOS for a grounded verdict — the server re-parses the raw message and the model
                      verifies every signal against the actual headers, decoded body, and unwrapped URLs.
                    </p>
                    {enrichResult ? (
                      <p className="text-[10px]" style={{ color: P.green }}>Enrichment results will be included.</p>
                    ) : (
                      <p className="text-[10px]" style={{ color: P.dim }}>Tip: run ENRICH ALL first to include threat-intel results.</p>
                    )}
                    <button
                      onClick={runThamosVerdict}
                      className="px-4 py-2 text-xs font-medium rounded transition-all"
                      style={{ backgroundColor: `${P.cyan}15`, border: `1px solid ${P.cyan}40`, color: P.cyan }}
                    >
                      ASK THAMOS
                    </button>
                    {verdictError && <p className="text-xs" style={{ color: P.rose }}>{verdictError}</p>}
                  </div>
                )}
                {verdictLoading && (
                  <p className="text-xs text-center py-10" style={{ color: P.cyan }}>THAMOS is reviewing the evidence…</p>
                )}
                {verdict && !verdictLoading && (() => {
                  const vc = VERDICT_COLOR[verdict.verdict] ?? P.amber;
                  return (
                    <div className="space-y-3">
                      <div className="p-4 rounded text-center space-y-1" style={{ backgroundColor: `${vc}10`, border: `1px solid ${vc}40` }}>
                        <div className="text-base font-bold" style={{ color: vc }}>{verdict.verdict}</div>
                        <div className="text-[10px]" style={{ color: P.dim }}>
                          {verdict.confidence} CONFIDENCE · {verdict.attack_type} · {verdict.recommended_action}
                        </div>
                        <p className="text-xs mt-1" style={{ color: P.textLight }}>{verdict.headline}</p>
                      </div>

                      {verdict.misleading_signals?.length > 0 && (
                        <div className="p-3 rounded" style={{ backgroundColor: `${P.amber}08`, border: `1px solid ${P.amber}30` }}>
                          <span className="text-[10px] font-bold tracking-wider" style={{ color: P.amber }}>MISLEADING SIGNALS — DO NOT BE REASSURED BY</span>
                          {verdict.misleading_signals.map((m, i) => (
                            <p key={i} className="text-xs mt-1" style={{ color: P.text }}>• {m}</p>
                          ))}
                        </div>
                      )}

                      {verdict.signal_assessments?.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold tracking-wider" style={{ color: P.dim }}>SIGNAL VERIFICATION</span>
                          {verdict.signal_assessments.map((s, i) => (
                            <div key={i} className="p-2.5 rounded flex items-start gap-2" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ backgroundColor: `${ASSESSMENT_COLOR[s.assessment]}15`, color: ASSESSMENT_COLOR[s.assessment] }}>
                                {s.assessment}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs" style={{ color: P.textLight }}>{s.signal}</p>
                                <p className="text-[10px] mt-0.5" style={{ color: P.dim }}>{s.reasoning}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {verdict.kill_chain?.length > 0 && (
                        <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                          <span className="text-[10px] font-bold tracking-wider" style={{ color: P.dim }}>KILL CHAIN</span>
                          {verdict.kill_chain.map((k, i) => (
                            <p key={i} className="text-xs mt-1.5" style={{ color: P.text }}>
                              <span className="font-bold" style={{ color: P.cyan }}>{i + 1}.</span> {k}
                            </p>
                          ))}
                        </div>
                      )}

                      {verdict.iocs_to_block?.length > 0 && (
                        <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.rose}30` }}>
                          <span className="text-[10px] font-bold tracking-wider" style={{ color: P.rose }}>IOCS TO BLOCK</span>
                          {verdict.iocs_to_block.map((i2, i) => (
                            <div key={i} className="flex items-start gap-2 mt-1.5">
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ backgroundColor: `${P.rose}15`, color: P.rose }}>{i2.type}</span>
                              <div className="min-w-0">
                                <code className="text-xs break-all" style={{ color: P.textLight }}>{i2.value}</code>
                                <p className="text-[10px]" style={{ color: P.dim }}>{i2.reason}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                        <span className="text-[10px] font-bold tracking-wider" style={{ color: P.dim }}>RECOMMENDATION</span>
                        <p className="text-xs mt-1" style={{ color: P.textLight }}>{verdict.recommendation}</p>
                        {verdict.analyst_next_steps?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {verdict.analyst_next_steps.map((s, i) => (
                              <p key={i} className="text-xs" style={{ color: P.text }}>→ {s}</p>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={runThamosVerdict}
                        className="text-[10px] px-2.5 py-1 rounded transition-all"
                        style={{ color: P.dim, border: `1px solid ${P.border}` }}
                      >
                        RE-RUN VERDICT
                      </button>
                    </div>
                  );
                })()}
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
