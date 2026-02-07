import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'tactical' | 'terminal';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Load from localStorage or default to tactical
    const saved = localStorage.getItem('thamos6-theme');
    return (saved === 'terminal' ? 'terminal' : 'tactical') as Theme;
  });

  useEffect(() => {
    // Persist theme choice
    localStorage.setItem('thamos6-theme', theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prev => prev === 'tactical' ? 'terminal' : 'tactical');
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
