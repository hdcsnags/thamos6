/*
  # Lock down extension_iocs INSERT policy

  ## Problem
  The original "Service role can insert IOCs" policy was created with
  `WITH CHECK (true)` and no role restriction, which meant ANY client
  (including anon) could insert arbitrary IOC rows into any analysis.
  Since IOCs are fed into the THAMOS AI verdict prompt, this allowed
  data poisoning / prompt injection against analyst verdicts.

  ## Fix
  Drop the permissive policy and recreate it restricted to service_role.
  The analyze-extension edge function writes with the service role key,
  so legitimate inserts are unaffected.
*/

DROP POLICY IF EXISTS "Service role can insert IOCs" ON extension_iocs;

CREATE POLICY "Service role can insert IOCs"
  ON extension_iocs FOR INSERT
  TO service_role
  WITH CHECK (true);
