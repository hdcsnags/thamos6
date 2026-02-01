import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Shield, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, ExternalLink, Globe, Eye, FileCode, Flag } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

interface Props {
  analysis: Analysis;
}

function AnalysisResults({ analysis }: Props) {
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [iocs, setIocs] = useState<IOC[]>([]);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [expandedIocs, setExpandedIocs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'findings' | 'iocs' | 'behavior'>('findings');

  useEffect(() => {
    loadData();
  }, [analysis.id]);

  const loadData = async () => {
    setLoading(true);

    const [findingsResult, iocsResult] = await Promise.all([
      supabase
        .from('security_findings')
        .select('*')
        .eq('analysis_id', analysis.id)
        .order('severity', { ascending: false }),
      supabase
        .from('extension_iocs')
        .select('*')
        .eq('analysis_id', analysis.id)
        .order('ioc_type', { ascending: true })
    ]);

    if (findingsResult.data && !findingsResult.error) {
      setFindings(findingsResult.data);
    }

    if (iocsResult.data && !iocsResult.error) {
      setIocs(iocsResult.data);
    }

    setLoading(false);
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

  const toggleIoc = (id: string) => {
    const newExpanded = new Set(expandedIocs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIocs(newExpanded);
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'from-red-500 to-red-600';
      case 'high':
        return 'from-orange-500 to-orange-600';
      case 'medium':
        return 'from-yellow-500 to-yellow-600';
      default:
        return 'from-green-500 to-green-600';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'high':
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      case 'medium':
        return <Info className="w-5 h-5 text-yellow-600" />;
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'permissions':
        return 'bg-violet-100 text-violet-800';
      case 'code_patterns':
        return 'bg-pink-100 text-pink-800';
      case 'obfuscation':
        return 'bg-red-100 text-red-800';
      case 'manifest':
        return 'bg-cyan-100 text-cyan-800';
      case 'behavior':
        return 'bg-rose-100 text-rose-800';
      case 'anti-analysis':
        return 'bg-orange-100 text-orange-800';
      case 'network':
        return 'bg-blue-100 text-blue-800';
      case 'performance':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getConfidenceBadgeColor = (confidence?: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getObfuscationColor = (score: number) => {
    if (score >= 70) return 'text-red-700';
    if (score >= 40) return 'text-orange-700';
    if (score >= 20) return 'text-yellow-700';
    return 'text-green-700';
  };

  const getObfuscationBgColor = (score: number) => {
    if (score >= 70) return 'bg-red-50 border-red-200';
    if (score >= 40) return 'bg-orange-50 border-orange-200';
    if (score >= 20) return 'bg-yellow-50 border-yellow-200';
    return 'bg-green-50 border-green-200';
  };

  const groupedFindings = findings.reduce((acc, finding) => {
    if (!acc[finding.category]) {
      acc[finding.category] = [];
    }
    acc[finding.category].push(finding);
    return acc;
  }, {} as Record<string, SecurityFinding[]>);

  const groupedIocs = iocs.reduce((acc, ioc) => {
    if (!acc[ioc.ioc_type]) {
      acc[ioc.ioc_type] = [];
    }
    acc[ioc.ioc_type].push(ioc);
    return acc;
  }, {} as Record<string, IOC[]>);

  const uniqueDomains = [...new Set(iocs.filter(i => i.ioc_type === 'domain').map(i => i.ioc_value))];
  const uniqueUrls = [...new Set(iocs.filter(i => i.ioc_type === 'url').map(i => i.ioc_value))];

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;

  const behaviorFlags = analysis.behavior_flags || [];

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 mb-8 overflow-hidden">
      <div className={`bg-gradient-to-r ${getRiskColor(analysis.risk_level)} p-8 text-white`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="w-10 h-10" />
              <div>
                <h2 className="text-3xl font-bold">{analysis.extension_name}</h2>
                <p className="text-white/90 text-sm">Version {analysis.extension_version}</p>
              </div>
            </div>
            <a
              href={analysis.extension_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white/90 hover:text-white text-sm hover:underline"
            >
              View in Chrome Web Store
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <div className="text-right">
            <div className="text-6xl font-bold mb-2">{analysis.risk_score}</div>
            <div className="text-xl font-semibold uppercase tracking-wide">
              {analysis.risk_level} Risk
            </div>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {criticalCount > 0 && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-700">{criticalCount}</div>
              <div className="text-sm font-semibold text-red-600 uppercase">Critical</div>
            </div>
          )}
          {highCount > 0 && (
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-orange-700">{highCount}</div>
              <div className="text-sm font-semibold text-orange-600 uppercase">High</div>
            </div>
          )}
          {mediumCount > 0 && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-yellow-700">{mediumCount}</div>
              <div className="text-sm font-semibold text-yellow-600 uppercase">Medium</div>
            </div>
          )}
          {lowCount > 0 && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-700">{lowCount}</div>
              <div className="text-sm font-semibold text-blue-600 uppercase">Low</div>
            </div>
          )}
        </div>

        {(analysis.obfuscation_score !== undefined || analysis.total_files_scanned !== undefined || behaviorFlags.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {analysis.obfuscation_score !== undefined && (
              <div className={`border-2 rounded-xl p-4 ${getObfuscationBgColor(analysis.obfuscation_score)}`}>
                <div className="flex items-center gap-3 mb-2">
                  <Eye className="w-5 h-5 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Obfuscation</span>
                </div>
                <div className={`text-3xl font-bold ${getObfuscationColor(analysis.obfuscation_score)}`}>
                  {analysis.obfuscation_score}/100
                </div>
              </div>
            )}
            {analysis.total_files_scanned !== undefined && (
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <FileCode className="w-5 h-5 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Files Scanned</span>
                </div>
                <div className="text-3xl font-bold text-slate-700">{analysis.total_files_scanned}</div>
              </div>
            )}
            {behaviorFlags.length > 0 && (
              <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Flag className="w-5 h-5 text-rose-600" />
                  <span className="text-sm font-semibold text-rose-700">Behavior Flags</span>
                </div>
                <div className="text-3xl font-bold text-rose-700">{behaviorFlags.length}</div>
              </div>
            )}
          </div>
        )}

        <div className="border-b border-slate-200 mb-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('findings')}
              className={`px-6 py-3 font-semibold transition-colors border-b-2 ${
                activeTab === 'findings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Security Findings ({findings.length})
            </button>
            <button
              onClick={() => setActiveTab('iocs')}
              className={`px-6 py-3 font-semibold transition-colors border-b-2 ${
                activeTab === 'iocs'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              IOCs ({uniqueDomains.length + uniqueUrls.length})
            </button>
            {behaviorFlags.length > 0 && (
              <button
                onClick={() => setActiveTab('behavior')}
                className={`px-6 py-3 font-semibold transition-colors border-b-2 ${
                  activeTab === 'behavior'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Behavior Analysis ({behaviorFlags.length})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading analysis data...</div>
        ) : (
          <>
            {activeTab === 'findings' && (
              findings.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">No Issues Found</h3>
                  <p className="text-slate-600">This extension appears to be safe based on our analysis.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedFindings).map(([category, categoryFindings]) => (
                    <div key={category} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getCategoryColor(category)}`}>
                            {category.replace('_', ' ')}
                          </span>
                          <span className="text-sm text-slate-600">{categoryFindings.length} finding{categoryFindings.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-200">
                        {categoryFindings.map((finding) => {
                          const isExpanded = expandedFindings.has(finding.id);
                          return (
                            <div key={finding.id} className="bg-white">
                              <button
                                onClick={() => toggleFinding(finding.id)}
                                className="w-full px-6 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors text-left"
                              >
                                {getSeverityIcon(finding.severity)}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 className="font-semibold text-slate-900">{finding.title}</h4>
                                    {finding.rule_id && (
                                      <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-mono font-semibold">
                                        {finding.rule_id}
                                      </span>
                                    )}
                                    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase border ${getSeverityBadgeColor(finding.severity)}`}>
                                      {finding.severity}
                                    </span>
                                    {finding.confidence && (
                                      <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${getConfidenceBadgeColor(finding.confidence)}`}>
                                        {finding.confidence === 'high' ? '✓ High Confidence' : finding.confidence === 'medium' ? 'Medium Confidence' : 'Low Confidence'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-600">{finding.description}</p>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                )}
                              </button>
                              {isExpanded && (
                                <div className="px-6 pb-4 pl-16 space-y-3 bg-slate-50">
                                  {finding.file_path && (
                                    <div>
                                      <span className="text-xs font-semibold text-slate-700">Location:</span>
                                      <code className="block mt-1 text-sm bg-slate-800 text-green-400 px-3 py-2 rounded-lg font-mono">
                                        {finding.file_path}
                                      </code>
                                    </div>
                                  )}
                                  {finding.evidence && (
                                    <div>
                                      <span className="text-xs font-semibold text-slate-700">Evidence:</span>
                                      <code className="block mt-1 text-sm bg-slate-800 text-amber-300 px-3 py-2 rounded-lg font-mono break-all">
                                        {finding.evidence}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'iocs' && (
              uniqueDomains.length === 0 && uniqueUrls.length === 0 ? (
                <div className="text-center py-12">
                  <Globe className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">No IOCs Found</h3>
                  <p className="text-slate-600">No domains or URLs were detected in the extension code.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {uniqueDomains.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                          <Globe className="w-5 h-5 text-slate-600" />
                          <span className="font-semibold text-slate-900">Domains</span>
                          <span className="text-sm text-slate-600">({uniqueDomains.length})</span>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="flex flex-wrap gap-2">
                          {uniqueDomains.map((domain, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-sm font-mono"
                            >
                              {domain}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {uniqueUrls.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                          <ExternalLink className="w-5 h-5 text-slate-600" />
                          <span className="font-semibold text-slate-900">URLs</span>
                          <span className="text-sm text-slate-600">({uniqueUrls.length})</span>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-200">
                        {uniqueUrls.map((url, idx) => {
                          const ioc = iocs.find(i => i.ioc_value === url && i.ioc_type === 'url');
                          const isExpanded = ioc ? expandedIocs.has(ioc.id) : false;
                          return (
                            <div key={idx} className="bg-white">
                              <button
                                onClick={() => ioc && toggleIoc(ioc.id)}
                                className="w-full px-6 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
                              >
                                <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                <code className="flex-1 text-sm text-slate-700 font-mono break-all">
                                  {url}
                                </code>
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                )}
                              </button>
                              {isExpanded && ioc && (
                                <div className="px-6 pb-3 pl-14 space-y-2 bg-slate-50">
                                  <div>
                                    <span className="text-xs font-semibold text-slate-700">Source:</span>
                                    <code className="block mt-1 text-sm bg-slate-800 text-green-400 px-3 py-2 rounded-lg font-mono">
                                      {ioc.source_file}
                                    </code>
                                  </div>
                                  {ioc.context && (
                                    <div>
                                      <span className="text-xs font-semibold text-slate-700">Context:</span>
                                      <code className="block mt-1 text-sm bg-slate-800 text-amber-300 px-3 py-2 rounded-lg font-mono">
                                        {ioc.context}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {activeTab === 'behavior' && behaviorFlags.length > 0 && (
              <div className="space-y-4">
                {behaviorFlags.map((flag, idx) => (
                  <div key={idx} className="border-2 border-rose-200 bg-rose-50 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <Flag className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-bold text-rose-900 text-lg">
                            {flag.flag_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </h4>
                          <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase border ${getSeverityBadgeColor(flag.severity)}`}>
                            {flag.severity}
                          </span>
                        </div>
                        <p className="text-rose-800 mb-3">{flag.description}</p>
                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-rose-700">Evidence:</span>
                          <ul className="list-disc list-inside space-y-1">
                            {flag.evidence.map((evidence, evidenceIdx) => (
                              <li key={evidenceIdx} className="text-sm text-rose-700">
                                {evidence}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AnalysisResults;
