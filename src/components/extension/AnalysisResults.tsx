import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Shield, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, ExternalLink, Globe, Eye, FileCode, Flag } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { Pill, StatCell, MetricCard, cardStyle, type Tone } from '../../components/results';
import { riskTone, toneColor, chipStyle, fieldLabelStyle, sectionTitleStyle, codeBlockStyle } from './extensionTones';

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

  const getSeverityIcon = (severity: string) => {
    const tone = riskTone(severity);
    const color = tone === 'neutral' ? palette.textTertiary : toneColor[tone];
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />;
      case 'high':
        return <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />;
      default:
        return <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />;
    }
  };

  const obfuscationTone = (score: number): Tone => {
    if (score >= 70) return 'danger';
    if (score >= 40) return 'warn';
    return 'neutral';
  };

  const groupedFindings = findings.reduce((acc, finding) => {
    if (!acc[finding.category]) {
      acc[finding.category] = [];
    }
    acc[finding.category].push(finding);
    return acc;
  }, {} as Record<string, SecurityFinding[]>);

  const uniqueDomains = [...new Set(iocs.filter(i => i.ioc_type === 'domain').map(i => i.ioc_value))];
  const uniqueUrls = [...new Set(iocs.filter(i => i.ioc_type === 'url').map(i => i.ioc_value))];

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;

  const behaviorFlags = analysis.behavior_flags || [];
  const riskToneValue = riskTone(analysis.risk_level);

  const tabs: Array<{ id: 'findings' | 'iocs' | 'behavior'; label: string; count: number; show: boolean }> = [
    { id: 'findings', label: 'Security findings', count: findings.length, show: true },
    { id: 'iocs', label: 'IOCs', count: uniqueDomains.length + uniqueUrls.length, show: true },
    { id: 'behavior', label: 'Behavior analysis', count: behaviorFlags.length, show: behaviorFlags.length > 0 },
  ];

  return (
    <div className="@container mb-8 overflow-hidden" style={{ ...cardStyle, fontFamily: typography.ui }}>
      {/* Header: identity + score */}
      <div className="p-5 flex items-start justify-between gap-4" style={{ borderBottom: `1px solid ${palette.borderDefault}` }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <Shield className="w-5 h-5 shrink-0" style={{ color: palette.textTertiary }} />
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate" style={{ color: palette.textPrimary }}>{analysis.extension_name}</h2>
              <p className="text-xs" style={{ color: palette.textTertiary }}>
                Version {analysis.extension_version} · <span style={{ fontFamily: typography.mono }}>{analysis.extension_id}</span>
              </p>
            </div>
          </div>
          <a
            href={analysis.extension_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs hover:underline"
            style={{ color: palette.accent }}
          >
            View in Chrome Web Store
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-3xl font-semibold tabular-nums leading-none mb-1.5"
            style={{ color: riskToneValue === 'neutral' ? palette.textPrimary : toneColor[riskToneValue] }}
          >
            {analysis.risk_score}
          </div>
          <Pill label={`${analysis.risk_level} risk`} tone={riskToneValue} />
        </div>
      </div>

      <div className="p-5">
        {(criticalCount > 0 || highCount > 0 || mediumCount > 0 || lowCount > 0) && (
          <div className="grid grid-cols-2 @xl:grid-cols-4 gap-3 mb-5">
            <StatCell label="Critical" value={criticalCount} tone={criticalCount > 0 ? 'danger' : 'neutral'} />
            <StatCell label="High" value={highCount} tone={highCount > 0 ? 'danger' : 'neutral'} />
            <StatCell label="Medium" value={mediumCount} tone={mediumCount > 0 ? 'warn' : 'neutral'} />
            <StatCell label="Low" value={lowCount} tone="neutral" />
          </div>
        )}

        {(analysis.obfuscation_score !== undefined || analysis.total_files_scanned !== undefined || behaviorFlags.length > 0) && (
          <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3 mb-5">
            {analysis.obfuscation_score !== undefined && (
              <MetricCard
                icon={<Eye className="w-3.5 h-3.5" />}
                label="Obfuscation"
                value={`${analysis.obfuscation_score}/100`}
                tone={obfuscationTone(analysis.obfuscation_score)}
                highlight={obfuscationTone(analysis.obfuscation_score) !== 'neutral'}
              />
            )}
            {analysis.total_files_scanned !== undefined && (
              <MetricCard icon={<FileCode className="w-3.5 h-3.5" />} label="Files scanned" value={analysis.total_files_scanned} />
            )}
            {behaviorFlags.length > 0 && (
              <MetricCard icon={<Flag className="w-3.5 h-3.5" />} label="Behavior flags" value={behaviorFlags.length} tone="danger" highlight />
            )}
          </div>
        )}

        <div className="mb-5" style={{ borderBottom: `1px solid ${palette.borderDefault}` }}>
          <div className="flex gap-1">
            {tabs.filter(t => t.show).map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{
                    color: isActive ? palette.textPrimary : palette.textTertiary,
                    boxShadow: isActive ? `inset 0 -2px 0 ${palette.accent}` : 'none',
                  }}
                >
                  {tab.label} <span className="tabular-nums" style={{ color: palette.textTertiary }}>({tab.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-xs" style={{ color: palette.textTertiary }}>Loading analysis data…</div>
        ) : (
          <>
            {activeTab === 'findings' && (
              findings.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="w-8 h-8 mx-auto mb-3" style={{ color: palette.textDisabled }} />
                  <h3 className="text-sm font-semibold mb-1" style={{ color: palette.textPrimary }}>No findings</h3>
                  <p className="text-xs" style={{ color: palette.textTertiary }}>The static scanner produced no security findings for this extension.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedFindings).map(([category, categoryFindings]) => (
                    <div key={category} className="overflow-hidden rounded-lg" style={{ border: `1px solid ${palette.borderDefault}` }}>
                      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: palette.elevated, borderBottom: `1px solid ${palette.borderDefault}` }}>
                        <span style={sectionTitleStyle}>{category.replace(/_/g, ' ')}</span>
                        <span className="text-xs tabular-nums" style={{ color: palette.textTertiary }}>
                          {categoryFindings.length} finding{categoryFindings.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div>
                        {categoryFindings.map((finding, idx) => {
                          const isExpanded = expandedFindings.has(finding.id);
                          return (
                            <div key={finding.id} style={{ background: palette.base, borderTop: idx === 0 ? 'none' : `1px solid ${palette.borderSubtle}` }}>
                              <button
                                onClick={() => toggleFinding(finding.id)}
                                className="w-full px-4 py-3 flex items-start gap-3 transition-colors hover:brightness-125 text-left"
                              >
                                {getSeverityIcon(finding.severity)}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 className="text-[13px] font-semibold" style={{ color: palette.textPrimary }}>{finding.title}</h4>
                                    {finding.rule_id && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px]" style={chipStyle('neutral', true)}>
                                        {finding.rule_id}
                                      </span>
                                    )}
                                    <Pill label={finding.severity} tone={riskTone(finding.severity)} />
                                    {finding.confidence && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px]" style={chipStyle('neutral')}>
                                        {finding.confidence} confidence
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs" style={{ color: palette.textSecondary }}>{finding.description}</p>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 shrink-0" style={{ color: palette.textTertiary }} />
                                ) : (
                                  <ChevronDown className="w-4 h-4 shrink-0" style={{ color: palette.textTertiary }} />
                                )}
                              </button>
                              {isExpanded && (
                                <div className="px-4 pb-4 pl-11 space-y-3" style={{ background: palette.elevated, borderTop: `1px solid ${palette.borderSubtle}` }}>
                                  {finding.file_path && (
                                    <div className="pt-3">
                                      <div style={fieldLabelStyle}>Location</div>
                                      <code className="block mt-1 px-3 py-2 break-all" style={codeBlockStyle}>
                                        {finding.file_path}
                                      </code>
                                    </div>
                                  )}
                                  {finding.evidence && (
                                    <div>
                                      <div style={fieldLabelStyle}>Evidence</div>
                                      <code className="block mt-1 px-3 py-2 break-all whitespace-pre-wrap" style={codeBlockStyle}>
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
                  <Globe className="w-8 h-8 mx-auto mb-3" style={{ color: palette.textDisabled }} />
                  <h3 className="text-sm font-semibold mb-1" style={{ color: palette.textPrimary }}>No IOCs found</h3>
                  <p className="text-xs" style={{ color: palette.textTertiary }}>No domains or URLs were detected in the extension code.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {uniqueDomains.length > 0 && (
                    <div className="overflow-hidden rounded-lg" style={{ border: `1px solid ${palette.borderDefault}` }}>
                      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: palette.elevated, borderBottom: `1px solid ${palette.borderDefault}` }}>
                        <Globe className="w-4 h-4" style={{ color: palette.textTertiary }} />
                        <span style={sectionTitleStyle}>Domains</span>
                        <span className="text-xs tabular-nums" style={{ color: palette.textTertiary }}>({uniqueDomains.length})</span>
                      </div>
                      <div className="p-4" style={{ background: palette.base }}>
                        <div className="flex flex-wrap gap-1.5">
                          {uniqueDomains.map((domain, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded text-xs break-all" style={chipStyle('neutral', true)}>
                              {domain}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {uniqueUrls.length > 0 && (
                    <div className="overflow-hidden rounded-lg" style={{ border: `1px solid ${palette.borderDefault}` }}>
                      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: palette.elevated, borderBottom: `1px solid ${palette.borderDefault}` }}>
                        <ExternalLink className="w-4 h-4" style={{ color: palette.textTertiary }} />
                        <span style={sectionTitleStyle}>URLs</span>
                        <span className="text-xs tabular-nums" style={{ color: palette.textTertiary }}>({uniqueUrls.length})</span>
                      </div>
                      <div>
                        {uniqueUrls.map((url, idx) => {
                          const ioc = iocs.find(i => i.ioc_value === url && i.ioc_type === 'url');
                          const isExpanded = ioc ? expandedIocs.has(ioc.id) : false;
                          return (
                            <div key={idx} style={{ background: palette.base, borderTop: idx === 0 ? 'none' : `1px solid ${palette.borderSubtle}` }}>
                              <button
                                onClick={() => ioc && toggleIoc(ioc.id)}
                                className="w-full px-4 py-2.5 flex items-center gap-3 transition-colors hover:brightness-125 text-left"
                              >
                                <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                                <code className="flex-1 text-xs break-all" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>
                                  {url}
                                </code>
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 shrink-0" style={{ color: palette.textTertiary }} />
                                ) : (
                                  <ChevronDown className="w-4 h-4 shrink-0" style={{ color: palette.textTertiary }} />
                                )}
                              </button>
                              {isExpanded && ioc && (
                                <div className="px-4 pb-3 pl-11 space-y-2" style={{ background: palette.elevated, borderTop: `1px solid ${palette.borderSubtle}` }}>
                                  <div className="pt-3">
                                    <div style={fieldLabelStyle}>Source</div>
                                    <code className="block mt-1 px-3 py-2 break-all" style={codeBlockStyle}>
                                      {ioc.source_file}
                                    </code>
                                  </div>
                                  {ioc.context && (
                                    <div>
                                      <div style={fieldLabelStyle}>Context</div>
                                      <code className="block mt-1 px-3 py-2 break-all whitespace-pre-wrap" style={codeBlockStyle}>
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
              <div className="space-y-3">
                {behaviorFlags.map((flag, idx) => {
                  const tone = riskTone(flag.severity);
                  return (
                    <div key={idx} className="p-4" style={cardStyle}>
                      <div className="flex items-start gap-3">
                        <Flag className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tone === 'neutral' ? palette.textTertiary : toneColor[tone] }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <h4 className="text-[13px] font-semibold" style={{ color: palette.textPrimary }}>
                              {flag.flag_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </h4>
                            <Pill label={flag.severity} tone={tone} />
                          </div>
                          <p className="text-xs mb-2" style={{ color: palette.textSecondary }}>{flag.description}</p>
                          <div style={fieldLabelStyle}>Evidence</div>
                          <ul className="mt-1 space-y-1">
                            {flag.evidence.map((evidence, evidenceIdx) => (
                              <li key={evidenceIdx} className="px-2 py-1 rounded break-all" style={codeBlockStyle}>
                                {evidence}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AnalysisResults;
