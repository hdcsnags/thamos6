import { useMemo } from 'react';
import { ArrowUpRight, Grid3x3 } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { Callout, Pill, ResultCard, SectionHeader, toneColor } from '../results';
import { getSourceDisplayName } from '../../lib/threatIntel';
import type { BulkIPResult } from '../../types';
import { verdictFor } from './verdict';

interface BulkEvidenceMatrixProps {
  results: BulkIPResult[];
  onDrillDown?: (ip: string, artifactId?: string) => void;
}

type Cell = 'hit' | 'clear' | 'error' | 'not-run';

/** Providers that only ever add context (geo/ASN/VPN lookups) — a "clear" from them is not evidence. */
const CONTEXT_SOURCES = new Set(['ipapi', 'ipinfo', 'ip2proxy', 'proxycheck', 'vpn_provider', 'vpnapi', 'iphub', 'teamcymru', 'rdap', 'shodan']);

const CELL_STYLE: Record<Cell, { bg: string; fg: string; glyph: string; title: string }> = {
  hit: { bg: `${palette.rose}26`, fg: palette.rose, glyph: '●', title: 'Positive hit' },
  clear: { bg: palette.base, fg: palette.textTertiary, glyph: '·', title: 'Checked, no hit' },
  error: { bg: `${palette.amber}1f`, fg: palette.amber, glyph: '!', title: 'Provider error' },
  'not-run': { bg: 'transparent', fg: palette.textDisabled, glyph: '—', title: 'Not queried for this tier' },
};

function cellFor(r: BulkIPResult, source: string): Cell {
  const status = r.sourceStatus?.[source];
  if (!status) return 'not-run';
  if (!status.ok) return 'error';
  return r.sourceHits?.[source] === true ? 'hit' : 'clear';
}

/**
 * Source-by-IP matrix: one row per IP, one column per provider, so an analyst can
 * see at a glance which feeds actually fired, which were unavailable, and how
 * much of a batch verdict rests on a single provider.
 */
export function BulkEvidenceMatrix({ results, onDrillDown }: BulkEvidenceMatrixProps) {
  const hasStatus = results.some(r => r.sourceStatus && Object.keys(r.sourceStatus).length > 0);

  const { sources, coverage, errorCounts } = useMemo(() => {
    const seen = new Map<string, number>();
    const errors = new Map<string, number>();
    for (const r of results) {
      for (const [src, st] of Object.entries(r.sourceStatus ?? {})) {
        seen.set(src, (seen.get(src) ?? 0) + 1);
        if (!st.ok) errors.set(src, (errors.get(src) ?? 0) + 1);
      }
    }
    // Evidence sources first (sorted by hit count), context sources after.
    const hitCount = (src: string) => results.filter(r => r.sourceHits?.[src] === true).length;
    const sorted = [...seen.keys()].sort((a, b) => {
      const ca = CONTEXT_SOURCES.has(a) ? 1 : 0;
      const cb = CONTEXT_SOURCES.has(b) ? 1 : 0;
      if (ca !== cb) return ca - cb;
      return hitCount(b) - hitCount(a) || a.localeCompare(b);
    });
    const totalCells = results.length * sorted.length;
    const okCells = results.reduce((n, r) => n + Object.values(r.sourceStatus ?? {}).filter(s => s.ok).length, 0);
    return {
      sources: sorted,
      coverage: totalCells ? Math.round((okCells / totalCells) * 100) : 0,
      errorCounts: errors,
    };
  }, [results]);

  if (!hasStatus) {
    return (
      <Callout
        icon={<Grid3x3 className="w-4 h-4" />}
        tone="neutral"
        title="Per-source status was not returned for this batch"
        detail="The evidence matrix needs the per-provider outcome the scanner now returns with each bulk result. Re-run this batch once the threat-intel function is redeployed; older batches only carry aggregated flags."
      />
    );
  }

  const rows = [...results].sort((a, b) => (b.scoring?.calibrated ?? b.threatScore) - (a.scoring?.calibrated ?? a.threatScore));
  const failingSources = [...errorCounts.entries()].filter(([, n]) => n === results.length).map(([s]) => s);

  return (
    <div className="space-y-4">
      {failingSources.length > 0 && (
        <Callout
          icon={<Grid3x3 className="w-4 h-4" />}
          tone="warn"
          title={`${failingSources.length} provider${failingSources.length > 1 ? 's' : ''} failed for every IP in this batch`}
          detail={`${failingSources.map(getSourceDisplayName).join(', ')} — scores are computed without them. Check keys and rate limits before treating low scores as clean.`}
        />
      )}

      <ResultCard>
        <SectionHeader
          icon={<Grid3x3 className="w-4 h-4" />}
          title={`Evidence matrix · ${results.length} IPs × ${sources.length} providers`}
          actions={
            <span className="text-xs" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
              Coverage <span className="font-semibold tabular-nums" style={{ color: coverage < 80 ? palette.amber : palette.textPrimary }}>{coverage}%</span> of provider calls succeeded
            </span>
          }
        />

        <div className="flex items-center gap-4 mt-3 flex-wrap text-[11px]" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
          {(Object.keys(CELL_STYLE) as Cell[]).map(k => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[10px]" style={{ background: CELL_STYLE[k].bg, color: CELL_STYLE[k].fg, border: `1px solid ${palette.borderSubtle}` }}>{CELL_STYLE[k].glyph}</span>
              {CELL_STYLE[k].title}
            </span>
          ))}
          <span className="ml-auto">Grey column headers are context providers, not evidence.</span>
        </div>

        <div className="overflow-x-auto mt-3 -mx-1 px-1">
          <table className="border-separate" style={{ borderSpacing: '2px 2px' }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 text-left text-[11px] font-medium px-2 py-1 whitespace-nowrap" style={{ color: palette.textTertiary, background: palette.base, fontFamily: typography.ui }}>IP</th>
                <th className="text-left text-[11px] font-medium px-2 py-1" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>Verdict</th>
                {sources.map(src => {
                  const isContext = CONTEXT_SOURCES.has(src);
                  const errs = errorCounts.get(src) ?? 0;
                  return (
                    <th
                      key={src}
                      className="px-1 py-1 align-bottom"
                      title={`${getSourceDisplayName(src)}${errs ? ` · ${errs} error${errs > 1 ? 's' : ''}` : ''}`}
                      style={{ width: 28 }}
                    >
                      <div
                        className="text-[10px] font-medium whitespace-nowrap"
                        style={{
                          color: isContext ? palette.textDisabled : errs === results.length ? palette.amber : palette.textSecondary,
                          fontFamily: typography.ui,
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                          height: 88,
                          margin: '0 auto',
                        }}
                      >
                        {getSourceDisplayName(src)}
                      </div>
                    </th>
                  );
                })}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const v = verdictFor(r);
                const score = r.scoring?.calibrated ?? r.threatScore;
                return (
                  <tr key={r.ip}>
                    <td className="sticky left-0 z-10 px-2 py-1 whitespace-nowrap" style={{ background: palette.base }}>
                      <span className="text-xs" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{r.ip}</span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Pill label={v.label} tone={v.tone} />
                        <span className="text-[11px] tabular-nums" style={{ color: toneColor[v.tone], fontFamily: typography.ui }}>{score}</span>
                      </span>
                    </td>
                    {sources.map(src => {
                      const cell = cellFor(r, src);
                      const s = CELL_STYLE[cell];
                      const err = r.sourceStatus?.[src]?.error;
                      return (
                        <td key={src} className="p-0">
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-semibold"
                            title={`${getSourceDisplayName(src)} · ${s.title}${err ? `: ${err}` : ''}`}
                            style={{ background: s.bg, color: s.fg, border: `1px solid ${cell === 'hit' ? `${palette.rose}55` : palette.borderSubtle}`, fontFamily: typography.mono }}
                          >
                            {s.glyph}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1">
                      {onDrillDown && (
                        <button
                          onClick={() => onDrillDown(r.ip, r.artifactId ?? undefined)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap hover:brightness-125"
                          style={{ color: palette.accent, fontFamily: typography.ui }}
                        >
                          Report <ArrowUpRight className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ResultCard>
    </div>
  );
}
