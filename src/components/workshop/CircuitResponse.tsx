import { useState } from 'react';

export interface CircuitResult {
  agentId: string;
  agentName: string;
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  content: string;
  tokens: number;
  status: 'pending' | 'streaming' | 'done' | 'error';
  error?: string;
  flagged?: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#00ff9d',
  openai: '#ff6b35',
  google: '#00b4d8',
};

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
};

interface Props {
  result: CircuitResult;
  onFlag: (agentId: string) => void;
  onShareTo: (agentId: string, targetAgentName: string) => void;
  allAgentNames: string[];
  isLead: boolean;
}

export default function CircuitResponseCard({ result, onFlag, onShareTo, allAgentNames, isLead }: Props) {
  const [expanded, setExpanded] = useState(true);
  const color = PROVIDER_COLORS[result.provider] || '#00d9ff';
  const otherAgents = allAgentNames.filter(n => n !== result.agentName);

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden transition-all"
      style={{
        backgroundColor: P.surface,
        border: `1px solid ${result.flagged ? `${color}60` : isLead ? '#fbbf2440' : P.border}`,
        boxShadow: result.flagged ? `0 0 12px ${color}15` : 'none',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: `${color}06` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: result.status === 'done' ? color : result.status === 'error' ? '#ff0080' : P.dim,
              boxShadow: result.status === 'streaming' ? `0 0 8px ${color}` : 'none',
              animation: result.status === 'streaming' ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
          <span className="text-xs font-medium" style={{ color }}>{result.agentName}</span>
          <span className="text-xs" style={{ color: P.dim }}>{result.model}</span>
          {isLead && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#fbbf2415', color: '#fbbf24', border: '1px solid #fbbf2430', fontSize: '0.6rem' }}
            >
              LEAD
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result.status === 'done' && result.tokens > 0 && (
            <span className="text-xs" style={{ color: P.dim }}>{result.tokens} tok</span>
          )}
          {result.status === 'streaming' && (
            <span className="text-xs animate-pulse" style={{ color }}>thinking...</span>
          )}
          {result.status === 'error' && (
            <span className="text-xs" style={{ color: '#ff0080' }}>FAILED</span>
          )}
          <span className="text-xs" style={{ color: P.dim }}>{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col">
          <div
            className="px-3 py-3 text-xs leading-relaxed overflow-y-auto"
            style={{
              color: P.textLight,
              fontFamily: 'JetBrains Mono, monospace',
              maxHeight: '300px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {result.status === 'pending' && (
              <span style={{ color: P.dim }}>Waiting...</span>
            )}
            {result.status === 'error' && (
              <span style={{ color: '#ff0080' }}>{result.error || 'Request failed'}</span>
            )}
            {(result.status === 'done' || result.status === 'streaming') && (
              result.content || <span style={{ color: P.dim }}>No response</span>
            )}
          </div>

          {result.status === 'done' && (
            <div
              className="flex items-center gap-1.5 px-3 py-2 flex-wrap"
              style={{ borderTop: `1px solid ${P.border}` }}
            >
              <button
                onClick={() => onFlag(result.agentId)}
                className="px-2 py-1 text-xs rounded transition-all"
                style={{
                  backgroundColor: result.flagged ? `${color}20` : 'transparent',
                  border: `1px solid ${result.flagged ? `${color}50` : P.border}`,
                  color: result.flagged ? color : P.dim,
                  fontSize: '0.65rem',
                }}
              >
                {result.flagged ? 'FLAGGED' : 'FLAG'}
              </button>
              {otherAgents.map(name => (
                <button
                  key={name}
                  onClick={() => onShareTo(result.agentId, name)}
                  className="px-2 py-1 text-xs rounded transition-all"
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${P.border}`,
                    color: P.dim,
                    fontSize: '0.65rem',
                  }}
                >
                  SHARE {'\u2192'} {name.replace('ThamOS-', '')}
                </button>
              ))}
              <button
                onClick={() => navigator.clipboard.writeText(result.content)}
                className="px-2 py-1 text-xs rounded transition-all ml-auto"
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${P.border}`,
                  color: P.dim,
                  fontSize: '0.65rem',
                }}
              >
                COPY
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
