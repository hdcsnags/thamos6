import { useEffect, useState, useRef } from 'react';
import { lookupDomain } from '../../lib/threatIntel';
import type { DomainLookupResult } from '../../types';
import { shouldShowSection, type ScanFlags } from '../../lib/cliFlags';

interface TerminalDomainResultProps {
  domain: string;
  flags?: ScanFlags;
  onBack?: () => void;
}

export default function TerminalDomainResult({ domain, flags, onBack }: TerminalDomainResultProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<DomainLookupResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const startTime = useRef(Date.now());

  const showNetwork = !flags || shouldShowSection(flags, 'network');
  const showThreats = !flags || shouldShowSection(flags, 'threats');
  const showSources = !flags || shouldShowSection(flags, 'sources');
  const showJson = flags?.json || false;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      startTime.current = Date.now();
      try {
        const data = await lookupDomain(domain);
        setResult(data);
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
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} Analyzing domain: {domain}</div>
        <div className="text-[#4a5568] mb-2">[*] Querying WHOIS/RDAP...</div>
        <div className="text-[#4a5568] mb-2">[*] Fetching VirusTotal data...</div>
        <div className="text-[#4a5568] mb-2">[*] Resolving DNS records...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking SSL certificate...</div>
        <div className="text-[#4a5568] mb-2">[*] Analyzing reputation...</div>
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

  const elapsed = ((Date.now() - startTime.current) / 1000).toFixed(2);
  const isMalicious = result.isMalicious;
  const statusColor = isMalicious ? 'text-[#ff0080]' : 'text-[#00ff41]';
  const boxBorder = isMalicious ? 'border-[#ff0080]' : 'border-[#00d9ff]';
  const boxBg = isMalicious ? 'bg-[#ff0080]/5' : 'bg-[#00d9ff]/5';

  const whois = result.whois;
  const sources = result.sources || {};
  const vtData = sources.virustotal?.details?.data?.attributes as any;
  const dnsRecords = vtData?.last_dns_records || [];
  const sslCert = vtData?.last_https_certificate;
  const vtStats = vtData?.last_analysis_stats;
  const sourceKeys = Object.keys(sources);

  const copySummary = () => {
    const lines = [
      `Domain: ${domain}`,
      `Threat Score: ${result.overallThreatScore}/100`,
      `Verdict: ${isMalicious ? 'MALICIOUS' : 'CLEAN'}`,
      `Registrar: ${whois?.registrar || 'Unknown'}`,
      `Age: ${whois?.domainAge ? `${Math.floor(whois.domainAge / 365)} years` : 'Unknown'}`,
      `Registration: ${whois?.registrationDate ? new Date(whois.registrationDate).toLocaleDateString() : 'Unknown'}`,
      `Expiration: ${whois?.expirationDate ? new Date(whois.expirationDate).toLocaleDateString() : 'Unknown'}`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (showJson) {
    return (
      <div className="h-full overflow-y-auto p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} JSON Output for {domain}</div>
        <div className="border border-[#4a5568] bg-[#0a0e1a] p-4 font-mono text-xs">
          <pre className="text-[#a5d8ff] whitespace-pre-wrap break-all">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
        <TerminalActions onBack={onBack} onCopy={copySummary} copied={copied} />
      </div>
    );
  }

  const aRecords = dnsRecords.filter((r: any) => r.type === 'A');
  const aaaaRecords = dnsRecords.filter((r: any) => r.type === 'AAAA');
  const mxRecords = dnsRecords.filter((r: any) => r.type === 'MX');
  const nsRecords = dnsRecords.filter((r: any) => r.type === 'NS');
  const txtRecords = dnsRecords.filter((r: any) => r.type === 'TXT');

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="mb-4">
        <div className="text-[#00d9ff] mb-1">{'>'} Domain analysis complete</div>
        <div className="text-[#4a5568]">[*] Analysis finished in {elapsed}s | {sourceKeys.length} sources queried</div>
      </div>

      <div className={`border ${boxBorder} ${boxBg} p-4 mb-4`}>
        <div className="text-[#00d9ff] mb-3">═══ DOMAIN INTELLIGENCE ═══</div>

        <div className="space-y-1 text-[#a5d8ff]">
          <Row label="TARGET" value={domain} valueClass="text-white" />
          <Row label="VERDICT" value={`${isMalicious ? 'MALICIOUS' : 'CLEAN'} (Score: ${result.overallThreatScore}/100)`} valueClass={statusColor} />

          <Section title="WHOIS / REGISTRATION">
            <Row label="Registrar" value={whois?.registrar || 'Unknown'} />
            <Row label="Registered" value={whois?.registrationDate ? new Date(whois.registrationDate).toLocaleDateString() : 'Unknown'} />
            <Row label="Expires" value={whois?.expirationDate ? new Date(whois.expirationDate).toLocaleDateString() : 'Unknown'} />
            <Row label="Domain Age" value={whois?.domainAge ? `${whois.domainAge} days (${Math.floor(whois.domainAge / 365)} years)` : 'Unknown'} valueClass={whois?.domainAge && whois.domainAge < 30 ? 'text-[#ff0080]' : 'text-white'} />
            {whois?.status && whois.status.length > 0 && (
              <div className="text-[#a5d8ff]">
                Status <span className="text-[#4a5568]">.</span>{' '}
                {whois.status.map((s: string, i: number) => (
                  <span key={i} className="text-[#00d9ff] mr-2">[{s}]</span>
                ))}
              </div>
            )}
            {whois?.nameservers && whois.nameservers.length > 0 && (
              <div>
                <div className="text-[#a5d8ff]">Nameservers:</div>
                <div className="pl-2">
                  {whois.nameservers.map((ns: string, i: number) => (
                    <div key={i} className="text-[#00d9ff]">{ns}</div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {sslCert && (
            <Section title="SSL / TLS CERTIFICATE">
              <Row label="Subject" value={sslCert.subject?.CN || 'Unknown'} />
              <Row label="Issuer" value={sslCert.issuer?.CN || 'Unknown'} />
              <Row label="Valid From" value={sslCert.validity?.not_before || 'Unknown'} />
              <Row label="Valid Until" value={sslCert.validity?.not_after || 'Unknown'} />
            </Section>
          )}

          {showThreats && vtStats && (
            <Section title="VIRUSTOTAL ANALYSIS">
              <div className="pl-2 flex gap-4 flex-wrap">
                <span className="text-[#ff0080]">{vtStats.malicious || 0} malicious</span>
                <span className="text-[#fbbf24]">{vtStats.suspicious || 0} suspicious</span>
                <span className="text-[#00ff41]">{vtStats.harmless || 0} clean</span>
                <span className="text-[#4a5568]">{vtStats.undetected || 0} undetected</span>
              </div>
            </Section>
          )}

          {result.categories && Object.keys(result.categories).length > 0 && (
            <Section title="CATEGORIES">
              <div className="pl-2 space-y-1">
                {Object.entries(result.categories).map(([source, category]) => (
                  <div key={source} className="text-[#a5d8ff]">
                    <span className="text-[#4a5568]">{source}:</span> <span className="text-white">{category}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {showNetwork && dnsRecords.length > 0 && (
            <Section title="DNS RECORDS">
              <DnsBlock label="A" records={aRecords} />
              <DnsBlock label="AAAA" records={aaaaRecords} />
              <DnsBlock label="MX" records={mxRecords} showPriority />
              <DnsBlock label="NS" records={nsRecords} />
              <DnsBlock label="TXT" records={txtRecords} />
            </Section>
          )}

          {showSources && (
            <Section title="SOURCE STATUS">
              <div className="space-y-1">
                {sourceKeys.map(key => {
                  const s = sources[key];
                  const hasError = s?.error;
                  const found = s?.found;
                  const icon = hasError ? '✗' : found ? '●' : '○';
                  const color = hasError ? 'text-[#ff0080]' : found ? 'text-[#00ff41]' : 'text-[#4a5568]';
                  const status = hasError ? `[ERROR: ${s.error}]` : found ? '[FOUND]' : '[NOT FOUND]';
                  return (
                    <div key={key} className={color}>
                      {icon} {key.padEnd(20)} {status}
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
        <div>Type "scan -domain [DOMAIN]" for another scan</div>
        <div>Use flags: --threats --network --sources --json -v</div>
      </div>
    </div>
  );
}

function DnsBlock({ label, records, showPriority }: { label: string; records: any[]; showPriority?: boolean }) {
  if (records.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="text-[#00d9ff] text-xs">{label} Records ({records.length}):</div>
      <div className="pl-2">
        {records.map((r: any, i: number) => (
          <div key={i} className="text-white text-xs break-all">
            {r.value}{showPriority && r.priority ? ` (pri: ${r.priority})` : ''}
          </div>
        ))}
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
      {label} <span className="text-[#4a5568]">.</span> <span className={valueClass}>{value}</span>
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
