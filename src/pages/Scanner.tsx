import { useState, useMemo, useEffect } from 'react';
import { Search, AlertTriangle, Shield, Newspaper } from 'lucide-react';
import { detectIOCType } from '../lib/iocDetection';
import { supabase } from '../lib/supabase';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

type Severity = 'high' | 'medium' | 'clean' | 'info' | 'live' | 'feed';

const pillClass: Record<Severity, string> = {
  high: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  clean: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  info: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  live: 'bg-violet-500/15 text-violet-300 border border-violet-500/30',
  feed: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
};

function Pill({ label, tone }: { label: string; tone: Severity }) {
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${pillClass[tone]}`}>
      {label}
    </span>
  );
}

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [activePanel, setActivePanel] = useState<'recent' | 'watchlist' | 'stream'>('stream');
  
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
            .select('*, watchlist_entry:watchlist_entries(ioc_value, ioc_type), feed_item:feed_items(title)')
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
      setError('Please enter an IP, URL, domain, hash, or extension ID');
      return;
    }

    if (detection.type === 'unknown') {
      setError('Unable to detect input type. Please enter a valid IP, URL, domain, hash, or Chrome extension ID.');
      return;
    }

    onScan(detection.type, detection.normalizedValue);
  };

  // Detection status label and styling
  const detectionStatus = useMemo(() => {
    if (!input.trim()) {
      return { text: 'READY', color: 'bg-slate-900/50 border-slate-800 text-slate-400' };
    }
    
    if (detection.type === 'unknown') {
      return { text: 'ANALYZING...', color: 'bg-slate-700/50 border-slate-600 text-slate-300' };
    }

    const typeMap: Record<string, { text: string; color: string }> = {
      ip: { text: 'IP DETECTED', color: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' },
      url: { text: 'URL DETECTED', color: 'bg-violet-500/20 border-violet-500/40 text-violet-300' },
      domain: { text: 'DOMAIN DETECTED', color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' },
      hash: { text: 'HASH DETECTED', color: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
      extension: { text: 'EXTENSION DETECTED', color: 'bg-rose-500/20 border-rose-500/40 text-rose-300' },
    };

    return typeMap[detection.type] || { text: 'CHECK INPUT', color: 'bg-slate-900/50 border-slate-800 text-slate-400' };
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
    <div className="flex-1 overflow-y-auto">
      {/* Local styles for cursor animation */}
      <style>{`
        @keyframes cursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .cursor-blink {
          width: 10px;
          height: 20px;
          background: rgba(34, 211, 238, 0.85);
          border-radius: 2px;
          display: inline-block;
          animation: cursorBlink 1s infinite;
          margin-left: 4px;
          vertical-align: middle;
        }
        
        /* Scanline effect */
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100%); } }
        .scanline {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(to bottom, transparent 40%, rgba(34, 211, 238, 0.02) 50%, transparent 60%);
          animation: scanline 8s linear infinite;
          pointer-events: none;
          opacity: 0.3;
        }
      `}</style>

      {/* Scanline effect */}
      <div className="scanline absolute inset-0 pointer-events-none z-0" />

      {/* Top status bar */}
      <header className="h-12 border-b border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between px-8 z-40 relative">
        <div className="flex items-center gap-6">
          <h1 className="text-sm font-bold mono text-white uppercase tracking-wider">
            SCANNER<span className="text-slate-600 font-normal"> / </span><span className="text-cyan-400">CORE</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-6 text-[10px] mono text-slate-500 uppercase tracking-wider">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            ENGINE_ONLINE
          </span>
          <span>SESSION: <span className="text-slate-400">0x8A2F</span></span>
          <span>LATENCY: <span className="text-emerald-400">24MS</span></span>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-12 relative z-10">
        <div className="max-w-7xl mx-auto space-y-10">
          
          {/* Hero Header */}
          <div className="text-center mb-10">
            <h1 
              className="text-6xl md:text-7xl font-black tracking-tighter mb-4"
              style={{ textShadow: '0 0 40px rgba(34, 211, 238, 0.3)' }}
            >
              <span className="text-white">THAMOS</span>
              <span className="bg-gradient-to-r from-cyan-400 via-cyan-500 to-emerald-400 bg-clip-text text-transparent">6</span>
            </h1>
            <div className="mono text-[10px] tracking-[0.35em] text-slate-600 uppercase mb-3">Neural Router v4.0</div>
            <p className="text-sm text-slate-400 max-w-2xl mx-auto">
              Inject IP, URL, hash, domain, or Chrome extension ID for intelligence correlation
            </p>
          </div>
          
          {/* Scanner Terminal */}
          <div className="max-w-5xl mx-auto">
            <form onSubmit={handleSubmit}>
              <div 
                className="rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  background: 'rgba(2, 6, 23, 0.75)',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  boxShadow: input.trim() 
                    ? '0 30px 140px rgba(34, 211, 238, 0.15)' 
                    : '0 26px 120px rgba(0, 0, 0, 0.8)'
                }}
              >
                {/* Terminal chrome */}
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-black/40">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                  </div>
                  <div className="mono text-[10px] text-slate-600 uppercase tracking-widest">root@thamos6:~</div>
                  <div className="w-16"></div>
                </div>
                
                {/* Input area */}
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-4">
                    <span className="mono text-cyan-400 text-2xl font-bold select-none">&gt;_</span>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          setError('');
                        }}
                        placeholder="awaiting_input..."
                        className="w-full bg-transparent border-none outline-none mono text-xl text-white placeholder-slate-700 caret-cyan-400 focus:ring-0"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {!input.trim() && <span className="cursor-blink" />}
                    </div>
                    <button 
                      type="submit"
                      className="h-11 w-11 rounded-xl bg-slate-900/50 border border-slate-700/50 hover:border-cyan-500/30 hover:bg-slate-900/70 transition-all grid place-items-center"
                    >
                      <Search className="w-5 h-5 text-slate-300" />
                    </button>
                  </div>
                  
                  {/* Status footer */}
                  <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-6 text-[11px] mono text-slate-500 uppercase tracking-wider">
                      <span>SOURCES: <span className="text-slate-300">13+</span></span>
                      <span>MODE: <span className="text-emerald-300">PARALLEL</span></span>
                      <div className={`px-2 py-1 rounded-md border ${detectionStatus.color}`}>
                        {detectionStatus.text}
                      </div>
                    </div>
                    
                    {/* Source dots indicator */}
                    <div className="flex items-center gap-2">
                      <div className="grid grid-cols-7 gap-1">
                        {[...Array(7)].map((_, i) => (
                          <div 
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${
                              (input.trim() && Math.random() > 0.5) || i < 3
                                ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.8)]'
                                : 'bg-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="mt-5 flex items-start gap-2 text-red-200 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </form>
          </div>

          {/* Intelligence Feed Section */}
          <section className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Intelligence Feed</h2>
                <p className="text-xs text-slate-500 mt-1">Real-time activity awareness</p>
              </div>
              
              {/* Toggle buttons */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActivePanel('recent')}
                  className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border ${
                    activePanel === 'recent'
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                      : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:bg-slate-800/50 hover:text-slate-300'
                  }`}
                >
                  Recent
                </button>
                <button 
                  onClick={() => setActivePanel('watchlist')}
                  className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border ${
                    activePanel === 'watchlist'
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                      : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:bg-slate-800/50 hover:text-slate-300'
                  }`}
                >
                  Watchlist
                </button>
                <button 
                  onClick={() => setActivePanel('stream')}
                  className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border ${
                    activePanel === 'stream'
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                      : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:bg-slate-800/50 hover:text-slate-300'
                  }`}
                >
                  Stream
                </button>
              </div>
            </div>
            
            {/* Recent Investigations Panel */}
            {activePanel === 'recent' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <div 
                      key={i}
                      className="rounded-xl p-5 animate-pulse"
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(148, 163, 184, 0.1)'
                      }}
                    >
                      <div className="h-4 bg-slate-700 rounded mb-3"></div>
                      <div className="h-3 bg-slate-800 rounded"></div>
                    </div>
                  ))
                ) : recentLookups.length > 0 ? (
                  recentLookups.map((lookup, idx) => {
                    const isIP = lookup.type === 'ip';
                    const isMalicious = isIP ? lookup.threat_score > 50 : lookup.is_malicious;
                    const severity = isMalicious ? 'high' : 'clean';
                    const dotColor = isMalicious ? 'bg-rose-500' : 'bg-emerald-500';
                    const displayValue = isIP ? lookup.ip_address : lookup.url;
                    
                    return (
                      <div 
                        key={lookup.id}
                        className="rounded-xl p-5 transition-all hover:bg-white/5 cursor-pointer"
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(148, 163, 184, 0.1)'
                        }}
                        onClick={() => {
                          // Could navigate to the result page here if desired
                        }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                              {isIP ? 'IP Lookup' : 'URL Scan'}
                            </h3>
                          </div>
                          <Pill label={isMalicious ? 'High' : 'Clean'} tone={severity} />
                        </div>
                        <div className="mono text-xs text-slate-400 break-all mb-3 truncate">
                          {displayValue}
                        </div>
                        <div className="text-[10px] text-slate-600 mono">
                          {getRelativeTime(lookup.created_at)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-3 text-center py-12">
                    <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No recent lookups yet</p>
                    <p className="text-slate-600 text-sm mt-1">Start analyzing IOCs to see them here</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Watchlist Hits Panel */}
            {activePanel === 'watchlist' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <div 
                      key={i}
                      className="rounded-xl p-5 animate-pulse"
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(148, 163, 184, 0.1)'
                      }}
                    >
                      <div className="h-4 bg-slate-700 rounded mb-3"></div>
                      <div className="h-3 bg-slate-800 rounded"></div>
                    </div>
                  ))
                ) : watchlistEntries.length > 0 ? (
                  watchlistEntries.map((alert: any) => {
                    const severityMap: Record<string, Severity> = {
                      critical: 'high',
                      high: 'high',
                      medium: 'medium',
                      low: 'info',
                    };
                    const severity = severityMap[alert.severity || 'medium'] || 'medium';
                    const dotColor = alert.severity === 'critical' || alert.severity === 'high' 
                      ? 'bg-rose-500 animate-pulse' 
                      : 'bg-amber-500';
                    const borderColor = alert.severity === 'critical' || alert.severity === 'high'
                      ? 'rgba(251, 113, 133, 0.2)'
                      : 'rgba(251, 191, 36, 0.2)';
                    
                    return (
                      <div 
                        key={alert.id}
                        className="rounded-xl p-5 transition-all hover:bg-white/5"
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: `1px solid ${borderColor}`
                        }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider break-all truncate">
                              {alert.title}
                            </h3>
                          </div>
                          <Pill 
                            label={alert.severity || 'Medium'} 
                            tone={severity} 
                          />
                        </div>
                        <div className="text-xs text-slate-400 mb-3 line-clamp-2">
                          {alert.description || 'Watchlist match detected'}
                        </div>
                        {alert.watchlist_entry && (
                          <div className="text-[10px] text-amber-400 mono mb-2">
                            Matched: {alert.watchlist_entry.ioc_value}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-600 mono">
                          {getRelativeTime(alert.created_at)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-3 text-center py-12">
                    <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No watchlist alerts yet</p>
                    <p className="text-slate-600 text-sm mt-1">Alerts will appear when watchlist IOCs match news items</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Intel Stream Panel */}
            {activePanel === 'stream' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <div 
                      key={i}
                      className="rounded-xl p-5 animate-pulse"
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(148, 163, 184, 0.1)'
                      }}
                    >
                      <div className="h-4 bg-slate-700 rounded mb-3"></div>
                      <div className="h-3 bg-slate-800 rounded"></div>
                    </div>
                  ))
                ) : feedItems.length > 0 ? (
                  feedItems.map((item) => {
                    return (
                      <a
                        key={item.id}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl p-5 transition-all hover:bg-white/5 block"
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(148, 163, 184, 0.1)'
                        }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider line-clamp-1">
                              {item.source?.name || 'Security News'}
                            </h3>
                          </div>
                          <Pill label="Feed" tone="feed" />
                        </div>
                        <div className="text-xs text-slate-400 mb-3 line-clamp-2">
                          {item.title}
                        </div>
                        <div className="text-[10px] text-slate-600 mono">
                          {getRelativeTime(item.pub_date)}
                        </div>
                      </a>
                    );
                  })
                ) : (
                  <div className="col-span-3 text-center py-12">
                    <Newspaper className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No feed items yet</p>
                    <p className="text-slate-600 text-sm mt-1">Check back later for security news</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Bottom status bar */}
      <footer className="h-10 border-t border-white/5 bg-black/50 backdrop-blur-md flex items-center justify-between px-8 z-40 relative">
        <div className="flex items-center gap-6 text-[10px] mono text-slate-600 uppercase tracking-wider">
          <span>Region: <span className="text-slate-400">US-EAST</span></span>
          <span>Encryption: <span className="text-slate-400">AES-256</span></span>
          <span>Protocol: <span className="text-emerald-400">TLS 1.3</span></span>
        </div>
        <div className="text-[10px] mono text-slate-600 uppercase tracking-wider">
          THAMOS_OS v6.0_TACTICAL
        </div>
      </footer>
    </div>
  );
}
