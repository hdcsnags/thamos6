import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ThamosIcon } from '../../design-system/icons';
import { palette, typography } from '../../design-system/tokens';

type EmailMode = 'signin' | 'signup' | 'reset';

export function SignInScreen({ loading = false }: { loading?: boolean }) {
  const {
    signInWithMicrosoft,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    resetPassword,
    authError,
    clearAuthError,
  } = useAuth();
  const [emailMode, setEmailMode] = useState<EmailMode | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => clearAuthError(), [clearAuthError]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || (emailMode !== 'reset' && !password)) return;

    if (emailMode === 'signup') {
      await run('email', async () => {
        await signUpWithPassword(email.trim(), password);
        setMessage('Check your inbox to confirm your account, then return here to sign in.');
      });
      return;
    }
    if (emailMode === 'reset') {
      await run('email', async () => {
        await resetPassword(email.trim());
        setMessage('Password reset instructions have been sent.');
      });
      return;
    }
    await run('email', () => signInWithPassword(email.trim(), password));
  };

  const displayError = error || authError;

  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: palette.void, color: palette.textPrimary, fontFamily: typography.ui }}>
      <div
        className="absolute inset-0 scale-[1.02]"
        style={{ backgroundImage: 'url(/wallpapers/thamos-nexus.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(2,5,10,0.98) 0%, rgba(2,5,10,0.82) 43%, rgba(2,5,10,0.2) 78%, rgba(2,5,10,0.42) 100%)' }} />
      <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 64% 48%, rgba(51,153,216,0.17), transparent 42%)' }} />

      <div className="relative z-10 flex min-h-screen flex-col px-6 py-6 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(145deg, ${palette.accent}, ${palette.blue})`, boxShadow: `0 8px 28px ${palette.accent}30` }}>
              <ThamosIcon size={22} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.08em]">THAMOS</div>
              <div className="text-[10px] tracking-[0.18em]" style={{ color: palette.textTertiary }}>THREAT INTELLIGENCE OS</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs sm:flex" style={{ color: palette.textTertiary }}>
            <ShieldCheck className="h-4 w-4" style={{ color: palette.green }} />
            Secure workspace sign-in
          </div>
        </header>

        <div className="flex flex-1 items-center py-10">
          <section className="w-full max-w-md">
            <div className="mb-8">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: palette.cyan, background: `${palette.cyan}12`, border: `1px solid ${palette.cyan}35` }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: palette.cyan }} /> Operator access
              </div>
              <h1 className="max-w-sm text-4xl font-semibold leading-[1.06] tracking-[-0.035em] sm:text-5xl">Intelligence begins with context.</h1>
              <p className="mt-4 max-w-sm text-sm leading-6" style={{ color: palette.textSecondary }}>
                Enter the ThamOS workspace to investigate indicators, correlate infrastructure, and move from signal to evidence.
              </p>
            </div>

            <div className="rounded-2xl p-5 sm:p-6" style={{ background: 'rgba(8,12,17,0.82)', border: `1px solid ${palette.borderDefault}`, boxShadow: '0 24px 80px rgba(0,0,0,0.48)', backdropFilter: 'blur(22px)' }}>
              {loading ? (
                <div className="flex min-h-[210px] flex-col items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: palette.cyan }} />
                  <span className="text-xs" style={{ color: palette.textTertiary }}>Restoring your workspace…</span>
                </div>
              ) : emailMode ? (
                <form onSubmit={handleEmail}>
                  <button type="button" onClick={() => { setEmailMode(null); setError(''); setMessage(''); }} className="mb-5 flex items-center gap-2 text-xs" style={{ color: palette.textTertiary }}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign-in options
                  </button>
                  <div className="mb-5">
                    <h2 className="text-lg font-semibold">{emailMode === 'signup' ? 'Create an account' : emailMode === 'reset' ? 'Reset your password' : 'Sign in with email'}</h2>
                    <p className="mt-1 text-xs" style={{ color: palette.textTertiary }}>{emailMode === 'reset' ? 'We’ll send a secure recovery link.' : 'Use the credentials associated with your workspace.'}</p>
                  </div>
                  <label className="mb-1.5 block text-[11px] font-medium" style={{ color: palette.textSecondary }}>Email address</label>
                  <div className="mb-3 flex items-center gap-2 rounded-xl px-3" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
                    <Mail className="h-4 w-4" style={{ color: palette.textTertiary }} />
                    <input autoFocus type="email" value={email} onChange={event => setEmail(event.target.value)} className="h-11 flex-1 bg-transparent text-sm" placeholder="name@organization.ca" />
                  </div>
                  {emailMode !== 'reset' && (
                    <>
                      <label className="mb-1.5 block text-[11px] font-medium" style={{ color: palette.textSecondary }}>Password</label>
                      <div className="mb-3 flex items-center gap-2 rounded-xl px-3" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
                        <LockKeyhole className="h-4 w-4" style={{ color: palette.textTertiary }} />
                        <input type="password" value={password} onChange={event => setPassword(event.target.value)} className="h-11 flex-1 bg-transparent text-sm" placeholder="Password" minLength={6} />
                      </div>
                    </>
                  )}
                  {displayError && <Notice tone="error">{displayError}</Notice>}
                  {message && <Notice tone="success">{message}</Notice>}
                  <button disabled={busy === 'email'} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${palette.accent}, ${palette.blue})` }}>
                    {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{emailMode === 'signup' ? 'Create account' : emailMode === 'reset' ? 'Send reset link' : 'Sign in'} <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <div className="mt-4 flex items-center justify-between text-[11px]">
                    {emailMode === 'signin' && <button type="button" onClick={() => setEmailMode('reset')} style={{ color: palette.textTertiary }}>Forgot password?</button>}
                    {emailMode === 'signin' && <button type="button" onClick={() => setEmailMode('signup')} style={{ color: palette.cyan }}>Create account</button>}
                    {emailMode !== 'signin' && <button type="button" onClick={() => setEmailMode('signin')} style={{ color: palette.cyan }}>Return to sign in</button>}
                  </div>
                </form>
              ) : (
                <div>
                  <div className="mb-5">
                    <h2 className="text-lg font-semibold">Sign in to your workspace</h2>
                    <p className="mt-1 text-xs" style={{ color: palette.textTertiary }}>Microsoft is recommended for organization accounts.</p>
                  </div>
                  {displayError && <Notice tone="error">{displayError}</Notice>}
                  <button onClick={() => run('microsoft', signInWithMicrosoft)} disabled={Boolean(busy)} className="flex h-12 w-full items-center justify-between rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${palette.accent}, ${palette.blue})`, boxShadow: `0 10px 26px ${palette.accent}22` }}>
                    <span className="flex items-center gap-3"><MicrosoftMark /> Continue with Microsoft</span>
                    {busy === 'microsoft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  </button>
                  <div className="my-4 flex items-center gap-3"><span className="h-px flex-1" style={{ background: palette.borderSubtle }} /><span className="text-[10px] uppercase tracking-wider" style={{ color: palette.textDisabled }}>or</span><span className="h-px flex-1" style={{ background: palette.borderSubtle }} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setEmailMode('signin')} className="flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-medium" style={{ background: palette.elevated, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}><KeyRound className="h-4 w-4" /> Email</button>
                    <button onClick={() => run('google', signInWithGoogle)} disabled={Boolean(busy)} className="flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-medium disabled:opacity-60" style={{ background: palette.elevated, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}>{busy === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />} Google</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between text-[10px] tracking-wide" style={{ color: palette.textDisabled }}>
          <span>THAMOS · T6</span><span>AUTHORIZED ACCESS ONLY</span>
        </footer>
      </div>
    </main>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const color = tone === 'error' ? palette.rose : palette.green;
  return <p className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ color, background: `${color}12`, border: `1px solid ${color}32` }}>{children}</p>;
}

function MicrosoftMark() {
  return <span className="grid h-4 w-4 grid-cols-2 gap-[2px]">{['#f35325', '#81bc06', '#05a6f0', '#ffba08'].map(color => <span key={color} style={{ background: color }} />)}</span>;
}

function GoogleMark() {
  return <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold" style={{ color: '#4285f4' }}>G</span>;
}
