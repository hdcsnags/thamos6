import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
}

interface RelatedIOCsProps {
  iocType: 'ip' | 'domain' | 'hash' | 'url';
  iocValue: string;
  onScan?: (type: string, value: string) => void;
}

const EDGE_LABELS: Record<string, string> = {
  resolves_to: 'Resolves to',
  cert_san: 'Cert SAN',
  hosted_on: 'Hosted on',
  signed_by: 'Signed by',
  seen_with: 'Seen with',
  related_hash: 'Related hash',
};

const TYPE_COLOR: Record<string, string> = {
  ip: '#00d9ff',
  domain: '#00ff9d',
  hash: '#fbbf24',
  url: '#ff0080',
};

function RelRow({ rel, onScan }: { rel: Relationship; onScan?: (type: string, value: string) => void }) {
  const isSource = true; // always showing outbound by default; inbound are reversed
  const peer = isSource ? { type: rel.target_type, value: rel.target_value } : { type: rel.source_type, value: rel.source_value };
  const color = TYPE_COLOR[peer.type] || '#8a8fa8';

  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded-lg transition-all group"
      style={{ border: '1px solid rgba(148,163,184,0.08)', background: 'rgba(0,0,0,0.2)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex-shrink-0"
          style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
        >
          {peer.type}
        </span>
        <span className="text-xs font-mono truncate" style={{ color: '#c8cde0' }} title={peer.value}>
          {peer.value.length > 55 ? peer.value.slice(0, 55) + '…' : peer.value}
        </span>
        <span className="text-[10px] flex-shrink-0" style={{ color: '#3a3f55' }}>
          {EDGE_LABELS[rel.edge_type] || rel.edge_type}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <div className="text-[9px] text-right hidden group-hover:block" style={{ color: '#3a3f55' }}>
          {rel.observation_count}× · {rel.source_dataset.replace(/_/g, ' ')}
        </div>
        {onScan && ['ip', 'domain', 'hash'].includes(peer.type) && (
          <button
            onClick={() => onScan(peer.type, peer.value)}
            className="text-[10px] px-2 py-0.5 rounded transition-all opacity-0 group-hover:opacity-100"
            style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
          >
            SCAN →
          </button>
        )}
      </div>
    </div>
  );
}

export function RelatedIOCs({ iocType, iocValue, onScan }: RelatedIOCsProps) {
  const [outbound, setOutbound] = useState<Relationship[]>([]);
  const [inbound, setInbound] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<'out' | 'in' | 'both'>('both');

  useEffect(() => {
    if (!iocValue) return;
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
    ]).then(([outRes, inRes]) => {
      setOutbound(outRes.data || []);
      setInbound(inRes.data || []);
      setLoading(false);
    });
  }, [iocType, iocValue]);

  const shownOut = direction === 'in' ? [] : outbound;
  const shownIn = direction === 'out' ? [] : inbound;
  const total = outbound.length + inbound.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-xs animate-pulse" style={{ color: '#3a3f55' }}>Querying relationship graph…</span>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="text-center py-10 space-y-2">
        <div className="text-2xl opacity-20">⬡</div>
        <p className="text-xs" style={{ color: '#3a3f55' }}>No relationships in graph yet</p>
        <p className="text-[10px]" style={{ color: '#3a3f55' }}>
          Relationships are built from pDNS lookups. Run a domain or IP scan to populate edges.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Direction filter */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: '#3a3f55' }}>
          {total} relationship{total !== 1 ? 's' : ''} · {outbound.length} outbound · {inbound.length} inbound
        </p>
        <div className="flex gap-1">
          {(['both', 'out', 'in'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className="text-[10px] px-2 py-0.5 rounded transition-all uppercase"
              style={{
                backgroundColor: direction === d ? 'rgba(0,217,255,0.15)' : 'transparent',
                border: `1px solid ${direction === d ? 'rgba(0,217,255,0.4)' : 'rgba(26,31,53,1)'}`,
                color: direction === d ? '#00d9ff' : '#3a3f55',
              }}
            >
              {d === 'both' ? 'All' : d === 'out' ? '→ Out' : '← In'}
            </button>
          ))}
        </div>
      </div>

      {/* Outbound (source → target) */}
      {shownOut.length > 0 && (
        <div className="space-y-1">
          {direction === 'both' && (
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#3a3f55' }}>
              Outbound ({shownOut.length})
            </p>
          )}
          {shownOut.map(r => <RelRow key={r.id} rel={r} onScan={onScan} />)}
        </div>
      )}

      {/* Inbound (target ← source) */}
      {shownIn.length > 0 && (
        <div className="space-y-1">
          {direction === 'both' && (
            <p className="text-[10px] uppercase tracking-wider mb-1 mt-3" style={{ color: '#3a3f55' }}>
              Inbound ({shownIn.length})
            </p>
          )}
          {shownIn.map(r => {
            // Flip the relationship so peer = source (what connects to us)
            const flipped: Relationship = {
              ...r,
              source_type: r.target_type,
              source_value: r.target_value,
              target_type: r.source_type,
              target_value: r.source_value,
            };
            return <RelRow key={r.id} rel={flipped} onScan={onScan} />;
          })}
        </div>
      )}
    </div>
  );
}
