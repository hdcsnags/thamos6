import { useEffect, useState } from 'react';
import { lookupHash, getSourceDisplayName } from '../../lib/threatIntel';
import { shouldShowSection, type ScanFlags } from '../../lib/cliFlags';

interface HashResult {
  hash: string;
  sources: Record<string, {
    found: boolean;
    malicious: boolean;
    details: Record<string, unknown>;
    error?: string;
  }>;
  isMalicious: boolean;
  checkedAt: string;
}

interface TerminalHashResultProps {
  hash: string;
  flags?: ScanFlags;
  onBack?: () => void;
}

const detectHashType = (hash: string): 'MD5' | 'SHA1' | 'SHA256' | 'Unknown' => {
  const cleaned = hash.trim().toLowerCase();
  if (/^[a-f0-9]{32}$/.test(cleaned)) return 'MD5';
  if (/^[a-f0-9]{40}$/.test(cleaned)) return 'SHA1';
  if (/^[a-f0-9]{64}$/.test(cleaned)) return 'SHA256';
  return 'Unknown';
};

export default function TerminalHashResult({ hash, flags, onBack }: TerminalHashResultProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<HashResult | null>(null);
  const [error, setError] = useState('');

  const showThreats = !flags || shouldShowSection(flags, 'threats');
  const showSources = !flags || shouldShowSection(flags, 'sources');
  const showJson = flags?.json || false;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');

      try {
        const data = await lookupHash(hash);
        setResult(data as HashResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to lookup hash');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [hash]);

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} Analyzing hash: {hash}</div>
        <div className="text-[#4a5568] mb-2">[*] Querying VirusTotal...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking MalwareBazaar...</div>
        <div className="text-[#4a5568] mb-2">[*] Searching Hybrid Analysis...</div>
        <div className="text-[#4a5568] mb-2">[*] Querying AlienVault OTX...</div>
        <div className="text-[#4a5568]">[*] Compiling results...</div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#ff0080] mb-2">ERROR: {error || 'Failed to fetch data'}</div>
        <div className="text-[#4a5568]">Type a new command to try again</div>
      </div>
    );
  }

  const isMalicious = result.isMalicious;
  const statusColor = isMalicious ? 'text-[#ff0080]' : 'text-[#00ff41]';
  const boxBorderColor = isMalicious ? 'border-[#ff0080]' : 'border-[#00d9ff]';
  const boxBgColor = isMalicious ? 'bg-[#ff0080]/5' : 'bg-[#00d9ff]/5';
  const hashType = detectHashType(hash);

  const sources = Object.entries(result.sources || {});
  const foundSources = sources.filter(([_, data]) => data.found);
  const maliciousSources = sources.filter(([_, data]) => data.found && data.malicious);

  if (showJson) {
    return (
      <div className="h-full overflow-y-auto p-4 text-sm">
        <div className="mb-4">
          <div className="text-[#00d9ff] mb-2">{'>'} JSON Output</div>
          <div className="text-[#4a5568]">[*] Raw data dump</div>
        </div>
        <div className="border border-[#4a5568] bg-[#0a0e1a] p-4 font-mono text-xs">
          <pre className="text-[#a5d8ff] whitespace-pre-wrap break-all">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 border border-[#00d9ff] text-[#00d9ff] hover:bg-[#00d9ff] hover:text-[#0a0e1a] transition-all text-xs uppercase"
            style={{ textShadow: '0 0 5px #00d9ff' }}
          >
            [ BACK TO SCANNER ]
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="mb-4">
        <div className="text-[#00d9ff] mb-2">{'>'} Hash analysis complete</div>
        <div className="text-[#4a5568]">[*] Scan finished in 2.14s</div>
      </div>

      <div className={`border ${boxBorderColor} ${boxBgColor} p-4 mb-4`}>
        <div className="text-[#00d9ff] mb-3">═══ HASH ANALYSIS RESULTS ═══</div>

        <div className="space-y-2 text-[#a5d8ff]">
          <div>Hash: <span className="text-white font-mono break-all">{hash}</span></div>
          <div>Type: <span className="text-white">{hashType}</span></div>
          <div>
            Status: <span className={statusColor}>{isMalicious ? '⚠ MALICIOUS' : '✓ CLEAN'}</span>
          </div>
          <div>
            Detections: <span className={statusColor}>
              {maliciousSources.length}/{sources.length} sources
            </span>
          </div>

          {showSources && (
            <div className="border-t border-[#4a5568] my-3 pt-3">
              <div className="text-[#4a5568] text-xs mb-2">SOURCE RESULTS:</div>
              <div className="space-y-2">
                {sources.map(([name, data]) => {
                  const displayName = getSourceDisplayName(name);
                  let statusIcon = '○';
                  let color = 'text-[#4a5568]';

                  if (data.error) {
                    statusIcon = '✗';
                    color = 'text-[#4a5568]';
                  } else if (data.found && data.malicious) {
                    statusIcon = '⚠';
                    color = 'text-[#ff0080]';
                  } else if (data.found) {
                    statusIcon = '●';
                    color = 'text-[#fbbf24]';
                  } else {
                    statusIcon = '○';
                    color = 'text-[#00ff41]';
                  }

                  return (
                    <div key={name} className={color}>
                      {statusIcon} {displayName}: {
                        data.error ? 'Error' :
                        data.found ? (data.malicious ? 'Malicious' : 'Found') :
                        'Not Found'
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showThreats && foundSources.length > 0 && (
            <div className="border-t border-[#4a5568] my-3 pt-3">
              <div className="text-[#4a5568] text-xs mb-2">DETECTION DETAILS:</div>
              {foundSources.map(([name, data]) => (
                <div key={name} className="mb-3">
                  <div className="text-[#00d9ff] mb-1">{getSourceDisplayName(name)}:</div>
                  <div className="pl-2 space-y-1">
                    {Object.entries(data.details).map(([key, value]) => (
                      <div key={key} className="text-[#a5d8ff]">
                        {key}: <span className="text-white">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Back Button */}
      {onBack && (
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 border border-[#00d9ff] text-[#00d9ff] hover:bg-[#00d9ff] hover:text-[#0a0e1a] transition-all text-xs uppercase"
          style={{ textShadow: '0 0 5px #00d9ff' }}
        >
          [ BACK TO SCANNER ]
        </button>
      )}

      <div className="text-[#4a5568] text-xs mt-4">
        <div>Type "scan -hash [HASH]" for another scan</div>
        <div>Type "help" for more commands</div>
        <div>Click button above to return to terminal</div>
      </div>
    </div>
  );
}
