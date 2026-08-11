/*
  Supabase grants function execution directly to API roles through its default
  privileges. Restrict the longitudinal graph writer to the service role.
*/

REVOKE ALL ON FUNCTION public.record_ioc_relationship(
  text, text, text, text, text, text, timestamptz, integer, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_ioc_relationship(
  text, text, text, text, text, text, timestamptz, integer, text, jsonb
) TO service_role;
