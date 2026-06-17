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
  /** decoded bytes for binary attachment parts — transient, used to compute
   *  the SHA-256 then stripped before transport. null for text parts. */
  bytes: Uint8Array | null;
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
  wrapper: "safelinks" | "mimecast" | "urldefense" | "barracuda" | "symantec" | null;
  finalHost: string;
  decodedArtifacts: DecodedArtifact[];
}

export interface DefenderSignal {
  key: string;
  value: string;
  severity: "info" | "warn" | "high";
  meaning: string;
}

export interface AttachmentInfo {
  filename: string;
  contentType: string;
  sizeBytes: number;
  disposition: string;
  /** lowercased final extension, e.g. "htm" */
  extension: string;
  /** SHA-256 of the decoded attachment bytes (filled by fillAttachmentHashes) */
  sha256: string | null;
  risk: "high" | "medium" | "low";
  reasons: string[];
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
  attachments: AttachmentInfo[];
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
  // Quoted form first: param="..." may legitimately contain spaces (boundaries,
  // filenames). Falling straight through to the bare matcher truncated those at
  // the first space and silently broke multipart splitting / filename capture.
  const quoted = headerValue.match(new RegExp(`${param}\\s*=\\s*"([^"]+)"`, "i"));
  if (quoted) return quoted[1];
  const bare = headerValue.match(new RegExp(`${param}\\s*=\\s*([^";\\s]+)`, "i"));
  return bare ? bare[1] : null;
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
  // Decode binary attachment bytes once (base64) so we can hash them later.
  let bytes: Uint8Array | null = null;
  if (!isText && encoding.trim().toLowerCase() === "base64") {
    bytes = b64ToBytes(body);
  }
  return {
    contentType: contentType.split(";")[0].trim().toLowerCase(),
    charset,
    encoding: encoding.trim().toLowerCase(),
    disposition: disposition.split(";")[0].trim().toLowerCase(),
    filename,
    text: isText ? decodePartBody(body, encoding, charset) : null,
    bytes,
    sizeBytes: bytes ? bytes.length : body.length,
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
  "linkprotect.cudasvc.com",
  "clicktime.symantec.com",
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
    // Proofpoint v2: ?u=<url> where '-'→'%' and '_'→'/'
    const v2 = u.searchParams.get("u");
    if (v2) {
      try { return { url: decodeURIComponent(v2.replace(/-/g, "%").replace(/_/g, "/")), wrapper: "urldefense" }; } catch { /* fall through */ }
    }
  }
  if (host.endsWith("mimecastprotect.com")) {
    // Mimecast keeps only a token; the `domain` param names the real target host
    const domain = u.searchParams.get("domain");
    if (domain) return { url: `https://${domain}/`, wrapper: "mimecast" };
  }
  if (host.endsWith("linkprotect.cudasvc.com")) {
    // Barracuda Link Protection: ?a=<url-encoded real target>
    const a = u.searchParams.get("a");
    if (a) return { url: decodeURIComponent(a), wrapper: "barracuda" };
  }
  if (host.endsWith("clicktime.symantec.com")) {
    // Symantec Click-time URL Protection: ?u=<real target>
    const inner = u.searchParams.get("u");
    if (inner) return { url: decodeURIComponent(inner), wrapper: "symantec" };
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
  } else if (intel.dkim === "fail") {
    sig("DKIM", "fail", "high", "DKIM signature failed verification — the message body/headers were altered in transit or the signature was forged.");
  }
  if (intel.spf) {
    const spfSev: DefenderSignal["severity"] =
      intel.spf === "fail" || intel.spf === "softfail" ? "high"
      : intel.spf === "none" || intel.spf === "neutral" || intel.spf === "permerror" || intel.spf === "temperror" ? "warn"
      : "info";
    const spfMeaning: Record<string, string> = {
      pass: "SPF pass — the connecting IP is authorized to send for the envelope domain. NOTE: this authorizes the Return-Path, not the visible From, and passes from a compromised relay prove nothing about the sender.",
      fail: "SPF FAIL — the connecting IP is NOT authorized for the envelope domain (hard fail). Strong spoofing signal.",
      softfail: "SPF softfail — the domain marks this IP as probably unauthorized (~all).",
      neutral: "SPF neutral — the domain explicitly takes no position on this IP.",
      none: "No SPF record published for the sender domain — no IP-level authorization to check.",
      permerror: "SPF permerror — the sender's SPF record is malformed.",
      temperror: "SPF temperror — SPF could not be evaluated (transient DNS issue).",
    };
    sig("SPF", intel.spf, spfSev, spfMeaning[intel.spf] ?? `SPF ${intel.spf}`);
  }
  if (intel.sfv) {
    const SFV_MEANING: Record<string, [string, DefenderSignal["severity"]]> = {
      SPM: ["SFV:SPM — Defender's content filter classified the message as spam.", "warn"],
      HSPM: ["SFV:HSPM — high-confidence spam.", "warn"],
      PHSH: ["SFV:PHSH — Defender's content filter classified the message as phishing.", "high"],
      MLW: ["SFV:MLW — malware detected.", "high"],
      BLK: ["SFV:BLK — sender is on a block list (recipient or org policy).", "warn"],
      SKS: ["SFV:SKS — message was marked spam by a mail-flow rule before content filtering.", "warn"],
      SKB: ["SFV:SKB — message blocked by a policy before content filtering.", "warn"],
      SKA: ["SFV:SKA — skipped filtering and allowed (safe sender / allow rule). Spam scoring was bypassed — verify the allow rule is legitimate.", "warn"],
      SKI: ["SFV:SKI — skipped filtering (similar to SKN), no spam verdict computed.", "info"],
      SKN: ["SFV:SKN — marked not-spam by a mail-flow rule before content filtering (allow rule). Content scanning was bypassed.", "warn"],
      SKQ: ["SFV:SKQ — message released from quarantine.", "info"],
      NSPM: ["SFV:NSPM — Defender's content filter classified the message as NOT spam (does not clear well-crafted BEC/AITM phish).", "info"],
    };
    const hit = SFV_MEANING[intel.sfv];
    sig("SFV", intel.sfv, hit?.[1] ?? "info", hit?.[0] ?? `Spam filtering verdict: ${intel.sfv}`);
  }
  if (intel.heloHost || intel.ptr) {
    const parts: string[] = [];
    if (intel.heloHost) parts.push(`HELO=${intel.heloHost}`);
    if (intel.ptr) parts.push(`PTR=${intel.ptr}`);
    const ptrMissing = intel.ptr === "" || /^none$/i.test(intel.ptr ?? "");
    sig("Sending host", parts.join(" "), ptrMissing ? "warn" : "info",
      ptrMissing
        ? "The connecting server has no reverse-DNS (PTR) record — common for throwaway / compromised senders."
        : "Connecting server's announced HELO name and reverse-DNS, as Defender saw them — compare against the claimed sender domain.");
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
  // Hidden elements are extremely common in legitimate mail (the invisible
  // "preheader" snippet every ESP injects), so plain hidden text is NOT a
  // signal. Only flag hidden blocks that conceal a link or an address — that is
  // the actual evasion pattern, not a benign preheader.
  const hiddenBlocks = html.match(/<[^>]+(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px)?|opacity\s*:\s*0)[^>]*>([\s\S]{0,600}?)<\//gi) ?? [];
  const hiddenWithLink = hiddenBlocks.filter((b) => /href\s*=|https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(b));
  if (hiddenWithLink.length > 0) {
    findings.push(
      `Hidden links/addresses: ${hiddenWithLink.length} invisible element(s) (display:none / zero font / zero opacity) conceal a URL or email address — filter-evasion technique, not a normal preheader.`
    );
  }
  const externalForm = html.match(/<form[^>]+action\s*=\s*["']?(https?:\/\/[^"'\s>]+)/i);
  if (externalForm) {
    findings.push(`Form posts to external URL: ${externalForm[1]}`);
  }
  if (/url=data:text\/html|javascript:/i.test(html)) {
    findings.push("Body contains data:/javascript: URI — possible HTML smuggling.");
  }

  // Social-engineering language (lure pressure). These are supporting signals,
  // not verdicts — reported so the analyst/THAMOS can weigh tone.
  const urgency = /\b(urgent(ly)?|immediately|within \d+\s*(hours?|minutes?)|action required|final (notice|warning|reminder)|account (will be )?(suspend|lock|disabl|clos|terminat)|expir(e|es|ing|ed) (today|soon|in \d))/i.test(text);
  const credReq = /\b(verify your (account|identity|email|password)|confirm your (password|credentials|account|identity)|re-?authenticate|re-?validate|update your (password|payment|billing|account)|unusual (sign|login|activity)|(sign|log) ?in to (avoid|keep|restore|verify))/i.test(text);
  const financial = /\b(wire transfer|bank (details|account|transfer)|invoice (attached|enclosed|overdue)|payment (overdue|pending|failed|declined)|gift ?cards?|update.{0,15}(bank|payment) (details|info)|change.{0,15}bank)/i.test(text);
  if (urgency) findings.push("Urgency/pressure language in body (suspension/expiry/'action required') — classic phishing lure.");
  if (credReq) findings.push("Credential-action language in body (verify/confirm/re-authenticate your account) — consistent with credential phishing.");
  if (financial) findings.push("Financial-action language in body (wire/bank/invoice/payment/gift card) — consistent with BEC / payment fraud.");

  // Quishing — a QR code the recipient is told to scan moves the payload off the
  // wire (and onto a phone), bypassing URL reputation in the mail body.
  if (/\bQR[\s-]?code\b/i.test(text) || /scan (the |this )?(code|qr)/i.test(text) ||
      /<img[^>]+(?:src|alt)\s*=\s*["'][^"'>]*qr[^"'>]*/i.test(html)) {
    findings.push("QR code referenced in body ('quishing') — payload likely a QR image leading off-platform; the destination is not visible as a normal link.");
  }

  // Device-code-flow phishing — attacker gets the victim to approve the attacker's
  // sign-in by entering a device code at a real Microsoft endpoint.
  const deviceUrl = /aka\.ms\/devicelogin|microsoft(online)?\.com\/[^\s"'<>]*device(login|auth)|\/oauth2\/deviceauth/i.test(html + " " + text);
  const deviceLang = /\bdevice code\b/i.test(text) ||
    (/\benter\b/i.test(text) && /\bcode\b/i.test(text) && /\b(microsoft|office\s?365|azure|outlook|teams)\b/i.test(text));
  if (deviceUrl || deviceLang) {
    findings.push("Device-code-flow lure: references a Microsoft device-login / 'enter this code' flow — hallmark of device-code phishing, where the victim unknowingly authorizes the attacker's session.");
  }

  for (const m of findAnchorMismatches(html)) findings.push(m);
  return findings;
}

/**
 * Visible link text claims one destination, the href points somewhere else —
 * the canonical phishing tell. Returns one finding per mismatch (capped).
 * Wrapper hosts (SafeLinks/Mimecast) are skipped: their href legitimately
 * differs from the displayed URL.
 */
function findAnchorMismatches(html: string): string[] {
  const out: string[] = [];
  const anchorRe = /<a\b[^>]*?href\s*=\s*["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = anchorRe.exec(html)) !== null && count < 5) {
    const href = m[1];
    const text = stripHtml(m[2]);
    // only meaningful when the visible text itself looks like a URL/domain
    const shownHost = text.match(/\b([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\b/i)?.[1]?.toLowerCase();
    if (!shownHost) continue;
    let hrefHost = "";
    try { hrefHost = new URL(href).hostname.toLowerCase(); } catch { continue; }
    if (!hrefHost || isWrapperHost(hrefHost)) continue;
    const reg = (h: string) => h.split(".").slice(-2).join(".");
    if (reg(shownHost) !== reg(hrefHost)) {
      out.push(
        `Link text says "${shownHost}" but the href points to ${hrefHost} — displayed destination does not match the real link target.`
      );
      count++;
    }
  }
  return out;
}

// ---------- attachment triage ----------

const ATTACH_HIGH = new Set([
  "exe", "scr", "com", "pif", "bat", "cmd", "js", "jse", "vbs", "vbe", "wsf",
  "wsh", "hta", "lnk", "iso", "img", "vhd", "msi", "jar", "ps1", "ps1xml",
  "htm", "html", "shtml", "svg", "docm", "xlsm", "pptm", "dotm", "xlam", "msc",
]);
const ATTACH_MEDIUM = new Set([
  "zip", "rar", "7z", "gz", "tar", "ace", "cab", "z", "rtf", "one", "xml",
  "xll", "pdf", "doc", "xls", "ppt",
]);
const RISKY_DOUBLE = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|txt|invoice|receipt)\.(exe|scr|com|pif|bat|cmd|js|vbs|hta|lnk|html?|svg|iso|img|zip)$/i;

function attachmentExtension(filename: string): string {
  const clean = filename.replace(/["']/g, "").trim();
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

function analyzeAttachments(parts: MimePart[]): AttachmentInfo[] {
  const out: AttachmentInfo[] = [];
  for (const p of parts) {
    const isAttachment = p.disposition === "attachment" || Boolean(p.filename);
    if (!isAttachment) continue;
    const filename = (p.filename ?? "(unnamed)").replace(/["']/g, "");
    const ext = attachmentExtension(filename);
    const reasons: string[] = [];
    let risk: AttachmentInfo["risk"] = "low";

    if (RISKY_DOUBLE.test(filename)) {
      risk = "high";
      reasons.push("Double extension disguising an executable/script as a document.");
    }
    if (ATTACH_HIGH.has(ext)) {
      risk = "high";
      if (ext === "htm" || ext === "html" || ext === "shtml" || ext === "svg") {
        reasons.push(`.${ext} attachment — local credential-harvest page / HTML smuggling (opens a phishing form straight from the inbox, bypassing URL reputation).`);
      } else {
        reasons.push(`.${ext} is a directly executable / script type — should never arrive by email and is normally stripped by mail filters.`);
      }
    } else if (ATTACH_MEDIUM.has(ext)) {
      if (risk !== "high") risk = "medium";
      if (ext === "zip" || ext === "rar" || ext === "7z" || ext === "iso" || ext === "img") {
        reasons.push(`Archive (.${ext}) — common wrapper used to smuggle executables past attachment scanning.`);
      } else if (ext === "pdf" || ext === "doc" || ext === "xls" || ext === "ppt") {
        reasons.push(`Office/PDF document (.${ext}) — may carry macros, embedded links, or QR codes; inspect before opening.`);
      } else {
        reasons.push(`.${ext} can carry active content.`);
      }
    }
    if (reasons.length === 0) reasons.push("No high-risk indicators on the filename.");

    out.push({
      filename,
      contentType: p.contentType,
      sizeBytes: p.sizeBytes,
      disposition: p.disposition || "attachment",
      extension: ext,
      sha256: null,
      risk,
      reasons,
    });
  }
  return out;
}

function isAttachmentPart(p: MimePart): boolean {
  return p.disposition === "attachment" || Boolean(p.filename);
}

/**
 * Fill in each attachment's SHA-256 from its decoded bytes, then drop the bytes.
 * Async (crypto.subtle), so callers await it after parseEmail. Attachments and
 * their source parts are in the same order, so they align by index.
 */
export async function fillAttachmentHashes(parsed: ParsedEmail): Promise<void> {
  const attParts = parsed.parts.filter(isAttachmentPart);
  for (let i = 0; i < parsed.attachments.length; i++) {
    const bytes = attParts[i]?.bytes;
    if (bytes && bytes.length > 0) {
      try {
        const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
        parsed.attachments[i].sha256 = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch { /* leave null */ }
    }
  }
  // bytes are transient — never transport them
  for (const p of parsed.parts) p.bytes = null;
}

export interface GraphIocs {
  ips: string[];
  urls: string[];
  domains: string[];
  hashes: string[];
  senderDomain: string | null;
  emails: string[];
}

/**
 * Attacker-side IOCs safe to persist in the pivot graph — excludes victim
 * identity (recipient addresses, decoded UPN artifacts, and any host on a
 * protected/victim domain). victimDomains comes from config (e.g.
 * "dsbn.org,studentsdsbn.org"); nothing PII is hardcoded in the parser.
 */
export function nonPiiIocs(parsed: ParsedEmail, victimDomains: string[]): GraphIocs {
  const vic = victimDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
  const onVictimDomain = (host: string) => {
    const h = host.toLowerCase();
    return vic.some((v) => h === v || h.endsWith("." + v));
  };
  const isVictimAddr = (addr: string) => onVictimDomain(addr.split("@")[1] ?? "");

  const fromAddr = parsed.from.match(/<([^>]+)>|([^\s<>]+@[^\s<>]+)/)?.[1]
    ?? parsed.from.match(/([^\s<>]+@[^\s<>]+)/)?.[1] ?? "";
  const senderDomain = fromAddr.split("@")[1]?.toLowerCase() || null;

  const urls = parsed.urls
    .filter((u) => u.finalHost && u.finalHost.includes(".") && !isWrapperHost(u.finalHost) && !onVictimDomain(u.finalHost))
    .map((u) => u.final);
  const domains = parsed.domains.filter((d) => d.includes(".") && !onVictimDomain(d));
  const hashes = parsed.attachments.map((a) => a.sha256).filter((h): h is string => Boolean(h));
  // Only the SENDER/attacker identity addresses go to the graph — never arbitrary
  // body-extracted addresses, which are noisy and can be victims on non-org
  // domains (e.g. a student's personal Gmail) that the domain filter can't catch.
  const pick = (h: string) => h.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? "";
  const emails = [...new Set(
    [parsed.from, parsed.replyTo, parsed.returnPath, parsed.defender.authenticatedSender ?? ""]
      .map(pick)
      .filter((a) => a && !isVictimAddr(a)),
  )];

  return {
    ips: [...new Set(parsed.ips)],
    urls: [...new Set(urls)],
    domains: [...new Set(domains)],
    hashes: [...new Set(hashes)],
    senderDomain: senderDomain && !onVictimDomain(senderDomain) ? senderDomain : senderDomain,
    emails: [...new Set(emails)],
  };
}

/** From: "Display Name" <addr@dom> — pull the quoted/leading display name. */
function extractDisplayName(fromHeader: string): string {
  const quoted = fromHeader.match(/"([^"]+)"/)?.[1];
  if (quoted) return quoted.trim();
  const before = fromHeader.split("<")[0].trim();
  return before.includes("@") ? "" : before;
}

const BRANDS = [
  "microsoft", "office365", "office 365", "outlook", "onedrive", "sharepoint",
  "paypal", "amazon", "apple", "icloud", "google", "docusign", "adobe",
  "netflix", "facebook", "instagram", "linkedin", "dhl", "fedex", "ups",
  "wells fargo", "chase", "bank of america", "american express", "amex",
];

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
  // Display-name impersonation — independent of whatever Defender's SFTY caught.
  const displayName = extractDisplayName(headers["from"] ?? "");
  if (displayName) {
    const dnLower = displayName.toLowerCase();
    const dnEmailDomain = displayName.match(/[\w.+-]+@([\w.-]+\.[a-z]{2,})/i)?.[1]?.toLowerCase();
    if (dnEmailDomain && fromDomain && dnEmailDomain !== fromDomain) {
      indicators.push(
        `Display name embeds a different address (@${dnEmailDomain}) than the real sender (${fromDomain}) — spoofed sender identity.`
      );
    }
    const brand = BRANDS.find((b) => dnLower.includes(b));
    if (brand && fromDomain) {
      const brandKey = brand.replace(/\s+/g, "");
      if (!fromDomain.includes(brandKey) && !fromDomain.includes(brandKey.slice(0, 6))) {
        indicators.push(
          `Display name impersonates "${displayName}" (brand: ${brand}) but the message came from ${fromDomain}, which is not a ${brand} domain.`
        );
      }
    }
  }

  // Lookalike / homoglyph sender domain (low-FP checks only).
  if (fromDomain) {
    if (/(^|\.)xn--/.test(fromDomain)) {
      indicators.push(`Sender domain ${fromDomain} is an IDN/punycode (xn--) domain — possible homoglyph lookalike of a trusted brand.`);
    }
    const labels = fromDomain.split(".");
    const reg = labels.slice(-2).join(".");
    const subLabels = labels.slice(0, -2);
    for (const b of BRANDS) {
      if (b.includes(" ")) continue;
      // a brand sitting in a SUBDOMAIN label while the registered domain is unrelated
      if (subLabels.includes(b) && !reg.includes(b)) {
        indicators.push(`Sender domain ${fromDomain} places "${b}" in a subdomain while the registered domain is ${reg} — brand impersonation via subdomain.`);
        break;
      }
    }
  }

  // Job-scam targeting (free-webmail sender + hiring + payout) — the student-money
  // pattern: a personal webmail account dangling a remote job that needs a payment,
  // gift card, or check handled.
  const FREE_WEBMAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|ymail|rocketmail|icloud|me|aol|proton|protonmail|gmx|mail)\.[a-z.]+$/i;
  const hiring = /\b(job (offer|opportunit|opening|vacanc)|hiring|now recruiting|remote (job|work|position)|part[-\s]?time (job|work|position)|work[-\s]?from[-\s]?home|employment opportunit|position (is )?available|payroll (clerk|assistant)|personal assistant)\b/i.test(plainBody);
  const payout = /\b(gift\s?cards?|cheque|(check|cheque) (will|has been|is being) (sent|mailed|deposited)|zelle|venmo|cash\s?app|wire (the|you|funds|transfer)|western union|money\s?gram|reimburse|deposit .* (account|check)|purchase .* (cards?|equipment|supplies))\b/i.test(plainBody);
  if (FREE_WEBMAIL.test(fromDomain) && hiring && payout) {
    indicators.push("Job-scam pattern: free-webmail sender + hiring/remote-job language + a payment/gift-card/check request — classic advance-fee job scam (frequently targets students).");
  }

  // Rapport-chain hint — AI-written chains often stay benign for several replies
  // before the ask. A deep Re: thread with references is worth a second look.
  const subjReplies = ((headers["subject"] ?? "").match(/re\s*:/gi) ?? []).length;
  if ((headers["references"] || headers["in-reply-to"]) && subjReplies >= 2) {
    indicators.push("Deep reply chain (Re: Re: …) with thread references — watch for rapport-building chains that only turn malicious in a later reply.");
  }

  // Return-Path / Reply-To divergence is NORMAL for legitimate ESPs and mailing
  // lists, so it is only worth surfacing when DMARC did not actually pass (i.e.
  // the From identity is not verified). Without this guard it fired on most
  // newsletters and generated alert-fatigue noise.
  const dmarcPass = defender.dmarc === "pass";
  const returnAddr = (headers["return-path"] ?? "").match(/<([^>]+)>/)?.[1] ?? headers["return-path"] ?? "";
  const returnDomain = returnAddr.split("@")[1]?.toLowerCase() ?? "";
  if (!dmarcPass && returnDomain && fromDomain && returnDomain !== fromDomain) {
    indicators.push(`Return-Path (${returnAddr}) is on a different domain than From (${fromAddr}) and DMARC did not pass — possible spoofing.`);
  }
  const replyAddr = (headers["reply-to"] ?? "").match(/<([^>]+)>|([^\s<>]+@[^\s<>]+)/)?.[1] ?? "";
  const replyDomain = replyAddr.split("@")[1]?.toLowerCase() ?? "";
  if (replyDomain && fromDomain && replyDomain !== fromDomain) {
    indicators.push(`Reply-To (${replyAddr}) is on a different domain than From (${fromAddr}) — replies leave the sender's domain (common in BEC reply-hijack; also seen in some legitimate newsletters).`);
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

  const attachments = analyzeAttachments(parts);
  for (const att of attachments) {
    if (att.risk === "high") {
      indicators.push(`Dangerous attachment "${att.filename}" — ${att.reasons[0]}`);
    }
  }

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
    attachments,
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
