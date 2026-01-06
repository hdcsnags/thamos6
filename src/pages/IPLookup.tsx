import { useState } from 'react';
import { Search, Loader2, Copy, Check, Globe, Server, AlertTriangle, MapPin, Shield, Wifi, Building2, Clock, Radio, Ban, Activity, Flag } from 'lucide-react';
import { lookupIP, isValidIP } from '../lib/threatIntel';
import type { IPLookupResult } from '../types';
import ThreatScore from '../components/ThreatScore';
import SourceCard from '../components/SourceCard';

export default function IPLookup() {
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedIP = ip.trim();

    if (!trimmedIP) {
      setError('Please enter an IP address');
      return;
    }

    if (!isValidIP(trimmedIP)) {
      setError('Please enter a valid IP address');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await lookupIP(trimmedIP);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lookup IP');
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

  const sources = result ? Object.entries(result.sources || {}) : [];
  const enrichment = result?.enrichment;

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
          <Globe className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">IP Reputation Lookup</h1>
        <p className="text-slate-400">
          Check any IP address against 13+ threat intelligence sources simultaneously.
          Get comprehensive risk scoring, geolocation, VPN/TOR detection, and scanner analysis.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Server className="w-5 h-5 text-slate-500" />
          </div>
          <input
            type="text"
            value={ip}
            onChange={e => setIp(e.target.value)}
            placeholder="Enter IP address (e.g., 8.8.8.8)"
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
                Scanning...
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
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <ThreatScore score={result.overallThreatScore} size="lg" />
                <div>
                  <h2 className="text-2xl font-bold text-white font-mono">{result.ip}</h2>
                  <p className="text-slate-400 mt-1">
                    Checked at {new Date(result.checkedAt).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      result.isMalicious
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {result.isMalicious ? 'Potentially Malicious' : 'No Threats Detected'}
                    </span>
                    <span className="text-sm text-slate-500">
                      Max Score: {result.maxThreatScore}
                    </span>
                  </div>
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
                    Copy Results
                  </>
                )}
              </button>
            </div>
          </div>

          {enrichment && (
            <div className="space-y-6">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-cyan-400" />
                  Privacy & Anonymization Analysis
                </h3>

                <div className="space-y-3 mb-5">
                  <div className={`flex items-center justify-between p-4 rounded-lg ${enrichment.isTor ? 'bg-red-500/10 border border-red-500/30' : 'bg-slate-800/50'}`}>
                    <div className="flex items-center gap-3">
                      <svg className={`w-5 h-5 ${enrichment.isTor ? 'text-red-400' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                      </svg>
                      <div>
                        <span className="text-white font-semibold">Tor Exit Node</span>
                        <p className="text-xs text-slate-400">Checked against Tor Project exit list</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${enrichment.isTor ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {enrichment.isTor ? 'DETECTED' : 'Clean'}
                    </span>
                  </div>

                  <div className={`flex items-center justify-between p-4 rounded-lg ${enrichment.isVPN ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-slate-800/50'}`}>
                    <div className="flex items-center gap-3">
                      <Wifi className={`w-5 h-5 ${enrichment.isVPN ? 'text-orange-400' : 'text-slate-500'}`} />
                      <div className="flex-1">
                        <span className="text-white font-semibold">VPN</span>
                        {enrichment.vpnService && (
                          <p className="text-sm text-orange-300 font-medium mt-0.5">{enrichment.vpnService}</p>
                        )}
                        {!enrichment.vpnService && enrichment.isVPN && (
                          <p className="text-xs text-slate-400">Provider unknown</p>
                        )}
                        {!enrichment.isVPN && (
                          <p className="text-xs text-slate-400">Based on ASN & org heuristics</p>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${enrichment.isVPN ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {enrichment.isVPN ? 'DETECTED' : 'Clean'}
                    </span>
                  </div>

                  <div className={`flex items-center justify-between p-4 rounded-lg ${enrichment.isProxy ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-slate-800/50'}`}>
                    <div className="flex items-center gap-3">
                      <Server className={`w-5 h-5 ${enrichment.isProxy ? 'text-yellow-400' : 'text-slate-500'}`} />
                      <div>
                        <span className="text-white font-semibold">Proxy Server</span>
                        <p className="text-xs text-slate-400">
                          {enrichment.isProxy && enrichment.isHosting ? 'Datacenter proxy' :
                           enrichment.isProxy && !enrichment.isHosting ? 'Residential proxy' :
                           'No proxy detected'}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${enrichment.isProxy ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {enrichment.isProxy ? 'DETECTED' : 'Clean'}
                    </span>
                  </div>

                  {(() => {
                    const abuseData = result.sources?.abuseipdb;
                    const abuseScore = abuseData?.data?.data?.abuseConfidenceScore;
                    const totalReports = abuseData?.data?.data?.totalReports ?? 0;
                    const hasAbuseData = abuseScore !== undefined && abuseScore !== null;
                    const isAbusive = hasAbuseData && abuseScore > 25;
                    const noApiKey = abuseData?.error === 'API key not configured';

                    return (
                      <div className={`flex items-center justify-between p-4 rounded-lg ${
                        noApiKey ? 'bg-slate-800/50' :
                        isAbusive ? 'bg-red-500/10 border border-red-500/30' :
                        totalReports > 0 ? 'bg-yellow-500/10 border border-yellow-500/30' :
                        'bg-slate-800/50'
                      }`}>
                        <div className="flex items-center gap-3">
                          <Flag className={`w-5 h-5 ${
                            noApiKey ? 'text-slate-500' :
                            isAbusive ? 'text-red-400' :
                            totalReports > 0 ? 'text-yellow-400' :
                            'text-slate-500'
                          }`} />
                          <div className="flex-1">
                            <span className="text-white font-semibold">Abuse Reports</span>
                            {noApiKey && (
                              <p className="text-xs text-slate-400">API key not configured</p>
                            )}
                            {!noApiKey && hasAbuseData && (
                              <p className="text-xs text-slate-400">
                                {totalReports} report{totalReports !== 1 ? 's' : ''} - {abuseScore}% confidence
                                {abuseScore === 0 && totalReports > 0 && ' (old reports)'}
                                {abuseScore > 0 && abuseScore <= 25 && ' - Low risk'}
                                {abuseScore > 25 && abuseScore <= 75 && ' - Medium risk'}
                                {abuseScore > 75 && ' - High risk'}
                              </p>
                            )}
                            {!noApiKey && !hasAbuseData && (
                              <p className="text-xs text-slate-400">No data available</p>
                            )}
                          </div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                          noApiKey ? 'bg-slate-700/50 text-slate-400' :
                          isAbusive ? 'bg-red-500/20 text-red-400' :
                          totalReports > 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {noApiKey ? 'N/A' : isAbusive ? 'ABUSIVE' : totalReports > 0 ? 'REPORTED' : 'Clean'}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-sm text-slate-400">Hosting/DC</span>
                    <span className={`text-sm font-medium ${enrichment.isHosting ? 'text-blue-400' : 'text-slate-400'}`}>
                      {enrichment.isHosting ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-sm text-slate-400">Type Verdict</span>
                    <span className="text-sm font-medium text-white">
                      {enrichment.isHosting ? 'Likely Hosting' :
                       enrichment.isVPN || enrichment.isProxy || enrichment.isTor ? 'Anonymization' :
                       'Likely Residential'}
                    </span>
                  </div>
                  {enrichment.asn && (
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-sm text-slate-400">ASN</span>
                      <span className="text-sm font-medium text-white font-mono">{enrichment.asn}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-cyan-400" />
                    Location & Network
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Country</p>
                      <p className="text-white font-medium">
                        {enrichment.country || 'Unknown'}
                        {enrichment.countryCode && <span className="text-slate-400 ml-2">({enrichment.countryCode})</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">City</p>
                      <p className="text-white font-medium">{enrichment.city || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Region</p>
                      <p className="text-white font-medium">{enrichment.region || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Timezone</p>
                      <p className="text-white font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {enrichment.timezone || 'Unknown'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">ISP</p>
                      <p className="text-white font-medium">{enrichment.isp || 'Unknown'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Organization</p>
                      <p className="text-white font-medium flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {enrichment.org || 'Unknown'}
                      </p>
                    </div>
                  </div>
                </div>

                {(() => {
                  const abuseData = result.sources?.abuseipdb;
                  const abuseScore = abuseData?.data?.data?.abuseConfidenceScore;
                  const totalReports = abuseData?.data?.data?.totalReports ?? 0;
                  const isWhitelisted = abuseData?.data?.data?.isWhitelisted ?? false;
                  const usageType = abuseData?.data?.data?.usageType;
                  const lastReportedAt = abuseData?.data?.data?.lastReportedAt;
                  const hasAbuseData = abuseScore !== undefined && abuseScore !== null;
                  const noApiKey = abuseData?.error === 'API key not configured';

                  if (noApiKey || !hasAbuseData) {
                    return enrichment.isBot !== undefined && (
                      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-cyan-400" />
                          Bot Detection
                        </h3>
                        <div className={`flex items-center justify-between p-4 rounded-lg ${enrichment.isBot ? 'bg-red-500/10 border border-red-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
                          <div className="flex items-center gap-3">
                            <AlertTriangle className={`w-5 h-5 ${enrichment.isBot ? 'text-red-400' : 'text-emerald-400'}`} />
                            <span className="text-white font-medium">Bot Activity</span>
                          </div>
                          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${enrichment.isBot ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {enrichment.isBot ? 'DETECTED' : 'Clean'}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const isAbusive = abuseScore > 25;
                  const hasReports = totalReports > 0;

                  return (
                    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Flag className="w-5 h-5 text-cyan-400" />
                        AbuseIPDB Report
                      </h3>
                      <div className="space-y-3">
                        <div className={`flex items-center justify-between p-3 rounded-lg ${
                          isAbusive ? 'bg-red-500/10 border border-red-500/30' :
                          hasReports ? 'bg-yellow-500/10 border border-yellow-500/30' :
                          'bg-emerald-500/10 border border-emerald-500/30'
                        }`}>
                          <div>
                            <p className="text-white font-semibold">Confidence Score</p>
                            <p className="text-xs text-slate-400">{abuseScore}% abuse confidence</p>
                          </div>
                          <span className={`text-2xl font-bold ${
                            isAbusive ? 'text-red-400' :
                            hasReports ? 'text-yellow-400' :
                            'text-emerald-400'
                          }`}>
                            {abuseScore}%
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Reports</p>
                            <p className={`text-lg font-bold ${hasReports ? 'text-yellow-400' : 'text-white'}`}>
                              {totalReports}
                            </p>
                          </div>
                          <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Whitelisted</p>
                            <p className={`text-lg font-bold ${isWhitelisted ? 'text-emerald-400' : 'text-white'}`}>
                              {isWhitelisted ? 'Yes' : 'No'}
                            </p>
                          </div>
                        </div>

                        {usageType && (
                          <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Usage Type</p>
                            <p className="text-white font-medium">{usageType}</p>
                          </div>
                        )}

                        {lastReportedAt && (
                          <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Last Reported</p>
                            <p className="text-white font-medium text-sm">
                              {new Date(lastReportedAt).toLocaleDateString()} {new Date(lastReportedAt).toLocaleTimeString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {enrichment && (enrichment.isMassScanner !== undefined || enrichment.spamhausListed !== undefined) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Radio className="w-5 h-5 text-cyan-400" />
                  Scanner Intelligence (GreyNoise)
                </h3>
                <div className="space-y-3">
                  <div className={`flex items-center justify-between p-3 rounded-lg ${enrichment.isMassScanner ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-slate-800/50'}`}>
                    <div className="flex items-center gap-3">
                      <Activity className={`w-5 h-5 ${enrichment.isMassScanner ? 'text-orange-400' : 'text-slate-500'}`} />
                      <div>
                        <span className="text-white font-medium">Mass Scanner</span>
                        <p className="text-xs text-slate-400">Observed scanning the internet</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${enrichment.isMassScanner ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {enrichment.isMassScanner ? 'YES' : 'No'}
                    </span>
                  </div>

                  {enrichment.scannerType && (
                    <div className={`flex items-center justify-between p-3 rounded-lg ${
                      enrichment.scannerType === 'malicious' ? 'bg-red-500/10 border border-red-500/30' :
                      enrichment.scannerType === 'benign' ? 'bg-emerald-500/10 border border-emerald-500/30' :
                      'bg-slate-800/50'
                    }`}>
                      <div className="flex items-center gap-3">
                        <Shield className={`w-5 h-5 ${
                          enrichment.scannerType === 'malicious' ? 'text-red-400' :
                          enrichment.scannerType === 'benign' ? 'text-emerald-400' :
                          'text-yellow-400'
                        }`} />
                        <div>
                          <span className="text-white font-medium">Classification</span>
                          <p className="text-xs text-slate-400">GreyNoise assessment</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase ${
                        enrichment.scannerType === 'malicious' ? 'bg-red-500/20 text-red-400' :
                        enrichment.scannerType === 'benign' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {enrichment.scannerType}
                      </span>
                    </div>
                  )}

                  {!enrichment.isMassScanner && !enrichment.scannerType && (
                    <div className="p-3 bg-slate-800/50 rounded-lg">
                      <p className="text-sm text-slate-400 text-center">
                        IP not observed in mass scanning activity - likely targeted traffic
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Ban className="w-5 h-5 text-cyan-400" />
                  Blocklist Status (Spamhaus)
                </h3>
                <div className="space-y-3">
                  <div className={`flex items-center justify-between p-3 rounded-lg ${enrichment.spamhausListed ? 'bg-red-500/10 border border-red-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
                    <div className="flex items-center gap-3">
                      <Ban className={`w-5 h-5 ${enrichment.spamhausListed ? 'text-red-400' : 'text-emerald-400'}`} />
                      <div>
                        <span className="text-white font-medium">Spamhaus Listed</span>
                        <p className="text-xs text-slate-400">ZEN, SBL, XBL, PBL blocklists</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${enrichment.spamhausListed ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {enrichment.spamhausListed ? 'LISTED' : 'Clean'}
                    </span>
                  </div>

                  {enrichment.spamhausLists && enrichment.spamhausLists.length > 0 && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Listed On</p>
                      <div className="flex flex-wrap gap-2">
                        {enrichment.spamhausLists.map((list: string) => (
                          <span key={list} className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded font-medium">
                            {list}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {!enrichment.spamhausListed && (
                    <div className="p-3 bg-slate-800/50 rounded-lg">
                      <p className="text-sm text-slate-400 text-center">
                        IP is not listed on any Spamhaus blocklists
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

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
        </div>
      )}

      {!result && !loading && !error && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Sources Checked</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                'VirusTotal', 'AbuseIPDB', 'AlienVault OTX', 'Shodan',
                'IPQualityScore', 'ThreatFox', 'URLhaus', 'RDAP/WHOIS',
                'IP-API', 'ProxyCheck', 'GreyNoise', 'Spamhaus', 'ip.teoh.io'
              ].map(source => (
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
