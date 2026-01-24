import { useEffect, useState } from 'react';
import { Hash, Shield, AlertTriangle, FileText } from 'lucide-react';
import { getHashType } from '../../lib/iocDetection';
import KeyFacts from '../../components/scanner/KeyFacts';
import SourceStatus, { type Source } from '../../components/scanner/SourceStatus';
import EvidenceCard from '../../components/scanner/EvidenceCard';
import RawJsonCollapse from '../../components/scanner/RawJsonCollapse';
import ActionsBar from '../../components/scanner/ActionsBar';

interface HashResultProps {
  hash: string;
}

export default function HashResult({ hash }: HashResultProps) {
  const [loading, setLoading] = useState(true);
  const [sources] = useState<Source[]>([
    { name: 'VirusTotal', state: 'pending', icon: Shield },
  ]);

  const hashType = getHashType(hash);

  useEffect(() => {
    setTimeout(() => setLoading(false), 1000);
  }, [hash]);

  const keyFacts = [
    {
      label: 'Hash',
      value: hash,
      icon: <Hash className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Type',
      value: hashType?.toUpperCase() || 'Unknown',
      icon: <FileText className="w-4 h-4 text-cyan-400" />
    }
  ];

  const summary = `Hash: ${hash}\nType: ${hashType?.toUpperCase() || 'Unknown'}`;

  if (loading) {
    return (
      <div className="space-y-6">
        <SourceStatus sources={sources} />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">Analyzing hash...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ActionsBar
        summary={summary}
        jsonData={{ hash, hashType }}
        iocValue={hash}
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 break-all">
          {hash}
        </h1>
        {hashType && (
          <span className="px-3 py-1 rounded-lg text-sm font-semibold bg-cyan-500/20 text-cyan-400">
            {hashType.toUpperCase()}
          </span>
        )}
      </div>

      <SourceStatus sources={sources.map(s => ({ ...s, state: 'disabled' }))} />

      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Key Facts</h2>
        <KeyFacts facts={keyFacts} />
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <p className="text-amber-400 font-medium">Hash lookup coming soon</p>
        <p className="text-sm text-amber-200/80 mt-2">
          VirusTotal file hash analysis will be available in a future update
        </p>
      </div>

      <RawJsonCollapse data={{ hash, hashType }} title="Raw Results Data" />
    </div>
  );
}
