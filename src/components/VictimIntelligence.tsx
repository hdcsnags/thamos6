import { useState, useEffect } from 'react';
import { Shield, TrendingUp, MapPin, Building2, Users, AlertTriangle, ExternalLink, Calendar, DollarSign, RefreshCw } from 'lucide-react';

interface VictimSummary {
  total_victims: number;
  recent_victims: number;
  active_groups: number;
  countries_targeted: number;
  sectors_impacted: number;
  total_ransom_demanded: number;
}

interface RansomwareVictim {
  id: string;
  victim_name: string;
  description: string;
  discovery_date: string;
  country_code: string;
  country_name: string;
  sector: string;
  ransom_amount: number;
  leak_site_url: string;
  screenshot_url: string;
  data_leaked: boolean;
  victim_group_associations: Array<{
    group: {
      id: string;
      name: string;
      severity_level: string;
    };
  }>;
}

interface ThreatActorGroup {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  victim_count: number;
  severity_level: string;
  is_active: boolean;
  last_activity: string;
}

export default function VictimIntelligence() {
  const [summary, setSummary] = useState<VictimSummary | null>(null);
  const [victims, setVictims] = useState<RansomwareVictim[]>([]);
  const [groups, setGroups] = useState<ThreatActorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'victims' | 'groups' | 'analytics'>('victims');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const [summaryRes, victimsRes, groupsRes] = await Promise.all([
        fetch(`${baseUrl}/functions/v1/ransomware-intel/summary`, {
          headers: { 'apikey': apikey }
        }),
        fetch(`${baseUrl}/functions/v1/ransomware-intel/victims?limit=50`, {
          headers: { 'apikey': apikey }
        }),
        fetch(`${baseUrl}/functions/v1/ransomware-intel/groups`, {
          headers: { 'apikey': apikey }
        })
      ]);

      const [summaryData, victimsData, groupsData] = await Promise.all([
        summaryRes.json(),
        victimsRes.json(),
        groupsRes.json()
      ]);

      setSummary(summaryData);
      setVictims(victimsData.victims || []);
      setGroups(groupsData.groups || []);
    } catch (error) {
      console.error('Failed to load ransomware intelligence:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncData = async () => {
    setSyncing(true);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      await fetch(`${baseUrl}/functions/v1/ransomware-intel/sync`, {
        method: 'POST',
        headers: { 'apikey': apikey }
      });

      await loadData();
    } catch (error) {
      console.error('Failed to sync data:', error);
    } finally {
      setSyncing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'yellow';
      case 'low': return 'blue';
      default: return 'slate';
    }
  };

  const formatCurrency = (amount: number) => {
    if (!amount) return 'Undisclosed';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw className="w-8 h-8 text-slate-500 animate-spin mx-auto mb-3" />
        <p className="text-slate-400">Loading ransomware intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Ransomware Victim Intelligence</h2>
          <p className="text-slate-400">Real-time tracking of ransomware victims and threat actor groups</p>
        </div>
        <button
          onClick={syncData}
          disabled={syncing}
          className="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg hover:from-red-400 hover:to-rose-500 disabled:opacity-50 transition-all flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Latest Data'}
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-gradient-to-br from-red-500/10 to-rose-600/10 border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{summary.total_victims || 0}</div>
                <div className="text-xs text-slate-400">Total Victims</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500/10 to-amber-600/10 border border-orange-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{summary.recent_victims || 0}</div>
                <div className="text-xs text-slate-400">Recent (30d)</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-fuchsia-600/10 border border-purple-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{summary.active_groups || 0}</div>
                <div className="text-xs text-slate-400">Active Groups</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-600/10 border border-blue-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <MapPin className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{summary.countries_targeted || 0}</div>
                <div className="text-xs text-slate-400">Countries</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500/10 to-teal-600/10 border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Building2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{summary.sectors_impacted || 0}</div>
                <div className="text-xs text-slate-400">Sectors</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-500/10 to-orange-600/10 border border-yellow-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <DollarSign className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-white">{formatCurrency(summary.total_ransom_demanded || 0)}</div>
                <div className="text-xs text-slate-400">Total Ransom</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 rounded-xl border border-slate-800">
        <div className="border-b border-slate-800">
          <div className="flex gap-4 p-4">
            <button
              onClick={() => setActiveTab('victims')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'victims'
                  ? 'bg-red-500 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Latest Victims
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'groups'
                  ? 'bg-purple-500 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Threat Actor Groups
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'analytics'
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Analytics
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'victims' && (
            <div className="space-y-4">
              {victims.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No victims found. Click "Sync Latest Data" to fetch intelligence.</p>
              ) : (
                victims.map(victim => (
                  <div key={victim.id} className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-white">{victim.victim_name}</h3>
                          {victim.victim_group_associations?.[0]?.group && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${getSeverityColor(victim.victim_group_associations[0].group.severity_level)}-500/20 text-${getSeverityColor(victim.victim_group_associations[0].group.severity_level)}-400 border border-${getSeverityColor(victim.victim_group_associations[0].group.severity_level)}-500/30`}>
                              {victim.victim_group_associations[0].group.name}
                            </span>
                          )}
                        </div>

                        {victim.description && (
                          <p className="text-slate-400 text-sm mb-3">{victim.description}</p>
                        )}

                        <div className="flex flex-wrap gap-3 text-sm">
                          {victim.country_name && (
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <MapPin className="w-4 h-4" />
                              {victim.country_name}
                            </div>
                          )}
                          {victim.sector && (
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <Building2 className="w-4 h-4" />
                              {victim.sector}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            {formatDate(victim.discovery_date)}
                          </div>
                          {victim.ransom_amount && (
                            <div className="flex items-center gap-1.5 text-amber-400">
                              <DollarSign className="w-4 h-4" />
                              {formatCurrency(victim.ransom_amount)}
                            </div>
                          )}
                        </div>
                      </div>

                      {victim.leak_site_url && (
                        <a
                          href={victim.leak_site_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white transition-colors text-sm flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Leak Site
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.length === 0 ? (
                <p className="col-span-full text-center text-slate-400 py-8">No threat groups found. Click "Sync Latest Data" to fetch intelligence.</p>
              ) : (
                groups.map(group => (
                  <div key={group.id} className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1">{group.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${getSeverityColor(group.severity_level)}-500/20 text-${getSeverityColor(group.severity_level)}-400 border border-${getSeverityColor(group.severity_level)}-500/30`}>
                          {group.severity_level.toUpperCase()}
                        </span>
                      </div>
                      {group.is_active && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                          Active
                        </span>
                      )}
                    </div>

                    {group.description && (
                      <p className="text-slate-400 text-sm mb-3 line-clamp-2">{group.description}</p>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Shield className="w-4 h-4" />
                        {group.victim_count} victims
                      </div>
                      {group.last_activity && (
                        <div className="text-slate-500 text-xs">
                          Last: {formatDate(group.last_activity)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="text-center py-12">
              <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Analytics dashboard coming soon</p>
              <p className="text-slate-500 text-sm mt-2">Geographic and sector targeting analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
