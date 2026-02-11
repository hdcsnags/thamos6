import { useEffect, useState, useRef } from 'react';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult } from '../../types';
import { shouldShowSection, type ScanFlags } from '../../lib/cliFlags';

interface TerminalIPResultProps {
  ip: string;
  flags?: ScanFlags;
  onBack?: () => void;
}

export default function TerminalIPResult({ ip, flags, onBack }: TerminalIPResultProps) {
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
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} Scanning IP: {ip}</div>
        <div className="text-[#4a5568] mb-2">[*] Querying threat intelligence databases...</div>
        <div className="text-[#4a5568] mb-2">[*] Fetching VirusTotal data...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking AbuseIPDB...</div>
        <div className="text-[#4a5568] mb-2">[*] Querying Spamhaus blocklists...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking VPN/Proxy/Tor status...</div>
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

  const elapsed = ((Date.now() - startTime.current) / 1000).toFixed(2);
  const enrichment = result.enrichment || {};
  const sources: Record<string, any> = (result as any).sources || result.results || {};
  const isMalicious = result.isMalicious;
  const statusColor = isMalicious ? 'text-[#ff0080]' : 'text-[#00ff41]';
  const boxBorder = isMalicious ? 'border-[#ff0080]' : 'border-[#00d9ff]';
  const boxBg = isMalicious ? 'bg-[#ff0080]/5' : 'bg-[#00d9ff]/5';

  const abuseData = sources.abuseipdb?.data;
  const vtStats = sources.virustotal?.data?.attributes?.last_analysis_stats;
  const spamhaus = sources.spamhaus;
  const alienVault = sources.alienvault;
  const proxyCheck = sources.proxycheck;

  const sourceKeys = Object.keys(sources);

  const copySummary = () => {
    const lines = [
      `IP: ${ip}`,
      `Threat Score: ${result.overallThreatScore}/100`,
      `Verdict: ${isMalicious ? 'MALICIOUS' : 'CLEAN'}`,
      `Country: ${enrichment.country || 'Unknown'}`,
      `Org: ${enrichment.org || 'Unknown'}`,
      `ASN: ${enrichment.asn || 'Unknown'}`,
      `ISP: ${enrichment.isp || 'Unknown'}`,
      `VPN: ${enrichment.isVPN ? 'Yes' : 'No'}`,
      `Tor: ${enrichment.isTor ? 'Yes' : 'No'}`,
      `AbuseIPDB: ${abuseData?.abuseConfidenceScore ?? 'N/A'}%`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (showJson) {
    return (
      <div className="h-full overflow-y-auto p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} JSON Output for {ip}</div>
        <div className="border border-[#4a5568] bg-[#0a0e1a] p-4 font-mono text-xs">
          <pre className="text-[#a5d8ff] whitespace-pre-wrap break-all">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
        <TerminalActions onBack={onBack} onCopy={copySummary} copied={copied} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="mb-4">
        <div className="text-[#00d9ff] mb-1">{'>'} Scan complete</div>
        <div className="text-[#4a5568]">[*] Analysis finished in {elapsed}s | {sourceKeys.length} sources queried</div>
      </div>

      <div className={`border ${boxBorder} ${boxBg} p-4 mb-4`}>
        <div className="text-[#00d9ff] mb-3">═══ IP ANALYSIS RESULTS ═══</div>

        <div className="space-y-1 text-[#a5d8ff]">
          <Row label="TARGET" value={ip} valueClass="text-white" />
          <Row label="VERDICT" value={`${isMalicious ? 'MALICIOUS' : 'CLEAN'} (Score: ${result.overallThreatScore}/100)`} valueClass={statusColor} />

          {showGeo && (
            <Section title="GEOLOCATION">
              <Row label="Country" value={enrichment.country ? `${enrichment.country}${enrichment.countryCode ? ` (${enrichment.countryCode})` : ''}` : 'Unknown'} />
              <Row label="City" value={enrichment.city || 'Unknown'} />
              <Row label="Region" value={enrichment.region || 'Unknown'} />
              <Row label="Timezone" value={enrichment.timezone || 'Unknown'} />
              {(enrichment.lat !== undefined && enrichment.lon !== undefined) && (
                <Row label="Coordinates" value={`${enrichment.lat}, ${enrichment.lon}`} />
              )}
            </Section>
          )}

          {showNetwork && (
            <Section title="NETWORK">
              <Row label="Organization" value={enrichment.org || 'Unknown'} />
              <Row label="ISP" value={enrichment.isp || 'Unknown'} />
              <Row label="ASN" value={enrichment.asn || 'Unknown'} />
              <Row label="Hosting/DC" value={enrichment.isHosting ? 'Yes' : 'No'} valueClass={enrichment.isHosting ? 'text-[#fbbf24]' : 'text-[#00ff41]'} />
            </Section>
          )}

          {showVpn && (
            <Section title="VPN / PROXY / TOR">
              <Row label="VPN" value={enrichment.isVPN ? `Detected${enrichment.vpnService ? ` (${enrichment.vpnService})` : ''}` : 'Not detected'} valueClass={enrichment.isVPN ? 'text-[#fbbf24]' : 'text-[#00ff41]'} />
              <Row label="Proxy" value={enrichment.isProxy ? 'Detected' : 'Not detected'} valueClass={enrichment.isProxy ? 'text-[#fbbf24]' : 'text-[#00ff41]'} />
              <Row label="Tor Exit" value={enrichment.isTor ? 'DETECTED' : 'Not detected'} valueClass={enrichment.isTor ? 'text-[#ff0080]' : 'text-[#00ff41]'} />
              {proxyCheck?.operator && (
                <>
                  {proxyCheck.operator.anonymity && <Row label="Anonymity" value={proxyCheck.operator.anonymity} />}
                  {proxyCheck.operator.protocols && (
                    <Row label="Protocols" value={proxyCheck.operator.protocols.join(', ')} />
                  )}
                </>
              )}
            </Section>
          )}

          {showThreats && (
            <Section title="THREAT INTELLIGENCE">
              <div className="space-y-2">
                {abuseData && (
                  <div>
                    <div className="text-[#00d9ff] text-xs mb-1">AbuseIPDB:</div>
                    <div className="pl-2">
                      <Row label="Confidence" value={`${abuseData.abuseConfidenceScore ?? 0}%`} valueClass={(abuseData.abuseConfidenceScore ?? 0) > 50 ? 'text-[#ff0080]' : 'text-[#a5d8ff]'} />
                      <Row label="Reports" value={String(abuseData.totalReports ?? 0)} />
                      {abuseData.lastReportedAt && <Row label="Last Report" value={new Date(abuseData.lastReportedAt).toLocaleDateString()} />}
                    </div>
                  </div>
                )}

                {vtStats && (
                  <div>
                    <div className="text-[#00d9ff] text-xs mb-1">VirusTotal:</div>
                    <div className="pl-2 flex gap-4 flex-wrap">
                      <span className="text-[#ff0080]">{vtStats.malicious || 0} malicious</span>
                      <span className="text-[#fbbf24]">{vtStats.suspicious || 0} suspicious</span>
                      <span className="text-[#00ff41]">{vtStats.harmless || 0} clean</span>
                      <span className="text-[#4a5568]">{vtStats.undetected || 0} undetected</span>
                    </div>
                  </div>
                )}

                {spamhaus && (
                  <div>
                    <div className="text-[#00d9ff] text-xs mb-1">Spamhaus:</div>
                    <div className="pl-2">
                      {spamhaus.listedIn && spamhaus.listedIn.length > 0 ? (
                        <div className="text-[#ff0080]">
                          LISTED on {spamhaus.listedIn.length} blocklist(s): {spamhaus.listedIn.join(', ')}
                        </div>
                      ) : enrichment.spamhausListed ? (
                        <div className="text-[#ff0080]">Listed{enrichment.spamhausLists ? `: ${enrichment.spamhausLists.join(', ')}` : ''}</div>
                      ) : (
                        <div className="text-[#00ff41]">Not listed</div>
                      )}
                    </div>
                  </div>
                )}

                {alienVault?.pulse_info?.pulses && alienVault.pulse_info.pulses.length > 0 && (
                  <div>
                    <div className="text-[#00d9ff] text-xs mb-1">AlienVault OTX ({alienVault.pulse_info.count} pulses):</div>
                    <div className="pl-2 space-y-1">
                      {alienVault.pulse_info.pulses.slice(0, 5).map((pulse: any, i: number) => (
                        <div key={i} className="text-[#a5d8ff]">
                          <span className="text-[#fbbf24]">*</span> {pulse.name}
                          {pulse.tags?.length > 0 && (
                            <span className="text-[#4a5568]"> [{pulse.tags.slice(0, 3).join(', ')}]</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {showSources && (
            <Section title="SOURCE STATUS">
              <div className="space-y-1">
                {sourceKeys.map(key => {
                  const s = sources[key];
                  const hasError = s?.error;
                  const icon = hasError ? '✗' : '✓';
                  const color = hasError ? 'text-[#ff0080]' : 'text-[#00ff41]';
                  return (
                    <div key={key} className={color}>
                      {icon} {key.padEnd(20)} {hasError ? `[ERROR: ${s.error}]` : '[OK]'}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      </div>

      <TerminalActions onBack={onBack} onCopy={copySummary} copied={copied} />

      <div className="text-[#4a5568] text-xs mt-4">
        <div>Type "scan -ip [IP]" for another scan</div>
        <div>Use flags: --threats --network --vpn --geo --sources --json -v</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#4a5568] my-3 pt-3">
      <div className="text-[#4a5568] text-xs mb-2">{title}:</div>
      {children}
    </div>
  );
}

function Row({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="text-[#a5d8ff]">
      {label} <span className="text-[#4a5568]">{'.'}</span> <span className={valueClass}>{value}</span>
    </div>
  );
}

function TerminalActions({ onBack, onCopy, copied }: { onBack?: () => void; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex gap-2 mt-4">
      <button
        onClick={onCopy}
        className="px-4 py-2 border border-[#00d9ff] text-[#00d9ff] hover:bg-[#00d9ff] hover:text-[#0a0e1a] transition-all text-xs uppercase"
        style={{ textShadow: '0 0 5px #00d9ff' }}
      >
        {copied ? '[ COPIED ]' : '[ COPY SUMMARY ]'}
      </button>
      {onBack && (
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[#4a5568] text-[#a5d8ff] hover:border-[#00d9ff] hover:text-[#00d9ff] transition-all text-xs uppercase"
        >
          [ BACK ]
        </button>
      )}
    </div>
  );
}
