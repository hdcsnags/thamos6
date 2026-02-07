import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export interface ThemeConfig {
  primary: string;
  background: string;
  surface: string;
  text: string;
}

export interface Theme {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  is_system: boolean;
  config: ThemeConfig;
}

interface ThemeContextType {
  currentTheme: string;
  themes: Theme[];
  setTheme: (themeName: string) => Promise<void>;
  refreshThemes: () => Promise<void>;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<string>('dark');
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  const loadThemes = async () => {
    try {
      const { data } = await supabase
        .from('themes')
        .select('*')
        .eq('is_active', true)
        .order('is_system', { ascending: false })
        .order('display_name');

      if (data) {
        setThemes(data);
      }
    } catch (error) {
      console.error('Failed to load themes:', error);
    }
  };

  const loadUserTheme = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('theme')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.theme) {
          setCurrentTheme(profile.theme);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to load user theme:', error);
    }

    const stored = localStorage.getItem('theme');
    if (stored) {
      setCurrentTheme(stored);
    }
  };

  const applyTheme = (themeName: string) => {
    const theme = themes.find(t => t.name === themeName);
    if (!theme) return;

    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');
    root.classList.add(themeName === 'light' ? 'light' : 'dark');

    root.style.setProperty('--color-primary', theme.config.primary);
    root.style.setProperty('--color-background', theme.config.background);
    root.style.setProperty('--color-surface', theme.config.surface);
    root.style.setProperty('--color-text', theme.config.text);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadThemes();
      await loadUserTheme();
      setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUserTheme();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (themes.length > 0) {
      applyTheme(currentTheme);
      localStorage.setItem('theme', currentTheme);
    }
  }, [currentTheme, themes]);

  const setTheme = async (themeName: string) => {
    setCurrentTheme(themeName);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ theme: themeName })
          .eq('id', user.id);
      }
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  const refreshThemes = async () => {
    await loadThemes();
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, themes, setTheme, refreshThemes, loading }}>
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
