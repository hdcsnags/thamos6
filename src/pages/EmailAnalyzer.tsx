import { useState } from 'react';
import { Mail, Loader2, AlertTriangle, CheckCircle, XCircle, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface HeaderInfo {
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  returnPath: string;
  replyTo: string;
}

interface AuthResult {
  status: 'pass' | 'fail' | 'none' | 'neutral';
  details: string;
}

interface HopInfo {
  from: string;
  by: string;
  with: string;
  timestamp: string;
  delay: string;
}

interface AnalysisResult {
  headers: HeaderInfo;
  authentication: {
    spf: AuthResult;
    dkim: AuthResult;
    dmarc: AuthResult;
  };
  hops: HopInfo[];
  originIP: string | null;
  suspiciousIndicators: string[];
  rawHeaders: Record<string, string>;
}

export default function EmailAnalyzer() {
  const [rawHeaders, setRawHeaders] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    headers: true,
    auth: true,
    hops: true,
    raw: false,
  });

  const parseHeaders = (raw: string): AnalysisResult => {
    const lines = raw.split(/\r?\n/);
    const headers: Record<string, string> = {};
    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      if (/^\s/.test(line) && currentKey) {
        currentValue += ' ' + line.trim();
      } else {
        if (currentKey) {
          headers[currentKey.toLowerCase()] = currentValue;
        }
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          currentKey = line.substring(0, colonIndex).trim();
          currentValue = line.substring(colonIndex + 1).trim();
        }
      }
    }
    if (currentKey) {
      headers[currentKey.toLowerCase()] = currentValue;
    }

    const extractIP = (text: string): string | null => {
      const ipMatch = text.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
      return ipMatch ? ipMatch[1] : null;
    };

    const parseAuthResults = (authHeader: string): { spf: AuthResult; dkim: AuthResult; dmarc: AuthResult } => {
      const result = {
        spf: { status: 'none' as const, details: 'Not found in headers' },
        dkim: { status: 'none' as const, details: 'Not found in headers' },
        dmarc: { status: 'none' as const, details: 'Not found in headers' },
      };

      if (!authHeader) return result;

      const spfMatch = authHeader.match(/spf=(\w+)/i);
      if (spfMatch) {
        const status = spfMatch[1].toLowerCase();
        result.spf = {
          status: status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'neutral',
          details: `SPF ${status}`,
        };
      }

      const dkimMatch = authHeader.match(/dkim=(\w+)/i);
      if (dkimMatch) {
        const status = dkimMatch[1].toLowerCase();
        result.dkim = {
          status: status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'neutral',
          details: `DKIM ${status}`,
        };
      }

      const dmarcMatch = authHeader.match(/dmarc=(\w+)/i);
      if (dmarcMatch) {
        const status = dmarcMatch[1].toLowerCase();
        result.dmarc = {
          status: status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'neutral',
          details: `DMARC ${status}`,
        };
      }

      return result;
    };

    const parseHops = (): HopInfo[] => {
      const hops: HopInfo[] = [];
      const receivedHeaders: string[] = [];

      for (const [key, value] of Object.entries(headers)) {
        if (key === 'received') {
          receivedHeaders.push(value);
        }
      }

      const allReceived = raw.match(/^Received:[\s\S]*?(?=^[A-Za-z-]+:|$)/gim) || [];

      for (const received of allReceived) {
        const fromMatch = received.match(/from\s+([\w\.\-]+)/i);
        const byMatch = received.match(/by\s+([\w\.\-]+)/i);
        const withMatch = received.match(/with\s+(\w+)/i);
        const dateMatch = received.match(/;\s*(.+)$/m);

        hops.push({
          from: fromMatch ? fromMatch[1] : 'Unknown',
          by: byMatch ? byMatch[1] : 'Unknown',
          with: withMatch ? withMatch[1] : 'Unknown',
          timestamp: dateMatch ? dateMatch[1].trim() : 'Unknown',
          delay: '-',
        });
      }

      return hops.reverse();
    };

    const detectSuspiciousIndicators = (): string[] => {
      const indicators: string[] = [];

      const from = headers['from'] || '';
      const returnPath = headers['return-path'] || '';
      const replyTo = headers['reply-to'] || '';

      const extractEmail = (text: string): string => {
        const match = text.match(/<([^>]+)>/) || text.match(/([^\s<>]+@[^\s<>]+)/);
        return match ? match[1].toLowerCase() : text.toLowerCase();
      };

      const fromEmail = extractEmail(from);
      const returnEmail = extractEmail(returnPath);
      const replyEmail = extractEmail(replyTo);

      if (returnPath && fromEmail !== returnEmail) {
        indicators.push('Return-Path differs from From address (possible spoofing)');
      }

      if (replyTo && fromEmail !== replyEmail) {
        indicators.push('Reply-To differs from From address');
      }

      const authResults = headers['authentication-results'] || '';
      if (authResults.includes('spf=fail')) {
        indicators.push('SPF authentication failed');
      }
      if (authResults.includes('dkim=fail')) {
        indicators.push('DKIM signature verification failed');
      }
      if (authResults.includes('dmarc=fail')) {
        indicators.push('DMARC policy check failed');
      }

      const xMailer = headers['x-mailer'] || '';
      if (xMailer && /php|mass.?mail/i.test(xMailer)) {
        indicators.push(`Suspicious X-Mailer: ${xMailer}`);
      }

      return indicators;
    };

    let originIP: string | null = null;
    const receivedHeaders = raw.match(/^Received:[\s\S]*?(?=^[A-Za-z-]+:|$)/gim) || [];
    for (const received of receivedHeaders) {
      const ip = extractIP(received);
      if (ip && !ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.')) {
        originIP = ip;
      }
    }

    return {
      headers: {
        from: headers['from'] || '',
        to: headers['to'] || '',
        subject: headers['subject'] || '',
        date: headers['date'] || '',
        messageId: headers['message-id'] || '',
        returnPath: headers['return-path'] || '',
        replyTo: headers['reply-to'] || '',
      },
      authentication: parseAuthResults(headers['authentication-results'] || ''),
      hops: parseHops(),
      originIP,
      suspiciousIndicators: detectSuspiciousIndicators(),
      rawHeaders: headers,
    };
  };

  const handleAnalyze = () => {
    if (!rawHeaders.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const analysis = parseHeaders(rawHeaders);
      setResult(analysis);
      setLoading(false);
    }, 500);
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const AuthStatusBadge = ({ result }: { result: AuthResult }) => {
    const colors = {
      pass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      fail: 'bg-red-500/20 text-red-400 border-red-500/30',
      none: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      neutral: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    };
    const icons = {
      pass: <CheckCircle className="w-4 h-4" />,
      fail: <XCircle className="w-4 h-4" />,
      none: <AlertTriangle className="w-4 h-4" />,
      neutral: <AlertTriangle className="w-4 h-4" />,
    };
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${colors[result.status]}`}>
        {icons[result.status]}
        {result.status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
          <Mail className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Email Header Analyzer</h1>
        <p className="text-slate-400">
          Parse email headers to trace origin, check SPF/DKIM/DMARC authentication,
          and identify spoofing attempts or suspicious indicators.
        </p>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <label className="block text-sm font-medium text-slate-300 mb-3">
            Paste Raw Email Headers
          </label>
          <textarea
            value={rawHeaders}
            onChange={e => setRawHeaders(e.target.value)}
            placeholder="Paste the full email headers here...&#10;&#10;To get headers:&#10;- Gmail: Open email → More (⋮) → Show original&#10;- Outlook: Open email → File → Properties → Internet headers&#10;- Apple Mail: View → Message → Raw Source"
            className="w-full h-64 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleAnalyze}
              disabled={loading || !rawHeaders.trim()}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Analyze Headers
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
          {result.suspiciousIndicators.length > 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-400 mb-2">Suspicious Indicators Detected</h3>
                  <ul className="space-y-1">
                    {result.suspiciousIndicators.map((indicator, i) => (
                      <li key={i} className="text-red-300 text-sm">{indicator}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <button
              onClick={() => toggleSection('headers')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
            >
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-cyan-400" />
                Basic Headers
              </h3>
              {expandedSections.headers ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
            </button>
            {expandedSections.headers && (
              <div className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">From</p>
                    <p className="text-white font-mono text-sm break-all">{result.headers.from || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">To</p>
                    <p className="text-white font-mono text-sm break-all">{result.headers.to || 'N/A'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Subject</p>
                    <p className="text-white font-medium">{result.headers.subject || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Date</p>
                    <p className="text-white text-sm">{result.headers.date || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Origin IP</p>
                    <p className="text-cyan-400 font-mono text-sm">{result.originIP || 'Could not determine'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Return-Path</p>
                    <p className="text-white font-mono text-sm break-all">{result.headers.returnPath || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Reply-To</p>
                    <p className="text-white font-mono text-sm break-all">{result.headers.replyTo || 'N/A'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <button
              onClick={() => toggleSection('auth')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
            >
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-cyan-400" />
                Email Authentication
              </h3>
              {expandedSections.auth ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
            </button>
            {expandedSections.auth && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-300 font-medium">SPF</span>
                      <AuthStatusBadge result={result.authentication.spf} />
                    </div>
                    <p className="text-xs text-slate-500">Sender Policy Framework</p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-300 font-medium">DKIM</span>
                      <AuthStatusBadge result={result.authentication.dkim} />
                    </div>
                    <p className="text-xs text-slate-500">DomainKeys Identified Mail</p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-300 font-medium">DMARC</span>
                      <AuthStatusBadge result={result.authentication.dmarc} />
                    </div>
                    <p className="text-xs text-slate-500">Domain-based Message Authentication</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <button
              onClick={() => toggleSection('hops')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
            >
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-cyan-400" />
                Email Routing ({result.hops.length} hops)
              </h3>
              {expandedSections.hops ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
            </button>
            {expandedSections.hops && (
              <div className="px-4 pb-4">
                {result.hops.length > 0 ? (
                  <div className="space-y-2">
                    {result.hops.map((hop, i) => (
                      <div key={i} className="p-3 bg-slate-800/50 rounded-lg">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="w-6 h-6 flex items-center justify-center bg-cyan-500/20 text-cyan-400 rounded-full text-xs font-bold">
                            {i + 1}
                          </span>
                          <span className="text-white font-medium">{hop.by}</span>
                        </div>
                        <div className="ml-9 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className="text-slate-500">From:</span>
                            <span className="text-slate-300 ml-1">{hop.from}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Protocol:</span>
                            <span className="text-slate-300 ml-1">{hop.with}</span>
                          </div>
                          <div className="md:col-span-2">
                            <span className="text-slate-500">Time:</span>
                            <span className="text-slate-300 ml-1 text-xs">{hop.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No routing information found</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <button
              onClick={() => toggleSection('raw')}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
            >
              <h3 className="text-lg font-semibold text-white">All Parsed Headers</h3>
              {expandedSections.raw ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
            </button>
            {expandedSections.raw && (
              <div className="px-4 pb-4">
                <div className="bg-slate-800 rounded-lg p-4 max-h-96 overflow-auto">
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                    {JSON.stringify(result.rawHeaders, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Analysis
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
