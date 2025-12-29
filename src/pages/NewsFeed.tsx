import { useState, useEffect } from 'react';
import { Newspaper, RefreshCw, Filter, Search, Check, Bookmark, ExternalLink, Calendar, Tag, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
}

interface RSSSource {
  id: string;
  name: string;
  url: string;
  category: string;
  icon_url: string | null;
  description: string | null;
  is_active: boolean;
}

export default function NewsFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const categories = [
    { id: 'all', name: 'All News', color: 'slate' },
    { id: 'vulnerabilities', name: 'Vulnerabilities', color: 'red' },
    { id: 'alerts', name: 'Alerts', color: 'orange' },
    { id: 'threats', name: 'Threats', color: 'rose' },
    { id: 'news', name: 'News', color: 'blue' },
  ];

  useEffect(() => {
    loadSources();
    loadItems();
  }, []);

  useEffect(() => {
    loadItems();
  }, [selectedCategory, selectedSources]);

  const loadSources = async () => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds/sources`;
      const response = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });
      const data = await response.json();
      setSources(data.sources || []);
    } catch (error) {
      console.error('Failed to load sources:', error);
    }
  };

  const loadItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }

      params.append('limit', '100');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-feeds/items?${params}`;
      const response = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });
      const data = await response.json();

      let feedItems = data.items || [];

      if (selectedSources.size > 0) {
        feedItems = feedItems.filter((item: FeedItem) => selectedSources.has(item.source_id));
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const itemIds = feedItems.map((item: FeedItem) => item.id);
        const { data: userItems } = await supabase
          .from('user_feed_items')
          .select('item_id, is_read, is_saved')
          .eq('user_id', user.id)
          .in('item_id', itemIds);

        const statusMap = new Map(userItems?.map(ui => [ui.item_id, ui]) || []);
        feedItems = feedItems.map((item: FeedItem) => ({
          ...item,
          is_read: statusMap.get(item.id)?.is_read || false,
          is_saved: statusMap.get(item.id)?.is_saved || false,
        }));
      }

      setItems(feedItems);
    } catch (error) {
      console.error('Failed to load items:', error);
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

  const toggleSource = (sourceId: string) => {
    const newSelected = new Set(selectedSources);
    if (newSelected.has(sourceId)) {
      newSelected.delete(sourceId);
    } else {
      newSelected.add(sourceId);
    }
    setSelectedSources(newSelected);
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
    return true;
  });

  const getCategoryColor = (category: string) => {
    const cat = categories.find(c => c.id === category);
    return cat?.color || 'slate';
  };

  return (
    <div className="space-y-6">
      <div className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4">
          <Newspaper className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Security News Feed</h1>
        <p className="text-slate-400">
          Stay updated with the latest vulnerabilities, exploits, threats, and cybersecurity news from trusted sources
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedCategory === cat.id
                  ? `bg-${cat.color}-500 text-white`
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
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

      {showSettings && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Filter className="w-5 h-5 text-emerald-400" />
            Feed Sources
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.map(source => (
              <button
                key={source.id}
                onClick={() => toggleSource(source.id)}
                className={`p-3 rounded-lg border transition-all text-left ${
                  selectedSources.has(source.id) || selectedSources.size === 0
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-700 bg-slate-800/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center ${
                    selectedSources.has(source.id) || selectedSources.size === 0
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-slate-600'
                  }`}>
                    {(selectedSources.has(source.id) || selectedSources.size === 0) && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{source.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 capitalize">{source.category}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search articles..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              showUnreadOnly
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Unread Only
          </button>
          <button
            onClick={() => setShowSavedOnly(!showSavedOnly)}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
              showSavedOnly
                ? 'bg-amber-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            Saved
          </button>
        </div>

        <div className="text-sm text-slate-400">
          Showing {filteredItems.length} of {items.length} articles
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-slate-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-400">Loading feed...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-slate-800">
          <Newspaper className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No articles found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className={`bg-slate-900 rounded-xl border transition-all ${
                item.is_read ? 'border-slate-800 opacity-60' : 'border-slate-700'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${getCategoryColor(item.source.category)}-500/20 text-${getCategoryColor(item.source.category)}-400 border border-${getCategoryColor(item.source.category)}-500/30`}>
                        {item.source.name}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.pub_date).toLocaleDateString()}
                      </span>
                      {item.is_saved && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <Bookmark className="w-3 h-3 fill-amber-400" />
                          Saved
                        </span>
                      )}
                    </div>

                    <h3 className={`text-lg font-semibold mb-2 ${
                      item.is_read ? 'text-slate-400' : 'text-white'
                    }`}>
                      {item.title}
                    </h3>

                    {item.description && (
                      <p className="text-slate-400 text-sm mb-3 line-clamp-2">
                        {item.description.replace(/<[^>]*>/g, '')}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors text-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Read Article
                      </a>
                      <button
                        onClick={() => toggleRead(item.id, item.is_read || false)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors text-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {item.is_read ? 'Mark Unread' : 'Mark Read'}
                      </button>
                      <button
                        onClick={() => toggleSaved(item.id, item.is_saved || false)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-sm ${
                          item.is_saved
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${item.is_saved ? 'fill-amber-400' : ''}`} />
                        {item.is_saved ? 'Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
