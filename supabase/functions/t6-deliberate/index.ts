// T6 Deliberation Engine
//
// Stateless deliberation round for ThamOS X Maestro.
// Receives the council's Round 1 responses, dispatches each agent to critique
// the others (identities redacted as Voice A/B/C), returns structured pushbacks.
//
// Adapted from Maestro PRO-01 deliberate function.
// No DB reads/writes — all state lives in the calling frontend.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const PROVIDER_KEY_MAP: Record<string, string> = {
  openai: "openai_key",
  anthropic: "anthropic_key",
  google: "gemini_key",
  openrouter: "openrouter_key",
};

const PER_AGENT_TIMEOUT_MS = 45_000;
const DELIBERATION_MAX_TOKENS = 1024;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CouncilResponse {
  id: string;
  agent_name: string;
  provider: string;
  model: string;
  content: string;
}

interface DeliberateRequest {
  prompt: string;
  responses: CouncilResponse[];
  // Optional: per-agent persona voice preambles (agent_name → preamble string)
  personas?: Record<string, string>;
}

interface DeliberationOutput {
  objection?: { target_voice: string; point: string; rationale: string };
  agreement?: { target_voice: string; point: string; why_i_missed_it: string };
  self_critique?: { weakness: string; rationale: string };
  raw_text?: string;
}

interface DeliberationResult {
  source_id: string;
  agent_name: string;
  provider: string;
  model: string;
  objection?: DeliberationOutput["objection"];
  agreement?: DeliberationOutput["agreement"];
  self_critique?: DeliberationOutput["self_critique"];
  parse_failed: boolean;
  skipped?: boolean;
  error?: string;
  tokens_used: number;
}

// ─── Auth & Key Management ────────────────────────────────────────────────────

async function deriveEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode("thamos6-api-key-encryption"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
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
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
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

// ─── Voice Redaction ──────────────────────────────────────────────────────────

function indexToLabel(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i);
  return String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}

function collectIdentityTokens(row: CouncilResponse): string[] {
  const tokens = new Set<string>();
  if (row.agent_name) {
    tokens.add(row.agent_name);
    for (const part of row.agent_name.split(/[\s\-]+/)) {
      if (part.length >= 3) tokens.add(part);
    }
  }
  if (row.provider) tokens.add(row.provider);
  if (row.model) {
    tokens.add(row.model);
    for (const part of row.model.split(/[\-/.]/)) {
      if (part.length >= 3) tokens.add(part);
    }
  }
  for (const word of [
    "claude", "anthropic", "sonnet", "opus", "haiku",
    "gpt", "openai", "gpt-5", "gpt-4",
    "gemini", "google", "kimi", "llama", "meta", "mistral", "qwen", "grok",
  ]) {
    tokens.add(word);
  }
  return [...tokens];
}

function redactContent(content: string, row: CouncilResponse): string {
  let working = content;
  for (const token of collectIdentityTokens(row)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    working = working.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "—");
  }
  working = working.replace(
    /^(\s*)(as|speaking as|i am|from|writing as|representing)\s+[—\w][\w\s\-]{0,40}?(perspective|side|viewpoint|model|agent)?[,:.]/gim,
    "$1",
  );
  return working.replace(/^\s+/gm, "").trim();
}

interface VoiceEntry { label: string; id: string; agent_name: string }

function buildVoiceMap(all: CouncilResponse[], focusId: string): VoiceEntry[] {
  return all
    .filter(r => r.id !== focusId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row, i) => ({ label: indexToLabel(i), id: row.id, agent_name: row.agent_name }));
}

// ─── Deliberation Prompt ──────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are a security analyst council member deliberating on a question. The council has just delivered independent Round 1 analyses. Now you will see your own response (attributed) plus the other voices (anonymized as Voice A, Voice B, etc.) so you can critique ideas — not sources.

Answer THREE structured questions. Be specific. Reference voices by letter. Vague answers are useless. Disagreement is valued. Do not soften objections for politeness.

Output strictly as JSON. No prose outside the JSON. No markdown fences.`;

function buildSystemPrompt(personaVoice?: string): string {
  if (!personaVoice) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nYour analytical persona: ${personaVoice}`;
}

function buildUserMessage(
  originalPrompt: string,
  own: CouncilResponse,
  others: Array<{ label: string; redacted: string }>,
): string {
  const otherVoices = others.map(o => `─── VOICE ${o.label} ───\n${o.redacted}\n`).join("\n");

  return `ORIGINAL QUESTION THE COUNCIL ANSWERED:
${originalPrompt}

YOUR ROUND 1 RESPONSE:
${own.content}

OTHER VOICES (anonymized):

${otherVoices}

──────────────────────────────────────────────

Answer THREE questions:

QUESTION 1 — STRONGEST OBJECTION
Pick a voice (A/B/C/...) and identify the most important flaw in their position. Be specific about the claim. Pick the one most likely to change a decision-maker's assessment.

QUESTION 2 — GENUINE AGREEMENT
Identify ONE point another voice made that you wish YOU had said. Only flag it if you think it is correct AND your response missed it. Not flattery — only real omissions.

QUESTION 3 — SELF-CRITIQUE
What is the strongest objection a careful critic would raise against your own Round 1 response? You must identify a real weakness. "No significant weakness" is not acceptable.

OUTPUT FORMAT (strict JSON, no markdown, no commentary):
{
  "objection": {
    "target_voice": "A",
    "point": "the specific claim being objected to",
    "rationale": "why this point is wrong or weak"
  },
  "agreement": {
    "target_voice": "B",
    "point": "the specific point acknowledged",
    "why_i_missed_it": "why my Round 1 response did not include this"
  },
  "self_critique": {
    "weakness": "the strongest objection to my own Round 1 response",
    "rationale": "why this is a real weakness"
  }
}`;
}

function parseDeliberationOutput(raw: string): DeliberationOutput {
  const t = raw.trim();

  const tryParse = (s: string): DeliberationOutput | null => {
    try {
      const obj = JSON.parse(s) as Record<string, unknown>;
      const out: DeliberationOutput = {};
      const isObj = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
      const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : fb);
      const normalizeLabel = (v: unknown): string =>
        (typeof v === "string" ? v.trim().toUpperCase().replace(/^VOICE\s+/i, "") : "");

      if (isObj(obj.objection)) {
        out.objection = {
          target_voice: normalizeLabel(obj.objection.target_voice),
          point: str(obj.objection.point),
          rationale: str(obj.objection.rationale),
        };
      }
      if (isObj(obj.agreement)) {
        out.agreement = {
          target_voice: normalizeLabel(obj.agreement.target_voice),
          point: str(obj.agreement.point),
          why_i_missed_it: str(obj.agreement.why_i_missed_it),
        };
      }
      if (isObj(obj.self_critique)) {
        out.self_critique = {
          weakness: str(obj.self_critique.weakness),
          rationale: str(obj.self_critique.rationale),
        };
      }
      if (!out.objection && !out.agreement && !out.self_critique) return null;
      return out;
    } catch {
      return null;
    }
  };

  const direct = tryParse(t);
  if (direct) return direct;

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) { const f = tryParse(fence[1].trim()); if (f) return f; }

  const bs = t.indexOf("{"), be = t.lastIndexOf("}");
  if (bs >= 0 && be > bs) { const b = tryParse(t.slice(bs, be + 1)); if (b) return b; }

  return { raw_text: t };
}

// ─── Provider Dispatch ────────────────────────────────────────────────────────

async function callAnthropic(
  apiKey: string, agent: CouncilResponse, systemPrompt: string, userMessage: string,
): Promise<{ output: DeliberationOutput; tokens_used: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_AGENT_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: agent.model, max_tokens: DELIBERATION_MAX_TOKENS,
        system: systemPrompt, messages: [{ role: "user", content: userMessage }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`anthropic_${res.status}`);
    const d = await res.json();
    const raw = d.content?.[0]?.text ?? "";
    const tokens_used = (d.usage?.input_tokens ?? 0) + (d.usage?.output_tokens ?? 0);
    return { output: parseDeliberationOutput(raw), tokens_used };
  } finally { clearTimeout(timer); }
}

async function callOpenAI(
  apiKey: string, agent: CouncilResponse, systemPrompt: string, userMessage: string,
): Promise<{ output: DeliberationOutput; tokens_used: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_AGENT_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: agent.model, max_tokens: DELIBERATION_MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`openai_${res.status}`);
    const d = await res.json();
    const raw = d.choices?.[0]?.message?.content ?? "";
    const tokens_used = d.usage?.total_tokens ?? 0;
    return { output: parseDeliberationOutput(raw), tokens_used };
  } finally { clearTimeout(timer); }
}

async function callGoogle(
  apiKey: string, agent: CouncilResponse, systemPrompt: string, userMessage: string,
): Promise<{ output: DeliberationOutput; tokens_used: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_AGENT_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${agent.model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: DELIBERATION_MAX_TOKENS, temperature: 0.5 },
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) throw new Error(`google_${res.status}`);
    const d = await res.json();
    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const tokens_used = d.usageMetadata?.totalTokenCount ?? 0;
    return { output: parseDeliberationOutput(raw), tokens_used };
  } finally { clearTimeout(timer); }
}

async function callOpenRouter(
  apiKey: string, agent: CouncilResponse, systemPrompt: string, userMessage: string,
): Promise<{ output: DeliberationOutput; tokens_used: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_AGENT_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://t6.thamos.ca", "X-Title": "ThamOS T6",
      },
      body: JSON.stringify({
        model: agent.model, max_tokens: DELIBERATION_MAX_TOKENS,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`openrouter_${res.status}`);
    const d = await res.json();
    const raw = d.choices?.[0]?.message?.content ?? "";
    const tokens_used = d.usage?.total_tokens ?? 0;
    return { output: parseDeliberationOutput(raw), tokens_used };
  } finally { clearTimeout(timer); }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const user = await verifyUser(req);
    if (!user) return json({ error: "Authentication required" }, 401);

    const body: DeliberateRequest = await req.json();
    const { prompt, responses, personas = {} } = body;

    if (!prompt || !Array.isArray(responses) || responses.length < 3) {
      return json({ error: "Deliberation requires a prompt and at least 3 council responses." }, 400);
    }

    // Fetch all provider keys the user has upfront (parallel)
    const [anthropicKey, openaiKey, googleKey, openrouterKey] = await Promise.all([
      getUserApiKey(user.userId, "anthropic_key"),
      getUserApiKey(user.userId, "openai_key"),
      getUserApiKey(user.userId, "gemini_key"),
      getUserApiKey(user.userId, "openrouter_key"),
    ]);

    const keyMap: Record<string, string | null> = {
      anthropic: anthropicKey, openai: openaiKey, google: googleKey, openrouter: openrouterKey,
    };

    // Dispatch each agent's deliberation in parallel
    const dispatches = responses.map(async (agent): Promise<DeliberationResult> => {
      const apiKey = keyMap[agent.provider.toLowerCase()];
      if (!apiKey) {
        return {
          source_id: agent.id, agent_name: agent.agent_name, provider: agent.provider,
          model: agent.model, parse_failed: false, skipped: true,
          error: `no_key_for_${agent.provider}`, tokens_used: 0,
        };
      }

      const voiceMap = buildVoiceMap(responses, agent.id);
      const others = responses
        .filter(r => r.id !== agent.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((row, i) => ({ label: indexToLabel(i), redacted: redactContent(row.content, row) }));

      const systemPrompt = buildSystemPrompt(personas[agent.agent_name]);
      const userMessage = buildUserMessage(prompt, agent, others);

      try {
        let result: { output: DeliberationOutput; tokens_used: number };

        switch (agent.provider.toLowerCase()) {
          case "anthropic": result = await callAnthropic(apiKey, agent, systemPrompt, userMessage); break;
          case "openai": result = await callOpenAI(apiKey, agent, systemPrompt, userMessage); break;
          case "google": result = await callGoogle(apiKey, agent, systemPrompt, userMessage); break;
          case "openrouter": result = await callOpenRouter(apiKey, agent, systemPrompt, userMessage); break;
          default:
            return {
              source_id: agent.id, agent_name: agent.agent_name, provider: agent.provider,
              model: agent.model, parse_failed: false, skipped: true,
              error: `unsupported_provider_${agent.provider}`, tokens_used: 0,
            };
        }

        // Resolve voice labels to agent names for the frontend
        const resolveLabel = (label: string): string =>
          voiceMap.find(e => e.label === label.toUpperCase().replace(/^VOICE\s+/, ""))?.agent_name ?? label;

        return {
          source_id: agent.id,
          agent_name: agent.agent_name,
          provider: agent.provider,
          model: agent.model,
          objection: result.output.objection ? {
            ...result.output.objection,
            target_agent_name: resolveLabel(result.output.objection.target_voice),
          } as DeliberationOutput["objection"] & { target_agent_name: string } : undefined,
          agreement: result.output.agreement ? {
            ...result.output.agreement,
            target_agent_name: resolveLabel(result.output.agreement.target_voice),
          } as DeliberationOutput["agreement"] & { target_agent_name: string } : undefined,
          self_critique: result.output.self_critique,
          parse_failed: !result.output.objection && !result.output.agreement && !result.output.self_critique,
          tokens_used: result.tokens_used,
        };
      } catch (err) {
        return {
          source_id: agent.id, agent_name: agent.agent_name, provider: agent.provider,
          model: agent.model, parse_failed: true,
          error: err instanceof Error ? err.message : String(err), tokens_used: 0,
        };
      }
    });

    const results = await Promise.all(dispatches);

    return json({
      deliberations: results,
      stats: {
        total: results.length,
        successful: results.filter(r => !r.error && !r.skipped && !r.parse_failed).length,
        skipped: results.filter(r => r.skipped).length,
        errored: results.filter(r => r.error && !r.skipped).length,
      },
    });
  } catch (err) {
    console.error("[t6-deliberate] error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
