import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseEmail, isWrapperHost, type ParsedEmail } from "../_shared/email-parser.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const TI_URL = `${SUPABASE_URL}/functions/v1/threat-intel`;

const MAX_RAW_EMAIL_BYTES = 5 * 1024 * 1024;

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

interface IOCTargets {
  urls: string[];
  domains: string[];
  ips: string[];
  emails: string[];
  idnDomains: string[];
}

/** Legacy paste mode: regex over raw text (headers + body as pasted). */
function targetsFromText(rawHeaders: string, emailBody: string): IOCTargets {
  const fullText = rawHeaders + "\n" + emailBody;
  const urls = extractURLs(fullText).slice(0, 10);
  const domains = [...new Set(urls.map(domainFromURL).filter(Boolean))].slice(0, 10);
  const ips = extractIPs(fullText).slice(0, 5);
  const emails = extractEmails(fullText).slice(0, 10);
  return { urls, domains, ips, emails, idnDomains: domains.filter(checkIDN) };
}

/**
 * Parsed-email mode: enrich the real payload, not the wrapper.
 * - URLs: the unwrapped destination (skip SafeLinks/Mimecast hosts)
 * - domains: parser-extracted final hosts + base64-decoded hosts
 * - emails: parser set minus message-id artifacts
 */
function targetsFromParsed(parsed: ParsedEmail): IOCTargets {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const u of parsed.urls) {
    const target = u.final;
    const host = u.finalHost;
    if (!host || !host.includes(".") || isWrapperHost(host)) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    urls.push(target);
  }
  const domains = parsed.domains.filter((d) => d.includes(".")).slice(0, 10);
  const msgIdLocal = parsed.messageId.replace(/[<>]/g, "").toLowerCase();
  const emails = parsed.emails.filter((e) => e !== msgIdLocal).slice(0, 10);
  return {
    urls: urls.slice(0, 10),
    domains,
    ips: parsed.ips.slice(0, 5),
    emails,
    idnDomains: domains.filter(checkIDN),
  };
}

async function runEnrichment(targets: IOCTargets, auth: string) {
  const [urlResults, domainResults, ipResults, emailResults] = await Promise.all([
    Promise.all(targets.urls.map((u) => enrichURL(u, auth))),
    Promise.all(targets.domains.map((d) => enrichDomain(d, auth))),
    Promise.all(targets.ips.map((ip) => enrichIP(ip, auth))),
    Promise.all(targets.emails.map((e) => enrichEmail(e))),
  ]);

  const allResults = [...urlResults, ...domainResults, ...ipResults];
  const scores = allResults.map((r) => r?.overallThreatScore ?? r?.maxThreatScore ?? 0);
  const totalScore = scores.length > 0 ? Math.max(...scores) : 0;
  const isMalicious = allResults.some((r) => r?.isMalicious === true);

  return {
    iocs: {
      urls: targets.urls.map((v, i) => ({ value: v, enrichment: urlResults[i] })),
      domains: targets.domains.map((v, i) => ({
        value: v,
        enrichment: domainResults[i],
        isIDN: checkIDN(v),
      })),
      ips: targets.ips.map((v, i) => ({ value: v, enrichment: ipResults[i] })),
      emails: targets.emails.map((v, i) => ({ value: v, enrichment: emailResults[i] })),
    },
    summary: {
      totalScore,
      isMalicious,
      urlCount: targets.urls.length,
      domainCount: targets.domains.length,
      ipCount: targets.ips.length,
      emailCount: targets.emails.length,
      idnDomains: targets.idnDomains,
    },
  };
}

/** Trim the parsed structure for transport — body can be megabytes of MIME. */
function transportParsed(parsed: ParsedEmail) {
  return {
    ...parsed,
    decodedBody: undefined,
    bodyText: parsed.bodyText.slice(0, 20_000),
    bodyHtmlPreview: parsed.decodedBody.slice(0, 60_000),
    parts: parsed.parts.map((p) => ({ ...p, text: undefined })),
    headerList: undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const {
      headers: rawHeaders = "",
      emailBody = "",
      rawEmail = "",
      enrich = false,
    } = body as {
      headers?: string;
      emailBody?: string;
      /** full .eml / message source (plain text); triggers MIME+Defender parsing */
      rawEmail?: string;
      /** in rawEmail mode: also fan out to threat-intel (default parse-only) */
      enrich?: boolean;
    };

    const auth = bearerToken(req);

    // --- new path: full message source (.eml/.txt upload) ---
    if (rawEmail) {
      if (rawEmail.length > MAX_RAW_EMAIL_BYTES) {
        return json({ error: "Email too large (max 5MB)" }, 413);
      }
      const parsed = parseEmail(rawEmail);
      const targets = targetsFromParsed(parsed);
      const enrichment = enrich ? await runEnrichment(targets, auth) : null;
      return json({
        mode: "parsed",
        parsed: transportParsed(parsed),
        targets,
        enrichment,
      });
    }

    // --- legacy path: pasted headers/body ---
    if (!rawHeaders && !emailBody) {
      return json({ error: "headers, emailBody or rawEmail required" }, 400);
    }

    const targets = targetsFromText(rawHeaders, emailBody);
    const enrichment = await runEnrichment(targets, auth);
    return json(enrichment);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
