import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

type Theme = 'tactical' | 'terminal' | 'desktop' | 'mission-control';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const VALID_THEMES: Theme[] = ['tactical', 'terminal', 'desktop', 'mission-control'];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('thamos6-theme');
    return VALID_THEMES.includes(saved as Theme) ? (saved as Theme) : 'tactical';
  });

  const [userId, setUserId] = useState<string | null>(null);
  const hasSyncedRef = useRef(false);
  const pendingWriteRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (mounted) setUserId(currentUser?.id ?? null);
    }
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        const newId = session?.user?.id ?? null;
        setUserId(prev => {
          if (prev !== newId) {
            hasSyncedRef.current = false;
          }
          return newId;
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId || hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    async function syncFromSupabase() {
      if (pendingWriteRef.current) {
        await pendingWriteRef.current;
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('ui_theme')
        .eq('id', userId!)
        .maybeSingle();

      if (data?.ui_theme && VALID_THEMES.includes(data.ui_theme as Theme)) {
        setThemeState(data.ui_theme as Theme);
        localStorage.setItem('thamos6-theme', data.ui_theme);
      } else {
        const localTheme = localStorage.getItem('thamos6-theme') as Theme | null;
        if (localTheme && VALID_THEMES.includes(localTheme)) {
          supabase.from('profiles').update({ ui_theme: localTheme }).eq('id', userId!).then();
        }
      }
    }

    syncFromSupabase();
  }, [userId]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('thamos6-theme', newTheme);

    const writePromise = (async () => {
      const uid = userId ?? (await supabase.auth.getUser()).data.user?.id;
      if (uid) {
        await supabase.from('profiles').update({ ui_theme: newTheme }).eq('id', uid);
      }
    })();

    pendingWriteRef.current = writePromise;
    writePromise.finally(() => {
      if (pendingWriteRef.current === writePromise) {
        pendingWriteRef.current = null;
      }
    });
  };

  const toggleTheme = () => {
    const cycle: Theme[] = ['tactical', 'terminal', 'desktop'];
    const idx = cycle.indexOf(theme);
    const next = cycle[(idx + 1) % cycle.length];
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
