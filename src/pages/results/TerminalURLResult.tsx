import { useEffect, useState } from 'react';
import { scanURL } from '../../lib/threatIntel';
import type { URLLookupResult } from '../../types';

interface TerminalURLResultProps {
  url: string;
  onBack?: () => void;
}

export default function TerminalURLResult({ url, onBack }: TerminalURLResultProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<URLLookupResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');

      try {
        const data = await scanURL(url);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to scan URL');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [url]);

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} Scanning URL: {url}</div>
        <div className="text-[#4a5568] mb-2">[*] Submitting to threat intelligence sources...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking for phishing indicators...</div>
        <div className="text-[#4a5568] mb-2">[*] Analyzing malware signatures...</div>
        <div className="text-[#4a5568] mb-2">[*] Verifying domain reputation...</div>
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

  const sources = Object.entries(result.results || {});
  const maliciousSources = sources.filter(([_, data]) => data.isMalicious);

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="mb-4">
        <div className="text-[#00d9ff] mb-2">{'>'} URL scan complete</div>
        <div className="text-[#4a5568]">[*] Analysis finished in 1.87s</div>
      </div>

      <div className={`border ${boxBorderColor} ${boxBgColor} p-4 mb-4`}>
        <div className="text-[#00d9ff] mb-3">═══ URL SCAN RESULTS ═══</div>

        <div className="space-y-2 text-[#a5d8ff]">
          <div>URL: <span className="text-white break-all">{url}</span></div>
          <div>
            Status: <span className={statusColor}>{isMalicious ? '⚠ MALICIOUS' : '✓ CLEAN'}</span>
          </div>
          <div>
            Detections: <span className={statusColor}>
              {maliciousSources.length}/{sources.length} sources flagged
            </span>
          </div>
          {result.threatTypes && result.threatTypes.length > 0 && (
            <div>
              Threat Types: <span className="text-[#ff0080]">
                {result.threatTypes.join(', ')}
              </span>
            </div>
          )}

          <div className="border-t border-[#4a5568] my-3 pt-3">
            <div className="text-[#4a5568] text-xs mb-2">SOURCE RESULTS:</div>
            <div className="space-y-2">
              {sources.map(([name, data]) => {
                let statusIcon = '○';
                let color = 'text-[#4a5568]';
                let statusText = 'Not Checked';

                if (data.error) {
                  statusIcon = '✗';
                  color = 'text-[#4a5568]';
                  statusText = 'Error';
                } else if (data.isMalicious) {
                  statusIcon = '⚠';
                  color = 'text-[#ff0080]';
                  statusText = 'Malicious';
                } else {
                  statusIcon = '✓';
                  color = 'text-[#00ff41]';
                  statusText = 'Clean';
                }

                return (
                  <div key={name} className={color}>
                    {statusIcon} {name}: {statusText}
                    {data.category && <span className="text-[#4a5568]"> ({data.category})</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {maliciousSources.length > 0 && (
            <div className="border-t border-[#4a5568] my-3 pt-3">
              <div className="text-[#4a5568] text-xs mb-2">THREAT DETAILS:</div>
              {maliciousSources.map(([name, data]) => (
                <div key={name} className="mb-3">
                  <div className="text-[#ff0080] mb-1">{name}:</div>
                  <div className="pl-2 space-y-1 text-[#a5d8ff]">
                    {data.category && (
                      <div>Category: <span className="text-white">{data.category}</span></div>
                    )}
                    {data.details && typeof data.details === 'string' && (
                      <div>Details: <span className="text-white">{data.details}</span></div>
                    )}
                    {data.confidence !== undefined && (
                      <div>Confidence: <span className="text-white">{data.confidence}%</span></div>
                    )}
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
        <div>Type "scan -url [URL]" for another scan</div>
        <div>Type "help" for more commands</div>
        <div>Click button above to return to terminal</div>
      </div>
    </div>
  );
}
