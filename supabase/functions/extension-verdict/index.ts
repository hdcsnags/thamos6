// extension-verdict — server-side THAMOS verdict for extension analyses.
//
// Replaces the old client-side verdict flow, which built the prompt in the
// browser from scanner *summaries* only. The model never saw the actual code
// that triggered a finding, so it tended to blindly trust scanner labels
// (e.g. "financial theft") instead of verifying them. This function:
//   1. Loads the analysis, findings, IOCs and CRXplorer data from the DB
//      (server-side truth — the client can no longer tamper with inputs)
//   2. Pulls the raw file contents stored in extension_files and extracts
//      code windows around each finding's evidence
//   3. Asks the model to CONFIRM or REFUTE each finding against the code
//   4. Persists the verdict to extension_verdicts (audit trail)

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

// Evidence budget — keeps prompts bounded on large extensions
const MAX_EVIDENCE_FILES = 8;
const SNIPPET_RADIUS = 1500;     // chars either side of the evidence match
const MAX_SNIPPETS_PER_FILE = 3;
const MAX_TOTAL_EVIDENCE_CHARS = 45_000;

// --- API key handling (same scheme as ai-chat) ---

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

// --- Evidence extraction ---

interface Finding {
  rule_id: string | null;
  category: string;
  severity: string;
  confidence: string | null;
  title: string;
  description: string;
  evidence: string;
  file_path: string;
}

const NON_CODE_PATHS = new Set([
  "manifest.json", "chrome_web_store", "scan_metadata", "multiple_files", "manifest.json + iocs",
]);

function extractSnippets(content: string, needles: string[]): string[] {
  const snippets: string[] = [];
  const usedRanges: Array<[number, number]> = [];
  for (const needle of needles) {
    if (snippets.length >= MAX_SNIPPETS_PER_FILE) break;
    // Use a stable prefix of the evidence string — evidence is often truncated
    const probe = needle.slice(0, 60).trim();
    if (probe.length < 8) continue;
    const idx = content.indexOf(probe);
    if (idx === -1) continue;
    if (usedRanges.some(([s, e]) => idx >= s && idx <= e)) continue;
    const start = Math.max(0, idx - SNIPPET_RADIUS);
    const end = Math.min(content.length, idx + probe.length + SNIPPET_RADIUS);
    usedRanges.push([start, end]);
    snippets.push(content.slice(start, end));
  }
  if (snippets.length === 0) {
    // Evidence string not located (regex-derived) — give the file head so the
    // model still sees real code rather than nothing.
    snippets.push(content.slice(0, SNIPPET_RADIUS * 2));
  }
  return snippets;
}

async function buildCodeEvidence(
  analysisId: string,
  findings: Finding[]
): Promise<{ evidenceText: string; filesUsed: number }> {
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!f.file_path || NON_CODE_PATHS.has(f.file_path)) continue;
    if (!byFile.has(f.file_path)) byFile.set(f.file_path, []);
    byFile.get(f.file_path)!.push(f);
  }

  // Prioritize files with the most severe findings
  const severityRank: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  const rankedFiles = [...byFile.entries()]
    .sort((a, b) => {
      const maxA = Math.max(...a[1].map(f => severityRank[f.severity] ?? 0));
      const maxB = Math.max(...b[1].map(f => severityRank[f.severity] ?? 0));
      return maxB - maxA || b[1].length - a[1].length;
    })
    .slice(0, MAX_EVIDENCE_FILES);

  if (rankedFiles.length === 0) return { evidenceText: "No code-level findings to verify.", filesUsed: 0 };

  const paths = rankedFiles.map(([p]) => p);
  const { data: files } = await serviceClient
    .from("extension_files")
    .select("file_path, file_content")
    .eq("analysis_id", analysisId)
    .in("file_path", paths);

  const contentByPath = new Map<string, string>(
    (files || []).map((f: { file_path: string; file_content: string }) => [f.file_path, f.file_content])
  );

  let evidenceText = "";
  let filesUsed = 0;
  for (const [path, fileFindings] of rankedFiles) {
    if (evidenceText.length >= MAX_TOTAL_EVIDENCE_CHARS) break;
    const content = contentByPath.get(path);
    if (!content) continue;
    const needles = fileFindings.map(f => f.evidence).filter(Boolean);
    const snippets = extractSnippets(content, needles);
    const ruleList = fileFindings.map(f => `${f.rule_id ?? f.title} [${f.severity}]`).join(", ");
    evidenceText += `\n--- FILE: ${path} (findings to verify: ${ruleList}) ---\n`;
    evidenceText += snippets.map((s, i) => `[snippet ${i + 1}]\n${s}`).join("\n...\n");
    evidenceText += "\n";
    filesUsed++;
  }

  if (evidenceText.length > MAX_TOTAL_EVIDENCE_CHARS) {
    evidenceText = evidenceText.slice(0, MAX_TOTAL_EVIDENCE_CHARS) + "\n[evidence truncated]";
  }
  return { evidenceText: evidenceText || "Stored file contents unavailable for flagged files.", filesUsed };
}

// --- IOC ranking: suspicious first, noise last ---

const WHITELISTED_DOMAINS = [
  'google-analytics.com', 'googleapis.com', 'gstatic.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
  'github.com', 'githubusercontent.com', 'w3.org', 'mozilla.org',
  'sentry.io', 'mixpanel.com', 'segment.com', 'schema.org',
];
const SUSPICIOUS_TLDS = ['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc'];

function rankIocs(iocs: Array<{ ioc_type: string; ioc_value: string; source_file: string }>) {
  const score = (i: { ioc_type: string; ioc_value: string }) => {
    const v = i.ioc_value.toLowerCase();
    if (WHITELISTED_DOMAINS.some(d => v.includes(d))) return 0;
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)) return 3;
    if (SUSPICIOUS_TLDS.some(t => v.endsWith(t))) return 3;
    if (i.ioc_type === 'domain') return 2;
    return 1;
  };
  return [...iocs].sort((a, b) => score(b) - score(a));
}

// --- Main ---

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

    const { analysis_id, provider = "anthropic", model = "claude-sonnet-4-20250514" } = await req.json();
    if (!analysis_id) return json({ error: "analysis_id is required" }, 400);

    const service = PROVIDER_SERVICE_MAP[provider];
    if (!service) {
      return json({ error: `Unsupported provider: ${provider}` }, 400);
    }
    const apiKey = await getUserApiKey(user.userId, service);
    if (!apiKey) {
      return json({ error: `No API key configured for ${provider}. Go to Settings > API Keys to add one.` }, 400);
    }

    // Server-side truth: load everything from the DB
    const [analysisRes, findingsRes, iocsRes] = await Promise.all([
      serviceClient.from("extension_analyses").select("*").eq("id", analysis_id).maybeSingle(),
      serviceClient.from("security_findings").select("rule_id, category, severity, confidence, title, description, evidence, file_path").eq("analysis_id", analysis_id),
      serviceClient.from("extension_iocs").select("ioc_type, ioc_value, source_file").eq("analysis_id", analysis_id).limit(500),
    ]);

    const analysis = analysisRes.data;
    if (!analysis) return json({ error: "Analysis not found" }, 404);
    const findings: Finding[] = findingsRes.data || [];
    const iocs = iocsRes.data || [];
    const behaviorFlags: Array<{ flag_type: string; severity: string; description: string; evidence: string[] }> =
      (analysis.behavior_flags as Array<{ flag_type: string; severity: string; description: string; evidence: string[] }>) || [];

    const malExtHit = behaviorFlags.some(f => f.flag_type === "confirmed_removed_from_store") ||
      findings.some(f => f.rule_id === "MALEXT-1");
    const vaultDeltaFlags = behaviorFlags.filter(f => f.flag_type === "vault_delta_detected");
    const otherFlags = behaviorFlags.filter(f =>
      f.flag_type !== "vault_delta_detected" && f.flag_type !== "confirmed_removed_from_store");
    const aiDataFindings = findings.filter(f => f.category === "ai_data_flow");

    const classification = malExtHit
      ? "CONFIRMED_MALICIOUS"
      : otherFlags.some(f => f.severity === "critical") ? "MIXED" : "CAPABILITY_RISK";

    // Code evidence from stored files
    const { evidenceText, filesUsed } = await buildCodeEvidence(analysis_id, findings);

    const findingsSummary = findings.map(f =>
      `[${(f.severity || '').toUpperCase()}/${f.confidence || 'medium'}] (${f.rule_id ?? 'n/a'}) ${f.title}\nDescription: ${f.description}\nEvidence: ${f.evidence}\nFile: ${f.file_path}`
    ).join("\n\n") || "None";

    const behaviorSummary = otherFlags.map(f =>
      `${f.flag_type}: ${f.description}\n${(f.evidence || []).join(", ")}`
    ).join("\n\n") || "None";

    const vaultDeltaStr = vaultDeltaFlags.length > 0
      ? vaultDeltaFlags.map(f =>
          `VAULT DELTA — ${f.description}\n${(f.evidence || []).filter(e => !e.startsWith("baseline_analysis_id")).join(" | ")}`
        ).join("\n")
      : "None";

    const rankedIocs = rankIocs(iocs);
    const iocSummary = rankedIocs.slice(0, 25).map(i =>
      `[${i.ioc_type}] ${i.ioc_value} (in ${i.source_file})`
    ).join("\n") || "None";

    const crxData = analysis.crxcavator_data as Record<string, unknown> | null;
    const crx = crxData?.available ? crxData : null;
    const crxStr = crx
      ? `Score: ${crx.overall_score}/100 | Risk: ${crx.risk_level} | Recommended: ${crx.should_use === true ? "Yes" : crx.should_use === false ? "No" : "Unknown"}
Reasoning: ${((crx.reasoning as unknown[]) || []).map((r) => typeof r === "string" ? r : (r as { text?: string })?.text ?? "").join(" | ") || "None"}
Categories: ${JSON.stringify(crx.categories)}
Category Justifications: ${JSON.stringify(crx.category_justifications)}
Browser Impact: ${JSON.stringify(crx.browser_impact)}
Detailed Permissions: ${JSON.stringify(((crx.detailed_permissions as unknown[]) || []).slice(0, 20))}`
      : "Not available";

    const aiDataStr = aiDataFindings.length > 0
      ? aiDataFindings.map(f => `[${f.rule_id}] ${f.title}\n${f.description}\nEvidence: ${f.evidence}`).join("\n\n")
      : "None detected";

    const systemPrompt = `You are a senior browser-extension threat analyst inside Thamos6. You review automated scanner findings, manifest data, IOCs, behavior flags, CRXplorer external intel, reputation signals, AND the actual source code that triggered each finding. The internal scanner is intentionally aggressive and reports capability risk, not always malicious intent. Your job is to produce a calibrated analyst verdict GROUNDED IN THE CODE.

CRITICAL: You are given code snippets from the extension's real files. For each scanner finding, verify it against the code before accepting its label. Scanner rules are regex-based and frequently fire on benign bundler co-location (e.g., a cookies API call and an unrelated fetch in the same webpack bundle). If the code shows the finding is a false positive, say so explicitly and do not let it drive the verdict. If the code confirms the behavior, treat it as confirmed regardless of external reputation — no amount of positive external intel outweighs confirmed malicious code.

Do not invent evidence. Use only the supplied artifacts. If raw scanner risk and contextual verdict differ, explain why. Separate confirmed behavior from capability risk. A legitimate extension can have high capability risk if its function requires broad page access. Lower final verdict only when code review, permissions, behavior, purpose, reputation, and external intel support that conclusion. Raise final verdict when multiple independent signals converge: sensitive data access, network exfiltration, remote control/config, dynamic execution, evasion, suspicious domains, store removal, or permission-purpose mismatch.

ORGANIZATIONAL SUITABILITY is a separate assessment from malware risk. An extension can be LIKELY_SAFE from a threat perspective but still NOT_APPROVED for organizational use. When AI-DATA findings are present, assess whether the extension's AI vendor communication is inherent to its stated purpose, and whether the combination of AI vendor access + educational content platform scope creates shadow AI governance risk. Educational organizations require formal board-level agreements with AI vendors that receive student or staff data. Google AI (Gemini, Workspace AI) and Microsoft Copilot are commonly pre-approved in schools using those suites. OpenAI, Anthropic, Grammarly, Perplexity, and others typically require separate review. If no AI-DATA findings are present, return organizational_suitability with rating UNKNOWN.

Return only valid JSON matching the requested schema.`;

    const prompt = `Analyze this Chrome extension and return a calibrated analyst verdict as JSON.

EXTENSION: ${analysis.extension_name} v${analysis.extension_version}
EXTENSION ID: ${analysis.extension_id}
SCANNER RISK SCORE: ${analysis.risk_score}/100 (${analysis.risk_level})
SCANNER CLASSIFICATION (pre-computed): ${classification}
OBFUSCATION SCORE: ${analysis.obfuscation_score || 0}

CRXPLORER INDEPENDENT ASSESSMENT:
${crxStr}

MANIFEST:
${JSON.stringify(analysis.manifest_data, null, 2)}

SECURITY FINDINGS (${findings.length} total):
${findingsSummary}

CODE EVIDENCE (actual file contents around each finding — verify findings against this):
${evidenceText}

BEHAVIORAL FLAGS:
${behaviorSummary}

VAULT DELTA (posture drift since known baseline):
${vaultDeltaStr}

IOCS DETECTED (${iocs.length} total, top 25 by suspicion ranking):
${iocSummary}

AI DATA FLOW SIGNALS (${aiDataFindings.length} detected — governance assessment, separate from malware verdict):
${aiDataStr}

IMPORTANT: When evaluating MAIN-world or broad content script access, decide whether it is purpose-aligned. If purpose-aligned, classify it as CAPABILITY_RISK or WATCH_ITEM rather than CONFIRMED_BEHAVIOR unless paired with exfiltration, credential targeting, remote command/config abuse, or evasion.

For finding_assessments: assess each distinct rule_id that has code evidence above. CONFIRMED = code clearly shows the malicious/risky behavior the rule describes. REFUTED = code shows the rule fired on benign/unrelated logic. CAPABILITY_ONLY = code shows the capability exists but no malicious use is visible. UNVERIFIABLE = supplied snippets are insufficient to judge.

Return ONLY valid JSON — no markdown, no prose:
{
  "verdict": "MALICIOUS" | "OVERPRIVILEGED" | "SUSPICIOUS" | "LIKELY_SAFE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "admin_action": "ALLOW" | "ALLOW_MONITOR" | "REVIEW" | "BLOCK" | "REMOVE",
  "raw_scanner_interpretation": {
    "risk_score": ${analysis.risk_score},
    "risk_level": "${analysis.risk_level}",
    "classification": "${classification}"
  },
  "external_intel_interpretation": {
    "provider": "CRXplorer",
    "score": ${typeof crx?.overall_score === "number" ? crx.overall_score : "null"},
    "risk_level": ${crx?.risk_level ? `"${crx.risk_level}"` : "null"},
    "summary": "<one sentence summarizing CRXplorer assessment>"
  },
  "finding_assessments": [
    {
      "rule_id": "<rule id>",
      "file_path": "<file>",
      "assessment": "CONFIRMED" | "REFUTED" | "CAPABILITY_ONLY" | "UNVERIFIABLE",
      "reasoning": "<one sentence grounded in the code evidence>"
    }
  ],
  "purpose_fit": {
    "rating": "STRONG" | "PARTIAL" | "WEAK" | "UNKNOWN",
    "reasoning": "<one sentence>"
  },
  "why_verdict_differs": "<explain if and why contextual verdict differs from raw scanner risk, or state they align>",
  "top_concerns": [
    {
      "type": "CONFIRMED_BEHAVIOR" | "CAPABILITY_RISK" | "CONTEXTUAL_FALSE_POSITIVE" | "EXTERNAL_REPUTATION_SIGNAL" | "WATCH_ITEM",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "title": "<concise title>",
      "evidence": "<specific evidence from supplied data only>"
    }
  ],
  "positive_signals": ["<signal>"],
  "watch_items": ["<item>"],
  "recommendation": "<1-2 sentences>",
  "ioc_highlights": ["<critical IOC if any>"],
  "organizational_suitability": {
    "rating": "APPROVED" | "REVIEW_REQUIRED" | "NOT_APPROVED" | "UNKNOWN",
    "ai_data_flow_risk": "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "detected_ai_vendors": ["<vendor domain if any>"],
    "content_surfaces": ["<edu platform if any>"],
    "reasoning": "<1-2 sentences on governance posture>"
  }
}`;

    const content = provider === "anthropic"
      ? await callAnthropic(apiKey, model, prompt, systemPrompt, 3500)
      : await callOpenAI(apiKey, model, prompt, systemPrompt, 3500);

    const jsonStr = content.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return json({ error: "AI returned unparseable verdict", raw: content.slice(0, 500) }, 502);
    }

    const { data: saved, error: saveError } = await serviceClient
      .from("extension_verdicts")
      .insert({
        analysis_id,
        extension_id: analysis.extension_id,
        verdict_data: parsed,
        verdict: (parsed.verdict as string) || "",
        admin_action: (parsed.admin_action as string) || "",
        provider,
        model,
        evidence_files_count: filesUsed,
        created_by: user.userId,
      })
      .select("id, created_at")
      .single();

    if (saveError) console.error("Failed to persist verdict:", saveError);

    return json({
      verdict: parsed,
      verdict_id: saved?.id ?? null,
      created_at: saved?.created_at ?? null,
      evidence_files_count: filesUsed,
    });
  } catch (error) {
    console.error("extension-verdict error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
