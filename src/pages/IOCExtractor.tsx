import { useState } from 'react';
import { FileSearch, Copy, Check, Trash2, ExternalLink, Search, Play, AlertTriangle, Shield, Download, Plus, BookmarkPlus, FileText, ChevronDown, ChevronUp, Ban, KeyRound, ArrowUpCircle } from 'lucide-react';
import { bulkLookupIPs } from '../lib/threatIntel';
import { classifyIPVerdict, classifyDomainVerdict, classifyURLVerdict, classifyHashVerdict, exportToCSV, exportToJSON, exportToPlainText, exportToDefanged, IOCAnalysisResult } from '../lib/iocAnalysis';
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

export default function IOCExtractor() {
  const [input, setInput] = useState('');
  const [iocs, setIocs] = useState<ExtractedIOCs | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<IOCAnalysisResult[]>([]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'fast' | 'full'>('fast');

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
  };

  const handleExtract = () => {
    if (!input.trim()) return;
    setIocs(extractIOCs(input));
    setAnalysisResults([]);
    setExpandedResult(null);
  };

  const handleAnalyze = async () => {
    if (!iocs) return;

    setAnalyzing(true);
    const results: IOCAnalysisResult[] = [];

    try {
      const ipsToAnalyze = analysisMode === 'fast' ? iocs.ips.slice(0, 10) : iocs.ips;

      const { results: bulkResults } = await bulkLookupIPs(ipsToAnalyze);

      for (const ipData of bulkResults) {
        const enrichment = {
          isTor: ipData.isTor || false,
          isVPN: ipData.isVPN || false,
          isProxy: ipData.isProxy || false,
          isHosting: ipData.isHosting || false,
          vpnService: ipData.vpnService || '',
          country: ipData.country || '',
          isp: ipData.isp || '',
          org: ipData.org || '',
          spamhausListed: ipData.spamhausListed || false,
          spamhausLists: ipData.spamhausLists || [],
          isMassScanner: ipData.isMassScanner || false,
          isKnownScanner: ipData.greynoiseClassification === 'benign' || false,
          scannerType: ipData.greynoiseClassification || ''
        };

        const mockData = {
          overallThreatScore: ipData.threatScore,
          isMalicious: ipData.isMalicious,
          sources: {
            abuseipdb: { totalReports: 0, abuseConfidenceScore: ipData.abuseConfidence || 0 }
          }
        };

        const verdict = classifyIPVerdict(mockData, enrichment);

        results.push({
          ioc: ipData.ip,
          type: 'ip',
          verdict,
          sources: {},
          enrichment,
          checkedAt: new Date().toISOString()
        });
      }

      setAnalysisResults(results);
    } catch (error) {
      console.error('Failed to analyze IPs:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddToWatchlist = async (ioc: string, type: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to add items to watchlist');
        return;
      }

      await supabase.from('watchlist_entries').insert({
        user_id: user.id,
        entry_type: type,
        value: ioc,
        severity: 'medium',
        is_active: true
      });

      alert('Added to watchlist');
    } catch (error) {
      console.error('Failed to add to watchlist:', error);
      alert('Failed to add to watchlist');
    }
  };

  const handleCreateCase = async (ioc: string, type: string, verdict: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to create case notes');
        return;
      }

      const { error } = await supabase.from('case_notes').insert({
        title: `Investigation: ${type.toUpperCase()} - ${ioc}`,
        description: `Automated case created from Smart IOC Intake\n\nVerdict: ${verdict}\n\nIOC: ${ioc}`,
        status: 'open',
        priority: 'medium',
        iocs: [{ type, value: ioc, notes: `Verdict: ${verdict}` }],
        tags: ['automated', type]
      });

      if (error) throw error;
      alert('Case note created successfully');
    } catch (error) {
      console.error('Failed to create case:', error);
      alert('Failed to create case note');
    }
  };

  const handleExport = (format: 'csv' | 'json' | 'plain' | 'defanged') => {
    if (analysisResults.length === 0) return;

    let content = '';
    let filename = '';
    let mimeType = '';

    switch (format) {
      case 'csv':
        content = exportToCSV(analysisResults);
        filename = 'ioc-analysis.csv';
        mimeType = 'text/csv';
        break;
      case 'json':
        content = exportToJSON(analysisResults);
        filename = 'ioc-analysis.json';
        mimeType = 'application/json';
        break;
      case 'plain':
        content = exportToPlainText(analysisResults);
        filename = 'ioc-analysis.txt';
        mimeType = 'text/plain';
        break;
      case 'defanged':
        content = exportToDefanged(analysisResults);
        filename = 'ioc-defanged.txt';
        mimeType = 'text/plain';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async (items: string[], type: string) => {
    await navigator.clipboard.writeText(items.join('\n'));
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyAll = async () => {
    if (!iocs) return;
    const all = [
      ...iocs.ips.map(i => `IP: ${i}`),
      ...iocs.ipv6.map(i => `IPv6: ${i}`),
      ...iocs.urls.map(u => `URL: ${u}`),
      ...iocs.domains.map(d => `Domain: ${d}`),
      ...iocs.emails.map(e => `Email: ${e}`),
      ...iocs.md5.map(h => `MD5: ${h}`),
      ...iocs.sha1.map(h => `SHA1: ${h}`),
      ...iocs.sha256.map(h => `SHA256: ${h}`),
      ...iocs.cves.map(c => `CVE: ${c}`),
    ];
    await navigator.clipboard.writeText(all.join('\n'));
    setCopied('all');
    setTimeout(() => setCopied(null), 2000);
  };

  const totalCount = iocs ?
    iocs.ips.length + iocs.ipv6.length + iocs.urls.length + iocs.domains.length +
    iocs.emails.length + iocs.md5.length + iocs.sha1.length + iocs.sha256.length + iocs.cves.length : 0;

  const IOCSection = ({ title, items, type, color }: { title: string; items: string[]; type: string; color: string }) => {
    if (items.length === 0) return null;
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${color}`}>
              {items.length}
            </span>
            <h3 className="font-semibold text-white">{title}</h3>
          </div>
          <button
            onClick={() => handleCopy(items, type)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
          >
            {copied === type ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
        </div>
        <div className="p-4 max-h-64 overflow-auto">
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between group p-2 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors">
                <code className="text-sm text-slate-300 font-mono break-all">{item}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
          <FileSearch className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Smart IOC Intake</h1>
        <p className="text-slate-400">
          Paste raw logs, emails, reports, or any text to automatically extract and analyze
          IPs, URLs, domains, hashes, emails, and CVEs. Get instant verdicts with confidence scores.
        </p>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-300">
              Paste Text to Extract & Analyze IOCs
            </label>
            <button
              onClick={() => {
                setInput('');
                setIocs(null);
                setAnalysisResults([]);
                setExpandedResult(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste logs, threat reports, emails, or any text containing IOCs...&#10;&#10;Supports:&#10;- IPv4 & IPv6 addresses&#10;- URLs (including hxxp defanged)&#10;- Domains (including [.] defanged)&#10;- Email addresses&#10;- MD5, SHA1, SHA256 hashes&#10;- CVE identifiers&#10;- Automatically unwraps SafeLinks and ProofPoint URLs"
            className="w-full h-48 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleExtract}
              disabled={!input.trim()}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <FileSearch className="w-4 h-4" />
              Extract IOCs
            </button>
          </div>
        </div>
      </div>

      {iocs && (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-semibold">
                {totalCount} IOCs Found
              </span>
            </div>
            <div className="flex gap-2">
              {iocs.ips.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg">
                    <button
                      onClick={() => setAnalysisMode('fast')}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        analysisMode === 'fast'
                          ? 'bg-emerald-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Fast (10)
                    </button>
                    <button
                      onClick={() => setAnalysisMode('full')}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        analysisMode === 'full'
                          ? 'bg-emerald-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Full ({iocs.ips.length})
                    </button>
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all font-medium"
                  >
                    {analyzing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Analyze IPs
                      </>
                    )}
                  </button>
                </>
              )}
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                {copied === 'all' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy All
                  </>
                )}
              </button>
            </div>
          </div>

          {analysisResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  Analysis Results
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExport('csv')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    JSON
                  </button>
                  <button
                    onClick={() => handleExport('plain')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Text
                  </button>
                </div>
              </div>

              {analysisResults.map((result) => (
                <div
                  key={result.ioc}
                  className={`bg-slate-900 rounded-xl border-2 transition-all ${
                    result.verdict.severity === 'critical' ? 'border-red-500/50' :
                    result.verdict.severity === 'high' ? 'border-orange-500/50' :
                    result.verdict.severity === 'medium' ? 'border-yellow-500/50' :
                    result.verdict.severity === 'low' ? 'border-blue-500/50' :
                    'border-slate-700'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <code className="text-lg font-semibold text-white font-mono">{result.ioc}</code>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase bg-${result.verdict.color}-500/20 text-${result.verdict.color}-400`}>
                            {result.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-3 py-1 rounded-lg text-sm font-semibold bg-${result.verdict.color}-500/20 text-${result.verdict.color}-400`}>
                            {result.verdict.verdict}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-xs">
                            Confidence: {result.verdict.confidence}%
                          </span>
                          {result.verdict.badges.map((badge, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-xs">
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Evidence</h4>
                        <ul className="space-y-1">
                          {result.verdict.evidence.map((ev, i) => (
                            <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                              <span className="text-cyan-400 mt-1">•</span>
                              <span>{ev}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Recommendations</h4>
                        <ul className="space-y-1">
                          {result.verdict.recommendations.map((rec, i) => (
                            <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                              <span className="text-amber-400 mt-1">→</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {result.sources && Object.keys(result.sources).length > 0 && (
                        <div>
                          <button
                            onClick={() => setExpandedResult(expandedResult === result.ioc ? null : result.ioc)}
                            className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase hover:text-slate-300 transition-colors"
                          >
                            {expandedResult === result.ioc ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                            Raw Threat Intel Data
                          </button>
                          {expandedResult === result.ioc && (
                            <div className="mt-2 bg-slate-800/50 rounded-lg p-3 max-h-96 overflow-auto">
                              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
                                {JSON.stringify(result.sources, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {(result.verdict.severity === 'critical' || result.verdict.severity === 'high' || result.verdict.severity === 'medium') && (
                      <div className="bg-slate-800/50 rounded-lg p-4 border-l-4 border-amber-500">
                        <h4 className="text-xs font-semibold text-amber-400 uppercase mb-2">Operations Decision</h4>
                        <div className="space-y-2">
                          {result.verdict.severity === 'critical' && (
                            <>
                              <div className="flex items-start gap-2 text-sm">
                                <Ban className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <span className="text-slate-300"><span className="font-semibold text-red-400">BLOCK:</span> Add to firewall/WAF blocklist immediately</span>
                              </div>
                              <div className="flex items-start gap-2 text-sm">
                                <KeyRound className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                                <span className="text-slate-300"><span className="font-semibold text-orange-400">PASSWORD RESET:</span> Force password reset if any successful authentication</span>
                              </div>
                              <div className="flex items-start gap-2 text-sm">
                                <ArrowUpCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                                <span className="text-slate-300"><span className="font-semibold text-yellow-400">ESCALATE:</span> Create incident ticket and notify security team</span>
                              </div>
                            </>
                          )}
                          {result.verdict.severity === 'high' && (
                            <>
                              <div className="flex items-start gap-2 text-sm">
                                <Ban className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                                <span className="text-slate-300"><span className="font-semibold text-orange-400">BLOCK:</span> Consider adding to blocklist after log review</span>
                              </div>
                              <div className="flex items-start gap-2 text-sm">
                                <ArrowUpCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                <span className="text-slate-300"><span className="font-semibold text-amber-400">ESCALATE:</span> Create case note and monitor for 24 hours</span>
                              </div>
                            </>
                          )}
                          {result.verdict.severity === 'medium' && result.enrichment?.isTor && (
                            <>
                              <div className="flex items-start gap-2 text-sm">
                                <Ban className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                <span className="text-slate-300"><span className="font-semibold text-amber-400">BLOCK:</span> Recommended unless Tor access is required</span>
                              </div>
                              <div className="flex items-start gap-2 text-sm">
                                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                                <span className="text-slate-300"><span className="font-semibold text-yellow-400">MONITOR:</span> Review authentication attempts and behavior patterns</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-3 border-t border-slate-800">
                      <button
                        onClick={() => handleAddToWatchlist(result.ioc, result.type)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Add to Watchlist
                      </button>
                      <button
                        onClick={() => handleCreateCase(result.ioc, result.type, result.verdict.verdict)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Create Case
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalCount === 0 ? (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 text-center">
              <p className="text-slate-400">No IOCs found in the provided text.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <IOCSection title="IPv4 Addresses" items={iocs.ips} type="ips" color="bg-blue-500/20 text-blue-400" />
              <IOCSection title="IPv6 Addresses" items={iocs.ipv6} type="ipv6" color="bg-blue-500/20 text-blue-400" />
              <IOCSection title="URLs" items={iocs.urls} type="urls" color="bg-emerald-500/20 text-emerald-400" />
              <IOCSection title="Domains" items={iocs.domains} type="domains" color="bg-teal-500/20 text-teal-400" />
              <IOCSection title="Email Addresses" items={iocs.emails} type="emails" color="bg-amber-500/20 text-amber-400" />
              <IOCSection title="MD5 Hashes" items={iocs.md5} type="md5" color="bg-rose-500/20 text-rose-400" />
              <IOCSection title="SHA1 Hashes" items={iocs.sha1} type="sha1" color="bg-orange-500/20 text-orange-400" />
              <IOCSection title="SHA256 Hashes" items={iocs.sha256} type="sha256" color="bg-red-500/20 text-red-400" />
              <IOCSection title="CVE Identifiers" items={iocs.cves} type="cves" color="bg-fuchsia-500/20 text-fuchsia-400" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
