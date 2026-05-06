import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, topdeskUrl, username, appPassword } = await req.json();

    if (!query || !topdeskUrl || !username || !appPassword) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize URL — remove trailing slash
    const baseUrl = topdeskUrl.replace(/\/$/, '');
    const auth = btoa(`${username}:${appPassword}`);

    // TopDesk incident search API
    const searchUrl = new URL(`${baseUrl}/tas/api/incidents`);
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('page_size', '100');

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('TopDesk API error:', response.status, text);
      return new Response(
        JSON.stringify({ error: `TopDesk API error: ${response.status}`, details: text }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // TopDesk returns { results: [...], page: {...} } or just an array
    const incidents = Array.isArray(data) ? data : (data.results || data.item || []);

    return new Response(
      JSON.stringify({ incidents, count: incidents.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
