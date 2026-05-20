import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const TI_URL = `${SUPABASE_URL}/functions/v1/threat-intel`;

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

function checkIDN(domain: string): boolean {
  return (
    domain.startsWith("xn--") ||
    domain.split(".").some((label) => label.startsWith("xn--")) ||
    /[^\x00-\x7F]/.test(domain)
  );
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

async function enrichEmail(email: string): Promise<any> {
  try {
    const res = await fetch(`https://emailrep.io/${encodeURIComponent(email)}`, {
      headers: { "User-Agent": "ThamOS/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { email, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { email, error: String(e) };
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

    const urls = extractURLs(fullText).slice(0, 10);
    const domains = [
      ...new Set(urls.map(domainFromURL).filter(Boolean)),
    ].slice(0, 10);
    const ips = extractIPs(fullText).slice(0, 5);
    const emails = extractEmails(fullText).slice(0, 10);

    const idnDomains = domains.filter(checkIDN);

    const [urlResults, domainResults, ipResults, emailResults] = await Promise.all([
      Promise.all(urls.map((u) => enrichURL(u, auth))),
      Promise.all(domains.map((d) => enrichDomain(d, auth))),
      Promise.all(ips.map((ip) => enrichIP(ip, auth))),
      Promise.all(emails.map((e) => enrichEmail(e))),
    ]);

    const allResults = [...urlResults, ...domainResults, ...ipResults];
    const scores = allResults.map((r) => r?.overallThreatScore ?? r?.maxThreatScore ?? 0);
    const totalScore = scores.length > 0 ? Math.max(...scores) : 0;
    const isMalicious = allResults.some((r) => r?.isMalicious === true);

    return new Response(
      JSON.stringify({
        iocs: {
          urls: urls.map((v, i) => ({ value: v, enrichment: urlResults[i] })),
          domains: domains.map((v, i) => ({
            value: v,
            enrichment: domainResults[i],
            isIDN: checkIDN(v),
          })),
          ips: ips.map((v, i) => ({ value: v, enrichment: ipResults[i] })),
          emails: emails.map((v, i) => ({ value: v, enrichment: emailResults[i] })),
        },
        summary: {
          totalScore,
          isMalicious,
          urlCount: urls.length,
          domainCount: domains.length,
          ipCount: ips.length,
          emailCount: emails.length,
          idnDomains,
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
