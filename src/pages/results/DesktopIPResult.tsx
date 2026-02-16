import { useEffect, useState, useRef } from 'react';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult } from '../../types';
import { shouldShowSection, type ScanFlags } from '../../lib/cliFlags';
import { DESKTOP_PALETTE as P } from '../../components/DesktopLayout';

interface DesktopIPResultProps {
  ip: string;
  flags?: ScanFlags;
  onBack?: () => void;
}

export default function DesktopIPResult({ ip, flags, onBack }: DesktopIPResultProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const startTime = useRef(Date.now());

  const showGeo = !flags || shouldShowSection(flags, 'geo');
  const showVpn = !flags || shouldShowSection(flags, 'vpn');
  const showThreats = !flags || shouldShowSection(flags, 'threats');
  const showNetwork = !flags || shouldShowSection(flags, 'network');
  const showSources = !flags || shouldShowSection(flags, 'sources');
  const showJson = flags?.json || false;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      startTime.current = Date.now();
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
      <div style={{ padding: 14, fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace" }}>
        <div style={{ color: P.cyan, marginBottom: 6 }}>{'>'} Scanning IP: {ip}</div>
        {['Querying threat intelligence databases...', 'Fetching VirusTotal data...', 'Checking AbuseIPDB...', 'Querying Spamhaus blocklists...', 'Checking VPN/Proxy/Tor status...', 'Analyzing results...'].map((msg, i) => (
          <div key={i} style={{ color: P.dim, marginBottom: 4, animation: `dtPulse 1.5s infinite ${i * 0.2}s` }}>[*] {msg}</div>
        ))}
      </div>
    );
  }

  if (error || !result) {
    return (
      <div style={{ padding: 14, fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace" }}>
        <div style={{ color: P.pink, marginBottom: 6 }}>ERROR: {error || 'Failed to fetch data'}</div>
        <div style={{ color: P.dim }}>Type a new command to try again</div>
      </div>
    );
  }

  const elapsed = ((Date.now() - startTime.current) / 1000).toFixed(2);
  const enrichment = result.enrichment || {};
  const sources: Record<string, any> = (result as any).sources || result.results || {};
  const isMalicious = result.isMalicious;
  const verdictColor = isMalicious ? P.pink : P.green;
  const borderColor = isMalicious ? P.pink : P.cyan;

  const abuseData = sources.abuseipdb?.data;
  const vtStats = sources.virustotal?.data?.attributes?.last_analysis_stats;
  const spamhaus = sources.spamhaus;
  const alienVault = sources.alienvault;
  const sourceKeys = Object.keys(sources);

  const copySummary = () => {
    const lines = [
      `IP: ${ip}`, `Threat Score: ${result.overallThreatScore}/100`,
      `Verdict: ${isMalicious ? 'MALICIOUS' : 'CLEAN'}`,
      `Country: ${enrichment.country || 'Unknown'}`, `Org: ${enrichment.org || 'Unknown'}`,
      `ASN: ${enrichment.asn || 'Unknown'}`, `VPN: ${enrichment.isVPN ? 'Yes' : 'No'}`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (showJson) {
    return (
      <div style={{ padding: 14, overflow: 'auto', flex: 1, fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace" }}>
        <div style={{ color: P.cyan, marginBottom: 8 }}>{'>'} JSON Output for {ip}</div>
        <pre style={{ color: P.textLight, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: P.void, padding: 12, border: `1px solid ${P.border}`, borderRadius: 4, fontSize: 11 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
        <ActionButtons onBack={onBack} onCopy={copySummary} copied={copied} />
      </div>
    );
  }

  return (
    <div style={{ padding: 14, overflow: 'auto', flex: 1, fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: P.cyan, marginBottom: 4 }}>{'>'} Scan complete</div>
        <div style={{ color: P.dim, fontSize: 11 }}>[*] Analysis finished in {elapsed}s | {sourceKeys.length} sources queried</div>
      </div>

      <div style={{ border: `1px solid ${borderColor}`, background: `${borderColor}08`, padding: 16, marginBottom: 16, borderRadius: 4 }}>
        <div style={{ color: P.cyan, marginBottom: 12, fontWeight: 700 }}>═══ IP ANALYSIS RESULTS ═══</div>

        <Row label="TARGET" value={ip} valueColor="#fff" />
        <Row label="VERDICT" value={`${isMalicious ? 'MALICIOUS' : 'CLEAN'} (Score: ${result.overallThreatScore}/100)`} valueColor={verdictColor} />

        {showGeo && (
          <Section title="GEOLOCATION">
            <Row label="Country" value={enrichment.country ? `${enrichment.country}${enrichment.countryCode ? ` (${enrichment.countryCode})` : ''}` : 'Unknown'} />
            <Row label="City" value={enrichment.city || 'Unknown'} />
            <Row label="Region" value={enrichment.region || 'Unknown'} />
            <Row label="Timezone" value={enrichment.timezone || 'Unknown'} />
            {enrichment.lat !== undefined && enrichment.lon !== undefined && (
              <Row label="Coordinates" value={`${enrichment.lat}, ${enrichment.lon}`} />
            )}
          </Section>
        )}

        {showNetwork && (
          <Section title="NETWORK">
            <Row label="Organization" value={enrichment.org || 'Unknown'} />
            <Row label="ISP" value={enrichment.isp || 'Unknown'} />
            <Row label="ASN" value={enrichment.asn || 'Unknown'} />
            <Row label="Hosting/DC" value={enrichment.isHosting ? 'Yes' : 'No'} valueColor={enrichment.isHosting ? P.amber : P.green} />
          </Section>
        )}

        {showVpn && (
          <Section title="VPN / PROXY / TOR">
            <Row label="VPN" value={enrichment.isVPN ? `Detected${enrichment.vpnService ? ` (${enrichment.vpnService})` : ''}` : 'Not detected'} valueColor={enrichment.isVPN ? P.amber : P.green} />
            <Row label="Proxy" value={enrichment.isProxy ? 'Detected' : 'Not detected'} valueColor={enrichment.isProxy ? P.amber : P.green} />
            <Row label="Tor Exit" value={enrichment.isTor ? 'DETECTED' : 'Not detected'} valueColor={enrichment.isTor ? P.pink : P.green} />
          </Section>
        )}

        {showThreats && (
          <Section title="THREAT INTELLIGENCE">
            {abuseData && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: P.cyan, fontSize: 11, marginBottom: 4 }}>AbuseIPDB:</div>
                <div style={{ paddingLeft: 8 }}>
                  <Row label="Confidence" value={`${abuseData.abuseConfidenceScore ?? 0}%`} valueColor={(abuseData.abuseConfidenceScore ?? 0) > 50 ? P.pink : P.textLight} />
                  <Row label="Reports" value={String(abuseData.totalReports ?? 0)} />
                  {abuseData.lastReportedAt && <Row label="Last Report" value={new Date(abuseData.lastReportedAt).toLocaleDateString()} />}
                </div>
              </div>
            )}
            {vtStats && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: P.cyan, fontSize: 11, marginBottom: 4 }}>VirusTotal:</div>
                <div style={{ paddingLeft: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: P.pink }}>{vtStats.malicious || 0} malicious</span>
                  <span style={{ color: P.amber }}>{vtStats.suspicious || 0} suspicious</span>
                  <span style={{ color: P.green }}>{vtStats.harmless || 0} clean</span>
                  <span style={{ color: P.dim }}>{vtStats.undetected || 0} undetected</span>
                </div>
              </div>
            )}
            {spamhaus && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: P.cyan, fontSize: 11, marginBottom: 4 }}>Spamhaus:</div>
                <div style={{ paddingLeft: 8 }}>
                  {spamhaus.listedIn?.length > 0 ? (
                    <div style={{ color: P.pink }}>LISTED on {spamhaus.listedIn.length} blocklist(s): {spamhaus.listedIn.join(', ')}</div>
                  ) : (
                    <div style={{ color: P.green }}>Not listed</div>
                  )}
                </div>
              </div>
            )}
            {alienVault?.pulse_info?.pulses?.length > 0 && (
              <div>
                <div style={{ color: P.cyan, fontSize: 11, marginBottom: 4 }}>AlienVault OTX ({alienVault.pulse_info.count} pulses):</div>
                <div style={{ paddingLeft: 8 }}>
                  {alienVault.pulse_info.pulses.slice(0, 5).map((pulse: any, i: number) => (
                    <div key={i} style={{ color: P.textLight, marginBottom: 2 }}>
                      <span style={{ color: P.amber }}>*</span> {pulse.name}
                      {pulse.tags?.length > 0 && <span style={{ color: P.dim }}> [{pulse.tags.slice(0, 3).join(', ')}]</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {showSources && (
          <Section title="SOURCE STATUS">
            {sourceKeys.map(key => {
              const s = sources[key];
              const hasError = s?.error;
              return (
                <div key={key} style={{ color: hasError ? P.pink : P.green, marginBottom: 2 }}>
                  {hasError ? '✗' : '✓'} {key.padEnd(20)} {hasError ? `[ERROR: ${s.error}]` : '[OK]'}
                </div>
              );
            })}
          </Section>
        )}
      </div>

      <ActionButtons onBack={onBack} onCopy={copySummary} copied={copied} />

      <div style={{ color: P.dim, fontSize: 10, marginTop: 12 }}>
        Type "scan -ip [IP]" for another scan | Flags: --threats --network --vpn --geo --sources --json -v
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${P.border}`, marginTop: 12, paddingTop: 10 }}>
      <div style={{ color: P.dim, fontSize: 10, marginBottom: 6 }}>{title}:</div>
      {children}
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ color: P.textLight, marginBottom: 2, fontSize: 12.5 }}>
      <span style={{ color: P.text }}>{label}</span>
      <span style={{ color: P.dim }}> . </span>
      <span style={{ color: valueColor || '#fff' }}>{value}</span>
    </div>
  );
}

function ActionButtons({ onBack, onCopy, copied }: { onBack?: () => void; onCopy: () => void; copied: boolean }) {
  const btnBase: React.CSSProperties = {
    padding: '6px 16px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' as const,
    transition: 'all 0.15s', borderRadius: 3,
  };
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button onClick={onCopy} style={{ ...btnBase, background: 'transparent', border: `1px solid ${P.cyan}`, color: P.cyan }}>
        {copied ? '[ COPIED ]' : '[ COPY SUMMARY ]'}
      </button>
      {onBack && (
        <button onClick={onBack} style={{ ...btnBase, background: 'transparent', border: `1px solid ${P.border}`, color: P.textLight }}>
          [ BACK ]
        </button>
      )}
    </div>
  );
}
