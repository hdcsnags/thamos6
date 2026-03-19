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
  targetAgentIds: string[];
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

type ViewMode = 'columns' | 'focused' | 'carousel';

export default function CircuitMode({ agents, leadAgentId, onSetLead }: Props) {
  const [rounds, setRounds] = useState<RoundEntry[]>([]);
  const [input, setInput] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [sharedContext, setSharedContext] = useState<Record<string, string[]>>({});
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set(agents.map(a => a.id)));
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('columns');
  const [autoShare, setAutoShare] = useState(false);
  // Per-agent conversation memory: agentId -> message history
  const [agentMemory, setAgentMemory] = useState<Record<string, Array<{ role: string; content: string }>>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const leadAgent = agents.find(a => a.id === leadAgentId) || agents[0];

  useEffect(() => {
    setSelectedAgentIds(new Set(agents.map(a => a.id)));
  }, [agents]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [rounds]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        if (next.size > 1) next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const focusAgent = (agentId: string) => {
    if (focusedAgentId === agentId) {
      setFocusedAgentId(null);
      setViewMode('columns');
      setSelectedAgentIds(new Set(agents.map(a => a.id)));
    } else {
      setFocusedAgentId(agentId);
      setViewMode('focused');
      setSelectedAgentIds(new Set([agentId]));
    }
  };

  const selectAll = () => {
    setFocusedAgentId(null);
    setViewMode('columns');
    setSelectedAgentIds(new Set(agents.map(a => a.id)));
  };

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

    const targetAgents = agents.filter(a => selectedAgentIds.has(a.id));
    if (targetAgents.length === 0) return;

    setIsBroadcasting(true);
    const prompt = input.trim();
    setInput('');

    const roundId = crypto.randomUUID();
    const initialResults: CircuitResult[] = targetAgents.map(a => ({
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
      targetAgentIds: targetAgents.map(a => a.id),
    };

    setRounds(prev => [...prev, newRound]);

    // Build per-agent messages with conversation memory
    const promises = targetAgents.map(async (agent) => {
      const agentShared = sharedContext[agent.id] || [];
      const extraContext = agentShared.length > 0
        ? `\n\nShared context from other AI in this circuit:\n${agentShared.join('\n\n---\n\n')}`
        : '';

      const systemPrompt = agent.system_prompt + extraContext;

      // Include conversation history for this agent
      const history = agentMemory[agent.id] || [];
      const messages = [...history, { role: 'user', content: prompt }];

      try {
        const result = await callAgent(agent, messages, systemPrompt, token);

        // Update agent memory with this exchange
        setAgentMemory(prev => ({
          ...prev,
          [agent.id]: [...(prev[agent.id] || []), { role: 'user', content: prompt }, { role: 'assistant', content: result.content }],
        }));

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

    // Auto-share: after all responses come in, cross-pollinate to all other agents
    if (autoShare) {
      setRounds(prev => {
        const thisRound = prev.find(r => r.id === roundId);
        if (!thisRound) return prev;
        const doneResults = thisRound.results.filter(r => r.status === 'done' && r.content);
        if (doneResults.length > 1) {
          const newShared: Record<string, string[]> = {};
          for (const agent of targetAgents) {
            const othersResponses = doneResults
              .filter(r => r.agentId !== agent.id)
              .map(r => `[${r.agentName} (${r.model})]:\n\n${r.content}`);
            if (othersResponses.length > 0) {
              newShared[agent.id] = othersResponses;
            }
          }
          setSharedContext(newShared);
        }
        return prev;
      });
    } else {
      setSharedContext({});
    }

    setIsBroadcasting(false);
  };

  const clearMemory = () => {
    setAgentMemory({});
    setSharedContext({});
  };

  const agentNames = agents.map(a => a.name);
  const sharedCount = Object.values(sharedContext).reduce((acc, arr) => acc + arr.length, 0);
  const totalMemoryMessages = Object.values(agentMemory).reduce((acc, msgs) => acc + msgs.length, 0);
  const targetCount = selectedAgentIds.size;
  const isAllSelected = targetCount === agents.length;

  const getAgentRounds = (agentId: string) => {
    return rounds
      .filter(r => r.results.some(res => res.agentId === agentId))
      .map(r => ({
        ...r,
        result: r.results.find(res => res.agentId === agentId)!,
      }));
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: P.void }}>
      <div
        className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}
      >
        <div className="flex items-center gap-2 flex-1">
          <button
            onClick={selectAll}
            className="px-2 py-1 rounded transition-all"
            style={{
              backgroundColor: isAllSelected && !focusedAgentId ? '#fbbf2412' : 'transparent',
              border: `1px solid ${isAllSelected && !focusedAgentId ? '#fbbf2440' : P.border}`,
              color: isAllSelected && !focusedAgentId ? '#fbbf24' : P.dim,
              fontSize: '0.65rem',
            }}
          >
            ALL
          </button>

          <div style={{ width: '1px', height: '16px', backgroundColor: P.border }} />

          {agents.map(a => {
            const c = PROVIDER_COLORS[a.provider] || '#00d9ff';
            const isSelected = selectedAgentIds.has(a.id);
            const isFocused = focusedAgentId === a.id;
            const isLead = a.id === leadAgent?.id;

            return (
              <div key={a.id} className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleAgent(a.id)}
                  onDoubleClick={() => focusAgent(a.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded transition-all"
                  style={{
                    backgroundColor: isFocused ? `${c}20` : isSelected ? `${c}08` : 'transparent',
                    border: `1px solid ${isFocused ? `${c}60` : isSelected ? `${c}30` : P.border}`,
                    color: isSelected ? c : P.dim,
                    fontSize: '0.65rem',
                  }}
                  title={`Click: toggle | Double-click: focus on ${a.name}`}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full transition-all"
                    style={{
                      backgroundColor: isSelected ? c : P.dim,
                      boxShadow: isFocused ? `0 0 6px ${c}` : 'none',
                    }}
                  />
                  {a.name}
                  {isLead && (
                    <span style={{ color: '#fbbf24', fontSize: '0.55rem' }}>L</span>
                  )}
                </button>
                {!isLead && (
                  <button
                    onClick={() => onSetLead(a.id)}
                    className="px-1 py-1 rounded opacity-0 hover:opacity-100 transition-opacity"
                    style={{ color: P.dim, fontSize: '0.5rem' }}
                    title={`Set ${a.name} as lead`}
                  >
                    L
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center" style={{ border: `1px solid ${P.border}`, borderRadius: '4px', overflow: 'hidden' }}>
            <button
              onClick={() => { setViewMode('columns'); setFocusedAgentId(null); setSelectedAgentIds(new Set(agents.map(a => a.id))); }}
              className="px-1.5 py-1 transition-all"
              style={{
                backgroundColor: viewMode === 'columns' ? '#fbbf2415' : 'transparent',
                color: viewMode === 'columns' ? '#fbbf24' : P.dim,
                fontSize: '0.55rem',
                borderRight: `1px solid ${P.border}`,
              }}
              title="Column view"
            >
              {'\u2261'}
            </button>
            <button
              onClick={() => { setViewMode('carousel'); setFocusedAgentId(null); setSelectedAgentIds(new Set(agents.map(a => a.id))); }}
              className="px-1.5 py-1 transition-all"
              style={{
                backgroundColor: viewMode === 'carousel' ? '#fbbf2415' : 'transparent',
                color: viewMode === 'carousel' ? '#fbbf24' : P.dim,
                fontSize: '0.55rem',
              }}
              title="Carousel view — full-width, one agent at a time"
            >
              {'\u25A1'}
            </button>
          </div>

          <button
            onClick={() => setAutoShare(!autoShare)}
            className="px-2 py-1 rounded transition-all"
            style={{
              backgroundColor: autoShare ? '#00b4d815' : 'transparent',
              border: `1px solid ${autoShare ? '#00b4d840' : P.border}`,
              color: autoShare ? '#00b4d8' : P.dim,
              fontSize: '0.6rem',
            }}
            title={autoShare ? 'Auto-share ON: all responses are cross-pollinated each round' : 'Auto-share OFF: manually share responses between agents'}
          >
            {autoShare ? 'AUTO-SHARE ON' : 'AUTO-SHARE'}
          </button>

          {totalMemoryMessages > 0 && (
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#a78bfa10', color: '#a78bfa', border: '1px solid #a78bfa25', fontSize: '0.6rem' }}
              title={`Agents remember ${totalMemoryMessages / 2 | 0} exchanges`}
            >
              {totalMemoryMessages / 2 | 0} mem
            </span>
          )}

          {sharedCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#00b4d810', color: '#00b4d8', border: '1px solid #00b4d825', fontSize: '0.6rem' }}
            >
              {sharedCount} shared
            </span>
          )}

          {(totalMemoryMessages > 0 || sharedCount > 0) && (
            <button
              onClick={clearMemory}
              className="px-1.5 py-0.5 rounded transition-all"
              style={{ border: `1px solid ${P.border}`, color: P.dim, fontSize: '0.55rem' }}
              title="Clear all agent memory and shared context (fresh start)"
            >
              RESET
            </button>
          )}

          <span className="text-xs" style={{ color: P.dim, fontSize: '0.6rem' }}>
            {targetCount}/{agents.length} active
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {rounds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: '#fbbf2408', border: '1px solid #fbbf2420' }}
            >
              <span className="text-2xl" style={{ color: '#fbbf24' }}>{'\u26A1'}</span>
            </div>
            <h2 className="text-sm font-medium mb-2" style={{ color: P.textLight }}>Maestro Orchestra</h2>
            <p className="text-xs text-center max-w-md mb-1" style={{ color: P.text }}>
              Your AI orchestra. Broadcast to all, focus on one, or select a group.
            </p>
            <p className="text-xs text-center max-w-md mb-1" style={{ color: P.dim }}>
              Click agent to toggle | Double-click to focus | Share responses between models
            </p>
            <p className="text-xs text-center max-w-md mb-4" style={{ color: P.dim }}>
              Agents remember the conversation | AUTO-SHARE cross-pollinates every round
            </p>
            <div className="flex items-center gap-3">
              {agents.map(a => {
                const c = PROVIDER_COLORS[a.provider] || '#00d9ff';
                return (
                  <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded" style={{ backgroundColor: `${c}06`, border: `1px solid ${c}15` }}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                    <span style={{ color: c, fontSize: '0.65rem' }}>{a.name}</span>
                    <span style={{ color: P.dim, fontSize: '0.55rem' }}>{a.model}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'focused' && focusedAgentId ? (
          <FocusedView
            agent={agents.find(a => a.id === focusedAgentId)!}
            rounds={getAgentRounds(focusedAgentId)}
            allRounds={rounds}
            agentNames={agentNames}
            leadAgent={leadAgent}
            onFlag={handleFlag}
            onShareTo={handleShareTo}
            onSynthesize={synthesize}
            isSynthesizing={isSynthesizing}
          />
        ) : viewMode === 'carousel' ? (
          <CarouselView
            agents={agents}
            rounds={rounds}
            agentNames={agentNames}
            leadAgent={leadAgent}
            onFlag={handleFlag}
            onShareTo={handleShareTo}
            onSynthesize={synthesize}
            isSynthesizing={isSynthesizing}
          />
        ) : (
          <ColumnsView
            agents={agents}
            rounds={rounds}
            agentNames={agentNames}
            leadAgent={leadAgent}
            selectedAgentIds={selectedAgentIds}
            onFlag={handleFlag}
            onShareTo={handleShareTo}
            onSynthesize={synthesize}
            isSynthesizing={isSynthesizing}
          />
        )}
      </div>

      <div className="p-3 flex-shrink-0" style={{ borderTop: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); broadcast(); } }}
            placeholder={
              focusedAgentId
                ? `Message ${agents.find(a => a.id === focusedAgentId)?.name || 'agent'}...`
                : targetCount === agents.length
                  ? 'Broadcast to all agents...'
                  : `Send to ${targetCount} selected agent${targetCount > 1 ? 's' : ''}...`
            }
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
              backgroundColor: input.trim() && !isBroadcasting ? '#fbbf2418' : P.surfaceLight,
              border: `1px solid ${input.trim() && !isBroadcasting ? '#fbbf2435' : P.border}`,
              color: input.trim() && !isBroadcasting ? '#fbbf24' : P.dim,
            }}
          >
            {isBroadcasting ? 'SENDING...' : focusedAgentId ? 'SEND' : targetCount === agents.length ? 'BROADCAST' : `SEND (${targetCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}


function ColumnsView({
  agents,
  rounds,
  agentNames,
  leadAgent,
  selectedAgentIds,
  onFlag,
  onShareTo,
  onSynthesize,
  isSynthesizing,
}: {
  agents: Agent[];
  rounds: RoundEntry[];
  agentNames: string[];
  leadAgent: Agent;
  selectedAgentIds: Set<string>;
  onFlag: (roundIdx: number, agentId: string) => void;
  onShareTo: (roundIdx: number, sourceAgentId: string, targetName: string) => void;
  onSynthesize: (roundIdx: number) => void;
  isSynthesizing: boolean;
}) {
  const visibleAgents = agents.filter(a => selectedAgentIds.has(a.id));
  const columnCount = Math.min(visibleAgents.length, 3);

  return (
    <div className="p-4 space-y-4">
      {rounds.map((round, roundIdx) => {
        const roundResults = round.results.filter(r => selectedAgentIds.has(r.agentId));
        const allDone = round.results.every(r => r.status === 'done' || r.status === 'error');
        const successCount = round.results.filter(r => r.status === 'done').length;

        return (
          <div key={round.id} className="space-y-3">
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}
            >
              <div className="w-1 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: '#fbbf24' }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium" style={{ color: P.textLight }}>ROUND {roundIdx + 1}</span>
                  <span style={{ color: P.dim, fontSize: '0.6rem' }}>
                    {new Date(round.timestamp).toLocaleTimeString()}
                  </span>
                  <span style={{ color: P.dim, fontSize: '0.6rem' }}>
                    {round.results.length} agent{round.results.length > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs truncate" style={{ color: P.text }}>{round.prompt}</p>
              </div>
            </div>

            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
              }}
            >
              {roundResults.map(result => {
                const c = PROVIDER_COLORS[result.provider] || '#00d9ff';
                const isLead = result.agentId === leadAgent?.id;

                return (
                  <div key={result.agentId} className="flex flex-col min-w-0">
                    <div
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg"
                      style={{ backgroundColor: `${c}06`, borderBottom: `2px solid ${c}30` }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: result.status === 'done' ? c : result.status === 'error' ? '#ff0080' : P.dim,
                          animation: result.status === 'streaming' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                          boxShadow: result.status === 'streaming' ? `0 0 6px ${c}` : 'none',
                        }}
                      />
                      <span className="text-xs font-medium truncate" style={{ color: c }}>{result.agentName}</span>
                      {isLead && <span style={{ color: '#fbbf24', fontSize: '0.5rem' }}>LEAD</span>}
                      <span className="ml-auto flex-shrink-0" style={{ color: P.dim, fontSize: '0.55rem' }}>
                        {result.status === 'streaming' ? 'thinking...' : result.status === 'error' ? 'FAILED' : result.tokens > 0 ? `${result.tokens} tok` : ''}
                      </span>
                    </div>
                    <CircuitResponseCard
                      result={result}
                      onFlag={(id) => onFlag(roundIdx, id)}
                      onShareTo={(id, target) => onShareTo(roundIdx, id, target)}
                      allAgentNames={agentNames}
                      isLead={isLead}
                      compact
                    />
                  </div>
                );
              })}
            </div>

            {allDone && successCount >= 2 && !round.synthesis && (
              <button
                onClick={() => onSynthesize(roundIdx)}
                disabled={isSynthesizing}
                className="w-full py-2 text-xs font-medium rounded-lg transition-all"
                style={{
                  backgroundColor: '#fbbf240a',
                  border: '1px solid #fbbf2425',
                  color: '#fbbf24',
                }}
              >
                {isSynthesizing ? 'SYNTHESIZING...' : `SYNTHESIZE WITH ${leadAgent?.name || 'LEAD'}`}
              </button>
            )}

            {round.synthesis && (
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid #fbbf2430', backgroundColor: '#fbbf2406' }}
              >
                <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: '1px solid #fbbf2420' }}>
                  <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: '#fbbf24' }} />
                  <span className="text-xs font-medium" style={{ color: '#fbbf24' }}>SYNTHESIS</span>
                  <span style={{ color: P.dim, fontSize: '0.55rem' }}>{leadAgent?.name}</span>
                </div>
                <CircuitResponseCard
                  result={round.synthesis}
                  onFlag={() => {}}
                  onShareTo={() => {}}
                  allAgentNames={[]}
                  isLead={true}
                  compact
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


function FocusedView({
  agent,
  rounds,
  allRounds,
  agentNames,
  leadAgent,
  onFlag,
  onShareTo,
  onSynthesize,
  isSynthesizing,
}: {
  agent: Agent;
  rounds: Array<RoundEntry & { result: CircuitResult }>;
  allRounds: RoundEntry[];
  agentNames: string[];
  leadAgent: Agent;
  onFlag: (roundIdx: number, agentId: string) => void;
  onShareTo: (roundIdx: number, sourceAgentId: string, targetName: string) => void;
  onSynthesize: (roundIdx: number) => void;
  isSynthesizing: boolean;
}) {
  const c = PROVIDER_COLORS[agent.provider] || '#00d9ff';
  const isLead = agent.id === leadAgent?.id;

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: `2px solid ${c}30`, backgroundColor: `${c}04` }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${c}15`, border: `1px solid ${c}30` }}
        >
          <span className="text-sm font-bold" style={{ color: c }}>{agent.name}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: c }}>{agent.name}</span>
            {isLead && (
              <span
                className="px-1.5 py-0.5 rounded"
                style={{ backgroundColor: '#fbbf2412', color: '#fbbf24', border: '1px solid #fbbf2425', fontSize: '0.55rem' }}
              >
                LEAD
              </span>
            )}
          </div>
          <span style={{ color: P.dim, fontSize: '0.6rem' }}>{agent.model}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span style={{ color: P.dim, fontSize: '0.6rem' }}>
            {rounds.length} round{rounds.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {rounds.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-xs" style={{ color: P.dim }}>No messages yet with {agent.name}</p>
          </div>
        )}

        {rounds.map((round) => {
          const roundIdx = allRounds.findIndex(r => r.id === round.id);

          return (
            <div key={round.id} className="space-y-2">
              <div
                className="px-3 py-2 rounded-lg"
                style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}
              >
                <span style={{ color: P.dim, fontSize: '0.55rem' }}>
                  {new Date(round.timestamp).toLocaleTimeString()}
                </span>
                <p className="text-xs mt-0.5" style={{ color: P.textLight, whiteSpace: 'pre-wrap' }}>{round.prompt}</p>
              </div>

              <CircuitResponseCard
                result={round.result}
                onFlag={(id) => onFlag(roundIdx, id)}
                onShareTo={(id, target) => onShareTo(roundIdx, id, target)}
                allAgentNames={agentNames}
                isLead={isLead}
                compact
              />

              {round.synthesis && (
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ border: '1px solid #fbbf2425', backgroundColor: '#fbbf2404' }}
                >
                  <div className="flex items-center gap-2 px-3 py-1" style={{ borderBottom: '1px solid #fbbf2415' }}>
                    <span style={{ color: '#fbbf24', fontSize: '0.55rem', fontWeight: 600 }}>SYNTHESIS</span>
                  </div>
                  <CircuitResponseCard
                    result={round.synthesis}
                    onFlag={() => {}}
                    onShareTo={() => {}}
                    allAgentNames={[]}
                    isLead={true}
                    compact
                  />
                </div>
              )}

              {!round.synthesis && round.results.filter(r => r.status === 'done').length >= 2 && (
                <button
                  onClick={() => onSynthesize(roundIdx)}
                  disabled={isSynthesizing}
                  className="w-full py-1.5 text-xs rounded transition-all"
                  style={{
                    backgroundColor: '#fbbf2408',
                    border: '1px solid #fbbf2420',
                    color: '#fbbf24',
                    fontSize: '0.6rem',
                  }}
                >
                  {isSynthesizing ? 'SYNTHESIZING...' : 'SYNTHESIZE'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function CarouselView({
  agents,
  rounds,
  agentNames,
  leadAgent,
  onFlag,
  onShareTo,
  onSynthesize,
  isSynthesizing,
}: {
  agents: Agent[];
  rounds: RoundEntry[];
  agentNames: string[];
  leadAgent: Agent;
  onFlag: (roundIdx: number, agentId: string) => void;
  onShareTo: (roundIdx: number, sourceAgentId: string, targetName: string) => void;
  onSynthesize: (roundIdx: number) => void;
  isSynthesizing: boolean;
}) {
  const [activeAgentIdx, setActiveAgentIdx] = useState(0);
  const [activeRoundIdx, setActiveRoundIdx] = useState(rounds.length - 1);
  const [copiedCarousel, setCopiedCarousel] = useState(false);

  useEffect(() => {
    setActiveRoundIdx(rounds.length - 1);
  }, [rounds.length]);

  const activeAgent = agents[activeAgentIdx];
  const round = rounds[activeRoundIdx];

  const prevAgent = () => setActiveAgentIdx(i => (i - 1 + agents.length) % agents.length);
  const nextAgent = () => setActiveAgentIdx(i => (i + 1) % agents.length);

  const handleDownload = (content: string, agentName: string, roundNum: number) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maestro-${agentName.toLowerCase()}-round${roundNum + 1}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCarousel = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCarousel(true);
    setTimeout(() => setCopiedCarousel(false), 1500);
  };

  if (!round || !activeAgent) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs" style={{ color: P.dim }}>No rounds yet</p>
      </div>
    );
  }

  const result = round.results.find(r => r.agentId === activeAgent.id);
  const allDone = round.results.every(r => r.status === 'done' || r.status === 'error');
  const successCount = round.results.filter(r => r.status === 'done').length;
  const isLead = activeAgent.id === leadAgent?.id;
  const otherAgents = agentNames.filter(n => n !== activeAgent.name);

  return (
    <div className="flex flex-col h-full">
      {/* Round selector */}
      {rounds.length > 1 && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}
        >
          {rounds.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setActiveRoundIdx(i)}
              className="px-2 py-0.5 rounded transition-all"
              style={{
                backgroundColor: i === activeRoundIdx ? '#fbbf2412' : 'transparent',
                border: `1px solid ${i === activeRoundIdx ? '#fbbf2435' : P.border}`,
                color: i === activeRoundIdx ? '#fbbf24' : P.dim,
                fontSize: '0.6rem',
              }}
            >
              R{i + 1}
            </button>
          ))}
          <span className="text-xs truncate flex-1" style={{ color: P.dim, fontSize: '0.55rem' }}>
            {round.prompt.slice(0, 80)}{round.prompt.length > 80 ? '...' : ''}
          </span>
        </div>
      )}

      {/* Agent tabs with arrows */}
      <div
        className="flex items-center gap-1 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${P.border}` }}
      >
        <button
          onClick={prevAgent}
          className="px-2 py-1 rounded transition-all flex-shrink-0"
          style={{ color: P.dim, border: `1px solid ${P.border}`, fontSize: '0.7rem' }}
        >
          {'\u2190'}
        </button>

        <div className="flex items-center gap-1 flex-1 justify-center">
          {agents.map((a, i) => {
            const c = PROVIDER_COLORS[a.provider] || '#00d9ff';
            const isActive = i === activeAgentIdx;
            const agentResult = round.results.find(r => r.agentId === a.id);
            const status = agentResult?.status;

            return (
              <button
                key={a.id}
                onClick={() => setActiveAgentIdx(i)}
                className="flex items-center gap-1.5 px-3 py-1 rounded transition-all"
                style={{
                  backgroundColor: isActive ? `${c}15` : 'transparent',
                  border: `1px solid ${isActive ? `${c}50` : P.border}`,
                  color: isActive ? c : P.dim,
                  fontSize: '0.65rem',
                }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: status === 'done' ? c : status === 'error' ? '#ff0080' : P.dim,
                    animation: status === 'streaming' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                    boxShadow: isActive ? `0 0 6px ${c}` : 'none',
                  }}
                />
                {a.name}
                {a.id === leadAgent?.id && <span style={{ color: '#fbbf24', fontSize: '0.5rem' }}>L</span>}
                {agentResult?.tokens ? <span style={{ color: P.dim, fontSize: '0.5rem' }}>{agentResult.tokens}</span> : null}
              </button>
            );
          })}
        </div>

        <button
          onClick={nextAgent}
          className="px-2 py-1 rounded transition-all flex-shrink-0"
          style={{ color: P.dim, border: `1px solid ${P.border}`, fontSize: '0.7rem' }}
        >
          {'\u2192'}
        </button>
      </div>

      {/* Full-width response content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Prompt */}
        <div
          className="px-4 py-2.5 rounded-lg mb-3"
          style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium" style={{ color: '#fbbf24' }}>ROUND {activeRoundIdx + 1}</span>
            <span style={{ color: P.dim, fontSize: '0.55rem' }}>
              {new Date(round.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-xs" style={{ color: P.textLight, whiteSpace: 'pre-wrap' }}>{round.prompt}</p>
        </div>

        {/* Response */}
        {result ? (
          <div
            className="rounded-lg overflow-hidden"
            style={{
              backgroundColor: P.surface,
              border: `1px solid ${result.flagged ? `${PROVIDER_COLORS[result.provider]}50` : isLead ? '#fbbf2430' : P.border}`,
              boxShadow: result.flagged ? `0 0 12px ${PROVIDER_COLORS[result.provider]}15` : 'none',
            }}
          >
            {/* Agent header */}
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: `${PROVIDER_COLORS[result.provider] || '#00d9ff'}06` }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: result.status === 'done' ? (PROVIDER_COLORS[result.provider] || '#00d9ff') : result.status === 'error' ? '#ff0080' : P.dim,
                    boxShadow: result.status === 'streaming' ? `0 0 8px ${PROVIDER_COLORS[result.provider]}` : 'none',
                  }}
                />
                <span className="text-sm font-medium" style={{ color: PROVIDER_COLORS[result.provider] || '#00d9ff' }}>{result.agentName}</span>
                <span className="text-xs" style={{ color: P.dim }}>{result.model}</span>
                {isLead && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fbbf2412', color: '#fbbf24', border: '1px solid #fbbf2425', fontSize: '0.6rem' }}>
                    LEAD
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {result.status === 'done' && result.tokens > 0 && (
                  <span className="text-xs" style={{ color: P.dim }}>{result.tokens} tokens</span>
                )}
                {result.status === 'streaming' && (
                  <span className="text-xs animate-pulse" style={{ color: PROVIDER_COLORS[result.provider] }}>thinking...</span>
                )}
              </div>
            </div>

            {/* Response body — compact layout, no height limit, actions handled by carousel bar */}
            <CircuitResponseCard
              result={result}
              onFlag={(id) => onFlag(activeRoundIdx, id)}
              onShareTo={(id, target) => onShareTo(activeRoundIdx, id, target)}
              allAgentNames={agentNames}
              isLead={isLead}
              compact
              noHeightLimit
              hideActions
            />

            {/* Carousel action bar */}
            {result.status === 'done' && (
              <div
                className="flex items-center gap-2 px-4 py-2.5 flex-wrap"
                style={{ borderTop: `1px solid ${P.border}`, backgroundColor: P.surfaceLight }}
              >
                <button
                  onClick={() => onFlag(activeRoundIdx, result.agentId)}
                  className="px-3 py-1.5 rounded transition-all"
                  style={{
                    backgroundColor: result.flagged ? `${PROVIDER_COLORS[result.provider]}15` : 'transparent',
                    border: `1px solid ${result.flagged ? `${PROVIDER_COLORS[result.provider]}50` : P.border}`,
                    color: result.flagged ? (PROVIDER_COLORS[result.provider] || '#00d9ff') : P.dim,
                    fontSize: '0.65rem',
                  }}
                >
                  {result.flagged ? 'FLAGGED' : 'FLAG'}
                </button>

                {otherAgents.map(name => (
                  <button
                    key={name}
                    onClick={() => onShareTo(activeRoundIdx, result.agentId, name)}
                    className="px-3 py-1.5 rounded transition-all"
                    style={{ border: `1px solid ${P.border}`, color: P.dim, fontSize: '0.65rem' }}
                  >
                    {'\u2192'} {name}
                  </button>
                ))}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => handleCopyCarousel(result.content)}
                    className="px-3 py-1.5 rounded transition-all"
                    style={{
                      border: `1px solid ${copiedCarousel ? `${PROVIDER_COLORS[result.provider]}40` : P.border}`,
                      color: copiedCarousel ? PROVIDER_COLORS[result.provider] : P.dim,
                      fontSize: '0.65rem',
                    }}
                  >
                    {copiedCarousel ? 'COPIED' : 'COPY'}
                  </button>
                  <button
                    onClick={() => handleDownload(result.content, result.agentName, activeRoundIdx)}
                    className="px-3 py-1.5 rounded transition-all"
                    style={{ border: '1px solid #00d9ff30', color: '#00d9ff', fontSize: '0.65rem', backgroundColor: '#00d9ff08' }}
                  >
                    DOWNLOAD .MD
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-xs" style={{ color: P.dim }}>
              {activeAgent.name} was not part of this round
            </p>
          </div>
        )}

        {/* Synthesis */}
        {round.synthesis && (
          <div
            className="rounded-lg overflow-hidden mt-3"
            style={{ border: '1px solid #fbbf2430', backgroundColor: '#fbbf2406' }}
          >
            <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid #fbbf2420' }}>
              <div className="w-1 h-4 rounded-sm" style={{ backgroundColor: '#fbbf24' }} />
              <span className="text-xs font-medium" style={{ color: '#fbbf24' }}>SYNTHESIS</span>
              <span style={{ color: P.dim, fontSize: '0.6rem' }}>{leadAgent?.name} {leadAgent?.model}</span>
              <button
                onClick={() => handleDownload(round.synthesis!.content, 'synthesis', activeRoundIdx)}
                className="ml-auto px-2 py-0.5 rounded transition-all"
                style={{ border: '1px solid #fbbf2425', color: '#fbbf24', fontSize: '0.6rem' }}
              >
                DOWNLOAD .MD
              </button>
            </div>
            <CircuitResponseCard
              result={round.synthesis}
              onFlag={() => {}}
              onShareTo={() => {}}
              allAgentNames={[]}
              isLead={true}
              compact
              noHeightLimit
              hideActions
            />
          </div>
        )}

        {allDone && successCount >= 2 && !round.synthesis && (
          <button
            onClick={() => onSynthesize(activeRoundIdx)}
            disabled={isSynthesizing}
            className="w-full py-3 text-xs font-medium rounded-lg transition-all mt-3"
            style={{
              backgroundColor: '#fbbf240a',
              border: '1px solid #fbbf2425',
              color: '#fbbf24',
            }}
          >
            {isSynthesizing ? 'SYNTHESIZING...' : `SYNTHESIZE WITH ${leadAgent?.name || 'LEAD'}`}
          </button>
        )}
      </div>
    </div>
  );
}
