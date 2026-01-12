import { useState, useEffect, useRef } from 'react';
import { Newspaper, RefreshCw, Filter, Search, Check, Bookmark, ExternalLink, Calendar, Tag, Settings, Plus, X, AlertTriangle, Eye, Trash2, Shield } from 'lucide-react';
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

interface RSSSource {
  id: string;
  name: string;
  url: string;
  category: string;
  icon_url: string | null;
  description: string | null;
  is_active: boolean;
  is_default?: boolean;
  is_enabled?: boolean;
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
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [showAddWatchlist, setShowAddWatchlist] = useState(false);
  const [activeView, setActiveView] = useState<'news' | 'ransomware'>('news');
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [newFeed, setNewFeed] = useState({ name: '', url: '', category: 'news', description: '' });
  const [newWatchlistEntry, setNewWatchlistEntry] = useState({ type: 'keyword', value: '', description: '', severity: 'medium' });
  const { checkForNewMatches } = useAlerts();
  const hasAutoRefreshed = useRef(false);

  const categories = [
    { id: 'all', name: 'All News', color: 'slate' },
    { id: 'vulnerabilities', name: 'Vulnerabilities', color: 'red' },
    { id: 'alerts', name: 'Alerts', color: 'orange' },
    { id: 'threats', name: 'Threats', color: 'rose' },
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
      loadSources();
      loadItems();
    });

    loadSources();
    loadWatchlist();
    loadItems().then(async (loadedCount) => {
      if (loadedCount === 0 && !hasAutoRefreshed.current) {
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

  const loadSources = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const isAuthenticated = !!session?.access_token;

      const endpoint = isAuthenticated ? '/my/sources' : '/sources';
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds${endpoint}`;

      const headers: Record<string, string> = {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };

      if (isAuthenticated) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(url, { headers });
      const data = await response.json();
      setSources(data.sources || []);
    } catch (error) {
      console.error('Failed to load sources:', error);
    }
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
      const isAuthenticated = !!session?.access_token;

      const params = new URLSearchParams();
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      params.append('limit', '100');

      const endpoint = isAuthenticated ? '/my/items' : '/items';
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds${endpoint}?${params}`;

      const headers: Record<string, string> = {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };

      if (isAuthenticated) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

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
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      });
      await response.json();
      await loadItems();
      await checkForNewMatches();
    } catch (error) {
      console.error('Failed to refresh feeds:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleRead = async (itemId: string, currentState: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newState = !currentState;
    await supabase
      .from('user_feed_items')
      .upsert({
        user_id: user.id,
        item_id: itemId,
        is_read: newState,
        read_at: newState ? new Date().toISOString() : null,
      }, { onConflict: 'user_id,item_id' });

    setItems(items.map(item =>
      item.id === itemId ? { ...item, is_read: newState } : item
    ));
  };

  const toggleSaved = async (itemId: string, currentState: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newState = !currentState;
    await supabase
      .from('user_feed_items')
      .upsert({
        user_id: user.id,
        item_id: itemId,
        is_saved: newState,
        saved_at: newState ? new Date().toISOString() : null,
      }, { onConflict: 'user_id,item_id' });

    setItems(items.map(item =>
      item.id === itemId ? { ...item, is_saved: newState } : item
    ));
  };

  const checkWatchlistMatches = (item: FeedItem): WatchlistMatch[] => {
    const matches: WatchlistMatch[] = [];
    const searchText = `${item.title} ${item.description || ''}`.toLowerCase();

    for (const entry of watchlist) {
      const value = entry.value.toLowerCase();
      if (searchText.includes(value)) {
        const context = item.title.toLowerCase().includes(value) ? 'title' : 'description';
        matches.push({ entry, context });
      }
    }

    return matches;
  };

  const addCustomFeed = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('Must be logged in to add custom feeds');
        return;
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds/my/sources`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(newFeed),
      });

      if (response.ok) {
        await loadSources();
        await refreshFeeds();
        setNewFeed({ name: '', url: '', category: 'news', description: '' });
        setShowAddFeed(false);
      }
    } catch (error) {
      console.error('Failed to add feed:', error);
    }
  };

  const deleteFeed = async (sourceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds/my/sources/${sourceId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        await loadSources();
        await loadItems();
      }
    } catch (error) {
      console.error('Failed to delete feed:', error);
    }
  };

  const toggleSourceEnabled = async (sourceId: string, currentEnabled: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds/my/preferences`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          source_id: sourceId,
          is_enabled: !currentEnabled,
        }),
      });

      if (response.ok) {
        setSources(sources.map(s =>
          s.id === sourceId ? { ...s, is_enabled: !currentEnabled } : s
        ));
        await loadItems();
      }
    } catch (error) {
      console.error('Failed to toggle source:', error);
    }
  };

  const addWatchlistEntry = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('watchlist_entries').insert({
        user_id: user.id,
        entry_type: newWatchlistEntry.type,
        value: newWatchlistEntry.value,
        description: newWatchlistEntry.description || null,
        severity: newWatchlistEntry.severity,
        is_active: true,
      });

      await loadWatchlist();
      await loadItems();
      setNewWatchlistEntry({ type: 'keyword', value: '', description: '', severity: 'medium' });
      setShowAddWatchlist(false);
    } catch (error) {
      console.error('Failed to add watchlist entry:', error);
    }
  };

  const deleteWatchlistEntry = async (entryId: string) => {
    try {
      await supabase.from('watchlist_entries').delete().eq('id', entryId);
      await loadWatchlist();
      await loadItems();
    } catch (error) {
      console.error('Failed to delete watchlist entry:', error);
    }
  };

  const filteredItems = items.filter(item => {
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !item.description?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (showUnreadOnly && item.is_read) {
      return false;
    }
    if (showSavedOnly && !item.is_saved) {
      return false;
    }
    if (showWatchlistOnly && (!item.watchlist_matches || item.watchlist_matches.length === 0)) {
      return false;
    }
    return true;
  }).sort((a, b) => {
    const dateA = new Date(a.pub_date).getTime();
    const dateB = new Date(b.pub_date).getTime();
    return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'yellow';
      case 'low': return 'blue';
      default: return 'slate';
    }
  };

  const getCategoryColor = (category: string) => {
    const cat = categories.find(c => c.id === category);
    return cat?.color || 'slate';
  };

  return (
    <div className="space-y-4">
      <div className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4">
          <Newspaper className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Threat Intel Center</h1>
        <p className="text-slate-400">
          Real-time security intelligence and ransomware tracking
        </p>
      </div>

      <div className="flex justify-center gap-3 mb-4">
        <button
          onClick={() => setActiveView('news')}
          className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
            activeView === 'news'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Newspaper className="w-5 h-5" />
          Intel Stream
        </button>
        <button
          onClick={() => setActiveView('ransomware')}
          className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
            activeView === 'ransomware'
              ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Shield className="w-5 h-5" />
          Ransomware Tracker
        </button>
      </div>

      {activeView === 'ransomware' ? (
        <VictimIntelligence />
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
              <div className="relative flex-1 min-w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search intel..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
                <button
                  onClick={() => setShowWatchlist(!showWatchlist)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Watchlist
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Sources
                </button>
                <button
                  onClick={refreshFeeds}
                  disabled={refreshing}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-slate-400">Filter:</span>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedCategory === cat.id
                      ? `bg-${cat.color}-500/20 text-${cat.color}-400 border border-${cat.color}-500/30`
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
              <div className="h-4 w-px bg-slate-700 mx-1" />
              <button
                onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  showUnreadOnly
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Unread
              </button>
              <button
                onClick={() => setShowSavedOnly(!showSavedOnly)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                  showSavedOnly
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                Saved
              </button>
              <button
                onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                  showWatchlistOnly
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Alerts
              </button>
            </div>
          </div>

          {showWatchlist && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-amber-400" />
                  Watchlist
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddWatchlist(true)}
                    className="px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-400 transition-colors flex items-center gap-1 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Entry
                  </button>
                  <button
                    onClick={() => setShowWatchlist(false)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showAddWatchlist && (
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-3 border border-slate-700">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Type</label>
                      <select
                        value={newWatchlistEntry.type}
                        onChange={e => setNewWatchlistEntry({ ...newWatchlistEntry, type: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="keyword">Keyword</option>
                        <option value="ip">IP Address</option>
                        <option value="domain">Domain</option>
                        <option value="url">URL</option>
                        <option value="hash">Hash</option>
                        <option value="email">Email</option>
                        <option value="cve">CVE</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Severity</label>
                      <select
                        value={newWatchlistEntry.severity}
                        onChange={e => setNewWatchlistEntry({ ...newWatchlistEntry, severity: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Value</label>
                    <input
                      type="text"
                      value={newWatchlistEntry.value}
                      onChange={e => setNewWatchlistEntry({ ...newWatchlistEntry, value: e.target.value })}
                      placeholder="Enter IOC or keyword to monitor"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      value={newWatchlistEntry.description}
                      onChange={e => setNewWatchlistEntry({ ...newWatchlistEntry, description: e.target.value })}
                      placeholder="Why are you monitoring this?"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={addWatchlistEntry}
                      disabled={!newWatchlistEntry.value}
                      className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowAddWatchlist(false);
                        setNewWatchlistEntry({ type: 'keyword', value: '', description: '', severity: 'medium' });
                      }}
                      className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {watchlist.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No watchlist entries yet. Add IOCs or keywords to monitor.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {watchlist.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${getSeverityColor(entry.severity)}-500/20 text-${getSeverityColor(entry.severity)}-400 border border-${getSeverityColor(entry.severity)}-500/30`}>
                            {entry.severity}
                          </span>
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300 capitalize">
                            {entry.entry_type}
                          </span>
                        </div>
                        <p className="text-white font-medium">{entry.value}</p>
                        {entry.description && (
                          <p className="text-slate-400 text-sm mt-0.5">{entry.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteWatchlistEntry(entry.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showSettings && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Filter className="w-5 h-5 text-emerald-400" />
                  Feed Sources
                </h3>
                <div className="flex gap-2">
                  {isAuthenticated && (
                    <button
                      onClick={() => setShowAddFeed(true)}
                      className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-1 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Custom Feed
                    </button>
                  )}
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!isAuthenticated && (
                <p className="text-sm text-slate-400 bg-slate-800/50 rounded-lg p-3">
                  Sign in to customize your feed sources and add your own RSS feeds.
                </p>
              )}

              {showAddFeed && (
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-3 border border-slate-700">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Feed Name</label>
                    <input
                      type="text"
                      value={newFeed.name}
                      onChange={e => setNewFeed({ ...newFeed, name: e.target.value })}
                      placeholder="e.g., My Security Blog"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">RSS Feed URL</label>
                    <input
                      type="url"
                      value={newFeed.url}
                      onChange={e => setNewFeed({ ...newFeed, url: e.target.value })}
                      placeholder="https://example.com/rss"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
                    <select
                      value={newFeed.category}
                      onChange={e => setNewFeed({ ...newFeed, category: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="vulnerabilities">Vulnerabilities</option>
                      <option value="alerts">Alerts</option>
                      <option value="threats">Threats</option>
                      <option value="news">News</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      value={newFeed.description}
                      onChange={e => setNewFeed({ ...newFeed, description: e.target.value })}
                      placeholder="Brief description of this feed"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={addCustomFeed}
                      disabled={!newFeed.name || !newFeed.url}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                    >
                      Add Feed
                    </button>
                    <button
                      onClick={() => {
                        setShowAddFeed(false);
                        setNewFeed({ name: '', url: '', category: 'news', description: '' });
                      }}
                      className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4 max-h-96 overflow-y-auto">
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-2">Default Sources</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sources.filter(s => s.is_default !== false).map(source => (
                      <div
                        key={source.id}
                        className={`p-3 rounded-lg border transition-all ${
                          source.is_enabled !== false
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-slate-700 bg-slate-800/50 opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {isAuthenticated ? (
                            <button
                              onClick={() => toggleSourceEnabled(source.id, source.is_enabled !== false)}
                              className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                source.is_enabled !== false
                                  ? 'border-emerald-500 bg-emerald-500'
                                  : 'border-slate-600'
                              }`}
                            >
                              {source.is_enabled !== false && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </button>
                          ) : (
                            <div className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 border-emerald-500 bg-emerald-500`}>
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white text-sm">{source.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5 capitalize">{source.category}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {sources.some(s => s.is_default === false) && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Your Custom Sources</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sources.filter(s => s.is_default === false).map(source => (
                        <div
                          key={source.id}
                          className="p-3 rounded-lg border border-amber-500/50 bg-amber-500/10"
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-white text-sm">{source.name}</p>
                                <span className="px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">Custom</span>
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5 capitalize">{source.category}</p>
                            </div>
                            <button
                              onClick={() => deleteFeed(source.id)}
                              className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="Delete custom feed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="grid grid-cols-12 h-[calc(100vh-28rem)]">
              <div className="col-span-4 border-r border-slate-800 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <Newspaper className="w-12 h-12 text-slate-600 mb-3" />
                    <p className="text-slate-400">No articles found</p>
                    <p className="text-slate-500 text-sm mt-1">Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {filteredItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className={`w-full text-left p-4 transition-all hover:bg-slate-800/50 ${
                          selectedItem?.id === item.id ? 'bg-slate-800' : ''
                        } ${item.is_read ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${getCategoryColor(item.source.category)}-500/20 text-${getCategoryColor(item.source.category)}-400`}>
                            {item.source.name}
                          </span>
                          {item.is_saved && (
                            <Bookmark className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                          )}
                          {item.watchlist_matches && item.watchlist_matches.length > 0 && (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 fill-rose-400 flex-shrink-0" />
                          )}
                        </div>
                        <h4 className={`font-semibold mb-1 line-clamp-2 text-sm ${
                          item.is_read ? 'text-slate-400' : 'text-white'
                        }`}>
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.pub_date).toLocaleDateString()}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="col-span-8 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
                  </div>
                ) : !selectedItem ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <Newspaper className="w-16 h-16 text-slate-600 mb-4" />
                    <p className="text-slate-400 text-lg">Select an article to preview</p>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span className={`px-3 py-1 rounded-lg text-sm font-medium bg-${getCategoryColor(selectedItem.source.category)}-500/20 text-${getCategoryColor(selectedItem.source.category)}-400 border border-${getCategoryColor(selectedItem.source.category)}-500/30`}>
                            {selectedItem.source.name}
                          </span>
                          <span className="flex items-center gap-1 text-sm text-slate-400">
                            <Calendar className="w-4 h-4" />
                            {new Date(selectedItem.pub_date).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </span>
                          {selectedItem.is_saved && (
                            <span className="flex items-center gap-1 text-sm text-amber-400">
                              <Bookmark className="w-4 h-4 fill-amber-400" />
                              Saved
                            </span>
                          )}
                        </div>

                        {selectedItem.watchlist_matches && selectedItem.watchlist_matches.length > 0 && (
                          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="w-4 h-4 text-rose-400" />
                              <span className="text-sm font-semibold text-rose-400">Watchlist Matches</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {selectedItem.watchlist_matches.map((match, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-1 rounded text-xs font-medium bg-${getSeverityColor(match.entry.severity)}-500/20 text-${getSeverityColor(match.entry.severity)}-400 border border-${getSeverityColor(match.entry.severity)}-500/30`}
                                >
                                  {match.entry.value} ({match.entry.severity})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <h2 className="text-2xl font-bold text-white mb-4">{selectedItem.title}</h2>

                        {selectedItem.description && (
                          <div className="prose prose-invert max-w-none mb-6">
                            <p className="text-slate-300 leading-relaxed">
                              {selectedItem.description.replace(/<[^>]*>/g, '')}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-800">
                          <a
                            href={selectedItem.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 transition-colors font-medium"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Read Full Article
                          </a>
                          <button
                            onClick={() => toggleRead(selectedItem.id, selectedItem.is_read || false)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                          >
                            <Check className="w-4 h-4" />
                            {selectedItem.is_read ? 'Mark Unread' : 'Mark Read'}
                          </button>
                          <button
                            onClick={() => toggleSaved(selectedItem.id, selectedItem.is_saved || false)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                              selectedItem.is_saved
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                          >
                            <Bookmark className={`w-4 h-4 ${selectedItem.is_saved ? 'fill-amber-400' : ''}`} />
                            {selectedItem.is_saved ? 'Saved' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-slate-500 mt-8 pt-6 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <span>Article {filteredItems.findIndex(i => i.id === selectedItem.id) + 1} of {filteredItems.length}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const currentIndex = filteredItems.findIndex(i => i.id === selectedItem.id);
                              if (currentIndex > 0) {
                                setSelectedItem(filteredItems[currentIndex - 1]);
                              }
                            }}
                            disabled={filteredItems.findIndex(i => i.id === selectedItem.id) === 0}
                            className="px-3 py-1 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => {
                              const currentIndex = filteredItems.findIndex(i => i.id === selectedItem.id);
                              if (currentIndex < filteredItems.length - 1) {
                                setSelectedItem(filteredItems[currentIndex + 1]);
                              }
                            }}
                            disabled={filteredItems.findIndex(i => i.id === selectedItem.id) === filteredItems.length - 1}
                            className="px-3 py-1 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
