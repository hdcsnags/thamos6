import { useState, useEffect } from 'react';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult } from '../../types';
import type { ScanFlags } from '../../lib/cliFlags';

interface DesktopIPResultProps {
  ip: string;
  flags?: ScanFlags;
}

export function DesktopIPResult({ ip, flags }: DesktopIPResultProps) {
  const [data, setData] = useState<IPLookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await lookupIP(ip);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch IP data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [ip]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-6" style={{ backgroundColor: '#060610', color: '#00d9ff' }}>
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">◉</div>
          <div className="text-lg">Scanning {ip}...</div>
          <div className="text-sm mt-2" style={{ color: '#8a8fa8' }}>Querying threat intelligence sources</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6" style={{ backgroundColor: '#060610', color: '#ff0080' }}>
        <div className="text-center">
          <div className="text-4xl mb-4">✖</div>
          <div className="text-lg mb-2">Scan Failed</div>
          <div className="text-sm" style={{ color: '#8a8fa8' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const showVerbose = flags?.verbose;
  const showThreats = flags?.threats || showVerbose;
  const showNetwork = flags?.network || showVerbose;
  const showVpn = flags?.vpn || showVerbose;
  const showGeo = flags?.geo || showVerbose;
  const showSources = flags?.sources;
  const showJson = flags?.json;

  if (showJson) {
    return (
      <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#060610', fontFamily: 'JetBrains Mono, monospace' }}>
        <pre className="text-xs" style={{ color: '#c8cde0' }}>{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  }

  const threatScore = data.overallThreatScore || 0;
  const isMalicious = data.isMalicious || false;

  return (
    <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#060610', fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="space-y-6">
        <div className="pb-4" style={{ borderBottom: '1px solid #1a1f35' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-2xl font-bold mb-1" style={{ color: '#00d9ff' }}>{ip}</div>
              <div className="text-sm" style={{ color: '#8a8fa8' }}>IP Address Scan Result</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-1" style={{ color: getThreatColor(threatScore) }}>
                {threatScore}
              </div>
              <div className="text-xs" style={{ color: '#8a8fa8' }}>Threat Score</div>
            </div>
          </div>

          {isMalicious && (
            <div className="px-4 py-2 rounded" style={{ backgroundColor: '#ff008020', border: '1px solid #ff008040' }}>
              <div className="text-sm font-bold" style={{ color: '#ff0080' }}>⚠ MALICIOUS</div>
            </div>
          )}
        </div>

        {(!flags || showThreats || showVerbose) && (
          <Section title="THREAT INTELLIGENCE" color="#ff0080">
            {data.abuseipdb && (
              <DataRow label="AbuseIPDB">
                <span style={{ color: data.abuseipdb.malicious ? '#ff0080' : '#00ff9d' }}>
                  {data.abuseipdb.malicious ? 'Malicious' : 'Clean'}
                </span>
                {data.abuseipdb.details?.abuseConfidenceScore && (
                  <span style={{ color: '#8a8fa8' }}> ({data.abuseipdb.details.abuseConfidenceScore}% confidence)</span>
                )}
              </DataRow>
            )}
            {data.virustotal && (
              <DataRow label="VirusTotal">
                <span style={{ color: data.virustotal.malicious ? '#ff0080' : '#00ff9d' }}>
                  {data.virustotal.malicious ? 'Malicious' : 'Clean'}
                </span>
                {data.virustotal.details?.malicious && (
                  <span style={{ color: '#8a8fa8' }}> ({data.virustotal.details.malicious}/{data.virustotal.details.total} vendors)</span>
                )}
              </DataRow>
            )}
          </Section>
        )}

        {showGeo && data.ip2location && (
          <Section title="GEOLOCATION" color="#00d9ff">
            {data.ip2location.details?.country && <DataRow label="Country">{data.ip2location.details.country}</DataRow>}
            {data.ip2location.details?.region && <DataRow label="Region">{data.ip2location.details.region}</DataRow>}
            {data.ip2location.details?.city && <DataRow label="City">{data.ip2location.details.city}</DataRow>}
            {data.ip2location.details?.isp && <DataRow label="ISP">{data.ip2location.details.isp}</DataRow>}
          </Section>
        )}

        {showVpn && data.ip2proxy && (
          <Section title="VPN/PROXY DETECTION" color="#fbbf24">
            <DataRow label="Proxy">{data.ip2proxy.details?.is_proxy ? 'Yes' : 'No'}</DataRow>
            {data.ip2proxy.details?.proxy_type && <DataRow label="Type">{data.ip2proxy.details.proxy_type}</DataRow>}
          </Section>
        )}

        {showNetwork && data.shodan && (
          <Section title="NETWORK INFORMATION" color="#b794f6">
            {data.shodan.details?.ports && data.shodan.details.ports.length > 0 && (
              <DataRow label="Open Ports">{data.shodan.details.ports.join(', ')}</DataRow>
            )}
            {data.shodan.details?.org && <DataRow label="Organization">{data.shodan.details.org}</DataRow>}
          </Section>
        )}

        {showSources && (
          <Section title="RAW SOURCES" color="#8a8fa8">
            <pre className="text-xs" style={{ color: '#c8cde0' }}>{JSON.stringify(data.rawResults || data.results, null, 2)}</pre>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-bold mb-3" style={{ color }}>{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 text-sm">
      <div className="w-32 flex-shrink-0" style={{ color: '#8a8fa8' }}>{label}:</div>
      <div className="flex-1" style={{ color: '#c8cde0' }}>{children}</div>
    </div>
  );
}

function getThreatColor(score: number): string {
  if (score >= 7) return '#ff0080';
  if (score >= 4) return '#fbbf24';
  return '#00ff9d';
}
