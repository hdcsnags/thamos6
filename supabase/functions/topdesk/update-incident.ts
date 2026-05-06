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
    const { incidentId, action, status, topdeskUrl, username, appPassword } = await req.json();

    if (!incidentId || !topdeskUrl || !username || !appPassword) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = topdeskUrl.replace(/\/$/, '');
    const auth = btoa(`${username}:${appPassword}`);
    const body: Record<string, unknown> = {};

    if (action) body.action = action;
    if (status) {
      body.processingStatus = { name: status };
    }

    const response = await fetch(`${baseUrl}/tas/api/incidents/id/${incidentId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
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

    return new Response(
      JSON.stringify({ success: true, incident: data }),
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
