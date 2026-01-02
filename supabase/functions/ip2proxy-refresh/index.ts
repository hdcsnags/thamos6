import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ProxyRange {
  ip_from: number;
  ip_to: number;
  proxy_type: string;
  country_code?: string;
  country_name?: string;
  isp?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for CSV data or URL
    const body = await req.json();
    const { csvData, sourceUrl } = body;

    if (!csvData) {
      return new Response(
        JSON.stringify({ 
          error: 'CSV data required',
          instructions: 'Download IP2Proxy LITE from https://lite.ip2location.com/database/px1-ip-proxytype and provide CSV data'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse CSV data
    const lines = csvData.trim().split('\n');
    const ranges: ProxyRange[] = [];

    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;
      
      // IP2Proxy LITE CSV format: "ip_from","ip_to","proxy_type","country_code","country_name","isp"
      const match = line.match(/"([^"]+)","([^"]+)","([^"]+)","([^"]*)","([^"]*)","([^"]*)"/);      
      if (match) {
        ranges.push({
          ip_from: parseInt(match[1]),
          ip_to: parseInt(match[2]),
          proxy_type: match[3],
          country_code: match[4] || null,
          country_name: match[5] || null,
          isp: match[6] || null,
        });
      }
    }

    if (ranges.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid ranges parsed from CSV' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clear existing data
    await supabase.from('ip2proxy_ranges').delete().neq('id', 0);

    // Insert in batches of 1000
    const batchSize = 1000;
    for (let i = 0; i < ranges.length; i += batchSize) {
      const batch = ranges.slice(i, i + batchSize);
      const { error } = await supabase.from('ip2proxy_ranges').insert(batch);
      if (error) {
        console.error('Batch insert error:', error);
      }
    }

    // Update metadata
    await supabase.from('ip2proxy_metadata').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('ip2proxy_metadata').insert({
      last_updated: new Date().toISOString(),
      version: new Date().toISOString().split('T')[0],
      total_records: ranges.length,
      source_url: sourceUrl || 'Manual upload',
    });

    return new Response(
      JSON.stringify({
        success: true,
        loaded: ranges.length,
        message: `Successfully loaded ${ranges.length} IP2Proxy ranges`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});