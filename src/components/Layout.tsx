import { useState, useRef, useEffect } from 'react';
import {
  Shield, Search, Link, Layers, History, Menu, X, AlertTriangle,
  Mail, FileSearch, Hash, Globe, ShieldOff, Code, FileText,
  LogIn, LogOut, Settings, User, ChevronDown, Newspaper, Bell,
  ExternalLink, Check, Trash2, MoreHorizontal, Puzzle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAlerts } from '../contexts/AlertContext';
import { supabase } from '../lib/supabase';
import { detectIOCType } from '../lib/iocDetection';
import ThemeToggle from './ThemeToggle';

export type Page = 'scanner' | 'intel' | 'news' | 'ip' | 'url' | 'bulk' | 'history' | 'email' | 'ioc' | 'hash' | 'domain' | 'defang' | 'decoder' | 'cases' | 'settings' | 'admin' | 'extension';

interface LayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onScan: (type: string, value: string) => void;
  children: React.ReactNode;
}

const primaryNavItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'scanner', label: 'Scanner', icon: Search },
  { id: 'news', label: 'Intel Stream', icon: Newspaper },
];

const advancedToolsItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'ip', label: 'IP Lookup', icon: Search },
  { id: 'url', label: 'URL Scanner', icon: Link },
  { id: 'hash', label: 'Hash Lookup', icon: Hash },
  { id: 'domain', label: 'Domain Intel', icon: Globe },
  { id: 'extension', label: 'Extension Scanner', icon: Puzzle },
  { id: 'email', label: 'Email Analyzer', icon: Mail },
  { id: 'ioc', label: 'IOC Extractor', icon: FileSearch },
  { id: 'bulk', label: 'Bulk Lookup', icon: Layers },
  { id: 'defang', label: 'Defang/Refang', icon: ShieldOff },
  { id: 'decoder', label: 'Decoder', icon: Code },
];

const extrasItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'cases', label: 'Case Notes', icon: FileText },
  { id: 'history', label: 'History', icon: History },
];

function AdvancedToolsDropdown({ currentPage, onNavigate }: { currentPage: Page; onNavigate: (page: Page) => void }) {
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

  const isActiveAdvancedTools = advancedToolsItems.some(item => item.id === currentPage);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm whitespace-nowrap ${
          isActiveAdvancedTools
            ? 'bg-cyan-500/20 text-cyan-400'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
        <span className="font-medium">Advanced Tools</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 max-h-96 overflow-y-auto">
          <div className="p-2">
            {advancedToolsItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ExtrasDropdown({ currentPage, onNavigate }: { currentPage: Page; onNavigate: (page: Page) => void }) {
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

  const isActiveExtras = extrasItems.some(item => item.id === currentPage);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm whitespace-nowrap ${
          isActiveExtras
            ? 'bg-cyan-500/20 text-cyan-400'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
        <span className="font-medium">Extras</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="p-2">
            {extrasItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
          <div className="inline-flex p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl mb-4">
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
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-xl transition-all disabled:opacity-50"
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
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white font-medium rounded-xl transition-all disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Continue with Microsoft
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300 dark:border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400">Or continue with email</span>
              </div>
            </div>

            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-medium rounded-xl transition-all"
            >
              <Mail className="w-5 h-5" />
              Continue with Email
            </button>
          </div>
        ) : (
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="your@email.com"
                required
              />
            </div>
            {!showResetPassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            )}
            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                {error}
              </div>
            )}
            {success && (
              <div className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                {success}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-xl transition-all disabled:opacity-50"
            >
              {loading ? 'Loading...' : showResetPassword ? 'Send Reset Link' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false);
                  setShowResetPassword(false);
                  setError('');
                  setSuccess('');
                }}
                className="text-slate-400 hover:text-white transition-all"
              >
                Back
              </button>
              {!showResetPassword ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetPassword(true);
                      setError('');
                      setSuccess('');
                    }}
                    className="text-slate-400 hover:text-cyan-400 transition-all"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setError('');
                      setSuccess('');
                    }}
                    className="text-cyan-400 hover:text-cyan-300 transition-all"
                  >
                    {isSignUp ? 'Sign in' : 'Sign up'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPassword(false);
                    setError('');
                    setSuccess('');
                  }}
                  className="text-cyan-400 hover:text-cyan-300 transition-all"
                >
                  Back to sign in
                </button>
              )}
            </div>
          </form>
        )}

        {!showEmailForm && (
          <p className="text-center text-slate-500 text-sm mt-6">
            Sign in to manage your API keys and track usage
          </p>
        )}
      </div>
    </div>
  );
}

function AlertDropdown({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { user } = useAuth();
  const { alerts, unreadCount, markAsRead, markAllAsRead, dismissAlert, dismissAllAlerts } = useAlerts();
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
        className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Alerts</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {unreadCount > 0 ? `${unreadCount} unread` : 'No new alerts'}
              </p>
            </div>
            {alerts.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={markAllAsRead}
                  className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-all"
                >
                  Mark all read
                </button>
                <button
                  onClick={dismissAllAlerts}
                  className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-400 text-sm">No alerts yet</p>
                <p className="text-slate-500 dark:text-slate-500 text-xs mt-1">
                  Add items to your watchlist to receive alerts when they appear in the news feed
                </p>
                <button
                  onClick={() => { onNavigate('news'); setOpen(false); }}
                  className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium rounded-lg transition-all"
                >
                  Go to News Feed
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all ${!alert.is_read ? 'bg-slate-50 dark:bg-slate-800/30' : ''}`}
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
                        <p className="text-sm text-slate-900 dark:text-white font-medium line-clamp-2">{alert.title}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{alert.description}</p>
                        {alert.watchlist_entry && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
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
                              className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-all"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Read article
                            </a>
                          )}
                          {!alert.is_read && (
                            <button
                              onClick={() => markAsRead(alert.id)}
                              className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                            >
                              <Check className="w-3 h-3" />
                              Mark read
                            </button>
                          )}
                          <button
                            onClick={() => dismissAlert(alert.id)}
                            className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
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
            <div className="p-3 border-t border-slate-700">
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
  const email = user.email;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <User className="w-4 h-4 text-cyan-400" />
          </div>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <p className="font-medium text-slate-900 dark:text-white truncate">{name}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{email}</p>
          </div>
          <div className="p-2">
            {isAdmin && (
              <button
                onClick={() => { onNavigate('admin'); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all"
              >
                <Shield className="w-4 h-4" />
                <span>Admin Panel</span>
              </button>
            )}
            <button
              onClick={() => { onNavigate('settings'); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all"
            >
              <Settings className="w-4 h-4" />
              <span>Settings & API Keys</span>
            </button>
            <button
              onClick={() => { signOut(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ currentPage, onNavigate, onScan, children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const { user, loading, authError, clearAuthError } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;

    const detection = detectIOCType(searchInput.trim());
    if (detection.type === 'unknown') return;

    onNavigate('scanner');
    onScan(detection.type, detection.normalizedValue);
    setSearchInput('');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <nav className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
        {/* Top Search Bar - Full Width */}
        <div className="bg-slate-900 dark:bg-slate-950 border-b border-slate-700 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <form onSubmit={handleSearch} className="py-2">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search IP, URL, domain, hash, or Chrome extension..."
                  className="w-full pl-12 pr-4 py-2.5 bg-slate-800 dark:bg-slate-900 border border-slate-700 dark:border-slate-800 rounded-lg text-sm text-slate-200 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                />
              </div>
            </form>
          </div>
        </div>

        {/* Main Bar - Branding, Navigation, and User */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => onNavigate('scanner')}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">Thamos6</h1>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-none">What Would Will Do?</p>
                  </div>
                </button>

                {/* Navigation Items - Desktop */}
                <div className="hidden lg:flex items-center gap-1">
                  {primaryNavItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm whitespace-nowrap ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                  <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-2" />
                  <AdvancedToolsDropdown currentPage={currentPage} onNavigate={onNavigate} />
                  <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-2" />
                  <ExtrasDropdown currentPage={currentPage} onNavigate={onNavigate} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
                {!loading && (
                  user ? (
                    <>
                      <AlertDropdown onNavigate={onNavigate} />
                      <UserMenu onNavigate={onNavigate} />
                    </>
                  ) : (
                    <button
                      onClick={() => setShowLogin(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg transition-all"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Sign In</span>
                    </button>
                  )
                )}
                <button
                  className="lg:hidden p-2 text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-slate-900 max-h-[calc(100vh-4rem)] overflow-auto">
            <div className="px-4 py-3 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                  Primary
                </p>
                <div className="space-y-1">
                  {primaryNavItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                  Advanced Tools
                </p>
                <div className="space-y-1">
                  {advancedToolsItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                  Extras
                </p>
                <div className="space-y-1">
                  {extrasItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {!user && (
        <div className="bg-amber-500/10 border-b border-amber-500/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <p className="text-xs sm:text-sm">
                <span className="font-semibold">Sign in</span> to add your own API keys and unlock full threat intel capabilities.
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      {authError && (
        <div className="fixed bottom-4 right-4 max-w-md bg-red-500/10 border border-red-500/30 rounded-xl p-4 shadow-2xl z-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-400">Sign in failed</p>
              <p className="text-sm text-slate-300 mt-1">{authError}</p>
              <p className="text-xs text-slate-400 mt-2">
                Please check that your OAuth provider is configured correctly in the Supabase dashboard.
              </p>
            </div>
            <button
              onClick={clearAuthError}
              className="text-slate-400 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
