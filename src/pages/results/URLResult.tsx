import { useEffect, useState, useRef } from 'react';
import { 
  Globe, AlertTriangle, Shield, Database, Link as LinkIcon, Target, FileJson, Zap, 
  Copy, Check, ExternalLink, Code
} from 'lucide-react';
import { lookupURL } from '../../lib/threatIntel';
import type { URLLookupResult } from '../../types';
import ThreatScore from '../../components/ThreatScore';

interface URLResultProps {
  url: string;
}

type MenuItem = 'overview' | 'analysis' | 'threats' | 'sources' | 'raw';

export default function URLResult({ url }: URLResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<URLLookupResult | null>(null);
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
        const data = await lookupURL(url);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup URL');
      } finally {
        setLoading(false);
      }
    };
    performLookup();
  }, [url]);

  const copySummary = () => {
    if (!result) return;
    const vtData = result.results?.virustotal?.details?.data?.attributes;
    const summary = `URL: ${url}\nTitle: ${vtData?.title || 'Unknown'}\nHTTP Status: ${vtData?.last_http_response_code || 'Unknown'}\nThreat Score: ${result.overallThreatScore}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}`;
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
          <p className="text-slate-400 uppercase tracking-wider text-sm">Analyzing URL...</p>
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

  const results = result.results || {};
  const vtData = results.virustotal?.details?.data?.attributes as any;
  const urlscanData = results.urlscan as any;

  const menuItems = [
    { id: 'overview' as MenuItem, label: 'Overview', icon: Target },
    { id: 'analysis' as MenuItem, label: 'Analysis', icon: Code },
    { id: 'threats' as MenuItem, label: 'Threats', icon: AlertTriangle },
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
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-white font-mono mb-2 break-all" 
                  style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>{url}</h1>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                  result.isMalicious ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}>
                  {result.isMalicious ? '⚠️ MALICIOUS' : '✓ CLEAN'}
                </span>
                <span className="text-slate-500 text-sm">•</span>
                <span className="text-slate-400 text-sm">Score: {result.overallThreatScore}</span>
              </div>
            </div>
            <button onClick={() => setProMode(!proMode)}
              className={`ml-4 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border ${
                proMode ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
              }`}>
              <Zap className="w-4 h-4 inline mr-2" />
              {proMode ? 'PRO MODE' : 'SIMPLE MODE'}
            </button>
          </div>

          {activeMenu === 'overview' && <OverviewSection result={result} vtData={vtData} urlscanData={urlscanData} copySummary={copySummary} copyJson={copyJson} copiedSummary={copiedSummary} copiedJson={copiedJson} />}
          {activeMenu === 'analysis' && <AnalysisSection vtData={vtData} urlscanData={urlscanData} proMode={proMode} />}
          {activeMenu === 'threats' && <ThreatsSection vtData={vtData} proMode={proMode} />}
          {activeMenu === 'sources' && <SourcesSection results={results} proMode={proMode} />}
          {activeMenu === 'raw' && <RawJsonSection data={result} />}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ result, vtData, urlscanData, copySummary, copyJson, copiedSummary, copiedJson }: any) {
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
          <div className="flex items-center gap-2 mb-4"><Globe className="w-5 h-5 text-cyan-400" /><h3 className="text-lg font-bold text-white uppercase tracking-wider">PAGE INFO</h3></div>
          <div className="space-y-2">
            <div><div className="text-xs text-slate-500 uppercase tracking-wider">Title</div><div className="text-lg font-medium text-white">{vtData?.title || 'Unknown'}</div></div>
            <div><div className="text-xs text-slate-500 uppercase tracking-wider">HTTP Status</div><div className={`text-base font-medium ${vtData?.last_http_response_code === 200 ? 'text-emerald-400' : 'text-amber-400'}`}>{vtData?.last_http_response_code || 'Unknown'}</div></div>
            <div><div className="text-xs text-slate-500 uppercase tracking-wider">Final URL</div><div className="text-sm font-medium text-slate-300 break-all">{vtData?.last_final_url || 'Unknown'}</div></div>
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
      </div>
      {urlscanData?.submitted && (
        <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
          <ExternalLink className="w-6 h-6 text-cyan-400 flex-shrink-0" />
          <div className="flex-1"><div className="font-bold text-cyan-400">URLScan.io Analysis Available</div><div className="text-sm text-slate-400">Scan submitted successfully</div></div>
          {urlscanData.resultUrl && (
            <a href={urlscanData.resultUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-sm font-bold uppercase tracking-wider transition-all text-cyan-400 border border-cyan-500/30">VIEW SCAN</a>
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisSection({ vtData, urlscanData, proMode }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2"><Code className="w-6 h-6 text-cyan-400" />URL ANALYSIS</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Final URL</div><div className="text-sm font-medium text-white break-all">{vtData?.last_final_url || 'Unknown'}</div></div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">HTTP Response Code</div><div className={`text-lg font-medium ${vtData?.last_http_response_code === 200 ? 'text-emerald-400' : 'text-amber-400'}`}>{vtData?.last_http_response_code || 'Unknown'}</div></div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Page Title</div><div className="text-base font-medium text-white">{vtData?.title || 'Unknown'}</div></div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Content Length</div><div className="text-base font-medium text-white">{vtData?.last_http_response_content_length ? `${vtData.last_http_response_content_length} bytes` : 'Unknown'}</div></div>
      </div>
      {proMode && vtData?.last_http_response_headers && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">HTTP RESPONSE HEADERS</h3>
          <div className="space-y-2">
            {Object.entries(vtData.last_http_response_headers).slice(0, 10).map(([key, value]: any, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"><div className="text-xs text-cyan-400 font-mono mb-1">{key}</div><div className="text-sm text-slate-300 font-mono break-all">{value}</div></div>
            ))}
          </div>
        </div>
      )}
      {vtData?.html_meta && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">📄 META TAGS</h3>
          <div className="space-y-3">
            {vtData.html_meta.description && (
              <div><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Description</div><div className="text-sm text-slate-300">{vtData.html_meta.description[0]}</div></div>
            )}
            {vtData.html_meta.viewport && (
              <div><div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Viewport</div><div className="text-sm text-slate-300 font-mono">{vtData.html_meta.viewport[0]}</div></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreatsSection({ vtData, proMode }: any) {
  const engines = Object.entries(vtData?.last_analysis_results || {});
  const malicious = engines.filter(([_, result]: any) => result.category === 'malicious');
  const suspicious = engines.filter(([_, result]: any) => result.category === 'suspicious');
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2"><AlertTriangle className="w-6 h-6 text-rose-400" />THREAT INTELLIGENCE</h2>
      {vtData?.last_analysis_stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center"><div className="text-2xl font-bold text-rose-400 mb-1">{vtData.last_analysis_stats.malicious || 0}</div><div className="text-xs text-slate-400 uppercase tracking-wider">Malicious</div></div>
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center"><div className="text-2xl font-bold text-amber-400 mb-1">{vtData.last_analysis_stats.suspicious || 0}</div><div className="text-xs text-slate-400 uppercase tracking-wider">Suspicious</div></div>
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center"><div className="text-2xl font-bold text-emerald-400 mb-1">{vtData.last_analysis_stats.harmless || 0}</div><div className="text-xs text-slate-400 uppercase tracking-wider">Clean</div></div>
          <div className="p-4 rounded-lg bg-slate-700/10 border border-slate-700/20 text-center"><div className="text-2xl font-bold text-slate-400 mb-1">{vtData.last_analysis_stats.undetected || 0}</div><div className="text-xs text-slate-400 uppercase tracking-wider">Undetected</div></div>
        </div>
      )}
      {malicious.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(251, 113, 133, 0.1)', border: '1px solid rgba(251, 113, 133, 0.3)' }}>
          <h3 className="text-lg font-bold text-rose-400 mb-4 uppercase tracking-wider">🚫 MALICIOUS DETECTIONS ({malicious.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {malicious.slice(0, proMode ? undefined : 10).map(([engine, result]: any, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-900/50 border border-rose-500/20 flex items-center justify-between"><div className="flex-1"><div className="font-bold text-white text-sm">{engine}</div><div className="text-xs text-rose-400">{result.result}</div></div><span className="px-2 py-1 rounded text-xs font-bold bg-rose-500/20 text-rose-400">DETECTED</span></div>
            ))}
          </div>
        </div>
      )}
      {proMode && suspicious.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
          <h3 className="text-lg font-bold text-amber-400 mb-4 uppercase tracking-wider">⚠️ SUSPICIOUS DETECTIONS ({suspicious.length})</h3>
          <div className="space-y-2">
            {suspicious.map(([engine, result]: any, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-900/50 border border-amber-500/20 flex items-center justify-between"><div className="flex-1"><div className="font-bold text-white text-sm">{engine}</div><div className="text-xs text-amber-400">{result.result}</div></div><span className="px-2 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-400">SUSPICIOUS</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SourcesSection({ results, proMode }: any) {
  const sourceKeys = Object.keys(results);
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2"><Database className="w-6 h-6 text-cyan-400" />INDIVIDUAL SOURCES</h2>
      <div className="grid grid-cols-1 gap-4">{sourceKeys.slice(0, proMode ? undefined : 5).map((sourceKey) => {
        const sourceData = results[sourceKey];
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
