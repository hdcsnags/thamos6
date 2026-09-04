import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Shield, AlertTriangle, Search, Clock, FileCode, ChevronDown, ChevronUp, Loader2, ExternalLink, FolderOpen, Archive, Plus, Check, Activity, Database, Zap, Brain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/themecontext';
import { palette, typography } from '../design-system/tokens';
import { Pill, SectionHeader, Callout, StatCell, cardStyle, type Tone } from '../components/results';
import {
  riskTone, toneColor, toneBg, toneBorder, chipStyle,
  primaryButtonStyle, secondaryButtonStyle, disabledButtonStyle,
  fieldLabelStyle, sectionTitleStyle, codeBlockStyle,
} from '../components/extension/extensionTones';
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

interface TopConcern {
  type: 'CONFIRMED_BEHAVIOR' | 'CAPABILITY_RISK' | 'CONTEXTUAL_FALSE_POSITIVE' | 'EXTERNAL_REPUTATION_SIGNAL' | 'WATCH_ITEM';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  evidence: string;
}

interface FindingAssessment {
  rule_id: string;
  file_path: string;
  assessment: 'CONFIRMED' | 'REFUTED' | 'CAPABILITY_ONLY' | 'UNVERIFIABLE';
  reasoning: string;
}

interface VerdictResult {
  verdict: 'MALICIOUS' | 'OVERPRIVILEGED' | 'SUSPICIOUS' | 'LIKELY_SAFE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  admin_action: 'ALLOW' | 'ALLOW_MONITOR' | 'REVIEW' | 'BLOCK' | 'REMOVE';
  raw_scanner_interpretation: { risk_score: number; risk_level: string; classification: 'CAPABILITY_RISK' | 'CONFIRMED_MALICIOUS' | 'MIXED' };
  external_intel_interpretation: { provider: string; score: number | null; risk_level: string | null; summary: string };
  purpose_fit: { rating: 'STRONG' | 'PARTIAL' | 'WEAK' | 'UNKNOWN'; reasoning: string };
  why_verdict_differs: string;
  finding_assessments?: FindingAssessment[];
  top_concerns: TopConcern[];
  positive_signals: string[];
  watch_items: string[];
  recommendation: string;
  ioc_highlights?: string[];
  organizational_suitability?: {
    rating: 'APPROVED' | 'REVIEW_REQUIRED' | 'NOT_APPROVED' | 'UNKNOWN';
    ai_data_flow_risk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    detected_ai_vendors: string[];
    content_surfaces: string[];
    reasoning: string;
  };
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

// ---- Semantic tone mappers (real state only) ----

const verdictTone = (v: string): Tone => {
  switch (v) {
    case 'MALICIOUS': return 'danger';
    case 'OVERPRIVILEGED': return 'warn';
    case 'SUSPICIOUS': return 'warn';
    case 'LIKELY_SAFE': return 'good';
    default: return 'neutral';
  }
};

const adminActionTone = (a: string): Tone => {
  switch (a) {
    case 'ALLOW': return 'good';
    case 'ALLOW_MONITOR': return 'neutral';
    case 'REVIEW': return 'warn';
    case 'BLOCK': return 'danger';
    case 'REMOVE': return 'danger';
    default: return 'neutral';
  }
};

const assessmentTone = (a: FindingAssessment['assessment']): Tone => {
  switch (a) {
    case 'CONFIRMED': return 'danger';
    case 'REFUTED': return 'good';
    case 'CAPABILITY_ONLY': return 'warn';
    default: return 'neutral';
  }
};

const concernTypeTone = (t: TopConcern['type']): Tone => {
  switch (t) {
    case 'CONFIRMED_BEHAVIOR': return 'danger';
    case 'CAPABILITY_RISK': return 'warn';
    case 'CONTEXTUAL_FALSE_POSITIVE': return 'good';
    case 'EXTERNAL_REPUTATION_SIGNAL': return 'accent';
    default: return 'warn';
  }
};

const purposeFitTone = (r: string): Tone => {
  switch (r) {
    case 'STRONG': return 'good';
    case 'PARTIAL': return 'warn';
    case 'WEAK': return 'danger';
    default: return 'neutral';
  }
};

const suitabilityTone = (r: string | undefined): Tone => {
  switch (r) {
    case 'APPROVED': return 'good';
    case 'REVIEW_REQUIRED': return 'warn';
    case 'NOT_APPROVED': return 'danger';
    default: return 'neutral';
  }
};

const aiRiskTone = (r: string | undefined): Tone => {
  switch (r) {
    case 'MEDIUM': return 'warn';
    case 'HIGH':
    case 'CRITICAL': return 'danger';
    default: return 'neutral';
  }
};

const crxRiskTone = (level: string | undefined): Tone => {
  switch ((level || '').toLowerCase()) {
    case 'critical':
    case 'high': return 'danger';
    case 'medium': return 'warn';
    default: return 'neutral';
  }
};

const toneText = (tone: Tone) => (tone === 'neutral' ? palette.textPrimary : toneColor[tone]);

const emptyStateStyle: CSSProperties = {
  ...cardStyle,
  color: palette.textTertiary,
  fontFamily: typography.ui,
};

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
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState<'none' | 'adding' | 'added'>('none');
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [verdictError, setVerdictError] = useState('');
  const [showCrxJustifications, setShowCrxJustifications] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    loadRecentAnalyses();
  }, []);

  useEffect(() => {
    if (currentAnalysis) {
      loadAnalysisData(currentAnalysis.id);
      checkVaultStatus(currentAnalysis.extension_id);
      setVerdict(null);
      setVerdictError('');
      loadPersistedVerdict(currentAnalysis.id);
    }
  }, [currentAnalysis]);

  const loadPersistedVerdict = async (analysisId: string) => {
    const { data } = await supabase
      .from('extension_verdicts')
      .select('verdict_data')
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.verdict_data) {
      setVerdict(data.verdict_data as VerdictResult);
    }
  };

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
      // Send the user's session token when available — the edge function
      // uses it for per-user vault delta tracking. Anon key = anonymous tier.
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
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

      // Server-side grounded verdict: the edge function loads findings, IOCs,
      // CRXplorer data AND raw file contents from the DB, then asks the model
      // to confirm/refute each finding against actual code.
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extension-verdict`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ analysis_id: currentAnalysis.id }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Verdict analysis failed (${response.status})`);
      }

      const data = await response.json();
      setVerdict(data.verdict as VerdictResult);
    } catch (err: any) {
      setVerdictError(err.message || 'Verdict analysis failed');
    } finally {
      setVerdictLoading(false);
    }
  };

  const formatAdminAction = (a: string) => {
    switch (a) {
      case 'ALLOW': return 'Allow';
      case 'ALLOW_MONITOR': return 'Allow + Monitor';
      case 'REVIEW': return 'Review';
      case 'BLOCK': return 'Block';
      case 'REMOVE': return 'Remove';
      default: return a;
    }
  };

  const formatVerdict = (v: string) => v.replace('_', ' ');
  const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

  const behaviorFlags = currentAnalysis?.behavior_flags || [];
  const malExtFlags = behaviorFlags.filter(f => f.flag_type === 'confirmed_removed_from_store');
  const vaultDeltaFlags = behaviorFlags.filter(f => f.flag_type === 'vault_delta_detected');
  const otherBehaviorFlags = behaviorFlags.filter(f => f.flag_type !== 'vault_delta_detected' && f.flag_type !== 'confirmed_removed_from_store');
  const aiDataFindings = findings.filter(f => f.category === 'ai_data_flow');

  const crxData = currentAnalysis?.crxcavator_data?.available ? currentAnalysis.crxcavator_data : null;

  const scannerClassification: 'CAPABILITY_RISK' | 'CONFIRMED_MALICIOUS' | 'MIXED' = (() => {
    if (malExtFlags.length > 0 || findings.some(f => f.rule_id === 'MALEXT-1')) return 'CONFIRMED_MALICIOUS';
    const hasCriticalBehavior = otherBehaviorFlags.some(f => f.severity === 'critical');
    const hasCriticalCode = findings.some(f => f.category === 'code_patterns' && f.severity === 'critical');
    if (hasCriticalBehavior && hasCriticalCode) return 'MIXED';
    if (hasCriticalBehavior) return 'MIXED';
    return 'CAPABILITY_RISK';
  })();

  const verdictOrbState: T6OrbState = verdictLoading
    ? 'thinking'
    : verdict?.verdict === 'MALICIOUS' ? 'conflict'
    : verdict?.verdict === 'OVERPRIVILEGED' ? 'tense'
    : verdict?.verdict === 'SUSPICIOUS' ? 'tense'
    : verdict?.verdict === 'LIKELY_SAFE' ? 'done'
    : verdictError ? 'error'
    : 'idle';

  const menuItems = [
    { id: 'findings', label: 'Findings', icon: Shield, count: findings.length },
    { id: 'iocs', label: 'IOCs', icon: Zap, count: iocs.length },
    { id: 'behavior', label: 'Behavior', icon: Activity, count: otherBehaviorFlags.length },
    { id: 'files', label: 'Files', icon: FolderOpen },
    { id: 'vault', label: 'Vault', icon: Archive },
  ];

  const tabButtonStyle = (isActive: boolean): CSSProperties => ({
    color: isActive ? palette.textPrimary : palette.textTertiary,
    boxShadow: isActive ? `inset 0 -2px 0 ${palette.accent}` : 'none',
    fontFamily: typography.ui,
  });

  const scrollToTabs = () => tabStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const riskT = currentAnalysis ? riskTone(currentAnalysis.risk_level) : 'neutral';

  return (
    <div
      className={`@container h-full overflow-y-auto ${theme === 'desktop' ? 'flex flex-col' : 'p-8 max-w-7xl mx-auto'}`}
      style={{ background: palette.elevated, color: palette.textPrimary, fontFamily: typography.ui }}
    >
      {theme === 'desktop' && (
        <div
          className="sticky top-0 z-20 px-4"
          style={{ background: palette.elevated, borderBottom: `1px solid ${palette.borderDefault}` }}
        >
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
                  className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors"
                  style={tabButtonStyle(isActive)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                  {hasCount && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] tabular-nums"
                      style={{
                        background: isActive ? toneBg('accent', 0.12) : palette.base,
                        color: isActive ? palette.accent : palette.textTertiary,
                        border: `1px solid ${isActive ? toneBorder('accent', 0.28) : palette.borderSubtle}`,
                      }}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={theme === 'desktop' ? 'p-5 flex-1' : ''}>
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-base font-semibold flex items-center gap-2" style={{ color: palette.textPrimary }}>
              <Shield className="w-4 h-4" style={{ color: palette.textTertiary }} />
              Extension Scanner
            </h1>
            <p className="text-xs mt-0.5" style={{ color: palette.textTertiary }}>
              Static analysis of browser extensions: permissions, code patterns, IOCs and behaviour
            </p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors hover:brightness-125 shrink-0"
            style={secondaryButtonStyle}
          >
            <Clock className="w-3.5 h-3.5" />
            {showHistory ? 'Hide history' : 'Recent analyses'}
          </button>
        </div>

        {showHistory && (
          <div className="mb-5 overflow-hidden" style={cardStyle}>
            <div className="px-4 py-2.5" style={{ background: palette.elevated, borderBottom: `1px solid ${palette.borderDefault}` }}>
              <span style={sectionTitleStyle}>Recent analyses</span>
            </div>
            <div>
              {recentAnalyses.length === 0 ? (
                <p className="p-6 text-center text-xs" style={{ color: palette.textTertiary }}>No recent analyses found</p>
              ) : (
                recentAnalyses.map((analysis, idx) => (
                  <button
                    key={analysis.id}
                    onClick={() => {
                      setCurrentAnalysis(analysis);
                      setShowHistory(false);
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 transition-colors hover:brightness-125 text-left"
                    style={{ background: palette.base, borderTop: idx === 0 ? 'none' : `1px solid ${palette.borderSubtle}` }}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: palette.textPrimary }}>{analysis.extension_name}</div>
                      <div className="text-[11px] flex items-center gap-2 mt-0.5" style={{ color: palette.textTertiary }}>
                        <span style={{ fontFamily: typography.mono }}>{analysis.extension_id}</span>
                        <span>·</span>
                        <span>{new Date(analysis.analyzed_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums" style={{ color: toneText(riskTone(analysis.risk_level)) }}>
                        {analysis.risk_score}
                      </span>
                      <Pill label={analysis.risk_level} tone={riskTone(analysis.risk_level)} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 @3xl:grid-cols-4 gap-4 mb-5">
          <div className="@3xl:col-span-3">
            <label htmlFor="extension-url" className="block text-xs font-medium mb-1.5" style={{ color: palette.textSecondary }}>
              Extension ID, Chrome Web Store URL or Edge Add-ons URL
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: palette.textTertiary }} />
              <input
                id="extension-url"
                type="text"
                value={extensionUrl}
                onChange={(e) => setExtensionUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="chromewebstore.google.com/… or microsoftedge.microsoft.com/addons/… or 32-char ID"
                className="w-full pl-9 pr-3 py-2 rounded-md text-[13px] outline-none transition-colors"
                style={{
                  background: palette.base,
                  color: palette.textPrimary,
                  border: `1px solid ${inputFocused ? palette.accent : palette.borderDefault}`,
                  fontFamily: typography.mono,
                }}
                disabled={isAnalyzing}
              />
            </div>
            {error && (
              <div className="mt-3">
                <Callout icon={<AlertTriangle className="w-4 h-4" />} title={error} tone="danger" />
              </div>
            )}
          </div>
          <div className="@3xl:pt-6 flex gap-2">
            <button
              onClick={() => analyzeExtension()}
              disabled={isAnalyzing}
              className="px-4 py-2 text-[13px] font-semibold rounded-md transition-colors hover:brightness-110 flex items-center gap-2"
              style={isAnalyzing ? disabledButtonStyle : primaryButtonStyle}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <FileCode className="w-4 h-4" />
                  Analyze
                </>
              )}
            </button>
            {theme !== 'desktop' && (
              <button
                onClick={() => { setCurrentAnalysis(null); setActiveTab('vault'); }}
                className="px-3 py-2 rounded-md text-[13px] font-medium transition-colors hover:brightness-125 flex items-center gap-2"
                style={
                  activeTab === 'vault' && !currentAnalysis
                    ? { ...secondaryButtonStyle, background: palette.surface, color: palette.textPrimary, border: `1px solid ${palette.borderActive}` }
                    : secondaryButtonStyle
                }
              >
                <Archive className="w-4 h-4" />
                Vault
              </button>
            )}
          </div>
        </div>

        {activeTab === 'vault' && !currentAnalysis && (
          <div className="p-5" style={cardStyle}>
            <div className="mb-4">
              <SectionHeader icon={<Archive className="w-4 h-4" />} title="Extension vault" />
            </div>
            <VaultList
              onRescan={(extId) => analyzeExtension(extId)}
              isScanning={isAnalyzing}
            />
          </div>
        )}

        {currentAnalysis && (
          <div className="space-y-4">
            <div className="p-5" style={cardStyle}>
              {/* Identity row */}
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="text-base font-semibold truncate" style={{ color: palette.textPrimary }}>{currentAnalysis.extension_name}</h2>
                    <Pill
                      label={currentAnalysis.extension_url?.includes('microsoftedge.microsoft.com') ? 'Edge Add-ons' : 'Chrome'}
                      tone="neutral"
                    />
                    {vaultStatus === 'none' && (
                      <button
                        onClick={addToVault}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors hover:brightness-125 flex items-center gap-1"
                        style={secondaryButtonStyle}
                      >
                        <Plus className="w-3 h-3" />
                        Add to vault
                      </button>
                    )}
                    {vaultStatus === 'adding' && (
                      <span className="px-2.5 py-1 text-[11px] rounded-md flex items-center gap-1" style={chipStyle('neutral')}>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Adding…
                      </span>
                    )}
                    {vaultStatus === 'added' && (
                      <span className="px-2.5 py-1 text-[11px] font-medium rounded-md flex items-center gap-1" style={chipStyle('good')}>
                        <Check className="w-3 h-3" />
                        In vault
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: palette.textSecondary }}>
                    Version {currentAnalysis.extension_version}
                    <span style={{ color: palette.textTertiary }}> · </span>
                    <span style={{ color: palette.textTertiary, fontFamily: typography.mono }}>{currentAnalysis.extension_id}</span>
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: palette.textTertiary }}>
                    Analyzed {new Date(currentAnalysis.analyzed_at).toLocaleString()}
                    {currentAnalysis.scan_duration_ms ? ` · scan ${(currentAnalysis.scan_duration_ms / 1000).toFixed(2)}s` : ''}
                    {currentAnalysis.total_files_scanned !== undefined ? ` · ${currentAnalysis.total_files_scanned} files scanned` : ''}
                    {currentAnalysis.files_skipped_count ? ` · ${currentAnalysis.files_skipped_count} skipped` : ''}
                  </p>
                </div>
                {currentAnalysis.extension_url && (
                  <a
                    href={currentAnalysis.extension_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs hover:underline shrink-0"
                    style={{ color: palette.accent }}
                  >
                    Store listing <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {malExtFlags.length > 0 && (
                <div className="mb-4">
                  <Callout icon={<Shield className="w-4 h-4" />} title="Confirmed removed from Chrome Web Store" tone="danger">
                    {malExtFlags.map((flag, idx) => (
                      <div key={idx} className="mt-1.5">
                        <p className="text-xs mb-2" style={{ color: palette.textSecondary }}>{flag.description}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {flag.evidence.map((ev, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded break-all" style={chipStyle('danger', true)}>
                              {ev}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </Callout>
                </div>
              )}

              {vaultDeltaFlags.length > 0 && (
                <div className="mb-4">
                  <Callout icon={<AlertTriangle className="w-4 h-4" />} title="Changed since last vault scan" tone="warn">
                    {vaultDeltaFlags.map((flag, idx) => (
                      <div key={idx} className="mt-1.5">
                        <p className="text-xs mb-2" style={{ color: palette.textSecondary }}>{flag.description}</p>
                        <ul className="space-y-1">
                          {flag.evidence.filter(e => !e.startsWith('baseline_analysis_id')).map((ev, i) => (
                            <li key={i} className="text-[11px] break-all" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>{ev}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </Callout>
                </div>
              )}

              {/* Three-panel summary: Raw scanner | External intel | Thamos verdict */}
              <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-3 mb-4">

                {/* Raw scanner risk */}
                <div className="p-4" style={cardStyle}>
                  <div className="mb-2" style={fieldLabelStyle}>Raw scanner risk</div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-semibold leading-none tabular-nums" style={{ color: toneText(riskT) }}>
                      {currentAnalysis.risk_score}
                    </span>
                    <Pill label={currentAnalysis.risk_level} tone={riskT} />
                  </div>
                  <Pill
                    label={
                      scannerClassification === 'CONFIRMED_MALICIOUS' ? 'Confirmed malicious'
                      : scannerClassification === 'MIXED' ? 'Mixed evidence'
                      : 'Capability-based'
                    }
                    tone={scannerClassification === 'CONFIRMED_MALICIOUS' ? 'danger' : scannerClassification === 'MIXED' ? 'warn' : 'neutral'}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <StatCell label="Findings" value={findings.length} />
                    <StatCell label="IOCs" value={iocs.length} />
                    <StatCell label="Behavior" value={otherBehaviorFlags.length} />
                    <StatCell label="Obfuscation" value={currentAnalysis.obfuscation_score || 0} />
                  </div>
                </div>

                {/* External intel */}
                <div className="p-4" style={cardStyle}>
                  <div className="flex items-center justify-between mb-2">
                    <div style={fieldLabelStyle}>External intel</div>
                    {crxData?.share_url && (
                      <a href={crxData.share_url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] hover:underline flex items-center gap-0.5" style={{ color: palette.accent }}>
                        CRXplorer <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  {crxData ? (
                    <>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-3xl font-semibold leading-none tabular-nums" style={{ color: toneText(crxRiskTone(crxData.risk_level)) }}>
                          {crxData.overall_score ?? '—'}
                        </span>
                        {crxData.risk_level && <Pill label={crxData.risk_level} tone={crxRiskTone(crxData.risk_level)} />}
                      </div>
                      {crxData.should_use !== null && crxData.should_use !== undefined && (
                        <div className="mb-2">
                          <Pill label={crxData.should_use ? 'Recommended' : 'Not recommended'} tone={crxData.should_use ? 'good' : 'danger'} />
                        </div>
                      )}
                      {(crxData.reasoning as any[])?.length > 0 && (
                        <ul className="space-y-1 mt-1">
                          {(crxData.reasoning as any[]).slice(0, 3).map((r: any, i: number) => (
                            <li key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: palette.textSecondary }}>
                              <span className="shrink-0" style={{ color: palette.textTertiary }}>›</span>
                              {typeof r === 'string' ? r : r?.text ?? ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <div className="text-xs mt-1" style={{ color: palette.textTertiary }}>
                      {currentAnalysis.crxcavator_data ? 'CRXplorer returned no data for this extension' : 'CRXplorer not queried'}
                    </div>
                  )}
                </div>

                {/* Thamos verdict */}
                <div className="p-4" style={cardStyle}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5" style={{ color: palette.textTertiary }} />
                      <span style={fieldLabelStyle}>Thamos verdict</span>
                    </div>
                    {verdict && !verdictLoading && (
                      <button onClick={runThamosVerdict}
                        className="text-[11px] transition-colors hover:brightness-125" style={{ color: palette.textTertiary }}>
                        Re-run
                      </button>
                    )}
                  </div>

                  {!verdict && !verdictLoading && !verdictError && (
                    <div className="flex flex-col items-center py-2 gap-3">
                      <T6Orb state="idle" size={44} />
                      <span className="text-[11px]" style={{ color: palette.textTertiary }}>Awaiting analysis</span>
                      <button
                        onClick={runThamosVerdict}
                        className="w-full px-3 py-2 text-xs font-semibold rounded-md transition-colors hover:brightness-110 flex items-center justify-center gap-1.5"
                        style={primaryButtonStyle}
                      >
                        <Brain className="w-3.5 h-3.5" />
                        Run Thamos analysis
                      </button>
                    </div>
                  )}
                  {verdictLoading && (
                    <div className="flex flex-col items-center py-2 gap-2">
                      <T6Orb state="thinking" size={44} />
                      <span className="text-[11px]" style={{ color: palette.textSecondary }}>Analyzing…</span>
                    </div>
                  )}
                  {verdictError && !verdictLoading && (
                    <div className="text-xs flex items-start gap-1.5 mt-1" style={{ color: palette.rose }}>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{verdictError}</span>
                    </div>
                  )}
                  {verdict && !verdictLoading && (
                    <div className="flex flex-col items-center text-center gap-1">
                      <T6Orb state={verdictOrbState} size={44} />
                      <div className="text-sm font-semibold mt-1" style={{ color: toneText(verdictTone(verdict.verdict)) }}>
                        {humanize(formatVerdict(verdict.verdict))}
                      </div>
                      <div className="text-[11px]" style={{ color: palette.textTertiary }}>{humanize(verdict.confidence)} confidence</div>
                      {verdict.admin_action && (
                        <div className="mt-1">
                          <Pill label={formatAdminAction(verdict.admin_action)} tone={adminActionTone(verdict.admin_action)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Organizational suitability — shown whenever AI data flow signals exist, even before verdict */}
              {(aiDataFindings.length > 0 || verdict?.organizational_suitability) && (() => {
                const os = verdict?.organizational_suitability;
                const ratingT = suitabilityTone(os?.rating);
                const riskTn = aiRiskTone(os?.ai_data_flow_risk);
                const vendors = os?.detected_ai_vendors?.length ? os.detected_ai_vendors : aiDataFindings.filter(f => f.rule_id === 'AI-DATA-1').flatMap(f => f.evidence.split(', '));
                const surfaces = os?.content_surfaces?.length ? os.content_surfaces : aiDataFindings.filter(f => f.rule_id === 'AI-DATA-2').flatMap(f => f.evidence.split(', '));
                return (
                  <div
                    className="mb-4 rounded-lg p-4"
                    style={{ background: toneBg(ratingT, 0.06), border: `1px solid ${toneBorder(ratingT)}` }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4" style={{ color: palette.textTertiary }} />
                        <span style={sectionTitleStyle}>Organizational suitability</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {os?.ai_data_flow_risk && os.ai_data_flow_risk !== 'NONE' && (
                          <Pill label={`AI data-flow risk: ${humanize(os.ai_data_flow_risk)}`} tone={riskTn} />
                        )}
                        <Pill label={os ? humanize(os.rating) : 'Pending analysis'} tone={ratingT} />
                      </div>
                    </div>

                    {(vendors.length > 0 || surfaces.length > 0) && (
                      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3 mb-3">
                        {vendors.length > 0 && (
                          <div>
                            <div className="mb-1.5" style={fieldLabelStyle}>Detected AI vendors</div>
                            <div className="flex flex-wrap gap-1">
                              {vendors.map((v, i) => (
                                <span key={i} className="px-1.5 py-0.5 text-[11px] rounded" style={chipStyle('neutral', true)}>{v}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {surfaces.length > 0 && (
                          <div>
                            <div className="mb-1.5" style={fieldLabelStyle}>Content surfaces exposed</div>
                            <div className="flex flex-wrap gap-1">
                              {surfaces.map((s, i) => (
                                <span key={i} className="px-1.5 py-0.5 text-[11px] rounded" style={chipStyle('neutral', true)}>{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {os?.reasoning ? (
                      <p className="text-xs leading-relaxed" style={{ color: palette.textSecondary }}>{os.reasoning}</p>
                    ) : (
                      <p className="text-xs" style={{ color: palette.textTertiary }}>
                        {aiDataFindings.length > 0
                          ? `${aiDataFindings.length} AI data flow signal(s) detected. Run Thamos analysis for the full governance assessment.`
                          : 'No AI data flow signals detected in this extension.'}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Why they differ — full width below three panels */}
              {verdict?.why_verdict_differs && (
                <div className="mb-4 px-4 py-3" style={cardStyle}>
                  <div className="mb-1" style={fieldLabelStyle}>Why the verdicts differ</div>
                  <p className="text-xs leading-relaxed" style={{ color: palette.textSecondary }}>{verdict.why_verdict_differs}</p>
                </div>
              )}

              {/* Full verdict details */}
              {verdict && !verdictLoading && (
                <div className="mb-5 space-y-3">
                  {verdict.finding_assessments && verdict.finding_assessments.length > 0 && (
                    <div>
                      <div className="mb-2" style={sectionTitleStyle}>Finding verification (code-grounded)</div>
                      <div className="space-y-2">
                        {verdict.finding_assessments.map((fa, i) => (
                          <div key={i} className="p-3" style={cardStyle}>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Pill label={humanize(fa.assessment)} tone={assessmentTone(fa.assessment)} />
                              <span className="text-xs font-medium" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{fa.rule_id}</span>
                              <span className="text-[11px] break-all" style={{ color: palette.textTertiary, fontFamily: typography.mono }}>{fa.file_path}</span>
                            </div>
                            <p className="text-xs" style={{ color: palette.textSecondary }}>{fa.reasoning}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {verdict.top_concerns && verdict.top_concerns.length > 0 && (
                    <div>
                      <div className="mb-2" style={sectionTitleStyle}>Top concerns</div>
                      <div className="space-y-2">
                        {verdict.top_concerns.map((concern, i) => (
                          <div key={i} className="p-3" style={cardStyle}>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Pill label={humanize(concern.type)} tone={concernTypeTone(concern.type)} />
                              <Pill label={humanize(concern.severity)} tone={riskTone(concern.severity)} />
                              <span className="text-xs font-medium" style={{ color: palette.textPrimary }}>{concern.title}</span>
                            </div>
                            <p className="text-xs" style={{ color: palette.textSecondary }}>{concern.evidence}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                    {verdict.positive_signals && verdict.positive_signals.length > 0 && (
                      <div className="p-3" style={cardStyle}>
                        <div className="mb-2" style={sectionTitleStyle}>Positive signals</div>
                        <ul className="space-y-1">
                          {verdict.positive_signals.map((s, i) => (
                            <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: palette.textSecondary }}>
                              <Check className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: palette.green }} />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {verdict.watch_items && verdict.watch_items.length > 0 && (
                      <div className="p-3" style={cardStyle}>
                        <div className="mb-2" style={sectionTitleStyle}>Watch items</div>
                        <ul className="space-y-1">
                          {verdict.watch_items.map((w, i) => (
                            <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: palette.textSecondary }}>
                              <span className="shrink-0" style={{ color: palette.amber }}>›</span>{w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {(verdict.purpose_fit || verdict.recommendation) && (
                    <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                      {verdict.purpose_fit && (
                        <div className="p-3" style={cardStyle}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span style={sectionTitleStyle}>Purpose fit</span>
                            <Pill label={humanize(verdict.purpose_fit.rating)} tone={purposeFitTone(verdict.purpose_fit.rating)} />
                          </div>
                          <p className="text-xs" style={{ color: palette.textSecondary }}>{verdict.purpose_fit.reasoning}</p>
                        </div>
                      )}
                      {verdict.recommendation && (
                        <div className="p-3" style={cardStyle}>
                          <div className="mb-1.5" style={sectionTitleStyle}>Recommendation</div>
                          <p className="text-xs" style={{ color: palette.textSecondary }}>{verdict.recommendation}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {verdict.ioc_highlights && verdict.ioc_highlights.length > 0 && (
                    <div>
                      <div className="mb-2" style={sectionTitleStyle}>Key IOCs</div>
                      <div className="flex flex-wrap gap-1.5">
                        {verdict.ioc_highlights.map((ioc, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs rounded break-all" style={chipStyle('warn', true)}>
                            {ioc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CRXplorer category justifications — collapsible */}
              {crxData?.category_justifications && Object.keys(crxData.category_justifications as object).length > 0 && (
                <div className="mb-5">
                  <button
                    onClick={() => setShowCrxJustifications(!showCrxJustifications)}
                    className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:brightness-125 mb-2"
                    style={{ color: palette.textSecondary }}
                  >
                    <Database className="w-3.5 h-3.5" />
                    CRXplorer category analysis
                    {showCrxJustifications ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showCrxJustifications && (
                    <div className="p-3 space-y-2" style={cardStyle}>
                      {Object.entries(crxData.category_justifications as Record<string, any>).map(([cat, just], idx, arr) => (
                        <div key={cat} className="pb-2" style={{ borderBottom: idx === arr.length - 1 ? 'none' : `1px solid ${palette.borderSubtle}` }}>
                          <div className="mb-0.5" style={fieldLabelStyle}>{humanize(cat)}</div>
                          <p className="text-xs" style={{ color: palette.textSecondary }}>{typeof just === 'string' ? just : JSON.stringify(just)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {theme !== 'desktop' && (
                <div ref={tabStripRef} className="mb-5" style={{ borderBottom: `1px solid ${palette.borderDefault}` }}>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setActiveTab('findings'); scrollToTabs(); }}
                      className="px-3 py-2.5 text-[13px] font-medium transition-colors"
                      style={tabButtonStyle(activeTab === 'findings')}
                    >
                      Findings <span className="tabular-nums" style={{ color: palette.textTertiary }}>({findings.length})</span>
                    </button>
                    <button
                      onClick={() => { setActiveTab('iocs'); scrollToTabs(); }}
                      className="px-3 py-2.5 text-[13px] font-medium transition-colors"
                      style={tabButtonStyle(activeTab === 'iocs')}
                    >
                      IOCs <span className="tabular-nums" style={{ color: palette.textTertiary }}>({iocs.length})</span>
                    </button>
                    <button
                      onClick={() => { setActiveTab('behavior'); scrollToTabs(); }}
                      className="px-3 py-2.5 text-[13px] font-medium transition-colors"
                      style={tabButtonStyle(activeTab === 'behavior')}
                    >
                      Behavior <span className="tabular-nums" style={{ color: palette.textTertiary }}>({otherBehaviorFlags.length})</span>
                    </button>
                    <button
                      onClick={() => { setActiveTab('files'); scrollToTabs(); }}
                      className="px-3 py-2.5 text-[13px] font-medium transition-colors flex items-center gap-1.5"
                      style={tabButtonStyle(activeTab === 'files')}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Files
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'findings' && (
                <div className="space-y-2">
                  {findings.length === 0 ? (
                    <div className="p-6 text-center text-xs" style={emptyStateStyle}>
                      No high-risk findings identified in this analysis.
                    </div>
                  ) : (
                    findings.map(finding => {
                      const isOpen = expandedFindings.has(finding.id);
                      return (
                        <div
                          key={finding.id}
                          className="overflow-hidden"
                          style={{ ...cardStyle, border: `1px solid ${isOpen ? palette.borderActive : palette.borderDefault}` }}
                        >
                          <button
                            onClick={() => toggleFinding(finding.id)}
                            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors hover:brightness-125"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <Pill label={finding.severity} tone={riskTone(finding.severity)} />
                              {finding.rule_id && (
                                <span className="px-1.5 py-0.5 rounded text-[10px]" style={chipStyle('neutral', true)}>{finding.rule_id}</span>
                              )}
                              <span className="text-[13px] font-medium" style={{ color: palette.textPrimary }}>{finding.title}</span>
                              {finding.confidence && (
                                <span className="text-[11px]" style={{ color: palette.textTertiary }}>{finding.confidence} confidence</span>
                              )}
                            </div>
                            {isOpen ? (
                              <ChevronUp className="w-4 h-4 shrink-0" style={{ color: palette.textTertiary }} />
                            ) : (
                              <ChevronDown className="w-4 h-4 shrink-0" style={{ color: palette.textTertiary }} />
                            )}
                          </button>
                          {isOpen && (
                            <div className="p-4" style={{ background: palette.elevated, borderTop: `1px solid ${palette.borderSubtle}` }}>
                              <p className="text-xs mb-3" style={{ color: palette.textSecondary }}>{finding.description}</p>
                              <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                                <div>
                                  <div className="mb-1.5" style={fieldLabelStyle}>Evidence</div>
                                  <pre className="p-3 overflow-x-auto whitespace-pre-wrap break-all" style={codeBlockStyle}>
                                    {finding.evidence}
                                  </pre>
                                </div>
                                <div>
                                  <div className="mb-1.5" style={fieldLabelStyle}>Location</div>
                                  <button
                                    onClick={() => viewFileForFinding(finding.file_path)}
                                    className="w-full p-3 rounded-md text-left transition-colors hover:brightness-125 flex items-center justify-between gap-2"
                                    style={secondaryButtonStyle}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileCode className="w-4 h-4 shrink-0" style={{ color: palette.textTertiary }} />
                                      <span className="text-xs truncate" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{finding.file_path}</span>
                                    </div>
                                    <ExternalLink className="w-3 h-3 shrink-0" style={{ color: palette.textTertiary }} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'iocs' && (
                <div>
                  {iocs.length === 0 ? (
                    <div className="p-6 text-center text-xs" style={emptyStateStyle}>
                      No indicators of compromise detected in the source code.
                    </div>
                  ) : (
                    <IOCEnrichment iocs={iocs} />
                  )}
                </div>
              )}

              {activeTab === 'behavior' && (
                <div className="space-y-2">
                  {otherBehaviorFlags.length === 0 ? (
                    <div className="p-6 text-center text-xs" style={emptyStateStyle}>
                      No suspicious behavioral patterns detected.
                    </div>
                  ) : (
                    otherBehaviorFlags.map((flag, idx) => {
                      const tone = riskTone(flag.severity);
                      return (
                        <div key={idx} className="p-4" style={cardStyle}>
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tone === 'neutral' ? palette.textTertiary : toneColor[tone] }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="text-[13px] font-semibold" style={{ color: palette.textPrimary }}>{humanize(flag.flag_type)}</h4>
                                <Pill label={flag.severity} tone={tone} />
                              </div>
                              <p className="text-xs mb-2" style={{ color: palette.textSecondary }}>{flag.description}</p>
                              <div className="space-y-1">
                                {flag.evidence.map((ev, i) => (
                                  <div key={i} className="px-2 py-1 break-all" style={codeBlockStyle}>
                                    {ev}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'files' && (
                <div className="overflow-hidden" style={{ ...cardStyle, height: '600px' }}>
                  <div className="flex h-full">
                    <div className="w-1/3 overflow-y-auto" style={{ background: palette.base, borderRight: `1px solid ${palette.borderDefault}` }}>
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
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center text-xs" style={{ color: palette.textTertiary }}>
                          <FileCode className="w-8 h-8 mb-3" style={{ color: palette.textDisabled }} />
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
