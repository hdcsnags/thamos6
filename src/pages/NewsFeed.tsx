import { useState, useEffect, useRef } from 'react';
import { Newspaper, RefreshCw, Search, Bookmark, ExternalLink, Calendar, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAlerts } from '../contexts/AlertContext';
import VictimIntelligence from '../components/VictimIntelligence';

interface FeedItem {
  id: string;
  source_id: string;
  title: string;
  description: string;
  link: string;
  pub_date: string;
  guid: string;
  created_at: string;
  source: {
    id: string;
    name: string;
    category: string;
    icon_url: string | null;
  };
  is_read?: boolean;
  is_saved?: boolean;
  watchlist_matches?: WatchlistMatch[];
}

interface WatchlistEntry {
  id: string;
  entry_type: string;
  value: string;
  description: string | null;
  severity: string;
  is_active: boolean;
  match_count: number;
  created_at: string;
}

interface WatchlistMatch {
  entry: WatchlistEntry;
  context: string;
}

export default function NewsFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const { checkForNewMatches } = useAlerts();
  const hasAutoRefreshed = useRef(false);

  const categories = [
    { id: 'all', name: 'All', color: 'cyan' },
    { id: 'vulnerabilities', name: 'Vulnerabilities', color: 'red' },
    { id: 'threats', name: 'Threats', color: 'rose' },
    { id: 'alerts', name: 'Alerts', color: 'orange' },
    { id: 'news', name: 'News', color: 'blue' },
    { id: 'ransomware', name: '🔴 Ransomware', color: 'red' },
  ];

  // Helper to strip CDATA tags from RSS content
  const stripCDATA = (text: string) => {
    if (!text) return '';
    return text.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '');
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session?.access_token);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session?.access_token);
      loadItems();
    });

    loadWatchlist();
    loadItems().then(async (count) => {
      if (count === 0 && !hasAutoRefreshed.current) {
        hasAutoRefreshed.current = true;
        await refreshFeeds();
      }
      checkForNewMatches();
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadItems();
  }, [selectedCategory]);

  useEffect(() => {
    if (filteredItems.length > 0 && !selectedItem) {
      setSelectedItem(filteredItems[0]);
    }
    if (filteredItems.length > 0 && selectedItem && !filteredItems.find(i => i.id === selectedItem.id)) {
      setSelectedItem(filteredItems[0]);
    }
  }, [items, searchTerm, showUnreadOnly, showSavedOnly, showWatchlistOnly, sortBy]);

  const checkWatchlistMatches = (item: FeedItem): WatchlistMatch[] => {
    const matches: WatchlistMatch[] = [];
    const content = `${item.title} ${item.description}`.toLowerCase();

    watchlist.forEach(entry => {
      const searchValue = entry.value.toLowerCase();
      if (content.includes(searchValue)) {
        matches.push({
          entry,
          context: content.substring(
            Math.max(0, content.indexOf(searchValue) - 50),
            Math.min(content.length, content.indexOf(searchValue) + searchValue.length + 50)
          ),
        });
      }
    });

    return matches;
  };

  const loadWatchlist = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('watchlist_entries')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      setWatchlist(data || []);
    } catch (error) {
      console.error('Failed to load watchlist:', error);
    }
  };

  const loadItems = async (): Promise<number> => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const isAuth = !!session?.access_token;

      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      params.append('limit', '100');

      const endpoint = isAuth ? '/my/items' : '/items';
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds${endpoint}?${params}`;

      const headers: Record<string, string> = {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };

      if (isAuth) headers['Authorization'] = `Bearer ${session.access_token}`;

      const response = await fetch(url, { headers });
      const data = await response.json();

      let feedItems = data.items || [];
      feedItems = feedItems.map((item: FeedItem) => ({
        ...item,
        watchlist_matches: checkWatchlistMatches(item),
      }));

      setItems(feedItems);
      return feedItems.length;
    } catch (error) {
      console.error('Failed to load items:', error);
      return 0;
    } finally {
      setLoading(false);
    }
  };

  const refreshFeeds = async () => {
    try {
      setRefreshing(true);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds/refresh`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      });
      await loadItems();
      await checkForNewMatches();
    } catch (error) {
      console.error('Failed to refresh feeds:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSaved = async (itemId: string, currentState: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_feed_items')
      .upsert({
        user_id: user.id,
        item_id: itemId,
        is_saved: !currentState,
      }, { onConflict: 'user_id,item_id' });

    setItems(items.map(item =>
      item.id === itemId ? { ...item, is_saved: !currentState } : item
    ));
  };

  const markAsRead = async (itemId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_feed_items')
      .upsert({
        user_id: user.id,
        item_id: itemId,
        is_read: true,
        read_at: new Date().toISOString(),
      }, { onConflict: 'user_id,item_id' });

    setItems(items.map(item =>
      item.id === itemId ? { ...item, is_read: true } : item
    ));
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const getCategoryColor = (category: string) => {
    const cat = categories.find(c => c.id === category);
    return cat?.color || 'slate';
  };

  const getSeverityColor = (severity: string) => {
    const map: Record<string, string> = {
      critical: 'rose',
      high: 'rose',
      medium: 'amber',
      low: 'blue',
    };
    return map[severity] || 'slate';
  };

  const getSeverityClasses = (severity: string) => {
    const map: Record<string, string> = {
      critical: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      high: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return map[severity] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const filteredItems = items
    .filter(item => {
      if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !item.description.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      if (showUnreadOnly && item.is_read) return false;
      if (showSavedOnly && !item.is_saved) return false;
      if (showWatchlistOnly && (!item.watchlist_matches || item.watchlist_matches.length === 0)) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.pub_date).getTime();
      const dateB = new Date(b.pub_date).getTime();
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

  const currentIndex = selectedItem ? filteredItems.findIndex(i => i.id === selectedItem.id) : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < filteredItems.length - 1;

  const navigatePrevious = () => {
    if (hasPrevious) {
      const prev = filteredItems[currentIndex - 1];
      setSelectedItem(prev);
      if (!prev.is_read) markAsRead(prev.id);
    }
  };

  const navigateNext = () => {
    if (hasNext) {
      const next = filteredItems[currentIndex + 1];
      setSelectedItem(next);
      if (!next.is_read) markAsRead(next.id);
    }
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-pulse" 
             style={{ backgroundSize: '100% 4px', animation: 'scanline 8s linear infinite' }} />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-5xl font-bold mb-2">
            <span className="text-white">INTEL</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500" style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>STREAM</span>
          </h1>
          <p className="text-slate-400 text-sm uppercase tracking-wider">Real-Time Threat Intelligence Feed</p>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between px-6 py-3 rounded-xl mb-6"
             style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div className="flex items-center gap-6 text-xs uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-emerald-400 font-bold">FEED_ACTIVE</span>
            </div>
            <div className="text-slate-500">|</div>
            <div className="text-slate-400">ARTICLES: <span className="text-white font-bold">{items.length}</span></div>
            <div className="text-slate-500">|</div>
            <div className="text-slate-400">WATCHLIST: <span className="text-amber-400 font-bold">{items.filter(i => i.watchlist_matches && i.watchlist_matches.length > 0).length} MATCHES</span></div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refreshFeeds}
              disabled={refreshing}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 inline mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 rounded-xl space-y-3 mb-6"
             style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="SEARCH INTELLIGENCE..."
              className="w-full px-10 py-3 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm uppercase tracking-wider font-medium"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">FILTER:</span>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  selectedCategory === cat.id
                    ? `bg-${cat.color}-500/20 text-${cat.color}-400 border border-${cat.color}-500/30`
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'
                }`}
              >
                {cat.name}
              </button>
            ))}
            
            <div className="w-px h-4 bg-slate-700 mx-2"></div>
            
            <button
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                showUnreadOnly
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'
              }`}
            >
              📖 UNREAD
            </button>
            <button
              onClick={() => setShowSavedOnly(!showSavedOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                showSavedOnly
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'
              }`}
            >
              ⭐ SAVED
            </button>
            <button
              onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                showWatchlistOnly
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'
              }`}
            >
              ⚠️ WATCHLIST ({items.filter(i => i.watchlist_matches && i.watchlist_matches.length > 0).length})
            </button>
          </div>
        </div>

        {/* Main Content: Conditional Rendering */}
        {selectedCategory === 'ransomware' ? (
          <VictimIntelligence />
        ) : (
          <div className="grid grid-cols-12 gap-6" style={{ height: 'calc(100vh - 500px)', minHeight: '600px' }}>
          
          {/* LEFT: Article List */}
          <div className="col-span-4 rounded-xl overflow-hidden"
               style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Latest Intelligence</span>
                <span className="text-xs font-bold text-cyan-400">{filteredItems.length} ARTICLES</span>
              </div>
            </div>

            {/* Article List */}
            <div className="overflow-y-auto h-full">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <Newspaper className="w-12 h-12 text-slate-600 mb-3" />
                  <p className="text-slate-400">No articles found</p>
                </div>
              ) : (
                filteredItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedItem(item);
                      if (!item.is_read) markAsRead(item.id);
                    }}
                    className={`relative p-4 border-b border-slate-800/30 cursor-pointer transition-all ${
                      selectedItem?.id === item.id ? 'bg-slate-800/30' : 'hover:bg-slate-800/20'
                    } ${item.is_read ? 'opacity-60' : ''}`}
                    style={{
                      borderLeft: selectedItem?.id === item.id ? '3px solid #06b6d4' : '3px solid transparent',
                    }}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-${getCategoryColor(item.source.category)}-500/20 text-${getCategoryColor(item.source.category)}-400 border border-${getCategoryColor(item.source.category)}-500/30`}>
                        {item.source.name}
                      </span>
                      {item.watchlist_matches && item.watchlist_matches.length > 0 && (
                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                      )}
                      {!item.is_read && (
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                      )}
                    </div>
                    <h3 className={`text-sm font-bold mb-2 leading-tight ${item.is_read ? 'text-slate-400' : 'text-white'}`}>
                      {stripCDATA(item.title)}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>📅 {getRelativeTime(item.pub_date)}</span>
                      {item.watchlist_matches && item.watchlist_matches.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-rose-400 font-bold">⚠️ WATCHLIST</span>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT: Article Preview */}
          <div className="col-span-8 rounded-xl overflow-hidden flex flex-col"
               style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
              </div>
            ) : !selectedItem ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Newspaper className="w-16 h-16 text-slate-600 mb-4" />
                <p className="text-slate-400 text-lg">Select an article to preview</p>
              </div>
            ) : (
              <>
                {/* Article Header */}
                <div className="p-6 border-b border-slate-800/50">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-${getCategoryColor(selectedItem.source.category)}-500/20 text-${getCategoryColor(selectedItem.source.category)}-400 border border-${getCategoryColor(selectedItem.source.category)}-500/30`}>
                        {selectedItem.source.name}
                      </span>
                      <span className="text-sm text-slate-400">
                        📅 {new Date(selectedItem.pub_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} • {getRelativeTime(selectedItem.pub_date)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {isAuthenticated && (
                        <button
                          onClick={() => toggleSaved(selectedItem.id, selectedItem.is_saved || false)}
                          className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all border ${
                            selectedItem.is_saved
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border-slate-700/50'
                          }`}
                          title={selectedItem.is_saved ? 'Remove from saved' : 'Save article'}
                        >
                          <Bookmark className={`w-4 h-4 ${selectedItem.is_saved ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => copyToClipboard(selectedItem.link)}
                        className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-xs font-bold uppercase transition-all border border-slate-700/50 text-slate-300 flex items-center gap-2"
                        title="Copy article link"
                      >
                        <Copy className="w-4 h-4" />
                        COPY LINK
                      </button>
                      <button
                        onClick={() => window.open(selectedItem.link, '_blank')}
                        className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-lg text-sm font-bold uppercase tracking-wider transition-all text-white flex items-center gap-2"
                      >
                        <ExternalLink className="w-5 h-5" />
                        READ FULL ARTICLE
                      </button>
                    </div>
                  </div>

                  {/* Watchlist Alert */}
                  {selectedItem.watchlist_matches && selectedItem.watchlist_matches.length > 0 && (
                    <div className="p-4 rounded-lg mb-4"
                         style={{ background: 'rgba(251, 113, 133, 0.1)', border: '1px solid rgba(251, 113, 133, 0.3)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                        <span className="text-sm font-bold text-rose-400 uppercase tracking-wider">⚠️ WATCHLIST MATCH DETECTED</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.watchlist_matches.map((match, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border ${getSeverityClasses(match.entry.severity)}`}
                          >
                            {match.entry.value} ({match.entry.severity})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <h1 className="text-3xl font-bold text-white leading-tight"
                      style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>
                    {stripCDATA(selectedItem.title)}
                  </h1>
                </div>

                {/* Article Content */}
                <div className="p-6 overflow-y-auto flex-1">
                  <div className="prose prose-invert max-w-none">
                    {selectedItem.description ? (
                      <p className="text-slate-300 leading-relaxed whitespace-pre-wrap text-lg">
                        {stripCDATA(selectedItem.description)}
                      </p>
                    ) : (
                      <div className="text-center py-12">
                        <Newspaper className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400 text-lg mb-4">Full article content not available in feed</p>
                        <button
                          onClick={() => window.open(selectedItem.link, '_blank')}
                          className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-lg text-sm font-bold uppercase tracking-wider transition-all text-white inline-flex items-center gap-2"
                        >
                          <ExternalLink className="w-5 h-5" />
                          READ FULL ARTICLE
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Article Footer */}
                <div className="px-6 py-4 border-t border-slate-800/50 flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={navigatePrevious}
                      disabled={!hasPrevious}
                      className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-xs font-bold uppercase transition-all border border-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300"
                    >
                      <ChevronLeft className="w-4 h-4 inline mr-1" />
                      PREVIOUS
                    </button>
                    <button
                      onClick={navigateNext}
                      disabled={!hasNext}
                      className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-xs font-bold uppercase transition-all border border-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300"
                    >
                      NEXT
                      <ChevronRight className="w-4 h-4 inline ml-1" />
                    </button>
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">
                    Article {currentIndex + 1} of {filteredItems.length}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
