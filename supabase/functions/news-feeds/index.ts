import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function extractText(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return match[1].replace(/<!\[CDATA\[([\\s\\S]*?)\]\]>/g, '$1').trim();
}

function parseRSSFeed(xmlText: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Try RSS format
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    const title = extractText(itemXml, 'title');
    const description = extractText(itemXml, 'description');
    const link = extractText(itemXml, 'link');
    const pubDate = extractText(itemXml, 'pubDate');
    const guid = extractText(itemXml, 'guid') || link;

    if (title && link) {
      items.push({
        title,
        description,
        link,
        pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        guid: guid || link,
      });
    }
  }

  // Try Atom format if no RSS items found
  if (items.length === 0) {
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xmlText)) !== null) {
      const entryXml = match[1];
      const title = extractText(entryXml, 'title');
      const summary = extractText(entryXml, 'summary') || extractText(entryXml, 'content');
      const linkMatch = entryXml.match(/<link[^>]+href=["']([^"']+)["']/i);
      const link = linkMatch ? linkMatch[1] : '';
      const published = extractText(entryXml, 'published') || extractText(entryXml, 'updated');
      const id = extractText(entryXml, 'id') || link;

      if (title && link) {
        items.push({
          title,
          description: summary,
          link,
          pubDate: published ? new Date(published).toISOString() : new Date().toISOString(),
          guid: id || link,
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