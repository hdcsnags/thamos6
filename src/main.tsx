import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeProvider as UIThemeProvider } from './contexts/themecontext';
import { AuthProvider } from './contexts/AuthContext';
import { AlertProvider } from './contexts/AlertContext';
import { GitHubProvider } from './contexts/GitHubContext';
import App from './App.tsx';
import './index.css';
import { supabaseGitHub } from './lib/supabase';

const hash = window.location.hash;
const isGitHubOAuthCallback =
  hash.includes('access_token') &&
  hash.includes('provider_token') &&
  window.opener !== null;

if (isGitHubOAuthCallback) {
  supabaseGitHub.auth.getSession().then(({ data: { session } }) => {
    if (session?.provider_token) {
      window.opener?.postMessage(
        { type: 'GITHUB_TOKEN', token: session.provider_token },
        window.location.origin
      );
    }
    window.close();
  });
} else {
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
}
