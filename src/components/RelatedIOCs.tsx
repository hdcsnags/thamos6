import { useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, GitBranch, ListTree } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { palette, typography } from '../design-system/tokens';

interface Relationship {
  id: string;
  source_type: string;
  source_value: string;
  target_type: string;
  target_value: string;
  edge_type: string;
  first_seen: string | null;
  last_seen: string | null;
  observation_count: number;
  confidence: string;
  source_dataset: string;
  metadata?: Record<string, unknown>;
}

interface ScanObservation {
  id: string;
  verdict: string;
  threat_score: number | null;
  confidence: string | null;
  sources_checked: string[];
  observed_at: string;
}

interface RelatedIOCsProps {
  iocType: 'ip' | 'domain' | 'hash' | 'url';
  iocValue: string;
  onScan?: (type: string, value: string) => void;
}

type View = 'graph' | 'relationships' | 'history';

const EDGE_LABELS: Record<string, string> = {
  resolves_to: 'resolves to',
  cert_san: 'certificate SAN',
  hosted_on: 'hosted on',
  signed_by: 'signed by',
  seen_with: 'seen with',
  related_hash: 'related hash',
  extracted_from_email: 'extracted from email',
  sent_by: 'sent by',
  announced_by: 'announced by',
  located_in: 'located in',
  operated_by: 'operated by',
  uses_vpn_provider: 'VPN provider',
};

const TYPE_COLOR: Record<string, string> = {
  ip: palette.accent,
  domain: palette.green,
  hash: palette.amber,
  url: palette.rose,
  asn: palette.blue,
  country: palette.teal,
  region: palette.teal,
  organization: palette.textSecondary,
  vpn_provider: palette.amber,
  email: palette.rose,
};

const SCANNABLE_TYPES = new Set(['ip', 'domain', 'hash', 'url']);

function shortValue(value: string, length = 34) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function formatTime(value: string | null) {
  if (!value) return 'unknown';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function peerFor(rel: Relationship, iocType: string, iocValue: string) {
  const normalized = iocValue.toLowerCase();
  const outbound = rel.source_type === iocType && rel.source_value === normalized;
  return outbound
    ? { type: rel.target_type, value: rel.target_value, direction: 'out' as const }
    : { type: rel.source_type, value: rel.source_value, direction: 'in' as const };
}

export function RelatedIOCs({ iocType, iocValue, onScan }: RelatedIOCsProps) {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [observations, setObservations] = useState<ScanObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('graph');

  useEffect(() => {
    if (!iocValue) return;
    let cancelled = false;
    setLoading(true);
    const normalizedValue = iocValue.toLowerCase();

    Promise.all([
      supabase
        .from('ioc_relationships')
        .select('*')
        .eq('source_type', iocType)
        .eq('source_value', normalizedValue)
        .order('observation_count', { ascending: false })
        .limit(50),
      supabase
        .from('ioc_relationships')
        .select('*')
        .eq('target_type', iocType)
        .eq('target_value', normalizedValue)
        .order('observation_count', { ascending: false })
        .limit(50),
      supabase
        .from('scan_observations')
        .select('id,verdict,threat_score,confidence,sources_checked,observed_at')
        .eq('ioc_type', iocType)
        .eq('ioc_value', normalizedValue)
        .order('observed_at', { ascending: false })
        .limit(50),
    ]).then(([outRes, inRes, observationRes]) => {
      if (cancelled) return;
      const unique = new Map<string, Relationship>();
      [...(outRes.data || []), ...(inRes.data || [])].forEach(rel => unique.set(rel.id, rel));
      setRelationships([...unique.values()]);
      setObservations(observationRes.data || []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [iocType, iocValue]);

  const graphEdges = useMemo(() => relationships.slice(0, 18).map(rel => ({
    rel,
    peer: peerFor(rel, iocType, iocValue),
  })), [relationships, iocType, iocValue]);

  const totalEdgeObservations = relationships.reduce((sum, rel) => sum + rel.observation_count, 0);
  const maliciousObservations = observations.filter(item => item.verdict === 'malicious').length;
  const latestObservation = observations[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs animate-pulse" style={{ color: palette.textTertiary }}>Loading investigation history…</span>
      </div>
    );
  }

  const tabs: Array<{ id: View; label: string; icon: typeof GitBranch }> = [
    { id: 'graph', label: 'Graph', icon: GitBranch },
    { id: 'relationships', label: 'Relationships', icon: ListTree },
    { id: 'history', label: 'Scan history', icon: Clock3 },
  ];

  return (
    <div className="space-y-4" style={{ fontFamily: typography.ui }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          ['Scans recorded', observations.length.toString()],
          ['Active links', relationships.length.toString()],
          ['Link observations', totalEdgeObservations.toString()],
          ['Latest score', latestObservation?.threat_score?.toString() ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg px-3 py-2" style={{ background: palette.elevated, border: `1px solid ${palette.borderDefault}` }}>
            <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: palette.textTertiary }}>{label}</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg p-1" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] transition-colors"
                style={{ color: active ? palette.textPrimary : palette.textTertiary, background: active ? palette.surface : 'transparent' }}
              >
                <Icon className="h-3.5 w-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px]" style={{ color: palette.textTertiary }}>
          Context links describe infrastructure; they do not assign guilt.
        </p>
      </div>

      {view === 'graph' && (
        graphEdges.length === 0 ? (
          <EmptyState message="No graph links yet. Scan this IP again after applying the new migration to start its context graph." />
        ) : (
          <div className="overflow-hidden rounded-xl" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
            <svg viewBox="0 0 900 520" className="block h-auto min-h-[360px] w-full" role="img" aria-label={`Relationship graph for ${iocValue}`}>
              <defs>
                <radialGradient id="graph-field">
                  <stop offset="0" stopColor={palette.surface} stopOpacity="0.75" />
                  <stop offset="1" stopColor={palette.base} stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="900" height="520" fill={`url(#graph-field)`} />
              {graphEdges.map(({ rel }, index) => {
                const angle = (Math.PI * 2 * index) / graphEdges.length - Math.PI / 2;
                const radiusX = graphEdges.length < 6 ? 245 : 330;
                const radiusY = graphEdges.length < 6 ? 150 : 195;
                const x = 450 + Math.cos(angle) * radiusX;
                const y = 260 + Math.sin(angle) * radiusY;
                return (
                  <g key={`edge-${rel.id}`}>
                    <line x1="450" y1="260" x2={x} y2={y} stroke={palette.borderActive} strokeWidth={Math.min(1 + rel.observation_count / 4, 4)} />
                    <text x={(450 + x) / 2} y={(260 + y) / 2 - 5} fill={palette.textDisabled} fontSize="9" textAnchor="middle">
                      {EDGE_LABELS[rel.edge_type] || rel.edge_type} · {rel.observation_count}×
                    </text>
                  </g>
                );
              })}
              {graphEdges.map(({ rel, peer }, index) => {
                const angle = (Math.PI * 2 * index) / graphEdges.length - Math.PI / 2;
                const radiusX = graphEdges.length < 6 ? 245 : 330;
                const radiusY = graphEdges.length < 6 ? 150 : 195;
                const x = 450 + Math.cos(angle) * radiusX;
                const y = 260 + Math.sin(angle) * radiusY;
                const color = TYPE_COLOR[peer.type] || palette.textSecondary;
                const scannable = Boolean(onScan && SCANNABLE_TYPES.has(peer.type));
                return (
                  <g key={`node-${rel.id}`} onClick={() => scannable && onScan?.(peer.type, peer.value)} style={{ cursor: scannable ? 'pointer' : 'default' }}>
                    <circle cx={x} cy={y} r="28" fill={palette.elevated} stroke={color} strokeWidth="1.5" />
                    <text x={x} y={y - 3} fill={color} fontSize="9" fontWeight="700" textAnchor="middle">{peer.type.toUpperCase()}</text>
                    <text x={x} y={y + 11} fill={palette.textSecondary} fontSize="8" textAnchor="middle">{shortValue(peer.value, 22)}</text>
                    <title>{peer.value}</title>
                  </g>
                );
              })}
              <circle cx="450" cy="260" r="48" fill={palette.float} stroke={TYPE_COLOR[iocType] || palette.accent} strokeWidth="2" />
              <text x="450" y="254" fill={TYPE_COLOR[iocType] || palette.accent} fontSize="11" fontWeight="700" textAnchor="middle">{iocType.toUpperCase()}</text>
              <text x="450" y="272" fill={palette.textPrimary} fontSize="10" textAnchor="middle">{shortValue(iocValue, 28)}</text>
            </svg>
            {relationships.length > graphEdges.length && (
              <div className="px-4 py-2 text-[10px]" style={{ borderTop: `1px solid ${palette.borderSubtle}`, color: palette.textTertiary }}>
                Showing the 18 strongest links. Use Relationships for all {relationships.length}.
              </div>
            )}
          </div>
        )
      )}

      {view === 'relationships' && (
        relationships.length === 0 ? <EmptyState message="No relationships recorded yet." /> : (
          <div className="space-y-1.5">
            {relationships.map(rel => {
              const peer = peerFor(rel, iocType, iocValue);
              const color = TYPE_COLOR[peer.type] || palette.textSecondary;
              return (
                <div key={rel.id} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color, border: `1px solid ${color}55` }}>{peer.type}</span>
                  <span className="min-w-0 flex-1 truncate text-xs" style={{ color: palette.textPrimary, fontFamily: typography.mono }} title={peer.value}>{peer.value}</span>
                  <span className="text-[10px]" style={{ color: palette.textTertiary }}>{peer.direction === 'out' ? '→' : '←'} {EDGE_LABELS[rel.edge_type] || rel.edge_type}</span>
                  <span className="text-[10px]" style={{ color: palette.textTertiary }}>{rel.observation_count}× · {formatTime(rel.last_seen)}</span>
                  {onScan && SCANNABLE_TYPES.has(peer.type) && (
                    <button onClick={() => onScan(peer.type, peer.value)} className="rounded px-2 py-1 text-[10px]" style={{ color: palette.accent, border: `1px solid ${palette.borderDefault}` }}>Scan</button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {view === 'history' && (
        observations.length === 0 ? <EmptyState message="No longitudinal scan history is visible for this indicator yet." /> : (
          <div className="space-y-1.5">
            {observations.map((observation, index) => {
              const danger = observation.verdict === 'malicious';
              const warning = observation.verdict === 'suspicious';
              const color = danger ? palette.rose : warning ? palette.amber : palette.green;
              return (
                <div key={observation.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                  <Activity className="h-4 w-4 flex-none" style={{ color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium" style={{ color }}>{observation.verdict.replace(/_/g, ' ')}</span>
                      {index === 0 && <span className="text-[9px] uppercase tracking-wider" style={{ color: palette.textTertiary }}>latest</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[10px]" style={{ color: palette.textTertiary }}>
                      {formatTime(observation.observed_at)} · {observation.sources_checked.length} sources · {observation.confidence || 'unrated'} confidence
                    </div>
                  </div>
                  <div className="text-lg font-semibold" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{observation.threat_score ?? '—'}</div>
                </div>
              );
            })}
            {maliciousObservations > 0 && (
              <p className="pt-1 text-[10px]" style={{ color: palette.textTertiary }}>{maliciousObservations} of {observations.length} recorded scans returned a malicious verdict.</p>
            )}
          </div>
        )
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl py-12 text-center" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
      <GitBranch className="mx-auto mb-3 h-6 w-6" style={{ color: palette.textDisabled }} />
      <p className="text-xs" style={{ color: palette.textTertiary }}>{message}</p>
    </div>
  );
}
