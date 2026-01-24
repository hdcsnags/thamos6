import { useEffect, useState } from 'react';
import { Hash, Shield, AlertTriangle, FileText, Database, Activity } from 'lucide-react';
import { lookupHash, getSourceDisplayName } from '../../lib/threatIntel';
import { getHashType } from '../../lib/iocDetection';
import type { HashLookupResult } from '../../types';
import KeyFacts from '../../components/scanner/KeyFacts';
import SourceStatus, { type Source, type SourceState } from '../../components/scanner/SourceStatus';
import EvidenceCard from '../../components/scanner/EvidenceCard';
import RawJsonCollapse from '../../components/scanner/RawJsonCollapse';
import ActionsBar from '../../components/scanner/ActionsBar';
import ThreatScore from '../../components/ThreatScore';

interface HashResultProps {
  hash: string;
}

export default function HashResult({ hash }: HashResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HashLookupResult | null>(null);
  const [sources, setSources] = useState<Source[]>([
    { name: 'VirusTotal', state: 'pending', icon: Shield },
    { name: 'MalwareBazaar', state: 'pending', icon: Database },
    { name: 'Hybrid Analysis', state: 'pending', icon: Activity },
    { name: 'AlienVault OTX', state: 'pending', icon: AlertTriangle },
  ]);

  const hashType = getHashType(hash);

  useEffect(() => {
    const performLookup = async () => {
      setLoading(true);
      setError('');
      setSources(prev => prev.map(s => ({ ...s, state: 'loading' as SourceState })));

      try {
        const data = await lookupHash(hash);
        setResult(data);

        const sourcesData = data.sources || {};

        setSources(prev => prev.map(source => {
          const sourceKeys = {
            'VirusTotal': ['virustotal_hash', 'virustotal'],
            'MalwareBazaar': ['malwarebazaar'],
            'Hybrid Analysis': ['hybrid_analysis', 'hybridanalysis'],
            'AlienVault OTX': ['alienvault', 'otx'],
          };

          const keys = sourceKeys[source.name as keyof typeof sourceKeys] || [];
          let sourceData = null;

          for (const key of keys) {
            if (sourcesData[key]) {
              sourceData = sourcesData[key];
              break;
            }
          }

          const hasError = sourceData?.error;
          const isChecked = sourceData?.checked;
          const hasData = isChecked && !hasError;

          return {
            ...source,
            state: hasError ? 'error' : hasData ? 'success' : 'disabled'
          };
        }));
      } catch (err: any) {
        setError(err.message || 'Failed to lookup hash');
        setSources(prev => prev.map(s => ({ ...s, state: 'error' as SourceState })));
      } finally {
        setLoading(false);
      }
    };

    performLookup();
  }, [hash]);

  if (loading && !result) {
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

  const detections = result.detections || {};
  const vtData = detections.virustotal;
  const mbData = detections.malwarebazaar;
  const haData = detections.hybrid_analysis;
  const avData = detections.alienvault;

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
    },
    {
      label: 'Malicious',
      value: result.isMalicious ? 'Yes' : 'No',
      icon: <AlertTriangle className="w-4 h-4 text-cyan-400" />
    },
    {
      label: 'Threat Score',
      value: `${result.overallThreatScore}/100`,
      icon: <Shield className="w-4 h-4 text-cyan-400" />
    }
  ];

  const summary = `Hash: ${hash}\nType: ${hashType?.toUpperCase() || 'Unknown'}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}\nThreat Score: ${result.overallThreatScore}/100`;

  return (
    <div className="space-y-6">
      <ActionsBar
        summary={summary}
        jsonData={result}
        iocValue={hash}
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 break-all">
          {hash}
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          {hashType && (
            <span className="px-3 py-1 rounded-lg text-sm font-semibold bg-cyan-500/20 text-cyan-400">
              {hashType.toUpperCase()}
            </span>
          )}
          {result.isMalicious && (
            <span className="px-3 py-1 rounded-lg text-sm font-semibold bg-red-500/20 text-red-400">
              Malicious
            </span>
          )}
          <ThreatScore score={result.overallThreatScore} />
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
            badge={vtData.total ? `${vtData.malicious + vtData.suspicious}/${vtData.total} detections` : undefined}
            badgeColor={vtData.malicious > 0 ? "red" : vtData.suspicious > 0 ? "amber" : "blue"}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Malicious</span>
                  <p className="text-lg font-semibold text-red-400">{vtData.malicious || 0}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Suspicious</span>
                  <p className="text-lg font-semibold text-amber-400">{vtData.suspicious || 0}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Undetected</span>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{vtData.undetected || 0}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Total Scans</span>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{vtData.total || 0}</p>
                </div>
              </div>
              {vtData.file_type && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">File Type</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">{vtData.file_type}</p>
                </div>
              )}
              {vtData.file_size && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">File Size</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {(vtData.file_size / 1024).toFixed(2)} KB
                  </p>
                </div>
              )}
              {vtData.first_seen && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">First Seen</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {new Date(vtData.first_seen).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </EvidenceCard>
        )}

        {mbData && (
          <EvidenceCard
            title="MalwareBazaar"
            icon={Database}
            badge={mbData.signature || undefined}
            badgeColor="red"
          >
            <div className="space-y-3">
              {mbData.threat_name && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Threat Name</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">{mbData.threat_name}</p>
                </div>
              )}
              {mbData.file_type && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">File Type</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">{mbData.file_type}</p>
                </div>
              )}
              {mbData.file_size && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">File Size</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {(mbData.file_size / 1024).toFixed(2)} KB
                  </p>
                </div>
              )}
              {mbData.tags && mbData.tags.length > 0 && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400 block mb-2">Tags</span>
                  <div className="flex flex-wrap gap-2">
                    {mbData.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {mbData.first_seen && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">First Seen</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">
                    {new Date(mbData.first_seen).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </EvidenceCard>
        )}

        {haData && (
          <EvidenceCard
            title="Hybrid Analysis"
            icon={Activity}
            badge={haData.verdict || undefined}
            badgeColor={haData.verdict === 'malicious' ? "red" : "blue"}
          >
            <div className="space-y-3">
              {haData.threat_score !== undefined && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Threat Score</span>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{haData.threat_score}/100</p>
                </div>
              )}
              {haData.malware_family && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Malware Family</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">{haData.malware_family}</p>
                </div>
              )}
              {haData.vx_family && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">VX Family</span>
                  <p className="text-base font-medium text-slate-900 dark:text-white">{haData.vx_family}</p>
                </div>
              )}
              {haData.classification_tags && haData.classification_tags.length > 0 && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400 block mb-2">Classification</span>
                  <div className="flex flex-wrap gap-2">
                    {haData.classification_tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </EvidenceCard>
        )}

        {avData && avData.pulse_count && avData.pulse_count > 0 && (
          <EvidenceCard
            title="AlienVault OTX"
            icon={AlertTriangle}
            badge={`${avData.pulse_count} pulse${avData.pulse_count !== 1 ? 's' : ''}`}
            badgeColor="amber"
          >
            <div className="space-y-3">
              <div>
                <span className="text-sm text-slate-600 dark:text-slate-400">Pulse Count</span>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{avData.pulse_count}</p>
              </div>
              {avData.pulses && avData.pulses.length > 0 && (
                <div>
                  <span className="text-sm text-slate-600 dark:text-slate-400 block mb-2">Recent Pulses</span>
                  <div className="space-y-2">
                    {avData.pulses.slice(0, 3).map((pulse, idx) => (
                      <div key={idx} className="p-2 rounded bg-slate-100 dark:bg-slate-800/50">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{pulse.name}</p>
                        {pulse.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                            {pulse.description}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                          {new Date(pulse.created).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
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
