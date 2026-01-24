import { useState, useEffect } from 'react';
import {
  Search, Newspaper, Shield, TrendingUp, Bookmark, Eye, Filter,
  AlertTriangle, RefreshCw, ChevronRight, ExternalLink, Clock,
  Hash, Globe, Link as LinkIcon, Mail, FileSearch, Puzzle, FileText,
  Activity, HelpCircle, Settings as SettingsIcon, ChevronDown
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

type ViewMode = 'dashboard' | 'intel-stream' | 'ip-lookup' | 'url-scanner' | 'hash-lookup' | 'domain-intel' | 'ioc-extractor' | 'extension-scanner';

export default function IntelHub() {
  const { user } = useAuth();
  const { checkForNewMatches } = useAlerts();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [smartIOCInput, setSmartIOCInput] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const quickAccessTools = [
    { id: 'hash-lookup', name: 'Hash', icon: Hash },
    { id: 'url-scanner', name: 'URL', icon: LinkIcon },
    { id: 'domain-intel', name: 'Domain', icon: Globe },
    { id: 'ip-lookup', name: 'IP', icon: Activity },
    { id: 'extension-scanner', name: 'Extension', icon: Puzzle },
    { id: 'ioc-extractor', name: 'File', icon: FileText },
  ];

  const categories = [
    { id: 'all', name: 'All News', icon: Newspaper },
    { id: 'vulnerabilities', name: 'Vulnerabilities', icon: AlertTriangle },
    { id: 'threats', name: 'Threats', icon: Shield },
    { id: 'alerts', name: 'Alerts', icon: TrendingUp },
    { id: 'unread', name: 'Unread', icon: Eye },
    { id: 'saved', name: 'Saved', icon: Bookmark },
  ];

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
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
    if (selectedCategory === 'unread' && item.is_read) return false;
    if (selectedCategory === 'saved' && !item.is_saved) return false;
    if (selectedCategory !== 'all' && selectedCategory !== 'unread' && selectedCategory !== 'saved' && item.source.category !== selectedCategory) {
      return false;
    }
    if (showUnreadOnly && item.is_read) return false;
    if (showSavedOnly && !item.is_saved) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return item.title.toLowerCase().includes(search) ||
             item.description?.toLowerCase().includes(search);
    }
    return true;
  });

  const unreadCount = items.filter(item => !item.is_read).length;
  const savedCount = items.filter(item => item.is_saved).length;
  const monitoredIOCs = 43;

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

  const handleSmartIOCScan = () => {
    if (smartIOCInput.trim()) {
      setViewMode('ioc-extractor');
    }
  };

  const handleItemClick = (item: FeedItem) => {
    setSelectedItem(item);
    if (!item.is_read) {
      markAsRead(item.id);
    }
  };

  const renderMainContent = () => {
    if (viewMode === 'ip-lookup') {
      return (
        <div className="h-full overflow-y-auto p-6">
          <IPLookup />
        </div>
      );
    }
    if (viewMode === 'url-scanner') {
      return (
        <div className="h-full overflow-y-auto p-6">
          <URLScanner />
        </div>
      );
    }
    if (viewMode === 'hash-lookup') {
      return (
        <div className="h-full overflow-y-auto p-6">
          <HashLookup />
        </div>
      );
    }
    if (viewMode === 'domain-intel') {
      return (
        <div className="h-full overflow-y-auto p-6">
          <DomainIntel />
        </div>
      );
    }
    if (viewMode === 'ioc-extractor') {
      return (
        <div className="h-full overflow-y-auto p-6">
          <IOCExtractor />
        </div>
      );
    }
    if (viewMode === 'extension-scanner') {
      return (
        <div className="h-full overflow-y-auto p-6">
          <ExtensionScanner />
        </div>
      );
    }

    if (viewMode === 'intel-stream') {
      return (
        <div className="h-full flex">
          {/* Feed List */}
          <div className="w-96 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search Intel..."
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Filter:
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1"
                    >
                      {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
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
                        className={`w-full text-left p-4 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all ${
                          selectedItem?.id === item.id ? 'bg-slate-100 dark:bg-slate-800/50' : ''
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
                            <div className="flex items-center gap-2 mb-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                {item.source.name}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-500">
                                {new Date(item.pub_date).toLocaleDateString()}
                              </span>
                            </div>
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

          {/* Article Detail */}
          <div className="flex-1 overflow-y-auto">
            {selectedItem ? (
              <div className="p-6 space-y-4 max-w-4xl mx-auto">
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
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-medium text-slate-900 dark:text-white">
                    {selectedItem.source.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(selectedItem.pub_date).toLocaleString()}
                  </div>
                </div>

                {selectedItem.description && (
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-lg">{selectedItem.description}</p>
                )}

                <a
                  href={selectedItem.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-all font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Read Full Article
                </a>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                  <Newspaper className="w-16 h-16 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Select an article</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    Choose an article from the list to view its full details
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8 space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white mb-4">
              <FileSearch className="w-10 h-10" />
            </div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Threat Intel Center</h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Stay updated with the latest cyber security intel and real-time alerts from trusted sources
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <button
              onClick={() => setViewMode('intel-stream')}
              className="group relative p-8 bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left overflow-hidden"
            >
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-white/20 mb-4">
                  <Newspaper className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Intel Stream</h3>
                <p className="text-cyan-50 mb-4">
                  Access real-time cyber threat intelligence from multiple trusted sources
                </p>
                <div className="flex items-center gap-2 text-white font-medium">
                  <span>View Stream</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={() => window.open('/news', '_self')}
              className="group relative p-8 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left overflow-hidden"
            >
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-white/20 mb-4">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Ransomware Tracker</h3>
                <p className="text-amber-50 mb-4">
                  Monitor and track ransomware campaigns and threat actor activity
                </p>
                <div className="flex items-center gap-2 text-white font-medium">
                  <span>View Tracker</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Activity className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <h4 className="font-semibold text-slate-900 dark:text-white">Monitored IOCs</h4>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{monitoredIOCs}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">Active watchlist items</p>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <h4 className="font-semibold text-slate-900 dark:text-white">Unread Threats</h4>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{unreadCount}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">New intel to review</p>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <h4 className="font-semibold text-slate-900 dark:text-white">Threat Sources</h4>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{sources.length}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">Active RSS feeds</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Persistent Smart IOC Scanner Bar */}
      <div className="flex-shrink-0 bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black border-b border-slate-700 dark:border-slate-800">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                <FileSearch className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Smart IOC Scanner</h2>
            </div>
            <div className="flex-1 flex items-center gap-3">
              <div className="relative flex-1 max-w-4xl">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={smartIOCInput}
                  onChange={(e) => setSmartIOCInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSmartIOCScan()}
                  placeholder="Scan hash, URL, domain, IP, address, Chrome extension, file hash..."
                  className="w-full pl-12 pr-4 py-3 bg-slate-700 dark:bg-slate-800 border border-slate-600 dark:border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <button
                onClick={handleSmartIOCScan}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <Search className="w-5 h-5" />
                Scan
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {quickAccessTools.map(tool => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => setViewMode(tool.id as ViewMode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    viewMode === tool.id
                      ? 'bg-cyan-500 text-white'
                      : 'bg-slate-700 dark:bg-slate-800 text-slate-300 hover:bg-slate-600 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tool.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Stats & Navigation */}
        {viewMode === 'intel-stream' && (
          <div className="w-64 flex-shrink-0 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-2">
                  New IOC Alerts
                </h3>
                <button
                  onClick={() => setViewMode('dashboard')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    <span className="text-sm font-medium">Dashboard</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="px-3 py-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{monitoredIOCs}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Monitored IOCs</div>
                </div>
                <div className="px-3 py-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{unreadCount}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Unresolved Threats</div>
                </div>
                <div className="px-3 py-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{sources.length}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Threat Sources</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-2">
                  Navigation
                </h3>
                <div className="space-y-1">
                  <button
                    onClick={() => setViewMode('dashboard')}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                  >
                    <Activity className="w-4 h-4" />
                    Dashboard
                  </button>
                  <button
                    onClick={() => setViewMode('intel-stream')}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 transition-all"
                  >
                    <Newspaper className="w-4 h-4" />
                    Intel Stream
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-2">
                  Filter
                </h3>
                <div className="space-y-1">
                  {categories.map(cat => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                          selectedCategory === cat.id
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 bg-white dark:bg-slate-900 overflow-hidden">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
}
