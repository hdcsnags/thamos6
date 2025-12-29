import { useState } from 'react';
import { Search, Loader2, Download, Layers, AlertTriangle, CheckCircle, XCircle, Info, MapPin, Server, Radio, Ban } from 'lucide-react';
import { bulkLookupIPs, isValidIP } from '../lib/threatIntel';
import type { BulkIPResult } from '../types';
import { ThreatBadge } from '../components/ThreatScore';

export default function BulkLookup() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BulkIPResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const parseIPs = (text: string): string[] => {
    const lines = text.split(/[\n,;]+/);
    const ips: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && isValidIP(trimmed)) {
        ips.push(trimmed);
      }
    }

    return [...new Set(ips)];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const ips = parseIPs(input);

    if (ips.length === 0) {
      setError('Please enter at least one valid IP address');
      return;
    }

    if (ips.length > 20) {
      setError('Maximum 20 IPs allowed per request');
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await bulkLookupIPs(ips);
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lookup IPs');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (results.length === 0) return;

    const headers = ['IP', 'Threat Score', 'Is Malicious', 'Country', 'City', 'ISP', 'Proxy', 'Hosting', 'Abuse Confidence', 'In ThreatFox', 'In URLhaus', 'Mass Scanner', 'GreyNoise Class', 'Spamhaus Listed', 'Spamhaus Lists'];
    const rows = results.map(r => [
      r.ip,
      r.threatScore,
      r.isMalicious ? 'Yes' : 'No',
      r.country ?? 'N/A',
      r.city ?? 'N/A',
      r.isp ?? 'N/A',
      r.isProxy ? 'Yes' : 'No',
      r.isHosting ? 'Yes' : 'No',
      r.abuseConfidence ?? 'N/A',
      r.inThreatFox ? 'Yes' : 'No',
      r.inURLhaus ? 'Yes' : 'No',
      r.isMassScanner ? 'Yes' : 'No',
      r.greynoiseClassification ?? 'N/A',
      r.spamhausListed ? 'Yes' : 'No',
      r.spamhausLists?.join('; ') ?? 'N/A'
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threat-intel-bulk-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maliciousCount = results.filter(r => r.isMalicious).length;
  const cleanCount = results.length - maliciousCount;
  const proxyCount = results.filter(r => r.isProxy || r.isHosting).length;
  const scannerCount = results.filter(r => r.isMassScanner).length;
  const blockedCount = results.filter(r => r.spamhausListed).length;

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4">
          <Layers className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Bulk IP Lookup</h1>
        <p className="text-slate-400">
          Paste multiple IPs from your logs to quickly identify threats.
          Get location, proxy detection, and threat intelligence for each IP.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Enter IP addresses (one per line, or comma/semicolon separated)
          </label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="192.168.1.1&#10;10.0.0.1&#10;8.8.8.8"
            rows={8}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-mono text-sm resize-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Info className="w-4 h-4" />
            <span>Maximum 20 IPs per request</span>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium rounded-lg hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Analyze IPs
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

      {results.length > 0 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-slate-400 text-sm">{maliciousCount} Malicious</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-slate-400 text-sm">{cleanCount} Clean</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-slate-400 text-sm">{proxyCount} Proxy/DC</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="text-slate-400 text-sm">{scannerCount} Scanners</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-600" />
                <span className="text-slate-400 text-sm">{blockedCount} Blocklisted</span>
              </div>
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">IP Address</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Location</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Scanner</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Blocklist</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Intel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {results.map((result, idx) => (
                    <tr
                      key={idx}
                      className={`${result.isMalicious ? 'bg-red-500/5' : ''} hover:bg-slate-800/50 transition-colors`}
                    >
                      <td className="px-3 py-3">
                        {result.isMalicious ? (
                          <XCircle className="w-5 h-5 text-red-400" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-mono text-white text-sm">{result.ip}</span>
                      </td>
                      <td className="px-3 py-3">
                        {result.country ? (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-sm text-white">
                              {result.city && `${result.city}, `}{result.countryCode || result.country}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-sm">Unknown</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {result.isProxy && (
                            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded">Proxy</span>
                          )}
                          {result.isHosting && (
                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded flex items-center gap-0.5">
                              <Server className="w-3 h-3" />
                              DC
                            </span>
                          )}
                          {!result.isProxy && !result.isHosting && (
                            <span className="text-slate-500 text-xs">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <ThreatBadge score={result.threatScore} />
                      </td>
                      <td className="px-3 py-3">
                        {result.isMassScanner ? (
                          <div className="flex items-center gap-1">
                            <Radio className="w-3.5 h-3.5 text-orange-400" />
                            <span className={`text-xs font-medium ${
                              result.greynoiseClassification === 'malicious' ? 'text-red-400' :
                              result.greynoiseClassification === 'benign' ? 'text-emerald-400' :
                              'text-orange-400'
                            }`}>
                              {result.greynoiseClassification || 'unknown'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {result.spamhausListed ? (
                          <div className="flex items-center gap-1" title={result.spamhausLists?.join(', ')}>
                            <Ban className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-xs font-medium text-red-400">
                              {result.spamhausLists?.length || 1}
                            </span>
                          </div>
                        ) : (
                          <span className="text-emerald-400 text-xs">Clean</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {result.inThreatFox && (
                            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded">TF</span>
                          )}
                          {result.inURLhaus && (
                            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded">UH</span>
                          )}
                          {!result.inThreatFox && !result.inURLhaus && (
                            <span className="text-emerald-400 text-xs">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {results.length === 0 && !loading && !error && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Check Sources</h3>
            <p className="text-slate-400 text-sm mb-4">
              Bulk lookups include location data, scanner detection, blocklist status, and threat intel:
            </p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {['IP-API', 'AbuseIPDB', 'ThreatFox', 'URLhaus', 'GreyNoise', 'Spamhaus'].map(source => (
                <div key={source} className="p-3 bg-slate-800/50 rounded-lg text-center">
                  <span className="text-sm text-slate-400">{source}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
