import { useMemo } from 'react';
import { Printer } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { Pill } from '../results';
import type { BulkIPResult } from '../../types';
import { computeClusters } from './clusterUtils';
import { verdictFor } from './verdict';
import { summarizeCoverage } from './coverage';

interface BatchReportProps {
  results: BulkIPResult[];
  batchId?: string;
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-5 mb-3.5" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: palette.textPrimary }}>
        <span className="w-5 h-5 rounded flex items-center justify-center text-[10.5px]" style={{ background: palette.float, color: palette.accent, fontFamily: typography.mono }}>{index}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

export function BatchReport({ results, batchId }: BatchReportProps) {
  const { clusters, outlierIPs } = useMemo(() => computeClusters(results), [results]);

  const malicious = results.filter(r => verdictFor(r).tone === 'danger');
  const suspicious = results.filter(r => verdictFor(r).tone === 'warn');
  const clean = results.length - malicious.length - suspicious.length;

  const priority = [...malicious, ...suspicious]
    .sort((a, b) => (b.scoring?.calibrated ?? b.threatScore) - (a.scoring?.calibrated ?? a.threatScore))
    .slice(0, 5);

  const infraClusters = clusters.filter(c => c.kind === 'org' || c.kind === 'vpn');
  const evidenceClusters = clusters.filter(c => c.kind === 'tag');
  const outlierRows = results.filter(r => outlierIPs.includes(r.ip) && verdictFor(r).tone !== 'good');

  const coverage = useMemo(() => summarizeCoverage(results), [results]);

  return (
    <div className="max-w-[920px] mx-auto">
      <div className="flex items-center justify-between mb-3.5">
        <div className="text-xs" style={{ color: palette.textTertiary }}>
          {batchId ? <>Batch <span style={{ fontFamily: typography.mono }}>{batchId}</span> · </> : null}{results.length} IPs analyzed
        </div>
        <button
          onClick={() => window.print()}
          className="h-8 px-3 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors hover:brightness-125"
          style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}
        >
          <Printer className="w-3.5 h-3.5" /> Print / export report
        </button>
      </div>

      <Section index={1} title="Decision Summary">
        <p className="text-sm leading-relaxed" style={{ color: palette.textSecondary }}>
          Of the {results.length} submitted addresses, <b style={{ color: palette.rose }}>{malicious.length} {malicious.length === 1 ? 'is' : 'are'} malicious</b>,{' '}
          <b style={{ color: palette.amber }}>{suspicious.length} suspicious</b>, and <b style={{ color: palette.green }}>{clean} clean</b>.
          {infraClusters.length > 0 && (
            <> {infraClusters.length} shared-infrastructure cluster{infraClusters.length === 1 ? '' : 's'} were found (shared hosting org or VPN provider) — shared infrastructure is context, not evidence of coordination on its own.</>
          )}
          {evidenceClusters.length > 0 && (
            <> {evidenceClusters.length} group{evidenceClusters.length === 1 ? '' : 's'} of IPs share an identical third-party threat-feed tag, which is a stronger correlation signal.</>
          )}
        </p>
      </Section>

      <Section index={2} title="Highest-Priority IPs">
        {priority.length === 0 ? (
          <p className="text-sm" style={{ color: palette.textDisabled }}>No malicious or suspicious IPs in this batch.</p>
        ) : priority.map((r, i) => {
          const v = verdictFor(r);
          const score = r.scoring?.calibrated ?? r.threatScore;
          const reasons: string[] = [];
          if (r.inThreatFox) reasons.push('ThreatFox tag');
          if (r.inURLhaus) reasons.push('URLhaus tag');
          if (r.spamhausListed) reasons.push(`${r.spamhausLists?.length || 1} blocklist(s)`);
          if (r.abuseConfidence) reasons.push(`${r.abuseConfidence}% abuse confidence`);
          if (r.isTor) reasons.push('Tor exit');
          return (
            <div key={r.ip} className="flex items-center gap-3.5 p-3 rounded-md mb-2 last:mb-0" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
              <div className="text-lg font-bold w-6" style={{ color: palette.textDisabled }}>{String(i + 1).padStart(2, '0')}</div>
              <div className="w-[140px] font-bold text-sm" style={{ fontFamily: typography.mono }}>{r.ip}</div>
              <Pill label={`${v.label} · ${score}`} tone={v.tone} />
              <div className="text-xs flex-1" style={{ color: palette.textTertiary }}>{reasons.join(' · ') || '—'}</div>
            </div>
          );
        })}
      </Section>

      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-3.5">
        <Section index={3} title="Shared Infrastructure">
          {infraClusters.length === 0 ? (
            <p className="text-xs" style={{ color: palette.textDisabled }}>No shared hosting org or VPN provider detected.</p>
          ) : infraClusters.map(c => (
            <div key={c.id} className="flex justify-between text-xs py-1.5" style={{ borderBottom: `1px solid ${palette.borderSubtle}`, color: palette.textSecondary }}>
              <span>{c.label}</span>
              <span style={{ fontFamily: typography.mono, color: palette.textTertiary }}>{c.members.length} IPs</span>
            </div>
          ))}
        </Section>
        <Section index={4} title="Shared Threat Evidence">
          {evidenceClusters.length === 0 ? (
            <p className="text-xs" style={{ color: palette.textDisabled }}>No overlapping threat-feed tags across the batch.</p>
          ) : evidenceClusters.map(c => (
            <div key={c.id} className="flex justify-between text-xs py-1.5" style={{ borderBottom: `1px solid ${palette.borderSubtle}`, color: palette.textSecondary }}>
              <span>{c.label}</span>
              <span style={{ fontFamily: typography.mono, color: palette.textTertiary }}>{c.members.length} IPs</span>
            </div>
          ))}
        </Section>
      </div>

      <Section index={5} title="Unique / Outlier Findings">
        {outlierRows.length === 0 ? (
          <p className="text-sm" style={{ color: palette.textDisabled }}>No suspicious or malicious IPs stand apart from the batch's clusters — every notable finding shares context with at least one other IP.</p>
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: palette.textSecondary }}>
            {outlierRows.length} IP{outlierRows.length === 1 ? '' : 's'} scored suspicious or worse with <b>no shared ASN, VPN pool, or threat-feed tag</b> against the rest of the batch — worth individual review:{' '}
            {outlierRows.map((r, i) => (
              <span key={r.ip}>
                <span style={{ fontFamily: typography.mono, color: palette.textPrimary }}>{r.ip}</span>
                {i < outlierRows.length - 1 ? ', ' : ''}
              </span>
            ))}.
          </p>
        )}
      </Section>

      <Section index={6} title="Coverage & Data Completeness">
        {coverage ? (
          <p className="text-xs leading-relaxed" style={{ color: palette.textTertiary }}>
            <b style={{ color: coverage.coverage < 80 ? palette.amber : palette.textSecondary }}>{coverage.coverage}%</b> of provider calls succeeded across{' '}
            {coverage.providers} providers.
            {coverage.fullyFailed.length > 0
              ? <> <b style={{ color: palette.amber }}>{coverage.fullyFailed.join(', ')}</b> returned errors for every IP — scores in this report were computed without {coverage.fullyFailed.length === 1 ? 'that source' : 'those sources'}.</>
              : <> No provider failed for the whole batch.</>}
            {' '}The per-IP breakdown is in the Evidence tab.
          </p>
        ) : (
          <p className="text-xs" style={{ color: palette.textTertiary }}>
            Per-source status was not returned for this batch (scanned before the scanner started reporting it), so coverage cannot be stated. Re-run the batch for a full source-by-IP matrix.
          </p>
        )}
      </Section>

      <Section index={7} title="Methodology & Scoring">
        <p className="text-xs leading-relaxed" style={{ color: palette.textTertiary }}>
          Scores use ThamOS's calibrated model (reputation + behavioral signals + network context, weighted).
          Verdicts: <b style={{ color: palette.rose }}>Malicious</b>, <b style={{ color: palette.amber }}>Suspicious</b>, <b style={{ color: palette.green }}>Clean</b>.
          Cluster membership reflects a shared hosting org, VPN provider, or an identical third-party threat-feed tag — it is contextual, not accusatory; risk stays attached to each IP's own evidence.
        </p>
      </Section>
    </div>
  );
}
