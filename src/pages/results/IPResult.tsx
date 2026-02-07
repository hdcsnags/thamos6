import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Globe, AlertTriangle, Shield, Database, MapPin, Server, Wifi, 
  ExternalLink, Copy, Check, Activity, Target, Layers, FileJson, Zap, Search
} from 'lucide-react';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult } from '../../types';
import ThreatScore from '../../components/ThreatScore';

interface IPResultProps {
  ip: string;
}

type MenuItem = 'overview' | 'network' | 'threats' | 'vpn' | 'location' | 'sources' | 'raw';

export default function IPResult({ ip }: IPResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [proMode, setProMode] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Scroll to top when component mounts
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

  const copySummary = () => {
    if (!result) return;
    const enrichment = result.enrichment || {};
    const summary = `IP: ${ip}\nCountry: ${enrichment.country || 'Unknown'}\nOrg: ${enrichment.org || 'Unknown'}\nThreat Score: ${result.overallThreatScore}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}`;
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  if (loading && !result) {
    return (
      <div ref={containerRef} className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 uppercase tracking-wider text-sm">Analyzing IP address...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className="flex items-center justify-center py-12">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 text-center">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const enrichment = result.enrichment || {};
  const sources = result.sources || {};
  
  // Extract data
  const spamhausData = sources.spamhaus as any;
  const alienVaultData = sources.alienvault as any;
  const proxyCheckData = sources.proxycheck as any;
  const virusTotalData = sources.virustotal as any;
  const abuseIPDBData = sources.abuseipdb as any;
  const teamCymruData = sources.teamcymru as any;
  const rdapData = sources.rdap as any;

  const menuItems = [
    { id: 'overview' as MenuItem, label: 'Overview', icon: Target },
    { id: 'network' as MenuItem, label: 'Network', icon: Server },
    { id: 'threats' as MenuItem, label: 'Threats', icon: AlertTriangle },
    { id: 'vpn' as MenuItem, label: 'VPN/Proxy', icon: Wifi },
    { id: 'location' as MenuItem, label: 'Location', icon: MapPin },
    { id: 'sources' as MenuItem, label: 'Sources', icon: Database },
    { id: 'raw' as MenuItem, label: 'Raw JSON', icon: FileJson },
  ];

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-pulse" 
             style={{ backgroundSize: '100% 4px', animation: 'scanline 8s linear infinite' }} />
      </div>

      {/* Side Menu */}
      <div className="w-64 flex-shrink-0 relative z-10" 
           style={{ background: 'rgba(0, 0, 0, 0.5)', borderRight: '1px solid rgba(148, 163, 184, 0.1)' }}>
        <div className="p-6">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">ANALYSIS SECTIONS</h2>
          <div className="space-y-1">
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMenu(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                    isActive 
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="p-8">
          {/* Header with Pro Toggle */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-5xl font-bold text-white font-mono mb-2" 
                  style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>
                {ip}
              </h1>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                  result.isMalicious 
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' 
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}>
                  {result.isMalicious ? '⚠️ MALICIOUS' : '✓ CLEAN'}
                </span>
                <span className="text-slate-500 text-sm">•</span>
                <span className="text-slate-400 text-sm">Score: {result.overallThreatScore}</span>
              </div>
            </div>
            
            <button
              onClick={() => setProMode(!proMode)}
              className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border ${
                proMode
                  ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
              }`}
            >
              <Zap className="w-4 h-4 inline mr-2" />
              {proMode ? 'PRO MODE' : 'SIMPLE MODE'}
            </button>
          </div>

          {/* Content Sections */}
          {activeMenu === 'overview' && (
            <OverviewSection 
              result={result}
              enrichment={enrichment}
              spamhausData={spamhausData}
              abuseIPDBData={abuseIPDBData}
              virusTotalData={virusTotalData}
              copySummary={copySummary}
              copyJson={copyJson}
              copiedSummary={copiedSummary}
              copiedJson={copiedJson}
            />
          )}

          {activeMenu === 'network' && (
            <NetworkSection enrichment={enrichment} teamCymruData={teamCymruData} rdapData={rdapData} proMode={proMode} />
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

          {activeMenu === 'sources' && (
            <SourcesSection sources={sources} proMode={proMode} />
          )}

          {activeMenu === 'raw' && (
            <RawJsonSection data={result} />
          )}
        </div>
      </div>
    </div>
  );
}

// Overview Section Component
function OverviewSection({ result, enrichment, spamhausData, abuseIPDBData, virusTotalData, copySummary, copyJson, copiedSummary, copiedJson }: any) {
  const navigate = useNavigate();
  
  return (
    <div className="space-y-6">
      {/* Threat Score */}
      <div className="flex items-center justify-center py-6">
        <ThreatScore score={result.overallThreatScore} size="lg" />
      </div>

      {/* Quick Actions */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={copySummary}
          className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-slate-700/50 text-slate-300 flex items-center gap-2"
        >
          {copiedSummary ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          COPY SUMMARY
        </button>
        <button
          onClick={copyJson}
          className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-slate-700/50 text-slate-300 flex items-center gap-2"
        >
          {copiedJson ? <Check className="w-4 h-4 text-green-400" /> : <FileJson className="w-4 h-4" />}
          COPY JSON
        </button>
        <button
          onClick={() => navigate('/scanner')}
          className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-cyan-500/30 text-cyan-400 flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          NEW SCAN
        </button>
      </div>

      {/* Key Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Location */}
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">LOCATION</h3>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Country</div>
              <div className="text-lg font-medium text-white">{enrichment.country || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">City</div>
              <div className="text-base font-medium text-white">{enrichment.city || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Region</div>
              <div className="text-base font-medium text-white">{enrichment.region || 'Unknown'}</div>
            </div>
          </div>
        </div>

        {/* VPN/Proxy */}
        <div className="p-6 rounded-xl" style={{ 
          background: enrichment.isVPN || enrichment.isProxy ? 'rgba(251, 191, 36, 0.05)' : 'rgba(0, 0, 0, 0.3)', 
          border: enrichment.isVPN || enrichment.isProxy ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(148, 163, 184, 0.1)' 
        }}>
          <div className="flex items-center gap-2 mb-4">
            <Wifi className={`w-5 h-5 ${enrichment.isVPN || enrichment.isProxy ? 'text-amber-400' : 'text-cyan-400'}`} />
            <h3 className={`text-lg font-bold uppercase tracking-wider ${enrichment.isVPN || enrichment.isProxy ? 'text-amber-400' : 'text-white'}`}>
              VPN/PROXY
            </h3>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Status</div>
              <div className={`text-lg font-medium ${enrichment.isVPN || enrichment.isProxy ? 'text-amber-400' : 'text-emerald-400'}`}>
                {enrichment.isVPN ? '🔒 VPN Detected' : enrichment.isProxy ? '🌐 Proxy Detected' : '✓ Clean'}
              </div>
            </div>
            {enrichment.vpnService && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Provider</div>
                <div className="text-base font-medium text-white">{enrichment.vpnService}</div>
              </div>
            )}
            {enrichment.confidence && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Confidence</div>
                <div className="text-base font-medium text-white">{enrichment.confidence}%</div>
              </div>
            )}
          </div>
        </div>

        {/* Tor */}
        <div className="p-6 rounded-xl" style={{ 
          background: enrichment.isTor ? 'rgba(251, 113, 133, 0.1)' : 'rgba(0, 0, 0, 0.3)', 
          border: enrichment.isTor ? '1px solid rgba(251, 113, 133, 0.3)' : '1px solid rgba(148, 163, 184, 0.1)' 
        }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className={`w-5 h-5 ${enrichment.isTor ? 'text-rose-400' : 'text-cyan-400'}`} />
            <h3 className={`text-lg font-bold uppercase tracking-wider ${enrichment.isTor ? 'text-rose-400' : 'text-white'}`}>
              TOR STATUS
            </h3>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Detection</div>
            <div className={`text-lg font-medium ${enrichment.isTor ? 'text-rose-400' : 'text-emerald-400'}`}>
              {enrichment.isTor ? '🕵️ Tor Exit Node' : '✓ Not Tor'}
            </div>
          </div>
        </div>

        {/* AbuseIPDB */}
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">ABUSEIPDB</h3>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Abuse Confidence</div>
              <div className={`text-2xl font-bold ${
                (abuseIPDBData?.data?.abuseConfidenceScore || 0) > 50 ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                {abuseIPDBData?.data?.abuseConfidenceScore || 0}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Total Reports</div>
              <div className="text-base font-medium text-white">{abuseIPDBData?.data?.totalReports || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* VirusTotal Quick Stats */}
      {virusTotalData?.data?.attributes?.last_analysis_stats && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">VIRUSTOTAL</h3>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-rose-400 mb-1">
                {virusTotalData.data.attributes.last_analysis_stats.malicious || 0}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Malicious</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400 mb-1">
                {virusTotalData.data.attributes.last_analysis_stats.suspicious || 0}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Suspicious</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">
                {virusTotalData.data.attributes.last_analysis_stats.harmless || 0}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Clean</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-400 mb-1">
                {virusTotalData.data.attributes.last_analysis_stats.undetected || 0}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Undetected</div>
            </div>
          </div>
        </div>
      )}

      {/* Spamhaus Warning */}
      {enrichment.spamhausListed && spamhausData?.listedIn && (
        <div className="p-4 rounded-xl flex items-center gap-3 animate-pulse"
             style={{ background: 'rgba(251, 113, 133, 0.1)', border: '1px solid rgba(251, 113, 133, 0.3)' }}>
          <AlertTriangle className="w-6 h-6 text-rose-400 flex-shrink-0" />
          <div>
            <div className="font-bold text-rose-400">⚠️ SPAMHAUS BLOCKLIST DETECTED</div>
            <div className="text-sm text-slate-400">Listed in {spamhausData.listedIn.length} blocklist(s)</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Network Section Component
function NetworkSection({ enrichment, teamCymruData, rdapData, proMode }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <Server className="w-6 h-6 text-cyan-400" />
        NETWORK INFORMATION
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Organization</div>
          <div className="text-lg font-medium text-white">{enrichment.org || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">ISP</div>
          <div className="text-lg font-medium text-white">{enrichment.isp || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">ASN</div>
          <div className="text-lg font-medium text-white font-mono">{enrichment.asn || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Hosting/DC</div>
          <div className={`text-lg font-medium ${enrichment.isHosting ? 'text-amber-400' : 'text-emerald-400'}`}>
            {enrichment.isHosting ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      {proMode && teamCymruData && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">BGP & ALLOCATION DATA</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamCymruData.bgp_prefix && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">BGP PREFIX</div>
                <div className="text-base font-medium text-white font-mono">{teamCymruData.bgp_prefix}</div>
              </div>
            )}
            {teamCymruData.allocated && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">ALLOCATED DATE</div>
                <div className="text-base font-medium text-white">{teamCymruData.allocated}</div>
              </div>
            )}
            {teamCymruData.registry && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">REGISTRY</div>
                <div className="text-base font-medium text-white uppercase">{teamCymruData.registry}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Threats Section Component
function ThreatsSection({ spamhausData, alienVaultData, virusTotalData, proMode }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <AlertTriangle className="w-6 h-6 text-rose-400" />
        THREAT INTELLIGENCE
      </h2>

      {/* Spamhaus */}
      {spamhausData?.listedIn && spamhausData.listedIn.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(251, 113, 133, 0.1)', border: '1px solid rgba(251, 113, 133, 0.3)' }}>
          <h3 className="text-lg font-bold text-rose-400 mb-4 uppercase tracking-wider">
            🚫 SPAMHAUS BLOCKLISTS ({spamhausData.listedIn.length})
          </h3>
          <div className="space-y-3">
            {spamhausData.listedIn.slice(0, proMode ? undefined : 3).map((list: string, idx: number) => (
              <div key={idx} className="p-4 rounded-lg bg-slate-900/50 border border-rose-500/20">
                <div className="flex items-start justify-between">
                  <div className="font-bold text-rose-400">{list}</div>
                  <span className="px-2 py-1 rounded text-xs font-bold bg-rose-500/20 text-rose-400">LISTED</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AlienVault Pulses */}
      {proMode && alienVaultData?.pulse_info?.pulses && alienVaultData.pulse_info.pulses.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
          <h3 className="text-lg font-bold text-violet-400 mb-4 uppercase tracking-wider">
            📡 THREAT PULSES ({alienVaultData.pulse_info.count})
          </h3>
          <div className="space-y-3">
            {alienVaultData.pulse_info.pulses.slice(0, 5).map((pulse: any, idx: number) => (
              <div key={idx} className="p-4 rounded-lg bg-slate-900/50 border border-violet-500/20">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-bold text-white">{pulse.name}</div>
                  <span className="px-2 py-1 rounded text-xs font-bold bg-violet-500/20 text-violet-400">
                    {pulse.modified_text}
                  </span>
                </div>
                {pulse.description && (
                  <div className="text-sm text-slate-400 mb-2">{pulse.description}</div>
                )}
                {pulse.tags && pulse.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {pulse.tags.slice(0, 5).map((tag: string, tagIdx: number) => (
                      <span key={tagIdx} className="px-2 py-0.5 rounded text-xs bg-violet-500/10 text-violet-300 border border-violet-500/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VirusTotal */}
      {virusTotalData?.data?.attributes?.last_analysis_stats && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">🛡️ VIRUSTOTAL ANALYSIS</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
              <div className="text-2xl font-bold text-rose-400 mb-1">
                {virusTotalData.data.attributes.last_analysis_stats.malicious || 0}
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Malicious</div>
            </div>
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
              <div className="text-2xl font-bold text-amber-400 mb-1">
                {virusTotalData.data.attributes.last_analysis_stats.suspicious || 0}
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Suspicious</div>
            </div>
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="text-2xl font-bold text-emerald-400 mb-1">
                {virusTotalData.data.attributes.last_analysis_stats.harmless || 0}
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Clean</div>
            </div>
            <div className="p-4 rounded-lg bg-slate-700/10 border border-slate-700/20 text-center">
              <div className="text-2xl font-bold text-slate-400 mb-1">
                {virusTotalData.data.attributes.last_analysis_stats.undetected || 0}
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Undetected</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// VPN Section Component
function VPNSection({ enrichment, proxyCheckData, proMode }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <Wifi className="w-6 h-6 text-amber-400" />
        VPN/PROXY ANALYSIS
      </h2>

      <div className="p-6 rounded-xl" style={{ 
        background: enrichment.isVPN || enrichment.isProxy ? 'rgba(251, 191, 36, 0.05)' : 'rgba(0, 0, 0, 0.3)', 
        border: enrichment.isVPN || enrichment.isProxy ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(148, 163, 184, 0.1)' 
      }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">VPN Status</div>
            <div className={`text-xl font-bold ${enrichment.isVPN ? 'text-amber-400' : 'text-emerald-400'}`}>
              {enrichment.isVPN ? '🔒 VPN Detected' : '✓ No VPN'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Proxy Status</div>
            <div className={`text-xl font-bold ${enrichment.isProxy ? 'text-amber-400' : 'text-emerald-400'}`}>
              {enrichment.isProxy ? '🌐 Proxy Detected' : '✓ No Proxy'}
            </div>
          </div>
          {enrichment.vpnService && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Provider</div>
              <div className="text-lg font-medium text-white">{enrichment.vpnService}</div>
            </div>
          )}
          {enrichment.confidence && (
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Confidence</div>
              <div className="text-lg font-medium text-white">{enrichment.confidence}%</div>
            </div>
          )}
        </div>

        {proMode && proxyCheckData?.operator && (
          <div className="space-y-4 pt-6 border-t border-slate-700">
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">PROVIDER DETAILS</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Anonymity Level</div>
                <div className="text-base font-medium text-white capitalize">{proxyCheckData.operator.anonymity}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Popularity</div>
                <div className="text-base font-medium text-white capitalize">{proxyCheckData.operator.popularity}</div>
              </div>
            </div>
            
            {proxyCheckData.operator.url && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Website</div>
                <a href={proxyCheckData.operator.url} target="_blank" rel="noopener noreferrer"
                   className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                  {proxyCheckData.operator.url}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            
            {proxyCheckData.operator.protocols && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Protocols</div>
                <div className="flex flex-wrap gap-2">
                  {proxyCheckData.operator.protocols.map((protocol: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 border border-slate-700/50">
                      {protocol}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Location Section Component
function LocationSection({ enrichment, proMode }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <MapPin className="w-6 h-6 text-cyan-400" />
        GEOLOCATION
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Country</div>
          <div className="text-xl font-bold text-white">{enrichment.country || 'Unknown'}</div>
          {enrichment.countryCode && (
            <div className="text-sm text-slate-400 mt-1">{enrichment.countryCode}</div>
          )}
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">City</div>
          <div className="text-xl font-bold text-white">{enrichment.city || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Region</div>
          <div className="text-lg font-medium text-white">{enrichment.region || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Timezone</div>
          <div className="text-lg font-medium text-white">{enrichment.timezone || 'Unknown'}</div>
        </div>
        
        {proMode && (
          <>
            <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Latitude</div>
              <div className="text-base font-medium text-white font-mono">{enrichment.lat || 'Unknown'}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Longitude</div>
              <div className="text-base font-medium text-white font-mono">{enrichment.lon || 'Unknown'}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Sources Section Component
function SourcesSection({ sources, proMode }: any) {
  const sourceKeys = Object.keys(sources);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <Database className="w-6 h-6 text-cyan-400" />
        INDIVIDUAL SOURCES
      </h2>

      <div className="grid grid-cols-1 gap-4">
        {sourceKeys.slice(0, proMode ? undefined : 5).map((sourceKey) => {
          const sourceData = sources[sourceKey];
          return (
            <div key={sourceKey} className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white uppercase">{sourceKey}</h3>
                {sourceData?.error ? (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                    ERROR
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    SUCCESS
                  </span>
                )}
              </div>
              {sourceData?.error && (
                <div className="text-sm text-red-400">{sourceData.error}</div>
              )}
              {!sourceData?.error && proMode && (
                <pre className="text-xs text-slate-300 overflow-auto max-h-64 font-mono bg-slate-950 rounded p-3">
                  {JSON.stringify(sourceData, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Raw JSON Section Component
function RawJsonSection({ data }: any) {
  const [copied, setCopied] = useState(false);

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <FileJson className="w-6 h-6 text-cyan-400" />
          RAW JSON DATA
        </h2>
        <button
          onClick={copyJson}
          className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-slate-700/50 text-slate-300 flex items-center gap-2"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          COPY JSON
        </button>
      </div>

      <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
        <pre className="text-xs text-slate-300 overflow-auto max-h-[600px] font-mono">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}