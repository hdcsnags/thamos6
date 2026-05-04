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
    const { incidents, primaryId } = await req.json();

    if (!incidents || !primaryId) {
      return new Response(
        JSON.stringify({ error: 'Missing incidents or primaryId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sort by creation date descending
    const sorted = [...incidents].sort(
      (a, b) => new Date(b.createdDate || b.callDate).getTime() - new Date(a.createdDate || a.callDate).getTime()
    );

    const primary = sorted.find(i => i.id === primaryId);
    const duplicates = sorted.filter(i => i.id !== primaryId && i.status !== 'closed');

    // Build enrichment text from duplicates
    const enrichment = duplicates.map(d =>
      `Related ticket ${d.number} (${new Date(d.createdDate || d.callDate).toLocaleDateString()}): ${d.briefDescription || d.action}`
    ).join('\n\n');

    return new Response(
      JSON.stringify({
        primary,
        duplicates,
        duplicateCount: duplicates.length,
        enrichmentText: enrichment,
        canMerge: duplicates.length > 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
