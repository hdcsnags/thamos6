import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TI_URL = `${SUPABASE_URL}/functions/v1/threat-intel`;

// Pull token from request for forwarding to threat-intel
function bearerToken(req: Request): string {
  return req.headers.get("authorization") ?? "";
}

function extractURLs(text: string): string[] {
  const re = /https?:\/\/[^\s<>"'\])}]+/gi;
  return [...new Set(text.match(re) ?? [])];
}

function extractIPs(text: string): string[] {
  const re = /\b(\d{1,3}\.){3}\d{1,3}\b/g;
  return [...new Set(text.match(re) ?? [])].filter(
    (ip) =>
      !ip.startsWith("10.") &&
      !ip.startsWith("192.168.") &&
      !ip.startsWith("127.") &&
      !ip.startsWith("0.")
  );
}

function extractEmails(text: string): string[] {
  const re = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;
  return [...new Set(text.match(re) ?? [])];
}

function domainFromURL(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function enrichURL(url: string, auth: string): Promise<any> {
  try {
    const res = await fetch(`${TI_URL}/url`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { url, error: String(e) };
  }
}

async function enrichDomain(domain: string, auth: string): Promise<any> {
  try {
    const res = await fetch(`${TI_URL}/domain`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { domain, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { domain, error: String(e) };
  }
}

async function enrichIP(ip: string, auth: string): Promise<any> {
  try {
    const res = await fetch(`${TI_URL}/ip`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { ip, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { ip, error: String(e) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const body = await req.json();
    const { headers: rawHeaders = "", emailBody = "" } = body as {
      headers?: string;
      emailBody?: string;
    };

    if (!rawHeaders && !emailBody) {
      return new Response(
        JSON.stringify({ error: "headers or emailBody required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const fullText = rawHeaders + "\n" + emailBody;
    const auth = bearerToken(req);

    // Extract all IOC types
    const urls = extractURLs(fullText).slice(0, 10);
    const domains = [
      ...new Set(urls.map(domainFromURL).filter(Boolean)),
    ].slice(0, 10);
    const ips = extractIPs(fullText).slice(0, 5);
    const emails = extractEmails(fullText).slice(0, 10);

    // Fan-out enrichment (parallel, capped)
    const [urlResults, domainResults, ipResults] = await Promise.all([
      Promise.all(urls.map((u) => enrichURL(u, auth))),
      Promise.all(domains.map((d) => enrichDomain(d, auth))),
      Promise.all(ips.map((ip) => enrichIP(ip, auth))),
    ]);

    const totalScore = [...urlResults, ...domainResults, ...ipResults]
      .map((r) => r?.aggregated?.threatScore ?? 0)
      .reduce((sum, s) => sum + s, 0);

    const isMalicious = [...urlResults, ...domainResults, ...ipResults].some(
      (r) => r?.aggregated?.isMalicious
    );

    return new Response(
      JSON.stringify({
        iocs: {
          urls: urls.map((v, i) => ({
            value: v,
            enrichment: urlResults[i],
          })),
          domains: domains.map((v, i) => ({
            value: v,
            enrichment: domainResults[i],
          })),
          ips: ips.map((v, i) => ({ value: v, enrichment: ipResults[i] })),
          emails,
        },
        summary: {
          totalScore,
          isMalicious,
          urlCount: urls.length,
          domainCount: domains.length,
          ipCount: ips.length,
          emailCount: emails.length,
        },
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
