// read-email — server-side decrypt of a stored .eml for the workbench reading
// pane. The AES-GCM key never leaves the server; the client only ever receives
// the parsed structure. Authenticated + audit-logged.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseEmail, fillAttachmentHashes, type ParsedEmail } from "../_shared/email-parser.ts";

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
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = "email-artifacts";

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const raw = b64ToBytes(EMAIL_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new Error("EMAIL_ENCRYPTION_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", raw as unknown as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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

/** Trim the parsed structure for transport (mirror analyze-email). */
function transportParsed(parsed: ParsedEmail) {
  return {
    ...parsed,
    decodedBody: undefined,
    bodyText: parsed.bodyText.slice(0, 20_000),
    bodyHtmlPreview: parsed.decodedBody.slice(0, 80_000),
    parts: parsed.parts.map((p) => ({ ...p, text: undefined, bytes: undefined })),
    headerList: undefined,
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const user = await verifyUser(req);
    if (!user) return json({ error: "Authentication required" }, 401);
    if (!EMAIL_ENCRYPTION_KEY) return json({ error: "EMAIL_ENCRYPTION_KEY not configured" }, 500);

    const { id } = await req.json();
    if (!id || typeof id !== "string") return json({ error: "id required" }, 400);

    const { data: row, error: rowErr } = await serviceClient
      .from("email_verdicts")
      .select("id, storage_path, enc_iv, verdict_data, subject, from_address")
      .eq("id", id).maybeSingle();
    if (rowErr || !row) return json({ error: "Email not found" }, 404);
    if (!row.storage_path || !row.enc_iv) return json({ error: "No stored artifact for this email" }, 404);

    const { data: blob, error: dlErr } = await serviceClient.storage.from(BUCKET).download(row.storage_path);
    if (dlErr || !blob) return json({ error: `download failed: ${dlErr?.message ?? "missing"}` }, 500);

    const key = await getEncryptionKey();
    const iv = b64ToBytes(row.enc_iv);
    const ct = new Uint8Array(await blob.arrayBuffer());
    let rawBytes: Uint8Array;
    try {
      rawBytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, ct as unknown as BufferSource));
    } catch {
      return json({ error: "decryption failed (key mismatch?)" }, 500);
    }
    const raw = new TextDecoder().decode(rawBytes);
    const parsed = parseEmail(raw);
    await fillAttachmentHashes(parsed);

    // Audit the decrypt access.
    await serviceClient.from("audit_events").insert({
      request_id: crypto.randomUUID(),
      user_id: user.userId,
      action: "decrypt_email",
      resource_type: "email_verdict",
      resource_id: id,
      created_at: new Date().toISOString(),
    }).then(({ error }) => { if (error) console.error("audit:", error.message); });

    return json({ parsed: transportParsed(parsed), verdict: row.verdict_data ?? null });
  } catch (e) {
    console.error("read-email error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
