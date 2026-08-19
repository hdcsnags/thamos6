import { useMemo, useState } from 'react';
import { ArrowUpRight, Ban, MapPin, Radio, Server, X } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { Pill, toneColor, toneBg } from '../results';
import type { BulkIPResult } from '../../types';
import { verdictFor } from './verdict';

type QuickFilter = 'all' | 'malicious' | 'suspicious' | 'clean' | 'vpn' | 'tor';

interface BulkTriageViewProps {
  results: BulkIPResult[];
  onDrillDown?: (ip: string, artifactId?: string) => void;
  /** A subset of IPs to focus on (e.g. drilled in from a Correlation cluster). Clearable. */
  focusIPs?: string[] | null;
  onClearFocus?: () => void;
}

function ScoreGauge({ score, tone }: { score: number; tone: 'good' | 'warn' | 'danger' | 'accent' | 'neutral' }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = toneColor[tone];
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="shrink-0">
      <circle cx={28} cy={28} r={r} fill="none" stroke={palette.float} strokeWidth={4} />
      <circle
        cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text x={28} y={32} textAnchor="middle" fontSize={14} fontWeight={700} fill={color} fontFamily={typography.mono}>{score}</text>
    </svg>
  );
}

export function BulkTriageView({ results, onDrillDown, focusIPs, onClearFocus }: BulkTriageViewProps) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [selectedIP, setSelectedIP] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { malicious: 0, suspicious: 0, clean: 0, vpn: 0, tor: 0 };
    for (const r of results) {
      const v = verdictFor(r).tone;
      if (v === 'danger') c.malicious++;
      else if (v === 'warn') c.suspicious++;
      else c.clean++;
      if (r.isVPN) c.vpn++;
      if (r.isTor) c.tor++;
    }
    return c;
  }, [results]);

  const filtered = useMemo(() => {
    let rows = results;
    if (focusIPs) {
      const set = new Set(focusIPs);
      rows = rows.filter(r => set.has(r.ip));
    }
    if (quickFilter === 'all') return rows;
    if (quickFilter === 'vpn') return rows.filter(r => r.isVPN);
    if (quickFilter === 'tor') return rows.filter(r => r.isTor);
    return rows.filter(r => {
      const tone = verdictFor(r).tone;
      if (quickFilter === 'malicious') return tone === 'danger';
      if (quickFilter === 'suspicious') return tone === 'warn';
      return tone !== 'danger' && tone !== 'warn';
    });
  }, [results, focusIPs, quickFilter]);

  const selected = selectedIP ? results.find(r => r.ip === selectedIP) ?? null : null;

  const chips: { key: QuickFilter; n: number; label: string; color: string }[] = [
    { key: 'all', n: results.length, label: 'All IPs', color: palette.textSecondary },
    { key: 'malicious', n: counts.malicious, label: 'Malicious', color: palette.rose },
    { key: 'suspicious', n: counts.suspicious, label: 'Suspicious', color: palette.amber },
    { key: 'clean', n: counts.clean, label: 'Clean', color: palette.green },
    { key: 'vpn', n: counts.vpn, label: 'VPN / Proxy', color: palette.cyan },
    { key: 'tor', n: counts.tor, label: 'Tor exit', color: palette.pink },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3.5">
        {chips.map(c => (
          <button
            key={c.key}
            onClick={() => setQuickFilter(c.key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
            style={{
              background: quickFilter === c.key ? toneBg('accent', 0.08) : palette.base,
              border: `1px solid ${quickFilter === c.key ? palette.accent : palette.borderDefault}`,
            }}
          >
            <span className="text-base font-bold tabular-nums" style={{ color: c.color, fontFamily: typography.mono }}>{c.n}</span>
            <span className="text-[11px]" style={{ color: palette.textTertiary }}>{c.label}</span>
          </button>
        ))}
        {focusIPs && (
          <button
            onClick={onClearFocus}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium ml-auto"
            style={{ background: toneBg('accent', 0.1), border: `1px solid ${palette.accent}`, color: palette.accent }}
          >
            <X className="w-3 h-3" /> Showing {focusIPs.length} from cluster — clear
          </button>
        )}
      </div>

      <div className="flex gap-3.5">
        <div className="flex-1 min-w-0 rounded-lg overflow-hidden" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${palette.borderDefault}` }}>
                  {['Verdict', 'IP address', 'Location', 'Type', 'Score', 'Scanner', 'Blocklist', 'Intel', ''].map(h => (
                    <th key={h || 'actions'} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: palette.textTertiary }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((result, idx) => {
                  const verdict = verdictFor(result);
                  const score = result.scoring?.calibrated ?? result.threatScore;
                  return (
                    <tr
                      key={result.ip + idx}
                      onClick={() => setSelectedIP(result.ip)}
                      style={{
                        borderTop: idx === 0 ? 'none' : `1px solid ${palette.borderSubtle}`,
                        background: selectedIP === result.ip ? toneBg('accent', 0.06) : verdict.tone === 'danger' ? toneBg('danger', 0.05) : 'transparent',
                        boxShadow: selectedIP === result.ip ? `inset 2px 0 0 ${palette.accent}` : undefined,
                        cursor: 'pointer',
                      }}
                    >
                      <td className="px-3 py-2.5"><Pill label={verdict.label} tone={verdict.tone} /></td>
                      <td className="px-3 py-2.5">
                        <span className="text-sm" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{result.ip}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {result.country ? (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                            <span className="text-sm whitespace-nowrap" style={{ color: palette.textSecondary }}>
                              {result.city && `${result.city}, `}{result.countryCode || result.country}
                            </span>
                          </div>
                        ) : <span className="text-sm" style={{ color: palette.textDisabled }}>Unknown</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {result.isTor && <Pill label="Tor" tone="danger" />}
                          {result.isVPN && <Pill label={result.vpnService ? `VPN · ${result.vpnService}` : 'VPN'} tone="warn" />}
                          {result.isProxy && <Pill label="Proxy" tone="warn" />}
                          {result.isHosting && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style={{ color: palette.blue, background: toneBg('accent', 0.1), border: `1px solid ${palette.blue}40` }}>
                              <Server className="w-3 h-3" /> DC
                            </span>
                          )}
                          {!result.isTor && !result.isVPN && !result.isProxy && !result.isHosting && <span className="text-xs" style={{ color: palette.textDisabled }}>—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5" title={result.scoring?.legacyDivergence ?? undefined}>
                        <span className="text-sm font-semibold tabular-nums" style={{ color: toneColor[verdict.tone] }}>{score}</span>
                        {result.abuseConfidence != null && result.abuseConfidence > 0 && (
                          <div className="text-[10px] whitespace-nowrap" style={{ color: palette.textTertiary }}>{result.abuseConfidence}% abuse conf.</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {result.isMassScanner ? (
                          <div className="flex items-center gap-1.5">
                            <Radio className="w-3.5 h-3.5" style={{ color: result.greynoiseClassification === 'malicious' ? palette.rose : result.greynoiseClassification === 'benign' ? palette.green : palette.amber }} />
                            <span className="text-xs font-medium" style={{ color: result.greynoiseClassification === 'malicious' ? palette.rose : result.greynoiseClassification === 'benign' ? palette.green : palette.amber }}>
                              {result.greynoiseClassification || 'unknown'}
                            </span>
                          </div>
                        ) : <span className="text-xs" style={{ color: palette.textDisabled }}>—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {result.spamhausListed ? (
                          <div className="flex items-center gap-1.5" title={result.spamhausLists?.join(', ')}>
                            <Ban className="w-3.5 h-3.5" style={{ color: palette.rose }} />
                            <span className="text-xs font-medium" style={{ color: palette.rose }}>{result.spamhausLists?.length || 1}</span>
                          </div>
                        ) : <span className="text-xs" style={{ color: palette.green }}>Clean</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {result.inThreatFox && <Pill label="TF" tone="danger" />}
                          {result.inURLhaus && <Pill label="UH" tone="danger" />}
                          {!result.inThreatFox && !result.inURLhaus && <span className="text-xs" style={{ color: palette.green }}>—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {onDrillDown && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDrillDown(result.ip, result.artifactId ?? undefined); }}
                            title={`Open the saved scan report for ${result.ip}`}
                            className="h-7 px-2.5 rounded-md flex items-center gap-1 text-xs font-medium whitespace-nowrap transition-colors hover:brightness-125"
                            style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.accent }}
                          >
                            Open report <ArrowUpRight className="w-3 h-3" />
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

        {/* Inspector drawer — clicking a row surfaces this instead of navigating away. */}
        <div
          className="shrink-0 rounded-lg overflow-hidden transition-all duration-200"
          style={{ width: selected ? 320 : 0, background: palette.elevated, border: selected ? `1px solid ${palette.borderDefault}` : 'none' }}
        >
          {selected && (
            <div className="p-4 w-[320px]">
              <div className="flex items-start justify-between mb-1">
                <div className="text-base font-bold" style={{ fontFamily: typography.mono, color: palette.textPrimary }}>{selected.ip}</div>
                <button onClick={() => setSelectedIP(null)} style={{ color: palette.textTertiary }}><X className="w-4 h-4" /></button>
              </div>
              <div className="text-xs mb-3" style={{ color: palette.textTertiary }}>
                {selected.country ? `${selected.city ? selected.city + ', ' : ''}${selected.country}` : 'Unknown location'}
              </div>
              <div className="flex items-center gap-3 mb-1">
                <ScoreGauge score={selected.scoring?.calibrated ?? selected.threatScore} tone={verdictFor(selected).tone} />
                <div>
                  <Pill label={verdictFor(selected).label} tone={verdictFor(selected).tone} />
                </div>
              </div>

              <div className="mt-4 pt-3.5" style={{ borderTop: `1px solid ${palette.borderSubtle}` }}>
                <h4 className="text-[10.5px] font-semibold uppercase tracking-wide mb-2" style={{ color: palette.textTertiary }}>Network</h4>
                {[
                  ['Org / ISP', selected.org || selected.isp || '—'],
                  ['VPN', selected.isVPN ? (selected.vpnService || 'Yes') : 'No'],
                  ['Tor exit', selected.isTor ? 'Yes' : 'No'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 text-xs">
                    <span style={{ color: palette.textTertiary }}>{k}</span>
                    <span style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{v}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3.5 pt-3.5" style={{ borderTop: `1px solid ${palette.borderSubtle}` }}>
                <h4 className="text-[10.5px] font-semibold uppercase tracking-wide mb-2" style={{ color: palette.textTertiary }}>Abuse & blocklists</h4>
                <div className="flex justify-between py-1 text-xs">
                  <span style={{ color: palette.textTertiary }}>AbuseIPDB confidence</span>
                  <span style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{selected.abuseConfidence ?? 0}%</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {selected.spamhausListed && <span className="text-[10.5px] px-2 py-0.5 rounded-md" style={{ color: palette.rose, background: toneBg('danger', 0.1), border: `1px solid ${palette.rose}40` }}>Spamhaus</span>}
                  {selected.inThreatFox && <span className="text-[10.5px] px-2 py-0.5 rounded-md" style={{ color: palette.rose, background: toneBg('danger', 0.1), border: `1px solid ${palette.rose}40` }}>ThreatFox</span>}
                  {selected.inURLhaus && <span className="text-[10.5px] px-2 py-0.5 rounded-md" style={{ color: palette.rose, background: toneBg('danger', 0.1), border: `1px solid ${palette.rose}40` }}>URLhaus</span>}
                  {!selected.spamhausListed && !selected.inThreatFox && !selected.inURLhaus && <span className="text-[10.5px]" style={{ color: palette.textDisabled }}>No blocklist hits</span>}
                </div>
              </div>

              {onDrillDown && (
                <button
                  onClick={() => onDrillDown(selected.ip, selected.artifactId ?? undefined)}
                  className="w-full mt-4 h-8 rounded-md flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors hover:brightness-125"
                  style={{ background: palette.accent, color: palette.void }}
                >
                  Open full report <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
