import { useMemo, useState } from 'react';
import { ArrowUpRight, GitBranch } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { toneColor } from '../results';
import type { BulkIPResult } from '../../types';
import { computeClusters, type BatchCluster } from './clusterUtils';
import { verdictFor } from './verdict';

interface Point { x: number; y: number; }

interface CorrelationMapProps {
  results: BulkIPResult[];
  onDrillDown?: (ip: string, artifactId?: string) => void;
  onViewInTriage?: (ips: string[]) => void;
}

const VIEW_W = 800;
const VIEW_H = 480;
const CENTER: Point = { x: VIEW_W / 2, y: VIEW_H / 2 };

function verdictHex(result: BulkIPResult): string {
  return toneColor[verdictFor(result).tone];
}

/** Places cluster hubs on an inner ring, member IPs on a small ring around each hub, and outliers on an outer ring. */
function useLayout(results: BulkIPResult[], clusters: BatchCluster[], outlierIPs: string[]) {
  return useMemo(() => {
    const byIP = new Map(results.map(r => [r.ip, r]));
    const hubPos: Point[] = clusters.map((_, i) => {
      const angle = (i / Math.max(clusters.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const r = clusters.length <= 1 ? 0 : Math.min(VIEW_W, VIEW_H) * 0.24;
      return { x: CENTER.x + Math.cos(angle) * r, y: CENTER.y + Math.sin(angle) * r * 0.82 };
    });

    const nodePos = new Map<string, Point>();
    const edges: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];

    clusters.forEach((cluster, ci) => {
      const hub = hubPos[ci];
      cluster.members.forEach((ip, mi) => {
        let pos = nodePos.get(ip);
        if (!pos) {
          const angle = (mi / Math.max(cluster.members.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const r = 52;
          pos = { x: hub.x + Math.cos(angle) * r, y: hub.y + Math.sin(angle) * r };
          nodePos.set(ip, pos);
        }
        edges.push({ x1: hub.x, y1: hub.y, x2: pos.x, y2: pos.y, color: cluster.color });
      });
    });

    outlierIPs.forEach((ip, oi) => {
      if (nodePos.has(ip)) return;
      const angle = (oi / Math.max(outlierIPs.length, 1)) * Math.PI * 2 - Math.PI / 2 + 0.35;
      const r = Math.min(VIEW_W, VIEW_H) * 0.44;
      nodePos.set(ip, { x: CENTER.x + Math.cos(angle) * r, y: CENTER.y + Math.sin(angle) * r * 0.92 });
    });

    // Light "one-off context" edges: pairs of IPs sharing only a country, capped
    // to small groups so this stays a hint, not a hairball, when toggled on.
    const byCountry = new Map<string, string[]>();
    for (const r of results) {
      if (!r.countryCode) continue;
      if (!byCountry.has(r.countryCode)) byCountry.set(r.countryCode, []);
      byCountry.get(r.countryCode)!.push(r.ip);
    }
    const contextEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const ips of byCountry.values()) {
      if (ips.length < 2 || ips.length > 4) continue;
      for (let i = 0; i < ips.length; i++) {
        for (let j = i + 1; j < ips.length; j++) {
          const a = nodePos.get(ips[i]);
          const b = nodePos.get(ips[j]);
          if (a && b) contextEdges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        }
      }
    }

    return { hubPos, nodePos, edges, contextEdges, byIP };
  }, [results, clusters, outlierIPs]);
}

export function CorrelationMap({ results, onDrillDown, onViewInTriage }: CorrelationMapProps) {
  const { clusters, outlierIPs } = useMemo(() => computeClusters(results), [results]);
  const { hubPos, nodePos, edges, contextEdges, byIP } = useLayout(results, clusters, outlierIPs);
  const [selectedCluster, setSelectedCluster] = useState<BatchCluster | null>(null);
  const [selectedIP, setSelectedIP] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);

  if (results.length === 0) return null;

  return (
    <div className="flex gap-3.5" style={{ height: 'calc(100vh - 320px)', minHeight: 460 }}>
      <div className="flex-1 min-w-0 rounded-lg relative" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
        {clusters.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8">
            <p className="text-sm" style={{ color: palette.textTertiary }}>
              No shared ASN, VPN provider, or threat-feed tag across this batch — every IP in this batch is an outlier relative to the others.
            </p>
          </div>
        ) : null}
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-full block">
          {showContext && contextEdges.map((e, i) => (
            <line key={`ctx-${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={palette.textDisabled} strokeOpacity={0.35} strokeDasharray="3,3" strokeWidth={1} />
          ))}
          {edges.map((e, i) => (
            <line key={`edge-${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.color} strokeOpacity={0.45} strokeWidth={1.5} />
          ))}
          {clusters.map((cluster, ci) => {
            const hub = hubPos[ci];
            return (
              <g key={cluster.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedCluster(cluster); setSelectedIP(null); }}>
                <circle cx={hub.x} cy={hub.y} r={26} fill={cluster.color} fillOpacity={selectedCluster?.id === cluster.id ? 0.28 : 0.16} stroke={cluster.color} strokeWidth={selectedCluster?.id === cluster.id ? 2 : 1.5} />
                <text x={hub.x} y={hub.y + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={cluster.color} fontFamily={typography.mono}>{cluster.members.length}</text>
                <text x={hub.x} y={hub.y - 36} textAnchor="middle" fontSize={10.5} fill={palette.textSecondary} fontFamily={typography.ui}>
                  {cluster.label.length > 26 ? cluster.label.slice(0, 24) + '…' : cluster.label}
                </text>
              </g>
            );
          })}
          {[...nodePos.entries()].map(([ip, pos]) => {
            const r = byIP.get(ip);
            if (!r) return null;
            return (
              <g key={ip} style={{ cursor: 'pointer' }} onClick={() => { setSelectedIP(ip); setSelectedCluster(null); }}>
                <circle
                  cx={pos.x} cy={pos.y} r={selectedIP === ip ? 10 : 8}
                  fill={verdictHex(r)} fillOpacity={0.9} stroke={palette.void} strokeWidth={selectedIP === ip ? 2.5 : 1.5}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="w-[280px] shrink-0 flex flex-col gap-3">
        <div className="rounded-lg p-3.5" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: palette.textTertiary }}>Legend</h3>
          {[
            { color: palette.accent, label: 'Shared ASN / hosting org' },
            { color: palette.cyan, label: 'Shared VPN provider' },
            { color: palette.rose, label: 'Shared threat-feed tag' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2 py-1 text-xs" style={{ color: palette.textSecondary }}>
              <span className="w-4 h-0.5 shrink-0" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
          <div className="flex items-center gap-2 py-1 text-xs" style={{ color: palette.textSecondary }}>
            <span className="w-4 h-0 shrink-0" style={{ borderTop: `2px dashed ${palette.textDisabled}` }} />
            Outlier — no shared infra
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 text-xs" style={{ borderTop: `1px solid ${palette.borderSubtle}`, color: palette.textSecondary }}>
            <span>Show one-off context (country)</span>
            <button
              onClick={() => setShowContext(v => !v)}
              className="w-8 h-[18px] rounded-full relative transition-colors"
              style={{ background: showContext ? 'rgba(51,153,216,0.25)' : palette.float, border: `1px solid ${showContext ? palette.accent : palette.borderDefault}` }}
            >
              <span className="absolute top-[1px] w-3.5 h-3.5 rounded-full transition-transform" style={{ left: 1, transform: showContext ? 'translateX(14px)' : 'translateX(0)', background: showContext ? palette.accent : palette.textTertiary }} />
            </button>
          </div>
        </div>

        <div className="rounded-lg p-3.5 flex-1 overflow-y-auto" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide mb-2.5 flex items-center gap-1.5" style={{ color: palette.textTertiary }}>
            <GitBranch className="w-3 h-3" /> {selectedCluster ? 'Cluster inspector' : selectedIP ? 'IP detail' : 'Cluster inspector'}
          </h3>
          {!selectedCluster && !selectedIP && (
            <p className="text-xs" style={{ color: palette.textDisabled }}>
              Click a hub to see its members and what they share, or click an IP node for a quick summary.
            </p>
          )}
          {selectedCluster && (
            <div>
              <div className="text-[13px] font-semibold mb-1.5" style={{ color: selectedCluster.color }}>{selectedCluster.label}</div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: palette.textSecondary }}>{selectedCluster.shared}</p>
              <div className="space-y-1.5">
                {selectedCluster.members.map(ip => {
                  const r = byIP.get(ip);
                  if (!r) return null;
                  const v = verdictFor(r);
                  return (
                    <div key={ip} className="flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs" style={{ background: palette.float, border: `1px solid ${palette.borderSubtle}` }}>
                      <span style={{ fontFamily: typography.mono, color: palette.textPrimary }}>{ip}</span>
                      <span style={{ color: toneColor[v.tone] }}>{v.label}</span>
                    </div>
                  );
                })}
              </div>
              {onViewInTriage && (
                <button
                  onClick={() => onViewInTriage(selectedCluster.members)}
                  className="w-full mt-3 h-8 rounded-md flex items-center justify-center gap-1.5 text-xs font-medium transition-colors hover:brightness-125"
                  style={{ background: palette.float, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}
                >
                  View all in Triage <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {selectedIP && (() => {
            const r = byIP.get(selectedIP);
            if (!r) return null;
            const v = verdictFor(r);
            const score = r.scoring?.calibrated ?? r.threatScore;
            return (
              <div>
                <div className="text-[15px] font-semibold mb-1.5" style={{ fontFamily: typography.mono, color: palette.textPrimary }}>{selectedIP}</div>
                <div className="text-xs font-semibold mb-2.5" style={{ color: toneColor[v.tone] }}>{v.label} · {score}</div>
                <div className="text-xs" style={{ color: palette.textTertiary }}>{r.org || 'Unknown org'}</div>
                <div className="text-xs mt-1" style={{ color: palette.textTertiary }}>
                  {r.country || 'Unknown location'}
                  {r.isVPN ? ` · VPN${r.vpnService ? ` (${r.vpnService})` : ''}` : ''}
                  {r.isTor ? ' · Tor exit' : ''}
                </div>
                {onDrillDown && (
                  <button
                    onClick={() => onDrillDown(selectedIP, r.artifactId ?? undefined)}
                    className="w-full mt-3.5 h-8 rounded-md flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors hover:brightness-125"
                    style={{ background: palette.accent, color: palette.void }}
                  >
                    Open full report <ArrowUpRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
