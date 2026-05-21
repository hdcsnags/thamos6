import { useState, useEffect, useRef } from 'react';
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

interface TopConcern {
  type: 'CONFIRMED_BEHAVIOR' | 'CAPABILITY_RISK' | 'CONTEXTUAL_FALSE_POSITIVE' | 'EXTERNAL_REPUTATION_SIGNAL' | 'WATCH_ITEM';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  evidence: string;
}

interface VerdictResult {
  verdict: 'MALICIOUS' | 'OVERPRIVILEGED' | 'SUSPICIOUS' | 'LIKELY_SAFE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  admin_action: 'ALLOW' | 'ALLOW_MONITOR' | 'REVIEW' | 'BLOCK' | 'REMOVE';
  raw_scanner_interpretation: { risk_score: number; risk_level: string; classification: 'CAPABILITY_RISK' | 'CONFIRMED_MALICIOUS' | 'MIXED' };
  external_intel_interpretation: { provider: string; score: number | null; risk_level: string | null; summary: string };
  purpose_fit: { rating: 'STRONG' | 'PARTIAL' | 'WEAK' | 'UNKNOWN'; reasoning: string };
  why_verdict_differs: string;
  top_concerns: TopConcern[];
  positive_signals: string[];
  watch_items: string[];
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
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState<'none' | 'adding' | 'added'>('none');
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [verdictError, setVerdictError] = useState('');
  const [showCrxJustifications, setShowCrxJustifications] = useState(false);

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

      const classification = scannerClassification;

      const manifestStr = currentAnalysis.manifest_data
        ? JSON.stringify(currentAnalysis.manifest_data, null, 2)
        : 'Not available';

      const findingsSummary = findings.map(f =>
        `[${f.severity.toUpperCase()}] ${f.title}\nDescription: ${f.description}\nEvidence: ${f.evidence}\nFile: ${f.file_path}`
      ).join('\n\n') || 'None';

      const behaviorSummary = otherBehaviorFlags.map(f =>
        `${f.flag_type}: ${f.description}\n${f.evidence.join(', ')}`
      ).join('\n\n') || 'None';

      const vaultDeltaStr = vaultDeltaFlags.length > 0
        ? vaultDeltaFlags.map(f =>
            `VAULT DELTA — ${f.description}\n${f.evidence.filter(e => !e.startsWith('baseline_analysis_id')).join(' | ')}`
          ).join('\n')
        : 'None';

      const iocSummary = iocs.slice(0, 20).map(i =>
        `[${i.ioc_type}] ${i.ioc_value} (in ${i.source_file})`
      ).join('\n') || 'None';

      const crxFull = crxData;
      const crxStr = crxFull
        ? `Score: ${crxFull.overall_score}/100 | Risk: ${crxFull.risk_level} | Recommended: ${crxFull.should_use === true ? 'Yes' : crxFull.should_use === false ? 'No' : 'Unknown'}
Reasoning: ${(crxFull.reasoning as any[]).map((r: any) => typeof r === 'string' ? r : r?.text ?? '').join(' | ') || 'None'}
Categories: ${JSON.stringify(crxFull.categories)}
Category Justifications: ${JSON.stringify(crxFull.category_justifications)}
Browser Impact: ${JSON.stringify(crxFull.browser_impact)}
Safety Guidelines: ${JSON.stringify(crxFull.safety_guidelines)}`
        : 'Not available';

      const systemPrompt = `You are a senior browser-extension threat analyst inside Thamos6. You review automated scanner findings, manifest data, IOCs, behavior flags, CRXplorer external intel, and reputation signals. The internal scanner is intentionally aggressive and reports capability risk, not always malicious intent. Your job is to produce a calibrated analyst verdict.

Do not invent evidence. Use only the supplied artifacts. If raw scanner risk and contextual verdict differ, explain why. Separate confirmed behavior from capability risk. A legitimate extension can have high capability risk if its function requires broad page access. Lower final verdict only when permissions, behavior, purpose, reputation, and external intel support that conclusion. Raise final verdict when multiple independent signals converge: sensitive data access, network exfiltration, remote control/config, dynamic execution, evasion, suspicious domains, store removal, or permission-purpose mismatch.

Return only valid JSON matching the requested schema.`;

      const prompt = `Analyze this Chrome extension and return a calibrated analyst verdict as JSON.

EXTENSION: ${currentAnalysis.extension_name} v${currentAnalysis.extension_version}
EXTENSION ID: ${currentAnalysis.extension_id}
SCANNER RISK SCORE: ${currentAnalysis.risk_score}/100 (${currentAnalysis.risk_level})
SCANNER CLASSIFICATION (pre-computed): ${classification}
OBFUSCATION SCORE: ${currentAnalysis.obfuscation_score || 0}

CRXPLORER INDEPENDENT ASSESSMENT:
${crxStr}

MANIFEST:
${manifestStr}

SECURITY FINDINGS (${findings.length} total):
${findingsSummary}

BEHAVIORAL FLAGS:
${behaviorSummary}

VAULT DELTA (posture drift since known baseline):
${vaultDeltaStr}

IOCS DETECTED (${iocs.length} total, showing first 20):
${iocSummary}

IMPORTANT: When evaluating MAIN-world or broad content script access, decide whether it is purpose-aligned. If purpose-aligned, classify it as CAPABILITY_RISK or WATCH_ITEM rather than CONFIRMED_BEHAVIOR unless paired with exfiltration, credential targeting, remote command/config abuse, or evasion.

Return ONLY valid JSON — no markdown, no prose:
{
  "verdict": "MALICIOUS" | "OVERPRIVILEGED" | "SUSPICIOUS" | "LIKELY_SAFE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "admin_action": "ALLOW" | "ALLOW_MONITOR" | "REVIEW" | "BLOCK" | "REMOVE",
  "raw_scanner_interpretation": {
    "risk_score": ${currentAnalysis.risk_score},
    "risk_level": "${currentAnalysis.risk_level}",
    "classification": "${classification}"
  },
  "external_intel_interpretation": {
    "provider": "CRXplorer",
    "score": ${crxFull?.overall_score ?? null},
    "risk_level": ${crxFull?.risk_level ? `"${crxFull.risk_level}"` : 'null'},
    "summary": "<one sentence summarizing CRXplorer assessment>"
  },
  "purpose_fit": {
    "rating": "STRONG" | "PARTIAL" | "WEAK" | "UNKNOWN",
    "reasoning": "<one sentence>"
  },
  "why_verdict_differs": "<explain if and why contextual verdict differs from raw scanner risk, or state they align>",
  "top_concerns": [
    {
      "type": "CONFIRMED_BEHAVIOR" | "CAPABILITY_RISK" | "CONTEXTUAL_FALSE_POSITIVE" | "EXTERNAL_REPUTATION_SIGNAL" | "WATCH_ITEM",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "title": "<concise title>",
      "evidence": "<specific evidence from supplied data only>"
    }
  ],
  "positive_signals": ["<signal>"],
  "watch_items": ["<item>"],
  "recommendation": "<1-2 sentences>",
  "ioc_highlights": ["<critical IOC if any>"]
}`;

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
          max_tokens: 2048,
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
      case 'LIKELY_SAFE': return 'green';
      default: return 'slate';
    }
  };

  const getAdminActionColor = (a: string) => {
    switch (a) {
      case 'ALLOW': return 'green';
      case 'ALLOW_MONITOR': return 'teal';
      case 'REVIEW': return 'amber';
      case 'BLOCK': return 'orange';
      case 'REMOVE': return 'red';
      default: return 'slate';
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

              {/* Three-panel summary: Raw Scanner | External Intel | THAMOS Verdict */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

                {/* Raw Scanner Risk */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Raw Scanner Risk</div>
                  <div className={`text-4xl font-bold text-${getRiskColor(currentAnalysis.risk_level)}-400 leading-none mb-1`}>
                    {currentAnalysis.risk_score}
                  </div>
                  <div className={`text-sm font-semibold text-${getRiskColor(currentAnalysis.risk_level)}-400 uppercase mb-3`}>
                    {currentAnalysis.risk_level}
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                    scannerClassification === 'CONFIRMED_MALICIOUS' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : scannerClassification === 'MIXED' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    : 'bg-slate-700/50 text-slate-400 border-slate-600/30'
                  }`}>
                    {scannerClassification === 'CONFIRMED_MALICIOUS' ? 'Confirmed Malicious'
                     : scannerClassification === 'MIXED' ? 'Mixed Evidence'
                     : 'Capability-Based'}
                  </span>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-900/40 rounded p-1.5 text-center">
                      <div className="text-sm font-bold text-white">{findings.length}</div>
                      <div className="text-[9px] text-slate-500">Findings</div>
                    </div>
                    <div className="bg-slate-900/40 rounded p-1.5 text-center">
                      <div className="text-sm font-bold text-white">{iocs.length}</div>
                      <div className="text-[9px] text-slate-500">IOCs</div>
                    </div>
                    <div className="bg-slate-900/40 rounded p-1.5 text-center">
                      <div className="text-sm font-bold text-white">{otherBehaviorFlags.length}</div>
                      <div className="text-[9px] text-slate-500">Behavior</div>
                    </div>
                    <div className="bg-slate-900/40 rounded p-1.5 text-center">
                      <div className="text-sm font-bold text-white">{currentAnalysis.obfuscation_score || 0}</div>
                      <div className="text-[9px] text-slate-500">Obfuscation</div>
                    </div>
                  </div>
                </div>

                {/* External Intel */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">External Intel</div>
                    {crxData?.share_url && (
                      <a href={crxData.share_url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-slate-600 hover:text-teal-400 transition-colors flex items-center gap-0.5">
                        CRXplorer <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  {crxData ? (
                    <>
                      <div className="text-4xl font-bold text-white leading-none mb-1">{crxData.overall_score ?? '—'}</div>
                      <div className={`text-sm font-semibold uppercase mb-3 ${
                        crxData.risk_level === 'Critical' ? 'text-red-400'
                        : crxData.risk_level === 'High' ? 'text-orange-400'
                        : crxData.risk_level === 'Medium' ? 'text-amber-400'
                        : 'text-green-400'
                      }`}>{crxData.risk_level}</div>
                      {crxData.should_use !== null && (
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border mb-3 ${
                          crxData.should_use
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                          {crxData.should_use ? '✓ Recommended' : '✗ Not Recommended'}
                        </span>
                      )}
                      {(crxData.reasoning as any[])?.length > 0 && (
                        <ul className="space-y-1 mt-1">
                          {(crxData.reasoning as any[]).slice(0, 3).map((r: any, i: number) => (
                            <li key={i} className="text-[10px] text-slate-400 flex items-start gap-1">
                              <span className="text-teal-500 flex-shrink-0 mt-0.5">›</span>
                              {typeof r === 'string' ? r : r?.text ?? ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <div className="text-slate-500 text-sm mt-2">No external data available</div>
                  )}
                </div>

                {/* THAMOS Verdict */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Thamos Verdict</span>
                    </div>
                    {/* small re-run button shown only after a verdict exists */}
                    {verdict && !verdictLoading && (
                      <button onClick={runThamosVerdict}
                        className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                        Re-run
                      </button>
                    )}
                  </div>

                  {!verdict && !verdictLoading && !verdictError && (
                    <div className="flex flex-col items-center py-3 gap-3">
                      <T6Orb state="idle" size={44} />
                      <span className="text-[10px] text-slate-500">Awaiting analysis</span>
                      <button
                        onClick={runThamosVerdict}
                        className="w-full px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-semibold rounded-lg border border-cyan-500/30 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Brain className="w-3.5 h-3.5" />
                        Run THAMOS Analysis
                      </button>
                    </div>
                  )}
                  {verdictLoading && (
                    <div className="flex flex-col items-center py-3 gap-2">
                      <T6Orb state="thinking" size={44} />
                      <span className="text-[10px] text-slate-400 font-mono tracking-wider">Analyzing...</span>
                    </div>
                  )}
                  {verdictError && !verdictLoading && (
                    <div className="text-red-400 text-xs flex items-start gap-1.5 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{verdictError}</span>
                    </div>
                  )}
                  {verdict && !verdictLoading && (
                    <div className="flex flex-col items-center text-center gap-1">
                      <T6Orb state={verdictOrbState} size={44} />
                      <div className={`text-base font-bold text-${getVerdictColor(verdict.verdict)}-400 mt-1`}>
                        {formatVerdict(verdict.verdict)}
                      </div>
                      <div className="text-[10px] text-slate-500">{verdict.confidence} CONFIDENCE</div>
                      {verdict.admin_action && (
                        <span className={`mt-1 inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-${getAdminActionColor(verdict.admin_action)}-500/20 text-${getAdminActionColor(verdict.admin_action)}-400 border border-${getAdminActionColor(verdict.admin_action)}-500/30`}>
                          {formatAdminAction(verdict.admin_action)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Why They Differ — full width below three panels */}
              {verdict?.why_verdict_differs && (
                <div className="mb-4 px-4 py-3 bg-slate-800/30 border border-slate-700/50 rounded-lg">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Why They Differ</div>
                  <p className="text-sm text-slate-300 leading-relaxed">{verdict.why_verdict_differs}</p>
                </div>
              )}

              {/* Full verdict details */}
              {verdict && !verdictLoading && (
                <div className="mb-6 space-y-3">
                  {verdict.top_concerns && verdict.top_concerns.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Top Concerns</div>
                      <div className="space-y-2">
                        {verdict.top_concerns.map((concern, i) => (
                          <div key={i} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                concern.type === 'CONFIRMED_BEHAVIOR' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                : concern.type === 'CAPABILITY_RISK' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                : concern.type === 'CONTEXTUAL_FALSE_POSITIVE' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                : concern.type === 'EXTERNAL_REPUTATION_SIGNAL' ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              }`}>
                                {concern.type.replace(/_/g, ' ')}
                              </span>
                              <span className={`text-[10px] font-bold ${
                                concern.severity === 'CRITICAL' ? 'text-red-400'
                                : concern.severity === 'HIGH' ? 'text-orange-400'
                                : concern.severity === 'MEDIUM' ? 'text-amber-400'
                                : 'text-slate-400'
                              }`}>{concern.severity}</span>
                              <span className="text-xs font-medium text-white">{concern.title}</span>
                            </div>
                            <p className="text-xs text-slate-400">{concern.evidence}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {verdict.positive_signals && verdict.positive_signals.length > 0 && (
                      <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                        <div className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-2">Positive Signals</div>
                        <ul className="space-y-1">
                          {verdict.positive_signals.map((s, i) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                              <span className="text-green-400 flex-shrink-0">✓</span>{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {verdict.watch_items && verdict.watch_items.length > 0 && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                        <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2">Watch Items</div>
                        <ul className="space-y-1">
                          {verdict.watch_items.map((w, i) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                              <span className="text-amber-400 flex-shrink-0">›</span>{w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {(verdict.purpose_fit || verdict.recommendation) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {verdict.purpose_fit && (
                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Purpose Fit</div>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              verdict.purpose_fit.rating === 'STRONG' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : verdict.purpose_fit.rating === 'PARTIAL' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : verdict.purpose_fit.rating === 'WEAK' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                              : 'bg-slate-700/50 text-slate-400 border-slate-600/30'
                            }`}>{verdict.purpose_fit.rating}</span>
                          </div>
                          <p className="text-xs text-slate-400">{verdict.purpose_fit.reasoning}</p>
                        </div>
                      )}
                      {verdict.recommendation && (
                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Recommendation</div>
                          <p className="text-xs text-slate-300">{verdict.recommendation}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {verdict.ioc_highlights && verdict.ioc_highlights.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Key IOCs</div>
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

              {/* CRXplorer category justifications — collapsible */}
              {crxData?.category_justifications && Object.keys(crxData.category_justifications as object).length > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowCrxJustifications(!showCrxJustifications)}
                    className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-teal-400 transition-colors mb-2"
                  >
                    <Database className="w-3 h-3" />
                    CRXplorer Category Analysis
                    {showCrxJustifications ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showCrxJustifications && (
                    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 space-y-2">
                      {Object.entries(crxData.category_justifications as Record<string, any>).map(([cat, just]) => (
                        <div key={cat} className="border-b border-slate-700/30 pb-2 last:border-0 last:pb-0">
                          <div className="text-[10px] font-bold text-teal-400/70 uppercase mb-0.5">{cat.replace(/_/g, ' ')}</div>
                          <p className="text-xs text-slate-400">{typeof just === 'string' ? just : JSON.stringify(just)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {theme !== 'desktop' && (
                <div ref={tabStripRef} className="border-b border-slate-700 mb-6">
                  <div className="flex gap-4">
                    <button
                      onClick={() => { setActiveTab('findings'); tabStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}
                      className={`pb-3 px-2 font-medium transition-all border-b-2 ${
                        activeTab === 'findings'
                          ? 'border-cyan-500 text-cyan-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      Findings ({findings.length})
                    </button>
                    <button
                      onClick={() => { setActiveTab('iocs'); tabStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}
                      className={`pb-3 px-2 font-medium transition-all border-b-2 ${
                        activeTab === 'iocs'
                          ? 'border-cyan-500 text-cyan-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      IOCs ({iocs.length})
                    </button>
                    <button
                      onClick={() => { setActiveTab('behavior'); tabStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}
                      className={`pb-3 px-2 font-medium transition-all border-b-2 ${
                        activeTab === 'behavior'
                          ? 'border-cyan-500 text-cyan-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      Behavior ({otherBehaviorFlags.length})
                    </button>
                    <button
                      onClick={() => { setActiveTab('files'); tabStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}
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
                <div>
                  {iocs.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-800/30 rounded-lg border border-slate-800">
                      No Indicators of Compromise detected in the source code.
                    </div>
                  ) : (
                    <IOCEnrichment iocs={iocs} />
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

