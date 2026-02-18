import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, supabaseGitHub } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  providerToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseHashError(): { error: string; description: string } | null {
  const hash = window.location.hash;
  if (!hash || !hash.includes('error=')) return null;

  const params = new URLSearchParams(hash.substring(1));
  const error = params.get('error');
  const description = params.get('error_description');

  if (error) {
    return {
      error,
      description: description ? decodeURIComponent(description) : 'Authentication failed',
    };
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [providerToken, setProviderToken] = useState<string | null>(null);

  useEffect(() => {
    const hashError = parseHashError();
    if (hashError) {
      setAuthError(hashError.description);
      window.history.replaceState(null, '', window.location.pathname);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'SIGNED_OUT') {
        setProviderToken(null);
      }
    });

    const { data: { subscription: ghSubscription } } = supabaseGitHub.auth.onAuthStateChange((event, ghSession) => {
      if (event === 'SIGNED_IN' && ghSession?.provider_token) {
        setProviderToken(ghSession.provider_token);
        supabaseGitHub.auth.signOut();
      }
    });

    return () => {
      subscription.unsubscribe();
      ghSubscription.unsubscribe();
    };
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: window.location.origin,
        scopes: 'email profile openid',
      },
    });
    if (error) throw error;
  }, []);

  const signInWithGitHub = useCallback(async () => {
    const { data, error } = await supabaseGitHub.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
        scopes: 'repo read:user',
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset=true`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      authError,
      clearAuthError,
      signInWithGoogle,
      signInWithMicrosoft,
      signInWithGitHub,
      signInWithPassword,
      signUpWithPassword,
      resetPassword,
      updatePassword,
      signOut,
      providerToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
