/*
  # Phase 2.5 — New Default RSS Sources

  Adds Abuse.ch threat intelligence feeds (MalwareBazaar, URLhaus, ThreatFox)
  to the default rss_sources list. These are already queried by the threat-intel
  edge function, so surfacing them in the Intel Dashboard closes the loop.

  All three use ON CONFLICT DO NOTHING so re-running is safe.
*/

INSERT INTO rss_sources (name, url, category, description, is_active)
VALUES
  (
    'MalwareBazaar (Abuse.ch)',
    'https://bazaar.abuse.ch/export/rss/recent/',
    'threats',
    'Recent malware samples submitted to MalwareBazaar. Pairs with /hash lookups.',
    true
  ),
  (
    'URLhaus (Abuse.ch)',
    'https://urlhaus.abuse.ch/feeds/recent/',
    'threats',
    'Recently reported malware-distributing URLs. Pairs with /url lookups.',
    true
  ),
  (
    'ThreatFox (Abuse.ch)',
    'https://threatfox.abuse.ch/export/rss/',
    'threats',
    'IOC feed from ThreatFox — IPs, domains, hashes linked to malware.',
    true
  )
ON CONFLICT (url) DO NOTHING;
