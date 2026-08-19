/*
  # Fix dead NCSC UK RSS URL

  NCSC restructured their RSS feed paths at some point after this source was
  added — the old `all-updates.rss` path now 404s. Verified live replacement:
  https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml (20 items,
  200 OK as of 2026-08-19).
*/

UPDATE rss_sources
SET url = 'https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml'
WHERE name = 'NCSC UK';
