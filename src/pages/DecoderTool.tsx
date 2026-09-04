import { useState } from 'react';
import { Code, Copy, Check, ArrowRightLeft, Trash2, AlertTriangle, Hash, Link, FileCode, Type } from 'lucide-react';
import { useTheme } from '../contexts/themecontext';
import { palette, typography, accentBg, accentBorder } from '../design-system/tokens';

type EncodingType = 'base64' | 'url' | 'hex' | 'html' | 'unicode' | 'rot13';

interface EncodingOption {
  id: EncodingType;
  name: string;
  description: string;
  icon: any;
}

const encodings: EncodingOption[] = [
  { id: 'base64', name: 'Base64', description: 'Standard Base64 encoding', icon: Code },
  { id: 'url', name: 'URL Encoding', description: 'Percent-encoded characters', icon: Link },
  { id: 'hex', name: 'Hexadecimal', description: 'Hex string (with or without 0x)', icon: Hash },
  { id: 'html', name: 'HTML Entities', description: 'HTML character entities', icon: FileCode },
  { id: 'unicode', name: 'Unicode Escape', description: 'Unicode escape sequences', icon: Type },
  { id: 'rot13', name: 'ROT13', description: 'Simple letter substitution', icon: ArrowRightLeft },
];

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

export default function DecoderTool() {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [encoding, setEncoding] = useState<EncodingType>('base64');
  const [mode, setMode] = useState<'decode' | 'encode'>('decode');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const base64Decode = (str: string): string => {
    try {
      return atob(str.trim());
    } catch {
      throw new Error('Invalid Base64 string');
    }
  };

  const base64Encode = (str: string): string => {
    return btoa(str);
  };

  const urlDecode = (str: string): string => {
    try {
      return decodeURIComponent(str.trim());
    } catch {
      throw new Error('Invalid URL encoded string');
    }
  };

  const urlEncode = (str: string): string => {
    return encodeURIComponent(str);
  };

  const hexDecode = (str: string): string => {
    const hex = str.trim().replace(/^0x/i, '').replace(/\s+/g, '');
    if (!/^[0-9a-fA-F]*$/.test(hex)) {
      throw new Error('Invalid hexadecimal string');
    }
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
      result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return result;
  };

  const hexEncode = (str: string): string => {
    return Array.from(str)
      .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
  };

  const htmlDecode = (str: string): string => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
  };

  const htmlEncode = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const unicodeDecode = (str: string): string => {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
  };

  const unicodeEncode = (str: string): string => {
    return Array.from(str)
      .map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
      .join('');
  };

  const rot13 = (str: string): string => {
    return str.replace(/[a-zA-Z]/g, c => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  };

  const handleConvert = () => {
    if (!input.trim()) return;
    setError(null);

    try {
      let result = '';

      if (mode === 'decode') {
        switch (encoding) {
          case 'base64':
            result = base64Decode(input);
            break;
          case 'url':
            result = urlDecode(input);
            break;
          case 'hex':
            result = hexDecode(input);
            break;
          case 'html':
            result = htmlDecode(input);
            break;
          case 'unicode':
            result = unicodeDecode(input);
            break;
          case 'rot13':
            result = rot13(input);
            break;
        }
      } else {
        switch (encoding) {
          case 'base64':
            result = base64Encode(input);
            break;
          case 'url':
            result = urlEncode(input);
            break;
          case 'hex':
            result = hexEncode(input);
            break;
          case 'html':
            result = htmlEncode(input);
            break;
          case 'unicode':
            result = unicodeEncode(input);
            break;
          case 'rot13':
            result = rot13(input);
            break;
        }
      }

      setOutput(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
      setOutput('');
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwap = () => {
    setMode(mode === 'decode' ? 'encode' : 'decode');
    setInput(output);
    setOutput('');
    setError(null);
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError(null);
  };

  const selectEncoding = (id: EncodingType) => {
    setEncoding(id);
    setOutput('');
    setError(null);
  };

  return (
    <div
      className={`h-full flex flex-col ${theme === 'desktop' ? '' : 'p-8 space-y-8'}`}
      style={{ background: palette.elevated, color: palette.textPrimary, fontFamily: typography.ui }}
    >
      <style>{`
        .decoder-field::placeholder { color: ${palette.textDisabled}; }
        .decoder-field:focus { outline: none; border-color: ${palette.borderActive} !important; }
        .decoder-btn { transition: background-color 150ms, color 150ms; }
        .decoder-btn:hover:not(:disabled) { background: ${palette.surface} !important; color: ${palette.textPrimary} !important; }
        .decoder-tab { transition: color 150ms, background-color 150ms; }
        .decoder-tab:hover { color: ${palette.textPrimary} !important; }
        .decoder-seg { transition: color 150ms, background-color 150ms; }
        .decoder-seg:hover { color: ${palette.textPrimary} !important; }
      `}</style>

      {theme === 'desktop' ? (
        <div
          className="sticky top-0 z-20 px-4"
          style={{ background: palette.base, borderBottom: `1px solid ${palette.borderSubtle}` }}
        >
          <div className="flex items-center gap-1 overflow-x-auto">
            {encodings.map(enc => {
              const Icon = enc.icon;
              const isActive = encoding === enc.id;
              return (
                <button
                  key={enc.id}
                  type="button"
                  onClick={() => selectEncoding(enc.id)}
                  title={enc.description}
                  className="decoder-tab flex items-center gap-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap"
                  style={{
                    color: isActive ? palette.textPrimary : palette.textTertiary,
                    borderBottom: `2px solid ${isActive ? palette.accent : 'transparent'}`,
                    marginBottom: '-1px',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: isActive ? palette.accent : palette.textTertiary }} />
                  {enc.name}
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
            <Code className="w-7 h-7" style={{ color: palette.accent }} />
          </div>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: palette.textPrimary }}>Encoder / Decoder</h1>
          <p className="text-sm" style={{ color: palette.textSecondary }}>
            Decode and encode strings in various formats including Base64, URL encoding,
            hexadecimal, HTML entities, Unicode escapes, and ROT13.
          </p>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto ${theme === 'desktop' ? 'p-6' : ''}`}>
        <div className="max-w-4xl mx-auto">
          {theme !== 'desktop' && (
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              {encodings.map(enc => {
                const isActive = encoding === enc.id;
                return (
                  <button
                    key={enc.id}
                    type="button"
                    onClick={() => selectEncoding(enc.id)}
                    className="decoder-btn px-3 py-1.5 rounded-md text-sm font-medium"
                    style={{
                      background: isActive ? palette.surface : palette.float,
                      border: `1px solid ${isActive ? palette.borderActive : palette.borderDefault}`,
                      color: isActive ? palette.textPrimary : palette.textSecondary,
                    }}
                    title={enc.description}
                  >
                    {enc.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 mb-6">
            <div
              role="tablist"
              aria-label="Conversion direction"
              className="inline-flex items-center gap-0.5 p-0.5 rounded-md"
              style={{ background: palette.float, border: `1px solid ${palette.borderDefault}` }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'decode'}
                onClick={() => {
                  setMode('decode');
                  setOutput('');
                  setError(null);
                }}
                className="decoder-seg px-4 py-1.5 rounded text-sm font-medium"
                style={segmentStyle(mode === 'decode')}
              >
                Decode
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'encode'}
                onClick={() => {
                  setMode('encode');
                  setOutput('');
                  setError(null);
                }}
                className="decoder-seg px-4 py-1.5 rounded text-sm font-medium"
                style={segmentStyle(mode === 'encode')}
              >
                Encode
              </button>
            </div>
            <button
              type="button"
              onClick={handleSwap}
              className="decoder-btn p-2 rounded-md"
              style={secondaryButtonStyle}
              title="Swap mode and content"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5" style={cardStyle}>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium" style={{ color: palette.textSecondary }}>
                  {mode === 'decode' ? 'Encoded input' : 'Plain text input'}
                </label>
                <button
                  type="button"
                  onClick={handleClear}
                  className="decoder-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
                  style={{ color: palette.textSecondary, background: 'transparent' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={mode === 'decode'
                  ? `Paste ${encoding.toUpperCase()} encoded text here...`
                  : 'Enter text to encode...'
                }
                className="decoder-field w-full h-40 px-4 py-3 rounded-lg text-sm resize-none"
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
                  {mode === 'decode' ? 'Decode' : 'Encode'}
                </button>
              </div>
            </div>

            <div className="p-5" style={cardStyle}>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium" style={{ color: palette.textSecondary }}>
                  {mode === 'decode' ? 'Decoded output' : 'Encoded output'}
                </label>
                {output && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="decoder-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
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
              <div className="w-full h-40 px-4 py-3 rounded-lg overflow-auto" style={fieldStyle}>
                {error ? (
                  <div className="flex items-center gap-2" style={{ color: palette.rose, fontFamily: typography.ui }}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                ) : output ? (
                  <pre className="text-sm whitespace-pre-wrap break-all" style={{ color: palette.textPrimary, fontFamily: typography.mono }}>{output}</pre>
                ) : (
                  <p className="text-sm" style={{ color: palette.textDisabled, fontFamily: typography.ui }}>
                    {mode === 'decode' ? 'Decoded output will appear here' : 'Encoded output will appear here'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 p-5" style={cardStyle}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: palette.textPrimary }}>Common examples</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {[
                ['Base64', 'SGVsbG8gV29ybGQh → Hello World!'],
                ['URL encoding', 'Hello%20World → Hello World'],
                ['Hexadecimal', '48656c6c6f → Hello'],
                ['ROT13', 'Uryyb → Hello'],
              ].map(([label, example]) => (
                <div key={label} className="p-3 rounded-lg" style={{ background: palette.elevated, border: `1px solid ${palette.borderSubtle}` }}>
                  <p className="text-xs mb-1" style={{ color: palette.textTertiary }}>{label}</p>
                  <code className="text-xs" style={{ color: palette.textSecondary, fontFamily: typography.mono }}>{example}</code>
                </div>
              ))}
            </div>
          </div>

          <div
            className="mt-4 p-4 rounded-lg flex items-start gap-3"
            style={{ background: accentBg(palette.amber, 0.06), border: `1px solid ${accentBorder(palette.amber, 0.2)}` }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: palette.amber }} />
            <div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: palette.textPrimary }}>Security note</h3>
              <p className="text-xs" style={{ color: palette.textSecondary }}>
                Attackers often use encoding to obfuscate malicious payloads in phishing emails,
                scripts, and URLs. Always decode suspicious strings in a safe environment.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
