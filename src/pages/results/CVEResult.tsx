import { useEffect, useState, useRef } from 'react';
import {
  ShieldAlert, AlertTriangle, Target, FileJson, Scale, Copy, Check,
  ExternalLink, Flame, Calendar, Bug, Activity, Gauge,
} from 'lucide-react';
import { lookupCVE } from '../../lib/threatIntel';
import type { CVELookupResult } from '../../types';

interface CVEResultProps {
  cve: string;
}

type MenuItem = 'overview' | 'scoring' | 'references' | 'raw';

/** Map a CVSS severity / base score to the tactical palette. */
function severityStyle(severity: string | null, score: number | null): { label: string; text: string; bg: string; border: string } {
  const s = (severity || '').toUpperCase();
  const byScore = score == null ? '' : score >= 9 ? 'CRITICAL' : score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW';
  const level = s || byScore || 'UNKNOWN';
  switch (level) {
    case 'CRITICAL':
      return { label: 'CRITICAL', text: 'text-rose-400', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.35)' };
    case 'HIGH':
      return { label: 'HIGH', text: 'text-orange-400', bg: 'rgba(251, 146, 60, 0.12)', border: 'rgba(251, 146, 60, 0.35)' };
    case 'MEDIUM':
      return { label: 'MEDIUM', text: 'text-amber-400', bg: 'rgba(251, 191, 36, 0.10)', border: 'rgba(251, 191, 36, 0.30)' };
    case 'LOW':
      return { label: 'LOW', text: 'text-emerald-400', bg: 'rgba(16, 185, 129, 0.10)', border: 'rgba(16, 185, 129, 0.30)' };
    default:
      return { label: 'UNSCORED', text: 'text-slate-400', bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.20)' };
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export default function CVEResult({ cve }: CVEResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CVELookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const [copiedSummary, setCopiedSummary] = useState(false);
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
        const data = await lookupCVE(cve);
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Failed to lookup CVE');
      } finally {
        setLoading(false);
      }
    };
    performLookup();
  }, [cve]);

  const copySummary = () => {
    if (!result) return;
    const sev = severityStyle(result.cvss_v3_severity, result.cvss_v3_score);
    const epss = result.epss_score != null ? `${(result.epss_score * 100).toFixed(2)}%` : 'n/a';
    const summary = [
      `CVE: ${result.cve_id}`,
      `Severity: ${sev.label}${result.cvss_v3_score != null ? ` (CVSS ${result.cvss_v3_score})` : ''}`,
      `KEV (actively exploited): ${result.is_kev ? 'YES' : 'no'}`,
      `EPSS (exploit probability): ${epss}`,
      result.cwe ? `Weakness: ${result.cwe}` : '',
      `Threat score: ${result.overall_threat_score}/100`,
      result.description ? `\n${result.description}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  if (loading && !result) {
    return (
      <div ref={containerRef} className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 uppercase tracking-wider text-sm">Correlating NVD · CISA KEV · EPSS...</p>
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

  const sev = severityStyle(result.cvss_v3_severity, result.cvss_v3_score);
  const epssPct = result.epss_score != null ? result.epss_score * 100 : null;
  const epssPercentile = result.epss_percentile != null ? result.epss_percentile * 100 : null;

  const menuItems = [
    { id: 'overview' as MenuItem, label: 'Overview', icon: Target },
    { id: 'scoring' as MenuItem, label: 'Scoring', icon: Scale },
    { id: 'references' as MenuItem, label: 'References', icon: ExternalLink },
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
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white font-mono mb-2 break-all"
                  style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>
                {result.cve_id}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${sev.text}`}
                      style={{ background: sev.bg, borderColor: sev.border }}>
                  {sev.label}{result.cvss_v3_score != null ? ` · CVSS ${result.cvss_v3_score}` : ''}
                </span>
                {result.is_kev && (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1.5">
                    <Flame className="w-3 h-3" /> Actively Exploited (KEV)
                  </span>
                )}
                <span className="text-slate-500 text-sm">•</span>
                <span className="text-slate-400 text-sm">Threat Score: {result.overall_threat_score}/100</span>
              </div>
            </div>
            <button
              onClick={copySummary}
              className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border bg-slate-800/50 text-slate-300 border-slate-700/50 hover:bg-slate-700/50 flex items-center gap-2"
            >
              {copiedSummary ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              COPY SUMMARY
            </button>
          </div>

          {activeMenu === 'overview' && (
            <div className="space-y-6">
              {/* KEV alert banner */}
              {result.is_kev && (
                <div className="p-5 rounded-xl flex items-start gap-4" style={{ background: 'rgba(244, 63, 94, 0.10)', border: '1px solid rgba(244, 63, 94, 0.35)' }}>
                  <ShieldAlert className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-rose-400 font-bold uppercase tracking-wider text-sm mb-1">On CISA Known Exploited Vulnerabilities catalog</h3>
                    <p className="text-slate-300 text-sm">
                      This CVE is confirmed exploited in the wild. Prioritize patching.
                      {result.kev_date_added && <> Added {formatDate(result.kev_date_added)}.</>}
                      {result.kev_due_date && <> Federal remediation due {formatDate(result.kev_due_date)}.</>}
                    </p>
                    {result.kev_ransomware_use && result.kev_ransomware_use.toLowerCase() !== 'unknown' && (
                      <p className="text-rose-300 text-sm mt-1 font-medium">Known ransomware campaign use: {result.kev_ransomware_use}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Bug className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Description</h3>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{result.description || 'No description available from NVD.'}</p>
                {result.cwe && (
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <span className="text-xs text-slate-500 uppercase tracking-wider">Weakness</span>
                    <span className="text-sm text-cyan-300 font-medium">{result.cwe}</span>
                  </div>
                )}
              </div>

              {/* Quick facts grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Gauge} label="CVSS v3" value={result.cvss_v3_score != null ? String(result.cvss_v3_score) : '—'} sub={sev.label} />
                <StatCard icon={Activity} label="EPSS" value={epssPct != null ? `${epssPct.toFixed(1)}%` : '—'} sub={epssPercentile != null ? `top ${(100 - epssPercentile).toFixed(0)}%` : 'exploit prob.'} />
                <StatCard icon={Flame} label="In KEV" value={result.is_kev ? 'YES' : 'No'} sub={result.is_kev ? 'exploited' : 'not listed'} danger={result.is_kev} />
                <StatCard icon={Calendar} label="Published" value={formatDate(result.published)} sub={result.vuln_status || ''} />
              </div>
            </div>
          )}

          {activeMenu === 'scoring' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Scale className="w-6 h-6 text-cyan-400" /> Severity & Exploitation
              </h2>

              {/* CVSS */}
              <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">CVSS — how severe if exploited</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className={`text-4xl font-black tabular-nums ${sev.text}`}>{result.cvss_v3_score ?? '—'}</div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">CVSS v3.1 · {sev.label}</div>
                  </div>
                  <div>
                    <div className="text-4xl font-black tabular-nums text-slate-400">{result.cvss_v2_score ?? '—'}</div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">CVSS v2 (legacy)</div>
                  </div>
                </div>
              </div>

              {/* EPSS */}
              <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">EPSS — probability of exploitation in the next 30 days</h3>
                {epssPct != null ? (
                  <>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-black tabular-nums text-amber-400">{epssPct.toFixed(2)}%</span>
                      {epssPercentile != null && (
                        <span className="text-sm text-slate-400">more likely than {epssPercentile.toFixed(0)}% of all CVEs</span>
                      )}
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(epssPct, 100)}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm">No EPSS score available for this CVE.</p>
                )}
              </div>

              {/* Composite threat score */}
              <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">THAMOS composite threat score</h3>
                <div className="text-4xl font-black tabular-nums text-cyan-400">{result.overall_threat_score}<span className="text-lg text-slate-600">/100</span></div>
                <p className="text-xs text-slate-500 mt-2">Blends CVSS severity, KEV status, and EPSS exploitation probability into a single triage number.</p>
              </div>
            </div>
          )}

          {activeMenu === 'references' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ExternalLink className="w-6 h-6 text-cyan-400" /> References ({result.references.length})
              </h2>
              {result.references.length > 0 ? (
                <div className="space-y-2">
                  {result.references.map((ref, idx) => (
                    <a
                      key={idx}
                      href={ref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-lg bg-slate-900/50 border border-slate-700/50 hover:border-cyan-500/40 hover:bg-slate-800/50 transition-all group"
                    >
                      <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 flex-shrink-0" />
                      <span className="text-sm text-slate-300 font-mono break-all group-hover:text-cyan-300">{ref}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No references provided by NVD.</p>
              )}
            </div>
          )}

          {activeMenu === 'raw' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FileJson className="w-6 h-6 text-cyan-400" /> Raw JSON Data
              </h2>
              <div className="p-6 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <pre className="text-xs text-slate-300 overflow-auto max-h-[600px] font-mono">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, danger }: { icon: any; label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="p-4 rounded-xl" style={{
      background: danger ? 'rgba(244, 63, 94, 0.10)' : 'rgba(0, 0, 0, 0.3)',
      border: danger ? '1px solid rgba(244, 63, 94, 0.30)' : '1px solid rgba(148, 163, 184, 0.1)',
    }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${danger ? 'text-rose-400' : 'text-cyan-400'}`} />
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${danger ? 'text-rose-400' : 'text-white'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{sub}</div>}
    </div>
  );
}
