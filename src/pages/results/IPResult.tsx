import { useEffect, useState, useRef } from 'react';
import { 
  Globe, AlertTriangle, Shield, Database, MapPin, Server, Wifi, 
  ExternalLink, ChevronDown, ChevronUp, Copy, Check, Clock, Activity
} from 'lucide-react';
import { lookupIP } from '../../lib/threatIntel';
import type { IPLookupResult } from '../../types';
import ThreatScore from '../../components/ThreatScore';
import ActionsBar from '../../components/scanner/ActionsBar';

interface IPResultProps {
  ip: string;
}

export default function IPResult({ ip }: IPResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    pulses: false,
    spamhaus: true,
    vpn: true,
    sources: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);

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

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
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
  
  // Extract all the hidden gems
  const spamhausData = sources.spamhaus as any;
  const alienVaultData = sources.alienvault as any;
  const proxyCheckData = sources.proxycheck as any;
  const virusTotalData = sources.virustotal as any;
  const teamCymruData = sources.teamcymru as any;

  const summary = `IP: ${ip}\nCountry: ${enrichment.country || 'Unknown'}\nOrg: ${enrichment.org || 'Unknown'}\nThreat Score: ${result.overallThreatScore}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}`;

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-pulse" 
             style={{ backgroundSize: '100% 4px', animation: 'scanline 8s linear infinite' }} />
      </div>

      <div className="relative z-10">
        {/* Actions Bar */}
        <ActionsBar summary={summary} jsonData={result} iocValue={ip} />

        {/* Hero Section */}
        <div className="flex items-start justify-between gap-6 mb-8">
          <div className="flex-1">
            <h1 className="text-5xl font-bold text-white mb-4 font-mono" 
                style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>
              {ip}
            </h1>
            
            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider border ${
                result.overallThreatScore >= 70 ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                result.overallThreatScore >= 40 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>
                {result.isMalicious ? '⚠️ MALICIOUS' : '✓ CLEAN'}
              </span>
              
              {enrichment.isVPN && (
                <span className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  🔒 {enrichment.vpnService || 'VPN'} DETECTED
                </span>
              )}
              
              {enrichment.isProxy && (
                <span className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  🌐 PROXY DETECTED
                </span>
              )}
              
              {enrichment.spamhausListed && (
                <span className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
                  🚫 SPAMHAUS LISTED
                </span>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">COUNTRY</div>
                <div className="text-lg font-bold text-white">{enrichment.country || 'Unknown'}</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">ASN</div>
                <div className="text-lg font-bold text-white">{enrichment.asn || 'Unknown'}</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">TIMEZONE</div>
                <div className="text-lg font-bold text-white">{enrichment.timezone || 'Unknown'}</div>
              </div>
            </div>
          </div>

          {/* Threat Score Circle */}
          <div className="flex-shrink-0">
            <ThreatScore score={result.overallThreatScore} size="lg" />
          </div>
        </div>

        {/* Network Information */}
        <div className="p-6 rounded-xl mb-6"
             style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-400" />
            NETWORK INFORMATION
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">ORGANIZATION</div>
              <div className="text-base font-medium text-white">{enrichment.org || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">ISP</div>
              <div className="text-base font-medium text-white">{enrichment.isp || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">HOSTING/DC</div>
              <div className="text-base font-medium text-white">{enrichment.isHosting ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">CITY</div>
              <div className="text-base font-medium text-white">{enrichment.city || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">REGION</div>
              <div className="text-base font-medium text-white">{enrichment.region || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">COORDINATES</div>
              <div className="text-base font-medium text-white">
                {enrichment.lat && enrichment.lon ? `${enrichment.lat}, ${enrichment.lon}` : 'Unknown'}
              </div>
            </div>
          </div>
        </div>

        {/* VPN/Proxy Details */}
        {(enrichment.isVPN || enrichment.isProxy) && proxyCheckData?.operator && (
          <div className="p-6 rounded-xl mb-6"
               style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
            <button
              onClick={() => toggleSection('vpn')}
              className="w-full flex items-center justify-between mb-4"
            >
              <h2 className="text-xl font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Wifi className="w-5 h-5" />
                VPN/PROXY DETAILS
              </h2>
              {expandedSections.vpn ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5 text-amber-400" />}
            </button>
            
            {expandedSections.vpn && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">PROVIDER</div>
                    <div className="text-base font-medium text-white">{proxyCheckData.operator.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">ANONYMITY LEVEL</div>
                    <div className="text-base font-medium text-white capitalize">{proxyCheckData.operator.anonymity}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">POPULARITY</div>
                    <div className="text-base font-medium text-white capitalize">{proxyCheckData.operator.popularity}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">CONFIDENCE</div>
                    <div className="text-base font-medium text-white">{enrichment.confidence}%</div>
                  </div>
                </div>
                
                {proxyCheckData.operator.url && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">WEBSITE</div>
                    <a href={proxyCheckData.operator.url} target="_blank" rel="noopener noreferrer"
                       className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                      {proxyCheckData.operator.url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                
                {proxyCheckData.operator.protocols && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">PROTOCOLS</div>
                    <div className="flex flex-wrap gap-2">
                      {proxyCheckData.operator.protocols.map((protocol: string, idx: number) => (
                        <span key={idx} className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 border border-slate-700/50">
                          {protocol}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {proxyCheckData.operator.policies && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">POLICIES</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={proxyCheckData.operator.policies.logging ? 'text-red-400' : 'text-emerald-400'}>
                          {proxyCheckData.operator.policies.logging ? '❌' : '✅'}
                        </span>
                        <span className="text-slate-300">Logging</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={proxyCheckData.operator.policies.free_access ? 'text-emerald-400' : 'text-slate-500'}>
                          {proxyCheckData.operator.policies.free_access ? '✅' : '❌'}
                        </span>
                        <span className="text-slate-300">Free Access</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={proxyCheckData.operator.policies.crypto_payments ? 'text-emerald-400' : 'text-slate-500'}>
                          {proxyCheckData.operator.policies.crypto_payments ? '✅' : '❌'}
                        </span>
                        <span className="text-slate-300">Crypto Payments</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Spamhaus Listings */}
        {spamhausData?.listedIn && spamhausData.listedIn.length > 0 && (
          <div className="p-6 rounded-xl mb-6"
               style={{ background: 'rgba(251, 113, 133, 0.1)', border: '1px solid rgba(251, 113, 133, 0.3)' }}>
            <button
              onClick={() => toggleSection('spamhaus')}
              className="w-full flex items-center justify-between mb-4"
            >
              <h2 className="text-xl font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
                SPAMHAUS BLOCKLISTS ({spamhausData.listedIn.length})
              </h2>
              {expandedSections.spamhaus ? <ChevronUp className="w-5 h-5 text-rose-400" /> : <ChevronDown className="w-5 h-5 text-rose-400" />}
            </button>
            
            {expandedSections.spamhaus && (
              <div className="space-y-3">
                {spamhausData.listedIn.map((list: string, idx: number) => {
                  const details = spamhausData.details?.[list.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '') + '.spamhaus.org'];
                  return (
                    <div key={idx} className="p-4 rounded-lg bg-slate-900/50 border border-rose-500/20">
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-bold text-rose-400">{list}</div>
                        <span className="px-2 py-1 rounded text-xs font-bold bg-rose-500/20 text-rose-400">LISTED</span>
                      </div>
                      {details && (
                        <div className="text-sm text-slate-400">{details.description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AlienVault OTX Pulses */}
        {alienVaultData?.pulse_info?.pulses && alienVaultData.pulse_info.pulses.length > 0 && (
          <div className="p-6 rounded-xl mb-6"
               style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            <button
              onClick={() => toggleSection('pulses')}
              className="w-full flex items-center justify-between mb-4"
            >
              <h2 className="text-xl font-bold text-violet-400 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-5 h-5" />
                THREAT INTELLIGENCE PULSES ({alienVaultData.pulse_info.count})
              </h2>
              {expandedSections.pulses ? <ChevronUp className="w-5 h-5 text-violet-400" /> : <ChevronDown className="w-5 h-5 text-violet-400" />}
            </button>
            
            {expandedSections.pulses && (
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
            )}
          </div>
        )}

        {/* Team Cymru BGP Data */}
        {teamCymruData && (
          <div className="p-6 rounded-xl mb-6"
               style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" />
              BGP & ALLOCATION DATA
            </h2>
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
              {teamCymruData.country_code && (
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">COUNTRY CODE</div>
                  <div className="text-base font-medium text-white">{teamCymruData.country_code}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VirusTotal Analysis */}
        {virusTotalData?.data?.attributes?.last_analysis_stats && (
          <div className="p-6 rounded-xl mb-6"
               style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              VIRUSTOTAL ANALYSIS
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <div className="text-2xl font-bold text-rose-400 mb-1">
                  {virusTotalData.data.attributes.last_analysis_stats.malicious || 0}
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Malicious</div>
              </div>
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="text-2xl font-bold text-amber-400 mb-1">
                  {virusTotalData.data.attributes.last_analysis_stats.suspicious || 0}
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Suspicious</div>
              </div>
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-2xl font-bold text-emerald-400 mb-1">
                  {virusTotalData.data.attributes.last_analysis_stats.harmless || 0}
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Clean</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-700/10 border border-slate-700/20">
                <div className="text-2xl font-bold text-slate-400 mb-1">
                  {virusTotalData.data.attributes.last_analysis_stats.undetected || 0}
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Undetected</div>
              </div>
            </div>
          </div>
        )}

        {/* Raw JSON Collapse */}
        <div className="p-6 rounded-xl"
             style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <button
            onClick={() => toggleSection('sources')}
            className="w-full flex items-center justify-between"
          >
            <h2 className="text-xl font-bold text-white uppercase tracking-wider">RAW RESULTS DATA</h2>
            {expandedSections.sources ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </button>
          
          {expandedSections.sources && (
            <div className="mt-4">
              <pre className="p-4 text-xs text-slate-300 overflow-auto max-h-96 font-mono bg-slate-950 rounded-lg border border-slate-800">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
