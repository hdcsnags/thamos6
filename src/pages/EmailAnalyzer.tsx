import { useState, useMemo, useRef } from 'react';
import { Mail, AlertTriangle, CheckCircle, XCircle, Copy, Check, GitBranch, FileText, List, Zap, Upload, Shield, Sparkles, FileWarning, Paperclip, Save, Plus, X, Printer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDesktop } from '../contexts/DesktopContext';
import type { AppId } from '../contexts/DesktopContext';
import { supabase } from '../lib/supabase';
import { palette, typography } from '../design-system/tokens';

// Map the local names this file uses onto the shared design-system tokens so the
// Email Analyzer matches the rest of the desktop instead of carrying its own
// off-by-a-few-hex palette.
const P = {
  void: palette.void,
  surface: palette.base,
  surfaceLight: palette.elevated,
  border: palette.borderDefault,
  dim: palette.textTertiary,
  text: palette.textSecondary,
  textLight: palette.textPrimary,
  cyan: palette.cyan,
  green: palette.green,
  amber: palette.amber,
  pink: palette.teal, // URL/secondary accent — on-brand, distinct from rose
  rose: palette.rose,
  mailBg: palette.mailPreviewBg,
  mailChrome: palette.mailPreviewChrome,
  mailBorder: palette.mailPreviewBorder,
  mailText: palette.mailPreviewText,
  mailMuted: palette.mailPreviewMuted,
  mailChip: palette.mailPreviewChip,
  mailLink: palette.mailPreviewLink,
  mailDanger: palette.mailPreviewDanger,
  mailAvatarBg: palette.mailPreviewAvatarBg,
  mailAvatarText: palette.mailPreviewAvatarText,
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

interface UrlSource {
  kind: 'body' | 'attachment-link' | 'attachment-qr';
  attachmentFilename?: string;
  attachmentSha256?: string;
  containerPart?: string;
  imageIndex?: number;
}

interface RecipientBinding {
  detected: boolean;
  location?: 'path' | 'query' | 'fragment';
  encoding?: 'plain' | 'percent' | 'base64' | 'base64url';
  matchedValue?: string;
  matchesMessageRecipient?: boolean;
  matchedTenantDomain?: boolean;
  confidence?: 'high' | 'medium' | 'low';
}

interface UrlIntel {
  original: string;
  final: string;
  unwrapChain: string[];
  wrapper: 'safelinks' | 'mimecast' | 'urldefense' | null;
  finalHost: string;
  decodedArtifacts: DecodedArtifact[];
  // present when this URL was recovered from an attachment (e.g. a QR code
  // decoded from an embedded image) rather than found as plain body/header text
  source?: UrlSource;
  // present when the URL's path/query/fragment contains the message
  // recipient's own address — the tell for a targeted identity-phishing kit
  recipientBinding?: RecipientBinding;
}

interface AttachmentAnalysisFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  detail: string;
}

interface AttachmentAnalysisArtifact {
  kind: 'qr-url' | 'url' | 'email' | 'domain';
  value: string;
  defangedValue: string;
  sourcePart?: string;
  imageIndex?: number;
}

interface AttachmentAnalysis {
  status: 'complete' | 'partial' | 'unsupported' | 'limit-reached' | 'error';
  detectedType: 'pdf' | 'ooxml' | 'ole' | 'archive' | 'image' | 'unknown';
  findings: AttachmentAnalysisFinding[];
  artifacts: AttachmentAnalysisArtifact[];
}

interface AttachmentInfo {
  filename: string;
  contentType: string;
  sizeBytes: number;
  disposition: string;
  extension: string;
  sha256: string | null;
  risk: 'high' | 'medium' | 'low';
  reasons: string[];
  // deep recursive extraction result (OOXML unzip + embedded QR decode) — Phase A
  analysis?: AttachmentAnalysis;
}

interface SenderAuth {
  domain: string;
  hasMx: boolean;
  mx: string[];
  hasSpf: boolean;
  spf: string | null;
  hasDmarc: boolean;
  dmarc: string | null;
  dmarcPolicy: 'reject' | 'quarantine' | 'none' | null;
  spoofable: boolean;
  assessment: string;
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
  bodyHtmlPreview?: string;
  urls?: UrlIntel[];
  attachments?: AttachmentInfo[];
  senderAuth?: SenderAuth | null;
}

interface ThreatIntelEnrichment extends Record<string, unknown> {
  overallThreatScore?: number;
  maxThreatScore?: number;
  isMalicious?: boolean;
  suspicious?: boolean;
}

/** Shape of the threat-intel /ip aggregate as returned by enrichIP() — used
 * only by the Sender Intelligence panel (Headers tab), which reuses whatever
 * ENRICH ALL already fetched for the origin IP rather than making a new call. */
interface IpThreatIntel extends ThreatIntelEnrichment {
  enrichment?: {
    country?: string;
    countryCode?: string;
    city?: string;
    isp?: string;
    org?: string;
    asn?: string;
    spamhausListed?: boolean;
    spamhausLists?: string[];
  };
  detectionConfidence?: string;
  sources?: {
    abuseipdb?: { data?: { abuseConfidenceScore?: number; totalReports?: number } };
    virustotal?: { data?: { attributes?: { reputation?: number; last_analysis_stats?: Record<string, number> } } };
    rdap?: Record<string, unknown>;
  };
}

interface EnrichIOCItem {
  value: string;
  enrichment: ThreatIntelEnrichment;
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

type Tab = 'headers' | 'auth' | 'defender' | 'hops' | 'iocs' | 'attach' | 'body' | 'thamos' | 'raw';

interface ServerParsedEmail {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  messageId?: string;
  returnPath?: string;
  replyTo?: string;
  defender?: DefenderIntel;
  hops?: HopInfo[];
  originIP?: string | null;
  suspiciousIndicators?: string[];
  headers?: Record<string, string>;
  bodyFindings?: string[];
  bodyText?: string;
  bodyHtmlPreview?: string;
  urls?: UrlIntel[];
  domains?: string[];
  ips?: string[];
  emails?: string[];
  attachments?: AttachmentInfo[];
}

type VerdictProvider = 'anthropic' | 'openai';
const VERDICT_MODELS: Record<VerdictProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

const MAX_UPLOAD_MB = 5;

// One entry per .eml/.txt (or pasted) email loaded into the drawer — lets the
// analyst hold several messages at once and flip between them like a real
// mailbox instead of the tool only ever remembering one parse at a time.
interface EmailSession {
  id: string;
  filename: string;
  status: 'loading' | 'ready' | 'error';
  errorMessage?: string;
  rawEmail: string | null;
  result: AnalysisResult | null;
  enrichResult: EnrichResult | null;
  verdict: EmailVerdict | null;
  verdictProvider: VerdictProvider;
  activeTab: Tab;
  savedWorkbench: boolean;
  addedAt: number;
}

const genSessionId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `s${Date.now()}${Math.random().toString(36).slice(2)}`;

const BLOCKED_EMAIL_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta',
  'base',
  'video',
  'audio',
  'source',
  'canvas',
  'svg',
  'math',
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeEmailHtml(html: string): string {
  if (!html.trim()) return '';
  if (typeof document === 'undefined') return escapeHtml(html);

  const doc = document.implementation.createHTMLDocument('email-preview');
  doc.body.innerHTML = html;

  doc.body.querySelectorAll(BLOCKED_EMAIL_TAGS.join(',')).forEach((node) => node.remove());

  doc.body.querySelectorAll('*').forEach((el) => {
    let blockedHref = '';
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (el instanceof HTMLAnchorElement && (name === 'href' || name === 'xlink:href')) {
        blockedHref = attr.value;
      }
      if (
        name.startsWith('on') ||
        ['src', 'srcset', 'href', 'xlink:href', 'background', 'poster', 'action', 'formaction', 'style'].includes(name)
      ) {
        el.removeAttribute(attr.name);
      }
    }
    if (el instanceof HTMLAnchorElement) {
      if (blockedHref) el.setAttribute('data-original-href', blockedHref);
      el.removeAttribute('href');
      el.setAttribute('class', `${el.getAttribute('class') ?? ''} thamos-disabled-link`.trim());
      el.setAttribute('title', 'Link disabled by ThamOS evidence viewer');
    }

    if (el instanceof HTMLImageElement) {
      el.setAttribute('alt', el.getAttribute('alt') || '[remote image blocked]');
      el.setAttribute('class', `${el.getAttribute('class') ?? ''} thamos-blocked-image`.trim());
    }
  });

  return doc.body.innerHTML;
}

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
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  return [...new Set(text.match(emailRegex) || [])];
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

function EmailWorkbenchPreview({ result }: { result: AnalysisResult }) {
  const sanitizedHtml = useMemo(
    () => sanitizeEmailHtml(result.bodyHtmlPreview ?? ''),
    [result.bodyHtmlPreview]
  );
  const sender = result.headers.from || 'Unknown sender';
  const subject = result.headers.subject || '(no subject)';
  const attachmentCount = result.attachments?.length ?? 0;
  const urlCount = result.urls?.length ?? result.extractedIOCs.filter((ioc) => ioc.type === 'url').length;

  return (
    <div className="h-full min-h-0 flex flex-col" style={{ backgroundColor: P.surface }}>
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.22em] font-bold" style={{ color: P.cyan }}>SAFE MESSAGE PREVIEW</div>
            <div className="text-xs truncate mt-1" style={{ color: P.textLight }}>{subject}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {attachmentCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${P.amber}15`, color: P.amber, border: `1px solid ${P.amber}30` }}>
                {attachmentCount} ATT
              </span>
            )}
            {urlCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${P.cyan}15`, color: P.cyan, border: `1px solid ${P.cyan}30` }}>
                {urlCount} URL
              </span>
            )}
          </div>
        </div>
        <p className="text-[10px] mt-2" style={{ color: P.dim }}>
          Active content, remote loads, forms, and live links are stripped before rendering.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="rounded-xl overflow-hidden shadow-2xl" style={{ backgroundColor: P.mailBg, border: `1px solid ${P.mailBorder}`, fontFamily: typography.ui }}>
          <div className="px-4 py-3" style={{ backgroundColor: P.mailChrome, borderBottom: `1px solid ${P.mailBorder}` }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: P.mailAvatarBg, color: P.mailAvatarText }}>
                {sender.replace(/["<>]/g, '').trim().slice(0, 1).toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-snug" style={{ color: P.mailText }}>{subject}</h2>
                <p className="text-xs mt-1 break-all" style={{ color: P.mailMuted }}>From: {sender}</p>
                <p className="text-xs break-all" style={{ color: P.mailMuted }}>To: {result.headers.to || 'Unknown recipient'}</p>
              </div>
              <span className="text-xs shrink-0" style={{ color: P.mailMuted }}>{result.headers.date || ''}</span>
            </div>
          </div>

          {attachmentCount > 0 && (
            <div className="px-4 py-2 flex flex-wrap gap-2" style={{ backgroundColor: P.mailBg, borderBottom: `1px solid ${P.mailBorder}` }}>
              {result.attachments!.map((att, i) => (
                <span key={`${att.filename}-${i}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ backgroundColor: P.mailChip, color: P.mailText }}>
                  <Paperclip className="w-3 h-3" />
                  {att.filename}
                </span>
              ))}
            </div>
          )}

          <div className="px-5 py-5 min-h-[320px]" style={{ color: P.mailText }}>
            {sanitizedHtml ? (
              <>
                <style>{`
                  .thamos-email-preview {
                    color: ${P.mailText};
                    font: 14px/1.55 ${typography.ui};
                    overflow-wrap: anywhere;
                  }
                  .thamos-email-preview * {
                    max-width: 100%;
                  }
                  .thamos-email-preview table {
                    border-collapse: collapse;
                  }
                  .thamos-email-preview a.thamos-disabled-link {
                    color: ${P.mailLink};
                    text-decoration: underline;
                    cursor: not-allowed;
                  }
                  .thamos-email-preview a.thamos-disabled-link::after {
                    content: " [link disabled]";
                    color: ${P.mailDanger};
                    font-size: 11px;
                    font-weight: 700;
                  }
                  .thamos-email-preview img.thamos-blocked-image {
                    display: inline-block;
                    min-width: 120px;
                    min-height: 32px;
                    border: 1px dashed ${P.mailMuted};
                    background: ${P.mailChrome};
                  }
                `}</style>
                <div className="thamos-email-preview" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
              </>
            ) : (
              <pre className="text-sm whitespace-pre-wrap break-words leading-relaxed" style={{ color: P.mailText, fontFamily: typography.ui }}>
                {result.bodyText || 'No decoded body preview available. Use the evidence tabs for headers, IOCs, and verdict details.'}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [rawEmail, setRawEmail] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [verdict, setVerdict] = useState<EmailVerdict | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const [verdictProvider, setVerdictProvider] = useState<VerdictProvider>('anthropic');
  const [savingWorkbench, setSavingWorkbench] = useState(false);
  const [savedWorkbench, setSavedWorkbench] = useState(false);
  const [workbenchError, setWorkbenchError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<EmailSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const enrichMap = useMemo(() => {
    const m = new Map<string, ThreatIntelEnrichment>();
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
        from: (r.match(/from\s+([\w.-]+)/i) || [])[1] || 'Unknown',
        by: (r.match(/by\s+([\w.-]+)/i) || [])[1] || 'Unknown',
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
  const mapServerParsed = (parsed: ServerParsedEmail): AnalysisResult => {
    const defender = parsed.defender;
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
      bodyHtmlPreview: parsed.bodyHtmlPreview ?? '',
      urls: parsed.urls ?? [],
      attachments: parsed.attachments ?? [],
    };
  };

  // Builds a session snapshot from the CURRENT flat state — call before
  // switching away from / closing the active session so its work isn't lost.
  const persistActiveSession = () => {
    if (!activeSessionId) return;
    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      // Only flip to "ready" once we actually have a parsed result — otherwise
      // preserve whatever status the load already settled into (error/loading)
      // instead of clobbering a failed parse with a false "ready".
      const status: EmailSession['status'] = result ? 'ready' : s.status;
      return { ...s, status, rawEmail, result, enrichResult, verdict, verdictProvider, activeTab, savedWorkbench };
    }));
  };

  const switchSession = (id: string) => {
    if (id === activeSessionId) return;
    persistActiveSession();
    const target = sessions.find(s => s.id === id);
    if (!target) return;
    setActiveSessionId(id);
    setResult(target.result);
    setRawEmail(target.rawEmail);
    setEnrichResult(target.enrichResult);
    setVerdict(target.verdict);
    setVerdictProvider(target.verdictProvider);
    setActiveTab(target.activeTab);
    setSavedWorkbench(target.savedWorkbench);
    setEnrichError(null);
    setVerdictError(null);
    setWorkbenchError(null);
    setUploadError(null);
    setCopied(false);
  };

  // Deactivates the current session (back to the drop/paste view) without
  // deleting it from the drawer — it stays selectable, like closing a
  // message in a mail client.
  const closeActiveSession = () => {
    persistActiveSession();
    setActiveSessionId(null);
    setResult(null);
    setRawEmail(null);
    setVerdict(null);
    setEnrichResult(null);
    setEnrichError(null);
    setVerdictError(null);
    setWorkbenchError(null);
    setSavedWorkbench(false);
    setUploadError(null);
  };

  const removeSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (id === activeSessionId) {
      setActiveSessionId(null);
      setResult(null);
      setRawEmail(null);
      setVerdict(null);
      setEnrichResult(null);
      setEnrichError(null);
      setVerdictError(null);
      setWorkbenchError(null);
      setSavedWorkbench(false);
      setUploadError(null);
    }
  };

  const analyzeFile = async (file: File) => {
    setUploadError(null);
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`File too large (max ${MAX_UPLOAD_MB}MB): ${file.name}`);
      return;
    }
    persistActiveSession();
    const id = genSessionId();
    setSessions(prev => [...prev, {
      id, filename: file.name, status: 'loading',
      rawEmail: null, result: null, enrichResult: null, verdict: null,
      verdictProvider, activeTab: 'headers', savedWorkbench: false, addedAt: Date.now(),
    }]);
    setActiveSessionId(id);
    setResult(null);
    setRawEmail(null);
    setEnrichResult(null);
    setEnrichError(null);
    setVerdict(null);
    setVerdictError(null);
    setWorkbenchError(null);
    setSavedWorkbench(false);
    setLoading(true);
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
      const mapped = { ...mapServerParsed(data.parsed), senderAuth: data.senderAuth ?? null };
      const nextTab: Tab = data.parsed?.defender?.present ? 'defender' : 'headers';
      setRawEmail(text);
      setResult(mapped);
      setActiveTab(nextTab);
      setSessions(prev => prev.map(s => s.id === id
        ? { ...s, status: 'ready', rawEmail: text, result: mapped, activeTab: nextTab }
        : s));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUploadError(msg);
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'error', errorMessage: msg } : s));
    } finally {
      setLoading(false);
    }
  };

  // Drops/selections can carry more than one .eml at once — load them into
  // the drawer one at a time (sequential, since each load mutates shared
  // flat state that mirrors the "currently active" session).
  const loadFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      await analyzeFile(f);
    }
  };

  const handleAnalyze = () => {
    if (!rawInput.trim()) return;
    persistActiveSession();
    const id = genSessionId();
    setSessions(prev => [...prev, {
      id, filename: 'Pasted email', status: 'loading',
      rawEmail: null, result: null, enrichResult: null, verdict: null,
      verdictProvider, activeTab: 'headers', savedWorkbench: false, addedAt: Date.now(),
    }]);
    setActiveSessionId(id);
    setLoading(true);
    setEnrichResult(null);
    setEnrichError(null);
    setRawEmail(null);
    setVerdict(null);
    setVerdictError(null);
    setWorkbenchError(null);
    setTimeout(() => {
      const parsed = parseAnalysis();
      setResult(parsed);
      setActiveTab('headers');
      setLoading(false);
      setSessions(prev => prev.map(s => s.id === id
        ? { ...s, status: 'ready', result: parsed, filename: parsed.headers.subject?.trim() || 'Pasted email', activeTab: 'headers' }
        : s));
    }, 300);
  };

  const handleEnrich = async () => {
    if (!result || enrichLoading) return;
    setEnrichLoading(true);
    setEnrichError(null);
    try {
      const body = rawEmail
        ? { rawEmail, enrich: true }
        : { headers: rawInput, emailBody: bodyInput };
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-email`,
        { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server error: ${res.status}`);
      const nextEnrichment = rawEmail ? data.enrichment : data;
      if (!nextEnrichment) throw new Error('No enrichment payload returned');
      setEnrichResult(nextEnrichment as EnrichResult);
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : String(e));
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
          body: JSON.stringify({
            raw_email: rawEmail,
            // send the full per-IOC enrichment (the function truncates it), not
            // just the summary — otherwise the verdict ignores the TI we gathered
            enrichment: enrichResult ?? null,
            provider: verdictProvider,
            model: VERDICT_MODELS[verdictProvider],
          }),
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

  // email addresses have no dedicated result page (email-result dead-ends in the
  // scanner), so they are not scannable from here.
  const SCANNABLE: Partial<Record<ExtractedIOC['type'], AppId>> = {
    ip: 'ip-result', domain: 'domain-result', url: 'url-result',
  };
  const handleScanIOC = (ioc: ExtractedIOC) => {
    const appId = SCANNABLE[ioc.type];
    if (!appId) return;
    openWindow({
      appId,
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

  const TABS: { id: Tab; label: string; icon: LucideIcon; show: boolean }[] = [
    { id: 'headers', label: 'Headers', icon: Mail, show: true },
    { id: 'auth', label: 'Auth', icon: CheckCircle, show: true },
    { id: 'defender', label: 'Defender', icon: Shield, show: Boolean(result?.serverParsed) },
    { id: 'hops', label: 'Hops', icon: GitBranch, show: true },
    { id: 'iocs', label: `IOCs${result ? ` (${result.extractedIOCs.length})` : ''}`, icon: List, show: true },
    { id: 'attach', label: `Attachments${result?.attachments?.length ? ` (${result.attachments.length})` : ''}`, icon: Paperclip, show: Boolean(result?.serverParsed && result?.attachments?.length) },
    { id: 'body', label: 'Body', icon: FileWarning, show: Boolean(result?.serverParsed) },
    { id: 'thamos', label: 'THAMOS', icon: Sparkles, show: Boolean(result?.serverParsed) },
    { id: 'raw', label: 'Raw', icon: FileText, show: true },
  ];

  const IOC_COLOR: Record<string, string> = { ip: P.cyan, domain: P.green, url: P.pink, email: P.amber };

  const RISK_COLOR: Record<AttachmentInfo['risk'], string> = { high: P.rose, medium: P.amber, low: P.dim };
  const formatBytes = (n: number) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

  return (
    <div className="h-full flex" style={{ backgroundColor: P.void, fontFamily: typography.mono }}>
      {/* Left drawer — every dropped/pasted email lives here, like a mailbox
          list, so the analyst can hold several messages open at once. */}
      <div className="w-60 shrink-0 h-full flex flex-col border-r" style={{ backgroundColor: P.surface, borderColor: P.border }}>
        <div className="px-3 py-2.5 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${P.border}` }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: P.cyan }} />
            <span className="text-[10px] font-bold tracking-[0.16em] truncate" style={{ color: P.cyan }}>
              LOADED{sessions.length ? ` (${sessions.length})` : ''}
            </span>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1 rounded transition-all shrink-0"
            style={{ color: P.dim, border: `1px solid ${P.border}` }}
            title="Load another .eml / .txt"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[11px]" style={{ color: P.text }}>No emails loaded yet</p>
              <p className="text-[10px] mt-1 leading-relaxed" style={{ color: P.dim }}>
                Drop a .eml file on the right, or paste headers, to get started.
              </p>
            </div>
          ) : (
            [...sessions].sort((a, b) => b.addedAt - a.addedAt).map(s => {
              const isActive = s.id === activeSessionId;
              const subject = s.status === 'loading'
                ? 'Parsing…'
                : s.status === 'error'
                  ? (s.filename || 'Failed to parse')
                  : (s.result?.headers.subject || s.filename || '(no subject)');
              const sender = s.result?.headers.from || '';
              const dotColor = s.status === 'error'
                ? P.rose
                : s.status === 'loading'
                  ? P.amber
                  : (s.verdict?.verdict ? (VERDICT_COLOR[s.verdict.verdict] ?? P.green) : P.green);
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => switchSession(s.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') switchSession(s.id); }}
                  className="group px-3 py-2.5 cursor-pointer border-l-2 transition-all"
                  style={{
                    borderLeftColor: isActive ? P.cyan : 'transparent',
                    backgroundColor: isActive ? P.surfaceLight : 'transparent',
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: dotColor }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate" style={{ color: isActive ? P.textLight : P.text }}>{subject}</p>
                      {sender && <p className="text-[10px] truncate mt-0.5" style={{ color: P.dim }}>{sender}</p>}
                      {s.status === 'error' && s.errorMessage && (
                        <p className="text-[10px] truncate mt-0.5" style={{ color: P.rose }}>{s.errorMessage}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded shrink-0"
                      style={{ color: P.dim }}
                      title="Remove from drawer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".eml,.txt,.msg,message/rfc822,text/plain"
          multiple
          className="hidden"
          onChange={(e) => { const files = e.target.files; if (files && files.length) loadFiles(files); e.target.value = ''; }}
        />
      </div>

      {/* Reading pane — always a drop target, whichever sub-view is showing. */}
      <div
        className="flex-1 min-h-0 flex flex-col"
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{ outline: dragOver ? `2px dashed ${P.cyan}` : 'none', outlineOffset: '-2px' }}
      >
      {!result ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4" style={{ color: P.cyan }} />
            <span className="text-sm font-medium tracking-wider" style={{ color: P.cyan }}>EMAIL ANALYZER</span>
          </div>

          {/* .eml / .txt upload */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload .eml or .txt email file"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            className="rounded p-6 text-center cursor-pointer transition-all"
            style={{
              backgroundColor: dragOver ? `${P.cyan}10` : P.surfaceLight,
              border: `1px dashed ${dragOver ? P.cyan : P.border}`,
            }}
          >
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
              style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: typography.mono }}
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
              style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: typography.mono }}
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
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 py-2 shrink-0" style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}>
            <div className="flex items-center gap-3">
              <button
                onClick={closeActiveSession}
                className="text-xs px-2 py-1.5 transition-all rounded"
                style={{ color: P.dim, border: `1px solid ${P.border}` }}
                title="Close (keeps this email in the drawer)"
              >
                ✕ Close
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] tracking-[0.22em] font-bold" style={{ color: P.cyan }}>EMAIL WORKBENCH</div>
                <div className="text-xs truncate" style={{ color: P.textLight }}>{result.headers.subject || '(no subject)'}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {rawEmail && (
                  <button
                    onClick={async () => {
                      if (savingWorkbench) return;
                      setSavingWorkbench(true);
                      setWorkbenchError(null);
                      try {
                        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/store-email`, {
                          method: 'POST', headers: await authHeaders(), body: JSON.stringify({ raw_email: rawEmail }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data?.error || `Server error: ${res.status}`);
                        setSavedWorkbench(true);
                        setTimeout(() => setSavedWorkbench(false), 2500);
                      } catch (e) {
                        setWorkbenchError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setSavingWorkbench(false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs rounded transition-all"
                    style={{ color: savedWorkbench ? P.green : P.cyan, border: `1px solid ${(savedWorkbench ? P.green : P.cyan)}40` }}
                    title="Encrypt + persist this email and feed its non-PII IOCs into the pivot graph"
                  >
                    <Save className="w-3 h-3" /> {savingWorkbench ? 'Saving…' : savedWorkbench ? 'Saved' : 'Save to Workbench'}
                  </button>
                )}
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
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify({ ...result, enrichResult, verdict }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const safeName = (result.headers.subject || 'email-analysis').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60);
                    a.href = url;
                    a.download = `${safeName || 'email-analysis'}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded transition-all"
                  style={{ color: P.dim, border: `1px solid ${P.border}` }}
                  title="Download the full analysis (headers, IOCs, threat-intel, verdict) as a JSON file"
                >
                  <FileText className="w-3 h-3" /> Download JSON
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded transition-all"
                  style={{ color: P.dim, border: `1px solid ${P.border}` }}
                  title="Print or save this workbench view as a PDF report"
                >
                  <Printer className="w-3 h-3" /> Print Report
                </button>
              </div>
            </div>
            {workbenchError && (
              <div className="mt-2 text-xs" style={{ color: P.rose }}>
                Save failed: {workbenchError}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-[minmax(360px,46%)_minmax(0,1fr)] overflow-hidden">
            <div className="min-h-0 border-r" style={{ borderColor: P.border }}>
              <EmailWorkbenchPreview result={result} />
            </div>

            <div className="min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center px-3 shrink-0 overflow-x-auto" style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}>
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
              </div>

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

              <div className="flex-1 min-h-0 overflow-y-auto p-4">
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
                {/* Sender Intelligence — geo/ASN/ISP + AbuseIPDB/VirusTotal reputation
                    + Spamhaus blacklist status for the origin IP. Reuses whatever
                    ENRICH ALL already fetched (enrichMap); makes no new backend calls
                    and never sends the raw email/recipient anywhere. */}
                {result.originIP && (() => {
                  const ti = enrichMap.get(result.originIP) as IpThreatIntel | undefined;
                  if (!ti) {
                    return (
                      <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                        <span className="text-[10px] font-bold tracking-wider" style={{ color: P.dim }}>SENDER INTELLIGENCE</span>
                        <p className="text-[10px] mt-1" style={{ color: P.dim }}>Run ENRICH ALL (IOCs tab) to look up the origin IP's geolocation, reputation, and blacklist status.</p>
                      </div>
                    );
                  }
                  const geo = ti.enrichment;
                  const abuse = ti.sources?.abuseipdb?.data;
                  const vt = ti.sources?.virustotal?.data?.attributes;
                  const vtStats = vt?.last_analysis_stats;
                  const vtMalicious = vtStats?.malicious ?? 0;
                  const vtTotal = vtStats ? Object.values(vtStats).reduce((a, b) => a + b, 0) : null;
                  const spamhausListed = geo?.spamhausListed === true;
                  return (
                    <div className="p-3 rounded space-y-3" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wider" style={{ color: P.textLight }}>SENDER INTELLIGENCE</span>
                        <code className="text-[10px]" style={{ color: P.dim }}>{result.originIP}</code>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                        <div><span style={{ color: P.dim }}>Location: </span><span style={{ color: P.textLight }}>{[geo?.city, geo?.country || geo?.countryCode].filter(Boolean).join(', ') || 'Unknown'}</span></div>
                        <div><span style={{ color: P.dim }}>Provider: </span><span style={{ color: P.textLight }}>{geo?.isp || geo?.org || 'Unknown'}</span></div>
                        <div><span style={{ color: P.dim }}>ASN: </span><span style={{ color: P.textLight }}>{geo?.asn || 'Unknown'}</span></div>
                        <div><span style={{ color: P.dim }}>Confidence: </span><span style={{ color: P.textLight }}>{ti.detectionConfidence || 'low'}</span></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded text-center" style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}>
                          <div className="text-[9px]" style={{ color: P.dim }}>ABUSEIPDB</div>
                          <div className="text-sm font-bold tabular-nums" style={{ color: abuse?.abuseConfidenceScore ? (abuse.abuseConfidenceScore >= 50 ? P.rose : abuse.abuseConfidenceScore > 0 ? P.amber : P.green) : P.dim }}>
                            {abuse?.abuseConfidenceScore !== undefined ? `${abuse.abuseConfidenceScore}%` : 'N/A'}
                          </div>
                          <div className="text-[9px]" style={{ color: P.dim }}>{abuse?.totalReports ?? 0} reports</div>
                        </div>
                        <div className="p-2 rounded text-center" style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}>
                          <div className="text-[9px]" style={{ color: P.dim }}>VIRUSTOTAL</div>
                          <div className="text-sm font-bold tabular-nums" style={{ color: vtMalicious > 0 ? P.rose : vtTotal !== null ? P.green : P.dim }}>
                            {vtTotal !== null ? `${vtMalicious} / ${vtTotal}` : 'N/A'}
                          </div>
                          <div className="text-[9px]" style={{ color: P.dim }}>{vt?.reputation !== undefined ? `rep ${vt.reputation}` : 'detections'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded text-[10px]" style={{ backgroundColor: spamhausListed ? `${P.rose}10` : `${P.green}10`, border: `1px solid ${(spamhausListed ? P.rose : P.green)}30`, color: spamhausListed ? P.rose : P.green }}>
                        {spamhausListed
                          ? `⚠ Spamhaus: listed (${(geo?.spamhausLists ?? []).join(', ') || 'zone unspecified'})`
                          : '✓ Spamhaus: not listed on any checked zone'}
                      </div>
                    </div>
                  );
                })()}
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
                {result.senderAuth && (() => {
                  const sa = result.senderAuth!;
                  const sc = sa.spoofable ? P.rose : sa.dmarcPolicy === 'quarantine' ? P.amber : P.green;
                  return (
                    <div className="p-4 rounded space-y-2" style={{ backgroundColor: P.surface, border: `1px solid ${sc}30` }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs tracking-wider font-bold" style={{ color: P.textLight }}>SENDER DOMAIN POSTURE</span>
                        <code className="text-[10px]" style={{ color: P.dim }}>{sa.domain}</code>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold ml-auto" style={{ backgroundColor: `${sc}15`, color: sc }}>
                          {sa.spoofable ? 'SPOOFABLE' : `DMARC ${sa.dmarcPolicy?.toUpperCase()}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: P.dim }}>
                        <span style={{ color: sa.hasDmarc ? P.green : P.rose }}>DMARC {sa.hasDmarc ? sa.dmarcPolicy ?? 'set' : 'none'}</span>
                        <span style={{ color: sa.hasSpf ? P.green : P.amber }}>SPF {sa.hasSpf ? 'present' : 'none'}</span>
                        <span style={{ color: sa.hasMx ? P.text : P.amber }}>MX {sa.hasMx ? 'present' : 'none'}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: P.text }}>{sa.assessment}</p>
                    </div>
                  );
                })()}
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
                {/* Recipient identity binding — the AITM/quishing tell: a recovered
                    URL that embeds the message recipient's own address */}
                {result.urls && result.urls.some(u => u.recipientBinding?.detected) && (
                  <div className="p-3 rounded mb-3 space-y-2" style={{ backgroundColor: `${P.rose}10`, border: `1px solid ${P.rose}40` }}>
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: P.rose }}>⚠ RECIPIENT IDENTITY BINDING — TARGETED PHISHING</span>
                    {result.urls.filter(u => u.recipientBinding?.detected).map((u, i) => (
                      <div key={i} className="text-xs space-y-0.5">
                        <p style={{ color: P.text }}>
                          <code style={{ color: P.rose }}>{u.finalHost}</code> URL {u.recipientBinding!.location} contains the recipient's exact address
                          {' '}(<code style={{ color: P.textLight }}>{u.recipientBinding!.matchedValue}</code>, {u.recipientBinding!.encoding})
                        </p>
                        <p style={{ color: P.dim }}>
                          Confidence: {u.recipientBinding!.confidence} — targeted identity-phishing, likely credential-harvesting/AITM infrastructure. Not proof of a specific named kit.
                        </p>
                        {u.source?.kind === 'attachment-qr' && (
                          <p style={{ color: P.dim }}>
                            Source: QR code decoded from <code style={{ color: P.textLight }}>{u.source.attachmentFilename}</code>
                            {u.source.containerPart ? ` (${u.source.containerPart})` : ''} — not visible as text anywhere in the message.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Non-binding QR-recovered URLs still get a lightweight provenance note */}
                {result.urls && result.urls.some(u => u.source?.kind === 'attachment-qr' && !u.recipientBinding?.detected) && (
                  <div className="p-3 rounded mb-3 space-y-1" style={{ backgroundColor: `${P.amber}08`, border: `1px solid ${P.amber}30` }}>
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: P.amber }}>QR CODE RECOVERED FROM ATTACHMENT</span>
                    {result.urls.filter(u => u.source?.kind === 'attachment-qr' && !u.recipientBinding?.detected).map((u, i) => (
                      <p key={i} className="text-xs" style={{ color: P.text }}>
                        <code style={{ color: P.textLight }}>{u.finalHost}</code> decoded from <code style={{ color: P.dim }}>{u.source?.attachmentFilename}</code> — verify before treating as safe.
                      </p>
                    ))}
                  </div>
                )}

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
                {enrichError && (
                  <div className="p-3 rounded text-xs" style={{ backgroundColor: `${P.rose}10`, border: `1px solid ${P.rose}30`, color: P.rose }}>
                    Enrichment failed: {enrichError}
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
                        {SCANNABLE[ioc.type] && (
                          <button
                            onClick={() => handleScanIOC(ioc)}
                            className="text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all"
                            style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
                          >
                            SCAN →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'attach' && (
              <div className="space-y-2">
                {(result.attachments?.length ?? 0) === 0 ? (
                  <div className="text-center py-10">
                    <Paperclip className="w-6 h-6 mx-auto mb-2" style={{ color: P.dim }} />
                    <p className="text-xs" style={{ color: P.dim }}>No attachments in this message</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px]" style={{ color: P.dim }}>
                      Triaged by filename and type. HTML/script/archive and double-extension files are the
                      common phishing and malware-delivery vectors.
                    </p>
                    {result.attachments!.map((att, i) => {
                      const rc = RISK_COLOR[att.risk];
                      return (
                        <div key={i} className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${rc}30` }}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${rc}15`, color: rc }}>
                              {att.risk.toUpperCase()}
                            </span>
                            {att.extension && (
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ backgroundColor: `${P.dim}20`, color: P.text }}>
                                .{att.extension}
                              </span>
                            )}
                            <code className="text-xs break-all flex-1" style={{ color: P.textLight }}>{att.filename}</code>
                            <span className="text-[10px] flex-shrink-0" style={{ color: P.dim }}>{formatBytes(att.sizeBytes)}</span>
                          </div>
                          <div className="text-[10px] mb-1" style={{ color: P.dim }}>{att.contentType}</div>
                          {att.reasons.map((r, j) => (
                            <p key={j} className="text-xs leading-relaxed" style={{ color: att.risk === 'low' ? P.dim : rc }}>{r}</p>
                          ))}
                          {att.analysis && att.analysis.findings.length > 0 && (
                            <div className="mt-1.5 pt-1.5 space-y-0.5" style={{ borderTop: `1px solid ${P.border}` }}>
                              <span className="text-[9px] tracking-wider" style={{ color: P.dim }}>
                                DEEP EXTRACTION {att.analysis.status !== 'complete' ? `(${att.analysis.status})` : ''}
                              </span>
                              {att.analysis.findings.map((f, j) => {
                                const fc = f.severity === 'critical' || f.severity === 'high' ? P.rose
                                  : f.severity === 'medium' ? P.amber
                                  : P.dim;
                                return (
                                  <p key={j} className="text-xs leading-relaxed" style={{ color: fc }}>
                                    <span className="font-bold">{f.category}:</span> {f.detail}
                                  </p>
                                );
                              })}
                            </div>
                          )}
                          {att.sha256 && (
                            <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: `1px solid ${P.border}` }}>
                              <span className="text-[10px] flex-shrink-0" style={{ color: P.dim }}>SHA-256</span>
                              <code className="text-[10px] break-all flex-1 min-w-0" style={{ color: P.text }}>{att.sha256}</code>
                              <button
                                onClick={() => openWindow({ appId: 'hash-result', title: `HASH: ${att.sha256!.slice(0, 12)}…`, data: { value: att.sha256 } })}
                                className="text-[10px] px-2 py-0.5 rounded flex-shrink-0 transition-all"
                                style={{ backgroundColor: `${P.cyan}15`, color: P.cyan, border: `1px solid ${P.cyan}30` }}
                              >
                                SCAN →
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
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
                  <pre className="text-xs mt-2 whitespace-pre-wrap break-words leading-relaxed" style={{ color: P.text, fontFamily: typography.mono }}>
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
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-[10px]" style={{ color: P.dim }}>Model:</span>
                      {(['anthropic', 'openai'] as VerdictProvider[]).map(p => (
                        <button
                          key={p}
                          onClick={() => setVerdictProvider(p)}
                          className="text-[10px] px-2 py-0.5 rounded transition-all"
                          style={{
                            backgroundColor: verdictProvider === p ? `${P.cyan}15` : 'transparent',
                            border: `1px solid ${verdictProvider === p ? `${P.cyan}40` : P.border}`,
                            color: verdictProvider === p ? P.cyan : P.dim,
                          }}
                        >
                          {p === 'anthropic' ? 'Claude' : 'GPT'}
                        </button>
                      ))}
                    </div>
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
              <pre className="text-[10px] leading-relaxed overflow-auto" style={{ color: P.text, fontFamily: typography.mono }}>
                {JSON.stringify(result.rawHeaders, null, 2)}
              </pre>
            )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
