import { useState } from 'react';
import { ShieldOff, Shield, Copy, Check, ArrowRightLeft, Trash2 } from 'lucide-react';
import { useTheme } from '../contexts/themecontext';
import { palette, typography } from '../design-system/tokens';

const cardStyle = {
  background: palette.base,
  border: `1px solid ${palette.borderDefault}`,
  borderRadius: '9px',
} as const;

const fieldStyle = {
  background: palette.void,
  border: `1px solid ${palette.borderDefault}`,
  color: palette.textPrimary,
  fontFamily: typography.mono,
} as const;

const secondaryButtonStyle = {
  background: palette.float,
  border: `1px solid ${palette.borderDefault}`,
  color: palette.textSecondary,
} as const;

function segmentStyle(active: boolean) {
  return {
    background: active ? palette.surface : 'transparent',
    color: active ? palette.textPrimary : palette.textSecondary,
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.35)' : 'none',
  } as const;
}

export default function DefangTool() {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<'defang' | 'refang'>('defang');
  const [copied, setCopied] = useState(false);

  const defang = (text: string): string => {
    return text
      .replace(/\./g, '[.]')
      .replace(/@/g, '[@]')
      .replace(/https?/gi, match => match.replace(/t/gi, 'x'))
      .replace(/:\/\//g, '[://]');
  };

  const refang = (text: string): string => {
    return text
      .replace(/\[\.\]/g, '.')
      .replace(/\[@\]/g, '@')
      .replace(/hxxps?/gi, match => match.replace(/x/gi, 't'))
      .replace(/\[:\/\/\]/g, '://')
      .replace(/\[:\]/g, ':');
  };

  const handleConvert = () => {
    if (!input.trim()) return;
    const result = mode === 'defang' ? defang(input) : refang(input);
    setOutput(result);
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwap = () => {
    setMode(mode === 'defang' ? 'refang' : 'defang');
    setInput(output);
    setOutput('');
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
  };

  const examples = mode === 'defang'
    ? [
        { input: 'https://malware.com/payload.exe', output: 'hxxps[://]malware[.]com/payload[.]exe' },
        { input: '192.168.1.1', output: '192[.]168[.]1[.]1' },
        { input: 'attacker@evil.com', output: 'attacker[@]evil[.]com' },
      ]
    : [
        { input: 'hxxps[://]malware[.]com/payload[.]exe', output: 'https://malware.com/payload.exe' },
        { input: '192[.]168[.]1[.]1', output: '192.168.1.1' },
        { input: 'attacker[@]evil[.]com', output: 'attacker@evil.com' },
      ];

  const modeTabs: { id: 'defang' | 'refang'; label: string; icon: typeof Shield }[] = [
    { id: 'defang', label: 'Defang', icon: ShieldOff },
    { id: 'refang', label: 'Refang', icon: Shield },
  ];

  return (
    <div
      className={`h-full flex flex-col ${theme === 'desktop' ? '' : 'p-8 space-y-8'}`}
      style={{ background: palette.elevated, color: palette.textPrimary, fontFamily: typography.ui }}
    >
      <style>{`
        .defang-field::placeholder { color: ${palette.textDisabled}; }
        .defang-field:focus { outline: none; border-color: ${palette.borderActive} !important; }
        .defang-btn { transition: background-color 150ms, color 150ms; }
        .defang-btn:hover:not(:disabled) { background: ${palette.surface} !important; color: ${palette.textPrimary} !important; }
        .defang-tab { transition: color 150ms; }
        .defang-tab:hover { color: ${palette.textPrimary} !important; }
        .defang-seg { transition: color 150ms, background-color 150ms; }
        .defang-seg:hover { color: ${palette.textPrimary} !important; }
      `}</style>

      {theme === 'desktop' ? (
        <div
          className="sticky top-0 z-20 px-4"
          style={{ background: palette.base, borderBottom: `1px solid ${palette.borderSubtle}` }}
        >
          <div className="flex items-center gap-1">
            {modeTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMode(tab.id)}
                  className="defang-tab flex items-center gap-2 px-3 py-2.5 text-xs font-medium"
                  style={{
                    color: isActive ? palette.textPrimary : palette.textTertiary,
                    borderBottom: `2px solid ${isActive ? palette.accent : 'transparent'}`,
                    marginBottom: '-1px',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: isActive ? palette.accent : palette.textTertiary }} />
                  {tab.label} mode
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center max-w-2xl mx-auto">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4"
            style={{ background: palette.float, border: `1px solid ${palette.borderDefault}` }}
          >
            {mode === 'defang' ? (
              <ShieldOff className="w-7 h-7" style={{ color: palette.accent }} />
            ) : (
              <Shield className="w-7 h-7" style={{ color: palette.accent }} />
            )}
          </div>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: palette.textPrimary }}>Defang / Refang Tool</h1>
          <p className="text-sm" style={{ color: palette.textSecondary }}>
            Safely share malicious IOCs by defanging URLs, IPs, and emails.
            Or refang them back to their original form for analysis.
          </p>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto ${theme === 'desktop' ? 'p-6' : ''}`}>
        <div className="max-w-4xl mx-auto">
          {theme !== 'desktop' && (
            <div className="flex items-center justify-center gap-3 mb-6">
              <div
                role="tablist"
                aria-label="Conversion direction"
                className="inline-flex items-center gap-0.5 p-0.5 rounded-md"
                style={{ background: palette.float, border: `1px solid ${palette.borderDefault}` }}
              >
                {modeTabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={mode === tab.id}
                      onClick={() => setMode(tab.id)}
                      className="defang-seg px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2"
                      style={segmentStyle(mode === tab.id)}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleSwap}
                className="defang-btn p-2 rounded-md"
                style={secondaryButtonStyle}
                title="Swap mode and content"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5" style={cardStyle}>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium" style={{ color: palette.textSecondary }}>
                  {mode === 'defang' ? 'Original IOCs' : 'Defanged IOCs'}
                </label>
                <div className="flex items-center gap-1">
                  {theme === 'desktop' && (
                    <button
                      type="button"
                      onClick={handleSwap}
                      className="defang-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
                      style={{ color: palette.textSecondary, background: 'transparent' }}
                      title="Swap mode and content"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      Swap
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClear}
                    className="defang-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
                    style={{ color: palette.textSecondary, background: 'transparent' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
              </div>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={mode === 'defang'
                  ? 'Paste URLs, IPs, or emails to defang...\n\nExample:\nhttps://malware.com/bad.exe\n192.168.1.1\nattacker@evil.com'
                  : 'Paste defanged IOCs to refang...\n\nExample:\nhxxps[://]malware[.]com/bad[.]exe\n192[.]168[.]1[.]1\nattacker[@]evil[.]com'
                }
                className="defang-field w-full h-48 px-4 py-3 rounded-lg text-sm resize-none"
                style={fieldStyle}
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleConvert}
                  disabled={!input.trim()}
                  className="px-5 py-2 rounded-md text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  style={{ background: palette.accent, color: palette.void }}
                >
                  {mode === 'defang' ? 'Defang' : 'Refang'}
                </button>
              </div>
            </div>

            <div className="p-5" style={cardStyle}>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium" style={{ color: palette.textSecondary }}>
                  {mode === 'defang' ? 'Defanged output' : 'Original IOCs'}
                </label>
                {output && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="defang-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
                    style={secondaryButtonStyle}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" style={{ color: palette.green }} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="w-full h-48 px-4 py-3 rounded-lg overflow-auto" style={fieldStyle}>
                {output ? (
                  <pre className="text-sm whitespace-pre-wrap break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{output}</pre>
                ) : (
                  <p className="text-sm" style={{ color: palette.textDisabled, fontFamily: typography.ui }}>
                    {mode === 'defang' ? 'Defanged output will appear here' : 'Refanged output will appear here'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 p-5" style={cardStyle}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: palette.textPrimary }}>Examples</h3>
            <div className="space-y-2">
              {examples.map((ex, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-3 rounded-lg"
                  style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}
                >
                  <code className="flex-1 text-xs truncate" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>{ex.input}</code>
                  <span style={{ color: palette.textDisabled }}>→</span>
                  <code className="flex-1 text-xs truncate" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{ex.output}</code>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 p-4" style={cardStyle}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: palette.textPrimary }}>Why defang?</h3>
            <p className="text-xs" style={{ color: palette.textSecondary }}>
              Defanging prevents accidental clicks on malicious links and stops security tools
              from flagging your reports. It's a standard practice when sharing IOCs in tickets,
              emails, chat, or documentation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
