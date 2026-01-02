import { CheckCircle, XCircle, AlertCircle, ExternalLink, ChevronDown, ChevronUp, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import type { ThreatResult } from '../types';

interface SourceCardProps {
  source: string;
  result: ThreatResult;
}

const sourceInfo: Record<string, { name: string; url: string; description: string }> = {
  ipapi: {
    name: 'IP-API',
    url: 'https://ip-api.com',
    description: 'Geolocation & proxy detection',
  },
  proxycheck: {
    name: 'ProxyCheck.io',
    url: 'https://proxycheck.io',
    description: 'VPN & proxy detection',
  },
  virustotal: {
    name: 'VirusTotal',
    url: 'https://virustotal.com',
    description: 'Multi-engine malware scanner',
  },
  abuseipdb: {
    name: 'AbuseIPDB',
    url: 'https://abuseipdb.com',
    description: 'IP abuse reports database',
  },
  alienvault: {
    name: 'AlienVault OTX',
    url: 'https://otx.alienvault.com',
    description: 'Open threat intelligence',
  },
  shodan: {
    name: 'Shodan',
    url: 'https://shodan.io',
    description: 'Internet device search engine',
  },
  ipqualityscore: {
    name: 'IPQualityScore',
    url: 'https://ipqualityscore.com',
    description: 'Fraud & risk scoring',
  },
  threatfox: {
    name: 'ThreatFox',
    url: 'https://threatfox.abuse.ch',
    description: 'IOC sharing platform',
  },
  urlhaus: {
    name: 'URLhaus',
    url: 'https://urlhaus.abuse.ch',
    description: 'Malware URL tracker',
  },
  rdap: {
    name: 'RDAP/WHOIS',
    url: 'https://about.rdap.org',
    description: 'Registration data',
  },
  virustotal_url: {
    name: 'VirusTotal URL',
    url: 'https://virustotal.com',
    description: 'URL scanning service',
  },
  urlscan: {
    name: 'URLScan.io',
    url: 'https://urlscan.io',
    description: 'URL sandbox analysis',
  },
  urlhaus_url: {
    name: 'URLhaus',
    url: 'https://urlhaus.abuse.ch',
    description: 'Malware URL database',
  },
  tor_exit_list: {
    name: 'Tor Exit List',
    url: 'https://check.torproject.org',
    description: 'Official Tor Project exit nodes',
  },
  vpn_provider: {
    name: 'VPN Provider',
    url: '#',
    description: 'ASN-based VPN identification',
  },
  teoh: {
    name: 'Teoh VPN',
    url: 'https://ip.teoh.io',
    description: 'VPN & proxy detection',
  },
  greynoise: {
    name: 'GreyNoise',
    url: 'https://greynoise.io',
    description: 'Internet scanner detection',
  },
  spamhaus: {
    name: 'Spamhaus',
    url: 'https://spamhaus.org',
    description: 'Blocklist reputation',
  },
};

function extractKeyData(source: string, data: Record<string, unknown>): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

  switch (source) {
    case 'ipapi': {
      const d = data as any;
      if (d) {
        if (d.country) result['Country'] = d.country;
        if (d.city) result['City'] = d.city;
        if (d.isp) result['ISP'] = d.isp;
        if (d.org) result['Organization'] = d.org;
        result['Proxy'] = d.proxy === true;
        result['Hosting'] = d.hosting === true;
        if (d.timezone) result['Timezone'] = d.timezone;
      }
      break;
    }
    case 'proxycheck': {
      const d = data as any;
      const ipData = d ? Object.values(d).find((v: any) => typeof v === 'object' && v !== null && 'proxy' in v) as any : null;
      if (ipData) {
        result['Proxy'] = ipData.proxy === 'yes';
        if (ipData.type) result['Type'] = ipData.type;
        if (ipData.provider) result['Provider'] = ipData.provider;
        if (ipData.country) result['Country'] = ipData.country;
        if (ipData.risk !== undefined) result['Risk Score'] = ipData.risk;
      }
      break;
    }
    case 'virustotal': {
      const attrs = (data as any)?.data?.attributes;
      if (attrs) {
        const stats = attrs.last_analysis_stats;
        if (stats) {
          result['Malicious'] = stats.malicious || 0;
          result['Suspicious'] = stats.suspicious || 0;
          result['Clean'] = stats.harmless || 0;
        }
        if (attrs.country) result['Country'] = attrs.country;
        if (attrs.as_owner) result['AS Owner'] = attrs.as_owner;
      }
      break;
    }
    case 'abuseipdb': {
      const d = (data as any)?.data;
      if (d) {
        result['Abuse Score'] = d.abuseConfidenceScore || 0;
        result['Total Reports'] = d.totalReports || 0;
        if (d.countryCode) result['Country'] = d.countryCode;
        if (d.isp) result['ISP'] = d.isp;
        if (d.usageType) result['Usage Type'] = d.usageType;
      }
      break;
    }
    case 'alienvault': {
      const d = data as any;
      if (d) {
        result['Pulse Count'] = d.pulse_info?.count || 0;
        if (d.country_name) result['Country'] = d.country_name;
        if (d.asn) result['ASN'] = d.asn;
      }
      break;
    }
    case 'shodan': {
      const d = data as any;
      if (d) {
        if (d.ports) result['Open Ports'] = d.ports.length;
        if (d.org) result['Organization'] = d.org;
        if (d.country_name) result['Country'] = d.country_name;
        if (d.vulns) result['Vulnerabilities'] = Object.keys(d.vulns).length;
      }
      break;
    }
    case 'ipqualityscore': {
      const d = data as any;
      if (d) {
        result['Fraud Score'] = d.fraud_score || 0;
        result['VPN'] = d.vpn || false;
        result['Tor'] = d.tor || false;
        result['Proxy'] = d.proxy || false;
        result['Bot'] = d.bot_status || false;
      }
      break;
    }
    case 'threatfox': {
      const d = data as any;
      if (d?.query_status === 'ok' && d?.data?.length > 0) {
        result['IOC Count'] = d.data.length;
        result['Malware'] = d.data[0]?.malware_printable || 'Unknown';
        result['Threat Type'] = d.data[0]?.threat_type || 'Unknown';
      } else {
        result['Found'] = false;
      }
      break;
    }
    case 'urlhaus': {
      const d = data as any;
      if (d?.query_status === 'ok') {
        result['URL Count'] = d.url_count || 0;
        result['Listed'] = true;
      } else {
        result['Listed'] = false;
      }
      break;
    }
    case 'rdap': {
      const d = data as any;
      if (d) {
        if (d.name) result['Network'] = d.name;
        const entity = d.entities?.[0];
        if (entity?.vcardArray?.[1]) {
          const vcard = entity.vcardArray[1];
          const fn = vcard.find((v: any) => v[0] === 'fn');
          if (fn) result['Registrant'] = fn[3];
        }
      }
      break;
    }
    case 'virustotal_url': {
      if ((data as any)?.submitted) {
        result['Status'] = 'Submitted for analysis';
      } else {
        const attrs = (data as any)?.data?.attributes;
        if (attrs?.last_analysis_stats) {
          result['Malicious'] = attrs.last_analysis_stats.malicious || 0;
          result['Suspicious'] = attrs.last_analysis_stats.suspicious || 0;
          result['Clean'] = attrs.last_analysis_stats.harmless || 0;
        }
      }
      break;
    }
    case 'urlscan': {
      const d = data as any;
      if (d?.submitted) {
        result['Status'] = 'Scan submitted';
        if (d.resultUrl) result['Result URL'] = d.resultUrl;
      }
      break;
    }
    case 'urlhaus_url': {
      const d = data as any;
      if (d?.query_status === 'ok') {
        result['Status'] = d.url_status || 'Unknown';
        result['Threat'] = d.threat || 'Unknown';
        result['Listed'] = true;
      } else {
        result['Listed'] = false;
      }
      break;
    }
    case 'tor_exit_list': {
      const d = data as any;
      if (d) {
        result['Tor Exit Node'] = d.is_tor_exit || false;
        if (d.last_seen) result['Last Seen'] = new Date(d.last_seen).toLocaleDateString();
        if (d.source) result['Source'] = d.source;
      }
      break;
    }
    case 'vpn_provider': {
      const d = data as any;
      if (d && d.provider) {
        result['Provider'] = d.provider;
        result['Confidence'] = d.confidence || 'unknown';
        if (d.matched_by) result['Matched By'] = d.matched_by === 'asn' ? 'ASN' : d.matched_by === 'org_pattern' ? 'Organization' : 'Keyword';
      } else {
        result['VPN Detected'] = false;
      }
      break;
    }
    case 'teoh': {
      const d = data as any;
      if (d) {
        result['VPN/Proxy'] = d.vpn_or_proxy === 'yes' || d.is_vpn === true;
        result['Tor'] = d.is_tor || false;
        result['Datacenter'] = d.is_datacenter || d.hosting || false;
        if (d.vpn_name) result['VPN Name'] = d.vpn_name;
      }
      break;
    }
    case 'greynoise': {
      const d = data as any;
      if (d) {
        result['Mass Scanner'] = d.noise || false;
        result['RIOT'] = d.riot || false;
        if (d.classification) result['Classification'] = d.classification;
        if (d.name) result['Name'] = d.name;
      }
      break;
    }
    case 'spamhaus': {
      const d = data as any;
      if (d) {
        const listed = d.listedIn && d.listedIn.length > 0;
        result['Listed'] = listed;
        if (listed) {
          result['Lists'] = d.listedIn.join(', ');
        }
      }
      break;
    }
  }

  return result;
}

export default function SourceCard({ source, result }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const info = sourceInfo[source] || { name: source, url: '#', description: '' };

  const hasError = !!result.error;
  const isApiKeyMissing = result.error === 'API key not configured';
  const hasThreat = result.isMalicious || (result.threatScore !== undefined && result.threatScore > 30);
  const keyData = hasError ? {} : extractKeyData(source, result.data);

  const getStatusIcon = () => {
    if (isApiKeyMissing) return <ShieldOff className="w-5 h-5 text-amber-500" />;
    if (hasError) return <AlertCircle className="w-5 h-5 text-slate-500" />;
    if (hasThreat) return <XCircle className="w-5 h-5 text-red-400" />;
    return <CheckCircle className="w-5 h-5 text-emerald-400" />;
  };

  const getStatusBorder = () => {
    if (isApiKeyMissing) return 'border-amber-500/30';
    if (hasError) return 'border-slate-700';
    if (hasThreat) return 'border-red-500/30';
    return 'border-emerald-500/30';
  };

  const getStatusBadge = () => {
    if (isApiKeyMissing) {
      return (
        <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
          Not Checked (API Key Missing)
        </div>
      );
    }
    if (hasError) {
      return (
        <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-400">
          Error
        </div>
      );
    }
    if (result.threatScore !== undefined) {
      return (
        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
          result.threatScore >= 70 ? 'bg-red-500/20 text-red-400' :
          result.threatScore >= 40 ? 'bg-orange-500/20 text-orange-400' :
          result.threatScore >= 20 ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-emerald-500/20 text-emerald-400'
        }`}>
          Score: {result.threatScore}
        </div>
      );
    }
    return (
      <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
        Checked
      </div>
    );
  };

  return (
    <div className={`bg-slate-800/50 rounded-xl border ${getStatusBorder()} overflow-hidden transition-all hover:bg-slate-800/70`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">{info.name}</h3>
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-cyan-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-xs text-slate-500">{info.description}</p>
            </div>
          </div>

          {getStatusBadge()}
        </div>

        {hasError ? (
          <div className="mt-3 p-2 bg-slate-900/50 rounded-lg">
            <p className="text-sm text-slate-500">{result.error}</p>
          </div>
        ) : (
          Object.keys(keyData).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(keyData).slice(0, expanded ? undefined : 4).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center p-2 bg-slate-900/50 rounded-lg">
                  <span className="text-xs text-slate-500">{key}</span>
                  <span className={`text-xs font-medium ${
                    value === true ? 'text-red-400' :
                    value === false ? 'text-emerald-400' :
                    typeof value === 'number' && value > 50 ? 'text-red-400' :
                    'text-white'
                  }`}>
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {Object.keys(keyData).length > 4 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show {Object.keys(keyData).length - 4} more
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
