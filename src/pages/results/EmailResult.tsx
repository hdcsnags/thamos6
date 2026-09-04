import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, Database, FileJson, Target, ShieldAlert, Trash2, Globe,
  ChevronDown, ChevronRight, ArrowRight,
} from 'lucide-react';
import { useTheme } from '../../contexts/themecontext';
import { lookupEmail } from '../../lib/threatIntel';
import type { EmailLookupResult } from '../../types';
import { palette, typography } from '../../design-system/tokens';
import {
  ResultShell, ResultLoading, ResultError, ResultEmpty,
  MetricCard, Pill, SectionHeader, Callout, ResultCard, SummaryActions, SignalLight,
  type ShellMenuItem, type Tone,
} from '../../components/results';

interface EmailResultProps {
  email: string;
  onScan?: (type: string, value: string) => void;
}

type MenuItem = 'overview' | 'sources' | 'raw';

/** Sources the /email route can run. Absent keys mean the tier/config excluded them. */
const EXPECTED_SOURCES: Array<{ key: string; label: string }> = [
  { key: 'email_dns', label: 'DNS (MX / SPF / DMARC)' },
  { key: 'emailrep', label: 'EmailRep' },
  { key: 'hibp', label: 'Have I Been Pwned' },
];

type SourceStatus = 'ok' | 'error' | 'unconfigured';
type SourceState = { status: SourceStatus; error?: string };

function sourceStatus(sources: EmailLookupResult['sources'], key: string): SourceState {
  const entry = sources?.[key];
  if (!entry) return { status: 'unconfigured' };
  if (entry.error) {
    return /not configured/i.test(entry.error)
      ? { status: 'unconfigured', error: entry.error }
      : { status: 'error', error: entry.error };
  }
  return { status: 'ok' };
}

function statusPill(status: SourceStatus): { label: string; tone: Tone } {
  if (status === 'ok') return { label: 'OK', tone: 'good' };
  if (status === 'error') return { label: 'Error', tone: 'danger' };
  return { label: 'Not configured', tone: 'neutral' };
}

function triState(value: boolean | null | undefined, yes: string, no: string, unknown = 'Unknown'): string {
  if (value === true) return yes;
  if (value === false) return no;
  return unknown;
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function EmailResult({ email, onScan }: EmailResultProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EmailLookupResult | null>(null);
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
        setResult(await lookupEmail(email));
      } catch (err: any) {
        setError(err.message || 'Failed to lookup email');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [email]);

  if (loading && !result) {
    return <div ref={containerRef} className="h-full"><ResultLoading message="Checking DNS auth, reputation and breaches…" /></div>;
  }

  if (error) {
    return <div ref={containerRef} className="h-full"><ResultError message={error} /></div>;
  }

  if (!result) {
    return <div ref={containerRef} className="h-full"><ResultEmpty message={`No result data available for ${email}.`} /></div>;
  }

  const sources = result.sources || {};
  const dns = sourceStatus(sources, 'email_dns');
  const rep = sourceStatus(sources, 'emailrep');
  const hibp = sourceStatus(sources, 'hibp');
  const dnsData: any = sources.email_dns?.data || {};
  const repData: any = sources.emailrep?.data || {};
  const hibpData: any = sources.hibp?.data || {};
  const host = result.email.split('@')[1] || email.split('@')[1] || '';

  // The backend collapses a failed DNS lookup to has_valid_mx=false; only
  // assert "no MX" when the DNS source actually answered.
  const noMx = dns.status === 'ok' && result.has_valid_mx === false;
  const suspicious = result.is_suspicious === true;
  const verdict: { label: string; tone: Tone } = suspicious
    ? { label: 'Suspicious', tone: 'warn' }
    : { label: 'No signal', tone: 'neutral' };
  const reputationCaption = result.reputation
    ? `EmailRep reputation: ${result.reputation}`
    : rep.status === 'ok'
      ? 'EmailRep reputation: none'
      : `EmailRep ${rep.status === 'error' ? 'errored' : 'not configured'}`;

  const menuItems: ShellMenuItem<MenuItem>[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'raw', label: 'Raw JSON', icon: FileJson },
  ];

  const getSummary = () => [
    `Email: ${result.email}`,
    `Domain: ${host}`,
    `Verdict: ${verdict.label}`,
    `Reputation: ${result.reputation ?? 'unknown'}${suspicious ? ' (SUSPICIOUS)' : ''}`,
    `Breached: ${result.is_breached
      ? `YES (${result.breach_count ?? '?'} breaches)`
      : hibp.status === 'ok' ? 'no' : `not checked (${statusPill(hibp.status).label.toLowerCase()})`}`,
    `MX: ${dns.status === 'ok' ? (result.has_valid_mx ? 'valid' : 'none') : 'unknown'} · SPF: ${triState(result.has_spf, 'yes', 'no', 'n/a')} · DMARC: ${triState(result.has_dmarc, 'yes', 'no', 'n/a')}`,
    result.is_disposable ? 'Disposable address' : '',
    result.is_free_provider ? 'Free provider' : '',
    `Checked: ${result.checked_at}`,
  ].filter(Boolean).join('\n');

  const signals = (
    <>
      <span className="text-xs mr-1" style={{ color: palette.textSecondary, fontFamily: typography.ui }}>
        {reputationCaption}
      </span>
      <SignalLight
        label="BREACHED"
        on={!!result.is_breached}
        tone="warn"
        detail={result.breach_count != null ? `${result.breach_count} breach${result.breach_count === 1 ? '' : 'es'}` : undefined}
      />
      <SignalLight label="DISPOSABLE" on={result.is_disposable === true} tone="warn" />
      <SignalLight label="FREE PROVIDER" on={result.is_free_provider === true} tone="neutral" />
      <SignalLight label="NO MX" on={noMx} tone="danger" />
      <SignalLight
        label="SPF"
        on={result.has_spf !== null && result.has_spf !== undefined}
        tone={result.has_spf ? 'good' : 'danger'}
        detail={result.has_spf ? 'present' : 'missing'}
      />
      <SignalLight
        label="DMARC"
        on={result.has_dmarc !== null && result.has_dmarc !== undefined}
        tone={result.has_dmarc ? 'good' : 'danger'}
        detail={result.has_dmarc ? 'present' : 'missing'}
      />
    </>
  );

  return (
    <div ref={containerRef} className="h-full">
      <ResultShell<MenuItem>
        value={result.email}
        typeLabel="Email address reputation"
        verdict={verdict}
        signals={signals}
        menuItems={menuItems}
        activeMenu={activeMenu}
        onMenuChange={setActiveMenu}
        variant={theme === 'desktop' ? 'tabs' : 'sidebar'}
        headerActions={<SummaryActions getSummary={getSummary} getJson={() => result} />}
      >
        {activeMenu === 'overview' && (
          <OverviewSection
            result={result}
            host={host}
            noMx={noMx}
            dnsStatus={dns}
            repStatus={rep}
            hibpStatus={hibp}
            dnsData={dnsData}
            repData={repData}
            hibpData={hibpData}
            onScan={onScan}
          />
        )}

        {activeMenu === 'sources' && <SourcesSection sources={sources} />}

        {activeMenu === 'raw' && (
          <div className="space-y-4">
            <SectionHeader icon={<FileJson className="w-4 h-4" />} title={`Raw JSON (${Object.keys(sources).length} sources)`} />
            <pre
              className="overflow-auto p-4"
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

function OverviewSection({ result, host, noMx, dnsStatus, repStatus, hibpStatus, dnsData, repData, hibpData, onScan }: {
  result: EmailLookupResult;
  host: string;
  noMx: boolean;
  dnsStatus: SourceState;
  repStatus: SourceState;
  hibpStatus: SourceState;
  dnsData: any;
  repData: any;
  hibpData: any;
  onScan?: (type: string, value: string) => void;
}) {
  const breaches: any[] = Array.isArray(hibpData?.breaches) ? hibpData.breaches : [];
  const breachCountText = result.breach_count != null
    ? String(result.breach_count)
    : result.is_breached ? 'Yes' : hibpStatus.status === 'ok' ? '0' : 'Not checked';
  const mxCount = Array.isArray(dnsData?.mx_records) ? dnsData.mx_records.length : 0;

  return (
    <div className="space-y-4">
      {/* Notable findings first — tinted only when the state is real */}
      {result.is_suspicious && (
        <Callout
          icon={<ShieldAlert className="w-4 h-4" />}
          title="EmailRep flags this address as suspicious"
          detail={repData?.details?.malicious_activity
            ? 'Malicious activity has been reported for this address.'
            : 'Suspicious per EmailRep heuristics — see EmailRep details below.'}
          tone="warn"
        />
      )}
      {noMx && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          title="Sender domain has no MX records"
          detail={`${host} cannot receive mail — the address is unlikely to be a real mailbox and replies will bounce.`}
          tone="danger"
        />
      )}
      {result.is_breached && (
        <Callout
          icon={<AlertTriangle className="w-4 h-4" />}
          title={`Appears in ${result.breach_count ?? '?'} known data breach${result.breach_count === 1 ? '' : 'es'}`}
          detail="Credentials associated with this address have been exposed (Have I Been Pwned)."
          tone="warn"
        >
          {breaches.length > 0 && <BreachList breaches={breaches} />}
        </Callout>
      )}
      {result.is_disposable === true && (
        <Callout
          icon={<Trash2 className="w-4 h-4" />}
          title="Disposable address"
          detail="The mailbox provider is a throwaway/temporary email service."
          tone="warn"
        />
      )}

      <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-4 gap-3">
        <MetricCard
          label="Reputation (EmailRep)"
          value={result.reputation ? capitalize(result.reputation) : repStatus.status === 'ok' ? 'None' : 'Unavailable'}
          detail={repStatus.status === 'ok'
            ? (result.is_suspicious ? 'Flagged suspicious' : 'Not flagged')
            : statusPill(repStatus.status).label}
          tone={result.is_suspicious ? 'warn' : 'neutral'}
          highlight={!!result.is_suspicious}
        />
        <MetricCard
          label="Breaches (HIBP)"
          value={breachCountText}
          detail={hibpStatus.status === 'ok' ? 'Have I Been Pwned' : statusPill(hibpStatus.status).label}
          tone={result.is_breached ? 'warn' : 'neutral'}
          highlight={!!result.is_breached}
        />
        <MetricCard
          label="MX records"
          value={dnsStatus.status === 'ok' ? (result.has_valid_mx ? 'Present' : 'None') : 'Unknown'}
          detail={dnsStatus.status === 'ok'
            ? (mxCount > 0 ? `${mxCount} shown` : undefined)
            : statusPill(dnsStatus.status).label}
          tone={noMx ? 'danger' : 'neutral'}
          highlight={noMx}
        />
        <MetricCard
          label="SPF / DMARC"
          value={`${triState(result.has_spf, 'SPF', 'No SPF', 'SPF n/a')} · ${triState(result.has_dmarc, 'DMARC', 'No DMARC', 'DMARC n/a')}`}
          tone={result.has_spf === false || result.has_dmarc === false ? 'warn' : 'neutral'}
        />
        <MetricCard
          label="Disposable"
          value={triState(result.is_disposable, 'Yes', 'No')}
          tone={result.is_disposable === true ? 'warn' : 'neutral'}
          highlight={result.is_disposable === true}
        />
        <MetricCard
          label="Free provider"
          value={triState(result.is_free_provider, 'Yes', 'No')}
        />
        {repData?.references != null && (
          <MetricCard
            label="References (EmailRep)"
            value={String(repData.references)}
            detail={repData.last_seen ? `Last seen ${repData.last_seen}` : undefined}
          />
        )}
        {repData?.details?.domain_reputation && (
          <MetricCard
            label="Domain reputation"
            value={capitalize(String(repData.details.domain_reputation))}
            detail={repData.details.days_since_domain_creation != null ? `Domain age ${repData.details.days_since_domain_creation} days` : undefined}
            tone={repData.details.new_domain || repData.details.suspicious_tld ? 'warn' : 'neutral'}
          />
        )}
      </div>

      <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-4 items-start">
        <SenderDomainCard host={host} dnsStatus={dnsStatus} dnsData={dnsData} onScan={onScan} />
        <EmailRepDetailsCard repStatus={repStatus} repData={repData} />
      </div>

      <div className="text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
        Checked {new Date(result.checked_at).toLocaleString()}
        {result.tier ? ` · tier ${result.tier}` : ''}
      </div>
    </div>
  );
}

function BreachList({ breaches }: { breaches: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? breaches : breaches.slice(0, 3);
  return (
    <div className="mt-3 space-y-1.5">
      {shown.map((b, idx) => (
        <div
          key={b?.Name || idx}
          className="px-3 py-2 rounded-md"
          style={{ background: palette.base, border: `1px solid ${palette.borderSubtle}` }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
              {b?.Title || b?.Name || 'Unknown breach'}
            </span>
            <span className="text-[11px] shrink-0 tabular-nums" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
              {formatDate(b?.BreachDate)}
              {b?.PwnCount != null ? ` · ${Number(b.PwnCount).toLocaleString()} accounts` : ''}
            </span>
          </div>
          {Array.isArray(b?.DataClasses) && b.DataClasses.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {b.DataClasses.slice(0, 8).map((dc: string) => (
                <span key={dc} className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                      style={{ background: palette.surface, color: palette.textSecondary, fontFamily: typography.ui }}>
                  {dc}
                </span>
              ))}
              {b.DataClasses.length > 8 && (
                <span className="text-[11px]" style={{ color: palette.textTertiary }}>+{b.DataClasses.length - 8} more</span>
              )}
            </div>
          )}
        </div>
      ))}
      {breaches.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 mt-1 text-xs font-medium transition-colors hover:brightness-125"
          style={{ color: palette.accent, fontFamily: typography.ui }}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {expanded ? 'Show fewer' : `Show all ${breaches.length} breaches`}
        </button>
      )}
    </div>
  );
}

function SenderDomainCard({ host, dnsStatus, dnsData, onScan }: {
  host: string;
  dnsStatus: SourceState;
  dnsData: any;
  onScan?: (type: string, value: string) => void;
}) {
  const mxRecords: string[] = Array.isArray(dnsData?.mx_records) ? dnsData.mx_records : [];
  return (
    <ResultCard>
      <SectionHeader
        icon={<Globe className="w-4 h-4" />}
        title="Sender domain"
        actions={onScan && host ? (
          <button
            onClick={() => onScan('domain', host)}
            className="flex items-center gap-1 text-xs font-medium transition-colors hover:brightness-125"
            style={{ color: palette.accent, fontFamily: typography.ui }}
          >
            Scan domain
            <ArrowRight className="w-3 h-3" />
          </button>
        ) : undefined}
      />
      <div className="mt-4 space-y-3.5">
        <Field label="Domain" value={host || 'Unknown'} mono />
        {dnsStatus.status !== 'ok' ? (
          <div className="text-xs" style={{ color: dnsStatus.status === 'error' ? palette.rose : palette.textTertiary, fontFamily: typography.ui }}>
            DNS lookup {statusPill(dnsStatus.status).label.toLowerCase()}{dnsStatus.error ? ` — ${dnsStatus.error}` : ''}
          </div>
        ) : (
          <>
            <Field
              label={`MX records${mxRecords.length ? ` (${mxRecords.length})` : ''}`}
              value={mxRecords.length > 0 ? (
                <div className="space-y-0.5">
                  {mxRecords.map((mx, idx) => <div key={idx} className="break-all">{mx}</div>)}
                </div>
              ) : 'None'}
              tone={mxRecords.length === 0 ? 'danger' : 'neutral'}
              mono={mxRecords.length > 0}
            />
            <Field
              label="SPF record"
              value={dnsData?.spf || 'None published'}
              tone={dnsData?.spf ? 'neutral' : 'warn'}
              mono={!!dnsData?.spf}
            />
            <Field
              label="DMARC record"
              value={dnsData?.dmarc || 'None published'}
              tone={dnsData?.dmarc ? 'neutral' : 'warn'}
              mono={!!dnsData?.dmarc}
            />
            {dnsData?.source && (
              <div className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                Resolver: {String(dnsData.source)}
              </div>
            )}
          </>
        )}
      </div>
    </ResultCard>
  );
}

/** EmailRep boolean flags that mean something to an analyst, with the tone
 *  each takes when true. Flags render unlit unless true. */
const EMAILREP_FLAGS: Array<{ key: string; label: string; tone: Tone }> = [
  { key: 'malicious_activity', label: 'Malicious activity', tone: 'danger' },
  { key: 'malicious_activity_recent', label: 'Recent malicious activity', tone: 'danger' },
  { key: 'blacklisted', label: 'Blacklisted', tone: 'danger' },
  { key: 'credentials_leaked', label: 'Credentials leaked', tone: 'warn' },
  { key: 'credentials_leaked_recent', label: 'Recently leaked', tone: 'warn' },
  { key: 'data_breach', label: 'Data breach', tone: 'warn' },
  { key: 'spam', label: 'Spam', tone: 'warn' },
  { key: 'spoofable', label: 'Spoofable', tone: 'warn' },
  { key: 'new_domain', label: 'New domain', tone: 'warn' },
  { key: 'suspicious_tld', label: 'Suspicious TLD', tone: 'warn' },
  { key: 'accept_all', label: 'Accept-all domain', tone: 'neutral' },
  { key: 'deliverable', label: 'Deliverable', tone: 'neutral' },
  { key: 'domain_exists', label: 'Domain exists', tone: 'neutral' },
  { key: 'spf_strict', label: 'SPF strict', tone: 'good' },
  { key: 'dmarc_enforced', label: 'DMARC enforced', tone: 'good' },
];

function EmailRepDetailsCard({ repStatus, repData }: { repStatus: SourceState; repData: any }) {
  const details = repData?.details;
  const profiles: string[] = Array.isArray(details?.profiles) ? details.profiles : [];
  const flags = EMAILREP_FLAGS.filter(f => details && details[f.key] !== undefined && details[f.key] !== null);

  return (
    <ResultCard>
      <SectionHeader icon={<ShieldAlert className="w-4 h-4" />} title="EmailRep details" />
      <div className="mt-4 space-y-3.5">
        {repStatus.status !== 'ok' || !details ? (
          <div className="text-xs" style={{ color: repStatus.status === 'error' ? palette.rose : palette.textTertiary, fontFamily: typography.ui }}>
            {repStatus.status === 'ok'
              ? 'EmailRep returned no detail block for this address.'
              : `EmailRep ${statusPill(repStatus.status).label.toLowerCase()}${repStatus.error ? ` — ${repStatus.error}` : ''}`}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              {repData.first_seen && <Field label="First seen" value={String(repData.first_seen)} />}
              {repData.last_seen && <Field label="Last seen" value={String(repData.last_seen)} />}
              {details.days_since_domain_creation != null && (
                <Field label="Domain age" value={`${details.days_since_domain_creation} days`} />
              )}
              {details.domain_reputation && (
                <Field label="Domain reputation" value={capitalize(String(details.domain_reputation))} />
              )}
            </div>
            {flags.length > 0 && (
              <div>
                <div className="text-[11px] font-medium mb-1.5" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                  Flags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {flags.map(f => (
                    <SignalLight key={f.key} label={f.label} on={details[f.key] === true} tone={f.tone} />
                  ))}
                </div>
              </div>
            )}
            {profiles.length > 0 && (
              <Field
                label={`Linked profiles (${profiles.length})`}
                value={
                  <div className="flex flex-wrap gap-1.5">
                    {profiles.map(p => (
                      <span key={p} className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                            style={{ background: palette.surface, color: palette.textSecondary, fontFamily: typography.ui }}>
                        {p}
                      </span>
                    ))}
                  </div>
                }
              />
            )}
          </>
        )}
      </div>
    </ResultCard>
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
        className="text-sm font-medium leading-snug break-words"
        style={{ color: valueColor, fontFamily: mono ? typography.mono : typography.ui, fontSize: mono ? '12px' : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

/* -------------------------------- Sources -------------------------------- */

function SourcesSection({ sources }: { sources: EmailLookupResult['sources'] }) {
  const presentKeys = Object.keys(sources);
  const expectedKeys = EXPECTED_SOURCES.map(s => s.key);
  // Expected sources first (including ones the tier excluded), then anything extra.
  const allKeys = [...expectedKeys, ...presentKeys.filter(k => !expectedKeys.includes(k))];
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(presentKeys));

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Database className="w-4 h-4" />} title={`Individual sources (${presentKeys.length} of ${allKeys.length} ran)`} />

      <div className="space-y-2">
        {allKeys.map(key => {
          const entry = sources[key];
          const { status, error } = sourceStatus(sources, key);
          const pill = statusPill(status);
          const label = EXPECTED_SOURCES.find(s => s.key === key)?.label;
          const isExpanded = expandedKeys.has(key);
          const isError = status === 'error';
          return (
            <div
              key={key}
              className="rounded-lg overflow-hidden"
              style={{
                background: isError ? `${palette.rose}0d` : palette.base,
                border: `1px solid ${isError ? `${palette.rose}40` : palette.borderDefault}`,
                opacity: !entry ? 0.75 : 1,
              }}
            >
              <button
                onClick={() => entry && toggle(key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:brightness-110"
                style={{ background: 'transparent', cursor: entry ? 'pointer' : 'default' }}
                title={error || undefined}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {entry ? (
                    isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                      : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                  ) : <span className="w-3.5 h-3.5 shrink-0" />}
                  <span className="text-sm font-semibold truncate" style={{ color: palette.textPrimary, fontFamily: typography.ui }}>
                    {key}
                  </span>
                  {label && (
                    <span className="text-xs truncate" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>
                      {label}
                    </span>
                  )}
                </span>
                <Pill label={pill.label} tone={pill.tone} />
              </button>
              {entry && isExpanded && (
                <div className="px-4 pb-4">
                  {error && (
                    <div className="text-xs mb-2" style={{ color: isError ? palette.rose : palette.textSecondary, fontFamily: typography.ui }}>
                      {error}
                    </div>
                  )}
                  <pre
                    className="text-xs overflow-auto max-h-72 rounded-md p-3"
                    style={{ background: palette.void, color: palette.textSecondary, fontFamily: typography.mono }}
                  >
                    {JSON.stringify(entry, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
