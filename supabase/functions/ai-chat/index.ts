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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
  google: "gemini_key",
};

interface ChatRequest {
  provider: "openai" | "anthropic" | "google";
  model: string;
  messages: Array<{ role: string; content: string }>;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
}

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

async function decryptApiKey(encrypted: {
  iv: string;
  ciphertext: string;
}): Promise<string> {
  const key = await deriveEncryptionKey();
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) =>
    c.charCodeAt(0)
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

async function verifyUser(
  req: Request
): Promise<{ userId: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;

  return { userId: user.id, email: user.email ?? "" };
}

async function getUserApiKey(
  userId: string,
  service: string
): Promise<string | null> {
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

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string | undefined,
  temperature: number,
  maxTokens: number
) {
  const allMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: allMessages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || "",
    tokens_used: data.usage?.total_tokens || 0,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string | undefined,
  temperature: number,
  maxTokens: number
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
      messages,
      system: systemPrompt || undefined,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await response.json();
  return {
    content: data.content[0]?.text || "",
    tokens_used:
      (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
  };
}

async function callGoogle(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string | undefined,
  temperature: number,
  maxTokens: number
) {
  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const body: any = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google AI API error: ${err}`);
  }

  const data = await response.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    tokens_used: data.usageMetadata?.totalTokenCount || 0,
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  try {
    const user = await verifyUser(req);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    const body: ChatRequest = await req.json();
    const {
      provider,
      model,
      messages,
      system_prompt,
      temperature = 0.7,
      max_tokens = 4096,
    } = body;

    const service = PROVIDER_SERVICE_MAP[provider];
    if (!service) {
      return new Response(
        JSON.stringify({ error: `Unsupported provider: ${provider}` }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = await getUserApiKey(user.userId, service);
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: `No API key configured for ${provider}. Go to Settings > API Keys to add one.`,
        }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    let result: { content: string; tokens_used: number };

    switch (provider) {
      case "openai":
        result = await callOpenAI(
          apiKey,
          model,
          messages,
          system_prompt,
          temperature,
          max_tokens
        );
        break;
      case "anthropic":
        result = await callAnthropic(
          apiKey,
          model,
          messages,
          system_prompt,
          temperature,
          max_tokens
        );
        break;
      case "google":
        result = await callGoogle(
          apiKey,
          model,
          messages,
          system_prompt,
          temperature,
          max_tokens
        );
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    return new Response(
      JSON.stringify({
        content: result.content,
        tokens_used: result.tokens_used,
        provider,
        model,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in ai-chat function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }
});
