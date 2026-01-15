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
import ThreatScore from '../components/ThreatScore';
import {
  classifyIPVerdict,
  classifyURLVerdict,
  classifyHashVerdict,
  exportToCSV,
  exportToJSON,
  exportToPlainText,
  exportToDefanged,
  IOCAnalysisResult,
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
}

type InputMode = 'single' | 'bulk';
type PrimaryType = 'ip' | 'url' | 'domain' | 'hash' | 'email' | 'cve';
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
    iocs.cves.length
  );
}

function pickPrimaryIOC(iocs: ExtractedIOCs): PrimaryIOC {
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

    return { ips, ipv6, urls, domains, emails, md5, sha1, sha256, cves };
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
          };
        });

        setAnalysisResults(results);
        return;
      }

      // SINGLE MODE: analyze the "primary" IOC only
      const chosen = primary ?? pickPrimaryIOC(iocs);
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

  setAnalysisResults([{ ioc: chosen.value, type: 'hash', verdict, sources: mockData.sources ?? mockData }]);
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
        setAnalysisResults([{ ioc: chosen.value, type: 'ip', verdict, sources: mockData.sources ?? mockData, enrichment }]);
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
    const activeIocs = override?.iocs ?? iocs;
    if (!activeIocs) return;

    const activePrimary = override?.primary ?? primary;
    const all = {
      ips: [...iocs.ips, ...iocs.ipv6],
      urls: iocs.urls,
      domains: iocs.domains,
      emails: iocs.emails,
      hashes: [...iocs.sha256, ...iocs.sha1, ...iocs.md5],
      cves: iocs.cves,
    };

    let output = '';
    if (format === 'json') output = exportToJSON(all);
    if (format === 'csv') output = exportToCSV(all);
    if (format === 'text') output = exportToPlainText(all);
    if (format === 'defanged') output = exportToDefanged(all);

    void handleCopy(output, `export-${format}`);
  };

  const renderCountPill = (label: string, count: number) => (
    <span className="px-3 py-1.5 bg-slate-800 text-slate-200 rounded-lg text-sm border border-slate-700">
      <span className="text-slate-400 mr-2">{label}</span>
      <span className="font-semibold">{count}</span>
    </span>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg">
            <FileSearch className="w-7 h-7 text-white" />
          </div>
          <div>
           <h1 className="text-3xl font-bold text-slate-100">Smart IOC Intake</h1>
<p className="text-slate-400 mt-2">
  Paste any text to extract IOCs. Single mode auto-detects and runs the correct lookup.
</p>

<p className="text-xs text-slate-500 mt-2">
  IOCExtractor build: PHASE1-2026-01-15-A
</p>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <label className="text-sm font-medium text-slate-300">
              Paste Text to Extract & Analyze
            </label>

            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button
                  onClick={() => setMode('single')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    mode === 'single' ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Single
                </button>
                <button
                  onClick={() => setMode('bulk')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    mode === 'bulk' ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Bulk (IPs)
                </button>
              </div>

              {mode === 'bulk' && (
                <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                  <button
                    onClick={() => setAnalysisMode('fast')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      analysisMode === 'fast' ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Fast (10)
                  </button>
                  <button
                    onClick={() => setAnalysisMode('full')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      analysisMode === 'full' ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:text-white'
                    }`}
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
              placeholder="Paste an IP / URL / domain / hash..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          ) : (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste email content, logs, proxy data, SOC notes, etc..."
              className="w-full h-48 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {mode === 'bulk' && (
              <button
                onClick={handleExtract}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium"
              >
                <Play className="w-4 h-4" />
                Extract
              </button>
            )}
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>

           {iocs && mode === 'bulk' && (
                  <button
                  onClick={() => void handleAnalyze()}
                  disabled={analyzing}
                  className="ml-auto inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-cyan-400 text-slate-950 font-semibold disabled:opacity-60"
                >
                  {analyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
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
                {renderCountPill('Emails', iocs.emails.length)}
                {renderCountPill('CVEs', iocs.cves.length)}
              </div>

              {mode === 'single' && primary && totalFound > 1 && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
                  <AlertTriangle className="w-5 h-5 mt-0.5" />
                  <div className="text-sm">
                    Multiple IOCs detected. <span className="font-semibold">Single</span> mode will analyze only the first detected
                    IOC: <span className="font-semibold">{primary.value}</span>. Switch to <span className="font-semibold">Bulk</span> for IP enrichment + extraction/export.
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => exportBundle('text')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
                >
                  {copied === 'export-text' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  Copy Text
                </button>
                <button
                  onClick={() => exportBundle('defanged')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
                >
                  {copied === 'export-defanged' ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
                  Copy Defanged
                </button>
                <button
                  onClick={() => exportBundle('json')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
                >
                  {copied === 'export-json' ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4" />}
                  Copy JSON
                </button>
                <button
                  onClick={() => exportBundle('csv')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
                >
                  {copied === 'export-csv' ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
                  Copy CSV
                </button>
              </div>
            </div>
          )}

          {analysisError && (
            <div className="mt-5 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 mt-0.5" />
              <div className="text-sm">{analysisError}</div>
            </div>
          )}
        </div>

        {analysisResults.length > 0 && (
          <div className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold text-white">Results</h2>

            {analysisResults.map((r) => {
              const score =
                (r.sources as any)?.overallThreatScore ??
                (r.sources as any)?.threatScore ??
                (r.sources as any)?.score ??
                0;

              const isExpanded = expandedResult === r.ioc;

              return (
                <div key={r.ioc} className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-slate-500">{r.type}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            r.verdict.severity === 'critical'
                              ? 'border-red-500/40 text-red-300 bg-red-500/10'
                              : r.verdict.severity === 'high'
                                ? 'border-orange-500/40 text-orange-300 bg-orange-500/10'
                                : r.verdict.severity === 'medium'
                                  ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                                  : r.verdict.severity === 'low'
                                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                                    : 'border-slate-500/40 text-slate-300 bg-slate-500/10'
                          }`}
                        >
                          {r.verdict.verdict} • {Math.round(r.verdict.confidence * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-sm text-slate-100 break-all">{r.ioc}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      <ThreatScore score={Number(score) || 0} size="sm" />
                      <button
                        onClick={() => addToWatchlist(r.ioc, r.type, r.verdict.verdict)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
                      >
                        <BookmarkPlus className="w-4 h-4" />
                        Watchlist
                      </button>
                      <button
                        onClick={() => createCaseNote(r.ioc, r.type, r.verdict.verdict)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
                      >
                        <FileText className="w-4 h-4" />
                        Case Note
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-200 mb-2">Evidence</div>
                      <ul className="space-y-1 text-sm text-slate-300 list-disc ml-5">
                        {(r.verdict.evidence || []).slice(0, 8).map((e, idx) => (
                          <li key={idx}>{e}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-200 mb-2">Recommended Actions</div>
                      <ul className="space-y-1 text-sm text-slate-300 list-disc ml-5">
                        {(r.verdict.recommendations || []).slice(0, 8).map((e, idx) => (
                          <li key={idx}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={() => setExpandedResult(isExpanded ? null : r.ioc)}
                      className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {isExpanded ? 'Hide raw sources' : 'Show raw sources'}
                    </button>
                    {isExpanded && (
                      <pre className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 overflow-auto">
                        {JSON.stringify(r.sources, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
