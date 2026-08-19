/*
  # Add abuse.ch keyed API sources + fetch_type column

  abuse.ch retired open/anonymous RSS for MalwareBazaar, URLhaus and
  ThreatFox — all three now require a free "Auth-Key" (one key covers
  all three abuse.ch products via the unified auth.abuse.ch portal) and
  each uses a different request shape (form POST / JSON POST / keyed
  GET), not RSS. `fetch_type` tells the news-feeds edge function which
  fetcher to use; `url` becomes the literal API endpoint to call.

  Also adds two new, verified-working, no-auth RSS sources:
  - The Record (Recorded Future's editorial newsroom)
  - Malwarebytes Labs blog
*/

ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS fetch_type text NOT NULL DEFAULT 'rss';

UPDATE rss_sources SET fetch_type = 'abusech_bazaar', url = 'https://mb-api.abuse.ch/api/v1/'
WHERE name = 'MalwareBazaar (Abuse.ch)';

UPDATE rss_sources SET fetch_type = 'abusech_urlhaus', url = 'https://urlhaus-api.abuse.ch/v1/urls/recent/'
WHERE name = 'URLhaus (Abuse.ch)';

UPDATE rss_sources SET fetch_type = 'abusech_threatfox', url = 'https://threatfox-api.abuse.ch/api/v1/'
WHERE name = 'ThreatFox (Abuse.ch)';

INSERT INTO rss_sources (name, url, category, description, is_active, fetch_type)
VALUES
  (
    'The Record',
    'https://therecord.media/feed',
    'news',
    'Recorded Future''s editorial newsroom — daily cybersecurity journalism.',
    true,
    'rss'
  ),
  (
    'Malwarebytes Labs',
    'https://www.malwarebytes.com/blog/feed/index.xml',
    'news',
    'Malwarebytes threat research and security news.',
    true,
    'rss'
  )
ON CONFLICT (url) DO NOTHING;
