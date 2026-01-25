import { useEffect, useState } from 'react';
import { Globe, AlertTriangle, Shield, Database, MapPin, Server } from 'lucide-react';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult } from '../../types';
import KeyFacts from '../../components/scanner/KeyFacts';
import SourceStatus, { type Source, type SourceState } from '../../components/scanner/SourceStatus';
import EvidenceCard from '../../components/scanner/EvidenceCard';
import VarianceCard from '../../components/scanner/VarianceCard';
import RawJsonCollapse from '../../components/scanner/RawJsonCollapse';
import ActionsBar from '../../components/scanner/ActionsBar';

interface IPResultProps {
  ip: string;
}

export default function IPResult({ ip }: IPResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [sources, setSources] = useState<Source[]>([
    { name: 'AbuseIPDB', state: 'pending', icon: AlertTriangle },
    { name: 'ipinfo', state: 'pending', icon: Globe },
    { name: 'ProxyCheck', state: 'pending', icon: Database },
  ]);

  useEffect(() => {
    const performLookup = async () => {
      setLoading(true);
      setError('');
      setSources(prev => prev.map(s => ({ ...s, state: 'loading' as SourceState })));

      try {
        const data = await lookupIP(ip);
        setResult(data);

        const resultsData = data.results || data.sources || {};

        setSources(prev => prev.map(source => {
          const sourceKey = source.name.toLowerCase().replace(/\s/g, '');
          const sourceData = resultsData[sourceKey];
          const hasError = sourceData?.error;
          const hasData = sourceData && !hasError;

          return {
            ...source,
            state: hasError ? 'error' : hasData ? 'success' : 'disabled'
          };
        }));
      } catch (err: any) {
        setError(err.message || 'Failed to lookup IP');
        setSources(prev => prev.map(s => ({ ...s, state: 'error' as SourceState })));
      } finally {
        setLoading(false);
      }
    };

    performLookup();
  }, [ip]);

  if (loading && !result) {
    return (
      <div className="space-y-6">
        <SourceStatus sources={sources} />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">Analyzing IP address...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 text-center">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const enrichment = result.enrichment || {};
  const resultsData = result.results || result.sources || {};
  const abuseData = resultsData.abuseipdb?.data as any;
  const proxyData = resultsData.proxycheck?.data as any;
  const ipinfoData = resultsData.ipinfo?.data as any;

  const keyFacts = [
    {
      label: 'Country',
      value: enrichment.country || 'Unknown',
      icon: <MapPin className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Organization',
      value: enrichment.org || 'Unknown',
      icon: <Server className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'ASN',
      value: enrichment.asn || 'Unknown',
      icon: <Database className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'ISP',
      value: enrichment.isp || 'Unknown',
      icon: <Globe className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Hosting/DC',
      value: enrichment.isHosting ? 'Yes' : 'No',
      icon: <Server className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'VPN/Proxy/TOR',
      value: enrichment.isVPN ? `VPN${enrichment.vpnService ? ` (${enrichment.vpnService})` : ''}` :
             enrichment.isTor ? 'TOR' :
             enrichment.isProxy ? 'Proxy' : 'No',
      icon: <Shield className="w-4 h-4 text-cyan-400" />
    }
  ];

  const summary = `IP: ${ip}\nCountry: ${enrichment.country || 'Unknown'}\nOrg: ${enrichment.org || 'Unknown'}\nThreat Score: ${result.overallThreatScore}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}`;

  return (
    <div className="space-y-6">
      <ActionsBar
        summary={summary}
        jsonData={result}
        iocValue={ip}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {ip}
          </h1>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${
              result.overallThreatScore > 70 ? 'bg-red-500/20 text-red-400' :
              result.overallThreatScore > 40 ? 'bg-amber-500/20 text-amber-400' :
              'bg-green-500/20 text-green-400'
            }`}>
              Threat Score: {result.overallThreatScore}
            </span>
            {result.isMalicious && (
              <span className="px-3 py-1 rounded-lg text-sm font-semibold bg-red-500/20 text-red-400">
                Malicious
              </span>
            )}
          </div>
        </div>
      </div>

      <SourceStatus sources={sources} />

      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Key Facts</h2>
        <KeyFacts facts={keyFacts} />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Evidence</h2>

        {abuseData && (
          <EvidenceCard
            title="AbuseIPDB"
            icon={AlertTriangle}
            badge={abuseData.abuseConfidenceScore ? `${abuseData.abuseConfidenceScore}% confidence` : undefined}
            badgeColor="red"
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Abuse Confidence</span>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {abuseData.abuseConfidenceScore || 0}%
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Total Reports</span>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {abuseData.totalReports || 0}
                  </p>
                </div>
              </div>
              {abuseData.usageType && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Usage Type</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {abuseData.usageType}
                  </p>
                </div>
              )}
              {abuseData.domain && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Domain</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {abuseData.domain}
                  </p>
                </div>
              )}
            </div>
          </EvidenceCard>
        )}

        {proxyData && (
          <EvidenceCard
            title="ProxyCheck"
            icon={Database}
            badgeColor="purple"
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Proxy</span>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {proxyData.proxy || 'No'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">VPN</span>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {proxyData.vpn ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
              {proxyData.provider && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Provider</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {proxyData.provider}
                  </p>
                </div>
              )}
              {proxyData.type && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Type</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {proxyData.type}
                  </p>
                </div>
              )}
            </div>
          </EvidenceCard>
        )}

        {ipinfoData && (
          <EvidenceCard
            title="ipinfo.io"
            icon={Globe}
            badgeColor="cyan"
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {ipinfoData.city && (
                  <div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">City</span>
                    <p className="text-base font-medium text-slate-900 dark:text-white">
                      {ipinfoData.city}
                    </p>
                  </div>
                )}
                {ipinfoData.region && (
                  <div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Region</span>
                    <p className="text-base font-medium text-slate-900 dark:text-white">
                      {ipinfoData.region}
                    </p>
                  </div>
                )}
                {ipinfoData.timezone && (
                  <div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Timezone</span>
                    <p className="text-base font-medium text-slate-900 dark:text-white">
                      {ipinfoData.timezone}
                    </p>
                  </div>
                )}
                {ipinfoData.postal && (
                  <div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Postal</span>
                    <p className="text-base font-medium text-slate-900 dark:text-white">
                      {ipinfoData.postal}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </EvidenceCard>
        )}
      </div>

      <VarianceCard variances={[]} />

      <RawJsonCollapse data={result} title="Raw Results Data" />
    </div>
  );
}
