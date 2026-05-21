import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Search, Clock, FileCode, ChevronDown, ChevronUp, Loader2, ExternalLink, FolderOpen, Archive, Plus, Check, Activity, Database, FileText, Zap, Brain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/themecontext';
import FileExplorer from '../components/extension/FileExplorer';
import FileViewer from '../components/extension/FileViewer';
import VaultList from '../components/extension/VaultList';
import IOCEnrichment from '../components/extension/IOCEnrichment';
import { T6Orb } from '../components/workshop/T6Orb';
import type { T6OrbState } from '../components/workshop/T6Orb';

interface Analysis {
  id: string;
  extension_id: string;
  extension_name: string;
  extension_version: string;
  extension_url: string;
  risk_score: number;
  risk_level: string;
  manifest_data: any;
  analysis_summary: string;
  analyzed_at: string;
  obfuscation_score?: number;
  total_files_scanned?: number;
  behavior_flags?: BehaviorFlag[];
  file_hashes?: Record<string, string>;
  scan_duration_ms?: number;
  files_skipped_count?: number;
  crxcavator_data?: any;
}

interface VerdictResult {
  verdict: 'MALICIOUS' | 'OVERPRIVILEGED' | 'SUSPICIOUS' | 'LIKELY SAFE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string;
  recommendation: string;
  ioc_highlights?: string[];
}

interface SecurityFinding {
  id: string;
  rule_id?: string;
  category: string;
  severity: string;
  confidence?: string;
  title: string;
  description: string;
  evidence: string;
  file_path: string;
}

interface IOC {
  id: string;
  ioc_type: string;
  ioc_value: string;
  source_file: string;
  context: string;
}

interface BehaviorFlag {
  flag_type: string;
  severity: string;
  description: string;
  evidence: string[];
}

interface ExtensionScannerProps {
  initialUrl?: string;
}

export default function ExtensionScanner({ initialUrl }: ExtensionScannerProps) {
  const { theme } = useTheme();
  const [extensionUrl, setExtensionUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAutoScanned, setHasAutoScanned] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<Analysis | null>(null);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [iocs, setIocs] = useState<IOC[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'findings' | 'iocs' | 'behavior' | 'files' | 'vault'>('findings');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState<'none' | 'adding' | 'added'>('none');
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [verdictError, setVerdictError] = useState('');

  useEffect(() => {
    loadRecentAnalyses();
  }, []);

  useEffect(() => {
    if (currentAnalysis) {
      loadAnalysisData(currentAnalysis.id);
      checkVaultStatus(currentAnalysis.extension_id);
      setVerdict(null);
      setVerdictError('');
    }
  }, [currentAnalysis]);

  useEffect(() => {
    if (initialUrl && !hasAutoScanned && !isAnalyzing) {
      setHasAutoScanned(true);
      setExtensionUrl(initialUrl);
      analyzeExtension(initialUrl);
    }
  }, [initialUrl, hasAutoScanned]);

  const loadRecentAnalyses = async () => {
    const { data, error } = await supabase
      .from('extension_analyses')
      .select('*')
      .order('analyzed_at', { ascending: false })
      .limit(10);

    if (data && !error) {
      setRecentAnalyses(data);
    }
  };

  const loadAnalysisData = async (analysisId: string) => {
    const [findingsResult, iocsResult] = await Promise.all([
      supabase
        .from('security_findings')
        .select('*')
        .eq('analysis_id', analysisId)
        .order('severity', { ascending: false }),
      supabase
        .from('extension_iocs')
        .select('*')
        .eq('analysis_id', analysisId)
        .order('ioc_type', { ascending: true })
    ]);

    if (findingsResult.data && !findingsResult.error) {
      setFindings(findingsResult.data);
    }

    if (iocsResult.data && !iocsResult.error) {
      setIocs(iocsResult.data);
    }
  };

  const checkVaultStatus = async (extensionId: string) => {
    const { data } = await supabase
      .from('extension_vault')
      .select('id')
      .eq('extension_id', extensionId)
      .maybeSingle();

    setVaultStatus(data ? 'added' : 'none');
  };

  const addToVault = async () => {
    if (!currentAnalysis) return;
    setVaultStatus('adding');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setVaultStatus('none');
      return;
    }

    const { error } = await supabase
      .from('extension_vault')
      .insert({
        user_id: user.id,
        extension_id: currentAnalysis.extension_id,
        extension_name: currentAnalysis.extension_name,
        baseline_analysis_id: currentAnalysis.id,
        latest_analysis_id: currentAnalysis.id,
        last_scanned_at: new Date().toISOString(),
      });

    if (!error) {
      setVaultStatus('added');
    } else {
      if (error.code === '23505') {
        setVaultStatus('added');
      } else {
        setVaultStatus('none');
      }
    }
  };

  const analyzeExtension = async (urlOrId?: string) => {
    const target = urlOrId || extensionUrl.trim();
    if (!target) {
      setError('Please enter a Chrome Web Store URL');
      return;
    }

    const isDirectId = /^[a-z]{32}$/i.test(target);
    const finalUrl = isDirectId
      ? `https://chromewebstore.google.com/detail/extension/${target}`
      : target;

    setIsAnalyzing(true);
    setError('');
    setCurrentAnalysis(null);
    setFindings([]);
    setIocs([]);
    setVaultStatus('none');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-extension`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extensionUrl: finalUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Analysis failed');
      }

      const { data: analysis } = await supabase
        .from('extension_analyses')
        .select('*')
        .eq('id', result.analysis_id)
        .single();

      if (analysis) {
        setCurrentAnalysis(analysis);
        setActiveTab('findings');
        loadRecentAnalyses();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze extension');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnalyzing) {
      analyzeExtension();
    }
  };

  const toggleFinding = (id: string) => {
    const newExpanded = new Set(expandedFindings);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFindings(newExpanded);
  };

  const viewFileForFinding = (filePath: string) => {
    setSelectedFile(filePath);
    setActiveTab('files');
  };

  const runThamosVerdict = async () => {
    if (!currentAnalysis) return;
    setVerdictLoading(true);
    setVerdictError('');
    setVerdict(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const manifestStr = currentAnalysis.manifest_data
        ? JSON.stringify(currentAnalysis.manifest_data, null, 2)
        : 'Not available';

      const findingsSummary = findings.map(f =>
        `[${f.severity.toUpperCase()}] ${f.title}: ${f.description}\nEvidence: ${f.evidence}\nFile: ${f.file_path}`
      ).join('\n\n') || 'None';

      const behaviorSummary = otherBehaviorFlags.map(f =>
        `${f.flag_type}: ${f.description}\n${f.evidence.join(', ')}`
      ).join('\n\n') || 'None';

      const iocSummary = iocs.slice(0, 20).map(i =>
        `[${i.ioc_type}] ${i.ioc_value} (in ${i.source_file})`
      ).join('\n') || 'None';

      const crx = currentAnalysis.crxcavator_data?.available ? currentAnalysis.crxcavator_data : null;
      const crxStr = crx
        ? `Score: ${crx.overall_score}/100 | Risk: ${crx.risk_level} | Recommended: ${crx.should_use === true ? 'Yes' : crx.should_use === false ? 'No' : 'Unknown'}
Reasoning: ${(crx.reasoning as string[]).join(' | ') || 'None'}
Categories: ${JSON.stringify(crx.categories)}
Browser Impact: ${JSON.stringify(crx.browser_impact) || 'None'}`
        : 'Not available';

      const prompt = `Analyze this Chrome extension and return a JSON verdict.

EXTENSION: ${currentAnalysis.extension_name} v${currentAnalysis.extension_version}
EXTENSION ID: ${currentAnalysis.extension_id}
SCANNER RISK SCORE: ${currentAnalysis.risk_score}/100 (${currentAnalysis.risk_level})
OBFUSCATION SCORE: ${currentAnalysis.obfuscation_score || 0}

CRXPLORER INDEPENDENT ASSESSMENT:
${crxStr}

MANIFEST:
${manifestStr}

SECURITY FINDINGS (${findings.length} total):
${findingsSummary}

BEHAVIORAL FLAGS:
${behaviorSummary}

IOCS DETECTED (${iocs.length} total, showing first 20):
${iocSummary}

Return ONLY valid JSON in this exact format (no markdown, no prose):
{
  "verdict": "MALICIOUS" | "OVERPRIVILEGED" | "SUSPICIOUS" | "LIKELY SAFE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "2-4 sentences explaining your assessment based on specific evidence",
  "recommendation": "1-2 sentences on what action to take",
  "ioc_highlights": ["key IOC 1", "key IOC 2"]
}`;

      const systemPrompt = `You are a senior threat intelligence analyst specializing in browser extension security. Your role is to synthesize the automated scanner findings with the independent CRXplorer assessment to produce a balanced, calibrated verdict. The scanner is intentionally aggressive and will flag many common patterns — your job is to weigh whether those patterns form a coherent threat picture or are consistent with the extension's stated purpose. Consider false positive rates: minified code, analytics SDKs, and broad host permissions are common in legitimate extensions. Elevate the verdict only when multiple independent signals converge. Return only valid JSON, no markdown fences.`;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: prompt }],
          system_prompt: systemPrompt,
          temperature: 0.2,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Verdict analysis failed (${response.status})`);
      }

      const data = await response.json();
      const raw = (data.content || '').trim();
      const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(jsonStr) as VerdictResult;
      setVerdict(parsed);
    } catch (err: any) {
      setVerdictError(err.message || 'Verdict analysis failed');
    } finally {
      setVerdictLoading(false);
    }
  };

  const getVerdictColor = (v: string) => {
    switch (v) {
      case 'MALICIOUS': return 'red';
      case 'OVERPRIVILEGED': return 'orange';
      case 'SUSPICIOUS': return 'amber';
      case 'LIKELY SAFE': return 'green';
      default: return 'slate';
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'yellow';
      case 'low': return 'green';
      default: return 'slate';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'yellow';
      case 'low': return 'blue';
      default: return 'slate';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'permissions': return Shield;
      case 'code_patterns': return FileCode;
      case 'network': return ExternalLink;
      default: return AlertTriangle;
    }
  };

  const findingsByCategory = findings.reduce((acc, finding) => {
    const cat = finding.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(finding);
    return acc;
  }, {} as Record<string, SecurityFinding[]>);

  const behaviorFlags = currentAnalysis?.behavior_flags || [];
  const malExtFlags = behaviorFlags.filter(f => f.flag_type === 'confirmed_removed_from_store');
  const vaultDeltaFlags = behaviorFlags.filter(f => f.flag_type === 'vault_delta_detected');
  const otherBehaviorFlags = behaviorFlags.filter(f => f.flag_type !== 'vault_delta_detected' && f.flag_type !== 'confirmed_removed_from_store');

  const verdictOrbState: T6OrbState = verdictLoading
    ? 'thinking'
    : verdict?.verdict === 'MALICIOUS' ? 'conflict'
    : verdict?.verdict === 'OVERPRIVILEGED' ? 'tense'
    : verdict?.verdict === 'SUSPICIOUS' ? 'tense'
    : verdict?.verdict === 'LIKELY SAFE' ? 'done'
    : verdictError ? 'error'
    : 'idle';

  const menuItems = [
    { id: 'findings', label: 'Findings', icon: Shield, count: findings.length },
    { id: 'iocs', label: 'IOCs', icon: Zap, count: iocs.length },
    { id: 'behavior', label: 'Behavior', icon: Activity, count: otherBehaviorFlags.length },
    { id: 'files', label: 'Files', icon: FolderOpen },
    { id: 'vault', label: 'Vault', icon: Archive },
  ];

  return (
    <div className={`p-8 max-w-7xl mx-auto h-full overflow-y-auto ${theme === 'desktop' ? 'p-0 max-w-none flex flex-col' : ''}`}>
      {theme === 'desktop' && (
        <div className="sticky top-0 z-20 backdrop-blur-md bg-slate-900/40 border-b border-white/5 px-6">
          <div className="flex items-center gap-1">
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const hasCount = item.count !== undefined;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    if (item.id === 'vault') setCurrentAnalysis(null);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                    isActive 
                      ? 'text-cyan-400 border-cyan-500 bg-cyan-500/5' 
                      : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                  {hasCount && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                      isActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={theme === 'desktop' ? 'p-8 flex-1' : ''}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Shield className="w-8 h-8 text-cyan-500" />
              Chrome Extension Scanner
            </h1>
            <p className="text-slate-400">Identify malicious behavior, hidden IOCs, and security risks in extensions</p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
          >
            <Clock className="w-4 h-4" />
            {showHistory ? 'Hide History' : 'Recent Analyses'}
          </button>
        </div>

        {showHistory && (
          <div className="mb-8 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden animate-in slide-in-from-top duration-300">
            <div className="p-4 border-b border-slate-800 bg-slate-800/50">
              <h3 className="font-semibold text-white">Recent Analyses</h3>
            </div>
            <div className="divide-y divide-slate-800">
              {recentAnalyses.length === 0 ? (
                <p className="p-8 text-center text-slate-500">No recent analyses found</p>
              ) : (
                recentAnalyses.map(analysis => (
                  <button
                    key={analysis.id}
                    onClick={() => {
                      setCurrentAnalysis(analysis);
                      setShowHistory(false);
                    }}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors text-left"
                  >
                    <div>
                      <div className="font-medium text-white">{analysis.extension_name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                        <span>{analysis.extension_id}</span>
                        <span>•</span>
                        <span>{new Date(analysis.analyzed_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-bold uppercase bg-${getRiskColor(analysis.risk_level)}-500/10 text-${getRiskColor(analysis.risk_level)}-400 border border-${getRiskColor(analysis.risk_level)}-500/20`}>
                      {analysis.risk_level}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="md:col-span-3">
            <label htmlFor="extension-url" className="block text-sm font-medium text-slate-400 mb-2">
              Extension ID or Chrome Web Store URL
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                id="extension-url"
                type="text"
                value={extensionUrl}
                onChange={(e) => setExtensionUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="https://chromewebstore.google.com/detail/extension-name/abcdefghijklmnopqrstuvwxyz"
                className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all text-white placeholder:text-slate-500"
                disabled={isAnalyzing}
              />
            </div>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-lg">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="pt-7 flex gap-2">
            <button
              onClick={() => analyzeExtension()}
              disabled={isAnalyzing}
              className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <FileCode className="w-5 h-5" />
                  Analyze
                </>
              )}
            </button>
            {theme !== 'desktop' && (
              <button
                onClick={() => { setCurrentAnalysis(null); setActiveTab('vault'); }}
                className={`px-4 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'vault' && !currentAnalysis
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                <Archive className="w-5 h-5" />
                Vault
              </button>
            )}
          </div>
        </div>

        {activeTab === 'vault' && !currentAnalysis && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Archive className="w-5 h-5 text-amber-400" />
              Extension Vault
            </h2>
            <VaultList
              onRescan={(extId) => analyzeExtension(extId)}
              isScanning={isAnalyzing}
            />
          </div>
        )}

        {currentAnalysis && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-white">{currentAnalysis.extension_name}</h2>
                    {vaultStatus === 'none' && (
                      <button
                        onClick={addToVault}
                        className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-medium rounded transition-colors flex items-center gap-1.5 border border-amber-500/30"
                      >
                        <Plus className="w-3 h-3" />
                        Add to Vault
                      </button>
                    )}
                    {vaultStatus === 'adding' && (
                      <span className="px-3 py-1 bg-slate-700 text-slate-400 text-xs rounded flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Adding...
                      </span>
                    )}
                    {vaultStatus === 'added' && (
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded flex items-center gap-1.5 border border-green-500/30">
                        <Check className="w-3 h-3" />
                        In Vault
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400">Version {currentAnalysis.extension_version}</p>
                  {currentAnalysis.scan_duration_ms && (
                    <p className="text-sm text-slate-500 mt-1">
                      Scan completed in {(currentAnalysis.scan_duration_ms / 1000).toFixed(2)}s
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className={`inline-flex px-4 py-2 rounded-lg bg-${getRiskColor(currentAnalysis.risk_level)}-500/20 border border-${getRiskColor(currentAnalysis.risk_level)}-500/30`}>
                    <div className="text-center">
                      <div className={`text-3xl font-bold text-${getRiskColor(currentAnalysis.risk_level)}-400`}>
                        {currentAnalysis.risk_score}
                      </div>
                      <div className={`text-xs font-semibold text-${getRiskColor(currentAnalysis.risk_level)}-400 uppercase`}>
                        {currentAnalysis.risk_level} Risk
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {malExtFlags.length > 0 && (
                <div className="mb-6 border-2 border-red-500/50 bg-red-500/10 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-bold text-red-300 mb-1 uppercase tracking-wide text-sm">
                        Confirmed Removed from Chrome Web Store
                      </h4>
                      {malExtFlags.map((flag, idx) => (
                        <div key={idx}>
                          <p className="text-sm text-red-200/80 mb-2">{flag.description}</p>
                          <div className="flex flex-wrap gap-2">
                            {flag.evidence.map((ev, i) => (
                              <span key={i} className="text-xs font-mono px-2 py-0.5 bg-red-500/20 text-red-300 rounded border border-red-500/20">
                                {ev}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {vaultDeltaFlags.length > 0 && (
                <div className="mb-6 border-2 border-amber-500/30 bg-amber-500/10 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-amber-300 mb-1">Changed Since Last Vault Scan</h4>
                      {vaultDeltaFlags.map((flag, idx) => (
                        <div key={idx}>
                          <p className="text-sm text-amber-200/80 mb-2">{flag.description}</p>
                          <ul className="space-y-1">
                            {flag.evidence.filter(e => !e.startsWith('baseline_analysis_id')).map((ev, i) => (
                              <li key={i} className="text-xs text-amber-300/70 font-mono">{ev}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-white">{findings.length}</div>
                  <div className="text-sm text-slate-400">Findings</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-white">{iocs.length}</div>
                  <div className="text-sm text-slate-400">IOCs</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-white">{otherBehaviorFlags.length}</div>
                  <div className="text-sm text-slate-400">Behavior Flags</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-white">{currentAnalysis.obfuscation_score || 0}</div>
                  <div className="text-sm text-slate-400">Obfuscation</div>
                </div>
              </div>

              {currentAnalysis.crxcavator_data?.available && (
                <div className="mb-6 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-400">CRXplorer Intel</span>
                    </div>
                    {currentAnalysis.crxcavator_data.share_url && (
                      <a
                        href={currentAnalysis.crxcavator_data.share_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-teal-400 transition-colors flex items-center gap-1"
                      >
                        Full Report <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-slate-900/50 rounded-lg px-5 py-3 text-center">
                      <div className="text-3xl font-bold text-white">{currentAnalysis.crxcavator_data.overall_score ?? '—'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Security Score</div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          currentAnalysis.crxcavator_data.risk_level === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          currentAnalysis.crxcavator_data.risk_level === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                          currentAnalysis.crxcavator_data.risk_level === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                          'bg-green-500/20 text-green-400 border border-green-500/30'
                        }`}>
                          {currentAnalysis.crxcavator_data.risk_level}
                        </span>
                        {currentAnalysis.crxcavator_data.should_use !== null && (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            currentAnalysis.crxcavator_data.should_use
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                            {currentAnalysis.crxcavator_data.should_use ? '✓ Recommended' : '✗ Not Recommended'}
                          </span>
                        )}
                      </div>
                      {(currentAnalysis.crxcavator_data.reasoning as string[])?.length > 0 && (
                        <ul className="space-y-0.5">
                          {(currentAnalysis.crxcavator_data.reasoning as string[]).slice(0, 3).map((r: string, i: number) => (
                            <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                              <span className="text-teal-500 mt-0.5 flex-shrink-0">›</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {Object.keys(currentAnalysis.crxcavator_data.categories || {}).length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(currentAnalysis.crxcavator_data.categories as Record<string, number>).slice(0, 4).map(([key, val]) => (
                        <div key={key} className="bg-slate-900/50 rounded p-2 text-center">
                          <div className="text-lg font-bold text-white">{val}</div>
                          <div className="text-[10px] text-slate-500 capitalize">{key.replace(/_/g, ' ')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mb-6">
                <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Thamos Verdict</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!verdictLoading && !verdict && (
                        <button
                          onClick={runThamosVerdict}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-semibold rounded transition-colors border border-cyan-500/30"
                        >
                          <Brain className="w-3.5 h-3.5" />
                          Request Verdict
                        </button>
                      )}
                      {verdict && !verdictLoading && (
                        <button
                          onClick={runThamosVerdict}
                          className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Re-analyze
                        </button>
                      )}
                    </div>
                  </div>

                  {!verdictLoading && !verdict && !verdictError && (
                    <div className="px-4 py-6 text-center text-slate-500 text-sm">
                      Request an AI verdict to get a threat assessment synthesized from all scan data.
                    </div>
                  )}

                  {verdictLoading && (
                    <div className="px-4 py-6 flex flex-col items-center gap-3">
                      <T6Orb state="thinking" size={56} />
                      <div className="text-xs text-slate-400 font-mono tracking-wider">ANALYZING EXTENSION...</div>
                    </div>
                  )}

                  {verdictError && !verdictLoading && (
                    <div className="px-4 py-4 flex items-center gap-2 text-red-400 text-sm">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      {verdictError}
                    </div>
                  )}

                  {verdict && !verdictLoading && (
                    <div className="p-4">
                      <div className="flex items-start gap-4 mb-4">
                        <T6Orb state={verdictOrbState} size={56} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className={`px-3 py-1 rounded-full text-sm font-bold bg-${getVerdictColor(verdict.verdict)}-500/20 text-${getVerdictColor(verdict.verdict)}-400 border border-${getVerdictColor(verdict.verdict)}-500/30`}>
                              {verdict.verdict}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">{verdict.confidence} CONFIDENCE</span>
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed">{verdict.reasoning}</p>
                        </div>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                        <div className="text-xs font-bold text-slate-500 uppercase mb-1.5">Recommendation</div>
                        <p className="text-sm text-slate-300">{verdict.recommendation}</p>
                      </div>
                      {verdict.ioc_highlights && verdict.ioc_highlights.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1.5">Key IOCs</div>
                          <div className="flex flex-wrap gap-2">
                            {verdict.ioc_highlights.map((ioc, i) => (
                              <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs font-mono rounded border border-red-500/20 break-all">
                                {ioc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {theme !== 'desktop' && (
                <div className="border-b border-slate-700 mb-6">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setActiveTab('findings')}
                      className={`pb-3 px-2 font-medium transition-all border-b-2 ${
                        activeTab === 'findings'
                          ? 'border-cyan-500 text-cyan-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      Findings ({findings.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('iocs')}
                      className={`pb-3 px-2 font-medium transition-all border-b-2 ${
                        activeTab === 'iocs'
                          ? 'border-cyan-500 text-cyan-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      IOCs ({iocs.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('behavior')}
                      className={`pb-3 px-2 font-medium transition-all border-b-2 ${
                        activeTab === 'behavior'
                          ? 'border-cyan-500 text-cyan-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      Behavior ({otherBehaviorFlags.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('files')}
                      className={`pb-3 px-2 font-medium transition-all border-b-2 ${
                        activeTab === 'files'
                          ? 'border-cyan-500 text-cyan-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        Files
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'findings' && (
                <div className="space-y-4">
                  {findings.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-800/30 rounded-lg border border-slate-800">
                      No high-risk findings identified in this analysis.
                    </div>
                  ) : (
                    findings.map(finding => (
                      <div
                        key={finding.id}
                        className={`bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden transition-all ${
                          expandedFindings.has(finding.id) ? 'ring-1 ring-cyan-500/50' : ''
                        }`}
                      >
                        <button
                          onClick={() => toggleFinding(finding.id)}
                          className="w-full p-4 flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-${getRiskColor(finding.severity)}-500/20 text-${getRiskColor(finding.severity)}-400 border border-${getRiskColor(finding.severity)}-500/30`}>
                              {finding.severity}
                            </span>
                            <span className="font-medium text-white">{finding.title}</span>
                          </div>
                          {expandedFindings.has(finding.id) ? (
                            <ChevronUp className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                        {expandedFindings.has(finding.id) && (
                          <div className="p-4 border-t border-slate-700 bg-slate-900/30">
                            <p className="text-slate-300 mb-4">{finding.description}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Evidence</h4>
                                <pre className="p-3 bg-slate-950 rounded border border-slate-800 text-xs text-cyan-400 font-mono overflow-x-auto whitespace-pre-wrap">
                                  {finding.evidence}
                                </pre>
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Location</h4>
                                <button
                                  onClick={() => viewFileForFinding(finding.file_path)}
                                  className="w-full p-3 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-left transition-colors flex items-center justify-between group"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileCode className="w-4 h-4 text-cyan-500" />
                                    <span className="text-xs text-slate-300 font-mono truncate">{finding.file_path}</span>
                                  </div>
                                  <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'iocs' && (
                <div className="space-y-4">
                  {iocs.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-800/30 rounded-lg border border-slate-800">
                      No Indicators of Compromise detected in the source code.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {iocs.map(ioc => (
                        <div key={ioc.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                              {ioc.ioc_type}
                            </span>
                            <button
                              onClick={() => viewFileForFinding(ioc.source_file)}
                              className="text-[10px] text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1 font-mono"
                            >
                              {ioc.source_file.split('/').pop()}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <div className="text-sm font-mono text-white mb-3 break-all bg-slate-950/50 p-2 rounded">
                            {ioc.ioc_value}
                          </div>
                          <IOCEnrichment iocs={[ioc]} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'behavior' && (
                <div className="space-y-4">
                  {otherBehaviorFlags.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-800/30 rounded-lg border border-slate-800">
                      No suspicious behavioral patterns detected.
                    </div>
                  ) : (
                    otherBehaviorFlags.map((flag, idx) => (
                      <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-2 rounded-lg bg-${getRiskColor(flag.severity)}-500/20`}>
                            <AlertTriangle className={`w-5 h-5 text-${getRiskColor(flag.severity)}-400`} />
                          </div>
                          <div>
                            <h4 className="font-semibold text-white mb-1">{flag.flag_type.replace(/_/g, ' ').toUpperCase()}</h4>
                            <p className="text-sm text-slate-400 mb-3">{flag.description}</p>
                            <div className="space-y-1">
                              {flag.evidence.map((ev, i) => (
                                <div key={i} className="text-[10px] font-mono text-cyan-500/70 bg-cyan-500/5 px-2 py-1 rounded border border-cyan-500/10">
                                  {ev}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'files' && (
                <div className="bg-slate-800/30 rounded-lg border border-slate-700 overflow-hidden" style={{ height: '600px' }}>
                  <div className="flex h-full">
                    <div className="w-1/3 border-r border-slate-700 overflow-y-auto bg-slate-900/50">
                      <FileExplorer
                        analysisId={currentAnalysis.id}
                        onFileSelect={setSelectedFile}
                        selectedFile={selectedFile}
                        findings={findings}
                      />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      {selectedFile ? (
                        <FileViewer
                          analysisId={currentAnalysis.id}
                          filePath={selectedFile}
                          findings={findings}
                        />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                          <FileCode className="w-12 h-12 mb-4 opacity-20" />
                          <p>Select a file from the explorer to view its source code and detected risks.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

