import { useEffect, useState, useRef } from 'react';
import {
  AlertTriangle, Shield, Database, MapPin, Server, Wifi,
  ExternalLink, Target, FileJson, GitBranch, Scale, Copy, Check,
} from 'lucide-react';
import { useTheme } from '../../contexts/themecontext';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult } from '../../types';
import { RelatedIOCs } from '../../components/RelatedIOCs';
import VerdictPanel from '../../components/scanner/VerdictPanel';
import VerdictStrip from '../../components/scanner/VerdictStrip';
import { palette, typography } from '../../design-system/tokens';
import {
  ResultShell, ResultLoading, ResultError, ResultEmpty,
  MetricCard, StatCell, Pill, SectionHeader, Callout, ResultCard, SummaryActions,
  type ShellMenuItem,
} from '../../components/results';

interface IPResultProps {
  ip: string;
  onScan?: (type: string, value: string) => void;
}

type MenuItem = 'overview' | 'verdict' | 'network' | 'threats' | 'vpn' | 'location' | 'pivot' | 'sources' | 'raw';

export default function IPResult({ ip, onScan }: IPResultProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [proMode, setProMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const mainContainer = containerRef.current.closest('[style*="overflow"]');
      if (mainContainer) {
        mainContainer.scrollTop = 0;
      }
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const performLookup = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await lookupIP(ip);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup IP');
      } finally {
        setLoading(false);
      }
    };

    performLookup();
  }, [ip]);

  if (loading && !result) {
    return <div ref={containerRef} className="h-full"><ResultLoading message={`Analyzing ${ip}…`} /></div>;
  }

  if (error) {
    return <div ref={containerRef} className="h-full"><ResultError message={error} /></div>;
  }

  if (!result) {
    return <div ref={containerRef} className="h-full"><ResultEmpty message={`No result data available for ${ip}.`} /></div>;
  }

  const enrichment = result.enrichment || {};
  // Edge function payload carries per-provider raw data in `sources`; the
  // IPLookupResult type only declares the aggregated `results` map.
  const sources: Record<string, any> = (result as unknown as { sources?: Record<string, any> }).sources || {};

  const spamhausData = sources.spamhaus as any;
  const alienVaultData = sources.alienvault as any;
  const proxyCheckData = sources.proxycheck as any;
  const virusTotalData = sources.virustotal as any;
  const abuseIPDBData = sources.abuseipdb as any;
  const teamCymruData = sources.teamcymru as any;

  const menuItems: ShellMenuItem<MenuItem>[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'verdict', label: 'Verdict', icon: Scale },
    { id: 'network', label: 'Network', icon: Server },
    { id: 'threats', label: 'Threats', icon: AlertTriangle },
    { id: 'vpn', label: 'VPN/Proxy', icon: Wifi },
    { id: 'location', label: 'Location', icon: MapPin },
    { id: 'pivot', label: 'Pivot Graph', icon: GitBranch },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'raw', label: 'Raw JSON', icon: FileJson },
  ];

  const getSummary = () => {
    const e = result.enrichment || {};
    return `IP: ${ip}\nCountry: ${e.country || 'Unknown'}\nOrg: ${e.org || 'Unknown'}\nThreat Score: ${result.overallThreatScore}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}`;
  };

  return (
    <div ref={containerRef} className="h-full">
      <ResultShell<MenuItem>
        value={ip}
        typeLabel="IP reputation"
        verdict={{
          label: result.isMalicious ? 'Malicious' : 'Clean',
          tone: result.isMalicious ? 'danger' : 'good',
        }}
        score={result.overallThreatScore}
        menuItems={menuItems}
        activeMenu={activeMenu}
        onMenuChange={setActiveMenu}
        variant={theme === 'desktop' ? 'tabs' : 'sidebar'}
        proMode={proMode}
        onToggleProMode={() => setProMode(!proMode)}
        headerActions={<SummaryActions getSummary={getSummary} getJson={() => result} />}
      >
        {activeMenu === 'overview' && (
          <div className="space-y-4">
            <VerdictStrip scoring={result.scoring} />
            <OverviewSection
              enrichment={enrichment}
              spamhausData={spamhausData}
              abuseIPDBData={abuseIPDBData}
              virusTotalData={virusTotalData}
            />
          </div>
        )}

        {activeMenu === 'verdict' && (
          <VerdictPanel lookupType="ip" value={ip} scoring={result.scoring} />
        )}

        {activeMenu === 'network' && (
          <NetworkSection enrichment={enrichment} teamCymruData={teamCymruData} proMode={proMode} />
        )}

        {activeMenu === 'threats' && (
          <ThreatsSection spamhausData={spamhausData} alienVaultData={alienVaultData} virusTotalData={virusTotalData} proMode={proMode} />
        )}

        {activeMenu === 'vpn' && (
          <VPNSection enrichment={enrichment} proxyCheckData={proxyCheckData} proMode={proMode} />
        )}

        {activeMenu === 'location' && (
          <LocationSection enrichment={enrichment} proMode={proMode} />
        )}

        {activeMenu === 'pivot' && (
          <div className="space-y-4">
            <SectionHeader icon={<GitBranch className="w-4 h-4" />} title="IOC pivot graph" />
            <RelatedIOCs iocType="ip" iocValue={ip} onScan={onScan} />
          </div>
        )}

        {activeMenu === 'sources' && (
          <SourcesSection sources={sources} proMode={proMode} />
        )}

        {activeMenu === 'raw' && (
          <RawJsonSection data={result} />
        )}
      </ResultShell>
    </div>
  );
}

function OverviewSection({ enrichment, spamhausData, abuseIPDBData, virusTotalData }: any) {
  const vpnActive = enrichment.isVPN || enrichment.isProxy;
  const abuseScore = abuseIPDBData?.data?.abuseConfidenceScore || 0;
  const vtStats = virusTotalData?.data?.attributes?.last_analysis_stats;

  return (
    <div className="space-y-4">
      {/* Notable findings first — tinted only when the state is real */}
      {enrichment.spamhausListed && spamhausData?.listedIn && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          title="Spamhaus blocklist detected"
          detail={`Listed in ${spamhausData.listedIn.length} blocklist(s) — details in Threats`}
          tone="danger"
        />
      )}
      {enrichment.isTor && (
        <Callout
          icon={<Shield className="w-4 h-4" />}
          title="Tor exit node"
          detail="Traffic from this address is anonymised through the Tor network"
          tone="danger"
        />
      )}

      {/* Key indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Location"
          icon={<MapPin className="w-3.5 h-3.5" />}
          value={enrichment.country || 'Unknown'}
          detail={[enrichment.city, enrichment.region].filter(Boolean).join(', ') || undefined}
        />
        <MetricCard
          label="VPN / Proxy"
          icon={<Wifi className="w-3.5 h-3.5" />}
          value={enrichment.isVPN ? 'VPN detected' : enrichment.isProxy ? 'Proxy detected' : 'None detected'}
          detail={enrichment.vpnService || (enrichment.confidence ? `${enrichment.confidence}% confidence` : undefined)}
          tone={vpnActive ? 'warn' : 'neutral'}
          highlight={vpnActive}
        />
        <MetricCard
          label="Tor"
          icon={<Shield className="w-3.5 h-3.5" />}
          value={enrichment.isTor ? 'Tor exit node' : 'Not Tor'}
          tone={enrichment.isTor ? 'danger' : 'neutral'}
          highlight={!!enrichment.isTor}
        />
        <MetricCard
          label="AbuseIPDB confidence"
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          value={`${abuseScore}%`}
          detail={`${abuseIPDBData?.data?.totalReports || 0} reports`}
          tone={abuseScore > 50 ? 'danger' : abuseScore > 0 ? 'warn' : 'neutral'}
          highlight={abuseScore > 50}
        />
      </div>

      {/* VirusTotal quick stats */}
      {vtStats && (
        <ResultCard>
          <SectionHeader icon={<Shield className="w-4 h-4" />} title="VirusTotal" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <StatCell label="Malicious" value={vtStats.malicious || 0} tone={vtStats.malicious ? 'danger' : 'neutral'} />
            <StatCell label="Suspicious" value={vtStats.suspicious || 0} tone={vtStats.suspicious ? 'warn' : 'neutral'} />
            <StatCell label="Clean" value={vtStats.harmless || 0} tone={vtStats.harmless ? 'good' : 'neutral'} />
            <StatCell label="Undetected" value={vtStats.undetected || 0} />
          </div>
        </ResultCard>
      )}
    </div>
  );
}

function NetworkSection({ enrichment, teamCymruData, proMode }: any) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={<Server className="w-4 h-4" />} title="Network information" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard label="Organization" value={enrichment.org || 'Unknown'} />
        <MetricCard label="ISP" value={enrichment.isp || 'Unknown'} />
        <MetricCard label="ASN" value={enrichment.asn || 'Unknown'} mono />
        <MetricCard
          label="Hosting / datacenter"
          value={enrichment.isHosting ? 'Yes' : 'No'}
          tone={enrichment.isHosting ? 'warn' : 'neutral'}
        />
      </div>

      {proMode && teamCymruData && (
        <ResultCard>
          <SectionHeader title="BGP & allocation" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {teamCymruData.bgp_prefix && (
              <div>
                <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>BGP prefix</div>
                <div className="text-sm font-medium" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>
                  {teamCymruData.bgp_prefix}
                </div>
              </div>
            )}
            {teamCymruData.allocated && (
              <div>
                <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>Allocated</div>
                <div className="text-sm font-medium" style={{ color: palette.textPrimary }}>{teamCymruData.allocated}</div>
              </div>
            )}
            {teamCymruData.registry && (
              <div>
                <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>Registry</div>
                <div className="text-sm font-medium uppercase" style={{ color: palette.textPrimary }}>{teamCymruData.registry}</div>
              </div>
            )}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

function ThreatsSection({ spamhausData, alienVaultData, virusTotalData, proMode }: any) {
  const vtStats = virusTotalData?.data?.attributes?.last_analysis_stats;

  return (
    <div className="space-y-4">
      <SectionHeader icon={<AlertTriangle className="w-4 h-4" />} title="Threat intelligence" />

      {spamhausData?.listedIn && spamhausData.listedIn.length > 0 && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          title={`Spamhaus blocklists (${spamhausData.listedIn.length})`}
          tone="danger"
        >
          <div className="space-y-1.5 mt-2">
            {spamhausData.listedIn.slice(0, proMode ? undefined : 3).map((list: string, idx: number) => (
              <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                   style={{ background: palette.base, border: `1px solid ${palette.borderSubtle}` }}>
                <span className="text-sm font-medium" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{list}</span>
                <Pill label="Listed" tone="danger" />
              </div>
            ))}
          </div>
        </Callout>
      )}

      {proMode && alienVaultData?.pulse_info?.pulses && alienVaultData.pulse_info.pulses.length > 0 && (
        <ResultCard>
          <SectionHeader title={`AlienVault threat pulses (${alienVaultData.pulse_info.count})`} />
          <div className="space-y-2 mt-4">
            {alienVaultData.pulse_info.pulses.slice(0, 5).map((pulse: any, idx: number) => (
              <div key={idx} className="p-3 rounded-md" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-sm font-semibold" style={{ color: palette.textPrimary }}>{pulse.name}</div>
                  <span className="text-[11px] shrink-0" style={{ color: palette.textTertiary }}>{pulse.modified_text}</span>
                </div>
                {pulse.description && (
                  <div className="text-xs mb-1.5" style={{ color: palette.textSecondary }}>{pulse.description}</div>
                )}
                {pulse.tags && pulse.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pulse.tags.slice(0, 5).map((tag: string, tagIdx: number) => (
                      <span key={tagIdx} className="px-1.5 py-0.5 rounded text-[11px]"
                            style={{ background: palette.surface, color: palette.textSecondary }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ResultCard>
      )}

      {vtStats && (
        <ResultCard>
          <SectionHeader title="VirusTotal analysis" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <StatCell label="Malicious" value={vtStats.malicious || 0} tone={vtStats.malicious ? 'danger' : 'neutral'} />
            <StatCell label="Suspicious" value={vtStats.suspicious || 0} tone={vtStats.suspicious ? 'warn' : 'neutral'} />
            <StatCell label="Clean" value={vtStats.harmless || 0} tone={vtStats.harmless ? 'good' : 'neutral'} />
            <StatCell label="Undetected" value={vtStats.undetected || 0} />
          </div>
        </ResultCard>
      )}
    </div>
  );
}

function VPNSection({ enrichment, proxyCheckData, proMode }: any) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={<Wifi className="w-4 h-4" />} title="VPN / proxy analysis" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label="VPN status"
          value={enrichment.isVPN ? 'VPN detected' : 'No VPN'}
          tone={enrichment.isVPN ? 'warn' : 'neutral'}
          highlight={!!enrichment.isVPN}
        />
        <MetricCard
          label="Proxy status"
          value={enrichment.isProxy ? 'Proxy detected' : 'No proxy'}
          tone={enrichment.isProxy ? 'warn' : 'neutral'}
          highlight={!!enrichment.isProxy}
        />
        {enrichment.vpnService && <MetricCard label="Provider" value={enrichment.vpnService} />}
        {enrichment.confidence && <MetricCard label="Confidence" value={`${enrichment.confidence}%`} />}
      </div>

      {proMode && proxyCheckData?.operator && (
        <ResultCard>
          <SectionHeader title="Provider details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>Anonymity level</div>
              <div className="text-sm font-medium capitalize" style={{ color: palette.textPrimary }}>
                {proxyCheckData.operator.anonymity}
              </div>
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>Popularity</div>
              <div className="text-sm font-medium capitalize" style={{ color: palette.textPrimary }}>
                {proxyCheckData.operator.popularity}
              </div>
            </div>
          </div>

          {proxyCheckData.operator.url && (
            <div className="mt-4">
              <div className="text-[11px] mb-1" style={{ color: palette.textTertiary }}>Website</div>
              <a
                href={proxyCheckData.operator.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm hover:underline"
                style={{ color: palette.accent }}
              >
                {proxyCheckData.operator.url}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {proxyCheckData.operator.protocols && (
            <div className="mt-4">
              <div className="text-[11px] mb-2" style={{ color: palette.textTertiary }}>Protocols</div>
              <div className="flex flex-wrap gap-1.5">
                {proxyCheckData.operator.protocols.map((protocol: string, idx: number) => (
                  <span key={idx} className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: palette.surface, color: palette.textSecondary, fontFamily: typography.mono }}>
                    {protocol}
                  </span>
                ))}
              </div>
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}

function LocationSection({ enrichment, proMode }: any) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={<MapPin className="w-4 h-4" />} title="Geolocation" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard label="Country" value={enrichment.country || 'Unknown'} detail={enrichment.countryCode} />
        <MetricCard label="City" value={enrichment.city || 'Unknown'} />
        <MetricCard label="Region" value={enrichment.region || 'Unknown'} />
        <MetricCard label="Timezone" value={enrichment.timezone || 'Unknown'} />
        {proMode && (
          <>
            <MetricCard label="Latitude" value={enrichment.lat ?? 'Unknown'} mono />
            <MetricCard label="Longitude" value={enrichment.lon ?? 'Unknown'} mono />
          </>
        )}
      </div>
    </div>
  );
}

function SourcesSection({ sources, proMode }: any) {
  const sourceKeys = Object.keys(sources);

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Database className="w-4 h-4" />} title="Individual sources" />

      <div className="space-y-3">
        {sourceKeys.slice(0, proMode ? undefined : 5).map((sourceKey) => {
          const sourceData = sources[sourceKey];
          return (
            <ResultCard key={sourceKey}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                  {sourceKey}
                </h3>
                <Pill label={sourceData?.error ? 'Error' : 'OK'} tone={sourceData?.error ? 'danger' : 'good'} />
              </div>
              {sourceData?.error && (
                <div className="text-xs mt-2" style={{ color: palette.rose }}>{sourceData.error}</div>
              )}
              {!sourceData?.error && proMode && (
                <pre
                  className="text-xs overflow-auto max-h-64 rounded-md p-3 mt-3"
                  style={{ background: palette.void, color: palette.textSecondary, fontFamily: typography.mono }}
                >
                  {JSON.stringify(sourceData, null, 2)}
                </pre>
              )}
            </ResultCard>
          );
        })}
      </div>
    </div>
  );
}

function RawJsonSection({ data }: any) {
  const [copied, setCopied] = useState(false);

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<FileJson className="w-4 h-4" />}
        title="Raw JSON data"
        actions={
          <button
            onClick={copyJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:brightness-125"
            style={{
              background: palette.float,
              border: `1px solid ${palette.borderDefault}`,
              color: palette.textSecondary,
              fontFamily: typography.ui,
            }}
          >
            {copied ? <Check className="w-3.5 h-3.5" style={{ color: palette.green }} /> : <Copy className="w-3.5 h-3.5" />}
            Copy JSON
          </button>
        }
      />

      <pre
        className="text-xs overflow-auto max-h-[600px] rounded-lg p-4"
        style={{
          background: palette.void,
          border: `1px solid ${palette.borderDefault}`,
          color: palette.textSecondary,
          fontFamily: typography.mono,
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
