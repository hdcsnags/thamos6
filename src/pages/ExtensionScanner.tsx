import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Search, Clock, FileCode, ChevronDown, ChevronUp, Loader2, ExternalLink, FolderOpen, Archive, Plus, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import FileExplorer from '../components/extension/FileExplorer';
import FileViewer from '../components/extension/FileViewer';
import VaultList from '../components/extension/VaultList';
import IOCEnrichment from '../components/extension/IOCEnrichment';

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

  useEffect(() => {
    loadRecentAnalyses();
  }, []);

  useEffect(() => {
    if (currentAnalysis) {
      loadAnalysisData(currentAnalysis.id);
      checkVaultStatus(currentAnalysis.extension_id);
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
  const vaultDeltaFlags = behaviorFlags.filter(f => f.flag_type === 'vault_delta_detected');
  const otherBehaviorFlags = behaviorFlags.filter(f => f.flag_type !== 'vault_delta_detected');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Chrome Extension Scanner</h1>
        <p className="text-slate-400">Analyze Chrome extensions for security risks, suspicious permissions, and malicious code patterns</p>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        <div className="flex gap-4 items-start">
          <div className="flex-1">
            <label htmlFor="extension-url" className="block text-sm font-semibold text-slate-300 mb-2">
              Chrome Web Store URL
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
          </div>
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

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{findings.length}</div>
                <div className="text-sm text-slate-400">Findings</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{iocs.length}</div>
                <div className="text-sm text-slate-400">IOCs</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{behaviorFlags.length}</div>
                <div className="text-sm text-slate-400">Behavior Flags</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{currentAnalysis.obfuscation_score || 0}</div>
                <div className="text-sm text-slate-400">Obfuscation</div>
              </div>
            </div>

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
                  Behavior ({behaviorFlags.length})
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
                <button
                  onClick={() => setActiveTab('vault')}
                  className={`pb-3 px-2 font-medium transition-all border-b-2 ${
                    activeTab === 'vault'
                      ? 'border-amber-500 text-amber-400'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4" />
                    Vault
                  </div>
                </button>
              </div>
            </div>

            {activeTab === 'findings' && (
              <div className="space-y-4">
                {findings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    No security findings detected
                  </div>
                ) : (
                  Object.entries(findingsByCategory).map(([category, categoryFindings]) => (
                    <div key={category} className="border border-slate-700 rounded-lg overflow-hidden">
                      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white capitalize">{category.replace('_', ' ')}</span>
                          <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full">
                            {categoryFindings.length}
                          </span>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-700">
                        {categoryFindings.map((finding) => {
                          const Icon = getCategoryIcon(finding.category);
                          const isExpanded = expandedFindings.has(finding.id);
                          return (
                            <div key={finding.id} className="bg-slate-900">
                              <button
                                onClick={() => toggleFinding(finding.id)}
                                className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-800/50 transition-all text-left"
                              >
                                <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 text-${getSeverityColor(finding.severity)}-400`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {finding.rule_id && (
                                      <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs font-mono rounded">
                                        {finding.rule_id}
                                      </span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${getSeverityColor(finding.severity)}-500/20 text-${getSeverityColor(finding.severity)}-400`}>
                                      {finding.severity}
                                    </span>
                                    {finding.confidence && (
                                      <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">
                                        {finding.confidence} confidence
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="font-semibold text-white mb-1">{finding.title}</h4>
                                  <p className="text-sm text-slate-400">{finding.description}</p>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 flex-shrink-0 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 flex-shrink-0 text-slate-400" />
                                )}
                              </button>
                              {isExpanded && (
                                <div className="px-4 pb-4 space-y-2">
                                  <div className="bg-slate-800 rounded p-3">
                                    <div className="text-xs font-semibold text-slate-400 mb-1">Evidence</div>
                                    <div className="text-sm text-slate-300 font-mono break-all">{finding.evidence}</div>
                                  </div>
                                  <div className="bg-slate-800 rounded p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="text-xs font-semibold text-slate-400">Location</div>
                                      <button
                                        onClick={() => viewFileForFinding(finding.file_path)}
                                        className="flex items-center gap-1 px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs rounded transition-colors"
                                      >
                                        <FileCode className="w-3 h-3" />
                                        View File
                                      </button>
                                    </div>
                                    <div className="text-sm text-slate-300 font-mono">{finding.file_path}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'iocs' && (
              <IOCEnrichment iocs={iocs} />
            )}

            {activeTab === 'behavior' && (
              <div>
                {behaviorFlags.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    No behavior patterns detected
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vaultDeltaFlags.map((flag, idx) => (
                      <div key={`delta-${idx}`} className="border-2 border-amber-500/30 rounded-lg p-4 bg-amber-500/10">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400">
                                {flag.severity}
                              </span>
                              <span className="font-semibold text-amber-300">
                                Changed Since Last Vault Scan
                              </span>
                            </div>
                            <p className="text-sm text-amber-200/80 mb-2">{flag.description}</p>
                            <div className="text-xs text-amber-300/70">
                              {flag.evidence.filter(e => !e.startsWith('baseline_analysis_id')).join(', ')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {otherBehaviorFlags.map((flag, idx) => (
                      <div key={idx} className="border border-slate-700 rounded-lg p-4 bg-slate-800">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className={`w-5 h-5 flex-shrink-0 text-${getSeverityColor(flag.severity)}-400`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${getSeverityColor(flag.severity)}-500/20 text-${getSeverityColor(flag.severity)}-400`}>
                                {flag.severity}
                              </span>
                              <span className="font-semibold text-white capitalize">
                                {flag.flag_type.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-sm text-slate-300 mb-2">{flag.description}</p>
                            <div className="text-xs text-slate-400">
                              Evidence: {flag.evidence.join(', ')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <div className="grid grid-cols-12 gap-4 h-[700px]">
                <div className="col-span-3 border border-slate-700 rounded-lg overflow-hidden bg-slate-800">
                  <div className="px-4 py-3 bg-slate-800 border-b border-slate-700">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <FolderOpen className="w-4 h-4" />
                      File Explorer
                    </h3>
                  </div>
                  <FileExplorer
                    analysisId={currentAnalysis.id}
                    onFileSelect={setSelectedFile}
                    selectedFile={selectedFile}
                    findings={findings}
                  />
                </div>
                <div className="col-span-9 border border-slate-700 rounded-lg overflow-hidden">
                  {selectedFile ? (
                    <FileViewer
                      analysisId={currentAnalysis.id}
                      filePath={selectedFile}
                      findings={findings}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      <div className="text-center">
                        <FileCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>Select a file to view its contents</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'vault' && (
              <VaultList
                onRescan={(extId) => analyzeExtension(extId)}
                isScanning={isAnalyzing}
              />
            )}
          </div>
        </div>
      )}

      {recentAnalyses.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400" />
              <h2 className="text-xl font-bold text-white">Recent Analyses</h2>
              <span className="px-2 py-1 bg-slate-700 text-slate-300 text-sm font-semibold rounded">
                {recentAnalyses.length}
              </span>
            </div>
            {showHistory ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>

          {showHistory && (
            <div className="border-t border-slate-700 divide-y divide-slate-700">
              {recentAnalyses.map((analysis) => (
                <button
                  key={analysis.id}
                  onClick={() => {
                    setCurrentAnalysis(analysis);
                    setActiveTab('findings');
                  }}
                  className="w-full px-6 py-4 hover:bg-slate-800 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{analysis.extension_name}</div>
                      <div className="text-sm text-slate-400">
                        {new Date(analysis.analyzed_at).toLocaleString()}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded bg-${getRiskColor(analysis.risk_level)}-500/20 text-${getRiskColor(analysis.risk_level)}-400 text-sm font-semibold`}>
                      {analysis.risk_level}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
