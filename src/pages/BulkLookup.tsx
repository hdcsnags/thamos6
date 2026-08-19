import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Download, AlertTriangle, Info, MapPin, Server, Radio, Ban, Pencil, ArrowUpRight, Layers } from 'lucide-react';
import { bulkLookupIPs, isValidIP } from '../lib/threatIntel';
import type { BulkIPResult } from '../types';
import { palette, typography } from '../design-system/tokens';
import { Pill, Callout, ResultCard, StatCell, SectionHeader, type Tone, toneColor, toneBg } from '../components/results';

// Calibrated verdict → tone, matching the single-IP result page's mapping.
const VERDICT_TONE: Record<string, { label: string; tone: Tone }> = {
  malicious: { label: 'Malicious', tone: 'danger' },
  suspicious: { label: 'Suspicious', tone: 'warn' },
  low_signal: { label: 'Low signal', tone: 'accent' },
  no_signal: { label: 'No signal', tone: 'good' },
};

function verdictFor(result: BulkIPResult): { label: string; tone: Tone } {
  if (result.scoring) return VERDICT_TONE[result.scoring.verdict] ?? VERDICT_TONE.no_signal;
  return result.isMalicious ? VERDICT_TONE.malicious : VERDICT_TONE.no_signal;
}

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

  const maliciousCount = results.filter(r => r.isMalicious).length;
  const cleanCount = results.length - maliciousCount;
  const proxyCount = results.filter(r => r.isProxy || r.isHosting).length;
  const scannerCount = results.filter(r => r.isMassScanner).length;
  const blockedCount = results.filter(r => r.spamhausListed).length;
  const validCount = parseIPs(input).length;

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
        <div className="max-w-5xl mx-auto space-y-8">
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1">
                  <StatCell label="Malicious" value={maliciousCount} tone="danger" />
                  <StatCell label="Clean" value={cleanCount} tone="good" />
                  <StatCell label="Proxy / DC" value={proxyCount} tone="warn" />
                  <StatCell label="Scanners" value={scannerCount} tone="warn" />
                  <StatCell label="Blocklisted" value={blockedCount} tone="danger" />
                </div>
                <button
                  onClick={handleExportCSV}
                  className="h-9 px-3.5 rounded-md flex items-center gap-2 text-xs font-medium shrink-0 transition-colors hover:brightness-125"
                  style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              <div className="rounded-lg overflow-hidden" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${palette.borderDefault}` }}>
                        {['Verdict', 'IP address', 'Location', 'Type', 'Score', 'Scanner', 'Blocklist', 'Intel', ''].map(h => (
                          <th
                            key={h || 'actions'}
                            className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider whitespace-nowrap"
                            style={{ color: palette.textTertiary }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result, idx) => {
                        const verdict = verdictFor(result);
                        const score = result.scoring?.calibrated ?? result.threatScore;
                        return (
                          <tr
                            key={idx}
                            style={{
                              borderTop: idx === 0 ? 'none' : `1px solid ${palette.borderSubtle}`,
                              background: verdict.tone === 'danger' ? toneBg('danger', 0.05) : 'transparent',
                            }}
                          >
                            <td className="px-3 py-2.5"><Pill label={verdict.label} tone={verdict.tone} /></td>
                            <td className="px-3 py-2.5">
                              <span className="text-sm" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>
                                {result.ip}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              {result.country ? (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                                  <span className="text-sm whitespace-nowrap" style={{ color: palette.textSecondary }}>
                                    {result.city && `${result.city}, `}{result.countryCode || result.country}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm" style={{ color: palette.textDisabled }}>Unknown</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                {result.isTor && <Pill label="Tor" tone="danger" />}
                                {result.isVPN && <Pill label={result.vpnService ? `VPN · ${result.vpnService}` : 'VPN'} tone="warn" />}
                                {result.isProxy && <Pill label="Proxy" tone="warn" />}
                                {result.isHosting && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                                    style={{ color: palette.blue, background: toneBg('accent', 0.1), border: `1px solid ${palette.blue}40` }}
                                  >
                                    <Server className="w-3 h-3" /> DC
                                  </span>
                                )}
                                {!result.isTor && !result.isVPN && !result.isProxy && !result.isHosting && (
                                  <span className="text-xs" style={{ color: palette.textDisabled }}>—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5" title={result.scoring?.legacyDivergence ?? undefined}>
                              <span
                                className="text-sm font-semibold tabular-nums"
                                style={{ color: toneColor[verdict.tone] }}
                              >
                                {score}
                              </span>
                              {result.abuseConfidence != null && result.abuseConfidence > 0 && (
                                <div className="text-[10px] whitespace-nowrap" style={{ color: palette.textTertiary }}>
                                  {result.abuseConfidence}% abuse conf.
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {result.isMassScanner ? (
                                <div className="flex items-center gap-1.5">
                                  <Radio
                                    className="w-3.5 h-3.5"
                                    style={{
                                      color: result.greynoiseClassification === 'malicious'
                                        ? palette.rose
                                        : result.greynoiseClassification === 'benign'
                                          ? palette.green
                                          : palette.amber,
                                    }}
                                  />
                                  <span
                                    className="text-xs font-medium"
                                    style={{
                                      color: result.greynoiseClassification === 'malicious'
                                        ? palette.rose
                                        : result.greynoiseClassification === 'benign'
                                          ? palette.green
                                          : palette.amber,
                                    }}
                                  >
                                    {result.greynoiseClassification || 'unknown'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs" style={{ color: palette.textDisabled }}>—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {result.spamhausListed ? (
                                <div className="flex items-center gap-1.5" title={result.spamhausLists?.join(', ')}>
                                  <Ban className="w-3.5 h-3.5" style={{ color: palette.rose }} />
                                  <span className="text-xs font-medium" style={{ color: palette.rose }}>
                                    {result.spamhausLists?.length || 1}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs" style={{ color: palette.green }}>Clean</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                {result.inThreatFox && <Pill label="TF" tone="danger" />}
                                {result.inURLhaus && <Pill label="UH" tone="danger" />}
                                {!result.inThreatFox && !result.inURLhaus && (
                                  <span className="text-xs" style={{ color: palette.green }}>—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              {onDrillDown && (
                                <button
                                  onClick={() => onDrillDown(result.ip, result.artifactId ?? undefined)}
                                  title={`Open the saved scan report for ${result.ip} — hostname, full VPN/Tor detail, abuse reports, pivot graph`}
                                  className="h-7 px-2.5 rounded-md flex items-center gap-1 text-xs font-medium whitespace-nowrap transition-colors hover:brightness-125"
                                  style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.accent }}
                                >
                                  Open report
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
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
