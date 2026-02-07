import { useEffect, useState, useRef } from 'react';
import {
  Shield, AlertTriangle, Database, FileText, Target, FileJson, Zap,
  Copy, Check, Activity, Code, ExternalLink, Search
} from 'lucide-react';
import { lookupHash } from '../../lib/threatIntel';
import type { HashLookupResult } from '../../types';
import ThreatScore from '../../components/ThreatScore';

interface HashResultProps {
  hash: string;
}

type MenuItem = 'overview' | 'file-info' | 'detections' | 'behavior' | 'sources' | 'raw';

export default function HashResult({ hash }: HashResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HashLookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [proMode, setProMode] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
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
        const data = await lookupHash(hash);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup hash');
      } finally {
        setLoading(false);
      }
    };

    performLookup();
  }, [hash]);

  const copySummary = () => {
    if (!result) return;
    const vtData = result.sources?.virustotal_hash?.details?.data?.attributes;
    const summary = `Hash: ${hash}\nFile Type: ${vtData?.type_description || 'Unknown'}\nThreat Score: ${result.overallThreatScore}\nMalicious: ${result.isMalicious ? 'Yes' : 'No'}\nDetections: ${vtData?.last_analysis_stats?.malicious || 0}/${(vtData?.last_analysis_stats?.malicious || 0) + (vtData?.last_analysis_stats?.undetected || 0)}`;
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
          <p className="text-slate-400 uppercase tracking-wider text-sm">Analyzing file hash...</p>
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
  const vtData = sources.virustotal_hash?.details?.data?.attributes as any;
  const malwareBazaarData = sources.malwarebazaar as any;
  const alienVaultData = sources.alienvault_hash as any;

  const menuItems = [
    { id: 'overview' as MenuItem, label: 'Overview', icon: Target },
    { id: 'file-info' as MenuItem, label: 'File Info', icon: FileText },
    { id: 'detections' as MenuItem, label: 'Detections', icon: AlertTriangle },
    { id: 'behavior' as MenuItem, label: 'Behavior', icon: Activity },
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
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white font-mono mb-2 break-all" 
                  style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>
                {hash}
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
              vtData={vtData}
              malwareBazaarData={malwareBazaarData}
              copySummary={copySummary}
              copyJson={copyJson}
              copiedSummary={copiedSummary}
              copiedJson={copiedJson}
            />
          )}

          {activeMenu === 'file-info' && (
            <FileInfoSection vtData={vtData} proMode={proMode} />
          )}

          {activeMenu === 'detections' && (
            <DetectionsSection vtData={vtData} proMode={proMode} />
          )}

          {activeMenu === 'behavior' && (
            <BehaviorSection vtData={vtData} proMode={proMode} />
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

// Overview Section
function OverviewSection({ result, vtData, malwareBazaarData, copySummary, copyJson, copiedSummary, copiedJson }: any) {
  const threatCategory = vtData?.popular_threat_classification?.suggested_threat_label;
  const topNames = vtData?.popular_threat_classification?.popular_threat_name || [];

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
      </div>

      {/* Key Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* File Type */}
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">FILE TYPE</h3>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Description</div>
              <div className="text-lg font-medium text-white">{vtData?.type_description || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Size</div>
              <div className="text-base font-medium text-white">{vtData?.size ? `${(vtData.size / 1024).toFixed(2)} KB` : 'Unknown'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Extension</div>
              <div className="text-base font-medium text-white">{vtData?.type_extension || 'Unknown'}</div>
            </div>
          </div>
        </div>

        {/* Threat Classification */}
        <div className="p-6 rounded-xl" style={{ 
          background: result.isMalicious ? 'rgba(251, 113, 133, 0.1)' : 'rgba(0, 0, 0, 0.3)', 
          border: result.isMalicious ? '1px solid rgba(251, 113, 133, 0.3)' : '1px solid rgba(148, 163, 184, 0.1)' 
        }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className={`w-5 h-5 ${result.isMalicious ? 'text-rose-400' : 'text-cyan-400'}`} />
            <h3 className={`text-lg font-bold uppercase tracking-wider ${result.isMalicious ? 'text-rose-400' : 'text-white'}`}>
              THREAT TYPE
            </h3>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Category</div>
              <div className={`text-lg font-medium ${result.isMalicious ? 'text-rose-400' : 'text-emerald-400'}`}>
                {threatCategory || (result.isMalicious ? 'Malware' : 'Clean')}
              </div>
            </div>
            {topNames.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Common Names</div>
                <div className="flex flex-wrap gap-2">
                  {topNames.slice(0, 3).map((name: any, idx: number) => (
                    <span key={idx} className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      {name.value} ({name.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detection Stats */}
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">DETECTIONS</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-rose-400 mb-1">
                {vtData?.last_analysis_stats?.malicious || 0}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Malicious</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-400 mb-1">
                {vtData?.last_analysis_stats?.undetected || 0}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Undetected</div>
            </div>
          </div>
        </div>

        {/* Sandbox Results */}
        {vtData?.sandbox_verdicts && Object.keys(vtData.sandbox_verdicts).length > 0 && (
          <div className="p-6 rounded-xl" style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-bold text-amber-400 uppercase tracking-wider">SANDBOX ANALYSIS</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(vtData.sandbox_verdicts).slice(0, 2).map(([sandbox, verdict]: any, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-900/50 border border-amber-500/20">
                  <div className="font-bold text-white text-sm mb-1">{sandbox}</div>
                  <div className="text-xs text-slate-400">
                    {verdict.malware_names?.join(', ') || verdict.category}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* File Names */}
      {vtData?.names && vtData.names.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">📄 KNOWN FILE NAMES</h3>
          <div className="space-y-2">
            {vtData.names.slice(0, 5).map((name: string, idx: number) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 font-mono text-sm text-slate-300">
                {name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// File Info Section
function FileInfoSection({ vtData, proMode }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <FileText className="w-6 h-6 text-cyan-400" />
        FILE INFORMATION
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">MD5</div>
          <div className="text-sm font-medium text-white font-mono break-all">{vtData?.md5 || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">SHA1</div>
          <div className="text-sm font-medium text-white font-mono break-all">{vtData?.sha1 || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">SHA256</div>
          <div className="text-sm font-medium text-white font-mono break-all">{vtData?.sha256 || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">File Size</div>
          <div className="text-lg font-medium text-white">{vtData?.size ? `${(vtData.size / 1024).toFixed(2)} KB` : 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">File Type</div>
          <div className="text-lg font-medium text-white">{vtData?.type_description || 'Unknown'}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Magic</div>
          <div className="text-sm font-medium text-white">{vtData?.magic || 'Unknown'}</div>
        </div>
      </div>

      {proMode && vtData?.tags && vtData.tags.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">🏷️ FILE TAGS</h3>
          <div className="flex flex-wrap gap-2">
            {vtData.tags.map((tag: string, idx: number) => (
              <span key={idx} className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 border border-slate-700/50">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Detections Section
function DetectionsSection({ vtData, proMode }: any) {
  const engines = Object.entries(vtData?.last_analysis_results || {});
  const malicious = engines.filter(([_, result]: any) => result.category === 'malicious');
  const suspicious = engines.filter(([_, result]: any) => result.category === 'suspicious');

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <Shield className="w-6 h-6 text-rose-400" />
        ANTIVIRUS DETECTIONS
      </h2>

      {/* Detection Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
          <div className="text-2xl font-bold text-rose-400 mb-1">
            {vtData?.last_analysis_stats?.malicious || 0}
          </div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Malicious</div>
        </div>
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
          <div className="text-2xl font-bold text-amber-400 mb-1">
            {vtData?.last_analysis_stats?.suspicious || 0}
          </div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Suspicious</div>
        </div>
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
          <div className="text-2xl font-bold text-emerald-400 mb-1">
            {vtData?.last_analysis_stats?.harmless || 0}
          </div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Clean</div>
        </div>
        <div className="p-4 rounded-lg bg-slate-700/10 border border-slate-700/20 text-center">
          <div className="text-2xl font-bold text-slate-400 mb-1">
            {vtData?.last_analysis_stats?.undetected || 0}
          </div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Undetected</div>
        </div>
      </div>

      {/* Malicious Detections */}
      {malicious.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(251, 113, 133, 0.1)', border: '1px solid rgba(251, 113, 133, 0.3)' }}>
          <h3 className="text-lg font-bold text-rose-400 mb-4 uppercase tracking-wider">
            🚫 MALICIOUS DETECTIONS ({malicious.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {malicious.slice(0, proMode ? undefined : 10).map(([engine, result]: any, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-900/50 border border-rose-500/20 flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-bold text-white text-sm">{engine}</div>
                  <div className="text-xs text-rose-400">{result.result}</div>
                </div>
                <span className="px-2 py-1 rounded text-xs font-bold bg-rose-500/20 text-rose-400">DETECTED</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suspicious Detections */}
      {suspicious.length > 0 && proMode && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
          <h3 className="text-lg font-bold text-amber-400 mb-4 uppercase tracking-wider">
            ⚠️ SUSPICIOUS DETECTIONS ({suspicious.length})
          </h3>
          <div className="space-y-2">
            {suspicious.map(([engine, result]: any, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-900/50 border border-amber-500/20 flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-bold text-white text-sm">{engine}</div>
                  <div className="text-xs text-amber-400">{result.result}</div>
                </div>
                <span className="px-2 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-400">SUSPICIOUS</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Behavior Section
function BehaviorSection({ vtData, proMode }: any) {
  const sigmaResults = vtData?.sigma_analysis_results || [];
  const sandboxVerdicts = vtData?.sandbox_verdicts || {};

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <Activity className="w-6 h-6 text-amber-400" />
        BEHAVIORAL ANALYSIS
      </h2>

      {/* Sandbox Verdicts */}
      {Object.keys(sandboxVerdicts).length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
          <h3 className="text-lg font-bold text-amber-400 mb-4 uppercase tracking-wider">
            🔬 SANDBOX RESULTS ({Object.keys(sandboxVerdicts).length})
          </h3>
          <div className="space-y-4">
            {Object.entries(sandboxVerdicts).map(([sandbox, verdict]: any, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-slate-900/50 border border-amber-500/20">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-bold text-white">{sandbox}</div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    verdict.category === 'malicious' 
                      ? 'bg-rose-500/20 text-rose-400' 
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {verdict.category}
                  </span>
                </div>
                {verdict.malware_names && verdict.malware_names.length > 0 && (
                  <div className="text-sm text-slate-400 mb-2">
                    <span className="font-bold">Malware:</span> {verdict.malware_names.join(', ')}
                  </div>
                )}
                {verdict.malware_classification && verdict.malware_classification.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {verdict.malware_classification.map((cls: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        {cls}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sigma Rules */}
      {proMode && sigmaResults.length > 0 && (
        <div className="p-6 rounded-xl" style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
          <h3 className="text-lg font-bold text-violet-400 mb-4 uppercase tracking-wider">
            📊 SIGMA RULE MATCHES ({sigmaResults.length})
          </h3>
          <div className="space-y-3">
            {sigmaResults.map((rule: any, idx: number) => (
              <div key={idx} className="p-4 rounded-lg bg-slate-900/50 border border-violet-500/20">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-bold text-white">{rule.rule_title}</div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    rule.rule_level === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                    rule.rule_level === 'high' ? 'bg-amber-500/20 text-amber-400' :
                    rule.rule_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {rule.rule_level}
                  </span>
                </div>
                {rule.rule_description && (
                  <div className="text-sm text-slate-400">{rule.rule_description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Sources Section
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
          const hasError = sourceData?.error;
          const isFound = sourceData?.found;

          return (
            <div key={sourceKey} className="p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white uppercase">{sourceKey}</h3>
                {hasError ? (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                    ERROR
                  </span>
                ) : isFound ? (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    FOUND
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-700/20 text-slate-400 border border-slate-700/30">
                    NOT FOUND
                  </span>
                )}
              </div>
              {hasError && (
                <div className="text-sm text-red-400">{sourceData.error}</div>
              )}
              {!hasError && proMode && (
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

// Raw JSON Section
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
