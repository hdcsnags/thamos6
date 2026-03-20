import React, { useState } from 'react';

const G = {
  elevated: '#11141a',
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  dim: '#444',
  code: '#a0a0b0',
  kw: '#E57B5C',
  str: '#7ec699',
  type: '#6eb4ff',
  cmt: '#444',
};

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

  return (
    <div style={{
      background: 'rgba(0,0,0,0.4)',
      border: `1px solid ${G.border}`,
      borderRadius: '12px',
      overflow: 'hidden',
      margin: '10px 0',
    }}>
      {/* Header with lang label + actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: `1px solid ${G.border}`,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '10px',
          color: G.dim,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          {lang || 'code'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={handleCopy}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              color: copied ? '#50c878' : '#555',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: '4px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'none'; }}
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
          {onDownload && (
            <button
              onClick={() => onDownload(code, lang)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                color: '#555',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 8px',
                borderRadius: '4px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'none'; }}
            >
              DOWNLOAD
            </button>
          )}
          {onOpenInEditor && (
            <button
              onClick={() => onOpenInEditor(code, lang)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                color: '#555',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 8px',
                borderRadius: '4px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'none'; }}
            >
              OPEN IN EDITOR
            </button>
          )}
        </div>
      </div>
      {/* Code body */}
      <pre style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '12.5px',
        lineHeight: 1.6,
        color: G.code,
        margin: 0,
        padding: '14px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {code}
      </pre>
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
        result.push(
          <span
            key={`${key++}-c`}
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              padding: '1px 6px',
              borderRadius: '4px',
              color: '#c8cde0',
              fontSize: '0.8em',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {token.slice(1, -1)}
          </span>
        );
      } else if (token.startsWith('**')) {
        result.push(
          <strong key={`${key++}-b`} style={{ color: '#ffffff', fontWeight: 500 }}>
            {token.slice(2, -2)}
          </strong>
        );
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
      parts.push(<div key={key++} style={{ color: '#e8e8ec', fontWeight: 600, fontSize: '0.85em', margin: '12px 0 4px' }}>{renderInline(line.slice(4))}</div>);
    } else if (line.startsWith('## ')) {
      parts.push(<div key={key++} style={{ color: '#e8e8ec', fontWeight: 600, fontSize: '0.9em', margin: '14px 0 6px' }}>{renderInline(line.slice(3))}</div>);
    } else if (line.startsWith('# ')) {
      parts.push(<div key={key++} style={{ color: '#e8e8ec', fontWeight: 700, fontSize: '1em', margin: '16px 0 8px' }}>{renderInline(line.slice(2))}</div>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      parts.push(
        <div key={key++} style={{ paddingLeft: '14px', display: 'flex', gap: '8px' }}>
          <span style={{ color: '#444', marginTop: '2px' }}>{'\u25B8'}</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const numEnd = line.indexOf('. ');
      parts.push(
        <div key={key++} style={{ paddingLeft: '14px', display: 'flex', gap: '8px' }}>
          <span style={{ color: '#555', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85em' }}>{line.slice(0, numEnd + 1)}</span>
          <span>{renderInline(line.slice(numEnd + 2))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      parts.push(<div key={key++} style={{ height: '8px' }} />);
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
