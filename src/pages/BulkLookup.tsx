import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Download, AlertTriangle, Info, Pencil, Layers, ListChecks, GitBranch, Grid3x3, FileText } from 'lucide-react';
import { bulkLookupIPs, isValidIP } from '../lib/threatIntel';
import type { BulkIPResult } from '../types';
import { palette, typography } from '../design-system/tokens';
import { Callout, ResultCard, SectionHeader } from '../components/results';
import { BulkTriageView } from '../components/bulk/BulkTriageView';
import { CorrelationMap } from '../components/bulk/CorrelationMap';
import { BatchReport } from '../components/bulk/BatchReport';

type WorkbenchTab = 'triage' | 'correlation' | 'evidence' | 'report';

interface BulkLookupProps {
  /** Pre-fill (and auto-run) with IPs handed off from another surface, e.g. the Terminal's `scan -ip a,b,c`. */
  initialIPs?: string[];
  /** Drill into a single IP's full scan (hostname, VPN/Tor detail, abuse reports, pivot graph, etc).
   *  Wired to open an ip-result window (Desktop) or navigate to the scanner page (Tactical).
   *  Passes the persisted artifactId (if the bulk scan wrote one) so the destination can open
   *  the stored artifact instantly instead of re-running the whole scan pipeline. */
  onDrillDown?: (ip: string, artifactId?: string) => void;
}

export default function BulkLookup({ initialIPs, onDrillDown }: BulkLookupProps = {}) {
  const [input, setInput] = useState(() => initialIPs?.join('\n') ?? '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BulkIPResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Once a batch renders, collapse the input drawer so the page lands on the
  // results instead of leaving the user staring at the form with no cue to
  // scroll down.
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('triage');
  const [triageFocusIPs, setTriageFocusIPs] = useState<string[] | null>(null);
  const autoRanFor = useRef<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const parseIPs = (text: string): string[] => {
    const lines = text.split(/[\n,;]+/);
    const ips: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && isValidIP(trimmed)) {
        ips.push(trimmed);
      }
    }

    return [...new Set(ips)];
  };

  const runLookup = async (ips: string[]) => {
    if (ips.length === 0) {
      setError('Please enter at least one valid IP address');
      return;
    }

    if (ips.length > 20) {
      setError('Maximum 20 IPs allowed per request');
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await bulkLookupIPs(ips);
      setResults(data.results);
      setInputCollapsed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lookup IPs');
      setInputCollapsed(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runLookup(parseIPs(input));
  };

  // Auto-run once when handed a fresh list of IPs from another surface
  // (Terminal bulk `scan`), so the user doesn't have to click Analyze again.
  useEffect(() => {
    if (!initialIPs || initialIPs.length === 0) return;
    const key = initialIPs.join(',');
    if (autoRanFor.current === key) return;
    autoRanFor.current = key;
    void runLookup(parseIPs(initialIPs.join('\n')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIPs]);

  // Land on the results, not the input form — nothing on the page otherwise
  // hints that there's anything to scroll to below the fold.
  useEffect(() => {
    if (!loading && results.length > 0) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading, results]);

  const handleExportCSV = () => {
    if (results.length === 0) return;

    const headers = ['IP', 'Threat Score', 'Is Malicious', 'Country', 'City', 'ISP', 'Proxy', 'Hosting', 'Abuse Confidence', 'In ThreatFox', 'In URLhaus', 'Mass Scanner', 'GreyNoise Class', 'Spamhaus Listed', 'Spamhaus Lists'];
    const rows = results.map(r => [
      r.ip,
      r.scoring?.calibrated ?? r.threatScore,
      r.isMalicious ? 'Yes' : 'No',
      r.country ?? 'N/A',
      r.city ?? 'N/A',
      r.isp ?? 'N/A',
      r.isProxy ? 'Yes' : 'No',
      r.isHosting ? 'Yes' : 'No',
      r.abuseConfidence ?? 'N/A',
      r.inThreatFox ? 'Yes' : 'No',
      r.inURLhaus ? 'Yes' : 'No',
      r.isMassScanner ? 'Yes' : 'No',
      r.greynoiseClassification ?? 'N/A',
      r.spamhausListed ? 'Yes' : 'No',
      r.spamhausLists?.join('; ') ?? 'N/A'
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threat-intel-bulk-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = parseIPs(input).length;
  const batchId = results[0]?.batchId;

  const openClusterInTriage = (ips: string[]) => {
    setTriageFocusIPs(ips);
    setActiveTab('triage');
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: palette.void, fontFamily: typography.ui }}>
      <header
        className="h-12 flex items-center justify-between px-6 shrink-0"
        style={{ backgroundColor: palette.base, borderBottom: `1px solid ${palette.borderSubtle}` }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold" style={{ color: palette.textPrimary }}>Bulk IP Lookup</h1>
          <span className="text-[11px]" style={{ color: palette.textTertiary }}>Up to 20 IPs per batch</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: palette.textTertiary }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: palette.green }} />
          Engine online
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {inputCollapsed && results.length > 0 && !loading ? (
            <div
              className="max-w-3xl flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg"
              style={{ background: palette.elevated, border: `1px solid ${palette.borderDefault}` }}
            >
              <div className="flex items-center gap-2 text-sm" style={{ color: palette.textSecondary }}>
                <Layers className="w-4 h-4" style={{ color: palette.textTertiary }} />
                IP list · <span className="font-semibold" style={{ color: palette.textPrimary }}>{results.length}</span> addresses analyzed
              </div>
              <button
                onClick={() => setInputCollapsed(false)}
                className="h-7 px-3 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors hover:brightness-125"
                style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}
              >
                <Pencil className="w-3 h-3" />
                Edit list
              </button>
            </div>
          ) : (
            <>
              <div className="max-w-3xl">
                <h2 className="text-2xl font-semibold mb-1" style={{ color: palette.textPrimary }}>Triage a list of IPs</h2>
                <p className="text-sm" style={{ color: palette.textSecondary }}>
                  Paste addresses from logs or an alert export — one per line, or comma/semicolon separated.
                  Each IP runs through the same calibrated scoring engine as a single-IP scan.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="max-w-3xl">
                <div
                  className="rounded-lg overflow-hidden transition-colors duration-200"
                  style={{
                    background: palette.elevated,
                    border: `1px solid ${input.trim() ? palette.borderActive : palette.borderDefault}`,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
                  }}
                >
                  <div
                    className="px-5 py-3 flex items-center justify-between"
                    style={{ backgroundColor: palette.surface, borderBottom: `1px solid ${palette.borderSubtle}` }}
                  >
                    <span className="text-xs font-medium" style={{ color: palette.textSecondary }}>IP list</span>
                    <span className="text-[10px]" style={{ color: palette.textTertiary }}>{validCount} valid / max 20</span>
                  </div>
                  <div className="p-5">
                    <textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder={'192.168.1.1\n10.0.0.1\n8.8.8.8'}
                      rows={8}
                      spellCheck={false}
                      className="w-full bg-transparent border-none outline-none resize-none text-sm focus:ring-0"
                      style={{ color: palette.textPrimary, caretColor: palette.accent, fontFamily: typography.mono }}
                    />
                    <div
                      className="mt-4 pt-4 flex items-center justify-between flex-wrap gap-3"
                      style={{ borderTop: `1px solid ${palette.borderSubtle}` }}
                    >
                      <div className="flex items-center gap-2 text-xs" style={{ color: palette.textTertiary }}>
                        <Info className="w-3.5 h-3.5" />
                        Maximum 20 IPs per request
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="h-9 px-4 rounded-md flex items-center gap-2 text-xs font-semibold transition-opacity disabled:opacity-50"
                        style={{ backgroundColor: palette.accent, color: palette.void }}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Scanning…
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            Analyze IPs
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </>
          )}

          {error && (
            <div className="max-w-3xl">
              <Callout icon={<AlertTriangle className="w-4 h-4" />} title="Lookup failed" detail={error} tone="danger" />
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-4" ref={resultsRef}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-1">
                  {([
                    { key: 'triage' as const, label: 'Triage', icon: ListChecks },
                    { key: 'correlation' as const, label: 'Correlation', icon: GitBranch },
                    { key: 'evidence' as const, label: 'Evidence', icon: Grid3x3 },
                    { key: 'report' as const, label: 'Report', icon: FileText },
                  ]).map(t => (
                    <button
                      key={t.key}
                      onClick={() => { setActiveTab(t.key); if (t.key !== 'triage') setTriageFocusIPs(null); }}
                      className="px-3.5 py-2 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors"
                      style={{
                        color: activeTab === t.key ? palette.textPrimary : palette.textTertiary,
                        background: activeTab === t.key ? palette.float : 'transparent',
                        border: `1px solid ${activeTab === t.key ? palette.borderActive : 'transparent'}`,
                      }}
                    >
                      <t.icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleExportCSV}
                  className="h-8 px-3 rounded-md flex items-center gap-2 text-xs font-medium shrink-0 transition-colors hover:brightness-125"
                  style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              {activeTab === 'triage' && (
                <BulkTriageView
                  results={results}
                  onDrillDown={onDrillDown}
                  focusIPs={triageFocusIPs}
                  onClearFocus={() => setTriageFocusIPs(null)}
                />
              )}

              {activeTab === 'correlation' && (
                <CorrelationMap results={results} onDrillDown={onDrillDown} onViewInTriage={openClusterInTriage} />
              )}

              {activeTab === 'evidence' && (
                <ResultCard>
                  <SectionHeader title="Evidence matrix — coming next" />
                  <p className="text-sm mt-2" style={{ color: palette.textSecondary }}>
                    A source-by-IP matrix (detected / clear / unavailable / error per provider) needs one small backend
                    change first — persisting per-source status instead of just the aggregated flags bulk scans return
                    today. That's queued as the next fast-follow on top of this workbench.
                  </p>
                </ResultCard>
              )}

              {activeTab === 'report' && <BatchReport results={results} batchId={batchId} />}
            </div>
          )}

          {results.length === 0 && !loading && !error && (
            <div className="max-w-3xl">
              <ResultCard>
                <SectionHeader title="Sources checked per IP" />
                <p className="text-sm mt-2 mb-4" style={{ color: palette.textSecondary }}>
                  Bulk lookups run the same source set as a single-IP scan — location, VPN/proxy detection,
                  and threat intel — through the calibrated scoring engine.
                </p>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {['IP-API', 'VirusTotal', 'ProxyCheck', 'AbuseIPDB', 'IPQualityScore', 'ThreatFox', 'URLhaus', 'GreyNoise', 'Spamhaus', 'Blocklist.de'].map(source => (
                    <div
                      key={source}
                      className="py-2.5 rounded-md text-center text-xs"
                      style={{ background: palette.float, border: `1px solid ${palette.borderSubtle}`, color: palette.textSecondary }}
                    >
                      {source}
                    </div>
                  ))}
                </div>
              </ResultCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
