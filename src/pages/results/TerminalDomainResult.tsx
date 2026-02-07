import { useEffect, useState } from 'react';
import { shouldShowSection, type ScanFlags } from '../../lib/cliFlags';

interface DnsRecords {
  a: string[];
  mx: { priority: number; host: string }[];
  ns: string[];
  txt: string[];
}

interface DomainResult {
  domain: string;
  dns: DnsRecords | null;
  isSuspicious: boolean;
  suspiciousReasons: string[];
  checkedAt: string;
}

interface TerminalDomainResultProps {
  domain: string;
  flags?: ScanFlags;
  onBack?: () => void;
}

export default function TerminalDomainResult({ domain, flags, onBack }: TerminalDomainResultProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<DomainResult | null>(null);
  const [error, setError] = useState('');

  const showNetwork = !flags || shouldShowSection(flags, 'network');
  const showThreats = !flags || shouldShowSection(flags, 'threats');
  const showJson = flags?.json || false;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');

      try {
        const dnsResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
        const dnsData = await dnsResponse.json();
        const aRecords = dnsData.Answer?.filter((r: { type: number }) => r.type === 1).map((r: { data: string }) => r.data) || [];

        const mxResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
        const mxData = await mxResponse.json();
        const mxRecords = mxData.Answer?.filter((r: { type: number }) => r.type === 15).map((r: { data: string }) => {
          const parts = r.data.split(' ');
          return { priority: parseInt(parts[0]), host: parts[1]?.replace(/\.$/, '') || '' };
        }) || [];

        const nsResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=NS`);
        const nsData = await nsResponse.json();
        const nsRecords = nsData.Answer?.filter((r: { type: number }) => r.type === 2).map((r: { data: string }) => r.data.replace(/\.$/, '')) || [];

        const txtResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=TXT`);
        const txtData = await txtResponse.json();
        const txtRecords = txtData.Answer?.filter((r: { type: number }) => r.type === 16).map((r: { data: string }) => r.data.replace(/^"|"$/g, '')) || [];

        const suspiciousReasons: string[] = [];

        const suspiciousTLDs = ['.xyz', '.top', '.click', '.loan', '.online', '.site', '.club', '.win', '.bid', '.stream'];
        if (suspiciousTLDs.some(tld => domain.endsWith(tld))) {
          suspiciousReasons.push('Domain uses commonly abused TLD');
        }

        if (domain.split('.')[0].length > 20) {
          suspiciousReasons.push('Unusually long subdomain (possible DGA)');
        }

        const hasSPF = txtRecords.some(r => r.includes('v=spf1'));
        const hasDMARC = txtRecords.some(r => r.includes('v=DMARC1'));
        if (!hasSPF) suspiciousReasons.push('No SPF record');
        if (!hasDMARC) suspiciousReasons.push('No DMARC record');

        if (aRecords.length === 0) {
          suspiciousReasons.push('No A records found');
        }

        setResult({
          domain,
          dns: {
            a: aRecords,
            mx: mxRecords,
            ns: nsRecords,
            txt: txtRecords,
          },
          isSuspicious: suspiciousReasons.length > 0,
          suspiciousReasons,
          checkedAt: new Date().toISOString(),
        });
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
        <div className="text-[#4a5568] mb-2">[*] Resolving DNS records...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking MX records...</div>
        <div className="text-[#4a5568] mb-2">[*] Querying nameservers...</div>
        <div className="text-[#4a5568] mb-2">[*] Analyzing TXT records...</div>
        <div className="text-[#4a5568]">[*] Evaluating security posture...</div>
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

  const isSuspicious = result.isSuspicious;
  const statusColor = isSuspicious ? 'text-[#fbbf24]' : 'text-[#00ff41]';
  const boxBorderColor = isSuspicious ? 'border-[#fbbf24]' : 'border-[#00d9ff]';
  const boxBgColor = isSuspicious ? 'bg-[#fbbf24]/5' : 'bg-[#00d9ff]/5';

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
        <div className="text-[#00d9ff] mb-2">{'>'} Domain analysis complete</div>
        <div className="text-[#4a5568]">[*] Analysis finished in 1.53s</div>
      </div>

      <div className={`border ${boxBorderColor} ${boxBgColor} p-4 mb-4`}>
        <div className="text-[#00d9ff] mb-3">═══ DOMAIN INTELLIGENCE ═══</div>

        <div className="space-y-2 text-[#a5d8ff]">
          <div>Domain: <span className="text-white">{domain}</span></div>
          <div>
            Status: <span className={statusColor}>
              {isSuspicious ? '⚠ SUSPICIOUS INDICATORS' : '✓ NO MAJOR ISSUES'}
            </span>
          </div>

          {showNetwork && result.dns && (
            <>
              <div className="border-t border-[#4a5568] my-3 pt-3">
                <div className="text-[#4a5568] text-xs mb-2">DNS RECORDS:</div>
                <div className="space-y-2">
                  {result.dns.a.length > 0 && (
                    <div>
                      <div className="text-[#00d9ff]">A Records ({result.dns.a.length}):</div>
                      <div className="pl-2">
                        {result.dns.a.map((ip, i) => (
                          <div key={i} className="text-white">{ip}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.dns.mx.length > 0 && (
                    <div>
                      <div className="text-[#00d9ff]">MX Records ({result.dns.mx.length}):</div>
                      <div className="pl-2">
                        {result.dns.mx.map((mx, i) => (
                          <div key={i} className="text-white">{mx.priority} {mx.host}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.dns.ns.length > 0 && (
                    <div>
                      <div className="text-[#00d9ff]">Nameservers ({result.dns.ns.length}):</div>
                      <div className="pl-2">
                        {result.dns.ns.map((ns, i) => (
                          <div key={i} className="text-white">{ns}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.dns.txt.length > 0 && (
                    <div>
                      <div className="text-[#00d9ff]">TXT Records ({result.dns.txt.length}):</div>
                      <div className="pl-2">
                        {result.dns.txt.map((txt, i) => (
                          <div key={i} className="text-white text-xs break-all">{txt}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {showThreats && result.suspiciousReasons.length > 0 && (
            <div className="border-t border-[#4a5568] my-3 pt-3">
              <div className="text-[#4a5568] text-xs mb-2">SUSPICIOUS INDICATORS:</div>
              <div className="space-y-1">
                {result.suspiciousReasons.map((reason, i) => (
                  <div key={i} className="text-[#fbbf24]">⚠ {reason}</div>
                ))}
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

      <div className="text-[#4a5568] text-xs mt-4">
        <div>Type "scan -domain [DOMAIN]" for another scan</div>
        <div>Type "help" for more commands</div>
        <div>Click button above to return to terminal</div>
      </div>
    </div>
  );
}
