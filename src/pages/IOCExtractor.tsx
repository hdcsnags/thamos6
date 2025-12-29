import { useState } from 'react';
import { FileSearch, Copy, Check, Trash2, ExternalLink, Search } from 'lucide-react';

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

  const extractIOCs = (text: string): ExtractedIOCs => {
    const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:|\b(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b/g;
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const defangedUrlRegex = /hxxps?:\/\/[^\s<>"{}|\\^`\[\]]+|https?\[:\]\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const domainRegex = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|edu|gov|mil|int|io|co|uk|de|fr|jp|cn|ru|br|in|au|info|biz|xyz|online|site|app|dev|tech|cloud|ai|me|tv|cc|ws|to|ly|gl|bit|goo|gg|zip|mov|ninja|top|wang|win|bid|party|stream|download|racing|review|trade|webcam|date|faith|accountant|science|loan|men|work|click|link|help|gift|pics|photo|hosting|world|email|live|systems|software|solutions|network|digital|media|agency|services|group|company|ltd|limited)\b/gi;
    const defangedDomainRegex = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\[\.\])+[a-zA-Z]{2,}\b/gi;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const defangedEmailRegex = /\b[A-Za-z0-9._%+-]+\[@\][A-Za-z0-9.-]+\[\.\][A-Z|a-z]{2,}\b/gi;
    const md5Regex = /\b[a-fA-F0-9]{32}\b/g;
    const sha1Regex = /\b[a-fA-F0-9]{40}\b/g;
    const sha256Regex = /\b[a-fA-F0-9]{64}\b/g;
    const cveRegex = /CVE-\d{4}-\d{4,}/gi;

    const refang = (str: string): string => {
      return str
        .replace(/\[\.\]/g, '.')
        .replace(/\[@\]/g, '@')
        .replace(/hxxp/gi, 'http')
        .replace(/\[:\]/g, ':');
    };

    const dedup = (arr: string[]): string[] => [...new Set(arr)];

    const ips = dedup([
      ...(text.match(ipv4Regex) || []),
    ]).filter(ip => !ip.startsWith('0.') && !ip.startsWith('255.'));

    const ipv6 = dedup(text.match(ipv6Regex) || []);

    const urls = dedup([
      ...(text.match(urlRegex) || []),
      ...(text.match(defangedUrlRegex) || []).map(refang),
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
                {(type === 'ips' || type === 'domains') && (
                  <a
                    href={`#`}
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-cyan-400 transition-all"
                    title="Lookup"
                  >
                    <Search className="w-4 h-4" />
                  </a>
                )}
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
        <h1 className="text-3xl font-bold text-white mb-2">IOC Extractor</h1>
        <p className="text-slate-400">
          Paste raw logs, emails, reports, or any text to automatically extract
          IPs, URLs, domains, hashes, emails, and CVEs. Supports defanged indicators.
        </p>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-300">
              Paste Text to Extract IOCs
            </label>
            <button
              onClick={() => {
                setInput('');
                setIocs(null);
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
            placeholder="Paste logs, threat reports, emails, or any text containing IOCs...&#10;&#10;Supports:&#10;- IPv4 & IPv6 addresses&#10;- URLs (including hxxp defanged)&#10;- Domains (including [.] defanged)&#10;- Email addresses&#10;- MD5, SHA1, SHA256 hashes&#10;- CVE identifiers"
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
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
            >
              {copied === 'all' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  Copied All
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy All IOCs
                </>
              )}
            </button>
          </div>

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
