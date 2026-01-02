/*
  # Add Missing RSS Sources from SOC Resource Document

  1. New Sources
    - NVD CVE Feed (NIST) - Official CVE feed for vulnerability tracking
    - NCSC UK All Updates - UK government security advisories
    - Securelist (Kaspersky) - APT research and malware analysis
    - Malware Traffic Analysis - Real-world malware infection traffic and IOCs
  
  2. Categories
    - NVD and NCSC UK -> vulnerabilities
    - Securelist and Malware Traffic Analysis -> threats
*/

INSERT INTO rss_sources (id, name, url, category, description, is_active, created_at)
VALUES 
  (
    gen_random_uuid(),
    'NVD CVE Feed',
    'https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml',
    'vulnerabilities',
    'Official NIST feed of newly published CVEs and vulnerability updates. Useful for 0-day and CVE tracking.',
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'NCSC UK',
    'https://www.ncsc.gov.uk/api/1/services/v1/all-updates.rss',
    'alerts',
    'Combined feed of NCSC guidance, news, and reports. Covers UK government advisories and security news.',
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'Securelist',
    'https://securelist.com/feed/',
    'threats',
    'Kaspersky research-driven reports on APT actors, malware campaigns, and IoCs. Great for threat intel and reverse engineering.',
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'Malware Traffic Analysis',
    'https://www.malware-traffic-analysis.net/blog-entries.rss',
    'threats',
    'Reverse-engineering blog featuring real-world malware infection traffic, PCAPs, and IOC breakdowns.',
    true,
    now()
  )
ON CONFLICT (url) DO NOTHING;