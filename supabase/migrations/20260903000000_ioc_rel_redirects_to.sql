-- URL scans now write to the threat graph (scan_observations + ioc_relationships).
-- The detonation writer records `redirects_to` (submitted URL -> final landing URL
-- per urlscan.io), which the edge_type CHECK did not allow. Extend the list;
-- everything previously permitted stays permitted.

ALTER TABLE ioc_relationships
  DROP CONSTRAINT IF EXISTS ioc_relationships_edge_type_check;
ALTER TABLE ioc_relationships
  ADD CONSTRAINT ioc_relationships_edge_type_check CHECK (edge_type IN (
    'resolves_to', 'cert_san', 'hosted_on', 'signed_by', 'seen_with', 'related_hash',
    'extracted_from_email', 'sent_by',
    'announced_by', 'located_in', 'operated_by', 'uses_vpn_provider',
    'redirects_to'
  ));
