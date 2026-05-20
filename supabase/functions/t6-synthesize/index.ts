// T6 Synthesis Engine
//
// Stateless synthesis for ThamOS X Maestro.
// Classic mode: just the council responses → prose synthesis.
// Deliberation-aware mode: responses + deliberation pushbacks → structured
//   synthesis that preserves tension (consensus / trade_offs /
//   acknowledged_weaknesses / unresolved_tensions / recommendation).
//
// Adapted from Maestro PRO-01 synthesize function.

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface CouncilResponseInput {
  agent_name: string;
  content: string;
}

interface DeliberationInput {
  agent_name: string;
  objection?: { target_voice: string; target_agent_name?: string; point: string; rationale: string };
  agreement?: { target_voice: string; target_agent_name?: string; point: string; why_i_missed_it: string };
  self_critique?: { weakness: string; rationale: string };
  skipped?: boolean;
  parse_failed?: boolean;
}

interface SynthesizeRequest {
  prompt: string;
  responses: CouncilResponseInput[];
  deliberations?: DeliberationInput[];
}

interface TradeOff {
  axis: string;
  side_a: { agent: string; position: string };
  side_b: { agent: string; position: string };
}

interface AcknowledgedWeakness {
  agent: string;
  weakness: string;
}

interface SynthesisOutput {
  content: string;
  consensus?: string;
  trade_offs?: TradeOff[];
  acknowledged_weaknesses?: AcknowledgedWeakness[];
  unresolved_tensions?: string[];
  recommendation?: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function deriveEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode("thamos6-api-key-encryption"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

async function decryptApiKey(encrypted: { iv: string; ciphertext: string }): Promise<string> {
  const key = await deriveEncryptionKey();
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
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

async function getAnthropicKey(userId: string): Promise<string | null> {
  const { data } = await serviceClient
    .from("user_api_keys")
    .select("encrypted_key, api_key")
    .eq("user_id", userId)
    .eq("service", "anthropic_key")
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  if (data.encrypted_key?.iv && data.encrypted_key?.ciphertext) return decryptApiKey(data.encrypted_key);
  return data.api_key || null;
}

// ─── Classic Synthesis ────────────────────────────────────────────────────────

async function synthesizeClassic(
  prompt: string,
  responses: CouncilResponseInput[],
  anthropicKey: string | null,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const responseText = responses.map(r => `## ${r.agent_name}\n${r.content}`).join("\n\n");

  if (!anthropicKey) {
    return jsonResponse({
      content: `Council perspectives on: ${prompt}\n\n${responseText}\n\n(Configure an Anthropic API key in Settings for AI-generated synthesis.)`,
    }, corsHeaders);
  }

  const systemPrompt = `You are the T6 synthesis engine for a cybersecurity operations platform. You receive multiple AI analyst perspectives on a security question and produce a concise, actionable synthesis for a SOC analyst.

Your synthesis should:
1. Identify the core areas of agreement across the council
2. Surface meaningful divergences — what do analysts disagree on and why?
3. Produce a clear, concrete recommended path forward for the SOC analyst
4. Be 2-4 paragraphs, written in plain authoritative prose
5. Do NOT use headers, bullet points, or markdown — pure prose only
6. Focus on what the analyst should actually DO or CONCLUDE, not meta-commentary about the models`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 768,
      system: systemPrompt,
      messages: [{ role: "user", content: `Synthesize these council responses to the question: "${prompt}"\n\n${responseText}` }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic synthesis error: ${res.status}`);
  const d = await res.json();
  return jsonResponse({ content: d.content?.[0]?.text ?? responseText }, corsHeaders);
}

// ─── Deliberation-Aware Synthesis ─────────────────────────────────────────────

function getDeliberationSynthesisSystemPrompt(): string {
  return `You are synthesizing multiple cybersecurity analyst perspectives on a question, AFTER the analysts had the opportunity to push back on each other in a structured deliberation round.

Your synthesis MUST:

1. Identify points where analysts AGREED post-deliberation. These are the strongest signals — what did everyone still believe after pushback?

2. Identify points where analysts DISAGREED post-deliberation. Do NOT blend these into a compromise. Surface each as: "Analyst X argued A; Analyst Y argued B; the disagreement is about [specific axis]."

3. Identify ACKNOWLEDGED WEAKNESSES — points where an analyst admitted their own position had a real flaw. These are high-confidence concerns regardless of what else was synthesized.

4. End with unresolved_tensions — specific calls the SOC analyst must make themselves.

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "consensus": "1-2 paragraphs: what survived deliberation — the agreed-upon conclusions",
  "trade_offs": [
    { "axis": "what dimension of the problem this disagreement is about", "side_a": { "agent": "analyst name", "position": "their argument" }, "side_b": { "agent": "analyst name", "position": "their argument" } }
  ],
  "acknowledged_weaknesses": [
    { "agent": "analyst name", "weakness": "what they admitted in self-critique" }
  ],
  "unresolved_tensions": [
    "1-sentence statement of a call the SOC analyst must make themselves"
  ],
  "recommendation": "1-2 paragraphs: best synthesis-of-record with caveats. Prose, not bullets.",
  "content": "Plain-prose version of consensus + recommendation for display. Include the key unresolved tensions as a final sentence."
}

CRITICAL: Do NOT manufacture consensus. If analysts genuinely disagreed and it was not resolved by deliberation, that goes in unresolved_tensions. The SOC analyst explicitly ran a deliberation round to surface tension — do not erase it.`;
}

function renderDeliberationUserMessage(
  prompt: string,
  responses: CouncilResponseInput[],
  deliberations: DeliberationInput[],
): string {
  const r1 = responses.map(r => `### ${r.agent_name}\n${r.content}`).join("\n\n");

  const r2Lines: string[] = [];
  for (const d of deliberations) {
    if (d.skipped || d.parse_failed) continue;
    const pushbacks: string[] = [];
    if (d.objection) {
      const target = d.objection.target_agent_name || `Voice ${d.objection.target_voice}`;
      pushbacks.push(`- **Objection** (toward ${target}): ${d.objection.point} — ${d.objection.rationale}`);
    }
    if (d.agreement) {
      const target = d.agreement.target_agent_name || `Voice ${d.agreement.target_voice}`;
      pushbacks.push(`- **Agreement** (with ${target}): ${d.agreement.point} — What I missed: ${d.agreement.why_i_missed_it}`);
    }
    if (d.self_critique) {
      pushbacks.push(`- **Self-critique**: ${d.self_critique.weakness} — ${d.self_critique.rationale}`);
    }
    if (pushbacks.length > 0) {
      r2Lines.push(`### ${d.agent_name}`);
      r2Lines.push(...pushbacks);
      r2Lines.push("");
    }
  }

  return `ORIGINAL SECURITY QUESTION:
${prompt}

ROUND 1 — INDEPENDENT ANALYSES:

${r1}

ROUND 2 — DELIBERATION PUSHBACKS:

${r2Lines.join("\n") || "(No deliberation pushbacks recorded — treating as Round 1 only.)"}

Synthesize per the output format. Preserve tension; do not manufacture consensus. This is for a SOC analyst making a real security decision.`;
}

function parseSynthesisJson(raw: string): SynthesisOutput {
  const t = raw.trim();
  const candidates = [t];
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) candidates.push(fence[1].trim());
  const bs = t.indexOf("{"), be = t.lastIndexOf("}");
  if (bs >= 0 && be > bs) candidates.push(t.slice(bs, be + 1));

  for (const c of candidates) {
    try {
      const p = JSON.parse(c);
      if (typeof p === "object" && p !== null && typeof p.content === "string") {
        return p as SynthesisOutput;
      }
    } catch { /* try next */ }
  }
  return { content: t };
}

function deterministicSynthesis(
  prompt: string,
  responses: CouncilResponseInput[],
  deliberations: DeliberationInput[],
): SynthesisOutput {
  const agreements: string[] = [];
  const objections: string[] = [];
  const weaknesses: AcknowledgedWeakness[] = [];

  for (const d of deliberations) {
    if (d.agreement) agreements.push(`${d.agent_name} → ${d.agreement.target_agent_name ?? d.agreement.target_voice}: ${d.agreement.point}`);
    if (d.objection) objections.push(`${d.agent_name} → ${d.objection.target_agent_name ?? d.objection.target_voice}: ${d.objection.point}`);
    if (d.self_critique) weaknesses.push({ agent: d.agent_name, weakness: d.self_critique.weakness });
  }

  const lines = [
    `Council analysis of: ${prompt}`,
    `${responses.length} analysts responded.`,
    agreements.length ? `\nAgreements post-deliberation:\n${agreements.map(a => `• ${a}`).join("\n")}` : "",
    objections.length ? `\nPushbacks:\n${objections.map(o => `• ${o}`).join("\n")}` : "",
    weaknesses.length ? `\nAcknowledged weaknesses:\n${weaknesses.map(w => `• ${w.agent}: ${w.weakness}`).join("\n")}` : "",
    "\n(Configure an Anthropic API key in Settings for AI-generated synthesis.)",
  ].filter(Boolean);

  return {
    content: lines.join("\n"),
    consensus: agreements.length ? `Agreement on ${agreements.length} point(s) post-deliberation.` : "No clear consensus surfaced.",
    trade_offs: [],
    acknowledged_weaknesses: weaknesses,
    unresolved_tensions: objections.length ? objections : [],
    recommendation: "Synthesis requires an Anthropic API key. Review the deliberation pushbacks directly.",
  };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });

  const jsonResponse2 = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const user = await verifyUser(req);
    if (!user) return jsonResponse2({ error: "Authentication required" }, 401);

    const body: SynthesizeRequest = await req.json();
    const { prompt, responses, deliberations } = body;

    if (!prompt || !Array.isArray(responses) || responses.length === 0) {
      return jsonResponse2({ error: "prompt and responses are required" }, 400);
    }

    const anthropicKey = await getAnthropicKey(user.userId);

    const hasDeliberation = Array.isArray(deliberations) && deliberations.length > 0 &&
      deliberations.some(d => !d.skipped && !d.parse_failed && (d.objection || d.agreement || d.self_critique));

    if (!hasDeliberation) {
      return synthesizeClassic(prompt, responses, anthropicKey, cors);
    }

    // Deliberation-aware synthesis
    if (!anthropicKey) {
      return jsonResponse(deterministicSynthesis(prompt, responses, deliberations!), cors);
    }

    const systemPrompt = getDeliberationSynthesisSystemPrompt();
    const userMessage = renderDeliberationUserMessage(prompt, responses, deliberations!);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic synthesis error: ${res.status}`);
    const d = await res.json();
    const parsed = parseSynthesisJson(d.content?.[0]?.text ?? "");
    return jsonResponse(parsed, cors);
  } catch (err) {
    console.error("[t6-synthesize] error:", err);
    return jsonResponse2({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
