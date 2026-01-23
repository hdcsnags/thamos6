import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Search, Clock, FileCode, ChevronDown, ChevronUp, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

export default function ExtensionScanner() {
  const [extensionUrl, setExtensionUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<Analysis | null>(null);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [iocs, setIocs] = useState<IOC[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'findings' | 'iocs' | 'behavior'>('findings');

  useEffect(() => {
    loadRecentAnalyses();
  }, []);

  useEffect(() => {
    if (currentAnalysis) {
      loadAnalysisData(currentAnalysis.id);
    }
  }, [currentAnalysis]);

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

  const analyzeExtension = async () => {
    if (!extensionUrl.trim()) {
      setError('Please enter a Chrome Web Store URL');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setCurrentAnalysis(null);
    setFindings([]);
    setIocs([]);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-extension`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extensionUrl }),
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
          <div className="pt-7">
            <button
              onClick={analyzeExtension}
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
          </div>
        </div>
      </div>

      {currentAnalysis && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">{currentAnalysis.extension_name}</h2>
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
                <div className="text-2xl font-bold text-white">{currentAnalysis.behavior_flags?.length || 0}</div>
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
                  Behavior ({currentAnalysis.behavior_flags?.length || 0})
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
                                    <div className="text-xs font-semibold text-slate-400 mb-1">Location</div>
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
              <div>
                {iocs.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    No indicators of compromise detected
                  </div>
                ) : (
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Value</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {iocs.map((ioc) => (
                          <tr key={ioc.id} className="hover:bg-slate-800/50">
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded font-medium">
                                {ioc.ioc_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300 font-mono break-all">{ioc.ioc_value}</td>
                            <td className="px-4 py-3 text-sm text-slate-400">{ioc.source_file}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'behavior' && (
              <div>
                {!currentAnalysis.behavior_flags || currentAnalysis.behavior_flags.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    No behavior patterns detected
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentAnalysis.behavior_flags.map((flag, idx) => (
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
                  onClick={() => setCurrentAnalysis(analysis)}
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