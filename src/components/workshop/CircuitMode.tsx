import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import CircuitResponseCard, { type CircuitResult } from './CircuitResponse';

interface Agent {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  is_default: boolean;
}

interface RoundEntry {
  id: string;
  prompt: string;
  results: CircuitResult[];
  synthesis?: CircuitResult;
  timestamp: string;
}

interface Props {
  agents: Agent[];
  leadAgentId: string | null;
  onSetLead: (id: string) => void;
}

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#00ff9d',
  openai: '#ff6b35',
  google: '#00b4d8',
};

const AI_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

async function callAgent(
  agent: Agent,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  token: string
): Promise<{ content: string; tokens_used: number }> {
  const response = await fetch(AI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: agent.provider,
      model: agent.model,
      messages,
      system_prompt: systemPrompt,
      temperature: agent.temperature,
      max_tokens: agent.max_tokens,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `${agent.provider} error (${response.status})`);
  }

  return response.json();
}

export default function CircuitMode({ agents, leadAgentId, onSetLead }: Props) {
  const [rounds, setRounds] = useState<RoundEntry[]>([]);
  const [input, setInput] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [sharedContext, setSharedContext] = useState<Record<string, string[]>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const leadAgent = agents.find(a => a.id === leadAgentId) || agents[0];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [rounds]);

  const handleFlag = useCallback((roundIdx: number, agentId: string) => {
    setRounds(prev => prev.map((r, i) => {
      if (i !== roundIdx) return r;
      return {
        ...r,
        results: r.results.map(res =>
          res.agentId === agentId ? { ...res, flagged: !res.flagged } : res
        ),
      };
    }));
  }, []);

  const handleShareTo = useCallback((roundIdx: number, sourceAgentId: string, targetName: string) => {
    const round = rounds[roundIdx];
    if (!round) return;
    const sourceResult = round.results.find(r => r.agentId === sourceAgentId);
    if (!sourceResult) return;

    const targetAgent = agents.find(a => a.name === targetName);
    if (!targetAgent) return;

    const contextMsg = `[Shared analysis from ${sourceResult.agentName} (${sourceResult.model})]:\n\n${sourceResult.content}`;
    setSharedContext(prev => ({
      ...prev,
      [targetAgent.id]: [...(prev[targetAgent.id] || []), contextMsg],
    }));
  }, [rounds, agents]);

  const synthesize = useCallback(async (roundIdx: number) => {
    const round = rounds[roundIdx];
    if (!round || !leadAgent) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    setIsSynthesizing(true);

    setRounds(prev => prev.map((r, i) => {
      if (i !== roundIdx) return r;
      return {
        ...r,
        synthesis: {
          agentId: leadAgent.id,
          agentName: leadAgent.name,
          provider: leadAgent.provider,
          model: leadAgent.model,
          content: '',
          tokens: 0,
          status: 'streaming',
        },
      };
    }));

    const flaggedResponses = round.results.filter(r => r.flagged && r.status === 'done');
    const allResponses = flaggedResponses.length > 0 ? flaggedResponses : round.results.filter(r => r.status === 'done');

    const synthesisPrompt = allResponses.map(r =>
      `=== ${r.agentName} (${r.model}) ===\n${r.content}`
    ).join('\n\n');

    const systemPrompt = `You are the Lead AI synthesizer in a multi-AI brainstorming circuit. Your job is to:
1. Analyze the responses from the other AI models below
2. Identify which approach is most feasible and why
3. Note areas of agreement and disagreement
4. Provide a clear recommendation with reasoning
5. If responses are already aligned, confirm the consensus and add any missing details

Be direct. Highlight the strongest path forward. If one AI found something the others missed, call it out.`;

    try {
      const result = await callAgent(
        leadAgent,
        [{ role: 'user', content: `Original question: ${round.prompt}\n\nResponses from the circuit:\n\n${synthesisPrompt}` }],
        systemPrompt,
        token
      );

      setRounds(prev => prev.map((r, i) => {
        if (i !== roundIdx) return r;
        return {
          ...r,
          synthesis: {
            agentId: leadAgent.id,
            agentName: leadAgent.name,
            provider: leadAgent.provider,
            model: leadAgent.model,
            content: result.content,
            tokens: result.tokens_used,
            status: 'done',
          },
        };
      }));
    } catch (err) {
      setRounds(prev => prev.map((r, i) => {
        if (i !== roundIdx) return r;
        return {
          ...r,
          synthesis: {
            agentId: leadAgent.id,
            agentName: leadAgent.name,
            provider: leadAgent.provider,
            model: leadAgent.model,
            content: '',
            tokens: 0,
            status: 'error',
            error: err instanceof Error ? err.message : 'Synthesis failed',
          },
        };
      }));
    } finally {
      setIsSynthesizing(false);
    }
  }, [rounds, leadAgent]);

  const broadcast = async () => {
    if (!input.trim() || isBroadcasting || agents.length === 0) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    setIsBroadcasting(true);
    const prompt = input.trim();
    setInput('');

    const roundId = crypto.randomUUID();
    const initialResults: CircuitResult[] = agents.map(a => ({
      agentId: a.id,
      agentName: a.name,
      provider: a.provider,
      model: a.model,
      content: '',
      tokens: 0,
      status: 'streaming',
    }));

    const newRound: RoundEntry = {
      id: roundId,
      prompt,
      results: initialResults,
      timestamp: new Date().toISOString(),
    };

    setRounds(prev => [...prev, newRound]);

    const promises = agents.map(async (agent) => {
      const agentShared = sharedContext[agent.id] || [];
      const extraContext = agentShared.length > 0
        ? `\n\nShared context from other AI in this circuit:\n${agentShared.join('\n\n---\n\n')}`
        : '';

      const systemPrompt = agent.system_prompt + extraContext;

      try {
        const result = await callAgent(agent, [{ role: 'user', content: prompt }], systemPrompt, token);
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r;
          return {
            ...r,
            results: r.results.map(res =>
              res.agentId === agent.id
                ? { ...res, content: result.content, tokens: result.tokens_used, status: 'done' as const }
                : res
            ),
          };
        }));
      } catch (err) {
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r;
          return {
            ...r,
            results: r.results.map(res =>
              res.agentId === agent.id
                ? { ...res, status: 'error' as const, error: err instanceof Error ? err.message : 'Failed' }
                : res
            ),
          };
        }));
      }
    });

    await Promise.allSettled(promises);
    setSharedContext({});
    setIsBroadcasting(false);
  };

  const agentNames = agents.map(a => a.name);
  const sharedCount = Object.values(sharedContext).reduce((acc, arr) => acc + arr.length, 0);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: P.void }}>
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tracking-wider" style={{ color: '#fbbf24' }}>CIRCUIT MODE</span>
          <span className="text-xs" style={{ color: P.dim }}>{agents.length} agents</span>
          {sharedCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#00b4d815', color: '#00b4d8', border: '1px solid #00b4d830', fontSize: '0.6rem' }}>
              {sharedCount} shared
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: P.dim }}>LEAD:</span>
          {agents.map(a => {
            const c = PROVIDER_COLORS[a.provider] || '#00d9ff';
            const isLead = a.id === leadAgent?.id;
            return (
              <button
                key={a.id}
                onClick={() => onSetLead(a.id)}
                className="px-2 py-1 text-xs rounded transition-all"
                style={{
                  backgroundColor: isLead ? `${c}15` : 'transparent',
                  border: `1px solid ${isLead ? `${c}50` : P.border}`,
                  color: isLead ? c : P.dim,
                  fontSize: '0.65rem',
                }}
              >
                {a.name.replace('ThamOS-', '')}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {rounds.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: '#fbbf2410', border: '1px solid #fbbf2425' }}
            >
              <span className="text-3xl" style={{ color: '#fbbf24' }}>{'\u26A1'}</span>
            </div>
            <h2 className="text-sm font-medium mb-2" style={{ color: P.textLight }}>AI Circuit Brainstorm</h2>
            <p className="text-xs text-center max-w-md mb-2" style={{ color: P.text }}>
              Send a prompt to all AI agents simultaneously. Each will analyze independently,
              then the Lead AI will synthesize the best path forward.
            </p>
            <div className="flex items-center gap-3 mt-3">
              {agents.map(a => {
                const c = PROVIDER_COLORS[a.provider] || '#00d9ff';
                return (
                  <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ backgroundColor: `${c}08`, border: `1px solid ${c}20` }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                    <span className="text-xs" style={{ color: c, fontSize: '0.65rem' }}>{a.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {rounds.map((round, roundIdx) => {
          const allDone = round.results.every(r => r.status === 'done' || r.status === 'error');
          const successCount = round.results.filter(r => r.status === 'done').length;

          return (
            <div key={round.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-sm" style={{ backgroundColor: '#fbbf24' }} />
                <span className="text-xs font-medium" style={{ color: P.textLight }}>ROUND {roundIdx + 1}</span>
                <span className="text-xs" style={{ color: P.dim }}>
                  {new Date(round.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <div
                className="px-3 py-2 rounded-lg"
                style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}
              >
                <span className="text-xs" style={{ color: P.dim }}>PROMPT:</span>
                <p className="text-xs mt-1" style={{ color: P.textLight, whiteSpace: 'pre-wrap' }}>{round.prompt}</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {round.results.map(result => (
                  <CircuitResponseCard
                    key={result.agentId}
                    result={result}
                    onFlag={(id) => handleFlag(roundIdx, id)}
                    onShareTo={(id, target) => handleShareTo(roundIdx, id, target)}
                    allAgentNames={agentNames}
                    isLead={result.agentId === leadAgent?.id}
                  />
                ))}
              </div>

              {allDone && successCount >= 2 && !round.synthesis && (
                <button
                  onClick={() => synthesize(roundIdx)}
                  disabled={isSynthesizing}
                  className="w-full py-2.5 text-xs font-medium rounded-lg transition-all"
                  style={{
                    backgroundColor: '#fbbf2412',
                    border: '1px solid #fbbf2435',
                    color: '#fbbf24',
                  }}
                >
                  {isSynthesizing ? 'SYNTHESIZING...' : `SYNTHESIZE WITH ${leadAgent?.name.replace('ThamOS-', '') || 'LEAD'}`}
                </button>
              )}

              {round.synthesis && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: '#fbbf24' }} />
                    <span className="text-xs font-medium" style={{ color: '#fbbf24' }}>SYNTHESIS</span>
                  </div>
                  <CircuitResponseCard
                    result={round.synthesis}
                    onFlag={() => {}}
                    onShareTo={() => {}}
                    allAgentNames={[]}
                    isLead={true}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 flex-shrink-0" style={{ borderTop: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); broadcast(); } }}
            placeholder="Broadcast to all agents..."
            disabled={isBroadcasting}
            rows={1}
            className="flex-1 px-3 py-2 text-xs rounded resize-none focus:outline-none"
            style={{
              backgroundColor: P.surfaceLight,
              border: `1px solid ${P.border}`,
              color: P.textLight,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          />
          <button
            onClick={broadcast}
            disabled={!input.trim() || isBroadcasting}
            className="px-4 py-2 text-xs font-medium rounded transition-all flex-shrink-0"
            style={{
              backgroundColor: input.trim() && !isBroadcasting ? '#fbbf2420' : P.surfaceLight,
              border: `1px solid ${input.trim() && !isBroadcasting ? '#fbbf2440' : P.border}`,
              color: input.trim() && !isBroadcasting ? '#fbbf24' : P.dim,
            }}
          >
            {isBroadcasting ? 'BROADCASTING...' : 'BROADCAST'}
          </button>
        </div>
      </div>
    </div>
  );
}
