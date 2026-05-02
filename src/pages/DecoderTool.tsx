import { useState } from 'react';
import { Code, Copy, Check, ArrowRightLeft, Trash2, AlertTriangle, Hash, Link, FileCode, Type } from 'lucide-react';
import { useTheme } from '../contexts/themecontext';

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

export default function DecoderTool() {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [encoding, setEncoding] = useState<EncodingType>('base64');
  const [mode, setMode] = useState<'decode' | 'encode'>('decode');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ... (rest of the functions remain the same) ...

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

  return (
    <div className={`h-full flex flex-col ${theme === 'desktop' ? '' : 'p-8 space-y-8'}`}>
      {theme === 'desktop' ? (
        <div className="sticky top-0 z-20 backdrop-blur-md bg-slate-900/40 border-b border-white/5 px-6">
          <div className="flex items-center gap-1">
            {encodings.map(enc => {
              const Icon = enc.icon;
              const isActive = encoding === enc.id;
              return (
                <button
                  key={enc.id}
                  onClick={() => {
                    setEncoding(enc.id);
                    setOutput('');
                    setError(null);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                    isActive 
                      ? 'text-cyan-400 border-cyan-500 bg-cyan-500/5' 
                      : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {enc.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
            <Code className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Encoder / Decoder</h1>
          <p className="text-slate-400">
            Decode and encode strings in various formats including Base64, URL encoding,
            hexadecimal, HTML entities, Unicode escapes, and ROT13.
          </p>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto ${theme === 'desktop' ? 'p-8' : ''}`}>
        <div className={`max-w-4xl mx-auto ${theme === 'desktop' ? '' : ''}`}>
          {theme !== 'desktop' && (
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              {encodings.map(enc => (
                <button
                  key={enc.id}
                  onClick={() => {
                    setEncoding(enc.id);
                    setOutput('');
                    setError(null);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    encoding === enc.id
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title={enc.description}
                >
                  {enc.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={() => {
                setMode('decode');
                setOutput('');
                setError(null);
              }}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                mode === 'decode'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Decode
            </button>
            <button
              onClick={handleSwap}
              className="p-2.5 bg-slate-800 text-slate-400 rounded-lg hover:text-white hover:bg-slate-700 transition-colors"
              title="Swap mode and content"
            >
              <ArrowRightLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setMode('encode');
                setOutput('');
                setError(null);
              }}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                mode === 'encode'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Encode
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-white/5 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">
                  {mode === 'decode' ? 'Encoded Input' : 'Plain Text Input'}
                </label>
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
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
                className="w-full h-40 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
              />
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleConvert}
                  disabled={!input.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {mode === 'decode' ? 'Decode' : 'Encode'}
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-white/5 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">
                  {mode === 'decode' ? 'Decoded Output' : 'Encoded Output'}
                </label>
                {output && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
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
              <div className="w-full h-40 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg overflow-auto">
                {error ? (
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">{error}</span>
                  </div>
                ) : output ? (
                  <pre className="text-sm text-emerald-400 font-mono whitespace-pre-wrap break-all">{output}</pre>
                ) : (
                  <p className="text-slate-500 text-sm">
                    {mode === 'decode' ? 'Decoded output will appear here' : 'Encoded output will appear here'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 bg-slate-900/50 rounded-xl border border-white/5 p-5">
            <h3 className="font-semibold text-white mb-4">Common Examples</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-slate-400 mb-1">Base64</p>
                <code className="text-cyan-400 font-mono">SGVsbG8gV29ybGQh → Hello World!</code>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-slate-400 mb-1">URL Encoding</p>
                <code className="text-cyan-400 font-mono">Hello%20World → Hello World</code>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-slate-400 mb-1">Hexadecimal</p>
                <code className="text-cyan-400 font-mono">48656c6c6f → Hello</code>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-slate-400 mb-1">ROT13</p>
                <code className="text-cyan-400 font-mono">Uryyb → Hello</code>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
            <h3 className="font-semibold text-amber-400 mb-2">Security Note</h3>
            <p className="text-sm text-amber-300/80">
              Attackers often use encoding to obfuscate malicious payloads in phishing emails,
              scripts, and URLs. Always decode suspicious strings in a safe environment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
