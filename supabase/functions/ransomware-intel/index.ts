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

async function verifyUser(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  return Boolean(user) && !error;
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CACHE_DURATION_HOURS = 6;

interface RansomwareLiveVictim {
  victim: string;
  description?: string;
  discovered: string;
  attackdate?: string;
  country?: string;
  activity?: string;
  group: string;
  claim_url?: string;
  screenshot?: string;
  url?: string;
  domain?: string;
}

interface RansomwareVictim {
  victim_name: string;
  description?: string;
  discovery_date: string;
  country_code?: string;
  country_name?: string;
  sector?: string;
  ransom_amount?: number;
  leak_site_url?: string;
  screenshot_url?: string;
  data_leaked?: boolean;
  group_name?: string;
}

interface ThreatActorGroup {
  name: string;
  aliases?: string[];
  description?: string;
  first_seen?: string;
  last_activity?: string;
  ttp_summary?: string;
  target_sectors?: string[];
  target_countries?: string[];
  severity_level?: string;
}

async function getCachedData(cacheKey: string): Promise<any> {
  const { data } = await serviceClient
    .from("threat_intel_cache")
    .select("data, expires_at")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  
  return data?.data ?? null;
}

async function setCachedData(cacheKey: string, data: any): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  await serviceClient
    .from("threat_intel_cache")
    .upsert({
      cache_key: cacheKey,
      data,
      expires_at: expiresAt,
    }, { onConflict: "cache_key" });
}

async function fetchRansomwareLiveData(): Promise<RansomwareLiveVictim[] | null> {
  const cacheKey = "ransomware_live:all_victims";
  const cached = await getCachedData(cacheKey);
  if (cached) return cached;

  // ransomware.live retired the free v2 API — api-pro requires a (free) key.
  const apiKey = Deno.env.get("RANSOMWARE_LIVE_API_KEY") ?? "";
  if (!apiKey) {
    throw new Error("RANSOMWARE_LIVE_API_KEY not configured. Register free at ransomware.live and set the secret: supabase secrets set RANSOMWARE_LIVE_API_KEY=<key>");
  }

  const response = await fetch("https://api-pro.ransomware.live/victims/recent", {
    headers: {
      "Accept": "application/json",
      "X-API-KEY": apiKey,
      "User-Agent": "ThamOS-T6/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`ransomware.live api-pro HTTP ${response.status}`);
  }

  const data = await response.json();
  // api-pro may return a bare array or wrap it
  const victims: RansomwareLiveVictim[] = Array.isArray(data)
    ? data
    : (data?.victims ?? data?.data ?? []);
  if (victims.length > 0) await setCachedData(cacheKey, victims);
  return victims;
}

async function syncVictimData(victims: RansomwareLiveVictim[]): Promise<void> {
  for (const victim of victims) {
    const discoveryDate = victim.discovered || victim.attackdate || new Date().toISOString();
    const victimName = victim.victim;

    const { data: existingVictim } = await serviceClient
      .from("ransomware_victims")
      .select("id, victim_name")
      .eq("victim_name", victimName)
      .eq("discovery_date", discoveryDate)
      .maybeSingle();

    if (existingVictim) continue;

    const { data: insertedVictim, error: victimError } = await serviceClient
      .from("ransomware_victims")
      .insert({
        victim_name: victimName,
        description: victim.description,
        discovery_date: discoveryDate,
        country_code: victim.country || null,
        country_name: victim.country || null,
        sector: victim.activity && victim.activity !== "Not Found" ? victim.activity : null,
        ransom_amount: null,
        leak_site_url: victim.claim_url || victim.url || null,
        screenshot_url: victim.screenshot || null,
        data_leaked: !!victim.claim_url,
        source: "ransomware.live",
        is_verified: true,
      })
      .select("id")
      .single();

    if (victimError || !insertedVictim) continue;

    if (victim.group) {
      const { data: group } = await serviceClient
        .from("threat_actor_groups")
        .select("id")
        .eq("name", victim.group)
        .maybeSingle();

      let groupId = group?.id;

      if (!groupId) {
        const { data: newGroup } = await serviceClient
          .from("threat_actor_groups")
          .insert({
            name: victim.group,
            is_active: true,
            severity_level: "high",
            first_seen: discoveryDate,
            last_activity: discoveryDate,
          })
          .select("id")
          .single();

        groupId = newGroup?.id;
      }

      if (groupId) {
        await serviceClient
          .from("victim_group_associations")
          .insert({
            victim_id: insertedVictim.id,
            group_id: groupId,
            confidence: "confirmed",
            attributed_date: discoveryDate,
          });
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (!(await verifyUser(req))) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/ransomware-intel", "");

    if (path === "/sync" || path === "/sync/") {
      try {
        const rawData = await fetchRansomwareLiveData();
        if (rawData && Array.isArray(rawData) && rawData.length > 0) {
          await syncVictimData(rawData);
          return new Response(
            JSON.stringify({ success: true, synced: rawData.length }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: "No data retrieved from ransomware.live" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (path === "/summary" || path === "/summary/") {
      const { data: summary } = await serviceClient
        .from("victim_intelligence_summary")
        .select("*")
        .maybeSingle();

      return new Response(
        JSON.stringify(summary || {}),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (path === "/victims" || path === "/victims/") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const sector = url.searchParams.get("sector");
      const country = url.searchParams.get("country");
      const groupId = url.searchParams.get("group_id");

      // Self-heal: if the newest victim is stale (>12h) kick a background sync.
      // Current data is served immediately; the next load sees fresh rows.
      try {
        const { data: newest } = await serviceClient
          .from("ransomware_victims")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const newestAge = newest?.created_at ? Date.now() - new Date(newest.created_at).getTime() : Infinity;
        if (newestAge > 12 * 60 * 60 * 1000) {
          const syncPromise = fetchRansomwareLiveData()
            .then((raw) => (raw && raw.length > 0 ? syncVictimData(raw) : undefined))
            .catch((e) => console.error("Background ransomware sync failed:", e));
          // deno-lint-ignore no-explicit-any
          (globalThis as any).EdgeRuntime?.waitUntil?.(syncPromise);
        }
      } catch (e) {
        console.error("Staleness check failed:", e);
      }

      // Left join (no !inner): victims without a group attribution still show.
      let query = serviceClient
        .from("ransomware_victims")
        .select(`
          *,
          victim_group_associations(
            group:threat_actor_groups(*)
          )
        `)
        .order("discovery_date", { ascending: false })
        .range(offset, offset + limit - 1);

      if (sector) query = query.eq("sector", sector);
      if (country) query = query.eq("country_code", country);
      if (groupId) query = query.eq("victim_group_associations.group_id", groupId);

      const { data: victims, error } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify({ victims: victims || [], total: victims?.length || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (path === "/groups" || path === "/groups/") {
      const { data: groups, error } = await serviceClient
        .from("threat_actor_groups")
        .select("*")
        .eq("is_active", true)
        .order("victim_count", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ groups: groups || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (path.startsWith("/group/")) {
      const groupId = path.split("/")[2];
      
      const { data: group, error: groupError } = await serviceClient
        .from("threat_actor_groups")
        .select(`
          *,
          victim_group_associations(
            victim:ransomware_victims(*)
          ),
          threat_actor_iocs(*)
        `)
        .eq("id", groupId)
        .maybeSingle();

      if (groupError) throw groupError;

      return new Response(
        JSON.stringify({ group: group || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (path === "/sectors" || path === "/sectors/") {
      const { data: sectors, error } = await serviceClient
        .from("ransomware_victims")
        .select("sector")
        .not("sector", "is", null);

      if (error) throw error;

      const sectorCounts: Record<string, number> = {};
      sectors?.forEach(v => {
        if (v.sector) {
          sectorCounts[v.sector] = (sectorCounts[v.sector] || 0) + 1;
        }
      });

      const sortedSectors = Object.entries(sectorCounts)
        .map(([sector, count]) => ({ sector, count }))
        .sort((a, b) => b.count - a.count);

      return new Response(
        JSON.stringify({ sectors: sortedSectors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (path === "/countries" || path === "/countries/") {
      const { data: countries, error } = await serviceClient
        .from("ransomware_victims")
        .select("country_code, country_name")
        .not("country_code", "is", null);

      if (error) throw error;

      const countryCounts: Record<string, { name: string; count: number }> = {};
      countries?.forEach(v => {
        if (v.country_code) {
          if (!countryCounts[v.country_code]) {
            countryCounts[v.country_code] = { name: v.country_name || v.country_code, count: 0 };
          }
          countryCounts[v.country_code].count++;
        }
      });

      const sortedCountries = Object.entries(countryCounts)
        .map(([code, data]) => ({ code, name: data.name, count: data.count }))
        .sort((a, b) => b.count - a.count);

      return new Response(
        JSON.stringify({ countries: sortedCountries }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        error: "Not found", 
        availableEndpoints: ["/sync", "/summary", "/victims", "/groups", "/group/:id", "/sectors", "/countries"] 
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
