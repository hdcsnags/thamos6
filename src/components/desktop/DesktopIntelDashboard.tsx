import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

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
  source: {
    name: string;
    category: string;
  };
}

export function DesktopIntelDashboard() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const hasAutoRefreshed = useRef(false);

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

  const loadItems = async (): Promise<number> => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const isAuth = !!session?.access_token;

      const params = new URLSearchParams();
      if (filter !== 'all') params.append('category', filter);
      params.append('limit', '100');

      const endpoint = isAuth ? '/my/items' : '/items';
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds${endpoint}?${params}`;

      const headers: Record<string, string> = {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };
      if (isAuth) headers['Authorization'] = `Bearer ${session.access_token}`;

      const response = await fetch(url, { headers });
      const data = await response.json();
      const feedItems = data.items || [];
      setItems(feedItems);
      return feedItems.length;
    } catch {
      return 0;
    } finally {
      setLoading(false);
    }
  };

  const refreshFeeds = async () => {
    setRefreshing(true);
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({}),
      });
      await loadItems();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadItems().then(count => {
      if (count === 0 && !hasAutoRefreshed.current) {
        hasAutoRefreshed.current = true;
        refreshFeeds();
      }
    });
  }, []);

  useEffect(() => { loadItems(); }, [filter]);

  const filtered = items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return item.title.toLowerCase().includes(s) || item.description?.toLowerCase().includes(s);
  });

  const catColor = (cat: string) => {
    const map: Record<string, string> = { vulnerabilities: P.pink, threats: P.pink, alerts: P.amber, news: P.cyan, ransomware: P.pink };
    return map[cat] || P.cyan;
  };

  return (
    <div className="h-full flex" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
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
            {['all', 'vulnerabilities', 'threats', 'alerts', 'news'].map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className="px-2 py-0.5 text-xs rounded transition-all"
                style={{
                  backgroundColor: filter === cat ? `${catColor(cat)}15` : 'transparent',
                  border: `1px solid ${filter === cat ? `${catColor(cat)}40` : P.border}`,
                  color: filter === cat ? catColor(cat) : P.dim,
                }}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-xs animate-pulse" style={{ color: P.dim }}>Loading feeds...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center">
              <span className="text-xs" style={{ color: P.dim }}>No articles found</span>
            </div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="w-full p-3 text-left transition-all"
                style={{
                  borderBottom: `1px solid ${P.border}`,
                  backgroundColor: selectedItem?.id === item.id ? `${P.cyan}08` : 'transparent',
                  borderLeft: selectedItem?.id === item.id ? `2px solid ${P.cyan}` : '2px solid transparent',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${catColor(item.source.category)}15`, color: catColor(item.source.category), border: `1px solid ${catColor(item.source.category)}30` }}>
                    {item.source.name}
                  </span>
                  <span className="text-xs" style={{ color: P.dim }}>{getRelativeTime(item.pub_date)}</span>
                </div>
                <p className="text-xs leading-relaxed line-clamp-2" style={{ color: selectedItem?.id === item.id ? P.textLight : P.text }}>
                  {stripCDATA(item.title)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedItem ? (
          <>
            <div className="p-4" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${catColor(selectedItem.source.category)}15`, color: catColor(selectedItem.source.category), border: `1px solid ${catColor(selectedItem.source.category)}30` }}>
                  {selectedItem.source.name}
                </span>
                <span className="text-xs" style={{ color: P.dim }}>
                  {new Date(selectedItem.pub_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <h1 className="text-sm font-medium leading-relaxed" style={{ color: P.textLight }}>
                {stripCDATA(selectedItem.title)}
              </h1>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
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
  );
}
