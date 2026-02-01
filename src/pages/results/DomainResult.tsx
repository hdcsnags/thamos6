import { useEffect, useState } from 'react';
import { Globe, Shield, AlertTriangle, Calendar, User } from 'lucide-react';
import KeyFacts from '../../components/scanner/KeyFacts';
import SourceStatus, { type Source } from '../../components/scanner/SourceStatus';
import EvidenceCard from '../../components/scanner/EvidenceCard';
import RawJsonCollapse from '../../components/scanner/RawJsonCollapse';
import ActionsBar from '../../components/scanner/ActionsBar';
import ThreatScore from '../../components/ThreatScore';
import SourceCard from '../../components/SourceCard';
import { lookupDomain, getSourceDisplayName } from '../../lib/threatIntel';
import type { DomainLookupResult } from '../../types';

interface DomainResultProps {
  domain: string;
}

export default function DomainResult({ domain }: DomainResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DomainLookupResult | null>(null);
  const [sources, setSources] = useState<Source[]>([
    { name: 'WHOIS/RDAP', state: 'pending', icon: Globe },
    { name: 'VirusTotal', state: 'pending', icon: Shield },
    { name: 'URLhaus', state: 'pending', icon: AlertTriangle },
    { name: 'AlienVault OTX', state: 'pending', icon: Shield },
  ]);

  useEffect(() => {
    const performLookup = async () => {
      setLoading(true);
      setError(null);
      setSources(prev => prev.map(s => ({ ...s, state: 'loading' as const })));

      try {
        const result = await lookupDomain(domain);
        setData(result);

        setSources(prev => prev.map(s => {
          if (!result.sources) {
            return { ...s, state: 'error' as const };
          }
          const sourceKey = s.name.toLowerCase().replace(/\s+/g, '').replace('/', '');
          const found = result.sources[sourceKey] || result.sources['whois'];

          // Check if source exists and succeeded
          if (found && found.found && !found.error) {
            return { ...s, state: 'success' as const };
          } else if (found && found.error) {
            return { ...s, state: 'error' as const };
          } else if (found && !found.found) {
            return { ...s, state: 'disabled' as const };
          }
          return { ...s, state: 'disabled' as const };
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to lookup domain');
        setSources(prev => prev.map(s => ({ ...s, state: 'error' as const })));
      } finally {
        setLoading(false);
      }
    };

    performLookup();
  }, [domain]);

  const whoisData = data?.sources?.whois?.details;
  const domainAge = whoisData ? 
    Math.floor((Date.now() - new Date(whoisData.events?.find((e: any) => e.eventAction === 'registration')?.eventDate || 0).getTime()) / (1000 * 60 * 60 * 24)) + ' days'
    : 'Unknown';
  
  // Extract registrar from WHOIS entities
  const registrarEntity = whoisData?.entities?.find((e: any) => e.roles?.includes('registrar'));
  const registrar = registrarEntity?.vcardArray?.[1]?.find((item: any) => item[0] === 'fn')?.[3] || 'Unknown';
  
  // Extract dates from events
  const registrationEvent = whoisData?.events?.find((e: any) => e.eventAction === 'registration');
  const expirationEvent = whoisData?.events?.find((e: any) => e.eventAction === 'expiration');
  
  const created = registrationEvent ? new Date(registrationEvent.eventDate).toLocaleDateString() : 'Unknown';
  const expires = expirationEvent ? new Date(expirationEvent.eventDate).toLocaleDateString() : 'Unknown';

  const keyFacts = [
    {
      label: 'Domain',
      value: domain,
      icon: <Globe className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Domain Age',
      value: domainAge,
      icon: <Calendar className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Registrar',
      value: registrar,
      icon: <User className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Created',
      value: created,
      icon: <Calendar className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Expires',
      value: expires,
      icon: <Calendar className="w-4 h-4 text-cyan-400" />
    }
  ];

  const summary = data?.isMalicious
    ? `⚠️ Domain ${domain} is flagged as malicious (Score: ${data.overallThreatScore}/100)`
    : `✓ Domain ${domain} appears clean (Score: ${data?.overallThreatScore || 0}/100)`;

  if (loading) {
    return (
      <div className="space-y-6">
        <SourceStatus sources={sources} />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">Analyzing domain...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <SourceStatus sources={sources} />
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 font-medium">{error || 'Failed to load domain data'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ActionsBar
        summary={summary}
        jsonData={data}
        iocValue={domain}
      />

      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          {domain}
        </h1>
      </div>

      <SourceStatus sources={sources} />

      <ThreatScore score={data.overallThreatScore} />

      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Key Facts</h2>
        <KeyFacts facts={keyFacts} />
      </div>

      {whoisData?.nameservers && whoisData.nameservers.length > 0 && (
        <EvidenceCard
          title="Nameservers"
          items={whoisData.nameservers.map((ns: any) => ({
            label: 'NS',
            value: ns.ldhName || ns
          }))}
        />
      )}

      {data.sources && Object.keys(data.sources).length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Source Results</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(data.sources).map(([sourceKey, source]: [string, any]) => (
              <SourceCard
                key={sourceKey}
                name={getSourceDisplayName(sourceKey)}
                found={source?.found ?? false}
                malicious={source?.malicious ?? false}
                details={source?.details}
                error={source?.error}
                threatScore={source?.threatScore}
              />
            ))}
          </div>
        </div>
      )}

      <RawJsonCollapse data={data} title="Raw Results Data" />
    </div>
  );
}
