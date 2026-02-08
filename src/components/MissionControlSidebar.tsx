import { useState, useEffect } from 'react';
import { Activity, Shield, AlertTriangle, TrendingUp, Zap, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Stats {
  totalScans: number;
  threatsFound: number;
  watchlistItems: number;
  recentActivity: number;
}

export default function MissionControlSidebar() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalScans: 0,
    threatsFound: 0,
    watchlistItems: 0,
    recentActivity: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadStats = async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [historyRes, watchlistRes, usageRes] = await Promise.all([
          supabase
            .from('search_history')
            .select('id, verdict', { count: 'exact' })
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1000),
          supabase
            .from('watchlist')
            .select('id', { count: 'exact' })
            .eq('user_id', user.id),
          supabase
            .from('usage_stats')
            .select('count')
            .eq('user_id', user.id)
            .gte('date', thirtyDaysAgo.toISOString().split('T')[0]),
        ]);

        const totalScans = historyRes.data?.length || 0;
        const threatsFound = historyRes.data?.filter(item =>
          item.verdict === 'malicious' || item.verdict === 'suspicious'
        ).length || 0;
        const watchlistItems = watchlistRes.count || 0;
        const recentActivity = usageRes.data?.reduce((sum, stat) => sum + stat.count, 0) || 0;

        setStats({
          totalScans,
          threatsFound,
          watchlistItems,
          recentActivity,
        });
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 30000);

    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div className="w-64 bg-slate-900/50 border-r border-cyan-500/30 p-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-900/50 border-r border-cyan-500/30 p-4 space-y-6 overflow-y-auto">
      <div className="text-center pb-4 border-b border-cyan-500/30">
        <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-1">
          Mission Control
        </h2>
        <p className="text-xs text-slate-500">Real-time Intel</p>
      </div>

      <div className="space-y-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Your Intel
        </div>

        <div className="space-y-3">
          <div className="bg-slate-800/50 rounded-lg p-3 border border-cyan-500/20 mission-control-scan-line">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">Total Scans</span>
              <Activity className="w-3 h-3 text-cyan-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.totalScans.toLocaleString()}</p>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3 border border-red-500/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">Threats Found</span>
              <AlertTriangle className="w-3 h-3 text-red-400" />
            </div>
            <p className="text-2xl font-bold text-red-400">{stats.threatsFound.toLocaleString()}</p>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3 border border-amber-500/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">Watchlist</span>
              <Shield className="w-3 h-3 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400">{stats.watchlistItems.toLocaleString()}</p>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">30d Activity</span>
              <TrendingUp className="w-3 h-3 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">{stats.recentActivity.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-cyan-500/30">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          System Status
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3 text-emerald-400 mission-control-pulse" />
              <span className="text-slate-400">Database</span>
            </div>
            <span className="text-emerald-400 font-medium">Online</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Database className="w-3 h-3 text-cyan-400 mission-control-pulse" />
              <span className="text-slate-400">Intel Feeds</span>
            </div>
            <span className="text-cyan-400 font-medium">Active</span>
          </div>
        </div>
      </div>

      {!user && (
        <div className="mt-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-xs text-amber-400 text-center">
            Sign in to see your personalized stats
          </p>
        </div>
      )}
    </div>
  );
}
