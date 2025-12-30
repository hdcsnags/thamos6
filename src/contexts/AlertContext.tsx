import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface Alert {
  id: string;
  watchlist_entry_id: string;
  feed_item_id: string;
  title: string;
  description: string | null;
  severity: string;
  match_context: string;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
  watchlist_entry?: {
    value: string;
    entry_type: string;
  };
  feed_item?: {
    link: string;
    source: {
      name: string;
    };
  };
}

interface AlertContextType {
  alerts: Alert[];
  unreadCount: number;
  loading: boolean;
  loadAlerts: () => Promise<void>;
  markAsRead: (alertId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissAlert: (alertId: string) => Promise<void>;
  dismissAllAlerts: () => Promise<void>;
  checkForNewMatches: () => Promise<number>;
}

const AlertContext = createContext<AlertContextType | null>(null);

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAlerts must be used within AlertProvider');
  }
  return ctx;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAlerts = useCallback(async () => {
    if (!user) {
      setAlerts([]);
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase
        .from('user_alerts')
        .select(`
          *,
          watchlist_entry:watchlist_entries(value, entry_type),
          feed_item:feed_items(link, source:rss_sources(name))
        `)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(50);

      setAlerts(data || []);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const markAsRead = async (alertId: string) => {
    if (!user) return;

    await supabase
      .from('user_alerts')
      .update({ is_read: true })
      .eq('id', alertId);

    setAlerts(alerts.map(a =>
      a.id === alertId ? { ...a, is_read: true } : a
    ));
  };

  const markAllAsRead = async () => {
    if (!user) return;

    await supabase
      .from('user_alerts')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setAlerts(alerts.map(a => ({ ...a, is_read: true })));
  };

  const dismissAlert = async (alertId: string) => {
    if (!user) return;

    await supabase
      .from('user_alerts')
      .update({ is_dismissed: true })
      .eq('id', alertId);

    setAlerts(alerts.filter(a => a.id !== alertId));
  };

  const dismissAllAlerts = async () => {
    if (!user) return;

    await supabase
      .from('user_alerts')
      .update({ is_dismissed: true })
      .eq('user_id', user.id)
      .eq('is_dismissed', false);

    setAlerts([]);
  };

  const checkForNewMatches = async (): Promise<number> => {
    if (!user) return 0;

    try {
      const { data: watchlist } = await supabase
        .from('watchlist_entries')
        .select('*')
        .eq('is_active', true);

      if (!watchlist || watchlist.length === 0) return 0;

      const { data: existingAlerts } = await supabase
        .from('user_alerts')
        .select('feed_item_id, watchlist_entry_id');

      const existingSet = new Set(
        (existingAlerts || []).map(a => `${a.watchlist_entry_id}:${a.feed_item_id}`)
      );

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { data: recentItems } = await supabase
        .from('feed_items')
        .select('id, title, description, link, pub_date, source:rss_sources(name)')
        .gte('created_at', oneDayAgo.toISOString())
        .order('pub_date', { ascending: false });

      if (!recentItems || recentItems.length === 0) return 0;

      const newAlerts: {
        user_id: string;
        watchlist_entry_id: string;
        feed_item_id: string;
        title: string;
        description: string;
        severity: string;
        match_context: string;
      }[] = [];

      for (const item of recentItems) {
        const searchText = `${item.title} ${item.description || ''}`.toLowerCase();

        for (const entry of watchlist) {
          const value = entry.value.toLowerCase();
          const key = `${entry.id}:${item.id}`;

          if (existingSet.has(key)) continue;

          if (searchText.includes(value)) {
            const context = item.title.toLowerCase().includes(value) ? 'title' : 'description';
            newAlerts.push({
              user_id: user.id,
              watchlist_entry_id: entry.id,
              feed_item_id: item.id,
              title: item.title,
              description: `Matched "${entry.value}" in ${context}`,
              severity: entry.severity,
              match_context: context,
            });
            existingSet.add(key);
          }
        }
      }

      if (newAlerts.length > 0) {
        await supabase.from('user_alerts').insert(newAlerts);
        await loadAlerts();
      }

      return newAlerts.length;
    } catch (error) {
      console.error('Failed to check for matches:', error);
      return 0;
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    if (user) {
      checkForNewMatches();
      const interval = setInterval(checkForNewMatches, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <AlertContext.Provider value={{
      alerts,
      unreadCount,
      loading,
      loadAlerts,
      markAsRead,
      markAllAsRead,
      dismissAlert,
      dismissAllAlerts,
      checkForNewMatches,
    }}>
      {children}
    </AlertContext.Provider>
  );
}
