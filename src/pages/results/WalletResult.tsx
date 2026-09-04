import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { Ban, Target, Database, FileJson, Coins, ChevronDown, ChevronRight, Activity } from 'lucide-react';
import { useTheme } from '../../contexts/themecontext';
import { lookupWallet } from '../../lib/threatIntel';
import type { WalletLookupResult } from '../../types';
import { palette, typography } from '../../design-system/tokens';
import {
  ResultShell, ResultLoading, ResultError, ResultEmpty,
  MetricCard, Pill, SectionHeader, Callout, ResultCard, SummaryActions,
  type ShellMenuItem, type Tone,
} from '../../components/results';

interface WalletResultProps {
  address: string;
  onScan?: (type: string, value: string) => void;
}

type MenuItem = 'overview' | 'sources' | 'raw';

type SourceEntry = { data: Record<string, unknown>; error?: string };

// Backend source keys → analyst-facing names.
const SOURCE_LABELS: Record<string, string> = {
  blockchain_info: 'Blockchain.info (BTC chain data)',
  ethplorer: 'Ethplorer (ETH chain data)',
  misttrack: 'MistTrack (sanctions / risk)',
};

/** Sources the backend runs for each chain; anything missing was skipped for the tier. */
function expectedSources(currency: WalletLookupResult['currency']): string[] {
  return currency === 'eth' ? ['ethplorer', 'misttrack'] : ['blockchain_info', 'misttrack'];
}

function chainName(unit: string): string {
  return unit === 'BTC' ? 'Bitcoin' : unit === 'ETH' ? 'Ethereum' : unit;
}

function formatDate(iso: unknown): string {
  if (!iso || typeof iso !== 'string') return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatAmount(value: unknown, unit: string): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Unknown';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${unit}`;
}

/**
 * MistTrack's public API nests the payload under `data`; the backend caches the
 * raw response, so read both the top level and the nested body.
 */
function normalizeMisttrack(raw: Record<string, unknown> | undefined): Record<string, any> {
  if (!raw) return {};
  const nested = raw.data;
  return nested && typeof nested === 'object' ? { ...raw, ...(nested as Record<string, unknown>) } : raw;
}

export default function WalletResult({ address }: WalletResultProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WalletLookupResult | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuItem>('overview');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const mainContainer = containerRef.current.closest('[style*="overflow"]');
      if (mainContainer) mainContainer.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        setResult(await lookupWallet(address));
      } catch (err: any) {
        setError(err.message || 'Failed to lookup wallet');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [address]);

  if (loading && !result) {
    return <div ref={containerRef} className="h-full"><ResultLoading message={`Querying chain data and sanctions lists for ${address}…`} /></div>;
  }

  if (error) {
    return <div ref={containerRef} className="h-full"><ResultError message={error} /></div>;
  }

  if (!result) {
    return <div ref={containerRef} className="h-full"><ResultEmpty message={`No result data available for ${address}.`} /></div>;
  }

  const unit = result.currency.toUpperCase();
  const sources = result.sources || {};
  const chainEntry = sources.blockchain_info ?? sources.ethplorer;
  const chain = (chainEntry?.data || {}) as Record<string, any>;
  const mistEntry = sources.misttrack;
  const mist = normalizeMisttrack(mistEntry?.data);
  // Sanctions screening only counts as performed when MistTrack answered with data.
  const sanctionsChecked = !!mistEntry && !mistEntry.error && Object.keys(mistEntry.data || {}).length > 0;

  const verdict: { label: string; tone: Tone } = result.is_sanctioned
    ? { label: 'Sanctions / high-risk match', tone: 'danger' }
    : sanctionsChecked
      ? { label: 'No sanctions match', tone: 'neutral' }
      : { label: 'Sanctions not checked', tone: 'neutral' };

  const verdictCaption = result.is_sanctioned
    ? 'MistTrack reports a sanctions or high-risk association for this address.'
    : sanctionsChecked
      ? 'No match in MistTrack. Absence of a match is not a clean verdict — it only means this screening source has nothing on file.'
      : `Sanctions screening did not run${mistEntry?.error ? ` (${mistEntry.error})` : ' for this tier'}. Nothing here vouches for this address.`;

  const menuItems: ShellMenuItem<MenuItem>[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'raw', label: 'Raw JSON', icon: FileJson },
  ];

  const getSummary = () => [
    `Wallet: ${result.address}`,
    `Chain: ${unit}`,
    `Sanctions: ${result.is_sanctioned ? 'MATCH' : sanctionsChecked ? 'no match' : 'not checked'}`,
    result.balance != null ? `Balance: ${result.balance} ${unit}` : '',
    result.tx_count != null ? `Transactions: ${result.tx_count}` : '',
  ].filter(Boolean).join('\n');

  return (
    <div ref={containerRef} className="h-full">
      <ResultShell<MenuItem>
        value={result.address}
        typeLabel={`Crypto wallet · ${unit}`}
        verdict={verdict}
        signals={
          <span className="text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
            {verdictCaption}
          </span>
        }
        menuItems={menuItems}
        activeMenu={activeMenu}
        onMenuChange={setActiveMenu}
        variant={theme === 'desktop' ? 'tabs' : 'sidebar'}
        headerActions={<SummaryActions getSummary={getSummary} getJson={() => result} />}
      >
        {activeMenu === 'overview' && (
          <OverviewSection
            result={result}
            unit={unit}
            chain={chain}
            mist={mist}
            mistEntry={mistEntry}
            sanctionsChecked={sanctionsChecked}
          />
        )}

        {activeMenu === 'sources' && <SourcesSection sources={sources} currency={result.currency} />}

        {activeMenu === 'raw' && (
          <div className="space-y-4">
            <SectionHeader icon={<FileJson className="w-4 h-4" />} title="Raw JSON" />
            <pre
              className="overflow-auto max-h-[600px] p-4"
              style={{
                background: palette.void,
                color: palette.textSecondary,
                fontFamily: typography.mono,
                fontSize: '11px',
                borderRadius: '8px',
                border: `1px solid ${palette.borderDefault}`,
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </ResultShell>
    </div>
  );
}

/* ------------------------------- Overview -------------------------------- */

function OverviewSection({ result, unit, chain, mist, mistEntry, sanctionsChecked }: {
  result: WalletLookupResult;
  unit: string;
  chain: Record<string, any>;
  mist: Record<string, any>;
  mistEntry: SourceEntry | undefined;
  sanctionsChecked: boolean;
}) {
  const isBtc = result.currency === 'btc';
  const topTokens: any[] = Array.isArray(chain.top_tokens) ? chain.top_tokens : [];
  const hasActivity = isBtc && (chain.first_seen || chain.last_seen);

  return (
    <div className="space-y-4">
      {result.is_sanctioned && (
        <Callout
          icon={<Ban className="w-4 h-4" />}
          tone="danger"
          title="Address flagged by MistTrack"
          detail="The screening source associates this address with sanctioned entities or high-risk activity. Treat any interaction as high risk."
        >
          <MisttrackDetails mist={mist} />
        </Callout>
      )}

      {!result.is_sanctioned && !sanctionsChecked && (
        <Callout
          icon={<Ban className="w-4 h-4" />}
          tone="neutral"
          title="Sanctions screening unavailable"
          detail={mistEntry?.error
            ? `MistTrack: ${mistEntry.error}`
            : 'MistTrack was not run for this account tier, so no sanctions or risk data exists for this address.'}
        />
      )}

      <div className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-4 gap-3">
        <MetricCard label="Balance" value={result.balance != null ? formatAmount(result.balance, unit) : 'Unknown'} mono />
        <MetricCard label="Transactions" value={result.tx_count != null ? result.tx_count.toLocaleString() : 'Unknown'} />
        <MetricCard label="Chain" value={chainName(unit)} detail={unit} />
        <MetricCard
          label="Sanctions"
          value={result.is_sanctioned ? 'Match' : sanctionsChecked ? 'No match' : 'Not checked'}
          tone={result.is_sanctioned ? 'danger' : 'neutral'}
          highlight={result.is_sanctioned}
        />
      </div>

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        <ResultCard>
          <SectionHeader icon={<Coins className="w-4 h-4" />} title={`${chainName(unit)} chain data`} />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
            <Field label="Address" value={result.address} mono />
            <Field label="Data source" value={typeof chain.source === 'string' ? chain.source : 'Unavailable'} />
            {isBtc && (
              <>
                <Field label="Total received" value={formatAmount(chain.total_received_btc, unit)} mono />
                <Field label="Total sent" value={formatAmount(chain.total_sent_btc, unit)} mono />
                {typeof chain.balance_satoshi === 'number' && (
                  <Field label="Balance (satoshi)" value={chain.balance_satoshi.toLocaleString()} mono />
                )}
              </>
            )}
            {!isBtc && typeof chain.tokens_held === 'number' && (
              <Field label="Tokens held" value={chain.tokens_held.toLocaleString()} />
            )}
          </div>
          {!isBtc && topTokens.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium mb-2" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                Top tokens
              </div>
              <div className="space-y-1.5">
                {topTokens.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
                    style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                  >
                    <span className="text-sm font-medium truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                      {t?.name || t?.symbol || 'Unknown token'}
                      {t?.symbol && t?.name && (
                        <span className="ml-2 text-xs" style={{ color: palette.textTertiary, fontFamily: typography.mono }}>{t.symbol}</span>
                      )}
                    </span>
                    <span className="text-xs shrink-0 tabular-nums" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>
                      {t?.balance != null ? String(t.balance) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ResultCard>

        <ResultCard>
          <SectionHeader icon={<Activity className="w-4 h-4" />} title="Activity" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 mt-4">
            {hasActivity ? (
              <>
                <Field label="First activity" value={formatDate(chain.first_seen)} />
                <Field label="Last activity" value={formatDate(chain.last_seen)} />
              </>
            ) : (
              <div className="col-span-2 text-sm" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                {isBtc ? 'No transaction timestamps returned by the chain source.' : 'Ethplorer does not return first/last activity timestamps.'}
              </div>
            )}
            <Field label="Checked" value={formatDate(result.checked_at)} />
            {result.tier && <Field label="Lookup tier" value={result.tier} />}
          </div>
        </ResultCard>
      </div>
    </div>
  );
}

/** Matched programme / entity details from the MistTrack risk payload. */
function MisttrackDetails({ mist }: { mist: Record<string, any> }) {
  const detailList: string[] = Array.isArray(mist.detail_list) ? mist.detail_list.map(String) : [];
  const riskDetail: any[] = Array.isArray(mist.risk_detail) ? mist.risk_detail : [];
  const hasAny = mist.risk_level || mist.score != null || mist.hacking_event || detailList.length > 0 || riskDetail.length > 0;
  if (!hasAny) return null;

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 @xl:grid-cols-3 gap-x-5 gap-y-3">
        {mist.risk_level && <Field label="Risk level" value={String(mist.risk_level)} tone="danger" />}
        {mist.score != null && <Field label="Risk score" value={String(mist.score)} tone="danger" />}
        {mist.hacking_event && <Field label="Hacking event" value={String(mist.hacking_event)} />}
      </div>
      {detailList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {detailList.map((d, idx) => <Pill key={idx} label={d} tone="danger" />)}
        </div>
      )}
      {riskDetail.length > 0 && (
        <div className="space-y-1.5">
          {riskDetail.map((r, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
              style={{ background: palette.base, border: `1px solid ${palette.borderSubtle}` }}
            >
              <span className="text-sm font-medium truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                {r?.label || r?.type || 'Risk association'}
              </span>
              <span className="text-xs shrink-0" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>
                {[r?.type && r?.label ? r.type : null, r?.percent != null ? `${r.percent}%` : null, r?.address].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, tone = 'neutral', mono = false }: {
  label: string; value: ReactNode; tone?: Tone; mono?: boolean;
}) {
  const valueColor = tone === 'danger' ? palette.rose : tone === 'warn' ? palette.amber : palette.textPrimary;
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium mb-0.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
        {label}
      </div>
      <div
        className="text-sm font-medium leading-snug break-all"
        style={{ color: valueColor, fontFamily: mono ? typography.mono : typography.ui }}
      >
        {value}
      </div>
    </div>
  );
}

/* -------------------------------- Sources -------------------------------- */

type SourceState = { label: string; tone: Tone };

function sourceState(entry: SourceEntry | undefined): SourceState {
  if (!entry) return { label: 'Not run', tone: 'neutral' };
  if (entry.error) {
    return /not configured/i.test(entry.error)
      ? { label: 'Not configured', tone: 'neutral' }
      : { label: 'Error', tone: 'danger' };
  }
  if (!entry.data || Object.keys(entry.data).length === 0) return { label: 'No data', tone: 'neutral' };
  return { label: 'OK', tone: 'good' };
}

function SourcesSection({ sources, currency }: { sources: WalletLookupResult['sources']; currency: WalletLookupResult['currency'] }) {
  const expected = expectedSources(currency);
  const keys = [...expected, ...Object.keys(sources).filter(k => !expected.includes(k))];
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(keys));

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Database className="w-4 h-4" />} title={`Individual sources (${keys.length})`} />
      <div className="space-y-2">
        {keys.map(key => {
          const entry = sources[key];
          const state = sourceState(entry);
          const isError = state.tone === 'danger';
          const isExpanded = expandedKeys.has(key);
          return (
            <div
              key={key}
              className="rounded-lg overflow-hidden"
              style={{
                background: isError ? `${palette.rose}0d` : palette.base,
                border: `1px solid ${isError ? `${palette.rose}40` : palette.borderDefault}`,
              }}
            >
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:brightness-110"
                style={{ background: 'transparent' }}
                title={entry?.error || undefined}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                    : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />}
                  <span className="text-sm font-semibold truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                    {SOURCE_LABELS[key] || key}
                  </span>
                  <span className="text-[11px] shrink-0" style={{ color: palette.textTertiary, fontFamily: typography.mono }}>{key}</span>
                </span>
                <Pill label={state.label} tone={state.tone} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4">
                  {entry?.error && (
                    <div className="text-xs mb-2" style={{ color: isError ? palette.rose : palette.textSecondary, fontFamily: typography.ui }}>
                      {entry.error}
                    </div>
                  )}
                  {!entry && (
                    <div className="text-xs" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
                      Not enabled for this account tier — the lookup service skipped it.
                    </div>
                  )}
                  {entry && (
                    <pre
                      className="text-xs overflow-auto max-h-72 rounded-md p-3"
                      style={{ background: palette.void, color: palette.textSecondary, fontFamily: typography.mono }}
                    >
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
