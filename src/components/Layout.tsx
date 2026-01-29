import { useState, useRef, useEffect } from 'react';
import {
  Shield, Search, Link as LinkIcon, Layers, History, Menu, X, AlertTriangle,
  Mail, FileSearch, Hash, Globe, ShieldOff, Code, FileText,
  LogIn, LogOut, Settings, User, ChevronDown, Newspaper, Bell,
  ExternalLink, Check, Trash2, MoreHorizontal, Puzzle, Terminal
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

// NAVIGATION CONFIGURATION
const primaryNavItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'scanner', label: 'CONSOLE', icon: Terminal },
  { id: 'news', label: 'INTEL_STREAM', icon: Newspaper },
];

const advancedToolsItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'ip', label: 'IP Lookup', icon: Search },
  { id: 'url', label: 'URL Scanner', icon: LinkIcon },
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

// --- DROPDOWN COMPONENTS (Styled for Stealth Mode) ---

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

  const isActive = advancedToolsItems.some(item => item.id === currentPage);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded transition-all text-xs font-mono uppercase tracking-wider ${
          isActive
            ? 'text-cyan-400 bg-cyan-950/30 border border-cyan-900/50'
            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
        }`}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        <span>Tools</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 bg-black border border-slate-800 rounded-lg shadow-2xl overflow-hidden z-50 max-h-96 overflow-y-auto">
          <div className="p-1">
            {advancedToolsItems.map(item => {
              const Icon = item.icon;
              const isItemActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-xs font-mono group ${
                    isItemActive
                      ? 'bg-cyan-950/30 text-cyan-400'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isItemActive ? 'text-cyan-400' : 'text-slate-600 group-hover:text-cyan-400'}`} />
                  <span>{item.label}</span>
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

  const isActive = extrasItems.some(item => item.id === currentPage);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded transition-all text-xs font-mono uppercase tracking-wider ${
          isActive
            ? 'text-cyan-400 bg-cyan-950/30 border border-cyan-900/50'
            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
        }`}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        <span>Extras</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-48 bg-black border border-slate-800 rounded-lg shadow-2xl overflow-hidden z-50">
          <div className="p-1">
            {extrasItems.map(item => {
              const Icon = item.icon;
              const isItemActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-xs font-mono group ${
                    isItemActive
                      ? 'bg-cyan-950/30 text-cyan-400'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isItemActive ? 'text-cyan-400' : 'text-slate-600 group-hover:text-cyan-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- HELPER MODALS (Retained Logic, Updated Style) ---

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
    try { await signInWithGoogle(); } catch { setLoading(false); }
  };

  const handleMicrosoft = async () => {
    setLoading(true);
    try { await signInWithMicrosoft(); } catch { setLoading(false); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-cyan-950/30 rounded-xl mb-4 border border-cyan-900/50">
            <Shield className="w-8 h-8 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Identify Yourself</h2>
          <p className="text-slate-400 text-sm">Access classified threat intelligence streams</p>
        </div>

        {!showEmailForm ? (
          <div className="space-y-3">
            <button onClick={handleGoogle} disabled={loading} className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-200 text-black font-medium rounded-lg transition-all disabled:opacity-50">
               <span className="font-bold">Google Access</span>
            </button>
            <button onClick={handleMicrosoft} disabled={loading} className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white font-medium rounded-lg transition-all disabled:opacity-50">
               <span className="font-bold">Microsoft ID</span>
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest"><span className="px-2 bg-[#0B1120] text-slate-600">Standard Auth</span></div>
            </div>

            <button onClick={() => setShowEmailForm(true)} className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-700 hover:bg-slate-800 text-white font-medium rounded-lg transition-all">
              <Mail className="w-5 h-5" /> Email Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 bg-black border border-slate-800 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors" placeholder="analyst@agency.com" required />
            </div>
            {!showResetPassword && (
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 bg-black border border-slate-800 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors" placeholder="••••••••" required minLength={6} />
              </div>
            )}
            {error && <div className="text-red-400 text-xs font-mono bg-red-950/20 border border-red-900/50 rounded p-3">{error}</div>}
            {success && <div className="text-emerald-400 text-xs font-mono bg-emerald-950/20 border border-emerald-900/50 rounded p-3">{success}</div>}
            
            <button type="submit" disabled={loading} className="w-full px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold uppercase tracking-wider rounded-lg transition-all disabled:opacity-50">
              {loading ? 'Authenticating...' : showResetPassword ? 'Send Link' : isSignUp ? 'Register' : 'Login'}
            </button>
            
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => { setShowEmailForm(false); setShowResetPassword(false); setError(''); }} className="text-slate-500 hover:text-white transition-all">Back</button>
              {!showResetPassword ? (
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowResetPassword(true); setError(''); }} className="text-slate-500 hover:text-cyan-400 transition-all">Forgot?</button>
                  <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-cyan-500 hover:text-cyan-400 transition-all">{isSignUp ? 'Login' : 'Sign Up'}</button>
                </div>
              ) : (
                <button type="button" onClick={() => { setShowResetPassword(false); setError(''); }} className="text-cyan-500 hover:text-cyan-400 transition-all">Back to Login</button>
              )}
            </div>
          </form>
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'amber'; 
      case 'low': return 'blue';
      default: return 'slate';
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setOpen(!open)} className="relative p-2 rounded hover:bg-white/5 transition-all group">
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-[16px] h-[16px] flex items-center justify-center text-[10px] font-bold text-black bg-cyan-400 rounded-full border border-black">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-black border border-slate-800 rounded-lg shadow-2xl overflow-hidden z-50">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider">System Alerts</h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                {unreadCount > 0 ? `${unreadCount} UNREAD` : 'ALL CLEAR'}
              </p>
            </div>
            {alerts.length > 0 && (
              <div className="flex gap-2">
                <button onClick={markAllAsRead} className="px-2 py-1 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all">Mark read</button>
                <button onClick={dismissAllAlerts} className="px-2 py-1 text-[10px] text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded transition-all">Clear</button>
              </div>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-xs">No active alerts</p>
                <button onClick={() => { onNavigate('news'); setOpen(false); }} className="mt-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded transition-all">
                  Open Stream
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {alerts.map(alert => (
                  <div key={alert.id} className={`p-4 hover:bg-white/5 transition-all ${!alert.is_read ? 'bg-slate-900/30' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded bg-${getSeverityColor(alert.severity)}-900/30 border border-${getSeverityColor(alert.severity)}-900/50`}>
                        <AlertTriangle className={`w-3.5 h-3.5 text-${getSeverityColor(alert.severity)}-500`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-${getSeverityColor(alert.severity)}-900/30 text-${getSeverityColor(alert.severity)}-500`}>
                            {alert.severity}
                          </span>
                          {!alert.is_read && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />}
                        </div>
                        <p className="text-sm text-slate-200 font-medium line-clamp-2">{alert.title}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{alert.description}</p>
                        <div className="flex items-center gap-3 mt-2 border-t border-slate-800/50 pt-2">
                          {alert.feed_item?.link && (
                            <a href={alert.feed_item.link} target="_blank" rel="noopener noreferrer" onClick={() => markAsRead(alert.id)} className="flex items-center gap-1 text-[10px] text-cyan-500 hover:text-cyan-400 uppercase tracking-wide">
                              <ExternalLink className="w-3 h-3" /> View
                            </a>
                          )}
                          <button onClick={() => dismissAlert(alert.id)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-400 uppercase tracking-wide ml-auto">
                            <Trash2 className="w-3 h-3" /> Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (data?.is_admin) setIsAdmin(true);
    };
    checkAdmin();
  }, [user]);

  if (!user) return null;
  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setOpen(!open)} className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center hover:border-cyan-500 transition-colors overflow-hidden">
        {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-black border border-slate-800 rounded-lg shadow-2xl overflow-hidden z-50">
          <div className="p-4 border-b border-slate-800 bg-slate-900/30">
            <p className="font-bold text-white truncate text-sm">{user.user_metadata?.full_name || 'Operative'}</p>
            <p className="text-xs text-slate-500 truncate font-mono">{user.email}</p>
          </div>
          <div className="p-1">
            {isAdmin && (
              <button onClick={() => { onNavigate('admin'); setOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded text-slate-400 hover:bg-slate-900 hover:text-cyan-400 transition-all text-xs font-mono group">
                <Shield className="w-3.5 h-3.5" /> Admin Panel
              </button>
            )}
            <button onClick={() => { onNavigate('settings'); setOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded text-slate-400 hover:bg-slate-900 hover:text-white transition-all text-xs font-mono">
              <Settings className="w-3.5 h-3.5" /> Configuration
            </button>
            <button onClick={() => { signOut(); setOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded text-slate-400 hover:bg-red-950/30 hover:text-red-400 transition-all text-xs font-mono">
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// MAIN LAYOUT
// ----------------------------------------------------------------------

export default function Layout({ currentPage, onNavigate, onScan, children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const { user, loading, authError, clearAuthError } = useAuth();

  const isImmersivePage = currentPage === 'scanner';

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
    <div className="min-h-screen bg-[#000000] text-slate-300 font-sans selection:bg-cyan-500/30 selection:text-white">
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isImmersivePage 
          ? 'bg-transparent border-b border-transparent' 
          : 'bg-black/80 backdrop-blur-md border-b border-slate-800'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* LEFT SIDE: Branding & Nav */}
            <div className="flex items-center gap-8">
              <button onClick={() => onNavigate('scanner')} className="flex items-center gap-3 hover:opacity-80 transition-opacity group">
                <div className="relative">
                   <div className="absolute inset-0 bg-cyan-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                   <Shield className="relative w-6 h-6 text-white" />
                </div>
                <div className="text-left hidden sm:block leading-tight">
                  <h1 className="text-lg font-bold text-white tracking-tight">THAMOS<span className="text-cyan-500">6</span></h1>
                  <p className="text-[10px] text-slate-600 font-mono tracking-wide">OPERATOR_CONSOLE</p>
                </div>
              </button>

              <div className="hidden lg:flex items-center gap-1">
                {primaryNavItems.map(item => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button key={item.id} onClick={() => onNavigate(item.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded transition-all text-xs font-mono uppercase tracking-wider ${isActive ? 'text-cyan-400 bg-cyan-950/30 border border-cyan-900/50' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label.replace('_', ' ')}</span>
                    </button>
                  );
                })}
                <div className="w-px h-4 bg-slate-800 mx-2" />
                <AdvancedToolsDropdown currentPage={currentPage} onNavigate={onNavigate} />
                <ExtrasDropdown currentPage={currentPage} onNavigate={onNavigate} />
              </div>
            </div>

            {/* RIGHT SIDE: Search & Actions */}
            <div className="flex items-center gap-4">
              {!isImmersivePage && (
                <form onSubmit={handleSearch} className="hidden md:block relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 group-focus-within:text-cyan-500 transition-colors" />
                  <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Quick query..." className="w-56 pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-900 focus:bg-black transition-all" />
                </form>
              )}
              
              <div className="h-4 w-px bg-slate-800 hidden md:block" />
              
              {/* Theme Toggle (Retained but styled dark) */}
              <ThemeToggle />

              {!loading && (
                user ? (
                  <div className="flex items-center gap-3">
                    <AlertDropdown onNavigate={onNavigate} />
                    <UserMenu onNavigate={onNavigate} />
                  </div>
                ) : (
                  <button onClick={() => setShowLogin(true)} className="flex items-center gap-2 px-4 py-1.5 bg-white text-black font-bold text-xs uppercase tracking-wide rounded hover:bg-cyan-400 hover:text-black transition-all">
                    <LogIn className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Connect</span>
                  </button>
                )
              )}
              <button className="lg:hidden p-2 text-slate-400 hover:text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-black border-t border-slate-800">
            <div className="px-4 py-3 space-y-4">
               {/* Mobile Menu Logic Retained from Original */}
               <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-2">Main</p>
                  <div className="space-y-1">
                    {primaryNavItems.map(item => (
                      <button key={item.id} onClick={() => { onNavigate(item.id); setMobileMenuOpen(false); }} className="flex items-center gap-3 w-full px-3 py-3 text-slate-400 hover:text-white hover:bg-slate-900 rounded font-mono text-xs uppercase">
                        <item.icon className="w-4 h-4"/>{item.label}
                      </button>
                    ))}
                  </div>
               </div>
               <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-2">Tools</p>
                  <div className="grid grid-cols-2 gap-1">
                    {advancedToolsItems.map(item => (
                       <button key={item.id} onClick={() => { onNavigate(item.id); setMobileMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-slate-500 hover:text-cyan-400 hover:bg-slate-900 rounded font-mono text-xs">
                         <item.icon className="w-3.5 h-3.5"/>{item.label}
                       </button>
                    ))}
                  </div>
               </div>
            </div>
          </div>
        )}
      </nav>

      <main className={`${isImmersivePage ? 'w-full min-h-screen pt-0' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pt-24'}`}>
        {children}
      </main>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      
      {authError && (
        <div className="fixed bottom-4 right-4 max-w-md bg-red-950/90 border border-red-500/30 text-white rounded-xl p-4 shadow-2xl z-50 backdrop-blur-md">
           <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-400">Authentication Failed</p>
              <p className="text-xs text-slate-400 mt-1">{authError}</p>
            </div>
            <button onClick={clearAuthError} className="text-slate-400 hover:text-white transition-all"><X className="w-5 h-5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
