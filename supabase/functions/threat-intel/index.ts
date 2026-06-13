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
  "ipapi", "threatfox", "urlhaus", "rdap", "teoh", "spamhaus", "alienvault", "teamcymru", "blocklistde", "malwarebazaar",
  "phishtank", "openphish", "tranco",
  // Phase 1 — new IOC types
  "nvd", "cisa_kev", "epss",
  "blockchain_info", "ethplorer",
  "emailrep", "email_dns",
  // Phase 2 — passive DNS + cert transparency
  "circl_pdns", "mnemonic_pdns", "crtsh",
];

const PAID_SOURCES = [
  "virustotal", "abuseipdb", "shodan", "ipqualityscore", "proxycheck", "greynoise", "urlscan", "ip2proxy", "iphub", "vpnapi", "hybrid_analysis",
  "google_safebrowsing",
  // Phase 1 — paid sources for new IOC types
  "hibp", "misttrack",
  // Phase 2 — paid pDNS + scan sources
  "securitytrails", "censys",
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

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.tier === "org") {
    return { tier: "dsbn", userId, email, cacheContext: "org:shared" };
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
    google_safebrowsing: Deno.env.get("GOOGLE_SAFEBROWSING_API_KEY") ?? "",
    hibp: Deno.env.get("HIBP_API_KEY") ?? "",
    misttrack: Deno.env.get("MISTTRACK_API_KEY") ?? "",
    nvd: Deno.env.get("NVD_API_KEY") ?? "",
    securitytrails: Deno.env.get("SECURITYTRAILS_API_KEY") ?? "",
    censys: Deno.env.get("CENSYS_API_KEY") ?? "", // format: "app_id:api_secret"
    circl_pdns: Deno.env.get("CIRCL_PDNS_AUTH") ?? "", // optional, format: "user:pass" base64
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

// ===================== SCORING V2 (calibrated) =====================
// Calibrated re-scoring computed from each source's RAW data, fixing the
// known per-source bugs WITHOUT touching the legacy pipeline:
//   - VT: count-based curve instead of dividing by the full engine roster
//     (8 malicious engines used to score 800/75 ≈ 11/100)
//   - Spamhaus PBL: informational, not malicious (it's a residential policy
//     list); only SBL/XBL/CSS hits score
//   - Tranco: top-ranked domains now DISCOUNT the score (reputation signal)
//   - OTX pulses: capped low — researchers pulse clean infrastructure
//   - Tor/VPN/proxy: context notes with small boosts, not +10..+30 blind adds
// The legacy overallThreatScore is left untouched so Bulk Lookup / History /
// watchlists keep their current behavior; result pages render
// `scoring.calibrated` alongside legacy for comparison until the default flips.

interface ScoreContribution {
  source: string;
  points: number; // signed; negative = reputation discount
  weight: "high" | "medium" | "low";
  note: string;
}

interface ScoreVariance {
  field: string;
  values: { source: string; value: string }[];
  recommendation?: string;
}

interface CalibratedScoring {
  calibrated: number;
  legacy: number | null;
  verdict: "malicious" | "suspicious" | "low_signal" | "no_signal";
  legacyDivergence: string | null;
  contributions: ScoreContribution[];
  variances: ScoreVariance[];
}

function vtCurve(malicious: number, suspicious: number): number {
  if (malicious >= 10) return 95;
  if (malicious >= 5) return 85;
  if (malicious >= 3) return 70;
  if (malicious === 2) return 55;
  if (malicious === 1) return 35;
  if (suspicious > 0) return Math.min(20 + suspicious * 5, 35);
  return 0;
}

function computeCalibratedScoring(
  results: ThreatResult[],
  legacy: number | null,
  enrichment?: IPEnrichment
): CalibratedScoring {
  const up: ScoreContribution[] = [];
  const down: ScoreContribution[] = [];
  const info: ScoreContribution[] = [];
  const cleanHighSources: string[] = [];

  const find = (s: string) => results.find(r => r.source === s && !r.error);

  // --- VirusTotal (ip/domain/url/hash variants share last_analysis_stats) ---
  for (const src of ["virustotal", "virustotal_url", "virustotal_hash"]) {
    const r = find(src);
    const stats = (r?.data as any)?.data?.attributes?.last_analysis_stats;
    if (!r || !stats) continue;
    const m = Number(stats.malicious ?? 0);
    const s = Number(stats.suspicious ?? 0);
    const silent = Number(stats.harmless ?? 0) + Number(stats.undetected ?? 0);
    const score = vtCurve(m, s);
    if (score > 0) {
      up.push({ source: src, points: score, weight: "high", note: `${m} malicious / ${s} suspicious engines (count-based; not diluted by ${silent} clean/silent engines)` });
    } else {
      info.push({ source: src, points: 0, weight: "high", note: "no engine flagged this indicator" });
      cleanHighSources.push(src);
    }
  }

  // --- AbuseIPDB: community confidence is already calibrated 0-100 ---
  {
    const r = find("abuseipdb");
    const d = (r?.data as any)?.data;
    if (r && d) {
      const conf = Number(d.abuseConfidenceScore ?? 0);
      if (conf > 0) up.push({ source: "abuseipdb", points: conf, weight: "high", note: `abuse confidence ${conf}% (${d.totalReports ?? 0} reports)` });
      else { info.push({ source: "abuseipdb", points: 0, weight: "high", note: "no abuse reports" }); cleanHighSources.push("abuseipdb"); }
    }
  }

  // --- Spamhaus: zone-aware (the PBL fix) ---
  {
    const r = find("spamhaus");
    const listed: string[] = ((r?.data as any)?.listedIn ?? []);
    if (r && listed.length > 0) {
      const sbl = listed.some(n => n.includes("SBL"));
      const xbl = listed.some(n => n.includes("XBL"));
      const pblOnly = !sbl && !xbl;
      if (xbl) up.push({ source: "spamhaus", points: 85, weight: "high", note: "XBL: hijacked/exploited host (bot, open proxy)" });
      else if (sbl) up.push({ source: "spamhaus", points: 80, weight: "high", note: "SBL: verified spam source" });
      if (pblOnly) info.push({ source: "spamhaus", points: 0, weight: "low", note: "PBL only — residential/dynamic IP policy listing, NOT a malicious signal (legacy scored this +60 and boosted +25)" });
    }
  }

  // --- abuse.ch family ---
  for (const [src, pts, note] of [
    ["threatfox", 85, "active IOC in ThreatFox"],
    ["urlhaus", 85, "listed in URLhaus (malware distribution)"],
    ["urlhaus_url", 85, "URL listed in URLhaus (malware distribution)"],
    ["malwarebazaar", 95, "known malware sample in MalwareBazaar"],
  ] as Array<[string, number, string]>) {
    const r = find(src);
    if (!r) continue;
    if (r.isMalicious) up.push({ source: src, points: pts, weight: "high", note });
    else { info.push({ source: src, points: 0, weight: "high", note: "not listed" }); cleanHighSources.push(src); }
  }

  // --- phishing feeds + Safe Browsing ---
  for (const [src, pts, note] of [
    ["phishtank", 90, "verified phish in PhishTank"],
    ["openphish", 85, "listed in OpenPhish feed"],
    ["google_safebrowsing", 90, "flagged by Google Safe Browsing"],
  ] as Array<[string, number, string]>) {
    const r = find(src);
    if (!r) continue;
    if (r.isMalicious) up.push({ source: src, points: pts, weight: "high", note });
    else { info.push({ source: src, points: 0, weight: "high", note: "not listed" }); cleanHighSources.push(src); }
  }

  // --- Blocklist.de: real attack reports ---
  {
    const r = find("blocklistde");
    const listed: string[] = ((r?.data as any)?.listedIn ?? []);
    if (r && listed.length > 0) up.push({ source: "blocklistde", points: 70, weight: "medium", note: `attack reports in last 48h (${listed.join(", ")})` });
  }

  // --- GreyNoise: separates scanners from threats; benign is a DISCOUNT ---
  {
    const r = find("greynoise");
    const cls = (r?.data as any)?.classification;
    if (cls === "malicious") up.push({ source: "greynoise", points: 75, weight: "medium", note: "GreyNoise classifies as malicious scanner" });
    else if (cls === "benign") down.push({ source: "greynoise", points: -25, weight: "medium", note: "GreyNoise classifies as BENIGN known scanner (e.g. Shodan/Censys/research)" });
    else if (r && (r.data as any)?.noise) info.push({ source: "greynoise", points: 0, weight: "low", note: "internet background noise — scanning is not itself maliciousness" });
  }

  // --- OTX: pulse count is research activity, not a verdict (legacy: ×10) ---
  for (const src of ["alienvault", "alienvault_hash"]) {
    const r = find(src);
    const pulses = Number((r?.data as any)?.pulse_info?.count ?? 0);
    if (!r) continue;
    if (pulses >= 10) up.push({ source: src, points: 30, weight: "low", note: `${pulses} OTX pulses (capped — pulse count ≠ maliciousness)` });
    else if (pulses >= 3) up.push({ source: src, points: 18, weight: "low", note: `${pulses} OTX pulses (capped)` });
    else if (pulses >= 1) info.push({ source: src, points: 0, weight: "low", note: `${pulses} OTX pulse(s) — too few to score` });
  }

  // --- IPQualityScore: only high fraud scores are meaningful ---
  {
    const r = find("ipqualityscore");
    const fraud = Number((r?.data as any)?.fraud_score ?? 0);
    if (r && fraud >= 85) up.push({ source: "ipqualityscore", points: fraud, weight: "medium", note: `fraud score ${fraud}` });
    else if (r && fraud >= 75) up.push({ source: "ipqualityscore", points: 40, weight: "low", note: `fraud score ${fraud} (elevated, below high-risk threshold)` });
  }

  // --- Hybrid Analysis (hash) ---
  {
    const r = find("hybrid_analysis");
    const first = (r?.data as any)?.[0];
    if (first?.verdict === "malicious") up.push({ source: "hybrid_analysis", points: 90, weight: "high", note: `sandbox verdict: malicious${first.vx_family ? ` (${first.vx_family})` : ""}` });
    else if (first?.verdict === "suspicious") up.push({ source: "hybrid_analysis", points: 50, weight: "medium", note: "sandbox verdict: suspicious" });
  }

  // --- Tranco: popularity DISCOUNTS suspicion (legacy fetched it, scored nothing) ---
  {
    const r = find("tranco");
    const rank = Number((r?.data as any)?.rank ?? 0);
    if (rank > 0) {
      const discount = rank <= 1_000 ? -30 : rank <= 10_000 ? -20 : rank <= 100_000 ? -12 : -6;
      down.push({ source: "tranco", points: discount, weight: "medium", note: `Tranco global rank #${rank} — widely-used domain, compromise possible but bar is higher` });
    }
  }

  // --- WHOIS age (domains): brand-new registration is a real signal ---
  {
    const r = find("whois");
    const parsed = (r?.data as any)?.parsed;
    const createdRaw = parsed?.creationDate ?? parsed?.created ?? parsed?.creation_date ?? null;
    if (createdRaw) {
      const created = new Date(createdRaw);
      if (!isNaN(created.getTime())) {
        const ageDays = (Date.now() - created.getTime()) / 86_400_000;
        if (ageDays >= 0 && ageDays <= 30) up.push({ source: "whois", points: 25, weight: "medium", note: `domain registered ${Math.round(ageDays)} days ago` });
        else if (ageDays > 365 * 5) down.push({ source: "whois", points: -8, weight: "low", note: `domain registered ${Math.round(ageDays / 365)} years ago` });
      }
    }
  }

  // --- context (tor/vpn/proxy): notes with small boosts, not blind +10..+30 ---
  if (enrichment?.isTor) up.push({ source: "tor_exit_list", points: 12, weight: "low", note: "Tor exit node — anonymity infrastructure, not maliciousness per se" });
  if (enrichment?.isMassScanner && enrichment?.scannerType === "malicious") up.push({ source: "scanner_db", points: 25, weight: "medium", note: "known malicious mass scanner" });
  if (enrichment?.isProxy) up.push({ source: "proxy_check", points: 6, weight: "low", note: "open/anonymous proxy" });
  if (enrichment?.isVPN) info.push({ source: "vpn_check", points: 0, weight: "low", note: `VPN exit${enrichment.vpnService ? ` (${enrichment.vpnService})` : ""} — commercial VPNs are not a threat signal by themselves (legacy added +10)` });

  // --- aggregate: strongest signal + diminishing corroboration − reputation ---
  const sortedUp = [...up].sort((a, b) => b.points - a.points);
  let score = sortedUp[0]?.points ?? 0;
  const corroborationFactors = [0.25, 0.15, 0.05];
  for (let i = 1; i < sortedUp.length; i++) {
    score += sortedUp[i].points * (corroborationFactors[i - 1] ?? 0.05);
  }
  const downSum = Math.max(down.reduce((a, c) => a + c.points, 0), -40);
  // reputation can soften a weak signal, but cannot erase multiple confirmed hits
  const strongHits = sortedUp.filter(c => c.points >= 70 && c.weight === "high").length;
  score += strongHits >= 2 ? downSum * 0.3 : downSum;
  const calibrated = Math.max(0, Math.min(100, Math.round(score)));

  const verdict: CalibratedScoring["verdict"] =
    calibrated >= 70 ? "malicious" : calibrated >= 40 ? "suspicious" : calibrated >= 15 ? "low_signal" : "no_signal";

  // --- variances: cross-source disagreement, surfaced instead of averaged away ---
  const variances: ScoreVariance[] = [];
  const hits = sortedUp.filter(c => c.points >= 50);
  if (hits.length > 0 && cleanHighSources.length >= 2) {
    variances.push({
      field: "Maliciousness",
      values: [
        ...hits.map(c => ({ source: c.source, value: `flagged (${c.points})` })),
        ...cleanHighSources.map(s => ({ source: s, value: "clean" })),
      ],
      recommendation: "Sources disagree — review the flagged sources' evidence before acting; a single-feed hit may be stale or scoped differently.",
    });
  }
  const trancoDown = down.find(c => c.source === "tranco");
  if (trancoDown && hits.length > 0) {
    variances.push({
      field: "Reputation vs detection",
      values: [
        { source: "tranco", value: trancoDown.note },
        ...hits.map(c => ({ source: c.source, value: `flagged (${c.points})` })),
      ],
      recommendation: "A highly-ranked domain that's also flagged usually means compromise of a legit site or a false positive — verify the specific URL/path, not just the domain.",
    });
  }
  const pblInfo = info.find(c => c.source === "spamhaus");
  if (pblInfo && legacy !== null && legacy >= 40 && calibrated < 40) {
    variances.push({
      field: "Spamhaus PBL inflation",
      values: [
        { source: "legacy score", value: String(legacy) },
        { source: "calibrated", value: String(calibrated) },
      ],
      recommendation: "Legacy score was inflated by a PBL-only Spamhaus listing (residential policy list). Calibrated scoring treats PBL as informational.",
    });
  }

  // --- explain legacy divergence ---
  let legacyDivergence: string | null = null;
  if (legacy !== null && Math.abs(legacy - calibrated) > 25) {
    if (calibrated > legacy) {
      legacyDivergence = `Calibrated ${calibrated} vs legacy ${legacy}: legacy averaged real detections against sources that returned 0 (and divided VT hits by the full ~75-engine roster), hiding a genuine signal.`;
    } else {
      legacyDivergence = `Calibrated ${calibrated} vs legacy ${legacy}: legacy added binary boosts (VPN/proxy/Spamhaus-PBL) with no evidence of maliciousness behind them.`;
    }
  }

  return {
    calibrated,
    legacy,
    verdict,
    legacyDivergence,
    contributions: [...sortedUp, ...down, ...info],
    variances,
  };
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

  const toBase64Url = (input: string): string => {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const b64 = btoa(binary);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const urlId = toBase64Url(url);
  const cacheKey = `url:${urlId}`;
  const cached = await getCachedResponse(ctx, "virustotal", cacheKey);
  if (cached) {
    const stats = (cached as any)?.data?.attributes?.last_analysis_stats;
    const isMalicious = stats ? (Number(stats.malicious ?? 0) > 0 || Number(stats.suspicious ?? 0) > 0) : false;
    return { source: "virustotal_url", data: cached, isMalicious };
  }

  try {
    const response = await fetchWithTimeout(
      `https://www.virustotal.com/api/v3/urls/${urlId}`,
      { headers: { "x-apikey": apiKey } }
    );

    if (response.status === 404) {
      const scanResponse = await fetchWithTimeout(
        "https://www.virustotal.com/api/v3/urls",
        {
          method: "POST",
          headers: {
            "x-apikey": apiKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `url=${encodeURIComponent(url)}`,
        }
      );

      const scanText = await scanResponse.text().catch(() => "");
      const scanData = scanText ? (() => { try { return JSON.parse(scanText); } catch { return { raw: scanText }; } })() : {};

      await setCachedResponse(ctx, "virustotal", cacheKey, { submitted: true, ...scanData });

      return { source: "virustotal_url", data: { submitted: true, ...scanData } };
    }

    const text = await response.text().catch(() => "");
    const data = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : {};

    if (!response.ok) {
      return { source: "virustotal_url", data, error: `HTTP ${response.status}` };
    }

    await setCachedResponse(ctx, "virustotal", cacheKey, data);

    const stats = (data as any)?.data?.attributes?.last_analysis_stats;
    const isMalicious = stats ? (Number(stats.malicious ?? 0) > 0 || Number(stats.suspicious ?? 0) > 0) : false;

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

async function checkVirusTotalDomain(ctx: TierContext, domain: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "virustotal", data: {}, error: "API key not configured" };

  const cacheKey = `domain:${domain}`;
  const cached = await getCachedResponse(ctx, "virustotal", cacheKey);

  if (cached) {
    const stats = cached?.data?.attributes?.last_analysis_stats;
    const isMalicious = stats ? (stats.malicious > 0 || stats.suspicious > 0) : false;
    const threatScore = stats ? Math.round((stats.malicious + stats.suspicious * 0.5) / (stats.malicious + stats.suspicious + stats.harmless + stats.undetected) * 100) : 0;
    return { source: "virustotal", data: cached, isMalicious, threatScore };
  }

  try {
    const response = await fetchWithTimeout(
      `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`,
      { headers: { "x-apikey": apiKey } }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { source: "virustotal", data, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    await setCachedResponse(ctx, "virustotal", cacheKey, data);

    const stats = data?.data?.attributes?.last_analysis_stats;
    const isMalicious = stats ? (stats.malicious > 0 || stats.suspicious > 0) : false;
    const threatScore = stats ? Math.round((stats.malicious + stats.suspicious * 0.5) / (stats.malicious + stats.suspicious + stats.harmless + stats.undetected) * 100) : 0;

    return { source: "virustotal", data, isMalicious, threatScore };
  } catch (e) {
    return { source: "virustotal", data: {}, error: String(e) };
  }
}

async function checkDomainWHOIS(ctx: TierContext, domain: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "whois", domain);
  if (cached) return { source: "whois", data: cached };

  try {
    const response = await fetchWithTimeout(`https://rdap-bootstrap.arin.net/bootstrap/domain/${domain}`);
    if (!response.ok) {
      return { source: "whois", data: {}, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    await setCachedResponse(ctx, "whois", domain, data);

    const events = data.events || [];
    const registration = events.find((e: any) => e.eventAction === "registration");
    const expiration = events.find((e: any) => e.eventAction === "expiration");
    const lastChanged = events.find((e: any) => e.eventAction === "last changed");

    const enrichedData = {
      ...data,
      parsed: {
        domain: data.ldhName || domain,
        status: data.status,
        registrar: data.entities?.find((e: any) => e.roles?.includes("registrar"))?.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] || "Unknown",
        registrationDate: registration?.eventDate,
        expirationDate: expiration?.eventDate,
        lastChanged: lastChanged?.eventDate,
        nameservers: data.nameservers?.map((ns: any) => ns.ldhName) || [],
        domainAge: registration?.eventDate ? Math.floor((Date.now() - new Date(registration.eventDate).getTime()) / (1000 * 60 * 60 * 24)) : null
      }
    };

    return { source: "whois", data: enrichedData };
  } catch (e) {
    return { source: "whois", data: {}, error: String(e) };
  }
}

async function checkVirusTotalHash(ctx: TierContext, hash: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "virustotal_hash", data: {}, error: "API key not configured" };

  const cacheKey = `hash:${hash}`;
  const cached = await getCachedResponse(ctx, "virustotal", cacheKey);
  if (cached) {
    const stats = (cached as any)?.data?.attributes?.last_analysis_stats;
    const malicious = Number(stats?.malicious ?? 0);
    const suspicious = Number(stats?.suspicious ?? 0);
    const isMalicious = malicious > 0 || suspicious > 0;
    const threatScore = calculateVTHashScore(cached);
    return { source: "virustotal_hash", data: cached, isMalicious, threatScore };
  }

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

    await setCachedResponse(ctx, "virustotal", cacheKey, data);

    const stats = (data as any)?.data?.attributes?.last_analysis_stats;
    const malicious = Number(stats?.malicious ?? 0);
    const suspicious = Number(stats?.suspicious ?? 0);
    const isMalicious = malicious > 0 || suspicious > 0;
    const threatScore = calculateVTHashScore(data);

    return { source: "virustotal_hash", data, isMalicious, threatScore };
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
  if (cached) {
    const isMalicious = (cached as any)?.query_status === "ok";
    return { source: "malwarebazaar", data: cached, isMalicious, threatScore: isMalicious ? 90 : 0 };
  }

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

    const isMalicious = data?.query_status === "ok";
    return { source: "malwarebazaar", data, isMalicious, threatScore: isMalicious ? 90 : 0 };
  } catch (e) {
    return { source: "malwarebazaar", data: {}, error: String(e) };
  }
}

async function checkHybridAnalysisHash(ctx: TierContext, hash: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "hybrid_analysis", data: {}, error: "API key not configured" };

  const cached = await getCachedResponse(ctx, "hybrid_analysis", hash);
  if (cached) {
    const verdict = (cached as any)?.[0]?.verdict;
    const isMalicious = verdict === "malicious";
    const threatScore = verdict === "malicious" ? 85 : verdict === "suspicious" ? 50 : 0;
    return { source: "hybrid_analysis", data: cached, isMalicious, threatScore };
  }

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

    const verdict = (data as any)?.[0]?.verdict;
    const isMalicious = verdict === "malicious";
    const threatScore = verdict === "malicious" ? 85 : verdict === "suspicious" ? 50 : 0;

    return { source: "hybrid_analysis", data, isMalicious, threatScore };
  } catch (e) {
    return { source: "hybrid_analysis", data: {}, error: String(e) };
  }
}

async function checkAlienVaultHash(ctx: TierContext, hash: string, apiKey: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "alienvault_hash", hash);
  if (cached) {
    const pulseCount = (cached as any)?.pulse_info?.count ?? 0;
    const isMalicious = pulseCount > 0;
    const threatScore = Math.min(pulseCount * 10, 100);
    return { source: "alienvault_hash", data: cached, isMalicious, threatScore };
  }

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

    const pulseCount = (data as any)?.pulse_info?.count ?? 0;
    const isMalicious = pulseCount > 0;
    const threatScore = Math.min(pulseCount * 10, 100);

    return { source: "alienvault_hash", data, isMalicious, threatScore };
  } catch (e) {
    return { source: "alienvault_hash", data: {}, error: String(e) };
  }
}

// ── Phase 2: Passive DNS + cert transparency ──────────────────────────────────

interface PDNSRecord {
  rrtype: string;
  rrname: string;
  rdata: string;
  first_seen: string | null;
  last_seen: string | null;
  count: number | null;
  source: string;
}

async function checkCIRCLPDNS(ctx: TierContext, target: string, authB64: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "circl_pdns", target);
  if (cached) return { source: "circl_pdns", data: cached };
  try {
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (authB64) headers["Authorization"] = `Basic ${authB64}`;
    const response = await fetchWithTimeout(
      `https://www.circl.lu/pdns/query/${encodeURIComponent(target)}`,
      { headers }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const records: PDNSRecord[] = text.trim().split("\n")
      .filter(Boolean)
      .flatMap(line => {
        try {
          const r = JSON.parse(line);
          return [{
            rrtype: (r.rrtype ?? "A").toUpperCase(),
            rrname: (r.rrname ?? "").replace(/\.$/, ""),
            rdata: (r.rdata ?? "").replace(/\.$/, ""),
            first_seen: r.time_first ? new Date(r.time_first * 1000).toISOString() : null,
            last_seen: r.time_last ? new Date(r.time_last * 1000).toISOString() : null,
            count: r.count ?? null,
            source: "CIRCL",
          }];
        } catch { return []; }
      });
    const data = { records, total: records.length, source: "CIRCL Passive DNS" };
    await setCachedResponse(ctx, "circl_pdns", target, data);
    return { source: "circl_pdns", data };
  } catch (e) {
    return { source: "circl_pdns", data: {}, error: String(e) };
  }
}

async function checkMnemonicPDNS(ctx: TierContext, target: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "mnemonic_pdns", target);
  if (cached) return { source: "mnemonic_pdns", data: cached };
  try {
    const response = await fetchWithTimeout(
      `https://api.mnemonic.no/pdns/v3/${encodeURIComponent(target)}`,
      { headers: { "Accept": "application/json" } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const records: PDNSRecord[] = (json?.data ?? []).map((r: any) => ({
      rrtype: (r.rrtype ?? "a").toUpperCase(),
      rrname: (r.query ?? "").replace(/\.$/, ""),
      rdata: (r.answer ?? "").replace(/\.$/, ""),
      first_seen: r.firstSeenTimestamp ? new Date(r.firstSeenTimestamp).toISOString() : null,
      last_seen: r.lastSeenTimestamp ? new Date(r.lastSeenTimestamp).toISOString() : null,
      count: r.count ?? null,
      source: "Mnemonic",
    }));
    const data = { records, total: records.length, source: "Mnemonic Passive DNS" };
    await setCachedResponse(ctx, "mnemonic_pdns", target, data);
    return { source: "mnemonic_pdns", data };
  } catch (e) {
    return { source: "mnemonic_pdns", data: {}, error: String(e) };
  }
}

async function checkSecurityTrailsPDNS(ctx: TierContext, domain: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "securitytrails_pdns", data: {}, error: "API key not configured" };
  const cacheKey = `pdns:${domain}`;
  const cached = await getCachedResponse(ctx, "securitytrails", cacheKey);
  if (cached) return { source: "securitytrails_pdns", data: cached };
  try {
    const response = await fetchWithTimeout(
      `https://api.securitytrails.com/v1/history/${encodeURIComponent(domain)}/dns/a`,
      { headers: { "APIKEY": apiKey, "Accept": "application/json" } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const records: PDNSRecord[] = (json?.records ?? []).flatMap((r: any) =>
      (r.values ?? []).map((v: any) => ({
        rrtype: "A",
        rrname: domain,
        rdata: v.ip ?? "",
        first_seen: r.first_seen ? `${r.first_seen}T00:00:00Z` : null,
        last_seen: r.last_seen ? `${r.last_seen}T00:00:00Z` : null,
        count: r.count ?? null,
        source: "SecurityTrails",
      }))
    ).filter((r: PDNSRecord) => r.rdata);
    const data = { records, total: records.length, source: "SecurityTrails pDNS" };
    await setCachedResponse(ctx, "securitytrails", cacheKey, data);
    return { source: "securitytrails_pdns", data };
  } catch (e) {
    return { source: "securitytrails_pdns", data: {}, error: String(e) };
  }
}

async function checkCrtSh(ctx: TierContext, domain: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "crtsh", domain);
  if (cached) return { source: "crtsh", data: cached };
  try {
    const response = await fetchWithTimeout(
      `https://crt.sh/?q=%.${encodeURIComponent(domain)}&output=json`,
      { headers: { "Accept": "application/json" } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const certs: any[] = await response.json();

    const subdomainSet = new Set<string>();
    const recentCerts: any[] = [];

    for (const cert of certs.slice(0, 300)) {
      const names = (cert.name_value ?? "").split(/[\n\r]+/).map((s: string) => s.trim());
      for (const name of names) {
        const clean = name.replace(/^\*\./, "").toLowerCase();
        if (clean !== domain && clean.endsWith(`.${domain}`)) subdomainSet.add(clean);
      }
      if (recentCerts.length < 10) {
        recentCerts.push({
          logged_at: cert.entry_timestamp ?? null,
          not_before: cert.not_before ?? null,
          not_after: cert.not_after ?? null,
          common_name: cert.common_name ?? null,
          issuer: cert.issuer_name
            ?.split(",")
            .find((p: string) => p.trim().startsWith("O="))
            ?.replace(/^.*O=/, "").trim() ?? null,
        });
      }
    }

    const data = {
      domain,
      subdomains: [...subdomainSet].slice(0, 150),
      subdomain_count: subdomainSet.size,
      cert_count: certs.length,
      recent_certs: recentCerts,
      source: "crt.sh Certificate Transparency",
    };
    await setCachedResponse(ctx, "crtsh", domain, data);
    return { source: "crtsh", data };
  } catch (e) {
    return { source: "crtsh", data: {}, error: String(e) };
  }
}

async function checkCensys(ctx: TierContext, ip: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "censys", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "censys", ip);
  if (cached) return { source: "censys", data: cached };
  try {
    const encoded = btoa(apiKey); // apiKey = "app_id:api_secret"
    const response = await fetchWithTimeout(
      `https://search.censys.io/api/v2/hosts/${encodeURIComponent(ip)}`,
      { headers: { "Authorization": `Basic ${encoded}`, "Accept": "application/json" } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const host = json?.result ?? {};
    const data = {
      ip: host.ip,
      services: (host.services ?? []).slice(0, 20).map((s: any) => ({
        port: s.port,
        transport: s.transport_protocol,
        service: s.service_name,
        extended_service: s.extended_service_name,
      })),
      autonomous_system: host.autonomous_system ?? null,
      location: host.location ?? null,
      labels: host.labels ?? [],
      last_updated: host.last_updated_at ?? null,
      source: "Censys",
    };
    await setCachedResponse(ctx, "censys", ip, data);
    return { source: "censys", data };
  } catch (e) {
    return { source: "censys", data: {}, error: String(e) };
  }
}

function aggregatePDNS(results: ThreatResult[]): PDNSRecord[] {
  const pDNSSources = new Set(["circl_pdns", "mnemonic_pdns", "securitytrails_pdns"]);
  const all: PDNSRecord[] = [];

  for (const r of results) {
    if (pDNSSources.has(r.source)) {
      all.push(...((r.data as any)?.records ?? []));
    }
  }

  // Fold in VT resolutions (already fetched by Phase 0)
  const vtRes = results.find(r => r.source === "virustotal_resolutions");
  if (vtRes && !vtRes.error) {
    for (const item of (vtRes.data as any)?.data ?? []) {
      const attrs = item?.attributes ?? {};
      if (attrs.ip_address || attrs.host_name) {
        all.push({
          rrtype: "A",
          rrname: attrs.host_name ?? "",
          rdata: attrs.ip_address ?? "",
          first_seen: attrs.date ? new Date(attrs.date * 1000).toISOString() : null,
          last_seen: attrs.date ? new Date(attrs.date * 1000).toISOString() : null,
          count: null,
          source: "VirusTotal",
        });
      }
    }
  }

  // Deduplicate on (rrtype, rrname, rdata)
  const seen = new Set<string>();
  return all.filter(r => {
    if (!r.rrname || !r.rdata) return false;
    const key = `${r.rrtype}:${r.rrname}:${r.rdata}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function savePDNSEdges(records: PDNSRecord[]): Promise<void> {
  const edges = records
    .filter(r => r.rrname && r.rdata && (r.rrtype === "A" || r.rrtype === "AAAA"))
    .map(r => ({
      source_type: "domain",
      source_value: r.rrname.toLowerCase(),
      target_type: "ip",
      target_value: r.rdata.toLowerCase(),
      edge_type: "resolves_to",
      first_seen: r.first_seen ?? null,
      last_seen: r.last_seen ?? null,
      observation_count: r.count ?? 1,
      confidence: "high",
      source_dataset: r.source.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      metadata: { rrtype: r.rrtype },
      updated_at: new Date().toISOString(),
    }));

  if (edges.length === 0) return;
  await serviceClient.from("ioc_relationships")
    .upsert(edges, { onConflict: "source_type,source_value,target_type,target_value,edge_type,source_dataset" })
    .catch(e => console.error("savePDNSEdges:", e));
}

async function saveCertEdges(domain: string, subdomains: string[]): Promise<void> {
  if (subdomains.length === 0) return;
  const edges = subdomains.map(sub => ({
    source_type: "domain",
    source_value: domain.toLowerCase(),
    target_type: "domain",
    target_value: sub.toLowerCase(),
    edge_type: "cert_san",
    observation_count: 1,
    confidence: "high",
    source_dataset: "crtsh",
    metadata: {},
    updated_at: new Date().toISOString(),
  }));
  await serviceClient.from("ioc_relationships")
    .upsert(edges, { onConflict: "source_type,source_value,target_type,target_value,edge_type,source_dataset" })
    .catch(e => console.error("saveCertEdges:", e));
}

// ── Phase 1: CVE sources ──────────────────────────────────────────────────────

async function checkNVD(ctx: TierContext, cveId: string, apiKey: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "nvd", cveId);
  if (cached) return { source: "nvd", data: cached };
  try {
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (apiKey) headers["apiKey"] = apiKey;
    const response = await fetchWithTimeout(
      `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`,
      { headers }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "nvd", cveId, data);
    return { source: "nvd", data };
  } catch (e) {
    return { source: "nvd", data: {}, error: String(e) };
  }
}

async function checkCISAKEV(ctx: TierContext, cveId: string): Promise<ThreatResult> {
  const kevCacheKey = "cisa:kev:catalog:v1";
  try {
    const { data: kevCache } = await serviceClient
      .from("api_cache")
      .select("response")
      .eq("cache_key", kevCacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    let vulns: any[];
    if (kevCache?.response?.vulnerabilities) {
      vulns = kevCache.response.vulnerabilities as any[];
    } else {
      const response = await fetchWithTimeout("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = await response.json();
      vulns = catalog.vulnerabilities ?? [];
      const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
      await serviceClient.from("api_cache").upsert(
        { cache_key: kevCacheKey, source: "cisa_kev", query: "catalog", response: { vulnerabilities: vulns }, expires_at: expiresAt, context: "global" },
        { onConflict: "cache_key" }
      );
    }

    const entry = vulns.find((v: any) => v.cveID?.toUpperCase() === cveId.toUpperCase());
    const isKEV = !!entry;
    return {
      source: "cisa_kev",
      data: {
        is_kev: isKEV,
        date_added: entry?.dateAdded ?? null,
        due_date: entry?.dueDate ?? null,
        ransomware_use: entry?.knownRansomwareCampaignUse ?? null,
        vendor_project: entry?.vendorProject ?? null,
        product: entry?.product ?? null,
        required_action: entry?.requiredAction ?? null,
        vulnerability_name: entry?.vulnerabilityName ?? null,
        catalog_size: vulns.length,
        source: "CISA KEV Catalog",
      },
      isMalicious: isKEV,
    };
  } catch (e) {
    return { source: "cisa_kev", data: {}, error: String(e) };
  }
}

async function checkEPSS(ctx: TierContext, cveId: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "epss", cveId);
  if (cached) return { source: "epss", data: cached };
  try {
    const response = await fetchWithTimeout(`https://api.first.org/data/v1/epss?cve=${encodeURIComponent(cveId)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const entry = json?.data?.[0] ?? null;
    const data = {
      cve: cveId,
      epss_score: entry ? parseFloat(entry.epss) : null,
      epss_percentile: entry ? parseFloat(entry.percentile) : null,
      date: entry?.date ?? null,
      source: "FIRST EPSS",
    };
    await setCachedResponse(ctx, "epss", cveId, data);
    return { source: "epss", data };
  } catch (e) {
    return { source: "epss", data: {}, error: String(e) };
  }
}

function parseCVEUnified(nvdResult: ThreatResult, kevResult: ThreatResult, epssResult: ThreatResult) {
  const vuln = (nvdResult.data as any)?.vulnerabilities?.[0]?.cve;
  const description = vuln?.descriptions?.find((d: any) => d.lang === "en")?.value ?? null;
  const metrics = vuln?.metrics;
  const cvssV3 = metrics?.cvssMetricV31?.[0]?.cvssData ?? metrics?.cvssMetricV30?.[0]?.cvssData ?? null;
  const cvssV2 = metrics?.cvssMetricV2?.[0]?.cvssData ?? null;
  const cwe = vuln?.weaknesses?.[0]?.description?.[0]?.value ?? null;
  const refs = (vuln?.references ?? []).map((r: any) => r.url).filter(Boolean).slice(0, 10);
  const kev = kevResult.data as any;
  const epss = epssResult.data as any;

  return {
    description,
    cvss_v3_score: cvssV3?.baseScore ?? null,
    cvss_v3_severity: cvssV3?.baseSeverity ?? null,
    cvss_v2_score: cvssV2?.baseScore ?? null,
    cwe: cwe !== "NVD-CWE-Other" && cwe !== "NVD-CWE-noinfo" ? cwe : null,
    published: vuln?.published ?? null,
    last_modified: vuln?.lastModified ?? null,
    vuln_status: vuln?.vulnStatus ?? null,
    is_kev: kev?.is_kev ?? false,
    kev_date_added: kev?.date_added ?? null,
    kev_due_date: kev?.due_date ?? null,
    kev_ransomware_use: kev?.ransomware_use ?? null,
    epss_score: epss?.epss_score ?? null,
    epss_percentile: epss?.epss_percentile ?? null,
    references: refs,
  };
}

// ── Phase 1: Wallet sources ───────────────────────────────────────────────────

async function checkBlockchainInfo(ctx: TierContext, address: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "blockchain_info", address);
  if (cached) return { source: "blockchain_info", data: cached };
  try {
    const response = await fetchWithTimeout(`https://blockchain.info/rawaddr/${address}?limit=3`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    const data = {
      address: raw.address,
      balance_satoshi: raw.final_balance,
      balance_btc: (raw.final_balance ?? 0) / 1e8,
      total_received_btc: (raw.total_received ?? 0) / 1e8,
      total_sent_btc: (raw.total_sent ?? 0) / 1e8,
      tx_count: raw.n_tx,
      first_seen: raw.txs?.at(-1)?.time ? new Date((raw.txs.at(-1).time) * 1000).toISOString() : null,
      last_seen: raw.txs?.[0]?.time ? new Date(raw.txs[0].time * 1000).toISOString() : null,
      source: "Blockchain.info",
    };
    await setCachedResponse(ctx, "blockchain_info", address, data);
    return { source: "blockchain_info", data };
  } catch (e) {
    return { source: "blockchain_info", data: {}, error: String(e) };
  }
}

async function checkEthplorer(ctx: TierContext, address: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "ethplorer", address);
  if (cached) return { source: "ethplorer", data: cached };
  try {
    const response = await fetchWithTimeout(`https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    const data = {
      address,
      eth_balance: raw.ETH?.balance ?? null,
      tx_count: raw.countTxs ?? null,
      tokens_held: (raw.tokens ?? []).length,
      top_tokens: (raw.tokens ?? []).slice(0, 5).map((t: any) => ({
        symbol: t.tokenInfo?.symbol,
        name: t.tokenInfo?.name,
        balance: t.balance,
      })),
      source: "Ethplorer",
    };
    await setCachedResponse(ctx, "ethplorer", address, data);
    return { source: "ethplorer", data };
  } catch (e) {
    return { source: "ethplorer", data: {}, error: String(e) };
  }
}

async function checkMisttrack(ctx: TierContext, address: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "misttrack", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "misttrack", address);
  if (cached) {
    const isSanctioned = (cached as any)?.risk_level === "high" || (cached as any)?.is_sanctioned === true;
    return { source: "misttrack", data: cached, isMalicious: isSanctioned };
  }
  try {
    const response = await fetchWithTimeout(
      `https://openapi.misttrack.io/v1/address/risk_score?address=${encodeURIComponent(address)}&api_key=${apiKey}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "misttrack", address, data);
    const isSanctioned = data?.risk_level === "high" || data?.is_sanctioned === true;
    return { source: "misttrack", data, isMalicious: isSanctioned };
  } catch (e) {
    return { source: "misttrack", data: {}, error: String(e) };
  }
}

// ── Phase 1: Email sources ────────────────────────────────────────────────────

async function checkEmailRep(ctx: TierContext, email: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "emailrep", email);
  if (cached) {
    const suspicious = (cached as any)?.suspicious === true;
    return { source: "emailrep", data: cached, isMalicious: suspicious };
  }
  try {
    const response = await fetchWithTimeout(`https://emailrep.io/${encodeURIComponent(email)}`, {
      headers: { "Accept": "application/json", "User-Agent": "ThamOS/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "emailrep", email, data);
    const suspicious = data?.suspicious === true;
    return { source: "emailrep", data, isMalicious: suspicious };
  } catch (e) {
    return { source: "emailrep", data: {}, error: String(e) };
  }
}

async function checkHIBP(ctx: TierContext, email: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "hibp", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "hibp", email);
  if (cached) {
    const isBreached = Array.isArray(cached) && (cached as any[]).length > 0;
    return { source: "hibp", data: { breaches: cached, breach_count: (cached as any[]).length }, isMalicious: isBreached };
  }
  try {
    const response = await fetchWithTimeout(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      { headers: { "hibp-api-key": apiKey, "User-Agent": "ThamOS/1.0" } }
    );
    if (response.status === 404) {
      await setCachedResponse(ctx, "hibp", email, []);
      return { source: "hibp", data: { breaches: [], breach_count: 0 }, isMalicious: false };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "hibp", email, data);
    return { source: "hibp", data: { breaches: data, breach_count: data.length }, isMalicious: data.length > 0 };
  } catch (e) {
    return { source: "hibp", data: {}, error: String(e) };
  }
}

async function checkEmailDNS(_ctx: TierContext, email: string): Promise<ThreatResult> {
  const domain = email.split("@")[1];
  if (!domain) return { source: "email_dns", data: {}, error: "Invalid email format" };
  try {
    const [mxRes, txtRes, dmarcRes] = await Promise.allSettled([
      fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`, { headers: { "Accept": "application/dns-json" } }),
      fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, { headers: { "Accept": "application/dns-json" } }),
      fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=_dmarc.${domain}&type=TXT`, { headers: { "Accept": "application/dns-json" } }),
    ]);

    const mx = mxRes.status === "fulfilled" && mxRes.value.ok ? (await mxRes.value.json())?.Answer ?? [] : [];
    const txt = txtRes.status === "fulfilled" && txtRes.value.ok ? (await txtRes.value.json())?.Answer ?? [] : [];
    const dmarc = dmarcRes.status === "fulfilled" && dmarcRes.value.ok ? (await dmarcRes.value.json())?.Answer ?? [] : [];

    const spf = txt.find((r: any) => (r.data ?? "").includes("v=spf1"))?.data ?? null;
    const dmarcRecord = dmarc.find((r: any) => (r.data ?? "").includes("v=DMARC1"))?.data ?? null;

    return {
      source: "email_dns",
      data: {
        domain,
        has_mx: mx.length > 0,
        mx_records: mx.slice(0, 3).map((r: any) => r.data),
        has_spf: !!spf,
        spf,
        has_dmarc: !!dmarcRecord,
        dmarc: dmarcRecord,
        source: "DNS (Cloudflare DoH)",
      },
    };
  } catch (e) {
    return { source: "email_dns", data: {}, error: String(e) };
  }
}

async function checkPhishTank(ctx: TierContext, url: string): Promise<ThreatResult> {
  const cached = await getCachedResponse(ctx, "phishtank", url);
  if (cached) {
    const isMalicious = (cached as any)?.in_database === true;
    return { source: "phishtank", data: cached, isMalicious };
  }
  try {
    const body = new URLSearchParams({ url, format: "json" });
    const response = await fetchWithTimeout("https://checkurl.phishtank.com/checkurl/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const results = data?.results ?? data;
    await setCachedResponse(ctx, "phishtank", url, results);
    const isMalicious = results?.in_database === true;
    return { source: "phishtank", data: results, isMalicious };
  } catch (e) {
    return { source: "phishtank", data: {}, error: String(e) };
  }
}

async function checkOpenPhish(ctx: TierContext, url: string): Promise<ThreatResult> {
  const feedCacheKey = "openphish:feed:v1";
  try {
    const { data: feedCache } = await serviceClient
      .from("api_cache")
      .select("response")
      .eq("cache_key", feedCacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    let phishUrls: string[];
    if (feedCache?.response?.urls) {
      phishUrls = feedCache.response.urls as string[];
    } else {
      const response = await fetchWithTimeout("https://openphish.com/feed.txt");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      phishUrls = text.split("\n").map((u: string) => u.trim()).filter(Boolean);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await serviceClient.from("api_cache").upsert(
        { cache_key: feedCacheKey, source: "openphish", query: "feed", response: { urls: phishUrls }, expires_at: expiresAt, context: "global" },
        { onConflict: "cache_key" }
      );
    }

    const normalizedUrl = url.replace(/\/$/, "").toLowerCase();
    const isMalicious = phishUrls.some(phish => {
      const n = phish.replace(/\/$/, "").toLowerCase();
      return normalizedUrl === n || normalizedUrl.startsWith(n + "/");
    });

    return { source: "openphish", data: { in_feed: isMalicious, feed_size: phishUrls.length, source: "OpenPhish Community" }, isMalicious };
  } catch (e) {
    return { source: "openphish", data: {}, error: String(e) };
  }
}

async function checkGoogleSafeBrowsing(ctx: TierContext, url: string, apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "google_safebrowsing", data: {}, error: "API key not configured" };
  const cached = await getCachedResponse(ctx, "google_safebrowsing", url);
  if (cached) {
    const isMalicious = Array.isArray((cached as any)?.matches) && (cached as any).matches.length > 0;
    return { source: "google_safebrowsing", data: cached, isMalicious };
  }
  try {
    const body = {
      client: { clientId: "thamos6", clientVersion: "1.0" },
      threatInfo: {
        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    };
    const response = await fetchWithTimeout(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "google_safebrowsing", url, data);
    const isMalicious = Array.isArray(data?.matches) && data.matches.length > 0;
    return { source: "google_safebrowsing", data, isMalicious };
  } catch (e) {
    return { source: "google_safebrowsing", data: {}, error: String(e) };
  }
}

async function checkTrancoRank(_ctx: TierContext, domain: string): Promise<ThreatResult> {
  try {
    const { data, error } = await serviceClient
      .from("tranco_rankings")
      .select("rank, domain")
      .eq("domain", domain)
      .maybeSingle();
    if (error) throw error;
    return {
      source: "tranco",
      data: { domain, rank: data?.rank ?? null, in_top_1m: data !== null, source: "Tranco Top 1M" },
    };
  } catch (e) {
    return { source: "tranco", data: {}, error: String(e) };
  }
}

async function checkVTResolutions(ctx: TierContext, target: string, type: "domain" | "ip", apiKey: string): Promise<ThreatResult> {
  if (!apiKey) return { source: "virustotal_resolutions", data: {}, error: "API key not configured" };
  const cacheKey = `resolutions:${type}:${target}`;
  const cached = await getCachedResponse(ctx, "virustotal", cacheKey);
  if (cached) return { source: "virustotal_resolutions", data: cached };
  try {
    const endpoint = type === "domain"
      ? `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(target)}/resolutions?limit=10`
      : `https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(target)}/resolutions?limit=10`;
    const response = await fetchWithTimeout(endpoint, { headers: { "x-apikey": apiKey } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await setCachedResponse(ctx, "virustotal", cacheKey, data);
    return { source: "virustotal_resolutions", data };
  } catch (e) {
    return { source: "virustotal_resolutions", data: {}, error: String(e) };
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

  const proxycheckRaw = results.find(r => r.source === "proxycheck")?.data as any;

if (proxycheckRaw && (proxycheckRaw.status === "ok" || proxycheckRaw.status === "warning")) {
  const ipKey =
    proxycheckRaw.ip ||
    Object.keys(proxycheckRaw).find(k => k.includes(".") || k.includes(":")); 

  const ipResult = proxycheckRaw.network ? proxycheckRaw : (ipKey ? proxycheckRaw[ipKey] : undefined);

  if (ipResult) {
    const det = ipResult.detections || {};
    const net = ipResult.network || {};
    const loc = ipResult.location || {};
    const op  = ipResult.operator || {};

    if (det.proxy === true) enrichment.isProxy = true;
    if (det.vpn === true)  enrichment.isVPN = true;
    if (det.tor === true)  enrichment.isTor = true;

    if (det.hosting === true) enrichment.isHosting = true;

    if (enrichment.isVPN && !enrichment.vpnService) {
      enrichment.vpnService = op.name || net.provider || "Unknown VPN";
    }

    if (!enrichment.asn && net.asn) enrichment.asn = net.asn;
    if (!enrichment.isp && net.provider) enrichment.isp = net.provider;

    if (!enrichment.country && (loc.country || loc.country_name)) {
      enrichment.country = loc.country || loc.country_name;
    }

    if (typeof ipResult.risk === "number") enrichment.riskScore = ipResult.risk;

    if (typeof det.confidence === "number") enrichment.confidence = det.confidence;
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
      if (allowedSources.includes("virustotal")) sourcePromises.push(checkVTResolutions(ctx, ip, "ip", apiKeys.virustotal ?? ""));
      if (allowedSources.includes("circl_pdns")) sourcePromises.push(checkCIRCLPDNS(ctx, ip, apiKeys.circl_pdns ?? ""));
      if (allowedSources.includes("mnemonic_pdns")) sourcePromises.push(checkMnemonicPDNS(ctx, ip));
      if (allowedSources.includes("censys")) sourcePromises.push(checkCensys(ctx, ip, apiKeys.censys ?? ""));

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const ipapi = results.find(r => r.source === "ipapi")?.data as any;
      const asn = ipapi?.as;
      const org = ipapi?.org;
      const vpnCheck = await checkVPNProvider(asn, org);
      results.push(vpnCheck);

      const pdnsRecords = aggregatePDNS(results);

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

      const legacyScore = Math.min(Math.max(avgScore, hasMaliciousHit ? 50 : 0) + threatBoost, 100);

      const aggregated = {
        ip,
        enrichment,
        overallThreatScore: legacyScore,
        scoring: computeCalibratedScoring(results, legacyScore, enrichment),
        maxThreatScore: maxScore,
        isMalicious: hasMaliciousHit || maxScore > 50,
        sources: normalizedSources,
        detectionSources,
        detectionConfidence: enrichment.isTor ? "high" : enrichment.isVPN ? "high" : enrichment.isProxy ? "medium" : "low",
        vtResolutions: (normalizedSources["virustotal_resolutions"] as any)?.data ?? null,
        pdns: pdnsRecords,
        checkedAt: new Date().toISOString(),
        tier: ctx.tier,
        sourcesAvailable: allowedSources,
      };

      if (canPersist) {
        await serviceClient.from("ip_lookups").insert({
          ip_address: ip,
          // was `aggregated.results`, a key the IP aggregate never had — the
          // column persisted null for every IP lookup. Store the full aggregate
          // (same as domain/hash) so server-side consumers (ioc-verdict) can
          // load the evidence.
          results: aggregated,
          threat_score: aggregated.overallThreatScore,
          sources_checked: results.map(r => r.source),
          user_id: ctx.userId,
          context: ctx.cacheContext,
        });

        savePDNSEdges(pdnsRecords).catch(e => console.error("ip savePDNSEdges:", e));
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
      if (allowedSources.includes("phishtank")) sourcePromises.push(checkPhishTank(ctx, targetUrl));
      if (allowedSources.includes("openphish")) sourcePromises.push(checkOpenPhish(ctx, targetUrl));
      if (allowedSources.includes("google_safebrowsing")) sourcePromises.push(checkGoogleSafeBrowsing(ctx, targetUrl, apiKeys.google_safebrowsing ?? ""));
      try {
        const urlDomain = new URL(targetUrl).hostname;
        if (allowedSources.includes("tranco")) sourcePromises.push(checkTrancoRank(ctx, urlDomain));
      } catch (_) {}

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const isMalicious = results.some(r => r.isMalicious);
      const threatTypes: string[] = [];
      if (results.find(r => r.source === "urlhaus_url")?.isMalicious) threatTypes.push("malware");
      if (results.find(r => r.source === "phishtank")?.isMalicious) threatTypes.push("phishing");
      if (results.find(r => r.source === "openphish")?.isMalicious) threatTypes.push("phishing");
      if (results.find(r => r.source === "google_safebrowsing")?.isMalicious) {
        const sbMatches = (results.find(r => r.source === "google_safebrowsing")?.data as any)?.matches ?? [];
        for (const m of sbMatches) {
          if (m.threatType === "MALWARE" && !threatTypes.includes("malware")) threatTypes.push("malware");
          if (m.threatType === "SOCIAL_ENGINEERING" && !threatTypes.includes("phishing")) threatTypes.push("phishing");
          if (m.threatType === "UNWANTED_SOFTWARE" && !threatTypes.includes("unwanted_software")) threatTypes.push("unwanted_software");
        }
      }

      // URL lookups historically had NO numeric score (only the boolean) —
      // calibrated scoring is the first score this endpoint has ever returned
      const urlScoring = computeCalibratedScoring(results, null);

      const aggregated = {
        url: targetUrl,
        isMalicious,
        threatTypes,
        scoring: urlScoring,
        overallThreatScore: urlScoring.calibrated,
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
          phishtank: true,
          openphish: true,
          tranco: true,
          google_safebrowsing: ctx.tier === "dsbn" ? !!orgKeys.google_safebrowsing : !!apiKeysResult.keys.google_safebrowsing,
          // Phase 1
          nvd: true,
          cisa_kev: true,
          epss: true,
          blockchain_info: true,
          ethplorer: true,
          emailrep: true,
          email_dns: true,
          hibp: ctx.tier === "dsbn" ? !!orgKeys.hibp : !!apiKeysResult.keys.hibp,
          misttrack: ctx.tier === "dsbn" ? !!orgKeys.misttrack : !!apiKeysResult.keys.misttrack,
          // Phase 2
          circl_pdns: true,
          mnemonic_pdns: true,
          crtsh: true,
          securitytrails: ctx.tier === "dsbn" ? !!orgKeys.securitytrails : !!apiKeysResult.keys.securitytrails,
          censys: ctx.tier === "dsbn" ? !!orgKeys.censys : !!apiKeysResult.keys.censys,
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

      const hashLegacyScore = Math.max(avgScore, maxScore);

      const aggregated = {
        hash,
        isMalicious,
        overallThreatScore: hashLegacyScore,
        scoring: computeCalibratedScoring(results, hashLegacyScore),
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

    if (path === "/domain" || path === "/domain/") {
      const body = await req.json();
      const domain = body.domain?.trim().toLowerCase();
      if (!domain) {
        return new Response(JSON.stringify({ error: "Domain required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sourcePromises: Promise<ThreatResult>[] = [];

      sourcePromises.push(checkDomainWHOIS(ctx, domain));
      if (allowedSources.includes("virustotal")) sourcePromises.push(checkVirusTotalDomain(ctx, domain, apiKeys.virustotal ?? ""));
      if (allowedSources.includes("urlhaus")) sourcePromises.push(checkURLhausURL(ctx, `http://${domain}`));
      if (allowedSources.includes("alienvault")) sourcePromises.push(checkAlienVaultOTX(ctx, domain, apiKeys.alienvault ?? ""));
      if (allowedSources.includes("tranco")) sourcePromises.push(checkTrancoRank(ctx, domain));
      if (allowedSources.includes("virustotal")) sourcePromises.push(checkVTResolutions(ctx, domain, "domain", apiKeys.virustotal ?? ""));
      if (allowedSources.includes("circl_pdns")) sourcePromises.push(checkCIRCLPDNS(ctx, domain, apiKeys.circl_pdns ?? ""));
      if (allowedSources.includes("mnemonic_pdns")) sourcePromises.push(checkMnemonicPDNS(ctx, domain));
      if (allowedSources.includes("securitytrails")) sourcePromises.push(checkSecurityTrailsPDNS(ctx, domain, apiKeys.securitytrails ?? ""));
      if (allowedSources.includes("crtsh")) sourcePromises.push(checkCrtSh(ctx, domain));

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const pdnsRecords = aggregatePDNS(results);
      const crtshResult = results.find(r => r.source === "crtsh")?.data as any;
      const certSubdomains: string[] = crtshResult?.subdomains ?? [];

      const isMalicious = results.some(r => r.isMalicious);
      const scores = results.filter(r => r.threatScore !== undefined).map(r => r.threatScore!);
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

      const whoisData = results.find(r => r.source === "whois")?.data as any;
      const vtData = results.find(r => r.source === "virustotal")?.data as any;

      const normalizedSources: Record<string, any> = {};
      for (const r of results) {
        normalizedSources[r.source] = {
          found: !r.error && r.data && Object.keys(r.data).length > 0,
          malicious: r.isMalicious ?? false,
          details: r.data,
          error: r.error,
          threatScore: r.threatScore
        };
      }

      const domainLegacyScore = Math.max(avgScore, maxScore);

      const aggregated = {
        domain,
        isMalicious,
        overallThreatScore: domainLegacyScore,
        scoring: computeCalibratedScoring(results, domainLegacyScore),
        maxThreatScore: maxScore,
        sources: normalizedSources,
        whois: whoisData?.parsed || null,
        reputation: vtData?.data?.attributes?.reputation || null,
        categories: vtData?.data?.attributes?.categories || null,
        tranco: results.find(r => r.source === "tranco")?.data ?? null,
        vtResolutions: (normalizedSources["virustotal_resolutions"] as any)?.data ?? null,
        pdns: pdnsRecords,
        certSubdomains,
        checkedAt: new Date().toISOString(),
        tier: ctx.tier,
        sourcesAvailable: allowedSources,
      };

      if (canPersist) {
        await serviceClient.from("domain_lookups").insert({
          domain,
          results: aggregated,
          is_malicious: isMalicious,
          threat_score: aggregated.overallThreatScore,
          sources_checked: results.map(r => r.source),
          user_id: ctx.userId,
          context: ctx.cacheContext,
        });

        savePDNSEdges(pdnsRecords).catch(e => console.error("domain savePDNSEdges:", e));
        saveCertEdges(domain, certSubdomains).catch(e => console.error("domain saveCertEdges:", e));
        await logAuditEvent(req, ctx, "domain_lookup", "domain", domain, { sources: results.map(r => r.source), is_malicious: isMalicious, threat_score: aggregated.overallThreatScore });
      }

      return new Response(JSON.stringify(aggregated), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/cve" || path === "/cve/") {
      const body = await req.json();
      const cveId = (body.cve ?? "").trim().toUpperCase();
      if (!cveId || !/^CVE-\d{4}-\d{4,}$/.test(cveId)) {
        return new Response(JSON.stringify({ error: "Valid CVE ID required (e.g. CVE-2021-44228)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sourcePromises: Promise<ThreatResult>[] = [
        checkNVD(ctx, cveId, apiKeys.nvd ?? ""),
        checkCISAKEV(ctx, cveId),
        checkEPSS(ctx, cveId),
      ];

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const nvdResult = results.find(r => r.source === "nvd") ?? { source: "nvd", data: {} };
      const kevResult = results.find(r => r.source === "cisa_kev") ?? { source: "cisa_kev", data: {} };
      const epssResult = results.find(r => r.source === "epss") ?? { source: "epss", data: {} };

      const unified = parseCVEUnified(nvdResult, kevResult, epssResult);
      const isKEV = unified.is_kev;
      const cvssScore = unified.cvss_v3_score ?? unified.cvss_v2_score ?? 0;

      const aggregated = {
        cve_id: cveId,
        ...unified,
        is_malicious: isKEV || cvssScore >= 9.0,
        overall_threat_score: Math.min(
          Math.round(
            (cvssScore / 10) * 60 +
            (isKEV ? 30 : 0) +
            ((unified.epss_score ?? 0) * 10)
          ),
          100
        ),
        sources: Object.fromEntries(results.map(r => [r.source, { data: r.data, error: r.error }])),
        checked_at: new Date().toISOString(),
        tier: ctx.tier,
      };

      if (canPersist) {
        await serviceClient.from("cve_lookups").insert({
          cve_id: cveId,
          results: aggregated,
          cvss_v3_score: unified.cvss_v3_score,
          is_kev: isKEV,
          epss_score: unified.epss_score,
          sources_checked: results.map(r => r.source),
          user_id: ctx.userId,
          context: ctx.cacheContext,
        });
        await logAuditEvent(req, ctx, "cve_lookup", "cve", cveId, { is_kev: isKEV, cvss_v3_score: unified.cvss_v3_score });
      }

      return new Response(JSON.stringify(aggregated), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/wallet" || path === "/wallet/") {
      const body = await req.json();
      const address = (body.address ?? "").trim();
      if (!address) {
        return new Response(JSON.stringify({ error: "Wallet address required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const ethRegex = /^0x[a-fA-F0-9]{40}$/;
      const btcRegex = /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[ac-hj-np-z02-9]{6,87}$/;
      const currency = ethRegex.test(address) ? "eth" : btcRegex.test(address) ? "btc" : "unknown";

      if (currency === "unknown") {
        return new Response(JSON.stringify({ error: "Unrecognised wallet address format (expected BTC or ETH)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sourcePromises: Promise<ThreatResult>[] = [];
      if (currency === "btc") {
        if (allowedSources.includes("blockchain_info")) sourcePromises.push(checkBlockchainInfo(ctx, address));
      } else {
        if (allowedSources.includes("ethplorer")) sourcePromises.push(checkEthplorer(ctx, address));
      }
      if (allowedSources.includes("misttrack")) sourcePromises.push(checkMisttrack(ctx, address, apiKeys.misttrack ?? ""));

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const isSanctioned = results.some(r => r.isMalicious);
      const chainData = results.find(r => r.source === "blockchain_info" || r.source === "ethplorer")?.data as any;

      const aggregated = {
        address,
        currency,
        is_sanctioned: isSanctioned,
        balance: currency === "btc" ? chainData?.balance_btc ?? null : chainData?.eth_balance ?? null,
        tx_count: chainData?.tx_count ?? null,
        sources: Object.fromEntries(results.map(r => [r.source, { data: r.data, error: r.error }])),
        checked_at: new Date().toISOString(),
        tier: ctx.tier,
      };

      if (canPersist) {
        await serviceClient.from("wallet_lookups").insert({
          address,
          currency,
          results: aggregated,
          is_sanctioned: isSanctioned,
          sources_checked: results.map(r => r.source),
          user_id: ctx.userId,
          context: ctx.cacheContext,
        });
        await logAuditEvent(req, ctx, "wallet_lookup", "wallet", address, { currency, is_sanctioned: isSanctioned });
      }

      return new Response(JSON.stringify(aggregated), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/email" || path === "/email/") {
      const body = await req.json();
      const email = (body.email ?? "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ error: "Valid email address required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sourcePromises: Promise<ThreatResult>[] = [
        checkEmailDNS(ctx, email),
      ];
      if (allowedSources.includes("emailrep")) sourcePromises.push(checkEmailRep(ctx, email));
      if (allowedSources.includes("hibp")) sourcePromises.push(checkHIBP(ctx, email, apiKeys.hibp ?? ""));

      const settledResults = await Promise.allSettled(sourcePromises);
      const results: ThreatResult[] = settledResults
        .filter((r): r is PromiseFulfilledResult<ThreatResult> => r.status === "fulfilled")
        .map(r => r.value);

      const emailRepData = results.find(r => r.source === "emailrep")?.data as any;
      const dnsData = results.find(r => r.source === "email_dns")?.data as any;
      const hibpData = results.find(r => r.source === "hibp")?.data as any;

      const isBreached = (hibpData?.breach_count ?? 0) > 0;
      const isSuspicious = emailRepData?.suspicious === true;
      const reputation = emailRepData?.reputation ?? null;
      const hasValidMX = dnsData?.has_mx === true;

      const aggregated = {
        email,
        reputation,
        is_suspicious: isSuspicious,
        is_breached: isBreached,
        breach_count: hibpData?.breach_count ?? null,
        has_valid_mx: hasValidMX,
        has_spf: dnsData?.has_spf ?? null,
        has_dmarc: dnsData?.has_dmarc ?? null,
        is_disposable: emailRepData?.details?.disposable ?? null,
        is_free_provider: emailRepData?.details?.free_provider ?? null,
        sources: Object.fromEntries(results.map(r => [r.source, { data: r.data, error: r.error }])),
        checked_at: new Date().toISOString(),
        tier: ctx.tier,
      };

      if (canPersist) {
        await serviceClient.from("email_lookups").insert({
          email,
          results: aggregated,
          reputation,
          is_breached: isBreached,
          has_valid_mx: hasValidMX,
          sources_checked: results.map(r => r.source),
          user_id: ctx.userId,
          context: ctx.cacheContext,
        });
        await logAuditEvent(req, ctx, "email_lookup", "email", email, { reputation, is_breached: isBreached });
      }

      return new Response(JSON.stringify(aggregated), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found", availableEndpoints: ["/ip", "/url", "/bulk", "/hash", "/domain", "/cve", "/wallet", "/email", "/config"] }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
