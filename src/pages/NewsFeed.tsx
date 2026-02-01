import { useState, useEffect, useRef } from 'react';
import { Newspaper, RefreshCw, Search, Bookmark, ExternalLink, Calendar, Settings, Eye, Zap, ChevronLeft, ChevronRight, X, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAlerts } from '../contexts/AlertContext';

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
  const [showIOCExtractor, setShowIOCExtractor] = useState(false);
  const [extractedIOCs, setExtractedIOCs] = useState<{ ips: string[], domains: string[], urls: string[], hashes: string[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const categories = [
    { id: 'all', name: 'All', color: 'cyan' },
    { id: 'vulnerabilities', name: 'Vulnerabilities', color: 'red' },
    { id: 'threats', name: 'Threats', color: 'rose' },
    { id: 'alerts', name: 'Alerts', color: 'orange' },
    { id: 'news', name: 'News', color: 'blue' },
  ];

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

  const extractIOCs = (text: string) => {
    const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const hashRegex = /\b[a-f0-9]{32}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{64}\b/gi;

    return {
      ips: Array.from(new Set((text.match(ipRegex) || []).filter(ip => !ip.startsWith('127.') && !ip.startsWith('0.')))),
      domains: Array.from(new Set((text.match(domainRegex) || []).filter(d => !d.match(/\.(jpg|png|gif|pdf)$/i)))),
      urls: Array.from(new Set(text.match(urlRegex) || [])),
      hashes: Array.from(new Set(text.match(hashRegex) || [])),
    };
  };

  const handleExtractIOCs = () => {
    if (!selectedItem) return;
    const text = `${selectedItem.title} ${selectedItem.description}`.toLowerCase();
    const iocs = extractIOCs(text);
    setExtractedIOCs(iocs);
    setShowIOCExtractor(true);
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
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

        {/* Main Content: Two Column Layout */}
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
                      {item.title}
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
                        >
                          <Bookmark className={`w-4 h-4 ${selectedItem.is_saved ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => window.open(selectedItem.link, '_blank')}
                        className="px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-xs font-bold uppercase transition-all border border-slate-700/50 text-slate-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleExtractIOCs}
                        className="px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 rounded-lg text-xs font-bold uppercase transition-all text-white"
                      >
                        <Zap className="w-4 h-4 inline mr-1" />
                        EXTRACT IOCs
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
                            className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider bg-${getSeverityColor(match.entry.severity)}-500/20 text-${getSeverityColor(match.entry.severity)}-400 border border-${getSeverityColor(match.entry.severity)}-500/30`}
                          >
                            {match.entry.value} ({match.entry.severity})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <h1 className="text-3xl font-bold text-white leading-tight"
                      style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>
                    {selectedItem.title}
                  </h1>
                </div>

                {/* Article Content */}
                <div className="p-6 overflow-y-auto flex-1">
                  <div className="prose prose-invert max-w-none">
                    <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {selectedItem.description?.replace(/<[^>]*>/g, '') || 'No description available.'}
                    </p>
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
      </div>

      {/* IOC Extractor Modal */}
      {showIOCExtractor && extractedIOCs && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">💎 Extracted IOCs</h2>
              <button
                onClick={() => setShowIOCExtractor(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* IPs */}
              {extractedIOCs.ips.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-cyan-400">IP Addresses ({extractedIOCs.ips.length})</h3>
                    <button
                      onClick={() => copyToClipboard(extractedIOCs.ips.join('\n'), 'ips')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase transition-all"
                    >
                      {copied === 'ips' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {extractedIOCs.ips.map((ip, idx) => (
                      <div key={idx} className="p-3 bg-slate-800/50 rounded-lg font-mono text-sm text-cyan-400">
                        {ip}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Domains */}
              {extractedIOCs.domains.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-blue-400">Domains ({extractedIOCs.domains.length})</h3>
                    <button
                      onClick={() => copyToClipboard(extractedIOCs.domains.join('\n'), 'domains')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase transition-all"
                    >
                      {copied === 'domains' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {extractedIOCs.domains.map((domain, idx) => (
                      <div key={idx} className="p-3 bg-slate-800/50 rounded-lg font-mono text-sm text-blue-400">
                        {domain}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* URLs */}
              {extractedIOCs.urls.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-amber-400">URLs ({extractedIOCs.urls.length})</h3>
                    <button
                      onClick={() => copyToClipboard(extractedIOCs.urls.join('\n'), 'urls')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase transition-all"
                    >
                      {copied === 'urls' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {extractedIOCs.urls.map((url, idx) => (
                      <div key={idx} className="p-3 bg-slate-800/50 rounded-lg font-mono text-sm text-amber-400 break-all">
                        {url}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hashes */}
              {extractedIOCs.hashes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-rose-400">File Hashes ({extractedIOCs.hashes.length})</h3>
                    <button
                      onClick={() => copyToClipboard(extractedIOCs.hashes.join('\n'), 'hashes')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase transition-all"
                    >
                      {copied === 'hashes' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {extractedIOCs.hashes.map((hash, idx) => (
                      <div key={idx} className="p-3 bg-slate-800/50 rounded-lg font-mono text-sm text-rose-400 break-all">
                        {hash}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {extractedIOCs.ips.length === 0 && extractedIOCs.domains.length === 0 && 
               extractedIOCs.urls.length === 0 && extractedIOCs.hashes.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-slate-400">No IOCs found in this article.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
