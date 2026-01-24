import { useEffect, useState } from 'react';
import { Link, Shield, Eye, AlertTriangle, ExternalLink } from 'lucide-react';
import { scanURL } from '../../lib/threatIntel';
import type { URLLookupResult } from '../../types';
import KeyFacts from '../../components/scanner/KeyFacts';
import SourceStatus, { type Source, type SourceState } from '../../components/scanner/SourceStatus';
import EvidenceCard from '../../components/scanner/EvidenceCard';
import RawJsonCollapse from '../../components/scanner/RawJsonCollapse';
import ActionsBar from '../../components/scanner/ActionsBar';

interface URLResultProps {
  url: string;
}

export default function URLResult({ url }: URLResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<URLLookupResult | null>(null);
  const [sources, setSources] = useState<Source[]>([
    { name: 'VirusTotal', state: 'pending', icon: Shield },
    { name: 'urlscan', state: 'pending', icon: Eye },
  ]);

  useEffect(() => {
    const performScan = async () => {
      setLoading(true);
      setError('');
      setSources(prev => prev.map(s => ({ ...s, state: 'loading' as SourceState })));

      try {
        const data = await scanURL(url);
        setResult(data);

        setSources(prev => prev.map(source => {
          const sourceKey = source.name.toLowerCase().replace(/\s/g, '');
          const hasData = data.results[sourceKey];
          const hasError = data.results[sourceKey]?.error;

          return {
            ...source,
            state: hasError ? 'error' : hasData ? 'success' : 'disabled'
          };
        }));
      } catch (err: any) {
        setError(err.message || 'Failed to scan URL');
        setSources(prev => prev.map(s => ({ ...s, state: 'error' as SourceState })));
      } finally {
        setLoading(false);
      }
    };

    performScan();
  }, [url]);

  if (loading && !result) {
    return (
      <div className="space-y-6">
        <SourceStatus sources={sources} />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">Scanning URL...</p>
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

  const vtData = result.results.virustotal?.details as any;
  const urlscanData = result.results.urlscan?.details as any;

  const keyFacts = [
    {
      label: 'URL',
      value: url,
      icon: <Link className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Malicious',
      value: result.isMalicious ? 'Yes' : 'No',
      icon: <AlertTriangle className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Threat Types',
      value: result.threatTypes?.length > 0 ? result.threatTypes.join(', ') : 'None',
      icon: <Shield className="w-4 h-4 text-cyan-400" />
    }
  ];

  const summary = `URL: ${url}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}\nThreat Types: ${result.threatTypes?.join(', ') || 'None'}`;

  return (
    <div className="space-y-6">
      <ActionsBar
        summary={summary}
        jsonData={result}
        iocValue={url}
      />

      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 break-all">
            {url}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            {result.isMalicious && (
              <span className="px-3 py-1 rounded-lg text-sm font-semibold bg-red-500/20 text-red-400">
                Malicious
              </span>
            )}
            {result.threatTypes?.map(type => (
              <span key={type} className="px-3 py-1 rounded-lg text-sm font-semibold bg-amber-500/20 text-amber-400">
                {type}
              </span>
            ))}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              Visit
            </a>
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

        {vtData && (
          <EvidenceCard
            title="VirusTotal"
            icon={Shield}
            badge={vtData.positives ? `${vtData.positives}/${vtData.total} detections` : undefined}
            badgeColor="blue"
          >
            <div className="space-y-3">
              {vtData.positives > 0 && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Detection Ratio</span>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {vtData.positives} / {vtData.total}
                  </p>
                </div>
              )}
              {vtData.scan_date && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Scan Date</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {new Date(vtData.scan_date).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </EvidenceCard>
        )}

        {urlscanData && (
          <EvidenceCard
            title="urlscan.io"
            icon={Eye}
            badgeColor="green"
          >
            <div className="space-y-3">
              {urlscanData.screenshot && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400 block mb-2">Screenshot</span>
                  <img
                    src={urlscanData.screenshot}
                    alt="URL Screenshot"
                    className="rounded-lg border border-slate-700 max-w-full"
                  />
                </div>
              )}
              {urlscanData.verdict && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Verdict</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {urlscanData.verdict}
                  </p>
                </div>
              )}
            </div>
          </EvidenceCard>
        )}
      </div>

      <RawJsonCollapse data={result} title="Raw Results Data" />
    </div>
  );
}
