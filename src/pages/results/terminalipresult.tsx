import { useEffect, useState } from 'react';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult } from '../../types';

interface TerminalIPResultProps {
  ip: string;
  onBack?: () => void;
}

export default function TerminalIPResult({ ip, onBack }: TerminalIPResultProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      
      try {
        const data = await lookupIP(ip);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to lookup IP');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [ip]);

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} Scanning IP: {ip}</div>
        <div className="text-[#4a5568] mb-2">[*] Querying threat intelligence databases...</div>
        <div className="text-[#4a5568] mb-2">[*] Fetching VirusTotal data...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking AbuseIPDB...</div>
        <div className="text-[#4a5568] mb-2">[*] Querying Spamhaus...</div>
        <div className="text-[#4a5568]">[*] Analyzing results...</div>
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

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="mb-4">
        <div className="text-[#00d9ff] mb-2">{'>'} Scan complete</div>
        <div className="text-[#4a5568]">[*] Analysis finished in 1.23s</div>
      </div>

      {/* Result Box */}
      <div className={`border ${boxBorderColor} ${boxBgColor} p-4 mb-4`}>
        <div className="text-[#00d9ff] mb-3">═══ IP ANALYSIS RESULTS ═══</div>
        
        <div className="space-y-2 text-[#a5d8ff]">
          <div>IP Address: <span className="text-white">{ip}</span></div>
          <div>
            Threat Score: <span className={statusColor}>{result.overallThreatScore}/100</span>
          </div>
          <div>
            Status: <span className={statusColor}>{isMalicious ? '⚠ MALICIOUS' : '✓ CLEAN'}</span>
          </div>

          <div className="border-t border-[#4a5568] my-3 pt-3">
            <div className="text-[#4a5568] text-xs mb-2">LOCATION DATA:</div>
            <div className="text-[#a5d8ff]">
              Country: {result.enrichment?.country || 'Unknown'}<br />
              City: {result.enrichment?.city || 'Unknown'}<br />
              Region: {result.enrichment?.region || 'Unknown'}<br />
              ISP: {result.enrichment?.isp || 'Unknown'}
            </div>
          </div>

          {result.vpnData && (
            <div className="border-t border-[#4a5568] my-3 pt-3">
              <div className="text-[#4a5568] text-xs mb-2">VPN/PROXY STATUS:</div>
              <div className="text-[#a5d8ff]">
                Detection: {result.vpnData.isVPN ? 
                  <span className="text-[#fbbf24]">VPN/Proxy Detected</span> : 
                  <span className="text-[#00ff41]">Clean</span>
                }<br />
                Confidence: {result.vpnData.confidence}%
              </div>
            </div>
          )}

          {result.abuseIPDBData && result.abuseIPDBData.abuseConfidenceScore > 0 && (
            <div className="border-t border-[#4a5568] my-3 pt-3">
              <div className="text-[#4a5568] text-xs mb-2">ABUSE DATA:</div>
              <div className="text-[#ff0080]">
                Abuse Score: {result.abuseIPDBData.abuseConfidenceScore}%<br />
                Reports: {result.abuseIPDBData.totalReports}<br />
                Last Reported: {result.abuseIPDBData.lastReportedAt ? 
                  new Date(result.abuseIPDBData.lastReportedAt).toLocaleDateString() : 
                  'N/A'
                }
              </div>
            </div>
          )}

          {result.spamhausData && result.spamhausData.listed && (
            <div className="border-t border-[#4a5568] my-3 pt-3">
              <div className="text-[#4a5568] text-xs mb-2">BLOCKLIST STATUS:</div>
              <div className="text-[#ff0080]">
                Listed on: {result.spamhausData.lists?.join(', ') || 'Spamhaus'}
              </div>
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

      {/* Next Steps */}
      <div className="text-[#4a5568] text-xs mt-4">
        <div>Type "scan -ip [IP]" for another scan</div>
        <div>Type "help" for more commands</div>
        <div>Click button above to return to terminal</div>
      </div>
    </div>
  );
}
