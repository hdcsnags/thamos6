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
  openrouter: "openrouter_key",
};

interface ChatRequest {
  provider: "openai" | "anthropic" | "google" | "openrouter";
  model: string;
  messages: Array<{ role: string; content: string }>;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string; // 'mslearn' = ground answers via the Microsoft Learn MCP server
}

// ─── Microsoft Learn MCP client ──────────────────────────────────────────────
// Public, unauthenticated MCP server (Streamable HTTP / JSON-RPC).
const MSLEARN_MCP_URL = "https://learn.microsoft.com/api/mcp";
const MAX_TOOL_ROUNDS = 5;
const TOOL_RESULT_CHAR_CAP = 50000;

// Tool schemas are hardcoded (stable, documented) so we skip tools/list.
const MSLEARN_TOOLS = [
  {
    name: "microsoft_docs_search",
    description: "Search official Microsoft/Azure/M365 documentation. Returns up to 10 high-quality content chunks with article titles and URLs. Use for any question about Microsoft products, services, licensing, configuration, or troubleshooting.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "A query or topic about Microsoft/Azure products, services, platforms, developer tools, frameworks, or APIs" } },
      required: ["query"],
    },
  },
  {
    name: "microsoft_docs_fetch",
    description: "Fetch a complete Microsoft Learn documentation page as markdown. Use after search when a specific page needs full detail (step-by-step procedures, prerequisites, troubleshooting sections).",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "URL of the Microsoft documentation page to read (microsoft.com domain)" } },
      required: ["url"],
    },
  },
  {
    name: "microsoft_code_sample_search",
    description: "Search official Microsoft documentation for code snippets and examples. Use when implementation guidance or sample code is needed.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Descriptive query, SDK/class/method name" },
        language: { type: "string", description: "Optional language filter: csharp, javascript, typescript, python, powershell, azurecli, sql, java, cpp, go, rust, ruby, php" },
      },
      required: ["query"],
    },
  },
];

interface McpSession {
  id?: string;
  initialized: boolean;
}

async function mcpRequest(
  method: string,
  params: unknown,
  id: number,
  session: McpSession
): Promise<{ result?: any; error?: any }> {
  const res = await fetch(MSLEARN_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(session.id ? { "Mcp-Session-Id": session.id } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const newSession = res.headers.get("mcp-session-id");
  if (newSession) session.id = newSession;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const ct = res.headers.get("content-type") || "";
  let msg: any = null;
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const parsed = JSON.parse(line.slice(5).trim());
        if (parsed.id === id) msg = parsed;
      } catch { /* skip non-JSON SSE lines */ }
    }
  } else {
    msg = await res.json();
  }
  return { result: msg?.result, error: msg?.error };
}

async function mcpInitialize(session: McpSession): Promise<void> {
  await mcpRequest(
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "thamos-t6", version: "1.0.0" },
    },
    1,
    session
  );
  // notifications/initialized has no id → fire and forget
  await fetch(MSLEARN_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(session.id ? { "Mcp-Session-Id": session.id } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => {});
  session.initialized = true;
}

async function callMsLearnTool(
  name: string,
  args: Record<string, unknown>,
  session: McpSession
): Promise<string> {
  const doCall = () =>
    mcpRequest("tools/call", { name, arguments: args }, Date.now(), session);

  let resp: { result?: any; error?: any };
  try {
    if (!session.initialized) await mcpInitialize(session);
    resp = await doCall();
    if (resp.error) throw new Error(resp.error.message || JSON.stringify(resp.error));
  } catch (_first) {
    // Session may have expired or init raced — re-initialize and retry once.
    await mcpInitialize(session);
    resp = await doCall();
    if (resp.error) throw new Error(resp.error.message || JSON.stringify(resp.error));
  }

  const content = resp.result?.content ?? [];
  const text = content
    .filter((c: any) => c?.type === "text")
    .map((c: any) => c.text)
    .join("\n");
  return (text || JSON.stringify(resp.result ?? {})).slice(0, TOOL_RESULT_CHAR_CAP);
}

// ─── Tool-calling loops ──────────────────────────────────────────────────────

async function callOpenAICompatibleWithTools(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string | undefined,
  temperature: number,
  maxTokens: number,
  endpoint: string,
  extraHeaders: Record<string, string>
) {
  const allMessages: any[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : [...messages];
  const tools = MSLEARN_TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const session: McpSession = { initialized: false };
  let totalTokens = 0;
  let toolCallsMade = 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        temperature,
        max_tokens: maxTokens,
        // Final round: withhold tools to force a synthesized answer.
        // First round: force a tool call — small models skip grounding otherwise.
        ...(lastRound ? {} : { tools, tool_choice: round === 0 ? "required" : "auto" }),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Provider API error: ${err}`);
    }
    const data = await response.json();
    totalTokens += data.usage?.total_tokens || 0;
    const msg = data.choices?.[0]?.message;
    if (!msg?.tool_calls?.length) {
      return { content: msg?.content || "", tokens_used: totalTokens, tool_calls: toolCallsMade };
    }
    allMessages.push(msg);
    for (const tc of msg.tool_calls) {
      toolCallsMade++;
      let resultText: string;
      try {
        const args = JSON.parse(tc.function?.arguments || "{}");
        resultText = await callMsLearnTool(tc.function.name, args, session);
      } catch (e) {
        resultText = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
      }
      allMessages.push({ role: "tool", tool_call_id: tc.id, content: resultText });
    }
  }
  return { content: "", tokens_used: totalTokens, tool_calls: toolCallsMade };
}

async function callAnthropicWithTools(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string | undefined,
  temperature: number,
  maxTokens: number
) {
  const allMessages: any[] = [...messages];
  const tools = MSLEARN_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
  const session: McpSession = { initialized: false };
  let totalTokens = 0;
  let toolCallsMade = 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        system: systemPrompt || undefined,
        temperature,
        max_tokens: maxTokens,
        ...(lastRound ? {} : { tools, tool_choice: { type: round === 0 ? "any" : "auto" } }),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${err}`);
    }
    const data = await response.json();
    totalTokens += (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    if (data.stop_reason !== "tool_use") {
      const text = (data.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
      return { content: text, tokens_used: totalTokens, tool_calls: toolCallsMade };
    }

    allMessages.push({ role: "assistant", content: data.content });
    const toolResults: any[] = [];
    for (const block of (data.content ?? []).filter((b: any) => b.type === "tool_use")) {
      toolCallsMade++;
      let resultText: string;
      try {
        resultText = await callMsLearnTool(block.name, block.input ?? {}, session);
      } catch (e) {
        resultText = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultText });
    }
    allMessages.push({ role: "user", content: toolResults });
  }
  return { content: "", tokens_used: totalTokens, tool_calls: toolCallsMade };
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

async function callOpenRouter(
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

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://t6.thamos.ca",
      "X-Title": "ThamOS Maestro",
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
    throw new Error(`OpenRouter API error: ${err}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || "",
    tokens_used: data.usage?.total_tokens || 0,
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
      tools,
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

    let result: { content: string; tokens_used: number; tool_calls?: number };

    if (tools === "mslearn") {
      // Tool-grounded path: model loops against the Microsoft Learn MCP server.
      switch (provider) {
        case "openai":
          result = await callOpenAICompatibleWithTools(
            apiKey, model, messages, system_prompt, temperature, max_tokens,
            "https://api.openai.com/v1/chat/completions", {}
          );
          break;
        case "openrouter":
          result = await callOpenAICompatibleWithTools(
            apiKey, model, messages, system_prompt, temperature, max_tokens,
            "https://openrouter.ai/api/v1/chat/completions",
            { "HTTP-Referer": "https://t6.thamos.ca", "X-Title": "ThamOS Maestro" }
          );
          break;
        case "anthropic":
          result = await callAnthropicWithTools(
            apiKey, model, messages, system_prompt, temperature, max_tokens
          );
          break;
        default:
          return new Response(
            JSON.stringify({ error: `MS Learn tools are not supported on provider '${provider}'. Use an OpenAI, Anthropic, or OpenRouter agent.` }),
            { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
          );
      }

      return new Response(
        JSON.stringify({
          content: result.content,
          tokens_used: result.tokens_used,
          provider,
          model,
          tools: "mslearn",
          tool_calls: result.tool_calls ?? 0,
        }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

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
      case "openrouter":
        result = await callOpenRouter(
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
