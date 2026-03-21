import { useState, useMemo } from 'react';
import { renderCircuitMarkdown } from './MarkdownRenderer';

export interface CircuitResult {
  agentId: string;
  agentName: string;
  provider: 'openai' | 'anthropic' | 'google' | 'openrouter';
  model: string;
  content: string;
  tokens: number;
  status: 'pending' | 'streaming' | 'done' | 'error';
  error?: string;
  flagged?: boolean;
}

export const AGENT_COLORS: Record<string, string> = {
  anthropic: '#E57B5C',
  openai: '#ff6b35',
  google: '#4285F4',
  openrouter: '#9370DB',
};

export const G = {
  void: '#050508',
  base: '#0a0d12',
  elevated: '#11141a',
  float: '#181b22',
  surface: '#1e222b',
  border: 'rgba(255,255,255,0.07)',
  borderHover: 'rgba(255,255,255,0.14)',
  glass: 'rgba(17,20,26,0.6)',
  glassHeavy: 'rgba(17,20,26,0.85)',
  dim: '#444',
  text: '#888',
  textLight: '#c8c8d0',
  white: '#e8e8ec',
  synth: '#F5B041',
};

interface Props {
  result: CircuitResult;
  onFlag: (agentId: string) => void;
  onShareTo: (agentId: string, targetAgentName: string) => void;
  allAgentNames: string[];
  isLead: boolean;
  compact?: boolean;
  noHeightLimit?: boolean;
  hideActions?: boolean;
}

export default function CircuitResponseCard({ result, onFlag, onShareTo, allAgentNames, isLead, compact, noHeightLimit, hideActions }: Props) {
  const [copied, setCopied] = useState(false);
  const color = AGENT_COLORS[result.provider] || '#4285F4';
  const otherAgents = allAgentNames.filter(n => n !== result.agentName);

  const handleDownload = (code: string, lang: string) => {
    const ext = lang || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maestro-${result.agentName.toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderedContent = useMemo(() => {
    if (!result.content) return null;
    return renderCircuitMarkdown(
      result.content,
      (code) => navigator.clipboard.writeText(code),
      handleDownload,
    );
  }, [result.content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Shared button style
  const btnStyle = (active: boolean, activeColor: string): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    letterSpacing: '0.02em',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: active ? `${activeColor}12` : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? `${activeColor}30` : 'rgba(255,255,255,0.06)'}`,
    color: active ? activeColor : '#666',
  });

  if (compact) {
    return (
      <div
        style={{
          borderRadius: '12px',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
          background: G.glassHeavy,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${result.flagged ? `${color}30` : G.border}`,
          boxShadow: result.flagged ? `0 0 12px ${color}08` : 'none',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            fontSize: '13.5px',
            lineHeight: 1.7,
            color: '#bbb',
            fontFamily: 'Inter, sans-serif',
            overflowY: 'auto',
            maxHeight: noHeightLimit ? undefined : '200px',
          }}
        >
          {result.status === 'streaming' && !result.content && (
            <span style={{ color, opacity: 0.7 }}>Thinking...</span>
          )}
          {result.status === 'error' && (
            <span style={{ color: '#ff4466' }}>{result.error || 'Request failed'}</span>
          )}
          {result.status === 'pending' && (
            <span style={{ color: G.dim }}>Waiting...</span>
          )}
          {(result.status === 'done' || (result.status === 'streaming' && result.content)) && (
            renderedContent || <span style={{ color: G.dim }}>No response</span>
          )}
        </div>
        {result.status === 'done' && !hideActions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              flexWrap: 'wrap',
              borderTop: `1px solid ${G.border}`,
              background: 'rgba(255,255,255,0.015)',
            }}
          >
            <button onClick={() => onFlag(result.agentId)} style={btnStyle(!!result.flagged, color)}>
              {result.flagged ? 'FLAGGED' : 'FLAG'}
            </button>
            {otherAgents.map(name => (
              <button
                key={name}
                onClick={() => onShareTo(result.agentId, name)}
                style={btnStyle(false, color)}
              >
                {'\u2192'} {name}
              </button>
            ))}
            <button
              onClick={handleCopy}
              style={{ ...btnStyle(copied, color), marginLeft: 'auto' }}
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Full card (non-compact) — used in standalone views
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        background: G.glassHeavy,
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        border: `1px solid ${result.flagged ? `${color}30` : isLead ? `${G.synth}20` : G.border}`,
        boxShadow: result.flagged ? `0 0 16px ${color}10` : '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      {/* Agent header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${G.border}`,
          background: `${color}04`,
          position: 'relative',
        }}
      >
        {/* Agent color stripe */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '2px',
          borderRadius: '0 0 2px 2px',
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          opacity: 0.4,
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: result.status === 'done' ? color : result.status === 'error' ? '#ff4466' : G.dim,
              boxShadow: result.status === 'streaming' ? `0 0 10px ${color}` : `0 0 6px ${color}60`,
              transition: 'all 0.3s ease',
            }}
          />
          <span style={{ fontSize: '14px', fontWeight: 500, color }}>{result.agentName}</span>
          <span style={{ fontSize: '11px', color: G.dim }}>{result.model}</span>
          {isLead && (
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              padding: '2px 8px',
              borderRadius: '6px',
              background: `${G.synth}12`,
              color: G.synth,
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              LEAD
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {result.status === 'done' && result.tokens > 0 && (
            <span style={{ fontSize: '11px', color: G.dim, fontFamily: 'JetBrains Mono, monospace' }}>{result.tokens} tok</span>
          )}
          {result.status === 'streaming' && (
            <span style={{ fontSize: '11px', color, opacity: 0.7 }}>streaming...</span>
          )}
          {result.status === 'error' && (
            <span style={{ fontSize: '11px', color: '#ff4466' }}>FAILED</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          padding: '16px',
          fontSize: '13.5px',
          lineHeight: 1.7,
          color: '#bbb',
          fontFamily: 'Inter, sans-serif',
          overflowY: 'auto',
          maxHeight: noHeightLimit ? undefined : '300px',
        }}
      >
        {result.status === 'pending' && <span style={{ color: G.dim }}>Waiting...</span>}
        {result.status === 'error' && <span style={{ color: '#ff4466' }}>{result.error || 'Request failed'}</span>}
        {(result.status === 'done' || result.status === 'streaming') && (
          renderedContent || <span style={{ color: G.dim }}>No response</span>
        )}
      </div>

      {/* Actions */}
      {result.status === 'done' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            flexWrap: 'wrap',
            borderTop: `1px solid ${G.border}`,
            background: 'rgba(255,255,255,0.015)',
          }}
        >
          <button onClick={() => onFlag(result.agentId)} style={btnStyle(!!result.flagged, color)}>
            {result.flagged ? 'FLAGGED' : 'FLAG'}
          </button>
          {otherAgents.map(name => (
            <button
              key={name}
              onClick={() => onShareTo(result.agentId, name)}
              style={btnStyle(false, color)}
            >
              SHARE {'\u2192'} {name}
            </button>
          ))}
          <button
            onClick={handleCopy}
            style={{ ...btnStyle(copied, color), marginLeft: 'auto' }}
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      )}
    </div>
  );
}
