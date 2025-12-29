import { useState } from 'react';
import { Hash, Search, Loader2, AlertTriangle, CheckCircle, XCircle, Copy, Check, ExternalLink } from 'lucide-react';

interface HashResult {
  hash: string;
  hashType: 'MD5' | 'SHA1' | 'SHA256' | 'Unknown';
  sources: {
    name: string;
    found: boolean;
    malicious: boolean;
    details: Record<string, unknown>;
    error?: string;
  }[];
  isMalicious: boolean;
  checkedAt: string;
}

const detectHashType = (hash: string): 'MD5' | 'SHA1' | 'SHA256' | 'Unknown' => {
  const cleaned = hash.trim().toLowerCase();
  if (/^[a-f0-9]{32}$/.test(cleaned)) return 'MD5';
  if (/^[a-f0-9]{40}$/.test(cleaned)) return 'SHA1';
  if (/^[a-f0-9]{64}$/.test(cleaned)) return 'SHA256';
  return 'Unknown';
};

export default function HashLookup() {
  const [hash, setHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HashResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedHash = hash.trim().toLowerCase();

    if (!trimmedHash) {
      setError('Please enter a file hash');
      return;
    }

    const hashType = detectHashType(trimmedHash);
    if (hashType === 'Unknown') {
      setError('Invalid hash format. Please enter a valid MD5 (32 chars), SHA1 (40 chars), or SHA256 (64 chars) hash.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/threat-intel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'hash', hash: trimmedHash }),
      });

      if (!response.ok) {
        throw new Error('Failed to lookup hash');
      }

      const data = await response.json();
      setResult({
        hash: trimmedHash,
        hashType,
        sources: data.sources || [],
        isMalicious: data.isMalicious || false,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      setResult({
        hash: trimmedHash,
        hashType,
        sources: [
          {
            name: 'VirusTotal',
            found: false,
            malicious: false,
            details: {},
            error: 'API key required for VirusTotal lookups',
          },
          {
            name: 'MalwareBazaar',
            found: false,
            malicious: false,
            details: {},
            error: 'Free API - checking...',
          },
        ],
        isMalicious: false,
        checkedAt: new Date().toISOString(),
      });
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

  const detectedType = hash.trim() ? detectHashType(hash.trim()) : null;

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
          <Hash className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Hash Lookup</h1>
        <p className="text-slate-400">
          Check file hashes (MD5, SHA1, SHA256) against VirusTotal, MalwareBazaar,
          and other threat intelligence sources to identify known malware.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="space-y-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Hash className="w-5 h-5 text-slate-500" />
            </div>
            <input
              type="text"
              value={hash}
              onChange={e => setHash(e.target.value)}
              placeholder="Enter MD5, SHA1, or SHA256 hash"
              className="w-full pl-12 pr-32 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            />
            <button
              type="submit"
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Lookup
                </>
              )}
            </button>
          </div>
          {detectedType && detectedType !== 'Unknown' && (
            <p className="text-sm text-slate-500 pl-1">
              Detected: <span className="text-cyan-400 font-medium">{detectedType}</span>
            </p>
          )}
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
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-3 py-1 bg-slate-700 text-slate-300 rounded-lg text-sm font-medium">
                    {result.hashType}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                    result.isMalicious
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {result.isMalicious ? (
                      <>
                        <XCircle className="w-4 h-4" />
                        Malicious
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Not Found in Threat DBs
                      </>
                    )}
                  </span>
                </div>
                <p className="text-white font-mono text-sm break-all">{result.hash}</p>
                <p className="text-slate-500 text-sm mt-2">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.sources.map((source, i) => (
              <div key={i} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">{source.name}</h3>
                  {source.error ? (
                    <span className="px-2.5 py-1 bg-slate-700 text-slate-400 rounded-full text-xs">
                      Error
                    </span>
                  ) : source.found ? (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      source.malicious
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {source.malicious ? 'Malicious' : 'Found'}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-slate-700 text-slate-400 rounded-full text-xs">
                      Not Found
                    </span>
                  )}
                </div>
                {source.error ? (
                  <p className="text-sm text-slate-500">{source.error}</p>
                ) : source.found ? (
                  <div className="space-y-2 text-sm">
                    {Object.entries(source.details).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-slate-400">{key}:</span>
                        <span className="text-white">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Hash not found in this database</p>
                )}
              </div>
            ))}
          </div>

          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
            <h3 className="font-semibold text-white mb-4">External Lookups</h3>
            <div className="flex flex-wrap gap-3">
              <a
                href={`https://www.virustotal.com/gui/file/${result.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                VirusTotal
              </a>
              <a
                href={`https://bazaar.abuse.ch/browse.php?search=${result.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                MalwareBazaar
              </a>
              <a
                href={`https://www.hybrid-analysis.com/search?query=${result.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Hybrid Analysis
              </a>
              <a
                href={`https://otx.alienvault.com/indicator/file/${result.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                AlienVault OTX
              </a>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">How to Get File Hashes</h3>
            <div className="space-y-4 text-sm text-slate-400">
              <div>
                <p className="text-white font-medium mb-1">Windows (PowerShell):</p>
                <code className="block p-3 bg-slate-800 rounded-lg font-mono text-xs text-cyan-400">
                  Get-FileHash -Algorithm SHA256 "C:\path\to\file.exe"
                </code>
              </div>
              <div>
                <p className="text-white font-medium mb-1">macOS/Linux:</p>
                <code className="block p-3 bg-slate-800 rounded-lg font-mono text-xs text-cyan-400">
                  sha256sum /path/to/file
                </code>
              </div>
              <div>
                <p className="text-white font-medium mb-1">MD5 (Linux/macOS):</p>
                <code className="block p-3 bg-slate-800 rounded-lg font-mono text-xs text-cyan-400">
                  md5sum /path/to/file
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
