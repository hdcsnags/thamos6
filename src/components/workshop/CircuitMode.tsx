import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import CircuitResponseCard, { type CircuitResult, AGENT_COLORS, G } from './CircuitResponse';
import { renderCircuitMarkdown } from './MarkdownRenderer';

interface Agent {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'openrouter';
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

// ═══════════════════════════════════════════════════════
// MAIN CIRCUIT MODE COMPONENT
// ═══════════════════════════════════════════════════════

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

    const promises = targetAgents.map(async (agent) => {
      const agentShared = sharedContext[agent.id] || [];
      const extraContext = agentShared.length > 0
        ? `\n\nShared context from other AI in this circuit:\n${agentShared.join('\n\n---\n\n')}`
        : '';

      const systemPrompt = agent.system_prompt + extraContext;
      const history = agentMemory[agent.id] || [];
      const messages = [...history, { role: 'user', content: prompt }];

      try {
        const result = await callAgent(agent, messages, systemPrompt, token);
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
  const totalTokens = rounds.reduce((acc, r) => acc + r.results.reduce((a, res) => a + (res.tokens || 0), 0) + (r.synthesis?.tokens || 0), 0);
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

  // ─── RENDER ───────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: G.void, fontFamily: 'Inter, -apple-system, sans-serif' }}>

      {/* ════════ HEADER / TOOLBAR ════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          flexShrink: 0,
          borderBottom: `1px solid ${G.border}`,
          background: G.glassHeavy,
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
        }}
      >
        {/* Left: Logo + Round tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          {/* Maestro branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(100,100,120,0.3), rgba(30,30,40,0.8))',
              border: `1px solid ${G.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
            }}>
              <span style={{ color: '#888' }}>{'\u266B'}</span>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: G.white, letterSpacing: '-0.01em' }}>Maestro</div>
              <div style={{ fontSize: '8px', color: G.dim, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>CIRCUIT</div>
            </div>
          </div>

          <div style={{ width: '1px', height: '20px', background: G.border }} />

          {/* Agent dot nav */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            padding: '3px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid rgba(255,255,255,0.04)`,
          }}>
            <button
              onClick={selectAll}
              style={{
                padding: '3px 8px',
                borderRadius: '7px',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: isAllSelected && !focusedAgentId ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: 'none',
                color: isAllSelected && !focusedAgentId ? G.white : '#555',
              }}
            >
              ALL
            </button>
            {agents.map(a => {
              const c = AGENT_COLORS[a.provider] || '#4285F4';
              const isSelected = selectedAgentIds.has(a.id);
              const isFocused = focusedAgentId === a.id;
              const isLead = a.id === leadAgent?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => toggleAgent(a.id)}
                  onDoubleClick={() => focusAgent(a.id)}
                  title={`Click: toggle | Double-click: focus | Right-click: set lead`}
                  onContextMenu={(e) => { e.preventDefault(); onSetLead(a.id); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 10px',
                    borderRadius: '7px',
                    fontSize: '10px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: isFocused ? `${c}18` : isSelected ? `${c}08` : 'transparent',
                    border: 'none',
                    color: isSelected ? c : '#555',
                  }}
                >
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isSelected ? c : '#333',
                    boxShadow: isFocused ? `0 0 8px ${c}` : isSelected ? `0 0 4px ${c}60` : 'none',
                    transition: 'all 0.3s',
                  }} />
                  {a.name}
                  {isLead && <span style={{ color: G.synth, fontSize: '8px', fontWeight: 700 }}>L</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: View toggle + Auto-share + Memory */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* View mode toggle */}
          <div style={{
            display: 'flex',
            borderRadius: '8px',
            overflow: 'hidden',
            border: `1px solid rgba(255,255,255,0.06)`,
          }}>
            <button
              onClick={() => { setViewMode('columns'); setFocusedAgentId(null); setSelectedAgentIds(new Set(agents.map(a => a.id))); }}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: viewMode === 'columns' ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: viewMode === 'columns' ? G.white : '#555',
                border: 'none',
                borderRight: `1px solid rgba(255,255,255,0.06)`,
              }}
              title="Column view"
            >
              {'\u2261'}
            </button>
            <button
              onClick={() => { setViewMode('carousel'); setFocusedAgentId(null); setSelectedAgentIds(new Set(agents.map(a => a.id))); }}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: viewMode === 'carousel' ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: viewMode === 'carousel' ? G.white : '#555',
                border: 'none',
              }}
              title="Spatial carousel"
            >
              {'\u25A1'}
            </button>
          </div>

          {/* Auto-share toggle */}
          <button
            onClick={() => setAutoShare(!autoShare)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '10px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: autoShare ? 'rgba(80,200,120,0.08)' : 'transparent',
              border: `1px solid ${autoShare ? 'rgba(80,200,120,0.15)' : 'rgba(255,255,255,0.06)'}`,
              color: autoShare ? '#50c878' : '#555',
            }}
          >
            <div style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: autoShare ? '#50c878' : '#333',
              boxShadow: autoShare ? '0 0 6px #50c878' : 'none',
            }} />
            {autoShare ? 'AUTO-SHARE' : 'SHARE'}
          </button>

          {/* Memory badge */}
          {totalMemoryMessages > 0 && (
            <span style={{
              padding: '3px 8px',
              borderRadius: '7px',
              fontSize: '10px',
              fontWeight: 500,
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.15)',
              color: '#a78bfa',
            }}>
              {totalMemoryMessages / 2 | 0} mem
            </span>
          )}

          {sharedCount > 0 && (
            <span style={{
              padding: '3px 8px',
              borderRadius: '7px',
              fontSize: '10px',
              fontWeight: 500,
              background: 'rgba(66,133,244,0.08)',
              border: '1px solid rgba(66,133,244,0.15)',
              color: '#4285F4',
            }}>
              {sharedCount} shared
            </span>
          )}

          {(totalMemoryMessages > 0 || sharedCount > 0) && (
            <button
              onClick={clearMemory}
              style={{
                padding: '3px 8px',
                borderRadius: '7px',
                fontSize: '9px',
                fontWeight: 500,
                cursor: 'pointer',
                background: 'transparent',
                border: `1px solid rgba(255,255,255,0.06)`,
                color: '#555',
                transition: 'all 0.2s',
              }}
            >
              RESET
            </button>
          )}
        </div>
      </div>

      {/* ════════ CONTENT AREA ════════ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0" style={{ position: 'relative' }}>
        {rounds.length === 0 ? (
          /* ═══ EMPTY STATE — The Void ═══ */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '32px',
            position: 'relative',
          }}>
            {/* Ambient glow */}
            <div style={{
              position: 'absolute',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '400px',
              height: '300px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(245,176,65,0.04) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '24px',
            }}>
              {agents.map((a, i) => {
                const c = AGENT_COLORS[a.provider] || '#4285F4';
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: 0,
                      animation: `fadeUp 0.5s ease ${i * 0.1}s forwards`,
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '14px',
                      background: `${c}08`,
                      border: `1px solid ${c}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <div style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: c,
                        boxShadow: `0 0 12px ${c}60`,
                      }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 500, color: c }}>{a.name}</div>
                      <div style={{ fontSize: '9px', color: G.dim, fontFamily: 'JetBrains Mono, monospace' }}>{a.model}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <h2 style={{ fontSize: '15px', fontWeight: 600, color: G.white, marginBottom: '6px' }}>Direct the orchestra</h2>
            <p style={{ fontSize: '12px', color: '#555', textAlign: 'center', maxWidth: '420px', lineHeight: 1.5 }}>
              Broadcast to all agents, focus on one, or select a group.
              Agents remember the conversation. Auto-share cross-pollinates every round.
            </p>

            <div style={{ marginTop: '16px', display: 'flex', gap: '16px', fontSize: '10px', color: '#333' }}>
              <span>Click to toggle</span>
              <span style={{ color: 'rgba(255,255,255,0.06)' }}>|</span>
              <span>Double-click to focus</span>
              <span style={{ color: 'rgba(255,255,255,0.06)' }}>|</span>
              <span>Right-click to set lead</span>
            </div>

            {/* CSS for fadeUp animation */}
            <style>{`
              @keyframes fadeUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
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
          <SpatialCarousel
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

      {/* ════════ COMMAND CENTER (INPUT) ════════ */}
      <div style={{
        padding: '10px 16px',
        flexShrink: 0,
        borderTop: `1px solid ${G.border}`,
        background: G.glassHeavy,
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'end',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); broadcast(); } }}
            placeholder={
              focusedAgentId
                ? `Message ${agents.find(a => a.id === focusedAgentId)?.name || 'agent'}...`
                : targetCount === agents.length
                  ? 'Direct the orchestra...'
                  : `Send to ${targetCount} selected agent${targetCount > 1 ? 's' : ''}...`
            }
            disabled={isBroadcasting}
            rows={1}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '13px',
              borderRadius: '16px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'Inter, sans-serif',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${G.border}`,
              color: G.white,
              transition: 'all 0.2s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.15)';
              e.target.style.boxShadow = '0 0 20px rgba(255,255,255,0.03)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = G.border;
              e.target.style.boxShadow = 'none';
            }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Synthesize button — only show if we have rounds with results */}
            {rounds.length > 0 && (() => {
              const lastRound = rounds[rounds.length - 1];
              const allDone = lastRound.results.every(r => r.status === 'done' || r.status === 'error');
              const successCount = lastRound.results.filter(r => r.status === 'done').length;
              if (allDone && successCount >= 2 && !lastRound.synthesis) {
                return (
                  <button
                    onClick={() => synthesize(rounds.length - 1)}
                    disabled={isSynthesizing}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: isSynthesizing ? 'default' : 'pointer',
                      background: `linear-gradient(135deg, ${G.synth}, #e6a030)`,
                      color: '#000',
                      border: 'none',
                      boxShadow: `0 0 16px ${G.synth}30`,
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {'\u2697'} {isSynthesizing ? 'Synthesizing...' : 'Synthesize'}
                  </button>
                );
              }
              return null;
            })()}
            <button
              onClick={broadcast}
              disabled={!input.trim() || isBroadcasting}
              style={{
                padding: '10px 16px',
                borderRadius: '14px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: !input.trim() || isBroadcasting ? 'default' : 'pointer',
                background: input.trim() && !isBroadcasting ? '#fff' : 'rgba(255,255,255,0.05)',
                color: input.trim() && !isBroadcasting ? '#000' : '#444',
                border: 'none',
                boxShadow: input.trim() && !isBroadcasting ? '0 0 20px rgba(255,255,255,0.15)' : 'none',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {isBroadcasting ? 'Sending...' : focusedAgentId ? 'Send' : targetCount === agents.length ? 'Broadcast' : `Send (${targetCount})`}
            </button>
          </div>
        </div>
      </div>

      {/* ════════ STATUS BAR ════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '24px',
        flexShrink: 0,
        background: 'rgba(5,5,8,0.8)',
        borderTop: `1px solid rgba(255,255,255,0.03)`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '9px',
        letterSpacing: '0.04em',
        color: '#333',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {agents.map(a => {
            const c = AGENT_COLORS[a.provider] || '#4285F4';
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: c }} />
                <span>{a.model}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: autoShare ? '#50c878' : '#333' }} />
            {autoShare ? 'AUTO-SHARE ON' : 'SHARE OFF'}
          </span>
          {totalMemoryMessages > 0 && <span>MEM {totalMemoryMessages / 2 | 0}</span>}
          {sharedCount > 0 && <span>SHARED {sharedCount}</span>}
          {totalTokens > 0 && <span>TOKENS {totalTokens.toLocaleString()}</span>}
          <span style={{ color: '#222' }}>R{rounds.length || 0}</span>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// COLUMNS VIEW
// ═══════════════════════════════════════════════════════

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
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {rounds.map((round, roundIdx) => {
        const roundResults = round.results.filter(r => selectedAgentIds.has(r.agentId));
        const allDone = round.results.every(r => r.status === 'done' || r.status === 'error');
        const successCount = round.results.filter(r => r.status === 'done').length;

        return (
          <div key={round.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Round header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '12px',
              background: G.glassHeavy,
              border: `1px solid ${G.border}`,
            }}>
              <div style={{ width: '3px', height: '18px', borderRadius: '2px', background: G.synth, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: G.white }}>ROUND {roundIdx + 1}</span>
                  <span style={{ fontSize: '10px', color: G.dim, fontFamily: 'JetBrains Mono, monospace' }}>
                    {new Date(round.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: G.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{round.prompt}</p>
              </div>
            </div>

            {/* Agent columns */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
              gap: '10px',
            }}>
              {roundResults.map(result => {
                const c = AGENT_COLORS[result.provider] || '#4285F4';
                const isLead = result.agentId === leadAgent?.id;
                return (
                  <div key={result.agentId} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    {/* Agent label bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '10px 10px 0 0',
                      background: `${c}06`,
                      borderBottom: `2px solid ${c}25`,
                      position: 'relative',
                    }}>
                      {/* Color stripe */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: '15%',
                        right: '15%',
                        height: '1px',
                        background: `linear-gradient(90deg, transparent, ${c}60, transparent)`,
                      }} />
                      <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: result.status === 'done' ? c : result.status === 'error' ? '#ff4466' : G.dim,
                        boxShadow: result.status === 'streaming' ? `0 0 8px ${c}` : `0 0 4px ${c}40`,
                      }} />
                      <span style={{ fontSize: '11px', fontWeight: 500, color: c }}>{result.agentName}</span>
                      {isLead && <span style={{ color: G.synth, fontSize: '8px', fontWeight: 700 }}>LEAD</span>}
                      <span style={{ marginLeft: 'auto', fontSize: '9px', color: G.dim, fontFamily: 'JetBrains Mono, monospace' }}>
                        {result.status === 'streaming' ? 'streaming...' : result.status === 'error' ? 'FAILED' : result.tokens > 0 ? `${result.tokens} tok` : ''}
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

            {/* Synthesize button */}
            {allDone && successCount >= 2 && !round.synthesis && (
              <button
                onClick={() => onSynthesize(roundIdx)}
                disabled={isSynthesizing}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: isSynthesizing ? 'default' : 'pointer',
                  background: `${G.synth}08`,
                  border: `1px solid ${G.synth}20`,
                  color: G.synth,
                  transition: 'all 0.2s',
                }}
              >
                {isSynthesizing ? 'SYNTHESIZING...' : `SYNTHESIZE WITH ${leadAgent?.name || 'LEAD'}`}
              </button>
            )}

            {/* Synthesis result */}
            {round.synthesis && (
              <div style={{
                borderRadius: '12px',
                overflow: 'hidden',
                border: `1px solid ${G.synth}20`,
                background: `${G.synth}04`,
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderBottom: `1px solid ${G.synth}15`,
                }}>
                  <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: G.synth }} />
                  <span style={{ fontSize: '10px', fontWeight: 600, color: G.synth, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em' }}>SYNTHESIS</span>
                  <span style={{ fontSize: '10px', color: G.dim }}>{leadAgent?.name}</span>
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


// ═══════════════════════════════════════════════════════
// FOCUSED VIEW
// ═══════════════════════════════════════════════════════

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
  const c = AGENT_COLORS[agent.provider] || '#4285F4';
  const isLead = agent.id === leadAgent?.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Agent header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 20px',
        flexShrink: 0,
        borderBottom: `2px solid ${c}20`,
        background: `${c}04`,
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${c}, transparent)`,
          opacity: 0.3,
        }} />
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '10px',
          background: `${c}12`,
          border: `1px solid ${c}25`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c, boxShadow: `0 0 10px ${c}` }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: c }}>{agent.name}</span>
            {isLead && (
              <span style={{
                fontSize: '9px',
                fontWeight: 700,
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
          <span style={{ fontSize: '10px', color: G.dim, fontFamily: 'JetBrains Mono, monospace' }}>{agent.model}</span>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: G.dim }}>
          {rounds.length} round{rounds.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {rounds.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <p style={{ fontSize: '12px', color: G.dim }}>No messages yet with {agent.name}</p>
          </div>
        )}
        {rounds.map((round) => {
          const roundIdx = allRounds.findIndex(r => r.id === round.id);
          return (
            <div key={round.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: '12px',
                background: G.glassHeavy,
                border: `1px solid ${G.border}`,
              }}>
                <span style={{ fontSize: '9px', color: G.dim, fontFamily: 'JetBrains Mono, monospace' }}>
                  {new Date(round.timestamp).toLocaleTimeString()}
                </span>
                <p style={{ fontSize: '12px', marginTop: '4px', color: G.textLight, whiteSpace: 'pre-wrap' }}>{round.prompt}</p>
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
                <div style={{
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: `1px solid ${G.synth}20`,
                  background: `${G.synth}04`,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 14px',
                    borderBottom: `1px solid ${G.synth}12`,
                  }}>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: G.synth, fontFamily: 'JetBrains Mono, monospace' }}>SYNTHESIS</span>
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
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: isSynthesizing ? 'default' : 'pointer',
                    background: `${G.synth}08`,
                    border: `1px solid ${G.synth}20`,
                    color: G.synth,
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


// ═══════════════════════════════════════════════════════
// SPATIAL CAROUSEL — 3D card stage with focus mode
// ═══════════════════════════════════════════════════════

function SpatialCarousel({
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
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeRoundIdx, setActiveRoundIdx] = useState(rounds.length - 1);
  const [focusMode, setFocusMode] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveRoundIdx(rounds.length - 1);
  }, [rounds.length]);

  // Include synthesis as a card if it exists
  const round = rounds[activeRoundIdx];
  const hasSynthesis = round?.synthesis?.status === 'done';

  // Cards = agents + synthesis (if exists)
  const totalCards = agents.length + (hasSynthesis ? 1 : 0);

  const goTo = (idx: number) => {
    if (!focusMode && idx >= 0 && idx < totalCards) setActiveIdx(idx);
  };
  const prev = () => goTo(activeIdx - 1);
  const next = () => goTo(activeIdx + 1);

  const toggleFocus = () => {
    setFocusMode(f => !f);
  };

  // Keyboard + touch
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape' && focusMode) setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
        if (dx < 0) next();
        else prev();
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd); };
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCard(true);
    setTimeout(() => setCopiedCard(false), 1500);
  };

  const handleDownload = (content: string, name: string, roundNum: number) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maestro-${name.toLowerCase()}-round${roundNum + 1}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!round) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ fontSize: '12px', color: G.dim }}>No rounds yet</p>
      </div>
    );
  }

  const allDone = round.results.every(r => r.status === 'done' || r.status === 'error');
  const successCount = round.results.filter(r => r.status === 'done').length;

  // Get card position styles
  const getCardStyle = (idx: number): React.CSSProperties => {
    const diff = idx - activeIdx;
    const base: React.CSSProperties = {
      position: 'absolute',
      width: '680px',
      maxWidth: '85%',
      borderRadius: '20px',
      transition: 'all 0.7s cubic-bezier(0.25, 1, 0.3, 1)',
      willChange: 'transform, opacity, filter',
      cursor: diff === 0 ? 'default' : 'pointer',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: focusMode && diff === 0 ? '85%' : '70%',
    };

    if (focusMode) {
      if (diff === 0) {
        return {
          ...base,
          transform: 'translate3d(0, -10px, 80px) scale(1.02)',
          opacity: 1,
          zIndex: 50,
          filter: 'none',
          background: G.glassHeavy,
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: `1px solid rgba(255,255,255,0.12)`,
          boxShadow: '0 50px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)',
        };
      }
      return {
        ...base,
        transform: 'translate3d(0, 80px, -400px) scale(0.7)',
        opacity: 0,
        zIndex: 1,
        filter: 'blur(20px)',
        pointerEvents: 'none',
        background: G.glassHeavy,
        border: `1px solid ${G.border}`,
      };
    }

    if (diff === 0) {
      return {
        ...base,
        transform: 'translate3d(0, 0, 0) scale(1)',
        opacity: 1,
        zIndex: 30,
        background: G.glassHeavy,
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid rgba(255,255,255,0.1)`,
        boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
      };
    } else if (diff === -1) {
      return {
        ...base,
        transform: 'translate3d(-48%, 0, -180px) scale(0.82)',
        opacity: 0.4,
        zIndex: 20,
        filter: 'blur(3px)',
        background: G.glassHeavy,
        border: `1px solid ${G.border}`,
      };
    } else if (diff === 1) {
      return {
        ...base,
        transform: 'translate3d(48%, 0, -180px) scale(0.82)',
        opacity: 0.4,
        zIndex: 20,
        filter: 'blur(3px)',
        background: G.glassHeavy,
        border: `1px solid ${G.border}`,
      };
    }
    return {
      ...base,
      transform: `translate3d(${diff < 0 ? '-90%' : '90%'}, 0, -350px) scale(0.65)`,
      opacity: 0,
      zIndex: 10,
      pointerEvents: 'none',
      background: G.glassHeavy,
      border: `1px solid ${G.border}`,
    };
  };

  // Render a card for an agent
  const renderAgentCard = (agent: Agent, idx: number) => {
    const c = AGENT_COLORS[agent.provider] || '#4285F4';
    const result = round.results.find(r => r.agentId === agent.id);
    const isLead = agent.id === leadAgent?.id;
    const otherAgents = agentNames.filter(n => n !== agent.name);

    return (
      <div
        key={agent.id}
        style={getCardStyle(idx)}
        onClick={() => idx !== activeIdx && goTo(idx)}
        onDoubleClick={() => idx === activeIdx && toggleFocus()}
      >
        {/* Card glow */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '100px',
          background: c,
          opacity: 0.08,
          maskImage: 'linear-gradient(to bottom, black, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />
        {/* Color stripe */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '2px',
          borderRadius: '0 0 2px 2px',
          background: `linear-gradient(90deg, transparent, ${c}, transparent)`,
          opacity: 0.4,
          zIndex: 5,
        }} />

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px 10px',
          position: 'relative',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: c,
              boxShadow: `0 0 10px ${c}`,
            }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: G.white }}>{agent.name}</span>
            {isLead && (
              <span style={{
                fontSize: '9px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: `${c}12`,
                color: c,
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.1em',
              }}>
                LEAD
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {result?.status === 'done' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onFlag(activeRoundIdx, agent.id); }}
                  style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: result.flagged ? `${G.synth}15` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${result.flagged ? `${G.synth}30` : 'rgba(255,255,255,0.06)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    color: result.flagged ? G.synth : '#555',
                    fontSize: '12px',
                  }}
                  title="Flag for synthesis"
                >
                  {'\u2691'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopy(result.content); }}
                  style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid rgba(255,255,255,0.06)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    color: copiedCard ? '#50c878' : '#555',
                    fontSize: '11px',
                  }}
                  title="Copy"
                >
                  {copiedCard ? '\u2713' : '\u2398'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDownload(result.content, agent.name, activeRoundIdx); }}
                  style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid rgba(255,255,255,0.06)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#555',
                    fontSize: '11px',
                  }}
                  title="Download .md"
                >
                  {'\u2193'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: '0 20px 8px',
          overflowY: 'auto',
          position: 'relative',
          zIndex: 10,
          fontSize: '13.5px',
          lineHeight: 1.7,
          color: '#bbb',
          fontFamily: 'Inter, sans-serif',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.06) transparent',
        }}>
          {result?.status === 'streaming' && !result.content && (
            <span style={{ color: c, opacity: 0.6 }}>Thinking...</span>
          )}
          {result?.status === 'error' && (
            <span style={{ color: '#ff4466' }}>{result.error || 'Request failed'}</span>
          )}
          {result?.status === 'pending' && (
            <span style={{ color: G.dim }}>Waiting...</span>
          )}
          {result && (result.status === 'done' || (result.status === 'streaming' && result.content)) && (
            renderCircuitMarkdown(
              result.content,
              (code) => navigator.clipboard.writeText(code),
              (code, lang) => {
                const ext = lang || 'txt';
                const blob = new Blob([code], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `circuit-${agent.name.toLowerCase()}.${ext}`;
                a.click();
                URL.revokeObjectURL(url);
              },
            )
          )}
          {!result && (
            <span style={{ color: G.dim }}>{agent.name} was not in this round</span>
          )}
          {result?.status === 'streaming' && result.content && (
            <span style={{
              display: 'inline-block',
              width: '2px',
              height: '14px',
              background: c,
              marginLeft: '2px',
              verticalAlign: 'middle',
              animation: 'blink 1s step-end infinite',
            }} />
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px',
          borderTop: `1px solid ${G.border}`,
          position: 'relative',
          zIndex: 10,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{ fontSize: '9px', color: '#333', letterSpacing: '0.1em' }}>
            PROVIDER // {agent.provider.toUpperCase()}
          </span>
          <div style={{ display: 'flex', gap: '14px' }}>
            {result?.status === 'done' && result.tokens > 0 && (
              <span style={{ fontSize: '9px', color: '#333' }}>TOKENS // {result.tokens.toLocaleString()}</span>
            )}
            {result?.status === 'streaming' && (
              <span style={{ fontSize: '9px', color: c }}>STREAMING...</span>
            )}
            {result?.status === 'done' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: '#444' }}>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#50c878' }} />
                SYNCED
              </span>
            )}
          </div>
        </div>

        {/* Share buttons row (only for active card, done state) */}
        {idx === activeIdx && result?.status === 'done' && otherAgents.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 20px 10px',
            position: 'relative',
            zIndex: 10,
          }}>
            {otherAgents.map(name => (
              <button
                key={name}
                onClick={(e) => { e.stopPropagation(); onShareTo(activeRoundIdx, agent.id, name); }}
                style={{
                  padding: '3px 10px',
                  borderRadius: '7px',
                  fontSize: '9px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid rgba(255,255,255,0.06)`,
                  color: '#555',
                  transition: 'all 0.2s',
                }}
              >
                {'\u2192'} {name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render synthesis card
  const renderSynthesisCard = (idx: number) => {
    if (!round.synthesis) return null;
    const synth = round.synthesis;

    return (
      <div
        key="synthesis"
        style={{
          ...getCardStyle(idx),
          background: idx === activeIdx
            ? 'linear-gradient(165deg, rgba(40,32,16,0.85) 0%, rgba(17,15,10,0.9) 100%)'
            : G.glassHeavy,
          borderColor: idx === activeIdx ? `${G.synth}20` : G.border,
        }}
        onClick={() => idx !== activeIdx && goTo(idx)}
        onDoubleClick={() => idx === activeIdx && toggleFocus()}
      >
        {/* Golden glow */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '100px',
          background: G.synth,
          opacity: 0.1,
          maskImage: 'linear-gradient(to bottom, black, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '2px',
          borderRadius: '0 0 2px 2px',
          background: `linear-gradient(90deg, transparent, ${G.synth}, transparent)`,
          opacity: 0.6,
        }} />

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px 10px',
          position: 'relative',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: G.synth,
              boxShadow: `0 0 12px ${G.synth}`,
            }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: G.synth }}>Synthesis</span>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '6px',
              background: `${G.synth}12`,
              color: G.synth,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.1em',
            }}>
              MERGED
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); handleDownload(synth.content, 'synthesis', activeRoundIdx); }}
              style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid rgba(255,255,255,0.06)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                color: '#555',
                fontSize: '11px',
              }}
              title="Download synthesis"
            >
              {'\u2193'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: '0 20px 8px',
          overflowY: 'auto',
          position: 'relative',
          zIndex: 10,
          fontSize: '13.5px',
          lineHeight: 1.7,
          color: '#bbb',
          fontFamily: 'Inter, sans-serif',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.06) transparent',
        }}>
          {synth.status === 'streaming' && !synth.content && (
            <span style={{ color: G.synth, opacity: 0.6 }}>Synthesizing...</span>
          )}
          {synth.status === 'done' && renderCircuitMarkdown(
            synth.content,
            (code) => navigator.clipboard.writeText(code),
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px',
          borderTop: `1px solid ${G.synth}10`,
          position: 'relative',
          zIndex: 10,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{ fontSize: '9px', color: `${G.synth}60`, letterSpacing: '0.1em' }}>
            SYNTHESIZED BY {leadAgent?.name?.toUpperCase()} // LEAD
          </span>
          <span style={{ fontSize: '9px', color: `${G.synth}60` }}>
            {round.results.filter(r => r.status === 'done').length} SOURCES // {synth.tokens.toLocaleString()} TOKENS
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Round + Agent nav bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        flexShrink: 0,
        borderBottom: `1px solid ${G.border}`,
        transition: focusMode ? 'opacity 0.5s' : 'opacity 0.3s',
        opacity: focusMode ? 0 : 1,
        pointerEvents: focusMode ? 'none' : 'auto',
      }}>
        {/* Round tabs */}
        {rounds.length > 1 && (
          <div style={{
            display: 'flex',
            gap: '2px',
            padding: '3px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            {rounds.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveRoundIdx(i)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '7px',
                  fontSize: '10px',
                  fontWeight: 600,
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: i === activeRoundIdx ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none',
                  color: i === activeRoundIdx ? G.white : '#444',
                }}
              >
                R{i + 1}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Agent dot nav */}
        <div style={{
          display: 'flex',
          gap: '2px',
          padding: '3px',
          borderRadius: '10px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          {agents.map((a, i) => {
            const c = AGENT_COLORS[a.provider] || '#4285F4';
            const isActive = i === activeIdx;
            return (
              <button
                key={a.id}
                onClick={() => goTo(i)}
                style={{
                  width: '26px', height: '26px',
                  borderRadius: '7px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none',
                }}
                title={a.name}
              >
                <div style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: c,
                  boxShadow: isActive ? `0 0 10px ${c}` : 'none',
                  transition: 'all 0.3s',
                }} />
              </button>
            );
          })}
          {hasSynthesis && (
            <>
              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.06)', alignSelf: 'center', margin: '0 2px' }} />
              <button
                onClick={() => goTo(agents.length)}
                style={{
                  width: '26px', height: '26px',
                  borderRadius: '7px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: activeIdx === agents.length ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none',
                }}
                title="Synthesis"
              >
                <div style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: G.synth,
                  boxShadow: activeIdx === agents.length ? `0 0 10px ${G.synth}` : 'none',
                  transition: 'all 0.3s',
                }} />
              </button>
            </>
          )}
        </div>

        {/* Prompt preview */}
        <span style={{
          fontSize: '10px',
          color: '#333',
          fontFamily: 'JetBrains Mono, monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '200px',
        }}>
          {round.prompt.slice(0, 50)}{round.prompt.length > 50 ? '...' : ''}
        </span>
      </div>

      {/* ═══ THE STAGE ═══ */}
      <div
        ref={stageRef}
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          perspective: '1800px',
          transformStyle: 'preserve-3d',
          overflow: 'hidden',
        }}
      >
        {/* Background round watermark */}
        <div style={{
          position: 'absolute',
          fontSize: '100px',
          fontWeight: 900,
          color: 'rgba(255,255,255,0.012)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          R{activeRoundIdx + 1}
        </div>

        {/* Ambient glow */}
        <div style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '400px',
          borderRadius: '50%',
          filter: 'blur(120px)',
          opacity: 0.05,
          background: activeIdx < agents.length
            ? AGENT_COLORS[agents[activeIdx]?.provider] || '#4285F4'
            : G.synth,
          transition: 'background 1s ease',
          pointerEvents: 'none',
        }} />

        {/* Agent cards */}
        {agents.map((agent, i) => renderAgentCard(agent, i))}

        {/* Synthesis card */}
        {hasSynthesis && renderSynthesisCard(agents.length)}

        {/* Nav arrows */}
        {!focusMode && (
          <>
            <button
              onClick={prev}
              style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '40px', height: '40px',
                borderRadius: '50%',
                background: 'rgba(10,13,18,0.6)',
                backdropFilter: 'blur(10px)',
                border: `1px solid rgba(255,255,255,0.06)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: activeIdx > 0 ? 'pointer' : 'default',
                zIndex: 35,
                color: activeIdx > 0 ? '#666' : '#222',
                fontSize: '16px',
                transition: 'all 0.2s',
              }}
            >
              {'\u2039'}
            </button>
            <button
              onClick={next}
              style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '40px', height: '40px',
                borderRadius: '50%',
                background: 'rgba(10,13,18,0.6)',
                backdropFilter: 'blur(10px)',
                border: `1px solid rgba(255,255,255,0.06)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: activeIdx < totalCards - 1 ? 'pointer' : 'default',
                zIndex: 35,
                color: activeIdx < totalCards - 1 ? '#666' : '#222',
                fontSize: '16px',
                transition: 'all 0.2s',
              }}
            >
              {'\u203A'}
            </button>
          </>
        )}

        {/* Synthesize floating button */}
        {allDone && successCount >= 2 && !round.synthesis && !focusMode && (
          <button
            onClick={() => onSynthesize(activeRoundIdx)}
            disabled={isSynthesizing}
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '8px 20px',
              borderRadius: '14px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: isSynthesizing ? 'default' : 'pointer',
              background: `linear-gradient(135deg, ${G.synth}, #e6a030)`,
              color: '#000',
              border: 'none',
              boxShadow: `0 0 24px ${G.synth}30`,
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {'\u2697'} {isSynthesizing ? 'Synthesizing...' : 'Synthesize'}
          </button>
        )}
      </div>

      {/* Focus mode hint */}
      {!focusMode && (
        <div style={{
          position: 'absolute',
          bottom: '6px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '9px',
          color: '#222',
          display: 'flex',
          gap: '8px',
          zIndex: 35,
          pointerEvents: 'none',
        }}>
          <span>Double-click for Focus Mode</span>
          <span style={{ color: 'rgba(255,255,255,0.04)' }}>|</span>
          <span>Arrows or swipe to navigate</span>
        </div>
      )}

      {/* Blink animation for streaming cursor */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
