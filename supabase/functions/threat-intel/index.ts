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
  "ipapi", "threatfox", "urlhaus", "rdap", "teoh", "spamhaus", "alienvault", "teamcymru", "blocklistde", "malwarebazaar"
];

const PAID_SOURCES = [
  "virustotal", "abuseipdb", "shodan", "ipqualityscore", "proxycheck", "greynoise", "urlscan", "ip2proxy", "iphub", "vpnapi", "hybrid_analysis"
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
    hybrid_analysis: Deno.env.get("HYBRID_ANALYSIS_API_KEY") ?? "",
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

async function decryptApiKey(encrypted: { iv: string; ciphertext: string; keyVersion: number }, service?: string): Promise<string> {
  const logPrefix = service ? `[decrypt:${service}]` : "[decrypt]";
  try {
    const iv = decodeB64(encrypted.iv);
    const ciphertext = decodeB64(encrypted.ciphertext);
    console.log(`${logPrefix} Attempting decryption, iv length: ${iv.length}, ciphertext length: ${ciphertext.length}`);

    if (SUPABASE_SERVICE_ROLE_KEY) {
      try {
        console.log(`${logPrefix} Trying PBKDF2 decryption...`);
        const legacyKey = await deriveEncryptionKeyLegacy();
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, legacyKey, ciphertext);
        console.log(`${logPrefix} PBKDF2 decryption succeeded`);
        return new TextDecoder().decode(decrypted);
      } catch (e) {
        console.log(`${logPrefix} PBKDF2 decryption failed: ${e}`);
      }
    } else {
      console.log(`${logPrefix} SUPABASE_SERVICE_ROLE_KEY not available`);
    }

    if (API_KEY_ENCRYPTION_KEY) {
      try {
        console.log(`${logPrefix} Trying dedicated encryption key...`);
        const key = await getEncryptionKey();
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
        console.log(`${logPrefix} Dedicated key decryption succeeded`);
        return new TextDecoder().decode(decrypted);
      } catch (e) {
        console.log(`${logPrefix} Dedicated key decryption failed: ${e}`);
      }
    } else {
      console.log(`${logPrefix} API_KEY_ENCRYPTION_KEY not available`);
    }
  } catch (e) {
    console.log(`${logPrefix} Decryption setup error: ${e}`);
  }

  console.log(`${logPrefix} All decryption attempts failed, returning empty string`);
  return "";
}

interface ApiKeyDebugInfo {
  keys: Record<string, string>;
  debug: {
    rowsFound: number;
    servicesFound: string[];
    decryptionResults: Record<string, string>;
    errors: string[];
  };
}

async function getUserApiKeysWithDebug(userId: string): Promise<ApiKeyDebugInfo> {
  const debug: ApiKeyDebugInfo["debug"] = {
    rowsFound: 0,
    servicesFound: [],
    decryptionResults: {},
    errors: []
  };
  const keys: Record<string, string> = {};

  try {
    console.log(`[getUserApiKeys] Fetching keys for user: ${userId}`);
    const { data, error } = await serviceClient
      .from("user_api_keys")
      .select("service, encrypted_key, api_key")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      console.log(`[getUserApiKeys] Database error: ${error.message}`);
      debug.errors.push(`DB error: ${error.message}`);
      return { keys, debug };
    }

    if (!data || data.length === 0) {
      console.log(`[getUserApiKeys] No API keys found for user`);
      debug.errors.push("No API keys found in database");
      return { keys, debug };
    }

    debug.rowsFound = data.length;
    debug.servicesFound = data.map(r => r.service);
    console.log(`[getUserApiKeys] Found ${data.length} API keys: ${debug.servicesFound.join(", ")}`);

    for (const row of data) {
      try {
        if (row.encrypted_key) {
          console.log(`[getUserApiKeys] Processing ${row.service} with encrypted_key`);
          const hasValidStructure = row.encrypted_key &&
            typeof row.encrypted_key === "object" &&
            "iv" in row.encrypted_key &&
            "ciphertext" in row.encrypted_key;

          if (!hasValidStructure) {
            console.log(`[getUserApiKeys] ${row.service}: Invalid encrypted_key structure`);
            debug.decryptionResults[row.service] = "invalid_structure";
            continue;
          }

          const decrypted = await decryptApiKey(row.encrypted_key, row.service);
          if (decrypted) {
            keys[row.service] = decrypted;
            debug.decryptionResults[row.service] = "success";
            console.log(`[getUserApiKeys] ${row.service}: Decryption successful`);
            continue;
          } else {
            debug.decryptionResults[row.service] = "decryption_failed";
            console.log(`[getUserApiKeys] ${row.service}: Decryption returned empty`);
          }
        }
        if (row.api_key) {
          console.log(`[getUserApiKeys] ${row.service}: Using plaintext api_key fallback`);
          keys[row.service] = row.api_key;
          debug.decryptionResults[row.service] = "plaintext_fallback";
        } else {
          debug.decryptionResults[row.service] = "no_key_available";
        }
      } catch (e) {
        console.log(`[getUserApiKeys] ${row.service}: Exception - ${e}`);
        debug.decryptionResults[row.service] = `error: ${e}`;
        debug.errors.push(`${row.service}: ${e}`);
      }
    }

    console.log(`[getUserApiKeys] Successfully retrieved ${Object.keys(keys).length} keys: ${Object.keys(keys).join(", ")}`);
    return { keys, debug };
  } catch (e) {
    console.log(`[getUserApiKeys] Top-level error: ${e}`);
    debug.errors.push(`Top-level error: ${e}`);
    return { keys, debug };
  }
}

async function getUserApiKeys(userId: string): Promise<Record<string, string>> {
  const result = await getUserApiKeysWithDebug(userId);
  return result.keys;
}

interface ApiKeysResult {
  keys: Record<string, string>;
  debug?: ApiKeyDebugInfo["debug"];
}

async function getApiKeysForTierWithDebug(ctx: TierContext): Promise<ApiKeysResult> {
  if (ctx.tier === "anon") {
    return { keys: {}, debug: { rowsFound: 0, servicesFound: [], decryptionResults: {}, errors: ["Anonymous user - no API keys"] } };
  }

  if (ctx.tier === "dsbn") {
    const orgKeys = await getOrgApiKeys();
    const mergedKeys: Record<string, string> = {};
    const debug: ApiKeyDebugInfo["debug"] = {
      rowsFound: 0,
      servicesFound: [],
      decryptionResults: {},
      errors: []
    };

    for (const [service, key] of Object.entries(orgKeys)) {
      if (key) {
        mergedKeys[service] = key;
        debug.decryptionResults[service] = "org_env_var";
      }
    }

    if (ctx.userId) {
      const userResult = await getUserApiKeysWithDebug(ctx.userId);
      debug.rowsFound = userResult.debug.rowsFound;
      debug.servicesFound = userResult.debug.servicesFound;

      for (const [service, key] of Object.entries(userResult.keys)) {
        if (!mergedKeys[service] && key) {
          mergedKeys[service] = key;
          debug.decryptionResults[service] = userResult.debug.decryptionResults[service] || "user_key";
        }
      }

      if (userResult.debug.errors.length > 0) {
        debug.errors.push(...userResult.debug.errors);
      }
    }

    return { keys: mergedKeys, debug };
  }

  if (ctx.tier === "external" && ctx.userId) {
    const result = await getUserApiKeysWithDebug(ctx.userId);
    return { keys: result.keys, debug: result.debug };
  }

  return { keys: {}, debug: { rowsFound: 0, servicesFound: [], decryptionResults: {}, errors: ["Unknown tier or missing userId"] } };
}

async function getApiKeysForTier(ctx: TierContext): Promise<Record<string, string>> {
  const result = await getApiKeysForTierWithDebug(ctx);
  return result.keys;
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
    const qs = new URLSearchParams();

    if (apiKey) qs.set("key", apiKey);

    qs.set("short", "1");

    const url = `https://proxycheck.io/v3/${encodeURIComponent(ip)}?${qs.toString()}`;

    const response = await fetchWithTimeout(url);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { source: "proxycheck", data, error: `HTTP ${response.status}` };
    }

    await setCachedResponse(ctx, "proxycheck", ip, data);
    return { source: "proxycheck", data };
  } catch (e) {
    return { source: "proxycheck", data: {}, error: String(e) };
  }
}


async function checkVirusTotal(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "virustotal", data: {}, error: "API key not configured" };

  const cacheKey = `ip:${ip}`;
  const cached = await getCachedResponse(ctx, "virustotal", cacheKey);
  if (cached) return { source: "virustotal", data: cached, threatScore: calculateVTScore(cached) };

  try {
    const response = await fetchWithTimeout(
      `https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`,
      { headers: { "x-apikey": apiKey } }
    );

    const text = await response.text().catch(() => "");
    const data = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : {};

    if (!response.ok) {
      return { source: "virustotal", data, error: `HTTP ${response.status}` };
    }

    await setCachedResponse(ctx, "virustotal", cacheKey, data);
    return { source: "virustotal", data, threatScore: calculateVTScore(data) };
  } catch (e) {
    return { source: "virustotal", data: {}, error: String(e) };
  }
}

function calculateVTScore(data: Record<string, unknown>): number {
  const stats = (data as any)?.data?.attributes?.last_analysis_stats;
  if (!stats) return 0;

  const malicious = Number(stats.malicious ?? 0);
  const suspicious = Number(stats.suspicious ?? 0);
  const harmless = Number(stats.harmless ?? 0);
  const undetected = Number(stats.undetected ?? 0);
  const timeout = Number(stats.timeout ?? 0);

  const total = malicious + suspicious + harmless + undetected + timeout;
  if (total <= 0) return 0;

  const score = ((malicious * 100) + (suspicious * 50)) / total;

  return Math.round(score * 100) / 100;
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
            asn: asnNumber,
            match_type: "asn"
          }
        };
      }
    }

    if (org) {
      const normalizedOrg = org.toLowerCase();
      const { data: orgMatches, error } = await serviceClient
        .from("vpn_providers")
        .select("provider_name, confidence, asn, org_pattern")
        .not("org_pattern", "is", null);

      if (error) throw error;

      if (orgMatches && orgMatches.length > 0) {
        for (const match of orgMatches) {
          if (match.org_pattern && normalizedOrg.includes(match.org_pattern.toLowerCase())) {
            return {
              source: "vpn_provider",
              data: {
                provider: match.provider_name,
                confidence: match.confidence,
                asn: match.asn,
                match_type: "org_pattern",
                matched_pattern: match.org_pattern
              }
            };
          }
        }
      }
    }

    return { source: "vpn_provider", data: { provider: null, confidence: null } };
  } catch (e) {
    return { source: "vpn_provider", data: { provider: null, confidence: null }, error: String(e) };
  }
}

async function checkGreyNoise(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "greynoise", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "greynoise", ip);
  if (cached) return { source: "greynoise", data: cached };
  try {
    const response = await fetchWithTimeout(`https://api.greynoise.io/v3/community/${ip}`, {
      headers: { "key": apiKey }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "greynoise", ip, data);
    return { source: "greynoise", data };
  } catch (e) {
    return { source: "greynoise", data: {}, error: String(e) };
  }
}

async function checkSpamhaus(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "spamhaus", ip);
  if (cached) return { source: "spamhaus", data: cached };
  try {
    const reversed = ip.split(".").reverse().join(".");
    const zones = [
      { zone: "zen.spamhaus.org", list: "ZEN (combined)" },
      { zone: "sbl.spamhaus.org", list: "SBL" },
      { zone: "xbl.spamhaus.org", list: "XBL" },
      { zone: "pbl.spamhaus.org", list: "PBL" },
    ];

    const checks = await Promise.allSettled(
      zones.map(async ({ zone, list }) => {
        const response = await fetchWithTimeout(
          `https://cloudflare-dns.com/dns-query?name=${reversed}.${zone}&type=A`,
          { headers: { "Accept": "application/dns-json" } }
        );
        const data = await response.json();
        const isListed = data?.Answer && data.Answer.length > 0;
        return { list, isListed };
      })
    );

    const results = checks
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map(r => r.value);

    const listedIn = results.filter(r => r.isListed).map(r => r.list);
    const isListed = listedIn.length > 0;

    const data = { ip, isListed, listedIn };
    await setCachedResponse(ctx, "spamhaus", ip, data);
    return { source: "spamhaus", data };
  } catch (e) {
    return { source: "spamhaus", data: {}, error: String(e) };
  }
}

async function checkBlocklistDE(ctx: TierContext, ip: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "blocklistde", ip);
  if (cached) return { source: "blocklistde", data: cached };
  try {
    const lists = [
      "all", "ssh", "mail", "apache", "imap", "ftp", "sip", "bots", "strongips", "bruteforcelogin"
    ];

    const response = await fetchWithTimeout(`https://api.blocklist.de/api.php?ip=${ip}&start=1`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();

    const data = {
      ip,
      isListed: text.includes("attacks") && !text.includes("not found"),
      rawResponse: text,
      listedIn: text.includes("attacks") ? ["blocklist.de"] : []
    };

    await setCachedResponse(ctx, "blocklistde", ip, data);
    return { source: "blocklistde", data };
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
        asn: data.network?.autonomous_system_number,
        source: "VPN API"
      }
    };
  } catch (e) {
    return { source: "vpnapi", data: {}, error: String(e) };
  }
}

async function checkVirusTotalHash(ctx: TierContext, hash: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "virustotal_hash", data: {}, error: "API key not configured" };

  const cached = await getCachedResponse(ctx, "virustotal_hash", hash);
  if (cached) return { source: "virustotal_hash", data: cached, threatScore: calculateVTHashScore(cached) };

  try {
    const response = await fetchWithTimeout(
      `https://www.virustotal.com/api/v3/files/${hash}`,
      { headers: { "x-apikey": apiKey } }
    );

    const text = await response.text().catch(() => "");
    const data = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : {};

    if (!response.ok) {
      return { source: "virustotal_hash", data, error: `HTTP ${response.status}` };
    }

    await setCachedResponse(ctx, "virustotal_hash", hash, data);
    const score = calculateVTHashScore(data);
    return {
      source: "virustotal_hash",
      data,
      threatScore: score,
      isMalicious: score > 50
    };
  } catch (e) {
    return { source: "virustotal_hash", data: {}, error: String(e) };
  }
}

function calculateVTHashScore(data: Record<string, unknown>): number {
  const stats = (data as any)?.data?.attributes?.last_analysis_stats;
  if (!stats) return 0;

  const malicious = Number(stats.malicious ?? 0);
  const suspicious = Number(stats.suspicious ?? 0);
  const harmless = Number(stats.harmless ?? 0);
  const undetected = Number(stats.undetected ?? 0);

  const total = malicious + suspicious + harmless + undetected;
  if (total <= 0) return 0;

  const score = ((malicious * 100) + (suspicious * 50)) / total;

  return Math.round(score * 100) / 100;
}

async function checkMalwareBazaarHash(ctx: TierContext, hash: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "malwarebazaar", hash);
  if (cached) return { source: "malwarebazaar", data: cached, isMalicious: (cached as any)?.query_status === "ok" };

  try {
    const formData = new FormData();
    formData.append("query", "get_info");
    formData.append("hash", hash);

    const response = await fetchWithTimeout("https://mb-api.abuse.ch/api/v1/", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "malwarebazaar", hash, data);

    return {
      source: "malwarebazaar",
      data,
      isMalicious: data?.query_status === "ok",
      threatScore: data?.query_status === "ok" ? 100 : 0
    };
  } catch (e) {
    return { source: "malwarebazaar", data: {}, error: String(e) };
  }
}

async function checkHybridAnalysisHash(ctx: TierContext, hash: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "hybrid_analysis", data: {}, error: "API key not configured" };

  const cached = await getCachedResponse(ctx, "hybrid_analysis", hash);
  if (cached) return { source: "hybrid_analysis", data: cached, threatScore: calculateHAScore(cached) };

  try {
    const response = await fetchWithTimeout(
      `https://www.hybrid-analysis.com/api/v2/search/hash`,
      {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Falcon Sandbox"
        },
        body: `hash=${hash}`
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "hybrid_analysis", hash, data);

    const score = calculateHAScore(data);
    return {
      source: "hybrid_analysis",
      data,
      threatScore: score,
      isMalicious: score > 50
    };
  } catch (e) {
    return { source: "hybrid_analysis", data: {}, error: String(e) };
  }
}

function calculateHAScore(data: Record<string, unknown>): number {
  if (Array.isArray(data) && data.length > 0) {
    const threatScore = data[0]?.threat_score;
    if (typeof threatScore === "number") {
      return threatScore;
    }
  }
  return 0;
}

async function checkAlienVaultHash(ctx: TierContext, hash: string, apiKey: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "alienvault_hash", hash);
  if (cached) return { source: "alienvault_hash", data: cached, threatScore: calculateOTXHashScore(cached) };

  try {
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (apiKey) headers["X-OTX-API-KEY"] = apiKey;

    const response = await fetchWithTimeout(
      `https://otx.alienvault.com/api/v1/indicators/file/${hash}/general`,
      { headers }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "alienvault_hash", hash, data);

    const score = calculateOTXHashScore(data);
    return {
      source: "alienvault_hash",
      data,
      threatScore: score,
      isMalicious: score > 50
    };
  } catch (e) {
    return { source: "alienvault_hash", data: {}, error: String(e) };
  }
}

function calculateOTXHashScore(data: Record<string, unknown>): number {
  const pulseCount = (data as any)?.pulse_info?.count ?? 0;
  return Math.min(pulseCount * 10, 100);
}

async function checkVirusTotalURL(ctx: TierContext, url: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "virustotal_url", data: {}, error: "API key not configured" };

  const urlId = btoa(url).replace(/=/g, "");
  const cached = await getCachedResponse(ctx, "virustotal_url", urlId);
  if (cached) return { source: "virustotal_url", data: cached };

  try {
    const response = await fetchWithTimeout(
      `https://www.virustotal.com/api/v3/urls/${urlId}`,
      { headers: { "x-apikey": apiKey } }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "virustotal_url", urlId, data);

    return { source: "virustotal_url", data };
  } catch (e) {
    return { source: "virustotal_url", data: {}, error: String(e) };
  }
}

async function checkURLScan(ctx: TierContext, url: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "urlscan", data: {}, error: "API key not configured" };

  const cached = await getCachedResponse(ctx, "urlscan", url);
  if (cached) return { source: "urlscan", data: cached };

  try {
    const response = await fetchWithTimeout(
      "https://urlscan.io/api/v1/scan/",
      {
        method: "POST",
        headers: {
          "API-Key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url, visibility: "private" })
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "urlscan", url, data);

    return { source: "urlscan", data };
  } catch (e) {
    return { source: "urlscan", data: {}, error: String(e) };
  }
}

async function checkURLhausURL(ctx: TierContext, url: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "urlhaus_url", url);
  if (cached) return { source: "urlhaus_url", data: cached, isMalicious: (cached as any)?.query_status === "ok" };

  try {
    const formData = new FormData();
    formData.append("url", url);

    const response = await fetchWithTimeout("https://urlhaus-api.abuse.ch/v1/url/", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "urlhaus_url", url, data);

    return {
      source: "urlhaus_url",
      data,
      isMalicious: data?.query_status === "ok"
    };
  } catch (e) {
    return { source: "urlhaus_url", data: {}, error: String(e) };
  }
}

function extractEnrichment(results: ThreatResult[]): IPEnrichment {
  const enrichment: IPEnrichment = {};

  const ipapi = results.find(r => r.source === "ipapi")?.data as any;
  if (ipapi) {
    enrichment.country = ipapi.country;
    enrichment.countryCode = ipapi.countryCode;
    enrichment.city = ipapi.city;
    enrichment.region = ipapi.regionName;
    enrichment.isp = ipapi.isp;
    enrichment.org = ipapi.org;
    enrichment.asn = ipapi.as;
    enrichment.timezone = ipapi.timezone;
    enrichment.lat = ipapi.lat;
    enrichment.lon = ipapi.lon;
    enrichment.isProxy = ipapi.proxy === true;
    enrichment.isHosting = ipapi.hosting === true;
  }

  const tor = results.find(r => r.source === "tor_exit_list")?.data as any;
  if (tor?.is_tor_exit) enrichment.isTor = true;

  const ip2proxy = results.find(r => r.source === "ip2proxy")?.data as any;
  if (ip2proxy) {
    if (ip2proxy.is_proxy) enrichment.isProxy = true;
    if (ip2proxy.provider) enrichment.vpnService = ip2proxy.provider;
    if (ip2proxy.usage_type?.toLowerCase().includes("dch")) enrichment.isHosting = true;
    if (!enrichment.country && ip2proxy.country_name) enrichment.country = ip2proxy.country_name;
    if (!enrichment.countryCode && ip2proxy.country_code) enrichment.countryCode = ip2proxy.country_code;
    if (!enrichment.isp && ip2proxy.isp) enrichment.isp = ip2proxy.isp;
    if (!enrichment.asn && ip2proxy.asn) enrichment.asn = ip2proxy.asn;
  }

  const teoh = results.find(r => r.source === "teoh")?.data as any;
  if (teoh) {
    if (teoh["is_vpn?"]) enrichment.isVPN = true;
    if (teoh["is_proxy?"]) enrichment.isProxy = true;
  }

  const vpnProvider = results.find(r => r.source === "vpn_provider")?.data as any;
  if (vpnProvider?.provider) {
    enrichment.isVPN = true;
    enrichment.vpnService = vpnProvider.provider;
  }

  const proxycheck = results.find(r => r.source === "proxycheck")?.data as any;
  if (proxycheck) {
    const ipData = proxycheck[Object.keys(proxycheck).find(k => k !== "status" && k !== "node") ?? ""];
    if (ipData) {
      if (ipData.proxy === "yes") enrichment.isProxy = true;
      if (ipData.type === "VPN") enrichment.isVPN = true;
    }
  }

  const greynoise = results.find(r => r.source === "greynoise")?.data as any;
  if (greynoise) {
    if (greynoise.classification === "malicious") {
      enrichment.isMassScanner = true;
      enrichment.scannerType = "malicious";
    } else if (greynoise.classification === "benign") {
      enrichment.isKnownScanner = true;
      enrichment.scannerType = "benign";
    }
    if (greynoise.bot) enrichment.isBot = true;
  }

  const spamhaus = results.find(r => r.source === "spamhaus")?.data as any;
  if (spamhaus?.isListed) {
    enrichment.spamhausListed = true;
    enrichment.spamhausLists = spamhaus.listedIn;
  }

  const iphub = results.find(r => r.source === "iphub")?.data as any;
  if (iphub) {
    if (iphub.block === 1) enrichment.isProxy = true;
    if (iphub.block === 2) enrichment.isHosting = true;
    if (!enrichment.country && iphub.country_name) enrichment.country = iphub.country_name;
    if (!enrichment.countryCode && iphub.country_code) enrichment.countryCode = iphub.country_code;
    if (!enrichment.isp && iphub.isp) enrichment.isp = iphub.isp;
    if (!enrichment.asn && iphub.asn) enrichment.asn = iphub.asn.toString();
  }

  const vpnapi = results.find(r => r.source === "vpnapi")?.data as any;
  if (vpnapi) {
    if (vpnapi.is_vpn) enrichment.isVPN = true;
    if (vpnapi.is_proxy) enrichment.isProxy = true;
    if (vpnapi.is_tor) enrichment.isTor = true;
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

      const normalizedSources: Record<string, any> = {};
      for (const r of results) {
        normalizedSources[r.source] = r.data;
      }

      const detectionSources: string[] = [];
      if (enrichment.isTor) detectionSources.push("Tor Exit List");
      if (enrichment.isVPN && enrichment.vpnService) detectionSources.push("IP2Proxy + VPN DB");
      if (enrichment.isProxy) detectionSources.push("IP2Proxy + ProxyCheck");

      const aggregated = {
        ip,
        enrichment,
        overallThreatScore: Math.min(Math.max(avgScore, hasMaliciousHit ? 50 : 0) + threatBoost, 100),
        maxThreatScore: maxScore,
        isMalicious: hasMaliciousHit || maxScore > 50,
        sources: normalizedSources,
        detectionSources,
        detectionConfidence: enrichment.isTor ? "high" : enrichment.isVPN ? "high" : enrichment.isProxy ? "medium" : "low",
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

        sourcePromises.push(checkTorExitList(ip));
        if (allowedSources.includes("ipapi")) sourcePromises.push(checkIPAPI(ctx, ip));
        if (allowedSources.includes("ip2proxy")) sourcePromises.push(checkIP2Proxy(ctx, ip, apiKeys.ip2proxy ?? ""));
        if (allowedSources.includes("teoh")) sourcePromises.push(checkTeohVPN(ctx, ip));
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
        const asn = ipapi?.as;
        const org = ipapi?.org;
        const vpnCheck = await checkVPNProvider(asn, org);
        ipResults.push(vpnCheck);

        const enrichment = extractEnrichment(ipResults);

        const greynoise = ipResults.find(r => r.source === "greynoise")?.data as any;
        const spamhaus = ipResults.find(r => r.source === "spamhaus")?.data as any;
        const blocklistde = ipResults.find(r => r.source === "blocklistde")?.data as any;
        const scores = ipResults.filter(r => r.threatScore !== undefined).map(r => r.threatScore!);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const hasMaliciousHit = ipResults.some(r => r.isMalicious);

        let threatBoost = 0;
        if (enrichment.isTor) threatBoost += 20;
        if (enrichment.isVPN) threatBoost += 10;
        if (enrichment.isProxy) threatBoost += 15;
        if (enrichment.spamhausListed) threatBoost += 25;
        if (enrichment.isMassScanner && enrichment.scannerType === "malicious") threatBoost += 30;

        return {
          ip,
          threatScore: Math.min(Math.max(avgScore, hasMaliciousHit ? 50 : 0) + threatBoost, 100),
          isMalicious: hasMaliciousHit || avgScore > 50,
          enrichment,
          country: enrichment.country ?? null,
          countryCode: enrichment.countryCode ?? null,
          city: enrichment.city ?? null,
          isp: enrichment.isp ?? null,
          org: enrichment.org ?? null,
          isTor: enrichment.isTor ?? false,
          isVPN: enrichment.isVPN ?? false,
          isProxy: enrichment.isProxy ?? false,
          isHosting: enrichment.isHosting ?? false,
          vpnService: enrichment.vpnService ?? null,
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
      const apiKeysResult = await getApiKeysForTierWithDebug(ctx);

      const configResponse = {
        configured: {
          virustotal: ctx.tier === "dsbn" ? !!orgKeys.virustotal : !!apiKeysResult.keys.virustotal,
          abuseipdb: ctx.tier === "dsbn" ? !!orgKeys.abuseipdb : !!apiKeysResult.keys.abuseipdb,
          alienvault: ctx.tier === "dsbn" ? !!orgKeys.alienvault : !!apiKeysResult.keys.alienvault,
          shodan: ctx.tier === "dsbn" ? !!orgKeys.shodan : !!apiKeysResult.keys.shodan,
          ipqualityscore: ctx.tier === "dsbn" ? !!orgKeys.ipqualityscore : !!apiKeysResult.keys.ipqualityscore,
          urlscan: ctx.tier === "dsbn" ? !!orgKeys.urlscan : !!apiKeysResult.keys.urlscan,
          proxycheck: ctx.tier === "dsbn" ? !!orgKeys.proxycheck : !!apiKeysResult.keys.proxycheck,
          greynoise: ctx.tier === "dsbn" ? !!orgKeys.greynoise : !!apiKeysResult.keys.greynoise,
          ip2proxy: ctx.tier === "dsbn" ? !!orgKeys.ip2proxy : !!apiKeysResult.keys.ip2proxy,
          iphub: ctx.tier === "dsbn" ? !!orgKeys.iphub : !!apiKeysResult.keys.iphub,
          vpnapi: ctx.tier === "dsbn" ? !!orgKeys.vpnapi : !!apiKeysResult.keys.vpnapi,
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
        userId: ctx.userId,
        debug: {
          apiKeyRetrieval: apiKeysResult.debug,
          encryptionKeyAvailable: !!API_KEY_ENCRYPTION_KEY,
          serviceRoleKeyAvailable: !!SUPABASE_SERVICE_ROLE_KEY,
          keysSuccessfullyDecrypted: Object.keys(apiKeysResult.keys),
        }
      };

      return new Response(JSON.stringify(configResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/hash" || path === "/hash/") {
      const body = await req.json();
      const hash = body.hash?.trim().toLowerCase();
      if (!hash) {
        return new Response(JSON.stringify({ error: "Hash required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const hashRegex = /^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/;
      if (!hashRegex.test(hash)) {
        return new Response(JSON.stringify({ error: "Invalid hash format. Must be MD5 (32), SHA1 (40), or SHA256 (64) hex characters." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sourcePromises: Promise<ThreatResult>[] = [];

      if (allowedSources.includes("malwarebazaar")) sourcePromises.push(checkMalwareBazaarHash(ctx, hash));
      if (allowedSources.includes("virustotal")) sourcePromises.push(checkVirusTotalHash(ctx, hash, apiKeys.virustotal ?? ""));
      if (allowedSources.includes("hybrid_analysis")) sourcePromises.push(checkHybridAnalysisHash(ctx, hash, apiKeys.hybrid_analysis ?? ""));
      if (allowedSources.includes("alienvault")) sourcePromises.push(checkAlienVaultHash(ctx, hash, apiKeys.alienvault ?? ""));

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const isMalicious = results.some(r => r.isMalicious);
      const scores = results.filter(r => r.threatScore !== undefined).map(r => r.threatScore!);
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

      const vtResult = results.find(r => r.source === "virustotal_hash")?.data as any;
      const vtStats = vtResult?.data?.attributes?.last_analysis_stats;
      const vtDetections = vtStats ? {
        malicious: Number(vtStats.malicious ?? 0),
        suspicious: Number(vtStats.suspicious ?? 0),
        harmless: Number(vtStats.harmless ?? 0),
        undetected: Number(vtStats.undetected ?? 0),
        total: Number(vtStats.malicious ?? 0) + Number(vtStats.suspicious ?? 0) + Number(vtStats.harmless ?? 0) + Number(vtStats.undetected ?? 0)
      } : null;

      const mbResult = results.find(r => r.source === "malwarebazaar")?.data as any;
      const mbInfo = mbResult?.query_status === "ok" ? {
        signature: mbResult?.data?.[0]?.signature,
        file_type: mbResult?.data?.[0]?.file_type,
        file_name: mbResult?.data?.[0]?.file_name,
        first_seen: mbResult?.data?.[0]?.first_seen,
        tags: mbResult?.data?.[0]?.tags
      } : null;

      const haResult = results.find(r => r.source === "hybrid_analysis")?.data as any;
      const haInfo = haResult?.[0] ? {
        verdict: haResult[0].verdict,
        threat_score: haResult[0].threat_score,
        av_detect: haResult[0].av_detect,
        vx_family: haResult[0].vx_family,
        submit_name: haResult[0].submit_name
      } : null;

      const normalizedSources: Record<string, any> = {};
      for (const r of results) {
        normalizedSources[r.source] = {
          found: !r.error && r.data && Object.keys(r.data).length > 0,
          malicious: r.isMalicious ?? false,
          details: r.data,
          error: r.error
        };
      }

      const aggregated = {
        hash,
        isMalicious,
        overallThreatScore: maxScore,
        maxThreatScore: maxScore,
        sources: normalizedSources,
        detections: {
          virustotal: vtDetections,
          malwarebazaar: mbInfo,
          hybrid_analysis: haInfo
        },
        checkedAt: new Date().toISOString(),
        tier: ctx.tier,
        sourcesAvailable: allowedSources,
      };

      if (canPersist) {
        await serviceClient.from("hash_lookups").insert({
          hash,
          results: aggregated,
          is_malicious: isMalicious,
          threat_score: aggregated.overallThreatScore,
          sources_checked: results.map(r => r.source),
          user_id: ctx.userId,
          context: ctx.cacheContext,
        });

        await logAuditEvent(req, ctx, "hash_lookup", "hash", hash, { sources: results.map(r => r.source), is_malicious: isMalicious, threat_score: aggregated.overallThreatScore });
      }

      return new Response(JSON.stringify(aggregated), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found", availableEndpoints: ["/ip", "/url", "/bulk", "/hash", "/config"] }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
