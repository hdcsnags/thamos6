import { useState, useEffect } from 'react';
import {
  Search, Newspaper, Shield, TrendingUp, Bookmark, Eye, Filter,
  AlertTriangle, RefreshCw, ChevronRight, ExternalLink, Clock,
  Hash, Globe, Link as LinkIcon, Mail, FileSearch, Puzzle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAlerts } from '../contexts/AlertContext';
import IPLookup from './IPLookup';
import URLScanner from './URLScanner';
import HashLookup from './HashLookup';
import DomainIntel from './DomainIntel';
import IOCExtractor from './IOCExtractor';
import ExtensionScanner from './ExtensionScanner';

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
  category: string;
  is_active: boolean;
}

type ViewMode = 'feed' | 'ip-lookup' | 'url-scanner' | 'hash-lookup' | 'domain-intel' | 'ioc-extractor' | 'extension-scanner';

export default function IntelHub() {
  const { user } = useAuth();
  const { checkForNewMatches } = useAlerts();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);

  const categories = [
    { id: 'all', name: 'All News', icon: Newspaper, color: 'slate' },
    { id: 'vulnerabilities', name: 'Vulnerabilities', icon: AlertTriangle, color: 'red' },
    { id: 'threats', name: 'Threats', icon: Shield, color: 'rose' },
    { id: 'alerts', name: 'Security Alerts', icon: TrendingUp, color: 'orange' },
    { id: 'news', name: 'Cyber News', icon: Newspaper, color: 'blue' },
  ];

  const tools = [
    { id: 'ip-lookup', name: 'IP Lookup', icon: Search },
    { id: 'url-scanner', name: 'URL Scanner', icon: LinkIcon },
    { id: 'hash-lookup', name: 'Hash Lookup', icon: Hash },
    { id: 'domain-intel', name: 'Domain Intel', icon: Globe },
    { id: 'ioc-extractor', name: 'Smart IOC', icon: FileSearch },
    { id: 'extension-scanner', name: 'Extension Scanner', icon: Puzzle },
  ];

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sourcesData, itemsData] = await Promise.all([
        loadSources(),
        loadItems()
      ]);

      if (user) {
        await checkForNewMatches();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSources = async () => {
    const { data } = await supabase
      .from('rss_sources')
      .select('id, name, category, is_active')
      .eq('is_active', true)
      .order('name');

    if (data) {
      setSources(data);
    }
    return data;
  };

  const loadItems = async () => {
    let query = supabase
      .from('feed_items')
      .select(`
        *,
        source:rss_sources(id, name, category, icon_url)
      `)
      .order('pub_date', { ascending: false })
      .limit(100);

    const { data } = await query;

    if (data) {
      if (user) {
        const { data: userItems } = await supabase
          .from('user_feed_items')
          .select('item_id, is_read, is_saved')
          .eq('user_id', user.id);

        const userItemsMap = new Map(
          userItems?.map(item => [item.item_id, item]) || []
        );

        const enrichedItems = data.map(item => ({
          ...item,
          is_read: userItemsMap.get(item.id)?.is_read || false,
          is_saved: userItemsMap.get(item.id)?.is_saved || false,
        }));

        setItems(enrichedItems);
      } else {
        setItems(data);
      }
    }
    return data;
  };

  const filteredItems = items.filter(item => {
    if (selectedCategory !== 'all' && item.source.category !== selectedCategory) {
      return false;
    }
    if (showUnreadOnly && item.is_read) {
      return false;
    }
    if (showSavedOnly && !item.is_saved) {
      return false;
    }
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return item.title.toLowerCase().includes(search) ||
             item.description?.toLowerCase().includes(search);
    }
    return true;
  });

  const markAsRead = async (itemId: string) => {
    if (!user) return;

    await supabase
      .from('user_feed_items')
      .upsert({
        user_id: user.id,
        item_id: itemId,
        is_read: true,
        read_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,item_id'
      });

    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, is_read: true } : item
    ));
  };

  const toggleSaved = async (itemId: string) => {
    if (!user) return;

    const item = items.find(i => i.id === itemId);
    const newSavedState = !item?.is_saved;

    await supabase
      .from('user_feed_items')
      .upsert({
        user_id: user.id,
        item_id: itemId,
        is_saved: newSavedState,
        saved_at: newSavedState ? new Date().toISOString() : null
      }, {
        onConflict: 'user_id,item_id'
      });

    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, is_saved: newSavedState } : item
    ));
  };

  const handleItemClick = (item: FeedItem) => {
    setSelectedItem(item);
    setViewMode('feed');
    if (!item.is_read) {
      markAsRead(item.id);
    }
  };

  const handleToolClick = (toolId: string) => {
    setViewMode(toolId as ViewMode);
    setSelectedItem(null);
  };

  const renderRightPanel = () => {
    if (viewMode === 'ip-lookup') return <IPLookup />;
    if (viewMode === 'url-scanner') return <URLScanner />;
    if (viewMode === 'hash-lookup') return <HashLookup />;
    if (viewMode === 'domain-intel') return <DomainIntel />;
    if (viewMode === 'ioc-extractor') return <IOCExtractor />;
    if (viewMode === 'extension-scanner') return <ExtensionScanner />;

    if (selectedItem) {
      return (
        <div className="h-full overflow-y-auto">
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{selectedItem.title}</h2>
              <button
                onClick={() => toggleSaved(selectedItem.id)}
                className={`p-2 rounded-lg transition-all ${
                  selectedItem.is_saved
                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Bookmark className="w-5 h-5" fill={selectedItem.is_saved ? 'currentColor' : 'none'} />
              </button>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900 dark:text-white">{selectedItem.source.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {new Date(selectedItem.pub_date).toLocaleString()}
              </div>
            </div>

            {selectedItem.description && (
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{selectedItem.description}</p>
            )}

            <a
              href={selectedItem.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              Read Full Article
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <FileSearch className="w-16 h-16 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Select an item or tool</h3>
          <p className="text-slate-600 dark:text-slate-400">
            Choose a feed item from the center panel or select a tool from the left sidebar to get started
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left Sidebar */}
      <div className={`${leftSidebarCollapsed ? 'w-16' : 'w-64'} flex-shrink-0 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-all`}>
        <div className="h-full flex flex-col">
          {!leftSidebarCollapsed && (
            <>
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Intelligence Hub</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search feeds..."
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-2">Feeds</p>
                  {categories.map(cat => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => { setSelectedCategory(cat.id); setViewMode('feed'); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                          selectedCategory === cat.id && viewMode === 'feed'
                            ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-2">Tools</p>
                  {tools.map(tool => {
                    const Icon = tool.icon;
                    return (
                      <button
                        key={tool.id}
                        onClick={() => handleToolClick(tool.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                          viewMode === tool.id
                            ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{tool.name}</span>
                      </button>
                    );
                  })}
                </div>

                {user && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-2">Filters</p>
                    <button
                      onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                        showUnreadOnly
                          ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                      <span className="font-medium">Unread Only</span>
                    </button>
                    <button
                      onClick={() => setShowSavedOnly(!showSavedOnly)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                        showSavedOnly
                          ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Bookmark className="w-4 h-4" />
                      <span className="font-medium">Saved Only</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center Panel - Item List */}
      {viewMode === 'feed' && (
        <div className="w-96 flex-shrink-0 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {categories.find(c => c.id === selectedCategory)?.name || 'All News'}
              </h3>
              <button
                onClick={loadData}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
              >
                <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Newspaper className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-slate-400">No items found</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={`w-full text-left p-4 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                        selectedItem?.id === item.id ? 'bg-slate-100 dark:bg-slate-800' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {!item.is_read && (
                          <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-medium mb-1 line-clamp-2 ${
                            item.is_read ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'
                          }`}>
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">{item.source.name}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{item.description}</p>
                        </div>
                        {item.is_saved && (
                          <Bookmark className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right Panel - Detail View / Tools */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {renderRightPanel()}
      </div>
    </div>
  );
}
