export interface ThreatResult {
  source: string;
  data: Record<string, unknown>;
  error?: string;
  threatScore?: number;
  isMalicious?: boolean;
}

export interface IPEnrichment {
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  org?: string;
  asn?: string;
  isVPN?: boolean;
  vpnService?: string;
  isTor?: boolean;
  isProxy?: boolean;
  isHosting?: boolean;
  isBot?: boolean;
  isMassScanner?: boolean;
  isKnownScanner?: boolean;
  scannerType?: string;
  spamhausListed?: boolean;
  spamhausLists?: string[];
  timezone?: string;
  lat?: number;
  lon?: number;
}

export interface ScoreContribution {
  source: string;
  points: number;
  weight: 'high' | 'medium' | 'low';
  note: string;
}

export interface ScoreVariance {
  field: string;
  values: { source: string; value: string }[];
  recommendation?: string;
}

export interface CalibratedScoring {
  calibrated: number;
  legacy: number | null;
  verdict: 'malicious' | 'suspicious' | 'low_signal' | 'no_signal';
  legacyDivergence: string | null;
  contributions: ScoreContribution[];
  variances: ScoreVariance[];
}

export interface IPLookupResult {
  ip: string;
  enrichment?: IPEnrichment;
  overallThreatScore: number;
  maxThreatScore: number;
  isMalicious: boolean;
  results: Record<string, ThreatResult>;
  scoring?: CalibratedScoring;
  checkedAt: string;
}

export interface URLLookupResult {
  url: string;
  isMalicious: boolean;
  threatTypes: string[];
  results: Record<string, ThreatResult>;
  overallThreatScore?: number;
  scoring?: CalibratedScoring;
  checkedAt: string;
}

export interface HashDetections {
  virustotal?: {
    malicious: number;
    suspicious: number;
    undetected: number;
    harmless: number;
    timeout: number;
    failure: number;
    total: number;
    malicious_names?: string[];
    file_type?: string;
    file_size?: number;
    first_seen?: string;
    last_seen?: string;
  };
  malwarebazaar?: {
    signature?: string;
    file_type?: string;
    file_size?: number;
    first_seen?: string;
    tags?: string[];
    threat_name?: string;
  };
  hybrid_analysis?: {
    verdict?: string;
    threat_score?: number;
    malware_family?: string;
    vx_family?: string;
    classification_tags?: string[];
  };
  alienvault?: {
    pulse_count?: number;
    pulses?: Array<{
      name: string;
      created: string;
      description?: string;
    }>;
  };
}

export interface HashLookupResult {
  hash: string;
  isMalicious: boolean;
  overallThreatScore: number;
  maxThreatScore: number;
  sources: Record<string, { checked: boolean; error?: string; threatScore?: number }>;
  detections: HashDetections;
  scoring?: CalibratedScoring;
  checkedAt: string;
  tier?: string;
  sourcesAvailable?: number;
}

export interface DomainWHOIS {
  domain: string;
  status?: string[];
  registrar?: string;
  registrationDate?: string;
  expirationDate?: string;
  lastChanged?: string;
  nameservers?: string[];
  domainAge?: number;
}

export interface DomainLookupResult {
  domain: string;
  isMalicious: boolean;
  overallThreatScore: number;
  maxThreatScore: number;
  sources: Record<string, { found: boolean; malicious: boolean; details: any; error?: string; threatScore?: number }>;
  scoring?: CalibratedScoring;
  whois?: DomainWHOIS | null;
  reputation?: number | null;
  categories?: Record<string, string> | null;
  checkedAt: string;
  tier?: string;
  sourcesAvailable?: string[];
}

export interface BulkIPResult {
  ip: string;
  threatScore: number;
  isMalicious: boolean;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  isp: string | null;
  isProxy: boolean;
  isHosting: boolean;
  abuseConfidence: number | null;
  inThreatFox: boolean;
  inURLhaus: boolean;
  isMassScanner: boolean;
  greynoiseClassification: string | null;
  spamhausListed: boolean;
  spamhausLists: string[];
}

export interface IPLookupRecord {
  id: string;
  ip_address: string;
  results: Record<string, ThreatResult>;
  threat_score: number;
  sources_checked: string[];
  created_at: string;
}

export interface URLLookupRecord {
  id: string;
  url: string;
  results: Record<string, ThreatResult>;
  is_malicious: boolean;
  threat_types: string[];
  created_at: string;
}

export interface ConfiguredSources {
  virustotal: boolean;
  abuseipdb: boolean;
  alienvault: boolean;
  shodan: boolean;
  ipqualityscore: boolean;
  urlscan: boolean;
  proxycheck: boolean;
  greynoise: boolean;
  ip2proxy: boolean;
  ipapi: boolean;
  threatfox: boolean;
  urlhaus: boolean;
  rdap: boolean;
  teoh: boolean;
  spamhaus: boolean;
}
