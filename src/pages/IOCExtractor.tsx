import { useEffect, useMemo, useState } from 'react';
import {
  FileSearch,
  Copy,
  Check,
  Trash2,
  Download,
  Play,
  Shield,
  AlertTriangle,
  BookmarkPlus,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { palette, typography } from '../design-system/tokens';
import { Callout, Pill, ResultCard, StatCell, type Tone } from '../components/results';
import {
  classifyIPVerdict,
  classifyURLVerdict,
  classifyHashVerdict,
  defangIOC,
  IOCAnalysisResult,
  IOCVerdict,
} from '../lib/iocAnalysis';
import { bulkLookupIPs, lookupHash, scanURL } from '../lib/threatIntel';
import { supabase } from '../lib/supabase';

interface ExtractedIOCs {
  ips: string[];
  ipv6: string[];
  urls: string[];
  domains: string[];
  emails: string[];
  md5: string[];
  sha1: string[];
  sha256: string[];
  cves: string[];
  extensions: string[];
}

type InputMode = 'single' | 'bulk';
type PrimaryType = 'ip' | 'url' | 'domain' | 'hash' | 'email' | 'cve' | 'extension';
type PrimaryIOC = { type: PrimaryType; value: string } | null;

function countIOCs(iocs: ExtractedIOCs): number {
  return (
    iocs.ips.length +
    iocs.ipv6.length +
    iocs.urls.length +
    iocs.domains.length +
    iocs.emails.length +
    iocs.md5.length +
    iocs.sha1.length +
    iocs.sha256.length +
    iocs.cves.length +
    iocs.extensions.length
  );
}

function pickPrimaryIOC(iocs: ExtractedIOCs): PrimaryIOC {
  if (iocs.extensions[0]) return { type: 'extension', value: iocs.extensions[0] };
  if (iocs.urls[0]) return { type: 'url', value: iocs.urls[0] };
  if (iocs.domains[0]) return { type: 'domain', value: iocs.domains[0] };
  if (iocs.ips[0]) return { type: 'ip', value: iocs.ips[0] };
  if (iocs.ipv6[0]) return { type: 'ip', value: iocs.ipv6[0] };
  const hash = iocs.sha256[0] || iocs.sha1[0] || iocs.md5[0];
  if (hash) return { type: 'hash', value: hash };
  if (iocs.emails[0]) return { type: 'email', value: iocs.emails[0] };
  if (iocs.cves[0]) return { type: 'cve', value: iocs.cves[0] };
  return null;
}

/** Semantic tone for a verdict chip: rose = malicious, amber = suspicious, green = clean, neutral = unknown. */
function verdictToneFor(severity: IOCVerdict['severity'], verdictText: string): Tone {
  const text = (verdictText || '').toLowerCase();
  if (severity === 'critical' || severity === 'high' || text.includes('malicious')) return 'danger';
  if (severity === 'medium' || text.includes('suspicious')) return 'warn';
  if (severity === 'low' || text.includes('clean') || text.includes('benign') || text.includes('verified')) return 'good';
  return 'neutral';
}

/** Threat score bands mirror the ThreatScore component the Tactical theme uses. */
function scoreToneFor(score: number): { tone: Tone; label: string } {
  if (score >= 70) return { tone: 'danger', label: 'High risk' };
  if (score >= 40) return { tone: 'warn', label: 'Suspicious' };
  if (score >= 20) return { tone: 'neutral', label: 'Low risk' };
  return { tone: 'good', label: 'Clean' };
}

export default function IOCExtractor() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<InputMode>('single');
  const [analysisMode, setAnalysisMode] = useState<'fast' | 'full'>('fast');

  const [iocs, setIocs] = useState<ExtractedIOCs | null>(null);
  const [primary, setPrimary] = useState<PrimaryIOC>(null);

  const [copied, setCopied] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<IOCAnalysisResult[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

const extractIOCs = (text: string): ExtractedIOCs => {
    const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:|\b(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b|\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}\b/g;
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const defangedUrlRegex = /hxxps?:\/\/[^\s<>"{}|\\^`\[\]]+|https?\[:\]\/\/[^\s<>"{}|\\^`\[\]]+|h[tx]{2}ps?\[?:\]?\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const domainRegex = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|edu|gov|mil|int|io|co|uk|de|fr|jp|cn|ru|br|in|au|info|biz|xyz|online|site|app|dev|tech|cloud|ai|me|tv|cc|ws|to|ly|gl|bit|goo|gg|zip|mov|ninja|top|wang|win|bid|party|stream|download|racing|review|trade|webcam|date|faith|accountant|science|loan|men|work|click|link|help|gift|pics|photo|hosting|world|email|live|systems|software|solutions|network|digital|media|agency|services|group|company|ltd|limited)\b/gi;
    const defangedDomainRegex = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\[\.\])+[a-zA-Z]{2,}\b|\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\(\.\))+[a-zA-Z]{2,}\b/gi;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const defangedEmailRegex = /\b[A-Za-z0-9._%+-]+\[@\][A-Za-z0-9.-]+\[\.\][A-Z|a-z]{2,}\b|\b[A-Za-z0-9._%+-]+\(at\)[A-Za-z0-9.-]+\(dot\)[A-Z|a-z]{2,}\b/gi;
    const md5Regex = /\b[a-fA-F0-9]{32}\b/g;
    const sha1Regex = /\b[a-fA-F0-9]{40}\b/g;
    const sha256Regex = /\b[a-fA-F0-9]{64}\b/g;
    const cveRegex = /CVE-\d{4}-\d{4,}/gi;
    const extensionRegex = /https?:\/\/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/detail\/[^\/]+\/([a-z]{32})/gi;

    const unwrapSafeLinks = (url: string): string => {
      try {
        if (url.includes('safelinks.protection.outlook.com')) {
          const urlObj = new URL(url);
          const actualUrl = urlObj.searchParams.get('url');
          if (actualUrl) return decodeURIComponent(actualUrl);
        }
        if (url.includes('urldefense.proofpoint.com') || url.includes('urldefense.com')) {
          const match = url.match(/u=([^&]+)/);
          if (match) {
            const encoded = match[1];
            try {
              return decodeURIComponent(encoded.replace(/-/g, '%').replace(/_/g, '/'));
            } catch {
              return url;
            }
          }
        }
        if (url.includes('google.com/url')) {
          const urlObj = new URL(url);
          const actualUrl = urlObj.searchParams.get('q') || urlObj.searchParams.get('url');
          if (actualUrl) return decodeURIComponent(actualUrl);
        }
      } catch {
        return url;
      }
      return url;
    };

    const refang = (str: string): string => {
      return str
        .replace(/\[\.\]/g, '.')
        .replace(/\(\.\)/g, '.')
        .replace(/\[@\]/g, '@')
        .replace(/\(at\)/gi, '@')
        .replace(/\(dot\)/gi, '.')
        .replace(/hxxp/gi, 'http')
        .replace(/h[tx]{2}p/gi, 'http')
        .replace(/\[:\]/g, ':')
        .replace(/\(:\)/g, ':');
    };

    const dedup = (arr: string[]): string[] => [...new Set(arr)];

    const ips = dedup([
      ...(text.match(ipv4Regex) || []),
    ]).filter(ip => !ip.startsWith('0.') && !ip.startsWith('255.') && !ip.startsWith('127.'));

    const ipv6 = dedup(text.match(ipv6Regex) || []);

    const urls = dedup([
      ...(text.match(urlRegex) || []).map(unwrapSafeLinks),
      ...(text.match(defangedUrlRegex) || []).map(refang).map(unwrapSafeLinks),
    ]);

    const allDomains = dedup([
      ...(text.match(domainRegex) || []),
      ...(text.match(defangedDomainRegex) || []).map(refang),
    ]).map(d => d.toLowerCase());

    const urlDomains = urls.map(u => {
      try {
        return new URL(u).hostname.toLowerCase();
      } catch {
        return '';
      }
    }).filter(Boolean);

    const domains = allDomains.filter(d =>
      !urlDomains.includes(d) &&
      !d.includes('@') &&
      d.split('.').length >= 2
    );

    const emails = dedup([
      ...(text.match(emailRegex) || []),
      ...(text.match(defangedEmailRegex) || []).map(refang),
    ]).map(e => e.toLowerCase());

    const md5 = dedup(text.match(md5Regex) || []).map(h => h.toLowerCase());
    const sha1 = dedup(text.match(sha1Regex) || []).map(h => h.toLowerCase());
    const sha256 = dedup(text.match(sha256Regex) || []).map(h => h.toLowerCase());
    const cves = dedup(text.match(cveRegex) || []).map(c => c.toUpperCase());

    const extensions: string[] = [];
    let extMatch;
    while ((extMatch = extensionRegex.exec(text)) !== null) {
      extensions.push(extMatch[1]);
    }
    const uniqueExtensions = dedup(extensions);

    return { ips, ipv6, urls, domains, emails, md5, sha1, sha256, cves, extensions: uniqueExtensions };
  }

  const totalFound = useMemo(() => (iocs ? countIOCs(iocs) : 0), [iocs]);

  const handleExtract = () => {
    if (!input.trim()) return;
    const extracted = extractIOCs(input);
    setIocs(extracted);
    setPrimary(pickPrimaryIOC(extracted));
    setAnalysisResults([]);
    setAnalysisError(null);
    setExpandedResult(null);
  };

  const handleClear = () => {
    setInput('');
    setIocs(null);
    setPrimary(null);
    setCopied(null);
    setAnalysisResults([]);
    setAnalysisError(null);
    setExpandedResult(null);
  };

  // Auto-run (Single mode): debounce input -> extract -> analyze
  useEffect(() => {
    if (mode !== 'single') return;

    const text = input.trim();
    if (!text) {
      setIocs(null);
      setPrimary(null);
      setAnalysisResults([]);
      setAnalysisError(null);
      setExpandedResult(null);
      return;
    }

    const t = window.setTimeout(() => {
      const extracted = extractIOCs(text);
      setIocs(extracted);
      const picked = pickPrimaryIOC(extracted);
      setPrimary(picked);

      if (!picked) {
        setAnalysisResults([]);
        setAnalysisError('No IOC detected.');
        return;
      }

      setAnalysisResults([]);
      setAnalysisError(null);
      setExpandedResult(null);
      void handleAnalyze({ iocs: extracted, primary: picked });
    }, 350);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, mode]);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      setAnalysisError('Clipboard copy failed (browser permissions).');
    }
  };

  const callThreatIntel = async (path: '/ip' | '/url' | '/hash', body: Record<string, any>) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL in env.');

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (anonKey) headers['apikey'] = anonKey;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const resp = await fetch(`${supabaseUrl}/functions/v1/threat-intel${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.error || `Threat intel request failed (${resp.status})`);
    }
    return json;
  };

  const buildHashMockData = (hashResponse: any) => {
    return {
      overallThreatScore: hashResponse?.threatScore ?? hashResponse?.overallThreatScore ?? 0,
      isMalicious: hashResponse?.isMalicious ?? false,
      sources: hashResponse?.sources ?? {},
      ...hashResponse,
    };
  };

  const buildUrlMockData = (urlResponse: any) => {
    // The URL edge endpoint historically returned `results` (ThreatResult-style) rather than `sources`.
    // Our front-end normalizes `scanURL()` to:
    //   results: { [source]: { found, malicious, details, error?, threatScore? } }
    // For the verdict engine, we mirror that into `sources`.
    const sources = urlResponse?.sources ?? urlResponse?.results ?? {};

    const overallThreatScore =
      urlResponse?.threatScore ??
      urlResponse?.overallThreatScore ??
      (() => {
        const scores = Object.values(sources)
          .map((r: any) => (typeof r?.threatScore === 'number' ? r.threatScore : undefined))
          .filter((n): n is number => typeof n === 'number');
        return scores.length ? Math.max(...scores) : 0;
      })();

    return {
      overallThreatScore,
      isMalicious: urlResponse?.isMalicious ?? false,
      sources,
      ...urlResponse,
    };
  };

  const buildIpMockData = (ipResponse: any) => {
    return {
      overallThreatScore: ipResponse?.threatScore ?? ipResponse?.overallThreatScore ?? 0,
      isMalicious: ipResponse?.isMalicious ?? false,
      sources: ipResponse?.sources ?? {},
      ...ipResponse,
    };
  };

  const handleAnalyze = async (override?: { iocs?: ExtractedIOCs; primary?: PrimaryIOC }) => {
    const activeIocs = override?.iocs ?? iocs;
    if (!activeIocs) return;

    const activePrimary = override?.primary ?? primary;

    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResults([]);
    setExpandedResult(null);

    try {
      // BULK MODE: only IP enrichment
      if (mode === 'bulk') {
        if (activeIocs.ips.length === 0 && activeIocs.ipv6.length === 0) {
          setAnalysisError('Bulk mode currently supports IP enrichment only. Paste IPs or switch to Single mode.');
          return;
        }

        const allIps = [...activeIocs.ips, ...activeIocs.ipv6];
        const ipsToAnalyze = analysisMode === 'fast' ? allIps.slice(0, 10) : allIps;

        const { results: bulkResults } = await bulkLookupIPs(ipsToAnalyze);

        if (!bulkResults || bulkResults.length === 0) {
          setAnalysisError('No results returned from analysis. Please try again.');
          return;
        }

        const results: IOCAnalysisResult[] = bulkResults.map((ipData: any) => {
          const enrichment = {
            isTor: ipData.isTor || false,
            isVPN: ipData.isVPN || false,
            isProxy: ipData.isProxy || false,
            isHosting: ipData.isHosting || false,
            vpnService: ipData.vpnService || '',
            country: ipData.country || '',
            city: ipData.city || '',
            org: ipData.organization || ipData.org || '',
            asn: ipData.asn || '',
            isp: ipData.isp || '',
            classification: ipData.greynoiseClassification || ipData.classification || '',
          };

          const mockData = {
            overallThreatScore: ipData.threatScore ?? 0,
            isMalicious: ipData.isMalicious ?? false,
            sources: ipData.sources ?? {
              abuseipdb: { abuseConfidenceScore: ipData.abuseConfidence || 0, totalReports: ipData.abuseReports || 0 },
              greynoise: { classification: ipData.greynoiseClassification || '' },
            },
            ...ipData,
          };

          return {
            ioc: ipData.ip || ipData.value || '',
            type: 'ip',
            verdict: classifyIPVerdict(mockData, enrichment),
            sources: mockData.sources ?? {},
            enrichment,
            checkedAt: new Date().toISOString(),
          };
        });

        setAnalysisResults(results);
        return;
      }

      // SINGLE MODE: analyze the "primary" IOC only
      const chosen = activePrimary ?? pickPrimaryIOC(activeIocs);
      if (!chosen) {
        setAnalysisError('No IOC detected to analyze.');
        return;
      }

      if (chosen.type === 'email' || chosen.type === 'cve') {
        setAnalysisError(`Single-mode analysis for ${chosen.type.toUpperCase()} is coming soon. For now, you can still extract/copy/export it.`);
        return;
      }

      if (chosen.type === 'hash') {
        const data = await lookupHash(chosen.value);
        const mockData = buildHashMockData(data);
        const verdict = classifyHashVerdict(mockData);

        setAnalysisResults([{ ioc: chosen.value, type: 'hash', verdict, sources: mockData.sources ?? mockData, checkedAt: new Date().toISOString() }]);
        return;
      }

      if (chosen.type === 'extension') {
        const extensionUrl = `https://chromewebstore.google.com/detail/extension/${chosen.value}`;
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-extension`;

        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (anonKey) headers['apikey'] = anonKey;
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ extensionUrl }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Extension analysis failed');
        }

        const { data: analysis } = await supabase
          .from('extension_analyses')
          .select('*')
          .eq('id', result.analysis_id)
          .single();

        if (analysis) {
          const verdict = {
            verdict: `${analysis.risk_level} Risk - Score: ${analysis.risk_score}/100`,
            confidence: 0.95,
            severity: analysis.risk_level as any,
            color: analysis.risk_level === 'critical' ? 'red' : analysis.risk_level === 'high' ? 'orange' : analysis.risk_level === 'medium' ? 'yellow' : 'green',
            badges: [`${analysis.extension_name}`, `v${analysis.extension_version}`, `Score: ${analysis.risk_score}`],
            evidence: [analysis.analysis_summary],
            recommendations: [
              'Review the extension security findings',
              'Check for suspicious permissions or code patterns',
              'Consider the risk level before installation',
            ],
          };

          setAnalysisResults([
            {
              ioc: chosen.value,
              type: 'hash' as any,
              verdict,
              sources: analysis,
              checkedAt: new Date().toISOString(),
            },
          ]);
        }
        return;
      }

      if (chosen.type === 'url' || chosen.type === 'domain') {
        const url = chosen.type === 'domain' ? `https://${chosen.value}` : chosen.value;
        // Use the same helper as URLScanner so auth headers + normalization match.
        const data = await scanURL(url);
        const mockData = buildUrlMockData(data);
        const verdict = classifyURLVerdict(mockData);

        setAnalysisResults([
          {
            ioc: chosen.value,
            type: chosen.type === 'domain' ? 'domain' : 'url',
            verdict,
            sources: mockData.sources ?? mockData,
            checkedAt: new Date().toISOString(),
          } as IOCAnalysisResult,
        ]);
        return;
      }

      // IP (single)
      if (chosen.type === 'ip') {
        const data = await callThreatIntel('/ip', { ip: chosen.value });
        const mockData = buildIpMockData(data);

        const enrichment = {
          isTor: mockData.isTor || false,
          isVPN: mockData.isVPN || false,
          isProxy: mockData.isProxy || false,
          isHosting: mockData.isHosting || false,
          vpnService: mockData.vpnService || '',
          country: mockData.country || '',
          city: mockData.city || '',
          org: mockData.org || mockData.organization || '',
          asn: mockData.asn || '',
          isp: mockData.isp || '',
          classification: mockData.greynoiseClassification || mockData.classification || '',
        };

        const verdict = classifyIPVerdict(mockData, enrichment);
        setAnalysisResults([{ ioc: chosen.value, type: 'ip', verdict, sources: mockData.sources ?? mockData, enrichment, checkedAt: new Date().toISOString() }]);
        return;
      }

      setAnalysisError('Unsupported IOC type.');
    } catch (e: any) {
      setAnalysisError(e?.message || 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const addToWatchlist = async (ioc: string, type: string, verdict?: string) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setAnalysisError('You must be signed in to add items to your watchlist.');
      return;
    }

    const { error } = await supabase.from('watchlist_entries').insert({
      entry_type: type,
      value: ioc,
      description: verdict ? `SmartIOC verdict: ${verdict}` : null,
      severity: verdict && verdict.toLowerCase().includes('malicious') ? 'high' : 'medium',
      is_active: true,
    });

    if (error) setAnalysisError(error.message);
  };

  const createCaseNote = async (ioc: string, type: string, verdict?: string) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setAnalysisError('You must be signed in to save case notes.');
      return;
    }

    const payload = {
      title: `IOC Analysis: ${ioc}`,
      description: verdict ? `Verdict: ${verdict}` : `IOC: ${ioc}`,
      status: 'open',
      priority: verdict && verdict.toLowerCase().includes('malicious') ? 'high' : 'medium',
      tags: ['smart-ioc', type],
      iocs: [{ type, value: ioc, notes: verdict ? `Verdict: ${verdict}` : undefined }],
    };

    const { error } = await supabase.from('case_notes').insert(payload);
    if (error) setAnalysisError(error.message);
  };

  const exportBundle = (format: 'json' | 'csv' | 'text' | 'defanged') => {
    if (!iocs) return;

    const all = {
      ips: [...iocs.ips, ...iocs.ipv6],
      urls: iocs.urls,
      domains: iocs.domains,
      emails: iocs.emails,
      hashes: [...iocs.sha256, ...iocs.sha1, ...iocs.md5],
      extensions: iocs.extensions,
      cves: iocs.cves,
    };

    const rows: { type: string; value: string }[] = [
      ...all.ips.map(value => ({ type: 'ip', value })),
      ...all.urls.map(value => ({ type: 'url', value })),
      ...all.domains.map(value => ({ type: 'domain', value })),
      ...all.emails.map(value => ({ type: 'email', value })),
      ...all.hashes.map(value => ({ type: 'hash', value })),
      ...all.extensions.map(value => ({ type: 'extension', value })),
      ...all.cves.map(value => ({ type: 'cve', value })),
    ];

    const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

    let output = '';
    if (format === 'json') output = JSON.stringify(all, null, 2);
    if (format === 'csv') output = ['type,value', ...rows.map(r => `${csvCell(r.type)},${csvCell(r.value)}`)].join('\n');
    if (format === 'text') output = rows.map(r => r.value).join('\n');
    if (format === 'defanged') output = rows.map(r => defangIOC(r.value, r.type)).join('\n');

    void handleCopy(output, `export-${format}`);
  };

  const renderCountPill = (label: string, count: number) => (
    <span
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs"
      style={{ background: palette.float, border: `1px solid ${palette.borderDefault}` }}
    >
      <span style={{ color: palette.textTertiary }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: count > 0 ? palette.textPrimary : palette.textDisabled }}>{count}</span>
    </span>
  );

  const secondaryButton = 'ioc-btn inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm';
  const secondaryButtonStyle = {
    background: palette.float,
    border: `1px solid ${palette.borderDefault}`,
    color: palette.textSecondary,
  } as const;

  const segmentStyle = (active: boolean) =>
    ({
      background: active ? palette.surface : 'transparent',
      color: active ? palette.textPrimary : palette.textSecondary,
      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.35)' : 'none',
    }) as const;

  const fieldStyle = {
    background: palette.void,
    border: `1px solid ${palette.borderDefault}`,
    color: palette.textPrimary,
    fontFamily: typography.mono,
  } as const;

  return (
    <div
      className="min-h-full @container"
      style={{ background: palette.elevated, color: palette.textPrimary, fontFamily: typography.ui }}
    >
      <style>{`
        .ioc-field::placeholder { color: ${palette.textDisabled}; }
        .ioc-field:focus { outline: none; border-color: ${palette.borderActive} !important; }
        .ioc-btn { transition: background-color 150ms, color 150ms; }
        .ioc-btn:hover:not(:disabled) { background: ${palette.surface} !important; color: ${palette.textPrimary} !important; }
        .ioc-seg { transition: color 150ms, background-color 150ms; }
        .ioc-seg:hover { color: ${palette.textPrimary} !important; }
        .ioc-link:hover { color: ${palette.textPrimary} !important; }
      `}</style>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-start gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: palette.float, border: `1px solid ${palette.borderDefault}` }}
          >
            <FileSearch className="w-5 h-5" style={{ color: palette.accent }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: palette.textPrimary }}>Smart IOC intake</h1>
            <p className="text-sm mt-0.5" style={{ color: palette.textSecondary }}>
              Paste any text to extract IOCs. Single mode auto-detects and runs the correct lookup.
            </p>
          </div>
        </div>

        <ResultCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <label className="text-sm font-medium" style={{ color: palette.textSecondary }}>
              Paste text to extract and analyze
            </label>

            <div className="flex flex-wrap gap-2 items-center">
              <div
                role="tablist"
                aria-label="Input mode"
                className="inline-flex items-center gap-0.5 p-0.5 rounded-md"
                style={{ background: palette.float, border: `1px solid ${palette.borderDefault}` }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'single'}
                  onClick={() => setMode('single')}
                  className="ioc-seg px-3 py-1 rounded text-xs font-medium"
                  style={segmentStyle(mode === 'single')}
                >
                  Single
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'bulk'}
                  onClick={() => setMode('bulk')}
                  className="ioc-seg px-3 py-1 rounded text-xs font-medium"
                  style={segmentStyle(mode === 'bulk')}
                >
                  Bulk (IPs)
                </button>
              </div>

              {mode === 'bulk' && (
                <div
                  role="tablist"
                  aria-label="Analysis depth"
                  className="inline-flex items-center gap-0.5 p-0.5 rounded-md"
                  style={{ background: palette.float, border: `1px solid ${palette.borderDefault}` }}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={analysisMode === 'fast'}
                    onClick={() => setAnalysisMode('fast')}
                    className="ioc-seg px-3 py-1 rounded text-xs font-medium"
                    style={segmentStyle(analysisMode === 'fast')}
                  >
                    Fast (10)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={analysisMode === 'full'}
                    onClick={() => setAnalysisMode('full')}
                    className="ioc-seg px-3 py-1 rounded text-xs font-medium"
                    style={segmentStyle(analysisMode === 'full')}
                  >
                    Full
                  </button>
                </div>
              )}
            </div>
          </div>

          {mode === 'single' ? (
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const text = input.trim();
                  if (!text) return;
                  const extracted = extractIOCs(text);
                  setIocs(extracted);
                  const picked = pickPrimaryIOC(extracted);
                  setPrimary(picked);
                  if (picked) void handleAnalyze({ iocs: extracted, primary: picked });
                }
              }}
              placeholder="Paste an IP / URL / domain / hash / Chrome extension URL..."
              className="ioc-field w-full rounded-lg px-4 py-3 text-sm"
              style={fieldStyle}
              spellCheck={false}
            />
          ) : (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste email content, logs, proxy data, SOC notes, etc..."
              className="ioc-field w-full h-48 rounded-lg p-4 text-sm resize-none"
              style={fieldStyle}
              spellCheck={false}
            />
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {mode === 'bulk' && (
              <button type="button" onClick={handleExtract} className={secondaryButton} style={secondaryButtonStyle}>
                <Play className="w-4 h-4" />
                Extract
              </button>
            )}
            <button type="button" onClick={handleClear} className={secondaryButton} style={secondaryButtonStyle}>
              <Trash2 className="w-4 h-4" />
              Clear
            </button>

            {iocs && mode === 'bulk' && (
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={analyzing}
                className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: palette.accent, color: palette.void }}
              >
                {analyzing ? (
                  <>
                    <span
                      className="w-4 h-4 rounded-full animate-spin"
                      style={{ border: `2px solid ${palette.void}`, borderTopColor: 'transparent' }}
                    />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Analyze IPs
                  </>
                )}
              </button>
            )}
          </div>

          {iocs && (
            <div className="mt-5">
              <div className="flex flex-wrap gap-2">
                {renderCountPill('Total', totalFound)}
                {renderCountPill('IPv4', iocs.ips.length)}
                {renderCountPill('IPv6', iocs.ipv6.length)}
                {renderCountPill('URLs', iocs.urls.length)}
                {renderCountPill('Domains', iocs.domains.length)}
                {renderCountPill('Hashes', iocs.sha256.length + iocs.sha1.length + iocs.md5.length)}
                {renderCountPill('Extensions', iocs.extensions.length)}
                {renderCountPill('Emails', iocs.emails.length)}
                {renderCountPill('CVEs', iocs.cves.length)}
              </div>

              {mode === 'single' && primary && totalFound > 1 && (
                <div className="mt-3">
                  <Callout
                    tone="warn"
                    icon={<AlertTriangle className="w-4 h-4" />}
                    title="Multiple IOCs detected"
                    detail={
                      <>
                        Single mode analyzes only the first detected IOC:{' '}
                        <span style={{ fontFamily: typography.mono, color: palette.textPrimary }}>{primary.value}</span>.
                        Switch to Bulk for IP enrichment plus extraction and export.
                      </>
                    }
                  />
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  ['text', 'Copy text', Copy],
                  ['defanged', 'Copy defanged', Download],
                  ['json', 'Copy JSON', FileText],
                  ['csv', 'Copy CSV', Download],
                ] as const).map(([format, label, Icon]) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => exportBundle(format)}
                    className={secondaryButton}
                    style={secondaryButtonStyle}
                  >
                    {copied === `export-${format}` ? (
                      <Check className="w-4 h-4" style={{ color: palette.green }} />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {analysisError && (
            <div className="mt-5">
              <Callout tone="danger" icon={<AlertTriangle className="w-4 h-4" />} title="Analysis error" detail={analysisError} />
            </div>
          )}
        </ResultCard>

        {analysisResults.length > 0 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: palette.textPrimary }}>Results</h2>

            {analysisResults.map((r) => {
              const score = Number(
                (r.sources as any)?.overallThreatScore ??
                  (r.sources as any)?.threatScore ??
                  (r.sources as any)?.score ??
                  0
              ) || 0;

              const isExpanded = expandedResult === r.ioc;
              const verdictTone = verdictToneFor(r.verdict.severity, r.verdict.verdict);
              const scoreInfo = scoreToneFor(score);

              return (
                <ResultCard key={r.ioc}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium uppercase" style={{ color: palette.textTertiary, letterSpacing: '0.04em' }}>{r.type}</span>
                        <Pill
                          label={`${r.verdict.verdict} · ${Math.round(r.verdict.confidence * 100)}%`}
                          tone={verdictTone}
                        />
                      </div>
                      <div className="mt-1.5 text-sm break-all" style={{ fontFamily: typography.mono, color: palette.textPrimary }}>{r.ioc}</div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="min-w-[72px]">
                        <StatCell label={scoreInfo.label} value={score} tone={scoreInfo.tone} />
                      </div>
                      <button
                        type="button"
                        onClick={() => addToWatchlist(r.ioc, r.type, r.verdict.verdict)}
                        className={secondaryButton}
                        style={secondaryButtonStyle}
                      >
                        <BookmarkPlus className="w-4 h-4" />
                        Watchlist
                      </button>
                      <button
                        type="button"
                        onClick={() => createCaseNote(r.ioc, r.type, r.verdict.verdict)}
                        className={secondaryButton}
                        style={secondaryButtonStyle}
                      >
                        <FileText className="w-4 h-4" />
                        Case note
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 @xl:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: palette.textSecondary }}>Evidence</div>
                      {(r.verdict.evidence || []).length > 0 ? (
                        <ul className="space-y-1 text-sm list-disc ml-5" style={{ color: palette.textPrimary }}>
                          {(r.verdict.evidence || []).slice(0, 8).map((e, idx) => (
                            <li key={idx}>{e}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs" style={{ color: palette.textTertiary }}>No evidence returned.</p>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: palette.textSecondary }}>Recommended actions</div>
                      {(r.verdict.recommendations || []).length > 0 ? (
                        <ul className="space-y-1 text-sm list-disc ml-5" style={{ color: palette.textPrimary }}>
                          {(r.verdict.recommendations || []).slice(0, 8).map((e, idx) => (
                            <li key={idx}>{e}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs" style={{ color: palette.textTertiary }}>No recommendations returned.</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setExpandedResult(isExpanded ? null : r.ioc)}
                      className="ioc-link inline-flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: palette.textSecondary }}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {isExpanded ? 'Hide raw sources' : 'Show raw sources'}
                    </button>
                    {isExpanded && (
                      <pre
                        className="mt-3 p-4 overflow-auto"
                        style={{
                          background: palette.void,
                          color: palette.textSecondary,
                          fontFamily: typography.mono,
                          fontSize: '11px',
                          borderRadius: '8px',
                          border: `1px solid ${palette.borderDefault}`,
                        }}
                      >
                        {JSON.stringify(r.sources, null, 2)}
                      </pre>
                    )}
                  </div>
                </ResultCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
