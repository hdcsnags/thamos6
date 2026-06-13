import { useEffect, useState, useRef } from 'react';
import {
  Globe, AlertTriangle, Shield, Database, Calendar, Server, Target, FileJson, Zap,
  Copy, Check, Lock, Search, GitBranch
} from 'lucide-react';
import { lookupDomain } from '../../lib/threatIntel';
import type { DomainLookupResult } from '../../types';
import ThreatScore from '../../components/ThreatScore';
import { RelatedIOCs } from '../../components/RelatedIOCs';
import VerdictPanel from '../../components/scanner/VerdictPanel';

interface DomainResultProps {
  domain: string;
}

type MenuItem = 'overview' | 'whois' | 'dns' | 'security' | 'pivot' | 'sources' | 'raw';

export default function DomainResult({ domain }: DomainResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DomainLookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [proMode, setProMode] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const mainContainer = containerRef.current.closest('[style*="overflow"]');
      if (mainContainer) mainContainer.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const performLookup = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await lookupDomain(domain);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup domain');
      } finally {
        setLoading(false);
      }
    };
    performLookup();
  }, [domain]);

  const copySummary = () => {
    if (!result) return;
    const whois = result.whois;
    const summary = `Domain: ${domain}\nRegistrar: ${whois?.registrar || 'Unknown'}\nAge: ${whois?.domainAge ? `${Math.floor(whois.domainAge / 365)} years` : 'Unknown'}\nThreat Score: ${result.overallThreatScore}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}`;
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
          <p className="text-slate-400 uppercase tracking-wider text-sm">Analyzing domain...</p>
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

  const sources = result.sources || {};
  const whoisData = result.whois;
  const vtData = sources.virustotal?.details?.data?.attributes as any;

  const menuItems = [
    { id: 'overview' as MenuItem, label: 'Overview', icon: Target },
    { id: 'whois' as MenuItem, label: 'WHOIS', icon: Globe },
    { id: 'dns' as MenuItem, label: 'DNS Records', icon: Server },
    { id: 'security' as MenuItem, label: 'Security', icon: Shield },
    { id: 'pivot' as MenuItem, label: 'Pivot Graph', icon: GitBranch },
    { id: 'sources' as MenuItem, label: 'Sources', icon: Database },
    { id: 'raw' as MenuItem, label: 'Raw JSON', icon: FileJson },
  ];

  return (
    <div ref={containerRef} className="flex h-full">
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-pulse" 
             style={{ backgroundSize: '100% 4px', animation: 'scanline 8s linear infinite' }} />
      </div>

      <div className="w-64 flex-shrink-0 relative z-10" 
           style={{ background: 'rgba(0, 0, 0, 0.5)', borderRight: '1px solid rgba(148, 163, 184, 0.1)' }}>
        <div className="p-6">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">ANALYSIS SECTIONS</h2>
          <div className="space-y-1">
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <button key={item.id} onClick={() => setActiveMenu(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                    isActive ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}>
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-5xl font-bold text-white font-mono mb-2" 
                  style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>{domain}</h1>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                  result.isMalicious ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}>
                  {result.isMalicious ? 'MALICIOUS' : 'CLEAN'}
                </span>
                <span className="text-slate-500 text-sm">•</span>
                <span className="text-slate-400 text-sm">Score: {result.overallThreatScore}</span>
              </div>
            </div>
            <button onClick={() => setProMode(!proMode)}
              className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border ${
                proMode ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
              }`}>
              <Zap className="w-4 h-4 inline mr-2" />
              {proMode ? 'PRO MODE' : 'SIMPLE MODE'}
            </button>
          </div>

          {activeMenu === 'overview' && (
            <div className="space-y-6">
              <OverviewSection result={result} whoisData={whoisData} vtData={vtData} copySummary={copySummary} copyJson={copyJson} copiedSummary={copiedSummary} copiedJson={copiedJson} />
              <VerdictPanel lookupType="domain" value={domain} scoring={result.scoring} />
            </div>
          )}
          {activeMenu === 'whois' && <WhoisSection whoisData={whoisData} proMode={proMode} />}
          {activeMenu === 'dns' && <DNSSection vtData={vtData} proMode={proMode} />}
          {activeMenu === 'security' && <SecuritySection vtData={vtData} whoisData={whoisData} proMode={proMode} />}
          {activeMenu === 'pivot' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <GitBranch className="w-6 h-6 text-cyan-400" />
                IOC PIVOT GRAPH
              </h2>
              <RelatedIOCs iocType="domain" iocValue={domain} />
            </div>
          )}
          {activeMenu === 'sources' && <SourcesSection sources={sources} proMode={proMode} />}
          {activeMenu === 'raw' && <RawJsonSection data={result} />}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ result, whoisData, vtData, copySummary, copyJson, copiedSummary, copiedJson }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center py-6"><ThreatScore score={result.overallThreatScore} size="lg" /></div>
      <div className="flex items-center justify-center gap-3">
        <button onClick={copySummary} className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-slate-700/50 text-slate-300 flex items-center gap-2">
          {copiedSummary ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />} COPY SUMMARY
        </button>
        <button onClick={copyJson} className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-slate-700/50 text-slate-300 flex items-center gap-2">
          {copiedJson ? <Check className="w-4 h-4 text-green-400" /> : <FileJson className="w-4 h-4" />} COPY JSON
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-2 mb-4"><Globe className="w-5 h-5 text-cyan-400" /><h3 className="text-lg font-bold text-white uppercase tracking-wider">REGISTRAR</h3></div>
          <div className="space-y-2">
            <div><div className="text-xs text-slate-500 uppercase tracking-wider">Name</div><div className="text-lg font-medium text-white">{whoisData?.registrar || 'Unknown'}</div></div>
            <div><div className="text-xs text-slate-500 uppercase tracking-wider">Status</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {whoisData?.status?.slice(0, 2).map((status: string, idx: number) => (
                  <span key={idx} className="px-2 py-0.5 rounded text-xs bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">{status}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-2 mb-4"><Calendar className="w-5 h-5 text-cyan-400" /><h3 className="text-lg font-bold text-white uppercase tracking-wider">DOMAIN AGE</h3></div>
          <div className="space-y-2">
            <div><div className="text-xs text-slate-500 uppercase tracking-wider">Age</div><div className="text-2xl font-bold text-white">{whoisData?.domainAge ? `${Math.floor(whoisData.domainAge / 365)} years` : 'Unknown'}</div></div>
            <div><div className="text-xs text-slate-500 uppercase tracking-wider">Registered</div><div className="text-sm font-medium text-slate-300">{whoisData?.registrationDate ? new Date(whoisData.registrationDate).toLocaleDateString() : 'Unknown'}</div></div>
          </div>
        </div>
        {vtData?.last_analysis_stats && (
          <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div className="flex items-center gap-2 mb-4"><Shield className="w-5 h-5 text-cyan-400" /><h3 className="text-lg font-bold text-white uppercase tracking-wider">VIRUSTOTAL</h3></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center"><div className="text-2xl font-bold text-rose-400 mb-1">{vtData.last_analysis_stats.malicious || 0}</div><div className="text-xs text-slate-500 uppercase tracking-wider">Malicious</div></div>
              <div className="text-center"><div className="text-2xl font-bold text-emerald-400 mb-1">{vtData.last_analysis_stats.harmless || 0}</div><div className="text-xs text-slate-500 uppercase tracking-wider">Clean</div></div>
            </div>
          </div>
        )}
        {vtData?.last_https_certificate && (
          <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div className="flex items-center gap-2 mb-4"><Lock className="w-5 h-5 text-emerald-400" /><h3 className="text-lg font-bold text-white uppercase tracking-wider">SSL CERT</h3></div>
            <div className="space-y-2">
              <div><div className="text-xs text-slate-500 uppercase tracking-wider">Issuer</div><div className="text-base font-medium text-white">{vtData.last_https_certificate.issuer?.CN || 'Unknown'}</div></div>
              <div><div className="text-xs text-slate-500 uppercase tracking-wider">Valid Until</div><div className="text-sm font-medium text-slate-300">{vtData.last_https_certificate.validity?.not_after || 'Unknown'}</div></div>
            </div>
          </div>
        )}
      </div>
      {whoisData?.nameservers && whoisData.nameservers.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">NAMESERVERS</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {whoisData.nameservers.map((ns: string, idx: number) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"><span className="text-sm font-medium text-cyan-400 font-mono">{ns}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WhoisSection({ whoisData, proMode }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2"><Globe className="w-6 h-6 text-cyan-400" />WHOIS INFORMATION</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Domain</div><div className="text-lg font-medium text-white">{whoisData?.domain || 'Unknown'}</div></div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Registrar</div><div className="text-lg font-medium text-white">{whoisData?.registrar || 'Unknown'}</div></div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Registration Date</div><div className="text-base font-medium text-white">{whoisData?.registrationDate ? new Date(whoisData.registrationDate).toLocaleDateString() : 'Unknown'}</div></div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Expiration Date</div><div className="text-base font-medium text-white">{whoisData?.expirationDate ? new Date(whoisData.expirationDate).toLocaleDateString() : 'Unknown'}</div></div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Domain Age</div><div className="text-lg font-medium text-white">{whoisData?.domainAge ? `${whoisData.domainAge} days (${Math.floor(whoisData.domainAge / 365)} years)` : 'Unknown'}</div></div>
      </div>
      {proMode && whoisData?.status && whoisData.status.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">STATUS FLAGS</h3>
          <div className="flex flex-wrap gap-2">{whoisData.status.map((status: string, idx: number) => (<span key={idx} className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 border border-slate-700/50">{status}</span>))}</div>
        </div>
      )}
    </div>
  );
}

function DNSSection({ vtData, proMode }: any) {
  const dnsRecords = vtData?.last_dns_records || [];
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2"><Server className="w-6 h-6 text-cyan-400" />DNS RECORDS</h2>
      {dnsRecords.length > 0 ? <div className="space-y-4">{['A', 'AAAA', 'MX', 'NS', 'TXT'].map((recordType: string) => {
        const records = dnsRecords.filter((r: any) => r.type === recordType);
        if (records.length === 0) return null;
        return (
          <div key={recordType} className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2"><span className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 text-xs">{recordType}</span> RECORDS ({records.length})</h3>
            <div className="space-y-2">{records.slice(0, proMode ? undefined : 3).map((record: any, idx: number) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 font-mono text-sm text-slate-300">{record.value}{record.priority && ` (Priority: ${record.priority})`}</div>
            ))}</div>
          </div>
        );
      })}</div> : <div className="text-center py-12"><Server className="w-16 h-16 text-slate-600 mx-auto mb-4" /><p className="text-slate-400">No DNS records available</p></div>}
    </div>
  );
}

function SecuritySection({ vtData, whoisData, proMode }: any) {
  const analysisStats = vtData?.last_analysis_stats;
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2"><Shield className="w-6 h-6 text-cyan-400" />SECURITY ANALYSIS</h2>
      {analysisStats && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">VIRUSTOTAL SCAN</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center"><div className="text-2xl font-bold text-rose-400 mb-1">{analysisStats.malicious || 0}</div><div className="text-xs text-slate-400 uppercase tracking-wider">Malicious</div></div>
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center"><div className="text-2xl font-bold text-amber-400 mb-1">{analysisStats.suspicious || 0}</div><div className="text-xs text-slate-400 uppercase tracking-wider">Suspicious</div></div>
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center"><div className="text-2xl font-bold text-emerald-400 mb-1">{analysisStats.harmless || 0}</div><div className="text-xs text-slate-400 uppercase tracking-wider">Clean</div></div>
            <div className="p-4 rounded-lg bg-slate-700/10 border border-slate-700/20 text-center"><div className="text-2xl font-bold text-slate-400 mb-1">{analysisStats.undetected || 0}</div><div className="text-xs text-slate-400 uppercase tracking-wider">Undetected</div></div>
          </div>
        </div>
      )}
      {vtData?.last_https_certificate && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <h3 className="text-lg font-bold text-emerald-400 mb-4 uppercase tracking-wider flex items-center gap-2"><Lock className="w-5 h-5" />SSL/TLS CERTIFICATE</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Subject</div><div className="text-base font-medium text-white">{vtData.last_https_certificate.subject?.CN || 'Unknown'}</div></div>
            <div><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Issuer</div><div className="text-base font-medium text-white">{vtData.last_https_certificate.issuer?.CN || 'Unknown'}</div></div>
            <div><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Valid From</div><div className="text-base font-medium text-white">{vtData.last_https_certificate.validity?.not_before || 'Unknown'}</div></div>
            <div><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Valid Until</div><div className="text-base font-medium text-white">{vtData.last_https_certificate.validity?.not_after || 'Unknown'}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourcesSection({ sources, proMode }: any) {
  const sourceKeys = Object.keys(sources);
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2"><Database className="w-6 h-6 text-cyan-400" />INDIVIDUAL SOURCES</h2>
      <div className="grid grid-cols-1 gap-4">{sourceKeys.slice(0, proMode ? undefined : 5).map((sourceKey) => {
        const sourceData = sources[sourceKey];
        const hasError = sourceData?.error;
        const isFound = sourceData?.found;
        return (
          <div key={sourceKey} className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white uppercase">{sourceKey}</h3>
              {hasError ? <span className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">ERROR</span> : 
              isFound !== undefined ? <span className={`px-3 py-1 rounded-lg text-xs font-bold ${isFound ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700/20 text-slate-400 border border-slate-700/30'}`}>{isFound ? 'FOUND' : 'NOT FOUND'}</span> : 
              <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">SUCCESS</span>}
            </div>
            {hasError && <div className="text-sm text-red-400">{sourceData.error}</div>}
            {!hasError && proMode && <pre className="text-xs text-slate-300 overflow-auto max-h-64 font-mono bg-slate-950 rounded p-3">{JSON.stringify(sourceData, null, 2)}</pre>}
          </div>
        );
      })}</div>
    </div>
  );
}

function RawJsonSection({ data }: any) {
  const [copied, setCopied] = useState(false);
  const copyJson = () => { navigator.clipboard.writeText(JSON.stringify(data, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2"><FileJson className="w-6 h-6 text-cyan-400" />RAW JSON DATA</h2>
        <button onClick={copyJson} className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-slate-700/50 text-slate-300 flex items-center gap-2">{copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />} COPY JSON</button>
      </div>
      <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><pre className="text-xs text-slate-300 overflow-auto max-h-[600px] font-mono">{JSON.stringify(data, null, 2)}</pre></div>
    </div>
  );
}
