// ioc-verdict — server-side THAMOS verdict for IOC lookups (ip/domain/url/hash).
//
// Same trust model as extension-verdict: the client sends only the IOC
// identity; this function loads the latest PERSISTED lookup row from the DB
// (ip_lookups / domain_lookups / url_lookups / hash_lookups), so the model is
// grounded in the per-source raw results the server recorded — not whatever
// the client claims. The model's job is to verify each source signal and to
// say explicitly when the heuristic score is misleading (the known failure
// modes: VT dilution, Spamhaus-PBL inflation, VPN/Tor boosts, OTX pulse
// counts, ignored Tranco reputation).

import { createClient } from "npm:@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const PROVIDER_SERVICE_MAP: Record<string, string> = {
  openai: "openai_key",
  anthropic: "anthropic_key",
};

const LOOKUP_TABLES: Record<string, { table: string; column: string }> = {
  ip: { table: "ip_lookups", column: "ip_address" },
  domain: { table: "domain_lookups", column: "domain" },
  url: { table: "url_lookups", column: "url" },
  hash: { table: "hash_lookups", column: "hash" },
};

const MAX_SOURCE_CHARS = 40_000;

// --- API key handling (same scheme as extension-verdict / ai-chat) ---

async function deriveEncryptionKey(): Promise<CryptoKey> {
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

async function decryptApiKey(encrypted: { iv: string; ciphertext: string }): Promise<string> {
  const key = await deriveEncryptionKey();
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

async function verifyUser(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) return null;
  return { userId: user.id };
}

async function getUserApiKey(userId: string, service: string): Promise<string | null> {
  const { data } = await serviceClient
    .from("user_api_keys")
    .select("encrypted_key, api_key")
    .eq("user_id", userId)
    .eq("service", service)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  if (data.encrypted_key?.iv && data.encrypted_key?.ciphertext) {
    return decryptApiKey(data.encrypted_key);
  }
  return data.api_key || null;
}

async function callAnthropic(
  apiKey: string, model: string, prompt: string, systemPrompt: string, maxTokens: number
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      system: systemPrompt,
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API error: ${await response.text()}`);
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

async function callOpenAI(
  apiKey: string, model: string, prompt: string, systemPrompt: string, maxTokens: number
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Per-source evidence with the noisy payloads trimmed. Keeps the fields an
 * analyst actually pivots on; drops multi-KB blobs (cert chains, full PDNS).
 */
function summarizeSources(lookup: Record<string, unknown>): string {
  const sources = (lookup.sources ?? lookup.results ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  let used = 0;
  for (const [name, raw] of Object.entries(sources)) {
    let str: string;
    try {
      str = JSON.stringify(raw);
    } catch {
      continue;
    }
    if (str.length > 3000) str = str.slice(0, 3000) + "…[truncated]";
    if (used + str.length > MAX_SOURCE_CHARS) break;
    used += str.length;
    out.push(`--- ${name} ---\n${str}`);
  }
  return out.join("\n") || "No per-source data recorded.";
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const user = await verifyUser(req);
    if (!user) return json({ error: "Authentication required" }, 401);

    const {
      lookup_type,
      value,
      provider = "anthropic",
      model = "claude-sonnet-4-20250514",
    } = await req.json();

    const mapping = LOOKUP_TABLES[lookup_type];
    if (!mapping) return json({ error: "lookup_type must be ip | domain | url | hash" }, 400);
    if (!value || typeof value !== "string") return json({ error: "value is required" }, 400);

    const service = PROVIDER_SERVICE_MAP[provider];
    if (!service) return json({ error: `Unsupported provider: ${provider}` }, 400);
    const apiKey = await getUserApiKey(user.userId, service);
    if (!apiKey) {
      return json({ error: `No API key configured for ${provider}. Go to Settings > API Keys to add one.` }, 400);
    }

    // Server-side truth: latest persisted lookup for this IOC
    const { data: row } = await serviceClient
      .from(mapping.table)
      .select("results, threat_score, created_at")
      .eq(mapping.column, lookup_type === "hash" ? value.trim().toLowerCase() : value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row || !row.results) {
      return json({ error: "No persisted lookup found for this IOC — run the lookup first, then ask THAMOS." }, 404);
    }

    const lookup = row.results as Record<string, unknown>;
    const scoring = lookup.scoring as Record<string, unknown> | undefined;
    const enrichment = lookup.enrichment as Record<string, unknown> | undefined;

    const scoringStr = scoring
      ? JSON.stringify(scoring, null, 1)
      : "Not available (lookup predates calibrated scoring — only the legacy score exists).";

    const systemPrompt = `You are a senior threat-intelligence analyst inside Thamos6 reviewing an automated IOC lookup. You are given the raw per-source results (VirusTotal, AbuseIPDB, Spamhaus, GreyNoise, abuse.ch feeds, Tranco, WHOIS, sandbox verdicts, etc.), the legacy heuristic score, and — when present — a calibrated scoring breakdown.

KNOWN FAILURE MODES of the legacy heuristic you must check for and call out explicitly when they apply:
- VirusTotal dilution: legacy divided detections by the full ~75-engine roster, so 8 malicious engines scored ~11/100. Read last_analysis_stats yourself; 3+ malicious engines is a serious signal.
- Spamhaus PBL: legacy treated ANY zone hit as malicious (+60 and +25 boost). PBL is a residential-IP policy list, NOT a threat signal. Only SBL/XBL matter.
- Binary context boosts: legacy added +10 VPN / +15 proxy / +20 Tor / +30 scanner regardless of evidence. Commercial VPN exits and research scanners are usually benign.
- OTX pulses: legacy scored pulse_count × 10. Researchers pulse clean infrastructure constantly.
- Tranco was fetched but never scored: a top-10k domain being "flagged" usually means a compromised page or a false positive, not a malicious domain.

Your job: verify each source's signal against its raw data, weigh independent corroboration, state when either score (legacy OR calibrated) is misleading, and produce a calibrated verdict with plain-language reasoning an analyst can act on. Do not invent evidence; cite the specific source and field for every claim. Return only valid JSON matching the requested schema.`;

    const prompt = `Assess this ${String(lookup_type).toUpperCase()} lookup and return a calibrated analyst verdict as JSON.

IOC: ${value}
LOOKUP TIME: ${lookup.checkedAt ?? row.created_at}
LEGACY HEURISTIC SCORE: ${lookup.overallThreatScore ?? row.threat_score ?? "n/a"} (isMalicious flag: ${lookup.isMalicious ?? "n/a"})

CALIBRATED SCORING BREAKDOWN (server-computed; verify, don't parrot):
${scoringStr}

${enrichment ? `ENRICHMENT CONTEXT:\n${JSON.stringify(enrichment).slice(0, 2500)}\n` : ""}
PER-SOURCE RAW RESULTS:
${summarizeSources(lookup)}

Return ONLY valid JSON — no markdown, no prose:
{
  "verdict": "MALICIOUS" | "SUSPICIOUS" | "LIKELY_BENIGN" | "INCONCLUSIVE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "headline": "<one sentence: what this IOC actually is>",
  "score_assessment": {
    "legacy_score_misleading": true | false,
    "calibrated_score_misleading": true | false,
    "explanation": "<which number should the analyst trust and why, citing the specific failure mode if any>"
  },
  "source_assessments": [
    {
      "source": "<source name>",
      "assessment": "CONFIRMED_SIGNAL" | "FALSE_POSITIVE" | "CONTEXT_ONLY" | "NO_SIGNAL",
      "reasoning": "<one sentence grounded in that source's raw data>"
    }
  ],
  "corroboration": "<how many INDEPENDENT sources actually support maliciousness, and which>",
  "benign_explanations": ["<plausible benign explanation for the signals, if any>"],
  "recommendation": "<1-2 sentences: what should the analyst do>",
  "pivot_suggestions": ["<concrete next pivot, e.g. 'look up resolved domain X', based only on supplied data>"]
}`;

    const content = provider === "anthropic"
      ? await callAnthropic(apiKey, model, prompt, systemPrompt, 3000)
      : await callOpenAI(apiKey, model, prompt, systemPrompt, 3000);

    const jsonStr = content.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return json({ error: "AI returned unparseable verdict", raw: content.slice(0, 500) }, 502);
    }

    const { data: saved, error: saveError } = await serviceClient
      .from("ioc_verdicts")
      .insert({
        lookup_type,
        lookup_value: value.slice(0, 2000),
        verdict: (parsed.verdict as string) || "",
        confidence: (parsed.confidence as string) || "",
        verdict_data: parsed,
        provider,
        model,
        created_by: user.userId,
      })
      .select("id, created_at")
      .single();

    if (saveError) console.error("Failed to persist ioc verdict:", saveError);

    return json({
      verdict: parsed,
      verdict_id: saved?.id ?? null,
      created_at: saved?.created_at ?? null,
    });
  } catch (error) {
    console.error("ioc-verdict error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
