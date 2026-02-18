import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeProvider as UIThemeProvider } from './contexts/themecontext';
import { AuthProvider } from './contexts/AuthContext';
import { AlertProvider } from './contexts/AlertContext';
import { GitHubProvider } from './contexts/GitHubContext';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <UIThemeProvider>
        <AuthProvider>
          <AlertProvider>
            <GitHubProvider>
              <App />
            </GitHubProvider>
          </AlertProvider>
        </AuthProvider>
      </UIThemeProvider>
    </ThemeProvider>
  </StrictMode>
);
