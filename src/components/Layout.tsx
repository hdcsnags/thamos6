import { useState, useRef, useEffect } from 'react';
import {
  Shield, Search, Link, Layers, History, Menu, X, AlertTriangle,
  Mail, FileSearch, Hash, Globe, ShieldOff, Code, Bug, FileText,
  LogIn, LogOut, Settings, User, ChevronDown
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type Page = 'ip' | 'url' | 'bulk' | 'history' | 'email' | 'ioc' | 'hash' | 'domain' | 'defang' | 'decoder' | 'cve' | 'cases' | 'settings';

interface LayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

interface NavCategory {
  label: string;
  items: { id: Page; label: string; icon: React.ElementType }[];
}

const navCategories: NavCategory[] = [
  {
    label: 'Threat Intel',
    items: [
      { id: 'ip', label: 'IP Lookup', icon: Search },
      { id: 'url', label: 'URL Scanner', icon: Link },
      { id: 'hash', label: 'Hash Lookup', icon: Hash },
      { id: 'domain', label: 'Domain Intel', icon: Globe },
      { id: 'bulk', label: 'Bulk Lookup', icon: Layers },
    ],
  },
  {
    label: 'Analysis Tools',
    items: [
      { id: 'email', label: 'Email Analyzer', icon: Mail },
      { id: 'ioc', label: 'IOC Extractor', icon: FileSearch },
      { id: 'defang', label: 'Defang/Refang', icon: ShieldOff },
      { id: 'decoder', label: 'Decoder', icon: Code },
      { id: 'cve', label: 'CVE Lookup', icon: Bug },
    ],
  },
  {
    label: 'Investigation',
    items: [
      { id: 'cases', label: 'Case Notes', icon: FileText },
      { id: 'history', label: 'History', icon: History },
    ],
  },
];

function LoginModal({ onClose }: { onClose: () => void }) {
  const { signInWithGoogle, signInWithMicrosoft } = useAuth();
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Sign in to Thamos6</h2>
          <p className="text-slate-400">Access your personal API keys and usage stats</p>
        </div>

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
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          Sign in to manage your API keys and track usage
        </p>
      </div>
    </div>
  );
}

function UserMenu({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { user, signOut } = useAuth();
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

  const avatarUrl = user.user_metadata?.avatar_url;
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const email = user.email;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-all"
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
        <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="p-4 border-b border-slate-700">
            <p className="font-medium text-white truncate">{name}</p>
            <p className="text-sm text-slate-400 truncate">{email}</p>
          </div>
          <div className="p-2">
            <button
              onClick={() => { onNavigate('settings'); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
            >
              <Settings className="w-4 h-4" />
              <span>Settings & API Keys</span>
            </button>
            <button
              onClick={() => { signOut(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-red-400 transition-all"
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

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Thamos6</h1>
                <p className="text-xs text-slate-400">SOC Toolkit</p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-1">
              {navCategories.map(category => (
                <div key={category.label} className="flex items-center">
                  <div className="h-4 w-px bg-slate-700 mx-2" />
                  {category.items.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-sm ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title={item.label}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="hidden xl:inline font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {!loading && (
                user ? (
                  <UserMenu onNavigate={onNavigate} />
                ) : (
                  <button
                    onClick={() => setShowLogin(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg transition-all"
                  >
                    <LogIn className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign in</span>
                  </button>
                )
              )}
              <button
                className="lg:hidden p-2 text-slate-400 hover:text-white"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-slate-900 max-h-[calc(100vh-4rem)] overflow-auto">
            <div className="px-4 py-3 space-y-4">
              {navCategories.map(category => (
                <div key={category.label}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                    {category.label}
                  </p>
                  <div className="space-y-1">
                    {category.items.map(item => {
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
              ))}
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
