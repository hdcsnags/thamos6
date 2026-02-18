import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GITHUB_API = "https://api.github.com";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "https://t6.thamos.ca",
]);

type AllowedMethod = "GET" | "PUT";

interface AllowedEndpoint {
  pattern: RegExp;
  methods: AllowedMethod[];
}

const ALLOWED_ENDPOINTS: AllowedEndpoint[] = [
  { pattern: /^\/user$/, methods: ["GET"] },
  { pattern: /^\/user\/repos(\?.*)?$/, methods: ["GET"] },
  { pattern: /^\/search\/repositories(\?.*)?$/, methods: ["GET"] },
  { pattern: /^\/repos\/[^/]+\/[^/]+\/git\/trees\/[^/]+(\?.*)?$/, methods: ["GET"] },
  { pattern: /^\/repos\/[^/]+\/[^/]+\/contents(\/.*)?(\?.*)?$/, methods: ["GET", "PUT"] },
];

function isAllowedEndpoint(path: string, method: AllowedMethod): boolean {
  const pathOnly = path.split('?')[0];
  for (const endpoint of ALLOWED_ENDPOINTS) {
    if (endpoint.pattern.test(path) && endpoint.methods.includes(method)) {
      return true;
    }
    if (endpoint.pattern.test(pathOnly) && endpoint.methods.includes(method)) {
      return true;
    }
  }
  return false;
}

function sanitizePath(path: string): string | null {
  if (path.includes('..') || path.includes('\0') || path.includes('//')) return null;
  if (!path.startsWith('/')) return null;
  return path;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-GitHub-Token",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const rawPath = url.searchParams.get("path");
    const accept = url.searchParams.get("accept") || "application/vnd.github+json";

    if (!rawPath) {
      return new Response(JSON.stringify({ error: "Missing path parameter" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ghPath = sanitizePath(rawPath);
    if (!ghPath) {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const token = req.headers.get("X-GitHub-Token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing GitHub token" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const method = req.method as AllowedMethod;
    if (!isAllowedEndpoint(ghPath, method)) {
      return new Response(JSON.stringify({ error: "Endpoint not allowed" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Thamos-App",
        "Content-Type": "application/json",
      },
    };

    if (method === "PUT") {
      const body = await req.text();
      fetchOptions.body = body;
    }

    const ghRes = await fetch(`${GITHUB_API}${ghPath}`, fetchOptions);
    const body = await ghRes.text();

    return new Response(body, {
      status: ghRes.status,
      headers: {
        ...cors,
        "Content-Type": ghRes.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
