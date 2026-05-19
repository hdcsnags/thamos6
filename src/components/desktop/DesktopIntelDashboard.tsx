import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { detectIOCType } from '../../lib/iocDetection';
import { useDesktop } from '../../contexts/DesktopContext';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  cyan: '#00d9ff',
  green: '#00ff9d',
  amber: '#fbbf24',
  pink: '#ff0080',
};

interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pub_date: string;
  is_read?: boolean;
  is_saved?: boolean;
  source: {
    name: string;
    category: string;
  };
}

interface RansomwareVictim {
  id: string;
  victim_name: string;
  sector?: string;
  country?: string;
  discovered_at?: string;
  group_name?: string;
  ransom_amount_usd?: number;
}

interface RansomwareSummary {
  total_victims: number;
  recent_victims: number;
  active_groups: number;
  countries_targeted: number;
  sectors_impacted: number;
}

type TopTab = 'feeds' | 'ransomware';
type FeedFilter = 'all' | 'vulnerabilities' | 'threats' | 'alerts' | 'news' | 'unread' | 'saved';

const FEED_PILLS: { key: FeedFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'vulnerabilities', label: 'VULNS' },
  { key: 'threats', label: 'THREATS' },
  { key: 'alerts', label: 'ALERTS' },
  { key: 'news', label: 'NEWS' },
  { key: 'unread', label: 'UNREAD' },
  { key: 'saved', label: 'SAVED' },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function newsFeedsUrl(path: string) {
  return `${SUPABASE_URL}/functions/v1/news-feeds${path}`;
}
function ransomwareUrl(path: string) {
  return `${SUPABASE_URL}/functions/v1/ransomware-intel${path}`;
}

export function DesktopIntelDashboard() {
  const { openWindow } = useDesktop();
  const [topTab, setTopTab] = useState<TopTab>('feeds');

  // ── Feeds state ──────────────────────────────────────────────────────────────
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [extractedIOCs, setExtractedIOCs] = useState<Array<{ type: string; value: string }> | null>(null);
  const hasAutoRefreshed = useRef(false);

  // ── Ransomware state ──────────────────────────────────────────────────────────
  const [rsSummary, setRsSummary] = useState<RansomwareSummary | null>(null);
  const [rsVictims, setRsVictims] = useState<RansomwareVictim[]>([]);
  const [rsLoading, setRsLoading] = useState(false);
  const [rsError, setRsError] = useState<string | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const stripCDATA = (text: string) => {
    if (!text) return '';
    return text.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '');
  };

  const getRelativeTime = (dateString: string) => {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(dateString).toLocaleDateString();
  };

  const catColor = (cat: string) => {
    const map: Record<string, string> = {
      vulnerabilities: P.pink, threats: P.pink, alerts: P.amber, news: P.cyan,
    };
    return map[cat] || P.cyan;
  };

  // ── Feeds load ────────────────────────────────────────────────────────────────
  const loadItems = useCallback(async (): Promise<number> => {
    try {
      setLoading(true);
      setFeedError(null);
      const { data: { session } } = await supabase.auth.getSession();
      const isAuth = !!session?.access_token;

      const params = new URLSearchParams({ limit: '100' });
      if (filter === 'unread') params.append('unread', 'true');
      else if (filter === 'saved') params.append('saved', 'true');
      else if (filter !== 'all') params.append('category', filter);

      const endpoint = isAuth ? '/my/items' : '/items';
      const headers: Record<string, string> = { apikey: ANON_KEY };
      if (isAuth) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(`${newsFeedsUrl(endpoint)}?${params}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const feedItems: FeedItem[] = data.items || [];
      setItems(feedItems);
      return feedItems.length;
    } catch (e) {
      setFeedError(String(e));
      return 0;
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const refreshFeeds = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const endpoint = session ? '/my/refresh' : '/refresh';
      const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: ANON_KEY };
      if (session) headers['Authorization'] = `Bearer ${session.access_token}`;
      await fetch(newsFeedsUrl(endpoint), { method: 'POST', headers, body: JSON.stringify({}) });
      await loadItems();
    } finally {
      setRefreshing(false);
    }
  }, [loadItems]);

  // Initial load + auto-refresh every 20 min
  useEffect(() => {
    loadItems().then(count => {
      if (count === 0 && !hasAutoRefreshed.current) {
        hasAutoRefreshed.current = true;
        refreshFeeds();
      }
    });
  }, [loadItems]);

  useEffect(() => {
    const timer = setInterval(() => loadItems(), 20 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadItems]);

  // ── Per-article actions ───────────────────────────────────────────────────────
  const markRead = useCallback(async (item: FeedItem) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(newsFeedsUrl(`/my/items/${item.id}/read`), {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` },
    });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: true } : i));
  }, []);

  const toggleSave = useCallback(async (item: FeedItem) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(newsFeedsUrl(`/my/items/${item.id}/save`), {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` },
    });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_saved: !i.is_saved } : i));
  }, []);

  const handleSelectItem = (item: FeedItem) => {
    setSelectedItem(item);
    setExtractedIOCs(null);
    if (!item.is_read) markRead(item);
  };

  // ── Extract IOCs from selected article ───────────────────────────────────────
  const extractIOCs = () => {
    if (!selectedItem) return;
    const text = `${selectedItem.title} ${stripCDATA(selectedItem.description || '')}`;
    const tokens = text.split(/[\s,;|<>()\[\]'"{}]+/).filter(t => t.length > 3);
    const found: Array<{ type: string; value: string }> = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const r = detectIOCType(token);
      if (r.type !== 'unknown' && !seen.has(r.normalizedValue)) {
        seen.add(r.normalizedValue);
        found.push({ type: r.type, value: r.value });
      }
    }
    setExtractedIOCs(found);
  };

  const scanIOC = (type: string, value: string) => {
    openWindow({ appId: 'scanner', title: `Scan: ${value}`, data: { query: value, type } });
  };

  // ── Category counts (from currently loaded items) ─────────────────────────────
  const catCounts = items.reduce((acc, i) => {
    const c = i.source.category;
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const unreadCount = items.filter(i => !i.is_read).length;
  const savedCount = items.filter(i => i.is_saved).length;

  const pillCount = (key: FeedFilter): number | null => {
    if (key === 'all') return null;
    if (key === 'unread') return unreadCount || null;
    if (key === 'saved') return savedCount || null;
    return catCounts[key] || null;
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return item.title.toLowerCase().includes(s) || item.description?.toLowerCase().includes(s);
  });

  // ── Ransomware load ───────────────────────────────────────────────────────────
  const loadRansomware = useCallback(async () => {
    setRsLoading(true);
    setRsError(null);
    try {
      const headers = { apikey: ANON_KEY };
      const [summaryRes, victimsRes] = await Promise.all([
        fetch(ransomwareUrl('/summary'), { headers }),
        fetch(`${ransomwareUrl('/victims')}?limit=50`, { headers }),
      ]);
      if (summaryRes.ok) {
        const s = await summaryRes.json();
        setRsSummary(s);
      }
      if (victimsRes.ok) {
        const v = await victimsRes.json();
        setRsVictims(v.victims || []);
      }
    } catch (e) {
      setRsError(String(e));
    } finally {
      setRsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (topTab === 'ransomware' && !rsSummary && !rsLoading) loadRansomware();
  }, [topTab, rsSummary, rsLoading, loadRansomware]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {/* Top tab bar */}
      <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        {(['feeds', 'ransomware'] as TopTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTopTab(t)}
            className="px-3 py-1 text-xs rounded transition-all"
            style={{
              backgroundColor: topTab === t ? `${P.cyan}15` : 'transparent',
              border: `1px solid ${topTab === t ? `${P.cyan}40` : P.border}`,
              color: topTab === t ? P.cyan : P.dim,
            }}
          >
            {t === 'feeds' ? 'FEEDS' : 'RANSOMWARE'}
          </button>
        ))}
      </div>

      {topTab === 'feeds' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-[340px] flex flex-col flex-shrink-0" style={{ borderRight: `1px solid ${P.border}` }}>
            <div className="p-3 space-y-2" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.green, boxShadow: `0 0 6px ${P.green}60` }} />
                  <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>INTEL STREAM</span>
                </div>
                <button
                  onClick={refreshFeeds}
                  disabled={refreshing}
                  className="text-xs px-2 py-1 rounded transition-all"
                  style={{ color: refreshing ? P.dim : P.cyan, border: `1px solid ${P.border}` }}
                >
                  {refreshing ? 'SYNC...' : 'REFRESH'}
                </button>
              </div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search intel..."
                className="w-full px-3 py-1.5 text-xs rounded focus:outline-none"
                style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <div className="flex gap-1 flex-wrap">
                {FEED_PILLS.map(({ key, label }) => {
                  const count = pillCount(key);
                  return (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-all"
                      style={{
                        backgroundColor: filter === key ? `${catColor(key)}15` : 'transparent',
                        border: `1px solid ${filter === key ? `${catColor(key)}40` : P.border}`,
                        color: filter === key ? catColor(key) : P.dim,
                      }}
                    >
                      {label}
                      {count != null && (
                        <span className="text-[9px] px-1 rounded-full" style={{ backgroundColor: `${catColor(key)}20`, color: catColor(key) }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <span className="text-xs animate-pulse" style={{ color: P.dim }}>Loading feeds...</span>
                </div>
              ) : feedError ? (
                <div className="p-4 m-3 rounded" style={{ backgroundColor: `${P.pink}10`, border: `1px solid ${P.pink}30` }}>
                  <p className="text-xs" style={{ color: P.pink }}>Failed to load feeds</p>
                  <p className="text-[10px] mt-1" style={{ color: P.dim }}>{feedError}</p>
                  <button
                    onClick={() => loadItems()}
                    className="mt-2 text-[10px] px-2 py-0.5 rounded transition-all"
                    style={{ border: `1px solid ${P.pink}40`, color: P.pink }}
                  >
                    RETRY
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center">
                  <span className="text-xs" style={{ color: P.dim }}>No articles found</span>
                </div>
              ) : (
                filtered.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className="w-full p-3 text-left transition-all"
                    style={{
                      borderBottom: `1px solid ${P.border}`,
                      backgroundColor: selectedItem?.id === item.id ? `${P.cyan}08` : 'transparent',
                      borderLeft: selectedItem?.id === item.id ? `2px solid ${P.cyan}` : '2px solid transparent',
                      opacity: item.is_read ? 0.65 : 1,
                    }}
                    onMouseEnter={e => {
                      if (selectedItem?.id !== item.id) e.currentTarget.style.backgroundColor = `${P.cyan}05`;
                    }}
                    onMouseLeave={e => {
                      if (selectedItem?.id !== item.id) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {!item.is_read && (
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: P.cyan }} />
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${catColor(item.source.category)}15`, color: catColor(item.source.category), border: `1px solid ${catColor(item.source.category)}30` }}>
                        {item.source.name}
                      </span>
                      <span className="text-xs" style={{ color: P.dim }}>{getRelativeTime(item.pub_date)}</span>
                      {item.is_saved && <span className="text-[9px]" style={{ color: P.amber }}>★</span>}
                    </div>
                    <p className="text-xs leading-relaxed line-clamp-2" style={{ color: selectedItem?.id === item.id ? P.textLight : P.text }}>
                      {stripCDATA(item.title)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Article pane */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedItem ? (
              <>
                <div className="p-4" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${catColor(selectedItem.source.category)}15`, color: catColor(selectedItem.source.category), border: `1px solid ${catColor(selectedItem.source.category)}30` }}>
                        {selectedItem.source.name}
                      </span>
                      <span className="text-xs" style={{ color: P.dim }}>
                        {new Date(selectedItem.pub_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleSave(selectedItem)}
                        className="text-xs px-2 py-0.5 rounded transition-all"
                        title={selectedItem.is_saved ? 'Unsave' : 'Save'}
                        style={{ color: selectedItem.is_saved ? P.amber : P.dim, border: `1px solid ${selectedItem.is_saved ? P.amber + '40' : P.border}` }}
                      >
                        {selectedItem.is_saved ? '★ SAVED' : '☆ SAVE'}
                      </button>
                      <button
                        onClick={extractIOCs}
                        className="text-xs px-2 py-0.5 rounded transition-all"
                        title="Extract IOCs from article"
                        style={{ color: P.green, border: `1px solid ${P.green}40` }}
                      >
                        EXTRACT IOCs
                      </button>
                    </div>
                  </div>
                  <h1 className="text-sm font-medium leading-relaxed" style={{ color: P.textLight }}>
                    {stripCDATA(selectedItem.title)}
                  </h1>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {extractedIOCs !== null && (
                    <div className="p-3 rounded" style={{ backgroundColor: `${P.green}08`, border: `1px solid ${P.green}20` }}>
                      <p className="text-xs font-medium mb-2" style={{ color: P.green }}>
                        {extractedIOCs.length === 0 ? 'No IOCs detected' : `${extractedIOCs.length} IOC${extractedIOCs.length === 1 ? '' : 's'} detected`}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {extractedIOCs.map((ioc, i) => (
                          <button
                            key={i}
                            onClick={() => scanIOC(ioc.type, ioc.value)}
                            className="text-[10px] px-2 py-0.5 rounded transition-all"
                            style={{ backgroundColor: `${P.cyan}10`, border: `1px solid ${P.cyan}30`, color: P.cyan }}
                            title={`Scan ${ioc.type}: ${ioc.value}`}
                          >
                            [{ioc.type}] {ioc.value.length > 40 ? ioc.value.slice(0, 40) + '…' : ioc.value}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedItem.description ? (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: P.text }}>
                      {stripCDATA(selectedItem.description)}
                    </p>
                  ) : (
                    <div className="text-center py-8">
                      <span className="text-xs" style={{ color: P.dim }}>Full content not available in feed</span>
                    </div>
                  )}
                </div>

                <div className="px-4 py-2 flex items-center justify-between" style={{ borderTop: `1px solid ${P.border}`, backgroundColor: P.surface }}>
                  <span className="text-xs" style={{ color: P.dim }}>{filtered.length} articles</span>
                  <button
                    onClick={() => window.open(selectedItem.link, '_blank')}
                    className="text-xs px-3 py-1 rounded transition-all"
                    style={{ backgroundColor: `${P.cyan}15`, border: `1px solid ${P.cyan}30`, color: P.cyan }}
                  >
                    OPEN SOURCE
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl mb-3 opacity-20">&#9670;</div>
                  <span className="text-xs" style={{ color: P.dim }}>Select an article to preview</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <RansomwarePanel
          summary={rsSummary}
          victims={rsVictims}
          loading={rsLoading}
          error={rsError}
          onRefresh={loadRansomware}
        />
      )}
    </div>
  );
}

// ── Ransomware Panel ──────────────────────────────────────────────────────────

interface RansomwarePanelProps {
  summary: RansomwareSummary | null;
  victims: RansomwareVictim[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function RansomwarePanel({ summary, victims, loading, error, onRefresh }: RansomwarePanelProps) {
  const STAT_TILES = summary ? [
    { label: 'TOTAL VICTIMS', value: summary.total_victims, color: P.pink },
    { label: 'RECENT (30D)', value: summary.recent_victims, color: P.amber },
    { label: 'ACTIVE GROUPS', value: summary.active_groups, color: P.cyan },
    { label: 'COUNTRIES', value: summary.countries_targeted, color: P.green },
    { label: 'SECTORS', value: summary.sectors_impacted, color: P.text },
  ] : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: P.pink, boxShadow: `0 0 6px ${P.pink}60` }} />
          <span className="text-xs font-medium tracking-wider" style={{ color: P.pink }}>RANSOMWARE INTEL</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs px-2 py-1 rounded transition-all"
          style={{ color: loading ? P.dim : P.pink, border: `1px solid ${P.border}` }}
        >
          {loading ? 'LOADING...' : 'REFRESH'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && !summary ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-xs animate-pulse" style={{ color: P.dim }}>Loading ransomware intelligence...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded" style={{ backgroundColor: `${P.pink}10`, border: `1px solid ${P.pink}30` }}>
            <p className="text-xs" style={{ color: P.pink }}>Failed to load ransomware intel</p>
            <p className="text-[10px] mt-1" style={{ color: P.dim }}>{error}</p>
            <button onClick={onRefresh} className="mt-2 text-[10px] px-2 py-0.5 rounded" style={{ border: `1px solid ${P.pink}40`, color: P.pink }}>RETRY</button>
          </div>
        ) : (
          <>
            {/* Stat tiles */}
            {STAT_TILES.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-4">
                {STAT_TILES.map(t => (
                  <div key={t.label} className="p-3 rounded text-center" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    <div className="text-xl font-bold" style={{ color: t.color }}>{t.value ?? '—'}</div>
                    <div className="text-[9px] mt-0.5 tracking-wider" style={{ color: P.dim }}>{t.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Victim list */}
            <div className="space-y-1">
              <p className="text-xs mb-2 tracking-wider" style={{ color: P.dim }}>RECENT VICTIMS</p>
              {victims.length === 0 ? (
                <p className="text-xs" style={{ color: P.dim }}>No victim data. Click REFRESH to sync.</p>
              ) : (
                victims.map(v => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    <div>
                      <span className="text-xs font-medium" style={{ color: P.textLight }}>{v.victim_name}</span>
                      {v.group_name && <span className="ml-2 text-[10px]" style={{ color: P.pink }}>{v.group_name}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-[10px]" style={{ color: P.dim }}>
                      {v.sector && <span>{v.sector}</span>}
                      {v.country && <span>{v.country}</span>}
                      {v.discovered_at && <span>{new Date(v.discovered_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
