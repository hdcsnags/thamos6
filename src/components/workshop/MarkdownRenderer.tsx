import React, { useState } from 'react';

interface CodeBlockProps {
  code: string;
  lang: string;
  onCopy?: (code: string) => void;
  onDownload?: (code: string, lang: string) => void;
  onOpenInEditor?: (code: string, lang: string) => void;
}

function CodeBlock({ code, lang, onCopy, onDownload, onOpenInEditor }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (onCopy) {
      onCopy(code);
    } else {
      navigator.clipboard.writeText(code);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const btnStyle = (color: string): React.CSSProperties => ({
    color,
    fontSize: '0.6rem',
    border: `1px solid ${color}30`,
    borderRadius: '3px',
    padding: '1px 6px',
    backgroundColor: `${color}08`,
    cursor: 'pointer',
  });

  return (
    <div style={{ backgroundColor: '#0a0e1a', border: '1px solid #1a1f35', borderRadius: '6px', margin: '6px 0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '1px solid #1a1f3540' }}>
        <span style={{ color: '#3a3f55', fontSize: '0.65rem' }}>{lang || 'code'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button onClick={handleCopy} style={btnStyle('#8a8fa8')}>
            {copied ? 'COPIED' : 'COPY'}
          </button>
          {onDownload && (
            <button onClick={() => onDownload(code, lang)} style={btnStyle('#00d9ff')}>
              DOWNLOAD
            </button>
          )}
          {onOpenInEditor && (
            <button onClick={() => onOpenInEditor(code, lang)} style={btnStyle('#fbbf24')}>
              OPEN IN EDITOR
            </button>
          )}
        </div>
      </div>
      <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#00ff9d', margin: 0, padding: '8px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{code}</pre>
    </div>
  );
}

export function renderCircuitMarkdown(
  text: string,
  onCopy?: (code: string) => void,
  onDownload?: (code: string, lang: string) => void,
  onOpenInEditor?: (code: string, lang: string) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';
  let key = 0;

  const renderInline = (line: string): React.ReactNode => {
    const result: React.ReactNode[] = [];
    let remaining = line;
    let idx = 0;
    const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
    let match;
    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > idx) {
        result.push(remaining.slice(idx, match.index));
      }
      const token = match[0];
      if (token.startsWith('`')) {
        result.push(<span key={`${key++}-c`} style={{ backgroundColor: '#1a1f35', padding: '1px 4px', borderRadius: '3px', color: '#00ff9d', fontSize: '0.7rem' }}>{token.slice(1, -1)}</span>);
      } else if (token.startsWith('**')) {
        result.push(<strong key={`${key++}-b`} style={{ color: '#c8cde0', fontWeight: 600 }}>{token.slice(2, -2)}</strong>);
      }
      idx = match.index + token.length;
    }
    if (idx < remaining.length) result.push(remaining.slice(idx));
    return result;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const capturedCode = codeBuffer.join('\n');
        const capturedLang = codeLang;
        parts.push(
          <CodeBlock key={key++} code={capturedCode} lang={capturedLang} onCopy={onCopy} onDownload={onDownload} onOpenInEditor={onOpenInEditor} />
        );
        codeBuffer = [];
        codeLang = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }
    if (line.startsWith('### ')) {
      parts.push(<div key={key++} style={{ color: '#c8cde0', fontWeight: 600, fontSize: '0.75rem', margin: '8px 0 4px' }}>{renderInline(line.slice(4))}</div>);
    } else if (line.startsWith('## ')) {
      parts.push(<div key={key++} style={{ color: '#c8cde0', fontWeight: 600, fontSize: '0.8rem', margin: '10px 0 4px' }}>{renderInline(line.slice(3))}</div>);
    } else if (line.startsWith('# ')) {
      parts.push(<div key={key++} style={{ color: '#c8cde0', fontWeight: 700, fontSize: '0.85rem', margin: '12px 0 6px' }}>{renderInline(line.slice(2))}</div>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      parts.push(<div key={key++} style={{ paddingLeft: '12px' }}><span style={{ color: '#3a3f55' }}>-</span> {renderInline(line.slice(2))}</div>);
    } else if (/^\d+\.\s/.test(line)) {
      const numEnd = line.indexOf('. ');
      parts.push(<div key={key++} style={{ paddingLeft: '12px' }}><span style={{ color: '#3a3f55' }}>{line.slice(0, numEnd + 1)}</span> {renderInline(line.slice(numEnd + 2))}</div>);
    } else if (line.trim() === '') {
      parts.push(<div key={key++} style={{ height: '6px' }} />);
    } else {
      parts.push(<div key={key++}>{renderInline(line)}</div>);
    }
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    const capturedCode = codeBuffer.join('\n');
    const capturedLang = codeLang;
    parts.push(
      <CodeBlock key={key++} code={capturedCode} lang={capturedLang} onCopy={onCopy} onDownload={onDownload} onOpenInEditor={onOpenInEditor} />
    );
  }

  return parts;
}
