import { useState, useEffect } from 'react';
import { Shield, Users, Activity, Ban, Award, Search, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface UserData {
  user_id: string;
  email: string;
  tier: 'free' | 'org';
  is_admin: boolean;
  is_banned: boolean;
  created_at: string;
  last_login_at: string;
  updated_at: string;
  api_key_count: number;
  case_note_count: number;
  total_lookups: number;
  last_activity_date: string;
}

export default function Admin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    orgTierUsers: 0,
  });

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredUsers(
        users.filter(u =>
          u.email.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredUsers(users);
    }
  }, [searchTerm, users]);

  const checkAdminStatus = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (data && data.is_admin) {
      setIsAdmin(true);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_user_overview')
        .select('*');

      if (error) throw error;

      if (data) {
        setUsers(data);
        setFilteredUsers(data);

        setStats({
          totalUsers: data.length,
          activeUsers: data.filter(u => !u.is_banned).length,
          bannedUsers: data.filter(u => u.is_banned).length,
          orgTierUsers: data.filter(u => u.tier === 'org').length,
        });
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserTier = async (userId: string, currentTier: 'free' | 'org') => {
    try {
      const newTier = currentTier === 'free' ? 'org' : 'free';

      const { data, error } = await supabase.rpc('update_user_tier', {
        target_user_id: userId,
        new_tier: newTier,
      });

      if (error) throw error;

      await fetchUsers();
    } catch (err) {
      console.error('Error updating tier:', err);
      alert(err instanceof Error ? err.message : 'Failed to update user tier');
    }
  };

  const toggleUserBan = async (userId: string, currentlyBanned: boolean) => {
    try {
      const { data, error } = await supabase.rpc('update_user_ban_status', {
        target_user_id: userId,
        banned: !currentlyBanned,
      });

      if (error) throw error;

      await fetchUsers();
    } catch (err) {
      console.error('Error updating ban status:', err);
      alert(err instanceof Error ? err.message : 'Failed to update ban status');
    }
  };

  if (!user) {
    return (
      <div className="text-center py-16">
        <Shield className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Sign in Required</h2>
        <p className="text-slate-400">Sign in to access the admin panel.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <Ban className="w-16 h-16 text-red-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400">You do not have permission to access this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <Shield className="w-6 h-6 text-cyan-400" />
            Admin Dashboard
          </h1>
          <p className="text-slate-400">Manage users, tiers, and view system statistics</p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <p className="text-slate-400 text-sm">Total Users</p>
          </div>
          <p className="text-3xl font-bold text-white">{stats.totalUsers}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <p className="text-slate-400 text-sm">Active Users</p>
          </div>
          <p className="text-3xl font-bold text-white">{stats.activeUsers}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Award className="w-5 h-5 text-amber-400" />
            <p className="text-slate-400 text-sm">Org Tier</p>
          </div>
          <p className="text-3xl font-bold text-white">{stats.orgTierUsers}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Ban className="w-5 h-5 text-red-400" />
            <p className="text-slate-400 text-sm">Banned Users</p>
          </div>
          <p className="text-3xl font-bold text-white">{stats.bannedUsers}</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search users by email..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-sm font-medium text-slate-400 pb-3">Email</th>
                <th className="text-left text-sm font-medium text-slate-400 pb-3">Tier</th>
                <th className="text-left text-sm font-medium text-slate-400 pb-3">Status</th>
                <th className="text-left text-sm font-medium text-slate-400 pb-3">Lookups</th>
                <th className="text-left text-sm font-medium text-slate-400 pb-3">API Keys</th>
                <th className="text-left text-sm font-medium text-slate-400 pb-3">Cases</th>
                <th className="text-left text-sm font-medium text-slate-400 pb-3">Last Login</th>
                <th className="text-left text-sm font-medium text-slate-400 pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(userData => (
                <tr key={userData.user_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3">
                    <div>
                      <p className="text-white font-medium">{userData.email}</p>
                      {userData.is_admin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded mt-1">
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => toggleUserTier(userData.user_id, userData.tier)}
                      disabled={userData.user_id === user.id}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                        userData.tier === 'org'
                          ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {userData.tier === 'org' ? 'Org' : 'Free'}
                    </button>
                  </td>
                  <td className="py-3">
                    {userData.is_banned ? (
                      <span className="px-3 py-1 bg-red-500/10 text-red-400 text-sm rounded-lg">
                        Banned
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-sm rounded-lg">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-slate-300">{userData.total_lookups || 0}</td>
                  <td className="py-3 text-slate-300">{userData.api_key_count || 0}</td>
                  <td className="py-3 text-slate-300">{userData.case_note_count || 0}</td>
                  <td className="py-3 text-slate-400 text-sm">
                    {userData.last_login_at ? new Date(userData.last_login_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => toggleUserBan(userData.user_id, userData.is_banned)}
                      disabled={userData.user_id === user.id}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        userData.is_banned
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      }`}
                    >
                      {userData.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500">No users found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
