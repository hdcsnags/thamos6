// store-email — "Save to Workbench". Persists an analyzed email durably:
//   * raw .eml encrypted at rest (AES-GCM) in the private email-artifacts bucket
//   * only NON-PII attacker IOCs written to email_verdicts.extracted_iocs and the
//     ioc_relationships pivot graph (victim/student identity stays in the blob)
// Decryption is never client-side — see read-email.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseEmail, fillAttachmentHashes, nonPiiIocs } from "../_shared/email-parser.ts";

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
const EMAIL_ENCRYPTION_KEY = Deno.env.get("EMAIL_ENCRYPTION_KEY") ?? "";
// Victim/protected domains whose recipients must never reach the graph.
const PROTECTED_DOMAINS = (Deno.env.get("PROTECTED_DOMAINS") ?? "dsbn.org,studentsdsbn.org")
  .split(",").map((d) => d.trim()).filter(Boolean);

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = "email-artifacts";
const MAX_RAW_EMAIL_BYTES = 5 * 1024 * 1024;

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const raw = b64ToBytes(EMAIL_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new Error("EMAIL_ENCRYPTION_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", raw as unknown as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyUser(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  return user && !error ? { userId: user.id } : null;
}

// Mirror of threat-intel's savePDNSEdges upsert pattern.
async function upsertEdge(
  sourceType: string, sourceValue: string, targetType: string, targetValue: string, edgeType: string,
) {
  if (!sourceValue || !targetValue || sourceValue === targetValue) return;
  await serviceClient.from("ioc_relationships").upsert(
    {
      source_type: sourceType, source_value: sourceValue,
      target_type: targetType, target_value: targetValue,
      edge_type: edgeType, source_dataset: "email", confidence: "medium",
      last_seen: new Date().toISOString(),
    },
    { onConflict: "source_type,source_value,target_type,target_value,edge_type,source_dataset", ignoreDuplicates: false },
  ).then(({ error }) => { if (error) console.error("edge upsert:", error.message); });
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const user = await verifyUser(req);
    if (!user) return json({ error: "Authentication required" }, 401);
    if (!EMAIL_ENCRYPTION_KEY) return json({ error: "EMAIL_ENCRYPTION_KEY not configured" }, 500);

    const { raw_email } = await req.json();
    if (!raw_email || typeof raw_email !== "string") return json({ error: "raw_email required" }, 400);
    if (raw_email.length > MAX_RAW_EMAIL_BYTES) return json({ error: "Email too large (max 5MB)" }, 413);

    const rawBytes = new TextEncoder().encode(raw_email);
    const emlSha = await sha256Hex(rawBytes);

    // Dedup: same .eml already stored → return it.
    const { data: existing } = await serviceClient
      .from("email_verdicts").select("id, created_at").eq("eml_sha256", emlSha).maybeSingle();
    if (existing) return json({ id: existing.id, eml_sha256: emlSha, deduped: true });

    const parsed = parseEmail(raw_email);
    await fillAttachmentHashes(parsed);
    const iocs = nonPiiIocs(parsed, PROTECTED_DOMAINS);

    // Encrypt + upload the raw .eml.
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, rawBytes as unknown as BufferSource));
    const storagePath = `${user.userId}/${crypto.randomUUID()}.enc`;
    const { error: upErr } = await serviceClient.storage.from(BUCKET).upload(storagePath, ct, {
      contentType: "application/octet-stream", upsert: false,
    });
    if (upErr) return json({ error: `storage upload failed: ${upErr.message}` }, 500);

    // Flatten non-PII IOCs for the row + the graph.
    const flat: Array<{ type: string; value: string }> = [
      ...iocs.ips.map((v) => ({ type: "ip", value: v })),
      ...iocs.urls.map((v) => ({ type: "url", value: v })),
      ...iocs.domains.map((v) => ({ type: "domain", value: v })),
      ...iocs.hashes.map((v) => ({ type: "hash", value: v })),
      ...iocs.emails.map((v) => ({ type: "email", value: v })),
    ];

    const { data: row, error: insErr } = await serviceClient.from("email_verdicts").insert({
      message_id: parsed.messageId.slice(0, 500),
      subject: parsed.subject.slice(0, 500),
      from_address: parsed.from.slice(0, 500),
      storage_path: storagePath,
      enc_iv: bytesToB64(iv),
      eml_sha256: emlSha,
      extracted_iocs: flat,
      raw_size_bytes: raw_email.length,
      created_by: user.userId,
    }).select("id, created_at").single();
    if (insErr) {
      await serviceClient.storage.from(BUCKET).remove([storagePath]);
      // Race backstop: the eml_sha256 UNIQUE constraint caught a concurrent save.
      if ((insErr as { code?: string }).code === "23505") {
        const { data: dup } = await serviceClient
          .from("email_verdicts").select("id, created_at").eq("eml_sha256", emlSha).maybeSingle();
        if (dup) return json({ id: dup.id, eml_sha256: emlSha, deduped: true });
      }
      return json({ error: `persist failed: ${insErr.message}` }, 500);
    }

    // Graph: email-hub → each IOC (repeat-offender counting), + bounded co-occurrence.
    for (const ioc of flat) await upsertEdge("email", emlSha, ioc.type, ioc.value, "extracted_from_email");
    const coocc = flat.filter((i) => i.type !== "email").slice(0, 6);
    for (let i = 0; i < coocc.length; i++)
      for (let j = i + 1; j < coocc.length; j++)
        await upsertEdge(coocc[i].type, coocc[i].value, coocc[j].type, coocc[j].value, "seen_with");

    return json({ id: row.id, eml_sha256: emlSha, ioc_count: flat.length, created_at: row.created_at });
  } catch (e) {
    console.error("store-email error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
