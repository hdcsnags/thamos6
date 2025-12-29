import { useState } from 'react';
import { Bug, Search, Loader2, AlertTriangle, ExternalLink, Copy, Check, Calendar, Shield, AlertCircle } from 'lucide-react';

interface CVEResult {
  id: string;
  description: string;
  published: string;
  modified: string;
  cvssScore: number | null;
  cvssVector: string | null;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | null;
  cwe: string[];
  references: { url: string; source: string }[];
  affectedProducts: string[];
}

export default function CVELookup() {
  const [cveId, setCveId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CVEResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isValidCVE = (id: string): boolean => {
    return /^CVE-\d{4}-\d{4,}$/i.test(id.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = cveId.trim().toUpperCase();

    if (!trimmedId) {
      setError('Please enter a CVE ID');
      return;
    }

    if (!isValidCVE(trimmedId)) {
      setError('Please enter a valid CVE ID (e.g., CVE-2024-1234)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`https://cveawg.mitre.org/api/cve/${trimmedId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('CVE not found. It may not exist or may be reserved.');
        }
        throw new Error('Failed to fetch CVE data');
      }

      const data = await response.json();

      const cna = data.containers?.cna;
      const description = cna?.descriptions?.find((d: { lang: string }) => d.lang === 'en')?.value || 'No description available';

      const metrics = cna?.metrics?.[0];
      const cvssData = metrics?.cvssV3_1 || metrics?.cvssV3_0;

      const references = cna?.references?.map((ref: { url: string; name?: string }) => ({
        url: ref.url,
        source: ref.name || new URL(ref.url).hostname,
      })) || [];

      const affectedProducts = cna?.affected?.map((a: { vendor?: string; product?: string; versions?: { version: string }[] }) =>
        `${a.vendor || 'Unknown'} ${a.product || 'Unknown'}${a.versions?.[0]?.version ? ` (${a.versions[0].version})` : ''}`
      ) || [];

      const problemTypes = cna?.problemTypes?.flatMap((pt: { descriptions?: { cweId?: string }[] }) =>
        pt.descriptions?.map((d: { cweId?: string }) => d.cweId).filter(Boolean) || []
      ) || [];

      setResult({
        id: trimmedId,
        description,
        published: data.cveMetadata?.datePublished || 'Unknown',
        modified: data.cveMetadata?.dateUpdated || 'Unknown',
        cvssScore: cvssData?.baseScore || null,
        cvssVector: cvssData?.vectorString || null,
        severity: cvssData?.baseSeverity || null,
        cwe: problemTypes,
        references,
        affectedProducts,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lookup CVE');
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

  const getSeverityColor = (severity: string | null) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'LOW':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-400';
    if (score >= 9.0) return 'text-red-400';
    if (score >= 7.0) return 'text-orange-400';
    if (score >= 4.0) return 'text-yellow-400';
    return 'text-blue-400';
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
          <Bug className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">CVE Lookup</h1>
        <p className="text-slate-400">
          Search for Common Vulnerabilities and Exposures (CVE) to get detailed
          information including CVSS scores, affected products, and references.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Bug className="w-5 h-5 text-slate-500" />
          </div>
          <input
            type="text"
            value={cveId}
            onChange={e => setCveId(e.target.value.toUpperCase())}
            placeholder="Enter CVE ID (e.g., CVE-2024-1234)"
            className="w-full pl-12 pr-32 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
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
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex flex-col md:flex-row items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-white font-mono">{result.id}</h2>
                  {result.severity && (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getSeverityColor(result.severity)}`}>
                      {result.severity}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Published: {new Date(result.published).toLocaleDateString()}
                  </span>
                  {result.cvssScore !== null && (
                    <span className={`flex items-center gap-1 font-semibold ${getScoreColor(result.cvssScore)}`}>
                      <Shield className="w-4 h-4" />
                      CVSS: {result.cvssScore.toFixed(1)}
                    </span>
                  )}
                </div>
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
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <h3 className="text-sm font-medium text-slate-400 mb-2">Description</h3>
              <p className="text-white leading-relaxed">{result.description}</p>
            </div>

            {result.cvssVector && (
              <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-400 mb-2">CVSS Vector</h3>
                <code className="text-cyan-400 font-mono text-sm break-all">{result.cvssVector}</code>
              </div>
            )}
          </div>

          {result.affectedProducts.length > 0 && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-cyan-400" />
                Affected Products
              </h3>
              <div className="space-y-2">
                {result.affectedProducts.map((product, i) => (
                  <div key={i} className="p-3 bg-slate-800/50 rounded-lg text-white">
                    {product}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.cwe.length > 0 && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4">Weakness Types (CWE)</h3>
              <div className="flex flex-wrap gap-2">
                {result.cwe.map((cwe, i) => (
                  <a
                    key={i}
                    href={`https://cwe.mitre.org/data/definitions/${cwe.replace('CWE-', '')}.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-800 text-cyan-400 rounded-lg text-sm font-mono hover:bg-slate-700 transition-colors"
                  >
                    {cwe}
                  </a>
                ))}
              </div>
            </div>
          )}

          {result.references.length > 0 && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4">References</h3>
              <div className="space-y-2 max-h-64 overflow-auto">
                {result.references.map((ref, i) => (
                  <a
                    key={i}
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors group"
                  >
                    <ExternalLink className="w-4 h-4 flex-shrink-0 text-slate-500 group-hover:text-cyan-400" />
                    <span className="text-sm truncate">{ref.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
            <h3 className="font-semibold text-white mb-4">External Resources</h3>
            <div className="flex flex-wrap gap-3">
              <a
                href={`https://nvd.nist.gov/vuln/detail/${result.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                NVD
              </a>
              <a
                href={`https://www.cvedetails.com/cve/${result.id}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                CVE Details
              </a>
              <a
                href={`https://www.exploit-db.com/search?cve=${result.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Exploit-DB
              </a>
              <a
                href={`https://github.com/search?q=${result.id}&type=repositories`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                GitHub POCs
              </a>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Critical CVEs</h3>
            <div className="space-y-3">
              {[
                { id: 'CVE-2024-3400', name: 'Palo Alto PAN-OS Command Injection' },
                { id: 'CVE-2024-21762', name: 'Fortinet FortiOS RCE' },
                { id: 'CVE-2023-4966', name: 'Citrix Bleed' },
                { id: 'CVE-2023-46805', name: 'Ivanti Connect Secure Auth Bypass' },
              ].map(cve => (
                <button
                  key={cve.id}
                  onClick={() => {
                    setCveId(cve.id);
                  }}
                  className="w-full flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors text-left"
                >
                  <span className="text-cyan-400 font-mono">{cve.id}</span>
                  <span className="text-slate-400 text-sm">{cve.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
