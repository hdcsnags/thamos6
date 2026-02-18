import { useState } from 'react';
import { palette, typography } from '../../design-system/tokens';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  teal: palette.teal,
  green: palette.green,
};

interface Props {
  content: string;
  filename: string;
  language: string;
  htmlUrl: string;
}

export function GitHubFileViewer({ content, filename, language, htmlUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');
  const lineCount = lines.length;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ fontFamily: typography.mono }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{
        backgroundColor: P.surface,
        borderBottom: `1px solid ${P.border}`,
      }}>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: P.textLight }}>{filename}</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{
            backgroundColor: `${P.teal}10`,
            color: P.dim,
            fontSize: '9px',
          }}>
            {language.toUpperCase()}
          </span>
          <span className="text-xs" style={{ color: P.dim, fontSize: '10px' }}>
            {lineCount} lines
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyToClipboard}
            className="px-2 py-1 text-xs rounded transition-all"
            style={{
              color: copied ? P.green : P.dim,
              border: `1px solid ${copied ? `${P.green}30` : P.border}`,
              backgroundColor: copied ? `${P.green}08` : 'transparent',
            }}
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-xs rounded transition-all"
            style={{ color: P.dim, border: `1px solid ${P.border}` }}
          >
            GITHUB
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-auto" style={{ backgroundColor: P.void }}>
        <table className="w-full border-collapse" style={{ fontSize: '12px', lineHeight: '1.6' }}>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="hover:opacity-90" style={{ transition: 'background-color 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${P.surfaceLight}`)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <td
                  className="text-right px-3 select-none align-top"
                  style={{
                    color: P.dim,
                    borderRight: `1px solid ${P.border}`,
                    width: '1%',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {i + 1}
                </td>
                <td className="px-4" style={{ color: P.textLight }}>
                  <pre className="m-0" style={{ fontFamily: typography.mono, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {line || ' '}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
