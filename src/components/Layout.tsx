import { useState, useRef, useEffect } from 'react';
import {
  Shield, Search, Link, Layers, History, AlertTriangle, Mail, FileSearch, 
  Hash, Globe, ShieldOff, Code, FileText, LogIn, LogOut, Settings, User, 
  Newspaper, Bell, ExternalLink, Check, Trash2, Puzzle, Zap, Clock, Grid3X3,
  Palette
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAlerts } from '../contexts/AlertContext';
import { useTheme } from '../contexts/themecontext';
import { supabase } from '../lib/supabase';
import ThemeToggle from './ThemeToggle';
import MissionControlSidebar from './MissionControlSidebar';
import CommandPalette from './CommandPalette';

export type Page = 'scanner' | 'intel' | 'news' | 'ip' | 'url' | 'bulk' | 'history' | 'email' | 'ioc' | 'hash' | 'domain' | 'defang' | 'decoder' | 'cases' | 'settings' | 'admin' | 'extension';

interface LayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onScan: (type: string, value: string) => void;
  children: React.ReactNode;
}

// Sidebar navigation items
const sidebarItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'scanner', label: 'Scanner', icon: Search },
  { id: 'news', label: 'Intel Stream', icon: Zap },
  { id: 'history', label: 'History', icon: Clock },
];

// Tools dropdown items
const toolsItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'ip', label: 'IP Lookup', icon: Globe },
  { id: 'url', label: 'URL Scanner', icon: Link },
  { id: 'hash', label: 'Hash Lookup', icon: Hash },
  { id: 'domain', label: 'Domain Intel', icon: Globe },
  { id: 'extension', label: 'Extension Scanner', icon: Puzzle },
  { id: 'email', label: 'Email Analyzer', icon: Mail },
  { id: 'ioc', label: 'IOC Extractor', icon: FileSearch },
  { id: 'bulk', label: 'Bulk Lookup', icon: Layers },
  { id: 'defang', label: 'Defang/Refang', icon: ShieldOff },
  { id: 'decoder', label: 'Decoder', icon: Code },
  { id: 'cases', label: 'Case Notes', icon: FileText },
];

// Login Modal Component
function LoginModal({ onClose }: { onClose: () => void }) {
  const { signInWithGoogle, signInWithMicrosoft, signInWithPassword, signUpWithPassword, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      setLoading(false);
    }
  };

  const handleMicrosoft = async () => {
    setLoading(true);
    try {
      await signInWithMicrosoft();
    } catch {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (showResetPassword) {
        await resetPassword(email);
        setSuccess('Password reset email sent! Check your inbox.');
        setLoading(false);
      } else if (isSignUp) {
        await signUpWithPassword(email, password);
        onClose();
      } else {
        await signInWithPassword(email, password);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-gradient-to-br from-cyan-500 to-emerald-400 rounded-xl mb-4 shadow-[0_0_24px_rgba(34,211,238,0.3)]">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Sign in to Thamos6</h2>
          <p className="text-slate-600 dark:text-slate-400">Access your personal API keys and usage stats</p>
        </div>

        {!showEmailForm ? (
          <div className="space-y-3">
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-xl transition-all disabled:opacity-50 border-2 border-slate-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <button
              onClick={handleMicrosoft}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-xl transition-all disabled:opacity-50 border-2 border-slate-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 23 23">
                <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Continue with Microsoft
            </button>

            <button
              onClick={() => setShowEmailForm(true)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-medium rounded-xl transition-all disabled:opacity-50"
            >
              <Mail className="w-5 h-5" />
              Continue with Email
            </button>
          </div>
        ) : (
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-start gap-2">
                <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                placeholder="you@example.com"
              />
            </div>
            
            {!showResetPassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                  placeholder="••••••••"
                />
              </div>
            )}
            
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg"
            >
              {loading ? 'Loading...' : showResetPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
            
            <div className="space-y-2 text-center text-sm">
              {!showResetPassword && (
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-cyan-400 hover:text-cyan-300 transition-all"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              )}
              <br />
              <button
                type="button"
                onClick={() => setShowResetPassword(!showResetPassword)}
                className="text-slate-500 hover:text-slate-400 transition-all"
              >
                {showResetPassword ? 'Back to sign in' : 'Forgot password?'}
              </button>
              <br />
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="text-slate-500 hover:text-slate-400 transition-all"
              >
                ← Back to options
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Tools Dropdown Component
function ToolsDropdown({ currentPage, onNavigate }: { currentPage: Page; onNavigate: (page: Page) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = toolsItems.some(item => item.id === currentPage);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          isActive
            ? 'bg-cyan-500/15 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
            : 'text-slate-500 hover:bg-white/5 hover:text-cyan-400'
        }`}
        title="Tools"
      >
        <Grid3X3 className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute left-full ml-2 top-0 w-64 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-2 border-b border-slate-800">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2">Tools & Utilities</p>
          </div>
          <div className="p-2 max-h-96 overflow-y-auto">
            {toolsItems.map(item => {
              const Icon = item.icon;
              const isItemActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
                    isItemActive
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Alert Dropdown Component
function AlertDropdown({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { user } = useAuth();
  const { alerts, markAsRead, dismissAlert, markAllAsRead, dismissAllAlerts } = useAlerts();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const unreadCount = alerts.filter(a => !a.is_read).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'yellow';
      case 'low': return 'blue';
      default: return 'slate';
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all text-slate-500 hover:bg-white/5 hover:text-cyan-400"
        title="Alerts"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-amber-400' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-20 top-20 w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-[100]">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Alerts</h3>
              <p className="text-xs text-slate-400">
                {unreadCount > 0 ? `${unreadCount} unread` : 'No new alerts'}
              </p>
            </div>
            {alerts.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={markAllAsRead}
                  className="px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all"
                >
                  Mark all read
                </button>
                <button
                  onClick={dismissAllAlerts}
                  className="px-2 py-1 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No alerts yet</p>
                <p className="text-slate-500 text-xs mt-1">
                  Add items to your watchlist to receive alerts
                </p>
                <button
                  onClick={() => { onNavigate('news'); setOpen(false); }}
                  className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium rounded-lg transition-all"
                >
                  Go to News Feed
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-4 hover:bg-slate-800/50 transition-all ${!alert.is_read ? 'bg-slate-800/30' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-lg bg-${getSeverityColor(alert.severity)}-500/20`}>
                        <AlertTriangle className={`w-4 h-4 text-${getSeverityColor(alert.severity)}-400`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium bg-${getSeverityColor(alert.severity)}-500/20 text-${getSeverityColor(alert.severity)}-400`}>
                            {alert.severity}
                          </span>
                          {!alert.is_read && (
                            <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          )}
                        </div>
                        <p className="text-sm text-white font-medium line-clamp-2">{alert.title}</p>
                        <p className="text-xs text-slate-400 mt-1">{alert.description}</p>
                        {alert.watchlist_entry && (
                          <p className="text-xs text-amber-400 mt-1">
                            Matched: {alert.watchlist_entry.value}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {alert.feed_item?.link && (
                            <a
                              href={alert.feed_item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => markAsRead(alert.id)}
                              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-all"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Read article
                            </a>
                          )}
                          {!alert.is_read && (
                            <button
                              onClick={() => markAsRead(alert.id)}
                              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-all"
                            >
                              <Check className="w-3 h-3" />
                              Mark read
                            </button>
                          )}
                          <button
                            onClick={() => dismissAlert(alert.id)}
                            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {alerts.length > 0 && (
            <div className="p-3 border-t border-slate-800">
              <button
                onClick={() => { onNavigate('news'); setOpen(false); }}
                className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-all"
              >
                View News Feed
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// User Menu Component
function UserMenu({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.is_admin) {
        setIsAdmin(true);
      }
    };
    checkAdmin();
  }, [user]);

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url;
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-cyan-400 hover:border-cyan-500/50 transition-all overflow-hidden"
        title="Profile"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-full ml-2 bottom-0 w-64 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-4 border-b border-slate-800">
            <p className="font-semibold text-white truncate">{name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>

          <div className="p-2">
            <button
              onClick={() => {
                onNavigate('settings');
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Settings</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => {
                  onNavigate('admin');
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
              >
                <Shield className="w-4 h-4" />
                <span className="text-sm font-medium">Admin Panel</span>
              </button>
            )}

            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Main Layout Component
export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const [showLogin, setShowLogin] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (theme === 'mission-control' && e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [theme]);

  const isMissionControl = theme === 'mission-control';

  return (
    <div className={`h-screen flex ${isMissionControl ? 'mission-control-active' : 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950'}`}>
      {/* Ultra-minimal left sidebar */}
      <aside className="w-16 border-r border-white/5 bg-[#01040a] flex flex-col items-center py-6 z-50">
        {/* Logo */}
        <button
          onClick={() => onNavigate('scanner')}
        >
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-emerald-400 rounded-xl flex items-center justify-center shadow-[0_0_24px_rgba(34,211,238,0.3)] group-hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all">
            <span className="text-black font-black text-xl italic">T6</span>
          </div>
        </button>

        {/* Main navigation icons */}
        <div className="flex-1 flex flex-col gap-4">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                    : 'text-slate-500 hover:bg-white/5 hover:text-cyan-400'
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}

          {/* Tools dropdown */}
          <ToolsDropdown currentPage={currentPage} onNavigate={onNavigate} />
        </div>

        {/* Bottom icons */}
        <div className="flex flex-col items-center gap-4">
          {/* System status */}
          <div 
            className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.6)]" 
            title="System Online"
          />

          {/* Theme selector */}
          <button
            onClick={() => onNavigate('settings')}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all text-slate-500 hover:bg-white/5 hover:text-cyan-400"
            title="Themes"
          >
            <Palette className="w-5 h-5" />
          </button>

          {/* Auth-dependent icons */}
          {loading ? (
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 animate-pulse" />
          ) : user ? (
            <>
              <AlertDropdown onNavigate={onNavigate} />
              <UserMenu onNavigate={onNavigate} />
            </>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all text-slate-500 hover:bg-cyan-500/15 hover:text-cyan-400"
              title="Sign In"
            >
              <LogIn className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Mission Control Sidebar */}
      {isMissionControl && <MissionControlSidebar />}

      {/* Main content area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {children}
      </main>

      {/* Login modal */}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      {/* Command Palette */}
      {isMissionControl && (
        <CommandPalette
          isOpen={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
