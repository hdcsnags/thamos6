import { supabase, EDGE_FUNCTION_URL } from './supabase';
import type { IPLookupResult, URLLookupResult, BulkIPResult, ConfiguredSources, HashLookupResult, DomainLookupResult, CVELookupResult, WalletLookupResult, EmailLookupResult } from '../types';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

export async function lookupIP(ip: string): Promise<IPLookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/ip`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ip }),
  });

  if (!response.ok) {
    throw new Error(`Failed to lookup IP: ${response.statusText}`);
  }

  return response.json();
}

export async function scanURL(url: string): Promise<URLLookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/url`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Failed to scan URL: ${response.statusText}`);
  }

  const data: any = await response.json();

  // Normalize URL sources so UI components can render consistently.
  // Edge currently returns:
  //   { url, isMalicious, threatTypes, results: { [source]: { source, data, error?, threatScore?, isMalicious? } } }
  // Most front-end components prefer:
  //   results: { [source]: { found, malicious, details, error?, threatScore? } }
  // We keep the original under `rawResults` for debugging.
  const rawResults = data?.results ?? {};

  // Map edge function keys to canonical frontend keys
  const keyMapping: Record<string, string> = {
    'virustotal_url': 'virustotal',
    'urlhaus_url': 'urlhaus',
    'urlscan': 'urlscan',
  };

  const normalized: Record<string, any> = {};
  for (const [source, v] of Object.entries(rawResults)) {
    const r: any = v;
    const details = r?.details ?? r?.data ?? {};
    const found = !r?.error && details && typeof details === 'object' && Object.keys(details).length > 0;

    // Use canonical key if mapping exists, otherwise use original
    const canonicalKey = keyMapping[source] || source;

    normalized[canonicalKey] = {
      found,
      malicious: Boolean(r?.malicious ?? r?.isMalicious),
      details,
      error: r?.error,
      threatScore: typeof r?.threatScore === 'number' ? r.threatScore : undefined,
    };
  }

  const scores = Object.values(rawResults)
    .map((r: any) => (typeof r?.threatScore === 'number' ? r.threatScore : undefined))
    .filter((n): n is number => typeof n === 'number');
  const overallThreatScore = typeof data?.overallThreatScore === 'number'
    ? data.overallThreatScore
    : (scores.length ? Math.max(...scores) : 0);

  return {
    ...data,
    overallThreatScore,
    rawResults,
    results: normalized,
  } as URLLookupResult;
}

export function isValidHash(hash: string): boolean {
  const h = hash.trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(h) || /^[a-f0-9]{40}$/.test(h) || /^[a-f0-9]{64}$/.test(h);
}

export interface UrlscanDetonation {
  ready: boolean;
  error?: string;
  submitted?: boolean;
  uuid?: string | null;
  url?: string | null;
  time?: string | null;
  reportUrl?: string | null;
  screenshotUrl?: string | null;
  verdicts?: {
    score: number;
    malicious: boolean;
    hasVerdicts: boolean;
    categories: string[];
    brands: string[];
  };
  page?: {
    url: string | null; domain: string | null; ip: string | null;
    asn: string | null; asnname: string | null; country: string | null;
    city: string | null; server: string | null; title: string | null;
    status: number | string | null; mimeType: string | null;
    tlsIssuer: string | null; tlsValidFrom: string | null;
  };
  redirectChain?: string[];
  linkDomains?: string[];
  counts?: { requests: number; urls: number; domains: number; ips: number };
  maliciousRequests?: number;
}

/** Poll the finished urlscan.io detonation for a scan submitted during a URL lookup. */
export async function fetchUrlscanResult(uuid: string, url?: string): Promise<UrlscanDetonation> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/urlscan-result`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ uuid, url }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch urlscan result: ${response.statusText}`);
  }

  return response.json();
}

export function getSourceDisplayName(source: string): string {
  const map: Record<string, string> = {
    virustotal: "VirusTotal",
    virustotal_hash: "VirusTotal",
    virustotal_domain: "VirusTotal",
    virustotal_url: "VirusTotal",
    malwarebazaar: "MalwareBazaar",
    hybridanalysis: "Hybrid Analysis",
    hybrid_analysis: "Hybrid Analysis",
    otx: "AlienVault OTX",
    alienvault: "AlienVault OTX",
    urlhaus: "URLhaus",
    urlhaus_url: "URLhaus",
    abuseipdb: "AbuseIPDB",
    proxycheck: "ProxyCheck",
    ipqualityscore: "IPQualityScore",
    whois: "WHOIS/RDAP",
  };
  return map[source] ?? source;
}

export async function lookupHash(hash: string): Promise<HashLookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/hash`, {
    method: "POST",
    headers,
    body: JSON.stringify({ hash }),
  });

  if (!response.ok) {
    throw new Error(`Failed to lookup hash: ${response.statusText}`);
  }

  return response.json();
}

export async function lookupDomain(domain: string): Promise<DomainLookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/domain`, {
    method: "POST",
    headers,
    body: JSON.stringify({ domain }),
  });

  if (!response.ok) {
    throw new Error(`Failed to lookup domain: ${response.statusText}`);
  }

  return response.json();
}

export async function lookupCVE(cve: string): Promise<CVELookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/cve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ cve }),
  });

  if (!response.ok) {
    let message = `Failed to lookup CVE: ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // response had no JSON body; keep the status-based message
    }
    throw new Error(message);
  }

  return response.json();
}

export async function lookupWallet(address: string): Promise<WalletLookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/wallet`, {
    method: "POST",
    headers,
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    let message = `Failed to lookup wallet: ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // no JSON body; keep the status-based message
    }
    throw new Error(message);
  }

  return response.json();
}

export async function lookupEmail(email: string): Promise<EmailLookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    let message = `Failed to lookup email: ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // no JSON body; keep the status-based message
    }
    throw new Error(message);
  }

  return response.json();
}

export async function bulkLookupIPs(ips: string[]): Promise<{ results: BulkIPResult[]; total: number; tier?: string; batchId?: string }> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ips }),
  });

  if (!response.ok) {
    throw new Error(`Failed to bulk lookup IPs: ${response.statusText}`);
  }

  return response.json();
}

// Instant read of a persisted scan artifact — no external calls. Used to
// drill down from a Bulk Lookup row into the full IPResult view without
// re-running the whole scan pipeline for evidence that already exists.
export async function getIPArtifact(artifactId: string): Promise<IPLookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/ip/artifact`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: artifactId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load scan artifact: ${response.statusText}`);
  }

  return response.json();
}

// Upgrades a bulk-scanned artifact to full single-IP source coverage
// (AlienVault, full Shodan, DShield, RDAP, Team Cymru, VPNAPI, VT
// resolutions, passive DNS, Censys, IPHub) and overwrites it in place.
// The IP is derived server-side from the stored artifact — not supplied
// here — so a stale/mismatched id can't enrich the wrong address.
export async function deepEnrichIPArtifact(artifactId: string): Promise<IPLookupResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/ip/deep-enrich`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: artifactId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to deep-enrich IP: ${response.statusText}`);
  }

  return response.json();
}

export async function getConfiguredSources(): Promise<{
  configured: ConfiguredSources;
  tier?: string;
  sourcesAvailable?: string[];
  user?: { email: string } | null;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${EDGE_FUNCTION_URL}/config`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to get config: ${response.statusText}`);
  }

  return response.json();
}

export function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every(part => part >= 0 && part <= 255);
  }

  return ipv6Regex.test(ip);
}

export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
