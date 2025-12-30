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

async function getAuthUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  
  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return { id: user.id };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

async function fetchAndStoreDefaultFeed(sourceId: string, url: string): Promise<{ success: boolean; itemsAdded: number; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ThreatIntelBot/1.0)" },
    });
    if (!response.ok) return { success: false, itemsAdded: 0, error: `HTTP ${response.status}` };

    const xmlText = await response.text();
    const items = parseRSSFeed(xmlText);
    if (items.length === 0) return { success: false, itemsAdded: 0, error: "No items found" };

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

async function fetchAndStoreUserFeed(userId: string, sourceId: string, url: string): Promise<{ success: boolean; itemsAdded: number; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ThreatIntelBot/1.0)" },
    });
    if (!response.ok) return { success: false, itemsAdded: 0, error: `HTTP ${response.status}` };

    const xmlText = await response.text();
    const items = parseRSSFeed(xmlText);
    if (items.length === 0) return { success: false, itemsAdded: 0, error: "No items found" };

    let itemsAdded = 0;
    for (const item of items) {
      const { error } = await serviceClient
        .from("user_custom_feed_items")
        .upsert({
          user_id: userId,
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
    const path = url.pathname.replace("/news-feeds", "").replace(/\/$/, "") || "/";
    const user = await getAuthUser(req);

    // ============ PUBLIC ENDPOINTS ============
    
    // GET /sources - list default sources (public)
    if (path === "/sources" && req.method === "GET") {
      const { data, error } = await serviceClient
        .from("rss_sources")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return jsonResponse({ sources: data ?? [] });
    }

    // GET /items - list items from default sources (public)
    if (path === "/items" && req.method === "GET") {
      const category = url.searchParams.get("category");
      const sourceId = url.searchParams.get("source_id");
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);

      let query = serviceClient
        .from("feed_items")
        .select(`*, source:rss_sources!inner(id, name, category, icon_url)`)
        .order("pub_date", { ascending: false })
        .limit(limit);

      if (category) query = query.eq("source.category", category);
      if (sourceId) query = query.eq("source_id", sourceId);

      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse({ items: data ?? [] });
    }

    // POST /refresh - refresh default feeds (public, for cron jobs)
    if (path === "/refresh" && req.method === "POST") {
      const { data: sources, error } = await serviceClient
        .from("rss_sources")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      if (!sources?.length) return errorResponse("No sources found", 404);

      const results = await Promise.all(
        sources.map(s => fetchAndStoreDefaultFeed(s.id, s.url))
      );

      return jsonResponse({
        total: sources.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalItemsAdded: results.reduce((sum, r) => sum + r.itemsAdded, 0),
      });
    }

    // ============ AUTHENTICATED ENDPOINTS ============
    
    if (!user) {
      return errorResponse("Authentication required", 401);
    }

    // GET /my/sources - user's sources (custom + defaults with preferences)
    if (path === "/my/sources" && req.method === "GET") {
      const [defaultRes, customRes, prefsRes] = await Promise.all([
        serviceClient.from("rss_sources").select("*").eq("is_active", true).order("name"),
        serviceClient.from("user_custom_sources").select("*").eq("user_id", user.id).order("name"),
        serviceClient.from("user_feed_preferences").select("*").eq("user_id", user.id),
      ]);

      const prefs = new Map((prefsRes.data ?? []).map(p => [p.source_id, p.is_enabled]));
      
      const defaultSources = (defaultRes.data ?? []).map(s => ({
        ...s,
        is_default: true,
        is_enabled: prefs.has(s.id) ? prefs.get(s.id) : true,
      }));

      const customSources = (customRes.data ?? []).map(s => ({
        ...s,
        is_default: false,
        is_enabled: s.is_active,
      }));

      return jsonResponse({ sources: [...defaultSources, ...customSources] });
    }

    // POST /my/sources - add custom source
    if (path === "/my/sources" && req.method === "POST") {
      const body = await req.json();
      const { name, url: feedUrl, category, description } = body;

      if (!name || !feedUrl || !category) {
        return errorResponse("Missing required fields: name, url, category");
      }

      const validCategories = ['vulnerabilities', 'alerts', 'threats', 'news'];
      if (!validCategories.includes(category)) {
        return errorResponse(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
      }

      const { data, error } = await serviceClient
        .from("user_custom_sources")
        .insert({ user_id: user.id, name, url: feedUrl, category, description })
        .select()
        .single();

      if (error) return errorResponse(error.message);

      // Fetch initial items
      await fetchAndStoreUserFeed(user.id, data.id, feedUrl);

      return jsonResponse({ source: { ...data, is_default: false, is_enabled: true } }, 201);
    }

    // DELETE /my/sources/:id - delete custom source
    const deleteMatch = path.match(/^\/my\/sources\/([a-f0-9-]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const sourceId = deleteMatch[1];
      const { error } = await serviceClient
        .from("user_custom_sources")
        .delete()
        .eq("id", sourceId)
        .eq("user_id", user.id);

      if (error) return errorResponse(error.message);
      return jsonResponse({ success: true });
    }

    // POST /my/preferences - toggle default source on/off
    if (path === "/my/preferences" && req.method === "POST") {
      const body = await req.json();
      const { source_id, is_enabled } = body;

      if (!source_id || typeof is_enabled !== 'boolean') {
        return errorResponse("Missing required fields: source_id, is_enabled");
      }

      const { data, error } = await serviceClient
        .from("user_feed_preferences")
        .upsert({ user_id: user.id, source_id, is_enabled }, { onConflict: "user_id,source_id" })
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ preference: data });
    }

    // GET /my/items - user's combined feed
    if (path === "/my/items" && req.method === "GET") {
      const category = url.searchParams.get("category");
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
      const unreadOnly = url.searchParams.get("unread") === "true";
      const savedOnly = url.searchParams.get("saved") === "true";

      // Get user preferences
      const { data: prefs } = await serviceClient
        .from("user_feed_preferences")
        .select("source_id, is_enabled")
        .eq("user_id", user.id);
      
      const disabledSources = (prefs ?? []).filter(p => !p.is_enabled).map(p => p.source_id);

      // Get default feed items
      let defaultQuery = serviceClient
        .from("feed_items")
        .select(`*, source:rss_sources!inner(id, name, category, icon_url)`)
        .order("pub_date", { ascending: false })
        .limit(limit);

      if (category) defaultQuery = defaultQuery.eq("source.category", category);
      if (disabledSources.length > 0) {
        defaultQuery = defaultQuery.not("source_id", "in", `(${disabledSources.join(",")})`);
      }

      // Get custom feed items
      let customQuery = serviceClient
        .from("user_custom_feed_items")
        .select(`*, source:user_custom_sources!inner(id, name, category, icon_url)`)
        .eq("user_id", user.id)
        .order("pub_date", { ascending: false })
        .limit(limit);

      if (category) customQuery = customQuery.eq("source.category", category);

      // Get user's read/saved status
      const { data: userItems } = await serviceClient
        .from("user_feed_items")
        .select("item_id, is_read, is_saved")
        .eq("user_id", user.id);

      const itemStatus = new Map((userItems ?? []).map(i => [i.item_id, { is_read: i.is_read, is_saved: i.is_saved }]));

      const [defaultRes, customRes] = await Promise.all([defaultQuery, customQuery]);

      let allItems = [
        ...(defaultRes.data ?? []).map(item => ({
          ...item,
          is_custom: false,
          is_read: itemStatus.get(item.id)?.is_read ?? false,
          is_saved: itemStatus.get(item.id)?.is_saved ?? false,
        })),
        ...(customRes.data ?? []).map(item => ({
          ...item,
          is_custom: true,
          is_read: false,
          is_saved: false,
        })),
      ];

      // Sort by pub_date
      allItems.sort((a, b) => new Date(b.pub_date).getTime() - new Date(a.pub_date).getTime());

      // Apply filters
      if (unreadOnly) allItems = allItems.filter(i => !i.is_read);
      if (savedOnly) allItems = allItems.filter(i => i.is_saved);

      return jsonResponse({ items: allItems.slice(0, limit) });
    }

    // POST /my/items/:id/read - mark item as read
    const readMatch = path.match(/^\/my\/items\/([a-f0-9-]+)\/read$/);
    if (readMatch && req.method === "POST") {
      const itemId = readMatch[1];
      const { data, error } = await serviceClient
        .from("user_feed_items")
        .upsert({ user_id: user.id, item_id: itemId, is_read: true, read_at: new Date().toISOString() }, { onConflict: "user_id,item_id" })
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ success: true, item: data });
    }

    // POST /my/items/:id/save - toggle saved status
    const saveMatch = path.match(/^\/my\/items\/([a-f0-9-]+)\/save$/);
    if (saveMatch && req.method === "POST") {
      const itemId = saveMatch[1];
      const body = await req.json();
      const isSaved = body.is_saved ?? true;

      const { data, error } = await serviceClient
        .from("user_feed_items")
        .upsert({ 
          user_id: user.id, 
          item_id: itemId, 
          is_saved: isSaved, 
          saved_at: isSaved ? new Date().toISOString() : null 
        }, { onConflict: "user_id,item_id" })
        .select()
        .single();

      if (error) return errorResponse(error.message);
      return jsonResponse({ success: true, item: data });
    }

    // POST /my/refresh - refresh user's custom feeds
    if (path === "/my/refresh" && req.method === "POST") {
      const { data: sources, error } = await serviceClient
        .from("user_custom_sources")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (error) throw error;
      if (!sources?.length) return jsonResponse({ total: 0, successful: 0, failed: 0, totalItemsAdded: 0 });

      const results = await Promise.all(
        sources.map(s => fetchAndStoreUserFeed(user.id, s.id, s.url))
      );

      return jsonResponse({
        total: sources.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalItemsAdded: results.reduce((sum, r) => sum + r.itemsAdded, 0),
      });
    }

    return errorResponse("Not found", 404);
  } catch (error) {
    return errorResponse(String(error), 500);
  }
});