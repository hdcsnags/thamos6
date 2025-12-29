import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  guid: string;
}

function parseRSSFeed(xmlText: string): RSSItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  if (!doc) return [];

  const items: RSSItem[] = [];

  // Try RSS format first
  const rssItems = doc.querySelectorAll("item");
  if (rssItems.length > 0) {
    for (const item of rssItems) {
      const title = item.querySelector("title")?.textContent?.trim() ?? "";
      const description = item.querySelector("description")?.textContent?.trim() ?? "";
      const link = item.querySelector("link")?.textContent?.trim() ?? "";
      const pubDateText = item.querySelector("pubDate")?.textContent?.trim() ?? "";
      const guid = item.querySelector("guid")?.textContent?.trim() ?? link;

      if (title && link) {
        items.push({
          title,
          description,
          link,
          pubDate: pubDateText ? new Date(pubDateText).toISOString() : new Date().toISOString(),
          guid,
        });
      }
    }
    return items;
  }

  // Try Atom format
  const atomEntries = doc.querySelectorAll("entry");
  if (atomEntries.length > 0) {
    for (const entry of atomEntries) {
      const title = entry.querySelector("title")?.textContent?.trim() ?? "";
      const summary = entry.querySelector("summary")?.textContent?.trim() ?? "";
      const content = entry.querySelector("content")?.textContent?.trim() ?? "";
      const description = content || summary;
      
      const linkEl = entry.querySelector("link[href]");
      const link = linkEl?.getAttribute("href") ?? "";
      
      const published = entry.querySelector("published")?.textContent?.trim() ?? "";
      const updated = entry.querySelector("updated")?.textContent?.trim() ?? "";
      const pubDateText = published || updated;
      
      const id = entry.querySelector("id")?.textContent?.trim() ?? link;

      if (title && link) {
        items.push({
          title,
          description,
          link,
          pubDate: pubDateText ? new Date(pubDateText).toISOString() : new Date().toISOString(),
          guid: id,
        });
      }
    }
  }

  return items;
}

async function fetchAndStoreFeed(sourceId: string, url: string): Promise<{ success: boolean; itemsAdded: number; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ThreatIntelBot/1.0)",
      },
    });

    if (!response.ok) {
      return { success: false, itemsAdded: 0, error: `HTTP ${response.status}` };
    }

    const xmlText = await response.text();
    const items = parseRSSFeed(xmlText);

    if (items.length === 0) {
      return { success: false, itemsAdded: 0, error: "No items found in feed" };
    }

    let itemsAdded = 0;
    for (const item of items) {
      const { error } = await serviceClient
        .from("feed_items")
        .upsert({
          source_id: sourceId,
          title: item.title,
          description: item.description,
          link: item.link,
          pub_date: item.pubDate,
          guid: item.guid,
        }, { onConflict: "source_id,guid", ignoreDuplicates: true });

      if (!error) itemsAdded++;
    }

    return { success: true, itemsAdded };
  } catch (e) {
    return { success: false, itemsAdded: 0, error: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/news-feeds", "");

    // GET /sources - Get all active RSS sources
    if ((path === "/sources" || path === "/sources/") && req.method === "GET") {
      const { data, error } = await serviceClient
        .from("rss_sources")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      return new Response(JSON.stringify({ sources: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /items - Get recent feed items with optional filters
    if ((path === "/items" || path === "/items/") && req.method === "GET") {
      const category = url.searchParams.get("category");
      const sourceId = url.searchParams.get("source_id");
      const limit = parseInt(url.searchParams.get("limit") ?? "50");

      let query = serviceClient
        .from("feed_items")
        .select(`
          *,
          source:rss_sources!inner(
            id,
            name,
            category,
            icon_url
          )
        `)
        .order("pub_date", { ascending: false })
        .limit(Math.min(limit, 100));

      if (category) {
        query = query.eq("source.category", category);
      }

      if (sourceId) {
        query = query.eq("source_id", sourceId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify({ items: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /refresh - Refresh feeds (fetch from sources)
    if ((path === "/refresh" || path === "/refresh/") && req.method === "POST") {
      const body = await req.json();
      const sourceIds = body.source_ids ?? [];

      // Get sources to refresh
      let sourcesQuery = serviceClient
        .from("rss_sources")
        .select("*")
        .eq("is_active", true);

      if (sourceIds.length > 0) {
        sourcesQuery = sourcesQuery.in("id", sourceIds);
      }

      const { data: sources, error: sourcesError } = await sourcesQuery;

      if (sourcesError) throw sourcesError;
      if (!sources || sources.length === 0) {
        return new Response(JSON.stringify({ error: "No sources found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Refresh each feed
      const results = await Promise.all(
        sources.map(source => fetchAndStoreFeed(source.id, source.url))
      );

      const summary = {
        total: sources.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalItemsAdded: results.reduce((sum, r) => sum + r.itemsAdded, 0),
        details: sources.map((source, i) => ({
          source: source.name,
          ...results[i],
        })),
      };

      return new Response(JSON.stringify(summary), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Not found", availableEndpoints: ["/sources", "/items", "/refresh"] }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
