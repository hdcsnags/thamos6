import { supabase, EDGE_FUNCTION_URL } from './supabase';
import type { IPLookupResult, URLLookupResult, BulkIPResult, ConfiguredSources } from '../types';

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
