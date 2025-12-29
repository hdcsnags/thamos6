import { useState } from 'react';
import { ShieldOff, Shield, Copy, Check, ArrowRightLeft, Trash2 } from 'lucide-react';

export default function DefangTool() {
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

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
          {mode === 'defang' ? (
            <ShieldOff className="w-8 h-8 text-white" />
          ) : (
            <Shield className="w-8 h-8 text-white" />
          )}
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Defang / Refang Tool</h1>
        <p className="text-slate-400">
          Safely share malicious IOCs by defanging URLs, IPs, and emails.
          Or refang them back to their original form for analysis.
        </p>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={() => setMode('defang')}
            className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
              mode === 'defang'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <ShieldOff className="w-4 h-4" />
            Defang
          </button>
          <button
            onClick={handleSwap}
            className="p-3 bg-slate-800 text-slate-400 rounded-lg hover:text-white hover:bg-slate-700 transition-colors"
            title="Swap mode and content"
          >
            <ArrowRightLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setMode('refang')}
            className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
              mode === 'refang'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            Refang
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-300">
                {mode === 'defang' ? 'Original IOCs' : 'Defanged IOCs'}
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
              placeholder={mode === 'defang'
                ? 'Paste URLs, IPs, or emails to defang...\n\nExample:\nhttps://malware.com/bad.exe\n192.168.1.1\nattacker@evil.com'
                : 'Paste defanged IOCs to refang...\n\nExample:\nhxxps[://]malware[.]com/bad[.]exe\n192[.]168[.]1[.]1\nattacker[@]evil[.]com'
              }
              className="w-full h-48 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleConvert}
                disabled={!input.trim()}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {mode === 'defang' ? 'Defang' : 'Refang'}
              </button>
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-300">
                {mode === 'defang' ? 'Defanged Output' : 'Original IOCs'}
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
            <div className="w-full h-48 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg overflow-auto">
              {output ? (
                <pre className="text-sm text-emerald-400 font-mono whitespace-pre-wrap break-all">{output}</pre>
              ) : (
                <p className="text-slate-500 text-sm">
                  {mode === 'defang' ? 'Defanged output will appear here' : 'Refanged output will appear here'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 bg-slate-900/50 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold text-white mb-4">Examples</h3>
          <div className="space-y-3">
            {examples.map((ex, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg">
                <code className="flex-1 text-sm text-slate-400 font-mono truncate">{ex.input}</code>
                <span className="text-slate-600">→</span>
                <code className="flex-1 text-sm text-emerald-400 font-mono truncate">{ex.output}</code>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
          <h3 className="font-semibold text-blue-400 mb-2">Why Defang?</h3>
          <p className="text-sm text-blue-300/80">
            Defanging prevents accidental clicks on malicious links and stops security tools
            from flagging your reports. It's a standard practice when sharing IOCs in tickets,
            emails, chat, or documentation.
          </p>
        </div>
      </div>
    </div>
  );
}
