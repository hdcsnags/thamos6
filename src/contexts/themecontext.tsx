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
const STORAGE_KEY = 'thamos6-theme';

function readLocal(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return VALID_THEMES.includes(saved as Theme) ? (saved as Theme) : 'tactical';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readLocal);
  const didInitialSync = useRef(false);

  useEffect(() => {
    if (didInitialSync.current) return;
    didInitialSync.current = true;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('profiles')
          .select('ui_theme')
          .eq('id', user.id)
          .maybeSingle();

        if (data?.ui_theme && VALID_THEMES.includes(data.ui_theme as Theme)) {
          setThemeState(data.ui_theme as Theme);
          localStorage.setItem(STORAGE_KEY, data.ui_theme);
        } else {
          const local = readLocal();
          await supabase.from('profiles').update({ ui_theme: local }).eq('id', user.id);
        }
      } catch {
        // offline or not logged in -- localStorage value is already set
      }
    })();
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase.from('profiles').update({ ui_theme: newTheme }).eq('id', user.id);
          if (error) {
            console.warn('Failed to persist theme to database (check constraint?):', error.message);
          }
        }
      } catch (err) {
        console.error('Theme persistence error:', err);
      }
    })();
  };

  const toggleTheme = () => {
    const cycle: Theme[] = ['tactical', 'terminal', 'desktop', 'mission-control'];
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
