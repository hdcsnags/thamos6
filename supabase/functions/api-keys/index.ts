import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENCRYPTION_KEY = Deno.env.get("API_KEY_ENCRYPTION_KEY") ?? "";
const KEY_VERSION = 1;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface EncryptedKey {
  iv: string;
  ciphertext: string;
  keyVersion: number;
}

async function verifyUser(req: Request): Promise<{ userId: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await userClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { userId: user.id, email: user.email ?? "" };
}

async function encryptApiKey(plaintext: string): Promise<EncryptedKey> {
  if (!ENCRYPTION_KEY) {
    throw new Error("Encryption key not configured");
  }

  const keyData = Uint8Array.from(atob(ENCRYPTION_KEY), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", keyData, { name: "AES-GCM" }, false, ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, encodedPlaintext
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    keyVersion: KEY_VERSION,
  };
}

const VALID_SERVICES = [
  "virustotal", "abuseipdb", "alienvault", "shodan",
  "ipqualityscore", "urlscan", "proxycheck", "greynoise"
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const user = await verifyUser(req);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.replace("/api-keys", "");

    if (req.method === "GET" && (path === "/" || path === "")) {
      const { data, error } = await serviceClient
        .from("user_api_keys")
        .select("id, service, is_active, created_at, updated_at")
        .eq("user_id", user.userId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ keys: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && (path === "/" || path === "")) {
      const body = await req.json();
      const { service, apiKey } = body;

      if (!service || !apiKey) {
        return new Response(
          JSON.stringify({ error: "Service and apiKey are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!VALID_SERVICES.includes(service)) {
        return new Response(
          JSON.stringify({ error: `Invalid service. Must be one of: ${VALID_SERVICES.join(", ")}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const encrypted = await encryptApiKey(apiKey);

      const { data: existing } = await serviceClient
        .from("user_api_keys")
        .select("id")
        .eq("user_id", user.userId)
        .eq("service", service)
        .maybeSingle();

      if (existing) {
        const { error } = await serviceClient
          .from("user_api_keys")
          .update({
            encrypted_key: encrypted,
            api_key: null,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: `Updated ${service} API key` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await serviceClient
        .from("user_api_keys")
        .insert({
          user_id: user.userId,
          service,
          encrypted_key: encrypted,
          api_key: null,
          is_active: true,
        });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: `Added ${service} API key` }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "DELETE") {
      const serviceToDelete = path.replace("/", "");

      if (!serviceToDelete || !VALID_SERVICES.includes(serviceToDelete)) {
        return new Response(
          JSON.stringify({ error: "Invalid service" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await serviceClient
        .from("user_api_keys")
        .delete()
        .eq("user_id", user.userId)
        .eq("service", serviceToDelete);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: `Deleted ${serviceToDelete} API key` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});