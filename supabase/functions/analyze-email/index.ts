import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseEmail, isWrapperHost, fillAttachmentHashes, analyzeAttachmentArtifacts, extractRecipients, type ParsedEmail } from "../_shared/email-parser.ts";
import { lookupDomainAuth, senderDomain } from "../_shared/dns.ts";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "https://t6.thamos.ca",
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const TI_URL = `${SUPABASE_URL}/functions/v1/threat-intel`;

const MAX_RAW_EMAIL_BYTES = 5 * 1024 * 1024;

function bearerToken(req: Request): string {
  return req.headers.get("authorization") ?? "";
}

/** Validate the JWT (not just its presence) — parsing + DNS lookups are server
 *  compute and must not be an open endpoint. */
async function verifyUser(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  return Boolean(user) && !error;
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

interface WithheldUrl {
  url: string;
  host: string;
  reason: string;
}

interface IOCTargets {
  urls: string[];
  domains: string[];
  ips: string[];
  emails: string[];
  idnDomains: string[];
  /** URLs embedding recipient identity — never sent to external URL scanners;
   *  their host is enriched via /domain instead. */
  withheldUrls: WithheldUrl[];
}

/** PII boundary check for the legacy paste path (the parsed path uses the
 *  parser's own recipientBinding): does this URL embed one of the recipient
 *  addresses in plain, percent-encoded, base64, or base64url form? */
function urlEmbedsAddress(url: string, addrs: string[]): boolean {
  const lower = url.toLowerCase();
  for (const addr of addrs) {
    if (!addr) continue;
    if (lower.includes(addr) || lower.includes(encodeURIComponent(addr))) return true;
    try {
      const b64 = btoa(addr).replace(/=+$/, "");
      const b64url = b64.replace(/\+/g, "-").replace(/\//g, "_");
      if (url.includes(b64) || url.includes(b64url)) return true;
    } catch { /* non-ASCII address — plain/percent checks above still apply */ }
  }
  return false;
}

/** Addresses in To/Cc lines of pasted raw headers (legacy path only). */
function recipientsFromRawHeaders(rawHeaders: string): string[] {
  const out = new Set<string>();
  for (const m of rawHeaders.matchAll(/^(?:to|cc)\s*:(.*)$/gim)) {
    for (const e of extractEmails(m[1])) out.add(e.toLowerCase());
  }
  return [...out];
}

/** Legacy paste mode: regex over raw text (headers + body as pasted). */
function targetsFromText(rawHeaders: string, emailBody: string): IOCTargets {
  const fullText = rawHeaders + "\n" + emailBody;
  const recipients = recipientsFromRawHeaders(rawHeaders);
  const withheldUrls: WithheldUrl[] = [];
  const urls: string[] = [];
  for (const u of extractURLs(fullText)) {
    if (urlEmbedsAddress(u, recipients)) {
      withheldUrls.push({
        url: u,
        host: domainFromURL(u),
        reason: "URL embeds a recipient address — withheld from external URL scanners; domain enriched instead",
      });
    } else {
      urls.push(u);
    }
  }
  // Withheld hosts go first so the domain cap can't starve them out.
  const domains = [
    ...new Set([
      ...withheldUrls.map((w) => w.host).filter(Boolean),
      ...urls.map(domainFromURL).filter(Boolean),
    ]),
  ].slice(0, 10);
  const ips = extractIPs(fullText).slice(0, 5);
  const emails = extractEmails(fullText)
    .filter((e) => !recipients.includes(e.toLowerCase()))
    .slice(0, 10);
  return {
    urls: urls.slice(0, 10),
    domains,
    ips,
    emails,
    idnDomains: domains.filter(checkIDN),
    withheldUrls: withheldUrls.slice(0, 10),
  };
}

/**
 * Parsed-email mode: enrich the real payload, not the wrapper.
 * - URLs: the unwrapped destination (skip SafeLinks/Mimecast hosts)
 * - domains: parser-extracted final hosts + base64-decoded hosts
 * - emails: parser set minus message-id artifacts
 */
function targetsFromParsed(parsed: ParsedEmail): IOCTargets {
  const urls: string[] = [];
  const withheldUrls: WithheldUrl[] = [];
  const seen = new Set<string>();
  for (const u of parsed.urls) {
    const target = u.final;
    const host = u.finalHost;
    if (!host || !host.includes(".") || isWrapperHost(host)) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    // PII boundary: a URL the parser flagged as embedding recipient identity
    // (exact address OR any tenant-domain address) must never reach external
    // URL scanners — urlscan/VT submissions are publicly visible. The host
    // still gets full /domain enrichment below.
    if (u.recipientBinding?.detected) {
      withheldUrls.push({
        url: target,
        host,
        reason: u.recipientBinding.matchesMessageRecipient
          ? "URL embeds the recipient's address — withheld from external URL scanners; domain enriched instead"
          : "URL embeds a tenant-domain address — withheld from external URL scanners; domain enriched instead",
      });
    } else {
      urls.push(target);
    }
  }
  // Withheld hosts go first so the 10-domain cap can't starve them out.
  const domains = [
    ...new Set([
      ...withheldUrls.map((w) => w.host),
      ...parsed.domains.filter((d) => d.includes(".")),
    ]),
  ].slice(0, 10);
  const msgIdLocal = parsed.messageId.replace(/[<>]/g, "").toLowerCase();
  // PII boundary: only sender-side addresses (From/Reply-To/Return-Path/Sender)
  // go to emailrep.io — recipients and bystander body addresses stay inside.
  const senderSide = new Set(
    extractEmails(
      `${parsed.from} ${parsed.replyTo} ${parsed.returnPath} ${parsed.headers["sender"] ?? ""}`,
    ).map((e) => e.toLowerCase()),
  );
  const recipients = new Set(extractRecipients(parsed));
  const emails = parsed.emails.filter(
    (e) => e !== msgIdLocal && senderSide.has(e.toLowerCase()) && !recipients.has(e.toLowerCase()),
  ).slice(0, 10);
  // The origin IP anchors the Sender Intelligence panel — pin it first so the
  // 5-IP cap can never starve it out behind relay-chain IPs.
  const ips = [
    ...new Set([
      ...(parsed.originIP ? [parsed.originIP] : []),
      ...parsed.ips,
    ]),
  ].slice(0, 5);
  return {
    urls: urls.slice(0, 10),
    domains,
    ips,
    emails,
    idnDomains: domains.filter(checkIDN),
    withheldUrls: withheldUrls.slice(0, 10),
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
      urls: [
        ...targets.urls.map((v, i) => ({ value: v, enrichment: urlResults[i] })),
        // Withheld URLs appear in the IOC list with an explicit marker instead
        // of silently vanishing — the analyst sees WHY there's no urlscan/VT
        // data and where the domain-level evidence lives.
        ...targets.withheldUrls.map((w) => ({
          value: w.url,
          enrichment: { piiWithheld: true, reason: w.reason, enrichedDomainInstead: w.host },
        })),
      ],
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
      urlCount: targets.urls.length + targets.withheldUrls.length,
      domainCount: targets.domains.length,
      ipCount: targets.ips.length,
      emailCount: targets.emails.length,
      idnDomains: targets.idnDomains,
      withheldUrlCount: targets.withheldUrls.length,
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
    // attachments carry no body text, only metadata — keep them in full
    parts: parsed.parts.map((p) => ({ ...p, text: undefined, bytes: undefined })),
    headerList: undefined,
  };
}

serve(async (req) => {
  const CORS = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  // Require a VALID authenticated caller — even parse-only mode is server compute
  // and must not be an open endpoint.
  if (!(await verifyUser(req))) {
    return json({ error: "Authentication required" }, 401);
  }
  const auth = bearerToken(req);

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

    // --- new path: full message source (.eml/.txt upload) ---
    if (rawEmail) {
      if (rawEmail.length > MAX_RAW_EMAIL_BYTES) {
        return json({ error: "Email too large (max 5MB)" }, 413);
      }
      const parsed = parseEmail(rawEmail);
      // Recover attachment-hidden URLs (OOXML → media → QR) BEFORE the bytes
      // get cleared below — this is what makes a QR code inside a DOCX show
      // up as a normal URL/IOC instead of silently vanishing.
      await analyzeAttachmentArtifacts(parsed, extractRecipients(parsed));
      await fillAttachmentHashes(parsed);
      const targets = targetsFromParsed(parsed);
      // Sender-domain DNS posture (could the From domain even be spoofed?) runs
      // alongside any IOC enrichment.
      const fromDomain = senderDomain(parsed.from);
      const [enrichment, senderAuth] = await Promise.all([
        enrich ? runEnrichment(targets, auth) : Promise.resolve(null),
        fromDomain ? lookupDomainAuth(fromDomain) : Promise.resolve(null),
      ]);
      return json({
        mode: "parsed",
        parsed: transportParsed(parsed),
        targets,
        senderAuth,
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
