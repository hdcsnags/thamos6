import { useState } from 'react';
import { Search, Loader2, Copy, Check, Link2, AlertTriangle, ExternalLink } from 'lucide-react';
import { scanURL, isValidURL } from '../lib/threatIntel';
import type { URLLookupResult } from '../types';
import SourceCard from '../components/SourceCard';

export default function URLScanner() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<URLLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedURL = url.trim();

    if (!trimmedURL) {
      setError('Please enter a URL');
      return;
    }

    let normalizedURL = trimmedURL;
    if (!normalizedURL.startsWith('http://') && !normalizedURL.startsWith('https://')) {
      normalizedURL = 'https://' + normalizedURL;
    }

    if (!isValidURL(normalizedURL)) {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await scanURL(normalizedURL);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan URL');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    const text = JSON.stringify(result, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sources = result ? Object.entries(result.results) : [];

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 mb-4">
          <Link2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">URL Scanner</h1>
        <p className="text-slate-400">
          Scan suspicious URLs for malware, phishing, and other threats.
          Submit to multiple scanning services for comprehensive analysis.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Link2 className="w-5 h-5 text-slate-500" />
          </div>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Enter URL to scan (e.g., https://example.com)"
            className="w-full pl-12 pr-32 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-medium rounded-lg hover:from-orange-400 hover:to-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Scan
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
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    result.isMalicious
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {result.isMalicious ? 'Potentially Malicious' : 'No Threats Detected'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-medium text-white truncate">{result.url}</h2>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-slate-400 text-sm mt-1">
                  Scanned at {new Date(result.checkedAt).toLocaleString()}
                </p>

                {result.threatTypes.length > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-sm text-slate-500">Detected threats:</span>
                    {result.threatTypes.map(type => (
                      <span
                        key={type}
                        className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                )}
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

          <div>
            <h3 className="text-lg font-semibold text-white mb-4">
              Source Results ({sources.length} sources checked)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sources.map(([source, data]) => (
                <SourceCard key={source} source={source} result={data} />
              ))}
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-400">Sandbox Analysis</h4>
                <p className="text-sm text-amber-400/80 mt-1">
                  For deeper analysis, URLScan.io will sandbox the URL and provide detailed screenshots,
                  DOM analysis, and network requests. Check the URLScan result link once the scan completes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">What We Check</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h4 className="font-medium text-white mb-2">VirusTotal</h4>
                <p className="text-sm text-slate-400">70+ antivirus engines scan the URL for known threats</p>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h4 className="font-medium text-white mb-2">URLScan.io</h4>
                <p className="text-sm text-slate-400">Sandbox analysis with screenshots and DOM inspection</p>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h4 className="font-medium text-white mb-2">URLhaus</h4>
                <p className="text-sm text-slate-400">Known malware distribution URLs from abuse.ch</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
