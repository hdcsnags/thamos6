import { useEffect, useState } from 'react';
import { Globe, Shield, AlertTriangle, Calendar } from 'lucide-react';
import KeyFacts from '../../components/scanner/KeyFacts';
import SourceStatus, { type Source } from '../../components/scanner/SourceStatus';
import EvidenceCard from '../../components/scanner/EvidenceCard';
import RawJsonCollapse from '../../components/scanner/RawJsonCollapse';
import ActionsBar from '../../components/scanner/ActionsBar';

interface DomainResultProps {
  domain: string;
}

export default function DomainResult({ domain }: DomainResultProps) {
  const [loading, setLoading] = useState(true);
  const [sources] = useState<Source[]>([
    { name: 'VirusTotal', state: 'pending', icon: Shield },
    { name: 'WHOIS', state: 'pending', icon: Globe },
  ]);

  useEffect(() => {
    setTimeout(() => setLoading(false), 1000);
  }, [domain]);

  const keyFacts = [
    {
      label: 'Domain',
      value: domain,
      icon: <Globe className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Status',
      value: 'Active',
      icon: <AlertTriangle className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Created',
      value: 'Unknown',
      icon: <Calendar className="w-4 h-4 text-cyan-400" />
    }
  ];

  const summary = `Domain: ${domain}`;

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

  return (
    <div className="space-y-6">
      <ActionsBar
        summary={summary}
        jsonData={{ domain }}
        iocValue={domain}
      />

      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          {domain}
        </h1>
      </div>

      <SourceStatus sources={sources.map(s => ({ ...s, state: 'disabled' }))} />

      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Key Facts</h2>
        <KeyFacts facts={keyFacts} />
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <p className="text-amber-400 font-medium">Domain intelligence coming soon</p>
        <p className="text-sm text-amber-200/80 mt-2">
          Full domain reputation and WHOIS data will be available in a future update
        </p>
      </div>

      <RawJsonCollapse data={{ domain, status: 'pending' }} title="Raw Results Data" />
    </div>
  );
}
