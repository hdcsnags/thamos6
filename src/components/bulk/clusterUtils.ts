import { palette } from '../../design-system/tokens';
import type { BulkIPResult } from '../../types';

export type ClusterKind = 'org' | 'vpn' | 'tag';

export interface BatchCluster {
  id: string;
  kind: ClusterKind;
  /** Short label shown on the hub, e.g. "DigitalOcean LLC" or "NordVPN pool". */
  label: string;
  /** One-line explanation of what members share, for the inspector panel. */
  shared: string;
  color: string;
  members: string[]; // IP addresses
}

/**
 * Groups a bulk batch by shared hosting org, shared VPN provider, and shared
 * threat-feed tags (ThreatFox / URLhaus / Spamhaus list). This runs entirely
 * client-side against data the /bulk response already returns — no backend
 * change needed. An IP can appear in more than one cluster (e.g. a VPN exit
 * that's also ThreatFox-tagged); it only counts as an "outlier" if it isn't
 * in any cluster at all.
 */
export function computeClusters(results: BulkIPResult[]): { clusters: BatchCluster[]; outlierIPs: string[] } {
  const clusters: BatchCluster[] = [];
  const clustered = new Set<string>();

  const groupBy = <T,>(getKey: (r: BulkIPResult) => T | null | undefined) => {
    const map = new Map<string, string[]>();
    for (const r of results) {
      const key = getKey(r);
      if (key == null || key === '') continue;
      const k = String(key);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r.ip);
    }
    return map;
  };

  // Shared hosting org / ASN proxy.
  for (const [org, ips] of groupBy(r => r.org?.trim())) {
    if (ips.length < 2) continue;
    clusters.push({ id: `org:${org}`, kind: 'org', label: org, shared: `Shared hosting org — ${org}. Likely shared infrastructure, not shared intent.`, color: palette.accent, members: ips });
    ips.forEach(ip => clustered.add(ip));
  }

  // Shared VPN provider.
  for (const [svc, ips] of groupBy(r => (r.isVPN ? r.vpnService?.trim() : null))) {
    if (ips.length < 2) continue;
    clusters.push({ id: `vpn:${svc}`, kind: 'vpn', label: `${svc} pool`, shared: `Shared VPN provider — ${svc}. Expect mixed reputations across exits.`, color: palette.cyan, members: ips });
    ips.forEach(ip => clustered.add(ip));
  }

  // Shared threat-feed tags.
  const tagGroups = new Map<string, string[]>();
  const pushTag = (tag: string, ip: string) => {
    if (!tagGroups.has(tag)) tagGroups.set(tag, []);
    tagGroups.get(tag)!.push(ip);
  };
  for (const r of results) {
    if (r.inThreatFox) pushTag('ThreatFox', r.ip);
    if (r.inURLhaus) pushTag('URLhaus', r.ip);
    for (const list of r.spamhausLists ?? []) pushTag(`Spamhaus: ${list}`, r.ip);
    for (const list of r.blocklistdeLists ?? []) pushTag(`Blocklist.de: ${list}`, r.ip);
  }
  for (const [tag, ips] of tagGroups) {
    if (ips.length < 2) continue;
    clusters.push({ id: `tag:${tag}`, kind: 'tag', label: tag, shared: `Shared threat-feed tag — ${tag}.`, color: palette.rose, members: [...new Set(ips)] });
    ips.forEach(ip => clustered.add(ip));
  }

  const outlierIPs = results.map(r => r.ip).filter(ip => !clustered.has(ip));
  return { clusters, outlierIPs };
}
