import { useState, useEffect } from 'react';
import { lookupDomain } from '../../lib/threatIntel';
import type { DomainLookupResult } from '../../types';
import type { ScanFlags } from '../../lib/cliFlags';

interface DesktopDomainResultProps {
  domain: string;
  flags?: ScanFlags;
}

export function DesktopDomainResult({ domain, flags }: DesktopDomainResultProps) {
  const [data, setData] = useState<DomainLookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await lookupDomain(domain);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to lookup domain');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [domain]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-6" style={{ backgroundColor: '#060610', color: '#00d9ff' }}>
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">◉</div>
          <div className="text-lg">Scanning {domain}...</div>
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
              <div className="text-2xl font-bold mb-1" style={{ color: '#00d9ff' }}>{domain}</div>
              <div className="text-sm" style={{ color: '#8a8fa8' }}>Domain Scan Result</div>
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

        <Section title="THREAT INTELLIGENCE" color="#ff0080">
          {data.results?.virustotal && (
            <DataRow label="VirusTotal">
              <span style={{ color: data.results.virustotal.malicious ? '#ff0080' : '#00ff9d' }}>
                {data.results.virustotal.malicious ? 'Malicious' : 'Clean'}
              </span>
            </DataRow>
          )}
        </Section>
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
