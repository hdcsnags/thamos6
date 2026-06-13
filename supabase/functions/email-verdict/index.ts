// email-verdict — server-side THAMOS verdict for analyzed emails.
//
// Same trust model as extension-verdict: the client supplies only the raw
// artifact (the .eml/message source); ALL derived signals — Defender header
// intelligence, MIME decode, SafeLink unwrapping, base64 artifact decoding,
// header cross-checks — are recomputed server-side by _shared/email-parser.ts,
// so the model is grounded in evidence the client cannot tamper with.
// Client-supplied threat-intel enrichment is accepted but labeled as such.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseEmail } from "../_shared/email-parser.ts";

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

const MAX_RAW_EMAIL_BYTES = 5 * 1024 * 1024;
const MAX_BODY_CHARS = 9_000;
const MAX_ENRICHMENT_CHARS = 8_000;

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

// --- main ---

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
      raw_email,
      enrichment = null,
      provider = "anthropic",
      model = "claude-sonnet-4-20250514",
    } = await req.json();

    if (!raw_email || typeof raw_email !== "string") {
      return json({ error: "raw_email (full message source) is required" }, 400);
    }
    if (raw_email.length > MAX_RAW_EMAIL_BYTES) {
      return json({ error: "Email too large (max 5MB)" }, 413);
    }

    const service = PROVIDER_SERVICE_MAP[provider];
    if (!service) {
      return json({ error: `Unsupported provider: ${provider}` }, 400);
    }
    const apiKey = await getUserApiKey(user.userId, service);
    if (!apiKey) {
      return json({ error: `No API key configured for ${provider}. Go to Settings > API Keys to add one.` }, 400);
    }

    // Server-side truth: re-derive everything from the raw artifact
    const parsed = parseEmail(raw_email);

    const defenderStr = parsed.defender.signals.length > 0
      ? parsed.defender.signals.map(s => `[${s.severity.toUpperCase()}] ${s.key}=${s.value} — ${s.meaning}`).join("\n")
      : "No Defender/EOP headers present (message may not have transited Microsoft 365).";

    const hopsStr = parsed.hops.map((h, i) =>
      `${i + 1}. from ${h.from} by ${h.by} with ${h.with} at ${h.timestamp}`
    ).join("\n") || "None";

    const urlsStr = parsed.urls.slice(0, 20).map(u => {
      const bits = [`URL: ${u.original.slice(0, 200)}`];
      if (u.wrapper) bits.push(`  wrapper: ${u.wrapper} → real destination: ${u.final.slice(0, 200)} (host: ${u.finalHost})`);
      for (const a of u.decodedArtifacts) {
        bits.push(`  base64 token "${a.token.slice(0, 60)}" decodes to [${a.kind}] ${a.decoded.slice(0, 120)}`);
      }
      return bits.join("\n");
    }).join("\n") || "None";

    const indicatorsStr = parsed.suspiciousIndicators.map(i => `- ${i}`).join("\n") || "None";
    const bodyFindingsStr = parsed.bodyFindings.map(f => `- ${f}`).join("\n") || "None";

    let enrichmentStr = "Not provided";
    if (enrichment) {
      try {
        enrichmentStr = JSON.stringify(enrichment).slice(0, MAX_ENRICHMENT_CHARS);
      } catch { /* keep default */ }
    }

    const systemPrompt = `You are a senior email-threat analyst inside Thamos6 performing defensive analysis of a message an analyst received and uploaded. You are given server-parsed evidence: full header intelligence (including Microsoft Defender/EOP verdict headers), the MIME-decoded body, unwrapped URLs, and base64 artifacts decoded from URL components.

Your job is to produce a calibrated verdict GROUNDED IN THE SUPPLIED EVIDENCE. For each automated signal, CONFIRM or REFUTE it against the actual headers/body before accepting it. Authentication results are frequently misleading: spf=pass from a compromised third-party relay proves nothing about the From identity; dmarc=bestguesspass is a guess, not verification. Conversely, a clean SCL/CAT does not clear a message — Defender misses well-crafted BEC/AITM phish. Weigh header contradictions (authenticated sender vs From, spoofed HELO), social-engineering content (fake trust banners, urgency), and URL evidence (credential-harvest hosts, victim identity embedded base64) above raw filter scores.

Do not invent evidence. Cite the specific header, body text, or URL for every claim. If evidence is insufficient for a signal, say UNCERTAIN rather than guessing. Return only valid JSON matching the requested schema.`;

    const prompt = `Analyze this email and return a calibrated analyst verdict as JSON.

MESSAGE METADATA:
From: ${parsed.from}
To: ${parsed.to}
Reply-To: ${parsed.replyTo || "(none)"}
Return-Path: ${parsed.returnPath || "(none)"}
Subject: ${parsed.subject}
Date: ${parsed.date}
Message-ID: ${parsed.messageId}
Origin IP (innermost public Received): ${parsed.originIP ?? "unknown"}

DEFENDER / EOP VERDICT HEADERS (computed by Microsoft before delivery):
${defenderStr}

HEADER CROSS-CHECK INDICATORS (server-derived):
${indicatorsStr}

DELIVERY PATH (oldest hop first):
${hopsStr}

URLS (unwrapped server-side; base64 URL components decoded):
${urlsStr}

EXTRACTED IOCS:
Domains: ${parsed.domains.join(", ") || "none"}
IPs: ${parsed.ips.join(", ") || "none"}
Email addresses seen: ${parsed.emails.join(", ") || "none"}

BODY FINDINGS (server-derived):
${bodyFindingsStr}

DECODED BODY TEXT (MIME/base64 decoded, HTML stripped, truncated):
${parsed.bodyText.slice(0, MAX_BODY_CHARS)}

THREAT-INTEL ENRICHMENT (client-supplied, treat as secondary evidence):
${enrichmentStr}

Return ONLY valid JSON — no markdown, no prose:
{
  "verdict": "PHISHING" | "SUSPICIOUS" | "SPAM" | "LEGITIMATE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "attack_type": "AITM_CREDENTIAL_PHISH" | "BEC" | "MALWARE_DELIVERY" | "GENERIC_PHISH" | "SPAM" | "NONE" | "OTHER",
  "recommended_action": "BLOCK_AND_PURGE" | "QUARANTINE" | "INVESTIGATE" | "DELIVER",
  "headline": "<one sentence: what this email actually is>",
  "signal_assessments": [
    {
      "signal": "<the automated signal or indicator being verified>",
      "assessment": "CONFIRMED" | "REFUTED" | "UNCERTAIN",
      "reasoning": "<one sentence citing the specific evidence>"
    }
  ],
  "misleading_signals": [
    "<any signal that LOOKS reassuring but is not (e.g. 'SPF pass — but from a compromised relay'), or empty array>"
  ],
  "kill_chain": ["<step-by-step reconstruction of the attack, if any>"],
  "iocs_to_block": [
    { "type": "url" | "domain" | "ip" | "email", "value": "<ioc>", "reason": "<why>" }
  ],
  "victim_context": {
    "targeted_recipient": "<who>",
    "identity_prefill": "<base64-embedded identity if present, else null>"
  },
  "recommendation": "<1-2 sentences for the analyst>",
  "analyst_next_steps": ["<concrete next step>"]
}`;

    const content = provider === "anthropic"
      ? await callAnthropic(apiKey, model, prompt, systemPrompt, 3500)
      : await callOpenAI(apiKey, model, prompt, systemPrompt, 3500);

    const jsonStr = content.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    let parsedVerdict: Record<string, unknown>;
    try {
      parsedVerdict = JSON.parse(jsonStr);
    } catch {
      return json({ error: "AI returned unparseable verdict", raw: content.slice(0, 500) }, 502);
    }

    const { data: saved, error: saveError } = await serviceClient
      .from("email_verdicts")
      .insert({
        message_id: parsed.messageId.slice(0, 500),
        subject: parsed.subject.slice(0, 500),
        from_address: parsed.from.slice(0, 500),
        verdict: (parsedVerdict.verdict as string) || "",
        confidence: (parsedVerdict.confidence as string) || "",
        verdict_data: parsedVerdict,
        provider,
        model,
        raw_size_bytes: raw_email.length,
        created_by: user.userId,
      })
      .select("id, created_at")
      .single();

    if (saveError) console.error("Failed to persist email verdict:", saveError);

    return json({
      verdict: parsedVerdict,
      verdict_id: saved?.id ?? null,
      created_at: saved?.created_at ?? null,
    });
  } catch (error) {
    console.error("email-verdict error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
