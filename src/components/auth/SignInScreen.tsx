import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ThamosIcon } from '../../design-system/icons';
import { palette, typography } from '../../design-system/tokens';

type EmailMode = 'signin' | 'reset';

export function SignInScreen({ loading = false }: { loading?: boolean }) {
  const {
    signInWithMicrosoft,
    signInWithGoogle,
    signInWithPassword,
    resetPassword,
    authError,
    clearAuthError,
  } = useAuth();
  const [emailMode, setEmailMode] = useState<EmailMode>('signin');
  const [showProviders, setShowProviders] = useState(false);
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10" style={{ background: palette.void, color: palette.textPrimary, fontFamily: typography.ui }}>
      <div
        className="absolute inset-0 scale-[1.02]"
        style={{ backgroundImage: 'url(/wallpapers/thamos-nexus.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
      <div className="absolute inset-0" style={{ background: 'rgba(2,5,10,0.42)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 10%, rgba(2,5,10,0.55) 100%)' }} />

      <section className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl p-6 sm:p-7" style={{ background: 'rgba(8,10,12,0.9)', border: `1px solid ${palette.borderDefault}`, boxShadow: '0 26px 80px rgba(0,0,0,0.55)', backdropFilter: 'blur(18px)' }}>
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: `linear-gradient(145deg, ${palette.accent}, ${palette.blue})`, boxShadow: `0 10px 30px ${palette.accent}28` }}>
              <ThamosIcon size={28} />
            </div>
            <h1 className="text-lg font-semibold tracking-[0.05em]">THAMOS</h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em]" style={{ color: palette.textTertiary }}>T6 workstation</p>
          </div>

          {loading ? (
            <div className="flex min-h-[190px] flex-col items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: palette.cyan }} />
              <span className="text-xs" style={{ color: palette.textTertiary }}>Starting session…</span>
            </div>
          ) : emailMode === 'reset' ? (
            <form onSubmit={handleEmail}>
              <button type="button" onClick={() => { setEmailMode('signin'); setError(''); setMessage(''); }} className="mb-5 flex items-center gap-2 text-xs" style={{ color: palette.textTertiary }}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back to login
              </button>
              <label className="mb-1.5 block text-xs" style={{ color: palette.textSecondary }}>Email</label>
              <div className="mb-3 flex items-center gap-2 rounded-lg px-3" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
                <Mail className="h-4 w-4" style={{ color: palette.textTertiary }} />
                <input autoFocus required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="h-11 flex-1 bg-transparent text-sm outline-none" placeholder="name@organization.ca" />
              </div>
              {displayError && <Notice tone="error">{displayError}</Notice>}
              {message && <Notice tone="success">{message}</Notice>}
              <button disabled={busy === 'email'} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: palette.accent }}>
                {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send reset link <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleEmail}>
                <label className="mb-1.5 block text-xs" style={{ color: palette.textSecondary }}>Email</label>
                <div className="mb-3 flex items-center gap-2 rounded-lg px-3" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
                  <Mail className="h-4 w-4" style={{ color: palette.textTertiary }} />
                  <input autoFocus required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="h-11 flex-1 bg-transparent text-sm outline-none" placeholder="name@organization.ca" />
                </div>
                <label className="mb-1.5 block text-xs" style={{ color: palette.textSecondary }}>Password</label>
                <div className="mb-3 flex items-center gap-2 rounded-lg px-3" style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}>
                  <LockKeyhole className="h-4 w-4" style={{ color: palette.textTertiary }} />
                  <input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="h-11 flex-1 bg-transparent text-sm outline-none" placeholder="Password" minLength={6} />
                </div>
                {displayError && <Notice tone="error">{displayError}</Notice>}
                <button disabled={busy === 'email'} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: palette.accent }}>
                  {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Log in <ArrowRight className="h-4 w-4" /></>}
                </button>
                <button type="button" onClick={() => { setEmailMode('reset'); setError(''); setMessage(''); }} className="mx-auto mt-3 block text-[11px]" style={{ color: palette.textTertiary }}>Forgot password?</button>
              </form>

              <button type="button" onClick={() => setShowProviders(current => !current)} className="mt-5 flex w-full items-center justify-center gap-1.5 border-t pt-4 text-[11px]" style={{ color: palette.textTertiary, borderColor: palette.borderSubtle }} aria-expanded={showProviders}>
                Other sign-in options
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showProviders ? 'rotate-180' : ''}`} />
              </button>
              {showProviders && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => run('microsoft', signInWithMicrosoft)} disabled={Boolean(busy)} className="flex h-10 items-center justify-center gap-2 rounded-lg text-xs disabled:opacity-60" style={{ background: palette.elevated, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}>
                    {busy === 'microsoft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MicrosoftMark />} Microsoft
                  </button>
                  <button type="button" onClick={() => run('google', signInWithGoogle)} disabled={Boolean(busy)} className="flex h-10 items-center justify-center gap-2 rounded-lg text-xs disabled:opacity-60" style={{ background: palette.elevated, border: `1px solid ${palette.borderDefault}`, color: palette.textSecondary }}>
                    {busy === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />} Google
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
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
