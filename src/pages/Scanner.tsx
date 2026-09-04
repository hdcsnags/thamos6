import { useState, useMemo, useEffect } from 'react';
import { Search, AlertTriangle, Shield, Newspaper } from 'lucide-react';
import { detectIOCType } from '../lib/iocDetection';
import { supabase } from '../lib/supabase';
import { palette, typography, accentBg, accentBorder } from '../design-system/tokens';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

type Severity = 'high' | 'medium' | 'clean' | 'info';

const pillColor: Record<Severity, string | null> = {
  high: palette.rose,
  medium: palette.amber,
  clean: palette.green,
  info: null,
};

function Pill({ label, tone }: { label: string; tone: Severity }) {
  const color = pillColor[tone];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize"
      style={{
        color: color ?? palette.textSecondary,
        background: color ? accentBg(color, 0.12) : palette.float,
        border: `1px solid ${color ? accentBorder(color, 0.28) : palette.borderDefault}`,
      }}
    >
      {label}
    </span>
  );
}

type FeedPanel = 'recent' | 'watchlist' | 'stream';

const panelLabels: Record<FeedPanel, string> = {
  recent: 'Recent',
  watchlist: 'Watchlist',
  stream: 'Stream',
};

const feedCardStyle = {
  background: palette.base,
  border: `1px solid ${palette.borderDefault}`,
  borderRadius: '9px',
} as const;

function FeedSkeletons() {
  return (
    <>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="p-4 animate-pulse" style={feedCardStyle} aria-hidden>
          <div className="h-3 rounded mb-3 w-1/3" style={{ background: palette.float }} />
          <div className="h-3 rounded mb-2" style={{ background: palette.elevated }} />
          <div className="h-2.5 rounded w-1/4" style={{ background: palette.elevated }} />
        </div>
      ))}
    </>
  );
}

function FeedEmpty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="col-span-full text-center py-12">
      <div className="mx-auto mb-3 flex items-center justify-center" style={{ color: palette.textDisabled }}>
        {icon}
      </div>
      <p className="text-sm" style={{ color: palette.textSecondary }}>{title}</p>
      <p className="text-xs mt-1" style={{ color: palette.textTertiary }}>{hint}</p>
    </div>
  );
}

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [activePanel, setActivePanel] = useState<FeedPanel>('stream');

  // Real data state
  const [recentLookups, setRecentLookups] = useState<any[]>([]);
  const [watchlistEntries, setWatchlistEntries] = useState<any[]>([]);
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch real data on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        // Fetch recent lookups (combine IP and URL)
        const [ipRes, urlRes, alertsRes, feedRes] = await Promise.all([
          supabase
            .from('ip_lookups')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('url_lookups')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('user_alerts')
            .select('*, watchlist_entry:watchlist_entries(value, entry_type), feed_item:feed_items(title)')
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('feed_items')
            .select('*, source:rss_sources(name)')
            .order('pub_date', { ascending: false })
            .limit(3),
        ]);

        // Combine and sort IP and URL lookups by date
        const combined = [
          ...(ipRes.data || []).map(item => ({ ...item, type: 'ip' })),
          ...(urlRes.data || []).map(item => ({ ...item, type: 'url' })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3);

        setRecentLookups(combined);
        setWatchlistEntries(alertsRes.data || []);
        setFeedItems(feedRes.data || []);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const detection = useMemo(() => {
    if (!input.trim()) return { type: 'unknown', normalizedValue: '' };
    return detectIOCType(input.trim());
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!input.trim()) {
      setError('Please enter an IP, URL, domain, hash, CVE, wallet, email address, or extension ID');
      return;
    }

    if (detection.type === 'unknown') {
      setError('Unable to detect the input type. Check the value and try again.');
      return;
    }

    onScan(detection.type, detection.normalizedValue);
  };

  // Detection status label; `detected` drives the accent state of the chip.
  const detectionStatus = useMemo((): { text: string; detected: boolean } => {
    if (!input.trim()) {
      return { text: 'Ready', detected: false };
    }

    if (detection.type === 'unknown') {
      return { text: 'Analyzing…', detected: false };
    }

    const typeLabels: Record<string, string> = {
      ip: 'IP detected',
      url: 'URL detected',
      domain: 'Domain detected',
      hash: 'Hash detected',
      extension: 'Extension detected',
      cve: 'CVE detected',
      wallet: 'Wallet detected',
      email: 'Email detected',
    };

    const label = typeLabels[detection.type];
    return label ? { text: label, detected: true } : { text: 'Check input', detected: false };
  }, [input, detection.type]);

  // Format relative time
  const getRelativeTime = (dateStr: string) => {
    const now = new Date().getTime();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="flex-1 overflow-y-auto @container" style={{ backgroundColor: palette.void, color: palette.textPrimary, fontFamily: typography.ui }}>
      {/* Local styles for cursor animation and feed card hover */}
      <style>{`
        @keyframes cursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .cursor-blink {
          width: 10px;
          height: 20px;
          background: ${palette.accent};
          border-radius: 2px;
          display: inline-block;
          animation: cursorBlink 1s infinite;
          margin-left: 4px;
          vertical-align: middle;
        }
        .scanner-feed-card { transition: border-color 150ms, background-color 150ms; }
        .scanner-feed-card:hover { border-color: ${palette.borderActive} !important; background: ${palette.elevated} !important; }
        .scanner-seg-btn { transition: color 150ms, background-color 150ms; }
        .scanner-seg-btn:hover { color: ${palette.textPrimary} !important; }
      `}</style>

      {/* Top status bar */}
      <header className="h-12 flex items-center justify-between px-6 relative" style={{ backgroundColor: palette.base, borderBottom: `1px solid ${palette.borderSubtle}` }}>
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold" style={{ color: palette.textPrimary }}>Threat intelligence scanner</h1>
          <span className="text-[11px]" style={{ color: palette.textTertiary }}>Primary: IP reputation</span>
        </div>

        <div className="flex items-center gap-2 text-[11px]" style={{ color: palette.textTertiary }}>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: palette.green }}></span>
            Engine online
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="px-6 py-8 relative z-10">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Hero Header */}
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold mb-1" style={{ color: palette.textPrimary }}>Investigate an indicator</h1>
            <p className="text-sm" style={{ color: palette.textSecondary }}>
              Start with an IP address, or enter a URL, domain, hash, CVE, wallet, email address, or extension ID.
            </p>
          </div>

          {/* Scanner Terminal */}
          <div className="max-w-5xl mx-auto">
            <form onSubmit={handleSubmit}>
              <div
                className="rounded-lg overflow-hidden transition-colors duration-200"
                style={{
                  background: palette.elevated,
                  border: `1px solid ${input.trim() ? palette.borderActive : palette.borderDefault}`,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.28)'
                }}
              >
                <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: palette.surface, borderBottom: `1px solid ${palette.borderSubtle}` }}>
                  <span className="text-xs font-medium" style={{ color: palette.textSecondary }}>Indicator lookup</span>
                  <span className="text-[10px]" style={{ color: palette.textTertiary }}>Enter to scan</span>
                </div>

                {/* Input area */}
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-4">
                    <Search className="w-5 h-5 shrink-0" style={{ color: palette.accent }} />
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          setError('');
                        }}
                        placeholder="8.8.8.8"
                        className="w-full bg-transparent border-none outline-none mono text-xl focus:ring-0"
                        style={{ color: palette.textPrimary, caretColor: palette.accent }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {!input.trim() && <span className="cursor-blink" />}
                    </div>
                    <button
                      type="submit"
                      className="h-11 px-4 rounded-md transition-colors flex items-center gap-2"
                      style={{ backgroundColor: palette.accent, color: palette.void }}
                    >
                      <Search className="w-4 h-4" />
                      <span className="text-xs font-semibold">Scan</span>
                    </button>
                  </div>

                  {/* Status footer */}
                  <div className="mt-6 pt-4 flex items-center justify-between flex-wrap gap-4" style={{ borderTop: `1px solid ${palette.borderSubtle}` }}>
                    <div className="flex items-center gap-5 text-[11px]" style={{ color: palette.textTertiary }}>
                      <span>Sources: <span style={{ color: palette.textSecondary }}>13+</span></span>
                      <span>Mode: <span style={{ color: palette.textSecondary }}>parallel</span></span>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium transition-colors"
                        style={{
                          color: detectionStatus.detected ? palette.accent : palette.textSecondary,
                          background: detectionStatus.detected ? accentBg(palette.accent, 0.12) : palette.float,
                          border: `1px solid ${detectionStatus.detected ? accentBorder(palette.accent, 0.3) : palette.borderDefault}`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: detectionStatus.detected ? palette.accent : palette.borderActive }}
                        />
                        {detectionStatus.text}
                      </span>
                    </div>

                    <span className="text-[10px]" style={{ color: palette.textTertiary }}>Sources run in parallel; availability depends on your tier and configured keys.</span>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div
                  className="mt-5 flex items-start gap-2 text-sm rounded-lg p-3"
                  style={{
                    color: palette.rose,
                    background: accentBg(palette.rose, 0.1),
                    border: `1px solid ${accentBorder(palette.rose, 0.25)}`,
                  }}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span style={{ color: palette.textPrimary }}>{error}</span>
                </div>
              )}
            </form>
          </div>

          {/* Intelligence Feed Section */}
          <section className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: palette.textPrimary }}>Intelligence feed</h2>
                <p className="text-xs mt-0.5" style={{ color: palette.textTertiary }}>Recent lookups, watchlist alerts and security news</p>
              </div>

              {/* Segmented control */}
              <div
                role="tablist"
                aria-label="Intelligence feed panel"
                className="inline-flex items-center gap-0.5 p-0.5 rounded-md"
                style={{ background: palette.float, border: `1px solid ${palette.borderDefault}` }}
              >
                {(Object.keys(panelLabels) as FeedPanel[]).map((panel) => {
                  const active = activePanel === panel;
                  return (
                    <button
                      key={panel}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActivePanel(panel)}
                      className="scanner-seg-btn px-3 py-1 rounded text-xs font-medium"
                      style={{
                        background: active ? palette.surface : 'transparent',
                        color: active ? palette.textPrimary : palette.textSecondary,
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.35)' : 'none',
                      }}
                    >
                      {panelLabels[panel]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recent Investigations Panel */}
            {activePanel === 'recent' && (
              <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-4">
                {loading ? (
                  <FeedSkeletons />
                ) : recentLookups.length > 0 ? (
                  recentLookups.map((lookup) => {
                    const isIP = lookup.type === 'ip';
                    const isMalicious = isIP ? lookup.threat_score > 50 : lookup.is_malicious;
                    const severity: Severity = isMalicious ? 'high' : 'clean';
                    const dotColor = isMalicious ? palette.rose : palette.green;
                    const displayValue = isIP ? lookup.ip_address : lookup.url;

                    return (
                      <button
                        type="button"
                        key={lookup.id}
                        className="scanner-feed-card p-4 text-left cursor-pointer w-full"
                        style={feedCardStyle}
                        onClick={() => onScan(lookup.type, displayValue)}
                        title="Scan again"
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                            <h3 className="text-xs font-medium truncate" style={{ color: palette.textSecondary }}>
                              {isIP ? 'IP lookup' : 'URL scan'}
                            </h3>
                          </div>
                          <Pill label={isMalicious ? 'High' : 'Clean'} tone={severity} />
                        </div>
                        <div className="text-xs break-all mb-2 truncate" style={{ fontFamily: typography.mono, color: palette.textPrimary }}>
                          {displayValue}
                        </div>
                        <div className="text-[11px]" style={{ color: palette.textTertiary }}>
                          {getRelativeTime(lookup.created_at)}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <FeedEmpty
                    icon={<Search className="w-8 h-8" />}
                    title="No recent lookups yet"
                    hint="Start analyzing indicators to see them here"
                  />
                )}
              </div>
            )}

            {/* Watchlist Hits Panel */}
            {activePanel === 'watchlist' && (
              <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-4">
                {loading ? (
                  <FeedSkeletons />
                ) : watchlistEntries.length > 0 ? (
                  watchlistEntries.map((alert: any) => {
                    const severityMap: Record<string, Severity> = {
                      critical: 'high',
                      high: 'high',
                      medium: 'medium',
                      low: 'info',
                    };
                    const severity = severityMap[alert.severity || 'medium'] || 'medium';
                    const dotColor = pillColor[severity] ?? palette.borderActive;

                    return (
                      <div
                        key={alert.id}
                        className="scanner-feed-card p-4"
                        style={feedCardStyle}
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                            <h3 className="text-xs font-medium truncate" style={{ color: palette.textPrimary }}>
                              {alert.title}
                            </h3>
                          </div>
                          <Pill
                            label={alert.severity || 'Medium'}
                            tone={severity}
                          />
                        </div>
                        <div className="text-xs mb-2 line-clamp-2" style={{ color: palette.textSecondary }}>
                          {alert.description || 'Watchlist match detected'}
                        </div>
                        {alert.watchlist_entry && (
                          <div className="text-[11px] mb-2 truncate" style={{ color: palette.textTertiary }}>
                            Matched <span style={{ fontFamily: typography.mono, color: palette.textSecondary }}>{alert.watchlist_entry.value}</span>
                            {alert.context ? <> in {alert.context}</> : null}
                          </div>
                        )}
                        <div className="text-[11px]" style={{ color: palette.textTertiary }}>
                          {getRelativeTime(alert.created_at)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <FeedEmpty
                    icon={<Shield className="w-8 h-8" />}
                    title="No watchlist alerts yet"
                    hint="Alerts will appear when watchlist IOCs match news items"
                  />
                )}
              </div>
            )}

            {/* Intel Stream Panel */}
            {activePanel === 'stream' && (
              <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-4">
                {loading ? (
                  <FeedSkeletons />
                ) : feedItems.length > 0 ? (
                  feedItems.map((item) => {
                    return (
                      <a
                        key={item.id}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="scanner-feed-card p-4 block"
                        style={feedCardStyle}
                      >
                        <div className="flex items-center gap-2 mb-3 min-w-0">
                          <Newspaper className="w-3.5 h-3.5 shrink-0" style={{ color: palette.textTertiary }} />
                          <h3 className="text-xs font-medium line-clamp-1" style={{ color: palette.textSecondary }}>
                            {item.source?.name || 'Security news'}
                          </h3>
                        </div>
                        <div className="text-xs mb-2 line-clamp-2" style={{ color: palette.textPrimary }}>
                          {item.title}
                        </div>
                        <div className="text-[11px]" style={{ color: palette.textTertiary }}>
                          {getRelativeTime(item.pub_date)}
                        </div>
                      </a>
                    );
                  })
                ) : (
                  <FeedEmpty
                    icon={<Newspaper className="w-8 h-8" />}
                    title="No feed items yet"
                    hint="Check back later for security news"
                  />
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Bottom status bar */}
      <footer className="h-9 flex items-center justify-between px-6 relative" style={{ backgroundColor: palette.base, borderTop: `1px solid ${palette.borderSubtle}` }}>
        <div className="text-[10px]" style={{ color: palette.textTertiary }}>
          Terminal workflow: <span style={{ fontFamily: typography.mono, color: palette.textSecondary }}>scan -ip 8.8.8.8</span> or <span style={{ fontFamily: typography.mono, color: palette.textSecondary }}>scan 8.8.8.8</span>
        </div>
        <div className="text-[10px]" style={{ color: palette.textDisabled }}>ThamOS 6</div>
      </footer>
    </div>
  );
}
