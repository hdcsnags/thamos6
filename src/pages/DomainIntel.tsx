import { useState } from 'react';
import { Globe, Search, Loader2, AlertTriangle, Copy, Check, ExternalLink, Calendar, Server, Shield, Building } from 'lucide-react';

interface WhoisData {
  domainName: string;
  registrar: string;
  registrarUrl: string;
  creationDate: string;
  expirationDate: string;
  updatedDate: string;
  status: string[];
  nameServers: string[];
  dnssec: string;
}

interface DnsRecords {
  a: string[];
  aaaa: string[];
  mx: { priority: number; host: string }[];
  ns: string[];
  txt: string[];
  cname: string[];
}

interface SslInfo {
  issuer: string;
  validFrom: string;
  validTo: string;
  protocol: string;
  grade: string;
}

interface DomainResult {
  domain: string;
  whois: WhoisData | null;
  dns: DnsRecords | null;
  ssl: SslInfo | null;
  ageInDays: number | null;
  isSuspicious: boolean;
  suspiciousReasons: string[];
  checkedAt: string;
}

export default function DomainIntel() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const extractDomain = (input: string): string => {
    let cleaned = input.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//, '');
    cleaned = cleaned.replace(/^www\./, '');
    cleaned = cleaned.split('/')[0];
    cleaned = cleaned.split('?')[0];
    cleaned = cleaned.split('#')[0];
    cleaned = cleaned.replace(/\[\.\]/g, '.');
    return cleaned;
  };

  const isValidDomain = (d: string): boolean => {
    const pattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
    return pattern.test(d);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedDomain = extractDomain(domain);

    if (!cleanedDomain) {
      setError('Please enter a domain');
      return;
    }

    if (!isValidDomain(cleanedDomain)) {
      setError('Please enter a valid domain (e.g., example.com)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const dnsResponse = await fetch(`https://dns.google/resolve?name=${cleanedDomain}&type=A`);
      const dnsData = await dnsResponse.json();

      const aRecords = dnsData.Answer?.filter((r: { type: number }) => r.type === 1).map((r: { data: string }) => r.data) || [];

      const mxResponse = await fetch(`https://dns.google/resolve?name=${cleanedDomain}&type=MX`);
      const mxData = await mxResponse.json();
      const mxRecords = mxData.Answer?.filter((r: { type: number }) => r.type === 15).map((r: { data: string }) => {
        const parts = r.data.split(' ');
        return { priority: parseInt(parts[0]), host: parts[1]?.replace(/\.$/, '') };
      }) || [];

      const nsResponse = await fetch(`https://dns.google/resolve?name=${cleanedDomain}&type=NS`);
      const nsData = await nsResponse.json();
      const nsRecords = nsData.Answer?.filter((r: { type: number }) => r.type === 2).map((r: { data: string }) => r.data.replace(/\.$/, '')) || [];

      const txtResponse = await fetch(`https://dns.google/resolve?name=${cleanedDomain}&type=TXT`);
      const txtData = await txtResponse.json();
      const txtRecords = txtData.Answer?.filter((r: { type: number }) => r.type === 16).map((r: { data: string }) => r.data.replace(/^"|"$/g, '')) || [];

      const suspiciousReasons: string[] = [];

      const suspiciousTLDs = ['.xyz', '.top', '.click', '.loan', '.online', '.site', '.club', '.win', '.bid', '.stream'];
      if (suspiciousTLDs.some(tld => cleanedDomain.endsWith(tld))) {
        suspiciousReasons.push('Domain uses a commonly abused TLD');
      }

      if (cleanedDomain.split('.')[0].length > 20) {
        suspiciousReasons.push('Unusually long subdomain (possible DGA)');
      }

      const hasSPF = txtRecords.some((r: string) => r.includes('v=spf1'));
      const hasDMARC = txtRecords.some((r: string) => r.includes('v=DMARC1'));
      if (!hasSPF) suspiciousReasons.push('No SPF record found');
      if (!hasDMARC) suspiciousReasons.push('No DMARC record found');

      setResult({
        domain: cleanedDomain,
        whois: null,
        dns: {
          a: aRecords,
          aaaa: [],
          mx: mxRecords,
          ns: nsRecords,
          txt: txtRecords,
          cname: [],
        },
        ssl: null,
        ageInDays: null,
        isSuspicious: suspiciousReasons.length > 2,
        suspiciousReasons,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError('Failed to lookup domain. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
          <Globe className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Domain Intelligence</h1>
        <p className="text-slate-400">
          Get comprehensive information about any domain including DNS records,
          WHOIS data, SSL certificate details, and domain age analysis.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Globe className="w-5 h-5 text-slate-500" />
          </div>
          <input
            type="text"
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="Enter domain (e.g., example.com)"
            className="w-full pl-12 pr-32 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Looking up...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Lookup
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="max-w-2xl mx-auto p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
          {result.suspiciousReasons.length > 0 && (
            <div className={`p-4 rounded-xl ${
              result.isSuspicious
                ? 'bg-red-500/10 border border-red-500/30'
                : 'bg-amber-500/10 border border-amber-500/30'
            }`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  result.isSuspicious ? 'text-red-400' : 'text-amber-400'
                }`} />
                <div>
                  <h3 className={`font-semibold mb-2 ${
                    result.isSuspicious ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {result.isSuspicious ? 'Suspicious Domain' : 'Warnings'}
                  </h3>
                  <ul className="space-y-1">
                    {result.suspiciousReasons.map((reason, i) => (
                      <li key={i} className={`text-sm ${
                        result.isSuspicious ? 'text-red-300' : 'text-amber-300'
                      }`}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">{result.domain}</h2>
                <p className="text-slate-400 mt-1">
                  Checked at {new Date(result.checkedAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Results
                  </>
                )}
              </button>
            </div>
          </div>

          {result.dns && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Server className="w-5 h-5 text-cyan-400" />
                DNS Records
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">A Records (IPv4)</p>
                  {result.dns.a.length > 0 ? (
                    <div className="space-y-1">
                      {result.dns.a.map((ip, i) => (
                        <code key={i} className="block text-sm text-cyan-400 font-mono">{ip}</code>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">No A records found</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Name Servers</p>
                  {result.dns.ns.length > 0 ? (
                    <div className="space-y-1">
                      {result.dns.ns.map((ns, i) => (
                        <code key={i} className="block text-sm text-white font-mono">{ns}</code>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">No NS records found</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">MX Records (Mail)</p>
                  {result.dns.mx.length > 0 ? (
                    <div className="space-y-1">
                      {result.dns.mx.map((mx, i) => (
                        <code key={i} className="block text-sm text-white font-mono">
                          <span className="text-slate-400">{mx.priority}</span> {mx.host}
                        </code>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">No MX records found</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">TXT Records</p>
                  {result.dns.txt.length > 0 ? (
                    <div className="space-y-2 max-h-32 overflow-auto">
                      {result.dns.txt.map((txt, i) => (
                        <code key={i} className="block text-xs text-slate-300 font-mono bg-slate-800 p-2 rounded break-all">{txt}</code>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">No TXT records found</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
            <h3 className="font-semibold text-white mb-4">External Lookups</h3>
            <div className="flex flex-wrap gap-3">
              <a
                href={`https://www.whois.com/whois/${result.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                WHOIS
              </a>
              <a
                href={`https://www.virustotal.com/gui/domain/${result.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                VirusTotal
              </a>
              <a
                href={`https://urlscan.io/search/#domain:${result.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                URLScan
              </a>
              <a
                href={`https://www.ssllabs.com/ssltest/analyze.html?d=${result.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                SSL Labs
              </a>
              <a
                href={`https://securitytrails.com/domain/${result.domain}/dns`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                SecurityTrails
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
