import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/themecontext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
      ) : (
        <Sun className="w-5 h-5 text-slate-600 dark:text-slate-400" />
      )}
    </button>
  );
}
