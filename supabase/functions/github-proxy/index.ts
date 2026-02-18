import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GITHUB_API = "https://api.github.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-GitHub-Token",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ghPath = url.searchParams.get("path");
    const accept = url.searchParams.get("accept") || "application/vnd.github+json";

    if (!ghPath) {
      return new Response(JSON.stringify({ error: "Missing path parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = req.headers.get("X-GitHub-Token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing GitHub token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ghRes = await fetch(`${GITHUB_API}${ghPath}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Thamos-App",
      },
    });

    const body = await ghRes.text();

    return new Response(body, {
      status: ghRes.status,
      headers: {
        ...corsHeaders,
        "Content-Type": ghRes.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
