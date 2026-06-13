// _shared/email-parser.ts — RFC 5322 / MIME parser with Defender/EOP header
// intelligence, used by analyze-email (parse mode) and email-verdict (server-side
// grounding). Defensive analysis tooling: decodes phishing samples an analyst
// uploads so the social-engineering payload and Microsoft's own verdict headers
// become visible instead of being discarded.
//
// Deliberately dependency-free (Deno edge runtime).

// ---------- types ----------

export interface MimePart {
  contentType: string;
  charset: string;
  encoding: string;
  disposition: string;
  filename: string | null;
  /** decoded text for text/* parts, null for binary */
  text: string | null;
  sizeBytes: number;
}

export interface DecodedArtifact {
  /** the raw token found inside a URL path/query */
  token: string;
  /** what it decoded to */
  decoded: string;
  /** where it was found */
  sourceUrl: string;
  kind: "email" | "url" | "domain" | "text";
}

export interface UrlIntel {
  /** URL exactly as it appeared in the message */
  original: string;
  /** after unwrapping SafeLinks/urldefense rewrappers */
  final: string;
  /** hosts traversed while unwrapping (wrapper → … → final) */
  unwrapChain: string[];
  wrapper: "safelinks" | "mimecast" | "urldefense" | null;
  finalHost: string;
  decodedArtifacts: DecodedArtifact[];
}

export interface DefenderSignal {
  key: string;
  value: string;
  severity: "info" | "warn" | "high";
  meaning: string;
}

export interface DefenderIntel {
  present: boolean;
  scl: string | null;
  bcl: string | null;
  cat: string | null;
  sfty: string | null;
  cip: string | null;
  ctry: string | null;
  ipv: string | null;
  sfv: string | null;
  heloHost: string | null;
  ptr: string | null;
  compauth: string | null;
  compauthReason: string | null;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  dmarcAction: string | null;
  crossTenantAuthAs: string | null;
  crossTenantAuthSource: string | null;
  fromEntityHeader: string | null;
  correlationId: string | null;
  authenticatedSender: string | null;
  atpProperties: string | null;
  signals: DefenderSignal[];
}

export interface ParsedEmail {
  /** lowercased header name -> unfolded value (last occurrence wins) */
  headers: Record<string, string>;
  /** every header in order, multiples preserved (Received, X-AntiAbuse, …) */
  headerList: Array<{ name: string; value: string }>;
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  returnPath: string;
  replyTo: string;
  hops: Array<{ from: string; by: string; with: string; timestamp: string }>;
  originIP: string | null;
  defender: DefenderIntel;
  parts: MimePart[];
  /** all decoded text/* content concatenated (HTML included) */
  decodedBody: string;
  /** decodedBody with HTML tags stripped — for display + IOC text matching */
  bodyText: string;
  bodyFindings: string[];
  suspiciousIndicators: string[];
  urls: UrlIntel[];
  domains: string[];
  ips: string[];
  emails: string[];
}

// ---------- low-level decoding ----------

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const clean = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function bytesToText(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || "utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function decodeQuotedPrintable(input: string, charset: string): string {
  const joined = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff);
    }
  }
  return bytesToText(new Uint8Array(bytes), charset);
}

/** RFC 2047 encoded-words: =?utf-8?B?...?= / =?iso-8859-1?Q?...?= */
export function decodeRfc2047(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_m, charset: string, enc: string, data: string) => {
      if (enc.toUpperCase() === "B") {
        const bytes = b64ToBytes(data);
        return bytes ? bytesToText(bytes, charset) : data;
      }
      return decodeQuotedPrintable(data.replace(/_/g, " "), charset);
    }
  ).replace(/\?=\s+=\?/g, "?==?"); // adjacent encoded-words
}

// ---------- header parsing ----------

function splitHeadersFromBody(raw: string): { headerText: string; bodyText: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const split = normalized.indexOf("\n\n");
  if (split === -1) return { headerText: normalized, bodyText: "" };
  return { headerText: normalized.slice(0, split), bodyText: normalized.slice(split + 2) };
}

function parseHeaderBlock(headerText: string): Array<{ name: string; value: string }> {
  const list: Array<{ name: string; value: string }> = [];
  let name = "";
  let value = "";
  for (const line of headerText.split("\n")) {
    if (/^[ \t]/.test(line) && name) {
      value += " " + line.trim();
    } else {
      if (name) list.push({ name, value: decodeRfc2047(value) });
      const colon = line.indexOf(":");
      if (colon > 0) {
        name = line.slice(0, colon).trim();
        value = line.slice(colon + 1).trim();
      } else {
        name = "";
        value = "";
      }
    }
  }
  if (name) list.push({ name, value: decodeRfc2047(value) });
  return list;
}

// ---------- MIME body parsing ----------

function getHeaderParam(headerValue: string, param: string): string | null {
  const m = headerValue.match(new RegExp(`${param}\\s*=\\s*"?([^";\\s]+)"?`, "i"));
  return m ? m[1] : null;
}

function decodePartBody(body: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase();
  if (enc === "base64") {
    const bytes = b64ToBytes(body);
    return bytes ? bytesToText(bytes, charset) : "";
  }
  if (enc === "quoted-printable") return decodeQuotedPrintable(body, charset);
  return body;
}

function parseMimeParts(
  contentType: string,
  encoding: string,
  body: string,
  depth = 0
): MimePart[] {
  if (depth > 5) return [];
  const ct = (contentType || "text/plain").toLowerCase();

  if (ct.startsWith("multipart/")) {
    const boundary = getHeaderParam(contentType, "boundary");
    if (!boundary) return [];
    const parts: MimePart[] = [];
    const segments = body.split(new RegExp(`--${escapeRegExp(boundary)}(?:--)?\\s*\\n?`));
    for (const segment of segments) {
      if (!segment.trim()) continue;
      const { headerText, bodyText } = splitHeadersFromBody(segment.replace(/^\n+/, ""));
      const partHeaders = parseHeaderBlock(headerText);
      const get = (n: string) =>
        partHeaders.find((h) => h.name.toLowerCase() === n)?.value ?? "";
      const partCt = get("content-type") || "text/plain";
      const partEnc = get("content-transfer-encoding") || "7bit";
      if (partCt.toLowerCase().startsWith("multipart/")) {
        parts.push(...parseMimeParts(partCt, partEnc, bodyText, depth + 1));
      } else {
        parts.push(buildPart(partCt, partEnc, get("content-disposition"), bodyText));
      }
    }
    return parts;
  }

  return [buildPart(contentType || "text/plain", encoding || "7bit", "", body)];
}

function buildPart(
  contentType: string,
  encoding: string,
  disposition: string,
  body: string
): MimePart {
  const charset = getHeaderParam(contentType, "charset") ?? "utf-8";
  const isText = /^(text\/|message\/)/i.test(contentType.trim());
  const filename =
    getHeaderParam(disposition, "filename") ?? getHeaderParam(contentType, "name");
  return {
    contentType: contentType.split(";")[0].trim().toLowerCase(),
    charset,
    encoding: encoding.trim().toLowerCase(),
    disposition: disposition.split(";")[0].trim().toLowerCase(),
    filename,
    text: isText ? decodePartBody(body, encoding, charset) : null,
    sizeBytes: body.length,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- URL unwrapping + recursive base64 decode ----------

const WRAPPER_HOSTS = [
  "safelinks.protection.outlook.com",
  "mimecastprotect.com",
  "urldefense.com",
  "urldefense.proofpoint.com",
];

export function isWrapperHost(host: string): boolean {
  return WRAPPER_HOSTS.some((w) => host === w || host.endsWith("." + w));
}

function unwrapOnce(url: string): { url: string; wrapper: UrlIntel["wrapper"] } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host.endsWith("safelinks.protection.outlook.com")) {
    const inner = u.searchParams.get("url");
    if (inner) return { url: decodeURIComponent(inner), wrapper: "safelinks" };
  }
  if (host.includes("urldefense")) {
    // Proofpoint v3: https://urldefense.com/v3/__<url>__;<b64>!!...
    const v3 = url.match(/\/v3\/__(.+?)__;/);
    if (v3) return { url: v3[1], wrapper: "urldefense" };
  }
  if (host.endsWith("mimecastprotect.com")) {
    // Mimecast keeps only a token; the `domain` param names the real target host
    const domain = u.searchParams.get("domain");
    if (domain) return { url: `https://${domain}/`, wrapper: "mimecast" };
  }
  return null;
}

function looksLikeBase64Token(token: string): boolean {
  if (token.length < 12 || token.length > 512) return false;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(token)) return false;
  // require some mixed case or digits — filters plain lowercase words
  return /[A-Z]/.test(token) && /[a-z0-9]/.test(token);
}

function classifyDecoded(text: string): DecodedArtifact["kind"] | null {
  if (!/^[\x20-\x7e]+$/.test(text) || text.length < 4) return null;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(text)) return "email";
  if (/^https?:\/\//i.test(text)) return "url";
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(text)) return "domain";
  // generic printable text is only interesting if it has separators (not random)
  return /[\s@:/.=?&]/.test(text) ? "text" : null;
}

function decodeUrlTokens(url: string): DecodedArtifact[] {
  const artifacts: DecodedArtifact[] = [];
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return artifacts;
  }
  const tokens: string[] = [
    ...u.pathname.split("/").filter(Boolean),
    ...[...u.searchParams.values()],
    u.hash.replace(/^#/, ""),
  ].filter(Boolean);

  for (const token of tokens) {
    if (!looksLikeBase64Token(token)) continue;
    const bytes = b64ToBytes(token);
    if (!bytes) continue;
    const decoded = bytesToText(bytes, "utf-8");
    const kind = classifyDecoded(decoded);
    if (kind) artifacts.push({ token, decoded, sourceUrl: url, kind });
  }
  return artifacts;
}

export function analyzeUrl(original: string): UrlIntel {
  const chain: string[] = [];
  let wrapper: UrlIntel["wrapper"] = null;
  let current = original;
  for (let i = 0; i < 5; i++) {
    const step = unwrapOnce(current);
    if (!step) break;
    try { chain.push(new URL(current).hostname); } catch { /* keep going */ }
    wrapper = wrapper ?? step.wrapper;
    current = step.url;
  }
  let finalHost = "";
  try { finalHost = new URL(current).hostname; } catch { /* non-URL after unwrap */ }

  // decode base64 tokens on the FINAL url (the payload), and also the original
  // in case the wrapper itself carries encoded victim data
  const artifacts = [...decodeUrlTokens(current)];
  if (current !== original) {
    for (const a of decodeUrlTokens(original)) {
      if (!artifacts.some((x) => x.token === a.token)) artifacts.push(a);
    }
  }
  // recurse one level: a decoded artifact that is itself a URL gets analyzed too
  for (const a of artifacts.filter((a) => a.kind === "url").slice(0, 3)) {
    artifacts.push(...decodeUrlTokens(a.decoded));
  }

  return { original, final: current, unwrapChain: chain, wrapper, finalHost, decodedArtifacts: artifacts };
}

// ---------- IOC extraction ----------

const URL_RE = /https?:\/\/[^\s<>"'\])}]+/gi;
const IP_RE = /\b(\d{1,3}\.){3}\d{1,3}\b/g;
const EMAIL_RE = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;

function isPrivateIP(ip: string): boolean {
  return (
    ip.startsWith("10.") || ip.startsWith("192.168.") ||
    ip.startsWith("127.") || ip.startsWith("0.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

// ---------- Defender / EOP header intelligence ----------

const SCL_MEANING: Array<[RegExp, string, DefenderSignal["severity"]]> = [
  [/^-1$/, "SCL -1 — message bypassed spam filtering (allow rule / trusted connector)", "warn"],
  [/^[01]$/, "SCL 0-1 — Defender's spam filter did NOT classify this as spam (phish can still score low here; check SFTY/CAT)", "info"],
  [/^[234]$/, "SCL 2-4 — low spam suspicion", "info"],
  [/^[56]$/, "SCL 5-6 — classified as spam", "warn"],
  [/^[789]$/, "SCL 7-9 — high-confidence spam/phish", "high"],
];

const SFTY_MEANING: Record<string, string> = {
  "9.1": "Defender phishing verdict (generic phish)",
  "9.11": "Intra-org spoofing detected (sender appears internal but failed auth)",
  "9.19": "Domain impersonation — sender domain resembles a protected domain",
  "9.20": "User impersonation — display name/address resembles a protected user",
  "9.21": "Cross-domain spoofing detected",
  "9.22": "Bulk-sender safety signal",
  "9.25": "First-contact safety tip — recipient rarely or never receives mail from this sender (Defender attached the 'You don't often get email from…' banner)",
};

const CAT_MEANING: Record<string, string> = {
  NONE: "No category assigned — Defender did not classify the message as a threat",
  SPM: "Spam",
  HSPM: "High-confidence spam",
  PHSH: "Phishing",
  HPHSH: "High-confidence phishing",
  MALW: "Malware",
  SPOOF: "Spoofing",
  BULK: "Bulk mail",
  INTOS: "Intra-org phishing",
  DIMP: "Domain impersonation",
  UIMP: "User impersonation",
};

function compauthReasonMeaning(reason: string): string {
  const n = parseInt(reason, 10);
  if (reason === "109") {
    return "compauth reason 109 — composite auth passed only via implicit/inferred signals. Combined with dmarc=bestguesspass this means Microsoft GUESSED the domain would pass; the sender domain has no real DMARC record.";
  }
  if (n >= 100 && n < 200) return `compauth reason ${reason} — composite authentication passed`;
  if (n >= 0 && n < 100) return `compauth reason ${reason} — composite authentication FAILED`;
  if (n >= 200 && n < 300) return `compauth reason ${reason} — soft pass (implicit authentication accepted)`;
  if (n >= 300 && n < 400) return `compauth reason ${reason} — not evaluated`;
  return `compauth reason ${reason}`;
}

function parseSemicolonKV(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chunk of value.split(";")) {
    const colon = chunk.indexOf(":");
    if (colon <= 0) continue;
    const k = chunk.slice(0, colon).trim().toUpperCase();
    const v = chunk.slice(colon + 1).trim();
    if (k && v && !(k in out)) out[k] = v;
    else if (k && v && k === "SFTY") out[k] = v; // SFTY can repeat; keep last
  }
  return out;
}

function extractDefender(headers: Record<string, string>): DefenderIntel {
  const forefront = headers["x-forefront-antispam-report"] ?? "";
  const authResults = headers["authentication-results"] ?? "";
  const ff = forefront ? parseSemicolonKV(forefront) : {};

  const authMatch = (key: string) =>
    authResults.match(new RegExp(`${key}=([\\w.-]+)`, "i"))?.[1]?.toLowerCase() ?? null;

  const microsoftAntispam = headers["x-microsoft-antispam"] ?? "";
  const bcl = microsoftAntispam.match(/BCL:(\d+)/i)?.[1] ?? null;

  const intel: DefenderIntel = {
    present: Boolean(forefront || headers["x-ms-exchange-organization-scl"]),
    scl: ff["SCL"] ?? headers["x-ms-exchange-organization-scl"] ?? null,
    bcl,
    cat: ff["CAT"] ?? null,
    sfty: ff["SFTY"] ?? null,
    cip: ff["CIP"] ?? null,
    ctry: ff["CTRY"] ?? null,
    ipv: ff["IPV"] ?? null,
    sfv: ff["SFV"] ?? null,
    heloHost: ff["H"] ?? null,
    ptr: ff["PTR"] ?? null,
    compauth: authMatch("compauth"),
    compauthReason: authResults.match(/reason=(\d+)/i)?.[1] ?? null,
    spf: authMatch("spf"),
    dkim: authMatch("dkim"),
    dmarc: authMatch("dmarc"),
    dmarcAction: authResults.match(/dmarc=[\w]+\s+action=([\w]+)/i)?.[1] ?? null,
    crossTenantAuthAs: headers["x-ms-exchange-crosstenant-authas"] ?? null,
    crossTenantAuthSource: headers["x-ms-exchange-crosstenant-authsource"] ?? null,
    fromEntityHeader: headers["x-ms-exchange-crosstenant-fromentityheader"] ?? null,
    correlationId: headers["x-ms-office365-filtering-correlation-id"] ?? null,
    authenticatedSender: headers["x-authenticated-sender"] ?? headers["x-get-message-sender-via"] ?? null,
    atpProperties: headers["x-ms-exchange-atpmessageproperties"] ?? null,
    signals: [],
  };

  const sig = (key: string, value: string | null, severity: DefenderSignal["severity"], meaning: string) => {
    if (value !== null) intel.signals.push({ key, value, severity, meaning });
  };

  if (intel.scl !== null) {
    const hit = SCL_MEANING.find(([re]) => re.test(intel.scl!));
    sig("SCL", intel.scl, hit?.[2] ?? "info", hit?.[1] ?? `Spam Confidence Level ${intel.scl}`);
  }
  if (intel.sfty !== null) {
    sig("SFTY", intel.sfty, "high",
      SFTY_MEANING[intel.sfty] ?? `SFTY ${intel.sfty} — Defender safety-tip / phish-family signal (9.x values indicate Defender attached a safety warning)`);
  }
  if (intel.cat !== null) {
    sig("CAT", intel.cat, ["PHSH", "HPHSH", "MALW", "SPOOF"].includes(intel.cat) ? "high" : "info",
      CAT_MEANING[intel.cat] ?? `Category: ${intel.cat}`);
  }
  if (intel.dmarc === "bestguesspass") {
    sig("DMARC", "bestguesspass", "warn",
      "No DMARC record exists for the sender domain — Microsoft *guessed* it would have passed. This is NOT a real DMARC pass; do not treat it as verified.");
  } else if (intel.dmarc) {
    sig("DMARC", intel.dmarc, intel.dmarc === "fail" ? "high" : "info", `DMARC ${intel.dmarc}`);
  }
  if (intel.compauth) {
    sig("compauth", `${intel.compauth}${intel.compauthReason ? ` (reason=${intel.compauthReason})` : ""}`,
      intel.compauth === "fail" ? "high" : intel.compauthReason === "109" ? "warn" : "info",
      intel.compauthReason ? compauthReasonMeaning(intel.compauthReason) : `Composite authentication: ${intel.compauth}`);
  }
  if (intel.dkim === "none") {
    sig("DKIM", "none", "warn", "Message was not DKIM-signed — sender identity rests on SPF alone.");
  }
  if (intel.crossTenantAuthAs) {
    sig("AuthAs", intel.crossTenantAuthAs,
      intel.crossTenantAuthAs.toLowerCase() === "anonymous" ? "warn" : "info",
      intel.crossTenantAuthAs.toLowerCase() === "anonymous"
        ? "Message entered the tenant unauthenticated (normal for external mail, but rules out an internal sender)"
        : `Cross-tenant authentication level: ${intel.crossTenantAuthAs}`);
  }
  if (intel.bcl !== null) {
    sig("BCL", intel.bcl, parseInt(intel.bcl, 10) >= 5 ? "warn" : "info", `Bulk Complaint Level ${intel.bcl}`);
  }
  if (intel.atpProperties) {
    sig("ATP", intel.atpProperties, "info",
      `Defender for Office 365 processing: ${intel.atpProperties.replace("SA", "Safe Attachments").replace("SL", "Safe Links")}`);
  }
  if (intel.cip) {
    sig("Connecting IP", `${intel.cip}${intel.ctry ? ` (${intel.ctry})` : ""}`, "info",
      "IP that delivered the message to Microsoft, as recorded by Defender — enrich this, not just Received-chain IPs.");
  }
  return intel;
}

// ---------- body heuristics ----------

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findBodyFindings(html: string, text: string): string[] {
  const findings: string[] = [];
  if (/safe\s*senders?\s*list/i.test(text) || /sender\s+has\s+been\s+verified/i.test(text)) {
    findings.push(
      'Fake trust banner: body claims the sender is on a "safe senders list" / "has been verified" — Outlook/Defender never injects such text into the body. This is attacker-supplied social engineering.'
    );
  }
  const hiddenBlocks = html.match(/<[^>]+(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0)[^>]*>([\s\S]{0,400}?)<\//gi) ?? [];
  const hiddenWithText = hiddenBlocks.filter((b) => stripHtml(b).length > 10);
  if (hiddenWithText.length > 0) {
    findings.push(
      `Hidden content: ${hiddenWithText.length} element(s) styled invisible (display:none / zero font / zero opacity) contain text — common filter-evasion / keyword-stuffing technique.`
    );
  }
  const externalForm = html.match(/<form[^>]+action\s*=\s*["']?(https?:\/\/[^"'\s>]+)/i);
  if (externalForm) {
    findings.push(`Form posts to external URL: ${externalForm[1]}`);
  }
  if (/url=data:text\/html|javascript:/i.test(html)) {
    findings.push("Body contains data:/javascript: URI — possible HTML smuggling.");
  }
  return findings;
}

// ---------- main entry ----------

export function parseEmail(raw: string): ParsedEmail {
  const { headerText, bodyText } = splitHeadersFromBody(raw);
  const headerList = parseHeaderBlock(headerText);
  const headers: Record<string, string> = {};
  for (const { name, value } of headerList) headers[name.toLowerCase()] = value;

  // --- MIME body ---
  const parts = parseMimeParts(
    headers["content-type"] ?? "text/plain",
    headers["content-transfer-encoding"] ?? "7bit",
    bodyText
  );
  const decodedBody = parts.filter((p) => p.text).map((p) => p.text!).join("\n\n");
  const plainBody = stripHtml(decodedBody);

  // --- hops / origin ---
  const receivedHeaders = headerList.filter((h) => h.name.toLowerCase() === "received");
  const hops = receivedHeaders.map((h) => ({
    from: h.value.match(/from\s+([^\s(]+)/i)?.[1] ?? "Unknown",
    by: h.value.match(/by\s+([^\s(]+)/i)?.[1] ?? "Unknown",
    with: h.value.match(/with\s+(\w+)/i)?.[1] ?? "Unknown",
    timestamp: h.value.match(/;\s*(.+)$/)?.[1]?.trim() ?? "Unknown",
  })).reverse();

  let originIP: string | null = null;
  for (const h of receivedHeaders) {
    const m = h.value.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
    if (m && !isPrivateIP(m[1])) originIP = m[1];
  }

  // --- Defender intelligence ---
  const defender = extractDefender(headers);

  // --- IOCs (headers + DECODED body, with unwrap + recursive base64) ---
  const fullText = headerText + "\n" + decodedBody;
  const urlIntel: UrlIntel[] = [];
  const seenUrls = new Set<string>();
  for (const rawUrl of fullText.match(URL_RE) ?? []) {
    const cleaned = rawUrl.replace(/[.,;:!）)\]]+$/, "");
    if (seenUrls.has(cleaned)) continue;
    seenUrls.add(cleaned);
    urlIntel.push(analyzeUrl(cleaned));
  }

  const domains = new Set<string>();
  const emails = new Set<string>();
  for (const u of urlIntel) {
    if (u.finalHost && u.finalHost.includes(".") && !isWrapperHost(u.finalHost)) domains.add(u.finalHost);
    for (const a of u.decodedArtifacts) {
      if (a.kind === "email") emails.add(a.decoded.toLowerCase());
      if (a.kind === "domain") domains.add(a.decoded.toLowerCase());
      if (a.kind === "url") {
        try { domains.add(new URL(a.decoded).hostname); } catch { /* not a host */ }
      }
    }
  }
  const ips = new Set<string>(
    (fullText.match(IP_RE) ?? []).filter((ip) => !isPrivateIP(ip))
  );
  if (defender.cip && !isPrivateIP(defender.cip)) ips.add(defender.cip);
  for (const e of fullText.match(EMAIL_RE) ?? []) emails.add(e.toLowerCase());

  // --- suspicious indicators (header cross-checks) ---
  const indicators: string[] = [];
  const fromAddr = (headers["from"] ?? "").match(/<([^>]+)>|([^\s<>]+@[^\s<>]+)/)?.[1]
    ?? (headers["from"] ?? "").match(/([^\s<>]+@[^\s<>]+)/)?.[1] ?? "";
  const fromDomain = fromAddr.split("@")[1]?.toLowerCase() ?? "";

  if (defender.authenticatedSender) {
    const authAddr = defender.authenticatedSender.match(/([\w.+-]+@[\w.-]+)/)?.[1] ?? "";
    const authDomain = authAddr.split("@")[1]?.toLowerCase() ?? "";
    if (authDomain && fromDomain && authDomain !== fromDomain) {
      indicators.push(
        `SMTP-authenticated sender (${authAddr}) does not match From (${fromAddr}) — message was sent through a third-party account, classic compromised-relay pattern.`
      );
    }
  }
  for (const h of receivedHeaders) {
    if (/helo=\[?127\.0\.0\.1\]?/i.test(h.value) || /helo=\[?localhost\]?/i.test(h.value)) {
      indicators.push("Innermost Received hop used HELO 127.0.0.1/localhost — spoofed HELO, sender hid its real hostname.");
      break;
    }
  }
  const returnAddr = (headers["return-path"] ?? "").match(/<([^>]+)>/)?.[1] ?? headers["return-path"] ?? "";
  if (returnAddr && fromAddr && returnAddr.toLowerCase() !== fromAddr.toLowerCase()) {
    indicators.push(`Return-Path (${returnAddr}) differs from From (${fromAddr})`);
  }
  const replyAddr = (headers["reply-to"] ?? "").match(/<([^>]+)>|([^\s<>]+@[^\s<>]+)/)?.[1] ?? "";
  if (replyAddr && fromAddr && replyAddr.toLowerCase() !== fromAddr.toLowerCase()) {
    indicators.push(`Reply-To (${replyAddr}) differs from From (${fromAddr})`);
  }
  if (defender.dmarc === "bestguesspass") {
    indicators.push("dmarc=bestguesspass — sender domain has NO DMARC record; the 'pass' is Microsoft's guess, not verification.");
  }
  if (defender.sfty) {
    indicators.push(`Defender SFTY:${defender.sfty} — ${SFTY_MEANING[defender.sfty] ?? "safety-tip signal attached"}`);
  }
  for (const u of urlIntel) {
    for (const a of u.decodedArtifacts) {
      if (a.kind === "email") {
        indicators.push(
          `Base64-encoded recipient identity in URL: "${a.token}" in ${u.finalHost || u.original} decodes to ${a.decoded} — phishing kits embed the victim UPN to prefill the credential page (AITM pattern).`
        );
      }
    }
    if (u.wrapper && u.finalHost) {
      indicators.push(`URL is ${u.wrapper}-wrapped; real destination is ${u.finalHost} (score the destination, not the wrapper).`);
    }
  }

  const bodyFindings = findBodyFindings(decodedBody, plainBody);

  return {
    headers,
    headerList,
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    subject: headers["subject"] ?? "",
    date: headers["date"] ?? "",
    messageId: headers["message-id"] ?? "",
    returnPath: headers["return-path"] ?? "",
    replyTo: headers["reply-to"] ?? "",
    hops,
    originIP,
    defender,
    parts,
    decodedBody,
    bodyText: plainBody,
    bodyFindings,
    suspiciousIndicators: indicators,
    urls: urlIntel,
    domains: [...domains],
    ips: [...ips],
    emails: [...emails],
  };
}
