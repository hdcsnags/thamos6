import { supabase, EDGE_FUNCTION_URL } from './supabase';
import type { IPLookupResult, URLLookupResult, BulkIPResult, ConfiguredSources, HashLookupResult } from '../types';

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

  const normalized: Record<string, any> = {};
  for (const [source, v] of Object.entries(rawResults)) {
    const r: any = v;
    const details = r?.details ?? r?.data ?? {};
    const found = !r?.error && details && typeof details === 'object' && Object.keys(details).length > 0;
    normalized[source] = {
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

export function getSourceDisplayName(source: string): string {
  const map: Record<string, string> = {
    virustotal: "VirusTotal",
    virustotal_hash: "VirusTotal",
    malwarebazaar: "MalwareBazaar",
    hybridanalysis: "Hybrid Analysis",
    hybrid_analysis: "Hybrid Analysis",
    otx: "AlienVault OTX",
    alienvault: "AlienVault OTX",
    urlhaus: "URLhaus",
    abuseipdb: "AbuseIPDB",
    proxycheck: "ProxyCheck",
    ipqualityscore: "IPQualityScore",
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

export async function bulkLookupIPs(ips: string[]): Promise<{ results: BulkIPResult[]; total: number; tier?: string }> {
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
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

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
