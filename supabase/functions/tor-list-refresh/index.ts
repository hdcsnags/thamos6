import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sourceUrl = "https://check.torproject.org/torbulkexitlist";
    
    console.log("Fetching Tor exit list from:", sourceUrl);
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Thamos6-ThreatIntel/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Tor list: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const lines = text.split("\n").filter(line => line.trim());
    
    const ipAddresses = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#") && /^\d+\.\d+\.\d+\.\d+$/.test(trimmed);
    });

    console.log(`Found ${ipAddresses.length} Tor exit nodes`);

    if (ipAddresses.length === 0) {
      throw new Error("No valid IP addresses found in Tor exit list");
    }

    const { error: deleteError } = await supabase
      .from("tor_exit_nodes")
      .delete()
      .neq("ip_address", "0.0.0.0");

    if (deleteError) {
      console.error("Error clearing old Tor list:", deleteError);
    }

    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < ipAddresses.length; i += batchSize) {
      const batch = ipAddresses.slice(i, i + batchSize);
      const records = batch.map(ip => ({
        ip_address: ip,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from("tor_exit_nodes")
        .upsert(records, { onConflict: "ip_address" });

      if (insertError) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError);
      } else {
        inserted += batch.length;
      }
    }

    const { error: metadataError } = await supabase
      .from("tor_list_metadata")
      .insert({
        last_refresh: new Date().toISOString(),
        source_url: sourceUrl,
        node_count: inserted,
        status: "success",
      });

    if (metadataError) {
      console.error("Error updating metadata:", metadataError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        nodes_updated: inserted,
        source: sourceUrl,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error refreshing Tor list:", error);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase
      .from("tor_list_metadata")
      .insert({
        last_refresh: new Date().toISOString(),
        source_url: "https://check.torproject.org/torbulkexitlist",
        node_count: 0,
        status: "error",
      });

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});