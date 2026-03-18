import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/themecontext';
import { useToast } from './ToastNotifications';
import { supabase } from '../../lib/supabase';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  cyan: '#00d9ff',
  green: '#00ff9d',
  amber: '#fbbf24',
  pink: '#ff0080',
};

type TabType = 'account' | 'api-keys' | 'connections' | 'vps' | 'appearance';

interface ApiKey {
  id: string;
  service: string;
  api_key: string;
  is_active: boolean;
}

const SERVICES = [
  { id: 'anthropic_key', name: 'Anthropic', desc: 'ThamOS-X / Claude' },
  { id: 'openai_key', name: 'OpenAI', desc: 'ThamOS-Y / GPT' },
  { id: 'gemini_key', name: 'Google Gemini', desc: 'ThamOS-Z / Gemini' },
  { id: 'virustotal', name: 'VirusTotal', desc: 'File/URL analysis' },
  { id: 'abuseipdb', name: 'AbuseIPDB', desc: 'IP reputation' },
  { id: 'shodan', name: 'Shodan', desc: 'Device search' },
  { id: 'greynoise', name: 'GreyNoise', desc: 'Scan data' },
  { id: 'urlscan', name: 'URLScan.io', desc: 'URL scanning' },
  { id: 'alienvault', name: 'AlienVault OTX', desc: 'Threat intel' },
  { id: 'ipqualityscore', name: 'IPQualityScore', desc: 'Fraud detection' },
  { id: 'proxycheck', name: 'ProxyCheck', desc: 'Proxy/VPN detection' },
  { id: 'ip2proxy', name: 'IP2Proxy', desc: 'Proxy database' },
  { id: 'iphub', name: 'IPHub', desc: 'VPN/proxy detection' },
];

export function DesktopSettings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { addToast } = useToast();
  const [tab, setTab] = useState<TabType>('api-keys');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState({ service: '', key: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwForm, setPwForm] = useState({ newPassword: '', confirm: '' });
  const [changingPw, setChangingPw] = useState(false);
  const [vpsConns, setVpsConns] = useState<{ id: string; name: string; vps_url: string; hostname: string; is_default: boolean }[]>([]);
  const [vpsLoading, setVpsLoading] = useState(false);
  const [newVps, setNewVps] = useState({ name: '', url: '', hostname: '' });
  const [accentColor, setAccentColorState] = useState(() => localStorage.getItem('thamos6-accent') || '#00d9ff');
  const [savingVps, setSavingVps] = useState(false);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    addToast({ type: type === 'success' ? 'success' : 'error', title: text });
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchKeys = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('user_api_keys').select('*').eq('user_id', user.id).order('service');
    if (data) setApiKeys(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const addKey = async () => {
    if (!user || !newKey.service || !newKey.key) return;
    setSaving(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-keys`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: newKey.service, apiKey: newKey.key }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save');
      showMsg('success', `${newKey.service} key saved (encrypted)`);
      setNewKey({ service: '', key: '' });
      fetchKeys();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (id: string, service: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-keys/${service}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to delete');
      showMsg('success', 'Key deleted');
      fetchKeys();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const changePw = async () => {
    if (!pwForm.newPassword || pwForm.newPassword !== pwForm.confirm) {
      showMsg('error', 'Passwords do not match');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      showMsg('error', 'Min 8 characters');
      return;
    }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPassword });
      if (error) throw error;
      showMsg('success', 'Password changed');
      setPwForm({ newPassword: '', confirm: '' });
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setChangingPw(false);
    }
  };

  const fetchVps = useCallback(async () => {
    if (!user) return;
    setVpsLoading(true);
    const { data } = await supabase.from('user_vps_connections').select('id, name, vps_url, hostname, is_default').eq('user_id', user.id).order('created_at');
    if (data) setVpsConns(data);
    setVpsLoading(false);
  }, [user]);

  useEffect(() => { fetchVps(); }, [fetchVps]);

  const addVps = async () => {
    if (!user || !newVps.name || !newVps.url) return;
    setSavingVps(true);
    try {
      const isFirst = vpsConns.length === 0;
      await supabase.from('user_vps_connections').insert({
        user_id: user.id, name: newVps.name, vps_url: newVps.url, hostname: newVps.hostname, is_default: isFirst,
      });
      showMsg('success', `VPS "${newVps.name}" added`);
      setNewVps({ name: '', url: '', hostname: '' });
      fetchVps();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingVps(false);
    }
  };

  const deleteVps = async (id: string) => {
    await supabase.from('user_vps_connections').delete().eq('id', id);
    showMsg('success', 'VPS connection removed');
    fetchVps();
  };

  const setDefaultVps = async (id: string) => {
    if (!user) return;
    await supabase.from('user_vps_connections').update({ is_default: false }).eq('user_id', user.id);
    await supabase.from('user_vps_connections').update({ is_default: true }).eq('id', id);
    showMsg('success', 'Default VPS updated');
    fetchVps();
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: P.void, color: P.dim }}>
        <span className="text-xs">Sign in to access settings</span>
      </div>
    );
  }

  const isGitHubConnected = user?.app_metadata?.provider === 'github' ||
    user?.identities?.some(i => i.provider === 'github');

  const tabs: { id: TabType; label: string }[] = [
    { id: 'api-keys', label: 'API KEYS' },
    { id: 'connections', label: 'CONNECTIONS' },
    { id: 'vps', label: 'VPS' },
    { id: 'account', label: 'ACCOUNT' },
    { id: 'appearance', label: 'THEME' },
  ];

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="flex" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2.5 text-xs font-medium tracking-wider transition-all"
            style={{
              color: tab === t.id ? P.cyan : P.dim,
              borderBottom: `2px solid ${tab === t.id ? P.cyan : 'transparent'}`,
              backgroundColor: tab === t.id ? `${P.cyan}08` : 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <div className="px-4 py-2" style={{ backgroundColor: message.type === 'success' ? `${P.green}10` : `${P.pink}10`, borderBottom: `1px solid ${message.type === 'success' ? `${P.green}30` : `${P.pink}30`}` }}>
          <span className="text-xs" style={{ color: message.type === 'success' ? P.green : P.pink }}>{message.text}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'api-keys' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: P.cyan }} />
              <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>API KEY MANAGEMENT</span>
            </div>

            <div className="space-y-2">
              <select
                value={newKey.service}
                onChange={e => setNewKey({ ...newKey, service: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded focus:outline-none"
                style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
              >
                <option value="">Select service...</option>
                {SERVICES.map(s => <option key={s.id} value={s.id}>{s.name} - {s.desc}</option>)}
              </select>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newKey.key}
                  onChange={e => setNewKey({ ...newKey, key: e.target.value })}
                  placeholder="API key..."
                  className="flex-1 px-3 py-2 text-xs rounded focus:outline-none"
                  style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
                />
                <button
                  onClick={addKey}
                  disabled={!newKey.service || !newKey.key || saving}
                  className="px-4 py-2 text-xs font-medium rounded transition-all"
                  style={{
                    backgroundColor: newKey.service && newKey.key ? `${P.green}15` : P.surfaceLight,
                    border: `1px solid ${newKey.service && newKey.key ? `${P.green}40` : P.border}`,
                    color: newKey.service && newKey.key ? P.green : P.dim,
                  }}
                >
                  {saving ? '...' : 'ADD'}
                </button>
              </div>
            </div>

            {loading ? (
              <span className="text-xs" style={{ color: P.dim }}>Loading...</span>
            ) : (
              <div className="space-y-1">
                {SERVICES.map(service => {
                  const key = apiKeys.find(k => k.service === service.id);
                  return (
                    <div
                      key={service.id}
                      className="flex items-center justify-between p-2.5 rounded"
                      style={{
                        backgroundColor: key ? `${P.green}06` : P.surface,
                        border: `1px solid ${key ? `${P.green}20` : P.border}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: key ? P.green : P.dim, boxShadow: key ? `0 0 6px ${P.green}40` : 'none' }} />
                        <div>
                          <span className="text-xs font-medium" style={{ color: key ? P.green : P.text }}>{service.name}</span>
                          <span className="text-xs ml-2" style={{ color: P.dim }}>{service.desc}</span>
                        </div>
                      </div>
                      {key && (
                        <button
                          onClick={() => deleteKey(key.id, key.service)}
                          className="text-xs px-2 py-0.5 rounded transition-all"
                          style={{ color: P.dim, border: `1px solid ${P.border}` }}
                        >
                          x
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.green }} />
                <span className="text-xs" style={{ color: P.green }}>AES-256-GCM ENCRYPTION</span>
              </div>
              <span className="text-xs" style={{ color: P.dim }}>All keys encrypted at rest</span>
            </div>
          </div>
        )}

        {tab === 'connections' && (
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: P.cyan }} />
              <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>CONNECTED ACCOUNTS</span>
            </div>

            <div className="p-3 rounded" style={{
              backgroundColor: isGitHubConnected ? `${P.green}06` : P.surface,
              border: `1px solid ${isGitHubConnected ? `${P.green}20` : P.border}`,
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{
                    backgroundColor: isGitHubConnected ? P.green : P.dim,
                    boxShadow: isGitHubConnected ? `0 0 6px ${P.green}40` : 'none',
                  }} />
                  <div>
                    <span className="text-xs font-medium" style={{ color: isGitHubConnected ? P.green : P.text }}>GitHub</span>
                    <span className="text-xs ml-2" style={{ color: P.dim }}>
                      {isGitHubConnected ? 'Connected via OAuth' : 'Not connected'}
                    </span>
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded" style={{
                  backgroundColor: isGitHubConnected ? `${P.green}15` : `${P.dim}15`,
                  color: isGitHubConnected ? P.green : P.dim,
                  border: `1px solid ${isGitHubConnected ? `${P.green}30` : `${P.dim}30`}`,
                }}>
                  {isGitHubConnected ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              {isGitHubConnected && user?.user_metadata?.user_name && (
                <div className="mt-2 ml-5">
                  <span className="text-xs" style={{ color: P.dim }}>
                    @{user.user_metadata.user_name}
                  </span>
                </div>
              )}
            </div>

            <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
              <span className="text-xs" style={{ color: P.dim, lineHeight: '1.6' }}>
                GitHub access enables the File Manager app to browse your repositories.
                You can also connect by pasting a personal access token directly in the File Manager.
              </span>
            </div>
          </div>
        )}

        {tab === 'vps' && (
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: P.amber }} />
              <span className="text-xs font-medium tracking-wider" style={{ color: P.amber }}>VPS CONNECTIONS</span>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={newVps.name}
                onChange={e => setNewVps({ ...newVps, name: e.target.value })}
                placeholder="Connection name (e.g. Primary VPS)"
                className="w-full px-3 py-2 text-xs rounded focus:outline-none"
                style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <input
                type="text"
                value={newVps.url}
                onChange={e => setNewVps({ ...newVps, url: e.target.value })}
                placeholder="Tunnel URL (e.g. terminal.thamos.online)"
                className="w-full px-3 py-2 text-xs rounded focus:outline-none"
                style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <input
                type="text"
                value={newVps.hostname}
                onChange={e => setNewVps({ ...newVps, hostname: e.target.value })}
                placeholder="Display hostname (optional)"
                className="w-full px-3 py-2 text-xs rounded focus:outline-none"
                style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <button
                onClick={addVps}
                disabled={!newVps.name || !newVps.url || savingVps}
                className="w-full py-2 text-xs font-medium rounded transition-all"
                style={{
                  backgroundColor: newVps.name && newVps.url ? `${P.amber}15` : P.surfaceLight,
                  border: `1px solid ${newVps.name && newVps.url ? `${P.amber}40` : P.border}`,
                  color: newVps.name && newVps.url ? P.amber : P.dim,
                }}
              >
                {savingVps ? '...' : 'ADD CONNECTION'}
              </button>
            </div>

            {vpsLoading ? (
              <span className="text-xs" style={{ color: P.dim }}>Loading...</span>
            ) : vpsConns.length === 0 ? (
              <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                <span className="text-xs" style={{ color: P.dim }}>No VPS connections configured. Add one above to get started.</span>
              </div>
            ) : (
              <div className="space-y-1">
                {vpsConns.map(conn => (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between p-2.5 rounded"
                    style={{
                      backgroundColor: conn.is_default ? `${P.amber}06` : P.surface,
                      border: `1px solid ${conn.is_default ? `${P.amber}20` : P.border}`,
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{
                        backgroundColor: conn.is_default ? P.amber : P.dim,
                        boxShadow: conn.is_default ? `0 0 6px ${P.amber}40` : 'none',
                      }} />
                      <div className="min-w-0">
                        <span className="text-xs font-medium" style={{ color: conn.is_default ? P.amber : P.text }}>{conn.name}</span>
                        <span className="text-xs ml-2 truncate" style={{ color: P.dim }}>{conn.vps_url}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {!conn.is_default && (
                        <button
                          onClick={() => setDefaultVps(conn.id)}
                          className="text-xs px-2 py-0.5 rounded transition-all"
                          style={{ color: P.amber, border: `1px solid ${P.amber}30` }}
                        >
                          DEFAULT
                        </button>
                      )}
                      {conn.is_default && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{
                          backgroundColor: `${P.amber}15`,
                          color: P.amber,
                          border: `1px solid ${P.amber}30`,
                        }}>
                          DEFAULT
                        </span>
                      )}
                      <button
                        onClick={() => deleteVps(conn.id)}
                        className="text-xs px-2 py-0.5 rounded transition-all"
                        style={{ color: P.dim, border: `1px solid ${P.border}` }}
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 rounded" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.amber }} />
                <span className="text-xs" style={{ color: P.amber }}>CLOUDFLARE TUNNEL</span>
              </div>
              <span className="text-xs" style={{ color: P.dim, lineHeight: '1.6' }}>
                VPS Terminal connects via ttyd + Cloudflare Tunnel. No ports need to be open on your server. The default connection is used when opening VPS Terminal.
              </span>
            </div>
          </div>
        )}

        {tab === 'account' && (
          <div className="space-y-6 max-w-md">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: P.cyan }} />
                <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>ACCOUNT</span>
              </div>
              <div className="p-3 rounded space-y-2" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                <div>
                  <span className="text-xs" style={{ color: P.dim }}>EMAIL</span>
                  <p className="text-xs" style={{ color: P.textLight }}>{user?.email}</p>
                </div>
                <div>
                  <span className="text-xs" style={{ color: P.dim }}>CREATED</span>
                  <p className="text-xs" style={{ color: P.textLight }}>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: P.amber }} />
                <span className="text-xs font-medium tracking-wider" style={{ color: P.amber }}>CHANGE PASSWORD</span>
              </div>
              <div className="space-y-2">
                <input
                  type="password"
                  value={pwForm.newPassword}
                  onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  placeholder="New password..."
                  className="w-full px-3 py-2 text-xs rounded focus:outline-none"
                  style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
                />
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                  placeholder="Confirm password..."
                  className="w-full px-3 py-2 text-xs rounded focus:outline-none"
                  style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
                />
                <button
                  onClick={changePw}
                  disabled={!pwForm.newPassword || !pwForm.confirm || changingPw}
                  className="w-full py-2 text-xs font-medium rounded transition-all"
                  style={{
                    backgroundColor: pwForm.newPassword && pwForm.confirm ? `${P.amber}15` : P.surfaceLight,
                    border: `1px solid ${pwForm.newPassword && pwForm.confirm ? `${P.amber}40` : P.border}`,
                    color: pwForm.newPassword && pwForm.confirm ? P.amber : P.dim,
                  }}
                >
                  {changingPw ? 'CHANGING...' : 'CHANGE PASSWORD'}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="space-y-4 max-w-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: P.cyan }} />
              <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>UI THEME</span>
            </div>
            {[
              { id: 'desktop' as const, name: 'DESKTOP', desc: 'Windowed OS environment with multi-app workspace', color: P.cyan },
              { id: 'tactical' as const, name: 'TACTICAL', desc: 'Modern dashboard with sidebar navigation', color: P.green },
              { id: 'terminal' as const, name: 'TERMINAL', desc: 'Command-line interface with CRT aesthetics', color: P.amber },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="w-full p-4 rounded text-left transition-all"
                style={{
                  backgroundColor: theme === t.id ? `${t.color}08` : P.surface,
                  border: `1px solid ${theme === t.id ? `${t.color}40` : P.border}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium" style={{ color: theme === t.id ? t.color : P.textLight }}>{t.name}</span>
                    <p className="text-xs mt-1" style={{ color: P.dim }}>{t.desc}</p>
                  </div>
                  {theme === t.id && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${t.color}15`, color: t.color, border: `1px solid ${t.color}30` }}>
                      ACTIVE
                    </span>
                  )}
                </div>
              </button>
            ))}

            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: accentColor }} />
                <span className="text-xs font-medium tracking-wider" style={{ color: accentColor }}>ACCENT COLOR</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { color: '#00d9ff', name: 'Cyan' },
                  { color: '#00ff9d', name: 'Green' },
                  { color: '#fbbf24', name: 'Amber' },
                  { color: '#f43f5e', name: 'Rose' },
                  { color: '#00b4d8', name: 'Blue' },
                  { color: '#2dd4bf', name: 'Teal' },
                  { color: '#a855f7', name: 'Purple' },
                  { color: '#ff6b35', name: 'Orange' },
                  { color: '#ff0080', name: 'Pink' },
                ].map(opt => (
                  <button
                    key={opt.color}
                    onClick={() => {
                      setAccentColorState(opt.color);
                      localStorage.setItem('thamos6-accent', opt.color);
                      addToast({ type: 'success', title: `Accent: ${opt.name}`, message: 'Refresh to apply fully' });
                    }}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: accentColor === opt.color ? `${opt.color}15` : P.surface,
                      border: `1px solid ${accentColor === opt.color ? `${opt.color}40` : P.border}`,
                      minWidth: '56px',
                    }}
                    title={opt.name}
                  >
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{
                        backgroundColor: opt.color,
                        boxShadow: accentColor === opt.color ? `0 0 12px ${opt.color}60` : 'none',
                      }}
                    />
                    <span className="text-[10px]" style={{ color: accentColor === opt.color ? opt.color : P.dim }}>{opt.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
