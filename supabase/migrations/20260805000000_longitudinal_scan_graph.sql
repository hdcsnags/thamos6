/*
  # Longitudinal scan history + cumulative IOC context graph

  `scan_observations` is the append-only event layer. Each persisted scan gets
  one row so analysts can distinguish "we looked at this again" from a changed
  relationship.

  `record_ioc_relationship` is the cumulative graph layer. Re-observing an
  edge increments its count and advances its time window instead of replacing
  the previous evidence.

  Location, ASN, ISP, organisation, and VPN-provider edges are context only.
  They do not imply that either endpoint is malicious.
*/

CREATE TABLE IF NOT EXISTS scan_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ioc_type text NOT NULL,
  ioc_value text NOT NULL,
  verdict text NOT NULL DEFAULT 'unknown',
  is_malicious boolean NOT NULL DEFAULT false,
  threat_score integer CHECK (threat_score BETWEEN 0 AND 100),
  confidence text,
  context text NOT NULL DEFAULT 'unknown',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enrichment jsonb NOT NULL DEFAULT '{}',
  sources_checked text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_observations_ioc_time
  ON scan_observations(ioc_type, ioc_value, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_observations_context_time
  ON scan_observations(context, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_observations_verdict_time
  ON scan_observations(verdict, observed_at DESC);

ALTER TABLE scan_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read scan observations" ON scan_observations;
CREATE POLICY "Authenticated users can read scan observations"
  ON scan_observations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can write scan observations" ON scan_observations;
CREATE POLICY "Service role can write scan observations"
  ON scan_observations FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE ioc_relationships
  DROP CONSTRAINT IF EXISTS ioc_relationships_edge_type_check;
ALTER TABLE ioc_relationships
  ADD CONSTRAINT ioc_relationships_edge_type_check CHECK (edge_type IN (
    'resolves_to', 'cert_san', 'hosted_on', 'signed_by', 'seen_with', 'related_hash',
    'extracted_from_email', 'sent_by',
    'announced_by', 'located_in', 'operated_by', 'uses_vpn_provider'
  ));

CREATE OR REPLACE FUNCTION record_ioc_relationship(
  p_source_type text,
  p_source_value text,
  p_target_type text,
  p_target_value text,
  p_edge_type text,
  p_source_dataset text,
  p_observed_at timestamptz DEFAULT now(),
  p_observation_count integer DEFAULT 1,
  p_confidence text DEFAULT 'medium',
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  relationship_id uuid;
BEGIN
  INSERT INTO ioc_relationships (
    source_type, source_value, target_type, target_value, edge_type,
    first_seen, last_seen, observation_count, confidence, source_dataset, metadata
  ) VALUES (
    lower(trim(p_source_type)), lower(trim(p_source_value)),
    lower(trim(p_target_type)), lower(trim(p_target_value)),
    p_edge_type, p_observed_at, p_observed_at,
    greatest(coalesce(p_observation_count, 1), 1), p_confidence,
    lower(trim(p_source_dataset)), coalesce(p_metadata, '{}')
  )
  ON CONFLICT (source_type, source_value, target_type, target_value, edge_type, source_dataset)
  DO UPDATE SET
    first_seen = least(
      coalesce(ioc_relationships.first_seen, EXCLUDED.first_seen),
      EXCLUDED.first_seen
    ),
    last_seen = greatest(
      coalesce(ioc_relationships.last_seen, EXCLUDED.last_seen),
      EXCLUDED.last_seen
    ),
    observation_count = ioc_relationships.observation_count + EXCLUDED.observation_count,
    confidence = EXCLUDED.confidence,
    metadata = ioc_relationships.metadata || EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO relationship_id;

  RETURN relationship_id;
END;
$$;

REVOKE ALL ON FUNCTION record_ioc_relationship(
  text, text, text, text, text, text, timestamptz, integer, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_ioc_relationship(
  text, text, text, text, text, text, timestamptz, integer, text, jsonb
) TO service_role;
