/*
  # Optimize IP Range Query Performance

  1. Performance Improvements
    - Add composite BTREE index on (ip_from, ip_to) for faster range queries
    - These indexes dramatically speed up "IP falls within range" lookups
    - Composite index helps PostgreSQL choose optimal query plans
  
  2. Additional Optimizations
    - Add index on tor_exit_nodes for faster IP lookups
    - Add indexes on vpn_providers for ASN and org pattern matching
    - Run ANALYZE to update query planner statistics
  
  3. Notes
    - The composite index on (ip_from, ip_to) is highly effective for range queries
    - PostgreSQL can use this for "WHERE ip_from <= X AND ip_to >= X" queries
    - Individual indexes on ip_from and ip_to already exist from previous migration
*/

CREATE INDEX IF NOT EXISTS idx_ip2proxy_composite ON ip2proxy_ranges(ip_from, ip_to);

CREATE INDEX IF NOT EXISTS idx_tor_exit_nodes_ip ON tor_exit_nodes(ip_address);

CREATE INDEX IF NOT EXISTS idx_vpn_providers_asn ON vpn_providers(asn) WHERE asn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vpn_providers_org ON vpn_providers(org_pattern) WHERE org_pattern IS NOT NULL;

ANALYZE ip2proxy_ranges;
ANALYZE tor_exit_nodes;
ANALYZE vpn_providers;