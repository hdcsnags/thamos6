import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PRODUCTION_ORIGINS = new Set([
  "https://t6.thamos.ca",
  "https://thamos6.pages.dev",
]);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  if (PRODUCTION_ORIGINS.has(origin)) return true;

  if (origin.startsWith("http://localhost") || origin.startsWith("https://localhost")) return true;

  if (origin.includes(".webcontainer") || origin.includes(".local-credentialless.webcontainer-api.io")) return true;

  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = isAllowedOrigin(origin) ? origin : "https://t6.thamos.ca";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
const TRUSTED_DOMAIN = "dsbn.org";

type UserTier = "anon" | "dsbn" | "external";

interface TierContext {
  tier: UserTier;
  userId: string | null;
  email: string | null;
  cacheContext: string;
}

interface ThreatResult {
  source: string;
  data: Record<string, unknown>;
  error?: string;
  threatScore?: number;
  isMalicious?: boolean;
}

interface IPEnrichment {
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  org?: string;
  asn?: string;
  isVPN?: boolean;
  vpnService?: string;
  isTor?: boolean;
  isProxy?: boolean;
  isHosting?: boolean;
  isBot?: boolean;
  isMassScanner?: boolean;
  isKnownScanner?: boolean;
  scannerType?: string;
  timezone?: string;
  lat?: number;
  lon?: number;
  spamhausListed?: boolean;
  spamhausLists?: string[];
}

const FREE_SOURCES = [
  "ipapi", "threatfox", "urlhaus", "rdap", "teoh", "spamhaus", "alienvault", "teamcymru", "blocklistde"
];

const PAID_SOURCES = [
  "virustotal", "abuseipdb", "shodan", "ipqualityscore", "proxycheck", "greynoise", "urlscan", "ip2proxy", "iphub", "vpnapi"
];

const CACHE_DURATION_HOURS = 6;
const REQUEST_TIMEOUT_MS = 10000;

async function verifyAndGetTier(req: Request): Promise<TierContext> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { tier: "anon", userId: null, email: null, cacheContext: "anon" };
  }

  const token = authHeader.replace("Bearer ", "");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await userClient.auth.getUser();

  if (error || !user) {
    return { tier: "anon", userId: null, email: null, cacheContext: "anon" };
  }

  const email = user.email ?? "";
  const userId = user.id;

  if (email === ADMIN_EMAIL) {
    return { tier: "dsbn", userId, email, cacheContext: "org:dsbn" };
  }

  if (email.endsWith(`@${TRUSTED_DOMAIN}`)) {
    return { tier: "dsbn", userId, email, cacheContext: "org:dsbn" };
  }

  return { tier: "external", userId, email, cacheContext: `user:${userId}` };
}

async function getOrgApiKeys(): Promise<Record<string, string>> {
  return {
    virustotal: Deno.env.get("VIRUSTOTAL_API_KEY") ?? "",
    abuseipdb: Deno.env.get("ABUSEIPDB_API_KEY") ?? "",
    alienvault: Deno.env.get("ALIENVAULT_API_KEY") ?? "",
    shodan: Deno.env.get("SHODAN_API_KEY") ?? "",
    ipqualityscore: Deno.env.get("IPQUALITYSCORE_API_KEY") ?? "",
    urlscan: Deno.env.get("URLSCAN_API_KEY") ?? "",
    proxycheck: Deno.env.get("PROXYCHECK_API_KEY") ?? "",
    greynoise: Deno.env.get("GREYNOISE_API_KEY") ?? "",
    ip2proxy: Deno.env.get("IP2PROXY_API_KEY") ?? "",
    iphub: Deno.env.get("IPHUB_API_KEY") ?? "",
    vpnapi: Deno.env.get("VPNAPI_API_KEY") ?? "",
  };
}

const API_KEY_ENCRYPTION_KEY = Deno.env.get("API_KEY_ENCRYPTION_KEY") ?? "";

function decodeB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function getEncryptionKey(): Promise<CryptoKey> {
  if (!API_KEY_ENCRYPTION_KEY) throw new Error("Missing API_KEY_ENCRYPTION_KEY");
  const raw = decodeB64(API_KEY_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new Error("API_KEY_ENCRYPTION_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function deriveEncryptionKeyLegacy(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("thamos6-api-key-encryption"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptApiKey(encrypted: { iv: string; ciphertext: string; keyVersion: number }): Promise<string> {
  const iv = decodeB64(encrypted.iv);
  const ciphertext = decodeB64(encrypted.ciphertext);

  if (API_KEY_ENCRYPTION_KEY) {
    try {
      const key = await getEncryptionKey();
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      return new TextDecoder().decode(decrypted);
    } catch {
    }
  }

  if (SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const legacyKey = await deriveEncryptionKeyLegacy();
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, legacyKey, ciphertext);
      return new TextDecoder().decode(decrypted);
    } catch {
    }
  }

  return "";
}

async function getUserApiKeys(userId: string): Promise<Record<string, string>> {
  const { data } = await serviceClient
    .from("user_api_keys")
    .select("service, encrypted_key, api_key")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!data) return {};

  const keys: Record<string, string> = {};
  for (const row of data) {
    if (row.encrypted_key) {
      const decrypted = await decryptApiKey(row.encrypted_key);
      if (decrypted) {
        keys[row.service] = decrypted;
        continue;
      }
    }
    if (row.api_key) {
      keys[row.service] = row.api_key;
    }
  }
  return keys;
}

async function getApiKeysForTier(ctx: TierContext): Promise<Record<string, string>> {
  if (ctx.tier === "anon") {
    return {};
  }

  if (ctx.tier === "dsbn") {
    return await getOrgApiKeys();
  }

  if (ctx.tier === "external" && ctx.userId) {
    return await getUserApiKeys(ctx.userId);
  }

  return {};
}

function getSourcesForTier(tier: UserTier, apiKeys: Record<string, string>): string[] {
  if (tier === "anon") {
    return FREE_SOURCES;
  }

  const available = [...FREE_SOURCES];
  for (const source of PAID_SOURCES) {
    if (apiKeys[source]) {
      available.push(source);
    }
  }
  return available;
}

async function getCachedResponse(ctx: TierContext, source: string, query: string): Promise<Record<string, unknown> | null> {
  const cacheKey = `${ctx.cacheContext}:${source}:${query}`;
  const { data } = await serviceClient
    .from("api_cache")
    .select("response")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data?.response ?? null;
}

async function setCachedResponse(ctx: TierContext, source: string, query: string, response: Record<string, unknown>): Promise<void> {
  const cacheKey = `${ctx.cacheContext}:${source}:${query}`;
  const expiresAt = new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  await serviceClient
    .from("api_cache")
    .upsert({
      cache_key: cacheKey,
      source,
      query,
      response,
      expires_at: expiresAt,
      context: ctx.cacheContext
    }, { onConflict: "cache_key" });
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getCallerIP(req: Request): string | null {
  return req.headers.get("CF-Connecting-IP")
    ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? null;
}

async function logAuditEvent(
  req: Request,
  ctx: TierContext,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const requestId = crypto.randomUUID();
  const callerIP = getCallerIP(req);
  await serviceClient.from("audit_events").insert({
    request_id: requestId,
    user_id: ctx.userId,
    user_email: ctx.email,
    user_tier: ctx.tier,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata,
    ip_address: callerIP,
    created_at: new Date().toISOString(),
  });
}

async function checkIPAPI(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "ipapi", ip);
  if (cached) return { source: "ipapi", data: cached };
  try {
    const response = await fetchWithTimeout(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,query`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.status === "fail") throw new Error(data.message);
    await setCachedResponse(ctx, "ipapi", ip, data);
    return { source: "ipapi", data };
  } catch (e) {
    return { source: "ipapi", data: {}, error: String(e) };
  }
}

async function checkProxyCheck(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "proxycheck", ip);
  if (cached) return { source: "proxycheck", data: cached };
  try {
    const keyParam = apiKey ? `&key=${apiKey}` : "";
    const response = await fetchWithTimeout(`https://proxycheck.io/v2/${ip}?vpn=1&asn=1&risk=1${keyParam}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "proxycheck", ip, data);
    return { source: "proxycheck", data };
  } catch (e) {
    return { source: "proxycheck", data: {}, error: String(e) };
  }
}

async function checkVirusTotal(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "virustotal", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "virustotal", ip);
  if (cached) return { source: "virustotal", data: cached, threatScore: calculateVTScore(cached) };
  try {
    const response = await fetchWithTimeout(`https://www.virustotal.com/api/v3/ip_addresses/${ip}`, { headers: { "x-apikey": apiKey } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "virustotal", ip, data);
    return { source: "virustotal", data, threatScore: calculateVTScore(data) };
  } catch (e) {
    return { source: "virustotal", data: {}, error: String(e) };
  }
}

function calculateVTScore(data: Record<string, unknown>): number {
  const stats = (data as any)?.data?.attributes?.last_analysis_stats;
  if (!stats) return 0;
  const total = stats.malicious + stats.suspicious + stats.harmless + stats.undetected;
  if (total === 0) return 0;
  return Math.round(((stats.malicious * 100 + stats.suspicious * 50) / total) * 100) / 100;
}

async function checkAbuseIPDB(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "abuseipdb", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "abuseipdb", ip);
  if (cached) return { source: "abuseipdb", data: cached, threatScore: (cached as any)?.data?.abuseConfidenceScore ?? 0 };
  try {
    const response = await fetchWithTimeout(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90&verbose=true`, { headers: { "Key": apiKey, "Accept": "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "abuseipdb", ip, data);
    return { source: "abuseipdb", data, threatScore: data?.data?.abuseConfidenceScore ?? 0 };
  } catch (e) {
    return { source: "abuseipdb", data: {}, error: String(e) };
  }
}

async function checkAlienVaultOTX(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "alienvault", ip);
  if (cached) return { source: "alienvault", data: cached, threatScore: calculateOTXScore(cached) };
  try {
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (apiKey) headers["X-OTX-API-KEY"] = apiKey;
    const response = await fetchWithTimeout(`https://otx.alienvault.com/api/v1/indicators/IPv4/${ip}/general`, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "alienvault", ip, data);
    return { source: "alienvault", data, threatScore: calculateOTXScore(data) };
  } catch (e) {
    return { source: "alienvault", data: {}, error: String(e) };
  }
}

function calculateOTXScore(data: Record<string, unknown>): number {
  const pulseCount = (data as any)?.pulse_info?.count ?? 0;
  return Math.min(pulseCount * 10, 100);
}

async function checkShodan(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "shodan", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "shodan", ip);
  if (cached) return { source: "shodan", data: cached };
  try {
    const response = await fetchWithTimeout(`https://api.shodan.io/shodan/host/${ip}?key=${apiKey}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "shodan", ip, data);
    return { source: "shodan", data };
  } catch (e) {
    return { source: "shodan", data: {}, error: String(e) };
  }
}

async function checkIPQualityScore(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "ipqualityscore", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "ipqualityscore", ip);
  if (cached) return { source: "ipqualityscore", data: cached, threatScore: (cached as any)?.fraud_score ?? 0 };
  try {
    const response = await fetchWithTimeout(`https://ipqualityscore.com/api/json/ip/${apiKey}/${ip}?strictness=1&allow_public_access_points=true`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "ipqualityscore", ip, data);
    return { source: "ipqualityscore", data, threatScore: data?.fraud_score ?? 0 };
  } catch (e) {
    return { source: "ipqualityscore", data: {}, error: String(e) };
  }
}

async function checkThreatFox(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "threatfox", ip);
  if (cached) return { source: "threatfox", data: cached, isMalicious: ((cached as any)?.query_status === "ok" && (cached as any)?.data?.length > 0) };
  try {
    const response = await fetchWithTimeout("https://threatfox-api.abuse.ch/api/v1/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "search_ioc", search_term: ip }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "threatfox", ip, data);
    return { source: "threatfox", data, isMalicious: data?.query_status === "ok" && data?.data?.length > 0 };
  } catch (e) {
    return { source: "threatfox", data: {}, error: String(e) };
  }
}

async function checkURLhaus(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "urlhaus", ip);
  if (cached) return { source: "urlhaus", data: cached, isMalicious: (cached as any)?.query_status === "ok" };
  try {
    const formData = new FormData();
    formData.append("host", ip);
    const response = await fetchWithTimeout("https://urlhaus-api.abuse.ch/v1/host/", { method: "POST", body: formData });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "urlhaus", ip, data);
    return { source: "urlhaus", data, isMalicious: data?.query_status === "ok" };
  } catch (e) {
    return { source: "urlhaus", data: {}, error: String(e) };
  }
}

async function checkRDAP(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "rdap", ip);
  if (cached) return { source: "rdap", data: cached };
  try {
    const response = await fetchWithTimeout(`https://rdap.arin.net/registry/ip/${ip}`);
    if (!response.ok) {
      const ripeResponse = await fetchWithTimeout(`https://rdap.db.ripe.net/ip/${ip}`);
      if (!ripeResponse.ok) throw new Error("RDAP lookup failed");
      const data = await ripeResponse.json();
      await setCachedResponse(ctx, "rdap", ip, data);
      return { source: "rdap", data };
    }
    const data = await response.json();
    await setCachedResponse(ctx, "rdap", ip, data);
    return { source: "rdap", data };
  } catch (e) {
    return { source: "rdap", data: {}, error: String(e) };
  }
}

async function checkTeohVPN(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "teoh", ip);
  if (cached) return { source: "teoh", data: cached };
  try {
    const response = await fetchWithTimeout(`https://ip.teoh.io/api/vpn/${ip}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "teoh", ip, data);
    return { source: "teoh", data };
  } catch (e) {
    return { source: "teoh", data: {}, error: String(e) };
  }
}

async function checkTorExitList(ip: string): Promise<ThreatResult> {
  try {
    const { data, error } = await serviceClient
      .from("tor_exit_nodes")
      .select("ip_address, last_seen")
      .eq("ip_address", ip)
      .maybeSingle();

    if (error) throw error;

    const isTorExit = data !== null;
    return {
      source: "tor_exit_list",
      data: {
        is_tor_exit: isTorExit,
        last_seen: data?.last_seen,
        source: "Tor Project Exit List"
      },
      isMalicious: false,
      threatScore: 0
    };
  } catch (e) {
    return { source: "tor_exit_list", data: {}, error: String(e) };
  }
}

async function checkIP2Proxy(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "ip2proxy", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "ip2proxy", ip);
  if (cached) return { source: "ip2proxy", data: cached };
  try {
    const response = await fetchWithTimeout(`https://api.ip2proxy.com/?key=${apiKey}&ip=${ip}&package=PX11&format=json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "ip2proxy", ip, data);

    const isProxy = data.isProxy !== "NO" && data.isProxy !== "-";
    return {
      source: "ip2proxy",
      data: {
        is_proxy: isProxy,
        proxy_type: data.proxyType !== "-" ? data.proxyType : null,
        country_code: data.countryCode !== "-" ? data.countryCode : null,
        country_name: data.countryName !== "-" ? data.countryName : null,
        isp: data.isp !== "-" ? data.isp : null,
        usage_type: data.usageType !== "-" ? data.usageType : null,
        asn: data.asn !== "-" ? data.asn : null,
        as_name: data.as !== "-" ? data.as : null,
        threat: data.threat !== "-" ? data.threat : null,
        provider: data.provider !== "-" ? data.provider : null,
        source: "IP2Proxy API"
      },
      isMalicious: false,
      threatScore: 0
    };
  } catch (e) {
    return { source: "ip2proxy", data: {}, error: String(e) };
  }
}

async function checkIPHub(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "iphub", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "iphub", ip);
  if (cached) return { source: "iphub", data: cached };
  try {
    const response = await fetchWithTimeout(`https://v2.api.iphub.info/ip/${ip}`, {
      headers: { "X-Key": apiKey }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "iphub", ip, data);
    return {
      source: "iphub",
      data: {
        ip: data.ip,
        country_code: data.countryCode,
        country_name: data.countryName,
        asn: data.asn,
        isp: data.isp,
        block: data.block,
        hostname: data.hostname,
        source: "IPHub API"
      }
    };
  } catch (e) {
    return { source: "iphub", data: {}, error: String(e) };
  }
}

async function checkTeamCymru(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "teamcymru", ip);
  if (cached) return { source: "teamcymru", data: cached };
  try {
    const reversed = ip.split(".").reverse().join(".");
    const response = await fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${reversed}.origin.asn.cymru.com&type=TXT`, {
      headers: { "Accept": "application/dns-json" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dnsData = await response.json();

    if (!dnsData?.Answer || dnsData.Answer.length === 0) {
      return { source: "teamcymru", data: { ip, found: false } };
    }

    const txtRecord = dnsData.Answer[0]?.data?.replace(/"/g, "") ?? "";
    const parts = txtRecord.split("|").map((s: string) => s.trim());

    const result = {
      ip,
      found: true,
      asn: parts[0] || null,
      bgp_prefix: parts[1] || null,
      country_code: parts[2] || null,
      registry: parts[3] || null,
      allocated: parts[4] || null,
      source: "Team Cymru IP-ASN"
    };

    await setCachedResponse(ctx, "teamcymru", ip, result);
    return { source: "teamcymru", data: result };
  } catch (e) {
    return { source: "teamcymru", data: {}, error: String(e) };
  }
}

async function checkVPNProvider(asn: string | undefined, org: string | undefined): Promise<ThreatResult> {
  if (!asn && !org) {
    return { source: "vpn_provider", data: { provider: null, confidence: null } };
  }

  try {
    const asnNumber = asn ? parseInt(asn.replace(/\D/g, "")) : null;

    if (asnNumber) {
      const { data: asnMatch, error } = await serviceClient
        .from("vpn_providers")
        .select("provider_name, confidence, asn, org_pattern")
        .eq("asn", asnNumber)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (asnMatch) {
        return {
          source: "vpn_provider",
          data: {
            provider: asnMatch.provider_name,
            confidence: asnMatch.confidence,
            matched_by: "asn"
          }
        };
      }
    }

    if (org) {
      const { data: providers, error } = await serviceClient
        .from("vpn_providers")
        .select("provider_name, confidence, asn, org_pattern")
        .not("org_pattern", "is", null);

      if (error) throw error;

      if (providers) {
        const orgLower = org.toLowerCase();
        const match = providers.find(p =>
          p.org_pattern && orgLower.includes(p.org_pattern.toLowerCase())
        );

        if (match) {
          return {
            source: "vpn_provider",
            data: {
              provider: match.provider_name,
              confidence: match.confidence,
              matched_by: "org_pattern"
            }
          };
        }
      }

      const vpnKeywords = ["vpn", "proxy", "mullvad", "nord", "express", "proton", "surfshark", "cyberghost", "private internet access"];
      const hasVpnKeyword = vpnKeywords.some(keyword => org.toLowerCase().includes(keyword));

      if (hasVpnKeyword) {
        return {
          source: "vpn_provider",
          data: {
            provider: "Unknown VPN",
            confidence: "low",
            matched_by: "keyword_heuristic"
          }
        };
      }
    }

    return { source: "vpn_provider", data: { provider: null, confidence: null } };
  } catch (e) {
    return { source: "vpn_provider", data: {}, error: String(e) };
  }
}

async function checkGreyNoise(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "greynoise", ip);
  if (cached) {
    const isRiot = (cached as any)?.riot === true;
    const isNoise = (cached as any)?.noise === true;
    const classification = (cached as any)?.classification;
    let threatScore = 0;
    if (classification === "malicious") threatScore = 80;
    else if (classification === "unknown" && isNoise) threatScore = 30;
    return { source: "greynoise", data: cached, threatScore, isMalicious: classification === "malicious" };
  }
  try {
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (apiKey) headers["key"] = apiKey;
    const response = await fetchWithTimeout(`https://api.greynoise.io/v3/community/${ip}`, { headers });
    if (response.status === 404) {
      const notFound = { noise: false, riot: false, message: "IP not observed scanning the internet" };
      await setCachedResponse(ctx, "greynoise", ip, notFound);
      return { source: "greynoise", data: notFound, threatScore: 0 };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "greynoise", ip, data);
    const classification = data?.classification;
    let threatScore = 0;
    if (classification === "malicious") threatScore = 80;
    else if (classification === "unknown" && data?.noise) threatScore = 30;
    return { source: "greynoise", data, threatScore, isMalicious: classification === "malicious" };
  } catch (e) {
    return { source: "greynoise", data: {}, error: String(e) };
  }
}

const SPAMHAUS_ZONES = [
  { zone: "zen.spamhaus.org", name: "Spamhaus ZEN", description: "Combined blocklist (SBL+XBL+PBL)" },
  { zone: "sbl.spamhaus.org", name: "Spamhaus SBL", description: "Spamhaus Block List - known spam sources" },
  { zone: "xbl.spamhaus.org", name: "Spamhaus XBL", description: "Exploits Block List - hijacked PCs/bots" },
  { zone: "pbl.spamhaus.org", name: "Spamhaus PBL", description: "Policy Block List - end-user IPs" },
];

async function checkSpamhaus(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "spamhaus", ip);
  if (cached) {
    const lists = (cached as any)?.listedIn ?? [];
    return { source: "spamhaus", data: cached, isMalicious: lists.length > 0, threatScore: lists.length > 0 ? 60 : 0 };
  }
  try {
    const reversed = ip.split(".").reverse().join(".");
    const listedIn: string[] = [];
    const details: Record<string, any> = {};

    const zoneChecks = await Promise.allSettled(
      SPAMHAUS_ZONES.map(async ({ zone, name, description }) => {
        const response = await fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${reversed}.${zone}&type=A`, {
          headers: { "Accept": "application/dns-json" }
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.Answer && data.Answer.length > 0) {
            return { zone, name, description, listed: true, returnCodes: data.Answer.map((a: any) => a.data) };
          }
        }
        return null;
      })
    );

    for (const result of zoneChecks) {
      if (result.status === "fulfilled" && result.value) {
        listedIn.push(result.value.name);
        details[result.value.zone] = result.value;
      }
    }

    const result = { ip, listedIn, details, checked: SPAMHAUS_ZONES.map(z => z.name) };
    await setCachedResponse(ctx, "spamhaus", ip, result);
    return { source: "spamhaus", data: result, isMalicious: listedIn.length > 0, threatScore: listedIn.length > 0 ? 60 : 0 };
  } catch (e) {
    return { source: "spamhaus", data: {}, error: String(e) };
  }
}

const BLOCKLIST_DE_ZONES = [
  { zone: "all.bl.blocklist.de", name: "Blocklist.de All", description: "All attacking IPs in last 48h" },
  { zone: "ssh.bl.blocklist.de", name: "Blocklist.de SSH", description: "SSH brute-force attackers" },
  { zone: "mail.bl.blocklist.de", name: "Blocklist.de Mail", description: "Mail server attackers" },
];

async function checkBlocklistDE(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "blocklistde", ip);
  if (cached) {
    const lists = (cached as any)?.listedIn ?? [];
    return { source: "blocklistde", data: cached, isMalicious: lists.length > 0, threatScore: lists.length > 0 ? 70 : 0 };
  }
  try {
    const reversed = ip.split(".").reverse().join(".");
    const listedIn: string[] = [];
    const details: Record<string, any> = {};

    const zoneChecks = await Promise.allSettled(
      BLOCKLIST_DE_ZONES.map(async ({ zone, name, description }) => {
        const response = await fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${reversed}.${zone}&type=A`, {
          headers: { "Accept": "application/dns-json" }
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.Answer && data.Answer.length > 0) {
            return { zone, name, description, listed: true, returnCodes: data.Answer.map((a: any) => a.data) };
          }
        }
        return null;
      })
    );

    for (const result of zoneChecks) {
      if (result.status === "fulfilled" && result.value) {
        listedIn.push(result.value.name);
        details[result.value.zone] = result.value;
      }
    }

    const result = { ip, listedIn, details, checked: BLOCKLIST_DE_ZONES.map(z => z.name) };
    await setCachedResponse(ctx, "blocklistde", ip, result);
    return { source: "blocklistde", data: result, isMalicious: listedIn.length > 0, threatScore: listedIn.length > 0 ? 70 : 0 };
  } catch (e) {
    return { source: "blocklistde", data: {}, error: String(e) };
  }
}

async function checkVPNAPI(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "vpnapi", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "vpnapi", ip);
  if (cached) return { source: "vpnapi", data: cached };
  try {
    const response = await fetchWithTimeout(`https://vpnapi.io/api/${ip}?key=${apiKey}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "vpnapi", ip, data);
    return {
      source: "vpnapi",
      data: {
        ip: data.ip,
        is_vpn: data.security?.vpn ?? false,
        is_proxy: data.security?.proxy ?? false,
        is_tor: data.security?.tor ?? false,
        is_relay: data.security?.relay ?? false,
        country: data.location?.country,
        country_code: data.location?.country_code,
        city: data.location?.city,
        isp: data.network?.autonomous_system_organization,
        asn: data.network?.autonomous_system_number ? `AS${data.network.autonomous_system_number}` : null,
        source: "VPNAPI.io"
      }
    };
  } catch (e) {
    return { source: "vpnapi", data: {}, error: String(e) };
  }
}

async function checkURLScan(ctx: TierContext, url: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "urlscan", data: {}, error: "API key not configured" };
  try {
    const submitResponse = await fetchWithTimeout("https://urlscan.io/api/v1/scan/", { method: "POST", headers: { "API-Key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ url, visibility: "public" }) });
    if (!submitResponse.ok) throw new Error(`HTTP ${submitResponse.status}`);
    const submitData = await submitResponse.json();
    return { source: "urlscan", data: { submitted: true, uuid: submitData.uuid, resultUrl: submitData.result } };
  } catch (e) {
    return { source: "urlscan", data: {}, error: String(e) };
  }
}

async function checkVirusTotalURL(ctx: TierContext, url: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "virustotal_url", data: {}, error: "API key not configured" };
  try {
    const urlId = btoa(url).replace(/=/g, "");
    const response = await fetchWithTimeout(`https://www.virustotal.com/api/v3/urls/${urlId}`, { headers: { "x-apikey": apiKey } });
    if (response.status === 404) {
      const scanResponse = await fetchWithTimeout("https://www.virustotal.com/api/v3/urls", { method: "POST", headers: { "x-apikey": apiKey, "Content-Type": "application/x-www-form-urlencoded" }, body: `url=${encodeURIComponent(url)}` });
      const scanData = await scanResponse.json();
      return { source: "virustotal_url", data: { submitted: true, ...scanData } };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const stats = data?.data?.attributes?.last_analysis_stats;
    const isMalicious = stats ? (stats.malicious > 0 || stats.suspicious > 0) : false;
    return { source: "virustotal_url", data, isMalicious };
  } catch (e) {
    return { source: "virustotal_url", data: {}, error: String(e) };
  }
}

async function checkURLhausURL(ctx: TierContext, url: string): Promise<ThreatResult> {
  try {
    const formData = new FormData();
    formData.append("url", url);
    const response = await fetchWithTimeout("https://urlhaus-api.abuse.ch/v1/url/", { method: "POST", body: formData });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return { source: "urlhaus_url", data, isMalicious: data?.query_status === "ok" };
  } catch (e) {
    return { source: "urlhaus_url", data: {}, error: String(e) };
  }
}

function extractEnrichment(results: ThreatResult[]): IPEnrichment {
  const enrichment: IPEnrichment = {};

  const torExitList = results.find(r => r.source === "tor_exit_list")?.data as any;
  if (torExitList && torExitList.is_tor_exit === true) {
    enrichment.isTor = true;
  }

  const ip2proxy = results.find(r => r.source === "ip2proxy")?.data as any;
  if (ip2proxy && ip2proxy.is_proxy === true) {
    if (ip2proxy.proxy_type === "VPN") {
      enrichment.isVPN = true;
      enrichment.vpnService = ip2proxy.isp || "Unknown VPN";
    } else if (ip2proxy.proxy_type === "DCH") {
      enrichment.isHosting = true;
    } else if (ip2proxy.proxy_type === "PUB") {
      enrichment.isProxy = true;
    } else if (ip2proxy.proxy_type === "TOR") {
      enrichment.isTor = true;
    }
  }

  const vpnProvider = results.find(r => r.source === "vpn_provider")?.data as any;
  if (vpnProvider && vpnProvider.provider) {
    enrichment.isVPN = true;
    enrichment.vpnService = vpnProvider.provider;
  }

  const ipapi = results.find(r => r.source === "ipapi")?.data as any;
  if (ipapi && !ipapi.error) {
    enrichment.country = ipapi.country;
    enrichment.countryCode = ipapi.countryCode;
    enrichment.city = ipapi.city;
    enrichment.region = ipapi.regionName;
    enrichment.isp = ipapi.isp;
    enrichment.org = ipapi.org;
    enrichment.asn = ipapi.as;
    enrichment.isProxy = ipapi.proxy === true;
    enrichment.isHosting = ipapi.hosting === true;
    enrichment.timezone = ipapi.timezone;
    enrichment.lat = ipapi.lat;
    enrichment.lon = ipapi.lon;
  }

  const proxycheck = results.find(r => r.source === "proxycheck")?.data as any;
  if (proxycheck) {
    const ipData = Object.values(proxycheck).find((v: any) => typeof v === "object" && v !== null && "proxy" in v) as any;
    if (ipData) {
      if (ipData.proxy === "yes") enrichment.isProxy = true;
      if (ipData.type === "VPN" && !enrichment.isVPN) {
        enrichment.isVPN = true;
        if (!enrichment.vpnService) enrichment.vpnService = ipData.provider || "Unknown VPN";
      }
      if (ipData.type === "TOR" && enrichment.isTor === undefined) enrichment.isTor = true;
      if (!enrichment.country && ipData.country) enrichment.country = ipData.country;
      if (!enrichment.isp && ipData.isp) enrichment.isp = ipData.isp;
      if (!enrichment.asn && ipData.asn) enrichment.asn = ipData.asn;
    }
  }

  const ipqs = results.find(r => r.source === "ipqualityscore")?.data as any;
  if (ipqs && !ipqs.error) {
    if (ipqs.vpn === true && enrichment.isVPN === undefined) enrichment.isVPN = true;
    if (ipqs.tor === true && enrichment.isTor === undefined) enrichment.isTor = true;
    if (ipqs.proxy === true) enrichment.isProxy = true;
    if (ipqs.bot_status === true) enrichment.isBot = true;
    if (ipqs.ISP && !enrichment.isp) enrichment.isp = ipqs.ISP;
    if (ipqs.organization && !enrichment.org) enrichment.org = ipqs.organization;
    if (ipqs.country_code && !enrichment.countryCode) enrichment.countryCode = ipqs.country_code;
    if (ipqs.city && !enrichment.city) enrichment.city = ipqs.city;
    if (ipqs.region && !enrichment.region) enrichment.region = ipqs.region;
  }

  const abuseipdb = results.find(r => r.source === "abuseipdb")?.data as any;
  if (abuseipdb?.data) {
    if (abuseipdb.data.isTor === true && enrichment.isTor === undefined) enrichment.isTor = true;
    if (abuseipdb.data.countryCode && !enrichment.countryCode) enrichment.countryCode = abuseipdb.data.countryCode;
    if (abuseipdb.data.isp && !enrichment.isp) enrichment.isp = abuseipdb.data.isp;
    if (abuseipdb.data.usageType) {
      const ut = abuseipdb.data.usageType.toLowerCase();
      if ((ut.includes("vpn") || ut.includes("commercial")) && enrichment.isVPN === undefined) enrichment.isVPN = true;
      if (ut.includes("hosting") || ut.includes("data center")) enrichment.isHosting = true;
    }
  }

  const shodan = results.find(r => r.source === "shodan")?.data as any;
  if (shodan && !shodan.error) {
    if (shodan.country_name && !enrichment.country) enrichment.country = shodan.country_name;
    if (shodan.country_code && !enrichment.countryCode) enrichment.countryCode = shodan.country_code;
    if (shodan.city && !enrichment.city) enrichment.city = shodan.city;
    if (shodan.org && !enrichment.org) enrichment.org = shodan.org;
    if (shodan.isp && !enrichment.isp) enrichment.isp = shodan.isp;
    if (shodan.asn && !enrichment.asn) enrichment.asn = shodan.asn;
  }

  const alienvault = results.find(r => r.source === "alienvault")?.data as any;
  if (alienvault && !alienvault.error) {
    if (alienvault.country_name && !enrichment.country) enrichment.country = alienvault.country_name;
    if (alienvault.country_code && !enrichment.countryCode) enrichment.countryCode = alienvault.country_code;
    if (alienvault.city && !enrichment.city) enrichment.city = alienvault.city;
    if (alienvault.asn && !enrichment.asn) enrichment.asn = `AS${alienvault.asn}`;
  }

  const teoh = results.find(r => r.source === "teoh")?.data as any;
  if (teoh && !teoh.error) {
    if ((teoh.vpn_or_proxy === "yes" || teoh.is_vpn === true) && enrichment.isVPN === undefined) enrichment.isVPN = true;
    if (teoh.is_tor === true && enrichment.isTor === undefined) enrichment.isTor = true;
    if (teoh.is_datacenter === true || teoh.hosting === true) enrichment.isHosting = true;
    if (teoh.vpn_name && !enrichment.vpnService) enrichment.vpnService = teoh.vpn_name;
  }

  const greynoise = results.find(r => r.source === "greynoise")?.data as any;
  if (greynoise && !greynoise.error) {
    if (greynoise.noise === true) {
      enrichment.isMassScanner = true;
      enrichment.isKnownScanner = true;
    }
    if (greynoise.riot === true) {
      enrichment.isKnownScanner = true;
      enrichment.scannerType = "benign";
    }
    if (greynoise.classification) {
      enrichment.scannerType = greynoise.classification;
    }
    if (greynoise.name && !enrichment.org) {
      enrichment.org = greynoise.name;
    }
  }

  const spamhaus = results.find(r => r.source === "spamhaus")?.data as any;
  if (spamhaus && !spamhaus.error) {
    if (spamhaus.listedIn && spamhaus.listedIn.length > 0) {
      enrichment.spamhausListed = true;
      enrichment.spamhausLists = spamhaus.listedIn;
    }
  }

  const iphub = results.find(r => r.source === "iphub")?.data as any;
  if (iphub && !iphub.error) {
    if (iphub.block === 1) {
      enrichment.isProxy = true;
      enrichment.isHosting = true;
    } else if (iphub.block === 2) {
      enrichment.isProxy = true;
    }
    if (iphub.country_code && !enrichment.countryCode) enrichment.countryCode = iphub.country_code;
    if (iphub.country_name && !enrichment.country) enrichment.country = iphub.country_name;
    if (iphub.isp && !enrichment.isp) enrichment.isp = iphub.isp;
    if (iphub.asn && !enrichment.asn) enrichment.asn = `AS${iphub.asn}`;
  }

  const teamcymru = results.find(r => r.source === "teamcymru")?.data as any;
  if (teamcymru && teamcymru.found && !teamcymru.error) {
    if (teamcymru.asn && !enrichment.asn) enrichment.asn = `AS${teamcymru.asn}`;
    if (teamcymru.country_code && !enrichment.countryCode) enrichment.countryCode = teamcymru.country_code;
  }

  const vpnapi = results.find(r => r.source === "vpnapi")?.data as any;
  if (vpnapi && !vpnapi.error) {
    if (vpnapi.is_vpn === true && enrichment.isVPN === undefined) enrichment.isVPN = true;
    if (vpnapi.is_proxy === true) enrichment.isProxy = true;
    if (vpnapi.is_tor === true && enrichment.isTor === undefined) enrichment.isTor = true;
    if (vpnapi.country && !enrichment.country) enrichment.country = vpnapi.country;
    if (vpnapi.country_code && !enrichment.countryCode) enrichment.countryCode = vpnapi.country_code;
    if (vpnapi.city && !enrichment.city) enrichment.city = vpnapi.city;
    if (vpnapi.isp && !enrichment.isp) enrichment.isp = vpnapi.isp;
    if (vpnapi.asn && !enrichment.asn) enrichment.asn = vpnapi.asn;
  }

  return enrichment;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ctx = await verifyAndGetTier(req);
    const url = new URL(req.url);
    const path = url.pathname.replace("/threat-intel", "");

    const apiKeys = await getApiKeysForTier(ctx);
    const allowedSources = getSourcesForTier(ctx.tier, apiKeys);
    const canPersist = ctx.tier !== "anon";

    if (path === "/ip" || path === "/ip/") {
      const body = await req.json();
      const ip = body.ip;
      if (!ip) {
        return new Response(JSON.stringify({ error: "IP address required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sourcePromises: Promise<ThreatResult>[] = [];

      sourcePromises.push(checkTorExitList(ip));

      if (allowedSources.includes("ipapi")) sourcePromises.push(checkIPAPI(ctx, ip));
      if (allowedSources.includes("ip2proxy")) sourcePromises.push(checkIP2Proxy(ctx, ip, apiKeys.ip2proxy ?? ""));
      if (allowedSources.includes("proxycheck")) sourcePromises.push(checkProxyCheck(ctx, ip, apiKeys.proxycheck ?? ""));
      if (allowedSources.includes("virustotal")) sourcePromises.push(checkVirusTotal(ctx, ip, apiKeys.virustotal ?? ""));
      if (allowedSources.includes("abuseipdb")) sourcePromises.push(checkAbuseIPDB(ctx, ip, apiKeys.abuseipdb ?? ""));
      if (allowedSources.includes("alienvault")) sourcePromises.push(checkAlienVaultOTX(ctx, ip, apiKeys.alienvault ?? ""));
      if (allowedSources.includes("shodan")) sourcePromises.push(checkShodan(ctx, ip, apiKeys.shodan ?? ""));
      if (allowedSources.includes("ipqualityscore")) sourcePromises.push(checkIPQualityScore(ctx, ip, apiKeys.ipqualityscore ?? ""));
      if (allowedSources.includes("threatfox")) sourcePromises.push(checkThreatFox(ctx, ip));
      if (allowedSources.includes("urlhaus")) sourcePromises.push(checkURLhaus(ctx, ip));
      if (allowedSources.includes("rdap")) sourcePromises.push(checkRDAP(ctx, ip));
      if (allowedSources.includes("teoh")) sourcePromises.push(checkTeohVPN(ctx, ip));
      if (allowedSources.includes("greynoise")) sourcePromises.push(checkGreyNoise(ctx, ip, apiKeys.greynoise ?? ""));
      if (allowedSources.includes("spamhaus")) sourcePromises.push(checkSpamhaus(ctx, ip));
      if (allowedSources.includes("blocklistde")) sourcePromises.push(checkBlocklistDE(ctx, ip));
      if (allowedSources.includes("iphub")) sourcePromises.push(checkIPHub(ctx, ip, apiKeys.iphub ?? ""));
      if (allowedSources.includes("teamcymru")) sourcePromises.push(checkTeamCymru(ctx, ip));
      if (allowedSources.includes("vpnapi")) sourcePromises.push(checkVPNAPI(ctx, ip, apiKeys.vpnapi ?? ""));

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const ipapi = results.find(r => r.source === "ipapi")?.data as any;
      const asn = ipapi?.as;
      const org = ipapi?.org;
      const vpnCheck = await checkVPNProvider(asn, org);
      results.push(vpnCheck);

      const enrichment = extractEnrichment(results);
      const scores = results.filter(r => r.threatScore !== undefined).map(r => r.threatScore!);
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
      const hasMaliciousHit = results.some(r => r.isMalicious);

      let threatBoost = 0;
      if (enrichment.isTor) threatBoost += 20;
      if (enrichment.isVPN) threatBoost += 10;
      if (enrichment.isProxy) threatBoost += 15;
      if (enrichment.spamhausListed) threatBoost += 25;
      if (enrichment.isMassScanner && enrichment.scannerType === "malicious") threatBoost += 30;

      const aggregated = {
        ip,
        enrichment,
        overallThreatScore: Math.min(Math.max(avgScore, hasMaliciousHit ? 50 : 0) + threatBoost, 100),
        maxThreatScore: maxScore,
        isMalicious: hasMaliciousHit || maxScore > 50,
        results: Object.fromEntries(results.map(r => [r.source, r])),
        checkedAt: new Date().toISOString(),
        tier: ctx.tier,
        sourcesAvailable: allowedSources,
      };

      if (canPersist) {
        await serviceClient.from("ip_lookups").insert({
          ip_address: ip,
          results: aggregated.results,
          threat_score: aggregated.overallThreatScore,
          sources_checked: results.map(r => r.source),
          user_id: ctx.userId,
          context: ctx.cacheContext,
        });

        await logAuditEvent(req, ctx, "ip_lookup", "ip", ip, { sources: results.map(r => r.source), threat_score: aggregated.overallThreatScore });
      }

      return new Response(JSON.stringify(aggregated), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/url" || path === "/url/") {
      const body = await req.json();
      const targetUrl = body.url;
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "URL required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sourcePromises: Promise<ThreatResult>[] = [];

      if (allowedSources.includes("virustotal")) sourcePromises.push(checkVirusTotalURL(ctx, targetUrl, apiKeys.virustotal ?? ""));
      if (allowedSources.includes("urlscan")) sourcePromises.push(checkURLScan(ctx, targetUrl, apiKeys.urlscan ?? ""));
      if (allowedSources.includes("urlhaus")) sourcePromises.push(checkURLhausURL(ctx, targetUrl));

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const isMalicious = results.some(r => r.isMalicious);
      const threatTypes: string[] = [];
      if (results.find(r => r.source === "urlhaus_url")?.isMalicious) threatTypes.push("malware");

      const aggregated = {
        url: targetUrl,
        isMalicious,
        threatTypes,
        results: Object.fromEntries(results.map(r => [r.source, r])),
        checkedAt: new Date().toISOString(),
        tier: ctx.tier,
        sourcesAvailable: allowedSources,
      };

      if (canPersist) {
        await serviceClient.from("url_lookups").insert({
          url: targetUrl,
          results: aggregated.results,
          is_malicious: isMalicious,
          threat_types: threatTypes,
          user_id: ctx.userId,
          context: ctx.cacheContext,
        });

        await logAuditEvent(req, ctx, "url_lookup", "url", targetUrl, { sources: results.map(r => r.source), is_malicious: isMalicious });
      }

      return new Response(JSON.stringify(aggregated), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/bulk" || path === "/bulk/") {
      const body = await req.json();
      const ips: string[] = body.ips;
      if (!ips || !Array.isArray(ips)) {
        return new Response(JSON.stringify({ error: "Array of IPs required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const limitedIps = ips.slice(0, 20);

      const bulkResults = await Promise.allSettled(limitedIps.map(async (ip) => {
        const sourcePromises: Promise<ThreatResult>[] = [];

        if (allowedSources.includes("ipapi")) sourcePromises.push(checkIPAPI(ctx, ip));
        if (allowedSources.includes("abuseipdb")) sourcePromises.push(checkAbuseIPDB(ctx, ip, apiKeys.abuseipdb ?? ""));
        if (allowedSources.includes("threatfox")) sourcePromises.push(checkThreatFox(ctx, ip));
        if (allowedSources.includes("urlhaus")) sourcePromises.push(checkURLhaus(ctx, ip));
        if (allowedSources.includes("greynoise")) sourcePromises.push(checkGreyNoise(ctx, ip, apiKeys.greynoise ?? ""));
        if (allowedSources.includes("spamhaus")) sourcePromises.push(checkSpamhaus(ctx, ip));
        if (allowedSources.includes("blocklistde")) sourcePromises.push(checkBlocklistDE(ctx, ip));

        const settledResults = await Promise.allSettled(sourcePromises);
        const ipResults: ThreatResult[] = settledResults
          .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
          .map(r => r.value);

        const ipapi = ipResults.find(r => r.source === "ipapi")?.data as any;
        const greynoise = ipResults.find(r => r.source === "greynoise")?.data as any;
        const spamhaus = ipResults.find(r => r.source === "spamhaus")?.data as any;
        const blocklistde = ipResults.find(r => r.source === "blocklistde")?.data as any;
        const scores = ipResults.filter(r => r.threatScore !== undefined).map(r => r.threatScore!);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const hasMaliciousHit = ipResults.some(r => r.isMalicious);

        return {
          ip,
          threatScore: Math.max(avgScore, hasMaliciousHit ? 50 : 0),
          isMalicious: hasMaliciousHit || avgScore > 50,
          country: ipapi?.country ?? null,
          countryCode: ipapi?.countryCode ?? null,
          city: ipapi?.city ?? null,
          isp: ipapi?.isp ?? null,
          isProxy: ipapi?.proxy === true,
          isHosting: ipapi?.hosting === true,
          abuseConfidence: (ipResults.find(r => r.source === "abuseipdb")?.data as any)?.data?.abuseConfidenceScore ?? null,
          inThreatFox: ipResults.find(r => r.source === "threatfox")?.isMalicious ?? false,
          inURLhaus: ipResults.find(r => r.source === "urlhaus")?.isMalicious ?? false,
          isMassScanner: greynoise?.noise === true,
          greynoiseClassification: greynoise?.classification ?? null,
          spamhausListed: (spamhaus?.listedIn?.length ?? 0) > 0,
          spamhausLists: spamhaus?.listedIn ?? [],
          blocklistdeListed: (blocklistde?.listedIn?.length ?? 0) > 0,
          blocklistdeLists: blocklistde?.listedIn ?? []
        };
      }));

      const results = bulkResults
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map(r => r.value);

      if (canPersist) {
        await logAuditEvent(req, ctx, "bulk_lookup", "ip_batch", `${results.length}_ips`, { count: results.length, tier: ctx.tier });
      }

      return new Response(JSON.stringify({ results, total: results.length, tier: ctx.tier }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/config" || path === "/config/") {
      const orgKeys = await getOrgApiKeys();
      const configResponse = {
        configured: {
          virustotal: ctx.tier === "dsbn" ? !!orgKeys.virustotal : !!apiKeys.virustotal,
          abuseipdb: ctx.tier === "dsbn" ? !!orgKeys.abuseipdb : !!apiKeys.abuseipdb,
          alienvault: ctx.tier === "dsbn" ? !!orgKeys.alienvault : !!apiKeys.alienvault,
          shodan: ctx.tier === "dsbn" ? !!orgKeys.shodan : !!apiKeys.shodan,
          ipqualityscore: ctx.tier === "dsbn" ? !!orgKeys.ipqualityscore : !!apiKeys.ipqualityscore,
          urlscan: ctx.tier === "dsbn" ? !!orgKeys.urlscan : !!apiKeys.urlscan,
          proxycheck: ctx.tier === "dsbn" ? !!orgKeys.proxycheck : !!apiKeys.proxycheck,
          greynoise: ctx.tier === "dsbn" ? !!orgKeys.greynoise : !!apiKeys.greynoise,
          ip2proxy: ctx.tier === "dsbn" ? !!orgKeys.ip2proxy : !!apiKeys.ip2proxy,
          iphub: ctx.tier === "dsbn" ? !!orgKeys.iphub : !!apiKeys.iphub,
          vpnapi: ctx.tier === "dsbn" ? !!orgKeys.vpnapi : !!apiKeys.vpnapi,
          ipapi: true,
          threatfox: true,
          urlhaus: true,
          rdap: true,
          teoh: true,
          spamhaus: true,
          teamcymru: true,
          blocklistde: true,
        },
        tier: ctx.tier,
        sourcesAvailable: allowedSources,
        user: ctx.email ? { email: ctx.email } : null,
      };

      return new Response(JSON.stringify(configResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found", availableEndpoints: ["/ip", "/url", "/bulk", "/config"] }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});