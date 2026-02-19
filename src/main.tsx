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
const isOAuthCallback = hash.includes('access_token') && hash.includes('provider_token');
const hasOpener = window.opener !== null;

if (isOAuthCallback && hasOpener) {
  const params = new URLSearchParams(hash.substring(1));
  const providerToken = params.get('provider_token');

  if (providerToken) {
    window.opener.postMessage(
      { type: 'GITHUB_TOKEN', token: providerToken },
      window.location.origin
    );
  }
  window.close();
} else if (isOAuthCallback && !hasOpener) {
  const fallbackParams = new URLSearchParams(hash.substring(1));
  const fallbackToken = fallbackParams.get('provider_token');
  if (fallbackToken) {
    sessionStorage.setItem('gh-provider-token', fallbackToken);
    sessionStorage.setItem('gh-provider-token-ts', Date.now().toString());
  }
  window.location.replace(window.location.origin);
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
