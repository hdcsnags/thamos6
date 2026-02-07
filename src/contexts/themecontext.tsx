import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

type Theme = 'tactical' | 'terminal';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('thamos6-theme');
    return (saved === 'terminal' ? 'terminal' : 'tactical') as Theme;
  });

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
    }
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function syncFromSupabase() {
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('ui_theme')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.ui_theme && (data.ui_theme === 'terminal' || data.ui_theme === 'tactical')) {
        setThemeState(data.ui_theme as Theme);
        localStorage.setItem('thamos6-theme', data.ui_theme);
      }
    }

    syncFromSupabase();
  }, [user]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);

    localStorage.setItem('thamos6-theme', newTheme);

    if (user) {
      supabase
        .from('profiles')
        .update({ ui_theme: newTheme })
        .eq('id', user.id)
        .then();
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'tactical' ? 'terminal' : 'tactical';
    setTheme(newTheme);
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
