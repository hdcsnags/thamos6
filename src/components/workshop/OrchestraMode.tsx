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

// ═══════════════════════════════════════════════════════
// ORCHESTRA MODE — The Void
// ═══════════════════════════════════════════════════════

export default function OrchestraMode({ agents, leadAgentId, onSetLead }: Props) {
  const [rounds, setRounds] = useState<RoundEntry[]>([]);
  const [input, setInput] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [sharedContext, setSharedContext] = useState<Record<string, string[]>>({});
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set(agents.map(a => a.id)));
  const [autoShare, setAutoShare] = useState(false);
  const [agentMemory, setAgentMemory] = useState<Record<string, Array<{ role: string; content: string }>>>({});
  const [activeSlabIdx, setActiveSlabIdx] = useState(0);
  const [activeRoundIdx, setActiveRoundIdx] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [copiedSlab, setCopiedSlab] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const leadAgent = agents.find(a => a.id === leadAgentId) || agents[0];

  // Is the stage visible (have we broadcast at least once)?
  const isOrchestrating = rounds.length > 0;

  useEffect(() => {
    setSelectedAgentIds(new Set(agents.map(a => a.id)));
  }, [agents]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [input]);

  useEffect(() => {
    if (rounds.length > 0) {
      setActiveRoundIdx(rounds.length - 1);
    }
  }, [rounds.length]);

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

    const systemPrompt = `You are the Lead AI synthesizer in a multi-AI orchestra. Your job is to:
1. Analyze the responses from the other AI models below
2. Identify which approach is most feasible and why
3. Note areas of agreement and disagreement
4. Provide a clear recommendation with reasoning
5. If responses are already aligned, confirm the consensus and add any missing details

Be direct. Highlight the strongest path forward. If one AI found something the others missed, call it out.`;

    try {
      const result = await callAgent(
        leadAgent,
        [{ role: 'user', content: `Original question: ${round.prompt}\n\nResponses from the orchestra:\n\n${synthesisPrompt}` }],
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
    setActiveSlabIdx(0);

    const promises = targetAgents.map(async (agent) => {
      const agentShared = sharedContext[agent.id] || [];
      const extraContext = agentShared.length > 0
        ? `\n\nShared context from other AI in this orchestra:\n${agentShared.join('\n\n---\n\n')}`
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

  // Current round data
  const round = rounds[activeRoundIdx];
  const hasSynthesis = round?.synthesis?.status === 'done';
  const totalSlabs = agents.length + (hasSynthesis ? 1 : 0);

  const goToSlab = (idx: number) => {
    if (!focusMode && idx >= 0 && idx < totalSlabs) setActiveSlabIdx(idx);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSlab(true);
    setTimeout(() => setCopiedSlab(false), 1500);
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

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOrchestrating) return;
      if (e.key === 'Escape') {
        if (focusMode) setFocusMode(false);
        return;
      }
      if (focusMode) return;
      if (e.key === 'ArrowRight' && activeSlabIdx < totalSlabs - 1) setActiveSlabIdx(i => i + 1);
      if (e.key === 'ArrowLeft' && activeSlabIdx > 0) setActiveSlabIdx(i => i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Touch swipe
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let startX = 0, startY = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
        if (dx < 0 && activeSlabIdx < totalSlabs - 1) setActiveSlabIdx(i => i + 1);
        else if (dx > 0 && activeSlabIdx > 0) setActiveSlabIdx(i => i - 1);
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd); };
  });

  // ─── SLAB POSITION CALCULATOR ─────────────────────
  const getSlabStyle = (idx: number): React.CSSProperties => {
    const diff = idx - activeSlabIdx;
    const base: React.CSSProperties = {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '72vw',
      height: '88%',
      borderRadius: '24px',
      transition: 'all 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
      willChange: 'transform, opacity, filter',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(12, 12, 12, 0.75)',
      backdropFilter: 'blur(40px)',
      WebkitBackdropFilter: 'blur(40px)',
      border: `1px solid rgba(255,255,255,0.08)`,
      boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
    };

    if (focusMode) {
      if (diff === 0) {
        return {
          ...base,
          transform: 'translate(-50%, -50%) scale(1)',
          width: '100%',
          height: '100%',
          borderRadius: '0',
          border: 'none',
          background: G.void,
          opacity: 1,
          zIndex: 50,
          filter: 'none',
          boxShadow: 'none',
        };
      }
      return {
        ...base,
        transform: 'translate(-50%, -50%) scale(0.5) translateZ(-800px)',
        opacity: 0,
        pointerEvents: 'none',
        zIndex: 1,
      };
    }

    if (diff === 0) {
      return {
        ...base,
        transform: 'translate(-50%, -50%) scale(1) translateZ(0)',
        opacity: 1,
        zIndex: 20,
        cursor: 'default',
      };
    } else if (diff === -1) {
      return {
        ...base,
        transform: 'translate(-105%, -50%) scale(0.75) translateZ(-200px)',
        opacity: 0.35,
        filter: 'blur(5px) brightness(0.6)',
        zIndex: 10,
        cursor: 'pointer',
      };
    } else if (diff === 1) {
      return {
        ...base,
        transform: 'translate(5%, -50%) scale(0.75) translateZ(-200px)',
        opacity: 0.35,
        filter: 'blur(5px) brightness(0.6)',
        zIndex: 10,
        cursor: 'pointer',
      };
    }
    return {
      ...base,
      transform: `translate(${diff < 0 ? '-150%' : '60%'}, -50%) scale(0.6) translateZ(-400px)`,
      opacity: 0,
      pointerEvents: 'none',
      zIndex: 5,
    };
  };

  // ─── RENDER ───────────────────────────────────────

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: G.void,
        fontFamily: 'Inter, -apple-system, sans-serif',
        overflow: 'hidden',
        // Subtle dot grid
        backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    >
      {/* ════════════════════════════════════════════
           IGNITION VIEW — The Void Entry
           ════════════════════════════════════════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1)',
          opacity: isOrchestrating ? 0 : 1,
          transform: isOrchestrating ? 'scale(0.95)' : 'scale(1)',
          filter: isOrchestrating ? 'blur(10px)' : 'none',
          pointerEvents: isOrchestrating ? 'none' : 'auto',
          zIndex: isOrchestrating ? 1 : 10,
        }}
      >
        <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 24px' }}>
          {/* Title */}
          <h1 style={{
            fontSize: '28px',
            fontWeight: 300,
            textAlign: 'center',
            color: G.white,
            letterSpacing: '-0.02em',
            marginBottom: '8px',
          }}>
            The Void Awaits
          </h1>

          {/* Input box */}
          <div
            style={{
              background: 'rgba(10, 10, 10, 0.6)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid rgba(255,255,255,0.08)`,
              borderRadius: '24px',
              padding: '8px',
              transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); broadcast(); } }}
              placeholder="Direct the orchestra..."
              disabled={isBroadcasting}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '18px',
                fontWeight: 300,
                fontFamily: 'Inter, sans-serif',
                padding: '20px 24px',
                resize: 'none',
                minHeight: '100px',
              }}
            />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 16px',
            }}>
              {/* Agent orbs */}
              <div style={{ display: 'flex', gap: '16px' }}>
                {agents.map(a => {
                  const c = AGENT_COLORS[a.provider] || '#9370DB';
                  const isSelected = selectedAgentIds.has(a.id);
                  const isLead = a.id === leadAgent?.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAgent(a.id)}
                      onContextMenu={(e) => { e.preventDefault(); onSetLead(a.id); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: isSelected ? 1 : 0.3,
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        transition: 'opacity 0.3s',
                        padding: 0,
                      }}
                      title={`Click: toggle | Right-click: set lead`}
                    >
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        boxShadow: isSelected ? `0 0 12px ${c}` : 'none',
                      }} />
                      <span style={{
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: isLead ? '#fff' : isSelected ? c : '#555',
                      }}>
                        {a.name}{isLead ? ' (Lead)' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Broadcast button */}
              <button
                onClick={broadcast}
                disabled={!input.trim() || isBroadcasting}
                style={{
                  background: input.trim() && !isBroadcasting ? '#fff' : 'rgba(255,255,255,0.06)',
                  color: input.trim() && !isBroadcasting ? '#000' : '#444',
                  padding: '10px 28px',
                  borderRadius: '100px',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: input.trim() && !isBroadcasting ? 'pointer' : 'default',
                  border: 'none',
                  transition: 'all 0.3s ease',
                  boxShadow: input.trim() && !isBroadcasting ? '0 0 30px rgba(255,255,255,0.15)' : 'none',
                }}
              >
                {isBroadcasting ? 'Igniting...' : 'Broadcast'}
              </button>
            </div>
          </div>

          {/* Auto-share + Memory controls */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              onClick={() => setAutoShare(!autoShare)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '10px',
                fontSize: '10px',
                fontWeight: 500,
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
                background: autoShare ? 'rgba(80,200,120,0.08)' : 'transparent',
                border: `1px solid ${autoShare ? 'rgba(80,200,120,0.15)' : 'rgba(255,255,255,0.06)'}`,
                color: autoShare ? '#50c878' : '#444',
              }}
            >
              <div style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: autoShare ? '#50c878' : '#333',
                boxShadow: autoShare ? '0 0 6px #50c878' : 'none',
              }} />
              {autoShare ? 'AUTO-SHARE ON' : 'AUTO-SHARE'}
            </button>
            {totalMemoryMessages > 0 && (
              <span style={{
                padding: '5px 12px', borderRadius: '10px', fontSize: '10px',
                fontFamily: 'JetBrains Mono, monospace',
                background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)', color: '#a78bfa',
              }}>
                {totalMemoryMessages / 2 | 0} mem
              </span>
            )}
            {(totalMemoryMessages > 0 || sharedCount > 0) && (
              <button
                onClick={clearMemory}
                style={{
                  padding: '5px 12px', borderRadius: '10px', fontSize: '10px',
                  fontFamily: 'JetBrains Mono, monospace',
                  cursor: 'pointer', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.06)', color: '#444',
                }}
              >
                RESET
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
           STAGE VIEW — The Monoliths
           ════════════════════════════════════════════ */}
      <div
        ref={stageRef}
        style={{
          position: 'absolute',
          inset: 0,
          transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1)',
          opacity: isOrchestrating ? 1 : 0,
          transform: isOrchestrating ? 'scale(1)' : 'scale(1.05)',
          pointerEvents: isOrchestrating ? 'auto' : 'none',
          zIndex: isOrchestrating ? 10 : 1,
          perspective: '2500px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── TOP BAR (minimal — fades in focus mode) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px',
          flexShrink: 0,
          transition: 'opacity 0.5s',
          opacity: focusMode ? 0 : 1,
          pointerEvents: focusMode ? 'none' : 'auto',
          zIndex: 30,
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Round tabs */}
            {rounds.length > 1 && (
              <div style={{
                display: 'flex', gap: '2px', padding: '3px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}>
                {rounds.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveRoundIdx(i)}
                    style={{
                      padding: '3px 10px', borderRadius: '7px',
                      fontSize: '10px', fontWeight: 600,
                      fontFamily: 'JetBrains Mono, monospace',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      background: i === activeRoundIdx ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: 'none',
                      color: i === activeRoundIdx ? G.white : '#333',
                    }}
                  >
                    R{i + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Agent dot nav */}
            <div style={{
              display: 'flex', gap: '2px', padding: '3px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}>
              {agents.map((a, i) => {
                const c = AGENT_COLORS[a.provider] || '#9370DB';
                return (
                  <button
                    key={a.id}
                    onClick={() => goToSlab(i)}
                    style={{
                      width: '26px', height: '26px', borderRadius: '7px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      background: i === activeSlabIdx ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: 'none',
                    }}
                    title={a.name}
                  >
                    <div style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: c,
                      boxShadow: i === activeSlabIdx ? `0 0 10px ${c}` : 'none',
                      transition: 'all 0.3s',
                    }} />
                  </button>
                );
              })}
              {hasSynthesis && (
                <>
                  <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.06)', alignSelf: 'center', margin: '0 2px' }} />
                  <button
                    onClick={() => goToSlab(agents.length)}
                    style={{
                      width: '26px', height: '26px', borderRadius: '7px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      background: activeSlabIdx === agents.length ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: 'none',
                    }}
                    title="Synthesis"
                  >
                    <div style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: G.synth,
                      boxShadow: activeSlabIdx === agents.length ? `0 0 10px ${G.synth}` : 'none',
                    }} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right: auto-share + controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setAutoShare(!autoShare)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', borderRadius: '8px',
                fontSize: '10px', fontWeight: 500, cursor: 'pointer',
                background: autoShare ? 'rgba(80,200,120,0.08)' : 'transparent',
                border: `1px solid ${autoShare ? 'rgba(80,200,120,0.15)' : 'rgba(255,255,255,0.06)'}`,
                color: autoShare ? '#50c878' : '#444',
              }}
            >
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: autoShare ? '#50c878' : '#333' }} />
              {autoShare ? 'AUTO-SHARE' : 'SHARE'}
            </button>
            {totalMemoryMessages > 0 && (
              <span style={{
                padding: '3px 8px', borderRadius: '7px', fontSize: '10px',
                background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)', color: '#a78bfa',
              }}>
                {totalMemoryMessages / 2 | 0} mem
              </span>
            )}
            {totalTokens > 0 && (
              <span style={{
                padding: '3px 8px', borderRadius: '7px', fontSize: '10px',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#333',
              }}>
                {totalTokens.toLocaleString()} tok
              </span>
            )}
          </div>
        </div>

        {/* ── THE STAGE (slab container) ── */}
        <div style={{
          flex: 1,
          position: 'relative',
          transformStyle: 'preserve-3d',
        }}>
          {/* Agent slabs */}
          {round && agents.map((agent, i) => {
            const c = AGENT_COLORS[agent.provider] || '#9370DB';
            const result = round.results.find(r => r.agentId === agent.id);
            const isLead = agent.id === leadAgent?.id;
            const otherAgents = agentNames.filter(n => n !== agent.name);

            return (
              <div
                key={agent.id}
                style={getSlabStyle(i)}
                onClick={() => i !== activeSlabIdx && goToSlab(i)}
                onDoubleClick={() => i === activeSlabIdx && setFocusMode(f => !f)}
              >
                {/* Top glow line */}
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, height: '1px',
                  boxShadow: `0 0 30px 1px ${c}`,
                  opacity: 0.6,
                  pointerEvents: 'none',
                }} />

                {/* Header */}
                <div style={{
                  padding: '20px 40px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: c,
                      boxShadow: `0 0 12px ${c}`,
                    }} />
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '11px',
                      letterSpacing: '0.15em',
                      color: c,
                      textTransform: 'uppercase',
                    }}>
                      {agent.name}
                    </span>
                    {isLead && (
                      <span style={{
                        fontSize: '9px',
                        border: `1px solid ${c}30`,
                        color: c,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                        background: `${c}10`,
                        fontFamily: 'JetBrains Mono, monospace',
                      }}>
                        Lead
                      </span>
                    )}
                    {result?.status === 'streaming' && (
                      <span style={{ fontSize: '10px', color: c, opacity: 0.6 }}>streaming...</span>
                    )}
                  </div>
                  {result?.status === 'done' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFlag(activeRoundIdx, agent.id); }}
                        style={{
                          padding: '4px 10px', borderRadius: '8px', fontSize: '10px',
                          background: result.flagged ? `${G.synth}12` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${result.flagged ? `${G.synth}30` : 'rgba(255,255,255,0.06)'}`,
                          color: result.flagged ? G.synth : '#555', cursor: 'pointer',
                        }}
                      >
                        {result.flagged ? 'FLAGGED' : 'FLAG'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(result.content); }}
                        style={{
                          padding: '4px 10px', borderRadius: '8px', fontSize: '10px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: copiedSlab ? '#50c878' : '#555', cursor: 'pointer',
                        }}
                      >
                        {copiedSlab ? 'COPIED' : 'COPY'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(result.content, agent.name, activeRoundIdx); }}
                        style={{
                          padding: '4px 10px', borderRadius: '8px', fontSize: '10px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: '#555', cursor: 'pointer',
                        }}
                      >
                        .MD
                      </button>
                      {otherAgents.map(name => (
                        <button
                          key={name}
                          onClick={(e) => { e.stopPropagation(); handleShareTo(activeRoundIdx, agent.id, name); }}
                          style={{
                            padding: '4px 10px', borderRadius: '8px', fontSize: '10px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: '#555', cursor: 'pointer',
                          }}
                        >
                          {'\u2192'} {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Body */}
                <div style={{
                  flex: 1,
                  padding: focusMode ? '40px 80px' : '32px 60px',
                  overflowY: 'auto',
                  fontSize: '16px',
                  lineHeight: 1.8,
                  color: '#D1D1D1',
                  fontFamily: 'Inter, sans-serif',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255,255,255,0.1) transparent',
                }}>
                  {result?.status === 'streaming' && !result.content && (
                    <span style={{ color: c, opacity: 0.5, fontSize: '16px' }}>Thinking...</span>
                  )}
                  {result?.status === 'error' && (
                    <span style={{ color: '#ff4466' }}>{result.error || 'Request failed'}</span>
                  )}
                  {result?.status === 'pending' && (
                    <span style={{ color: '#333' }}>Waiting...</span>
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
                        a.download = `maestro-${agent.name.toLowerCase()}.${ext}`;
                        a.click();
                        URL.revokeObjectURL(url);
                      },
                    )
                  )}
                  {result?.status === 'streaming' && result.content && (
                    <span style={{
                      display: 'inline-block', width: '2px', height: '16px',
                      background: c, marginLeft: '2px', verticalAlign: 'middle',
                      animation: 'blink 1s step-end infinite',
                    }} />
                  )}
                  {!result && (
                    <span style={{ color: '#333' }}>{agent.name} was not in this round</span>
                  )}
                </div>

                {/* Footer stats */}
                <div style={{
                  padding: '10px 40px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  color: '#333',
                  flexShrink: 0,
                }}>
                  <span>PROVIDER // {agent.provider.toUpperCase()}</span>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    {result?.tokens ? <span>TOKENS // {result.tokens.toLocaleString()}</span> : null}
                    <span>{agent.model}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Synthesis slab */}
          {round && hasSynthesis && (() => {
            const synth = round.synthesis!;
            const synthIdx = agents.length;
            return (
              <div
                key="synthesis-slab"
                style={{
                  ...getSlabStyle(synthIdx),
                  background: synthIdx === activeSlabIdx
                    ? 'linear-gradient(165deg, rgba(40,32,16,0.75) 0%, rgba(12,10,6,0.85) 100%)'
                    : 'rgba(12, 12, 12, 0.75)',
                }}
                onClick={() => synthIdx !== activeSlabIdx && goToSlab(synthIdx)}
                onDoubleClick={() => synthIdx === activeSlabIdx && setFocusMode(f => !f)}
              >
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, height: '1px',
                  boxShadow: `0 0 30px 1px ${G.synth}`,
                  opacity: 0.6,
                }} />
                <div style={{
                  padding: '20px 40px',
                  borderBottom: `1px solid ${G.synth}15`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: G.synth, boxShadow: `0 0 12px ${G.synth}` }} />
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', letterSpacing: '0.15em', color: G.synth, textTransform: 'uppercase' }}>
                      Synthesis
                    </span>
                    <span style={{ fontSize: '9px', border: `1px solid ${G.synth}30`, color: G.synth, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.15em', background: `${G.synth}10`, fontFamily: 'JetBrains Mono, monospace' }}>
                      MERGED
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(synth.content, 'synthesis', activeRoundIdx); }}
                    style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#555', cursor: 'pointer' }}
                  >
                    .MD
                  </button>
                </div>
                <div style={{
                  flex: 1, padding: focusMode ? '40px 80px' : '32px 60px',
                  overflowY: 'auto', fontSize: '16px', lineHeight: 1.8, color: '#D1D1D1',
                  scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent',
                }}>
                  {renderCircuitMarkdown(synth.content, (code) => navigator.clipboard.writeText(code))}
                </div>
                <div style={{
                  padding: '10px 40px', borderTop: `1px solid ${G.synth}10`,
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.1em',
                  color: `${G.synth}50`, flexShrink: 0,
                }}>
                  <span>SYNTHESIZED BY {leadAgent?.name?.toUpperCase()} // LEAD</span>
                  <span>{round.results.filter(r => r.status === 'done').length} SOURCES // {synth.tokens.toLocaleString()} TOKENS</span>
                </div>
              </div>
            );
          })()}

          {/* Synthesize floating button */}
          {round && (() => {
            const allDone = round.results.every(r => r.status === 'done' || r.status === 'error');
            const successCount = round.results.filter(r => r.status === 'done').length;
            if (allDone && successCount >= 2 && !round.synthesis && !focusMode) {
              return (
                <button
                  onClick={() => synthesize(activeRoundIdx)}
                  disabled={isSynthesizing}
                  style={{
                    position: 'absolute',
                    bottom: '20px', left: '50%', transform: 'translateX(-50%)',
                    padding: '10px 24px', borderRadius: '100px',
                    fontSize: '12px', fontWeight: 500,
                    cursor: isSynthesizing ? 'default' : 'pointer',
                    background: `linear-gradient(135deg, ${G.synth}, #e6a030)`,
                    color: '#000', border: 'none',
                    boxShadow: `0 0 30px ${G.synth}30`,
                    zIndex: 40,
                    transition: 'all 0.3s',
                  }}
                >
                  {isSynthesizing ? 'Synthesizing...' : 'Synthesize'}
                </button>
              );
            }
            return null;
          })()}
        </div>

        {/* ── BOTTOM COMMAND BAR (for follow-up rounds) ── */}
        <div style={{
          padding: '10px 20px',
          flexShrink: 0,
          transition: 'opacity 0.5s',
          opacity: focusMode ? 0 : 1,
          pointerEvents: focusMode ? 'none' : 'auto',
          zIndex: 30,
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'end',
            width: '100%',
            maxWidth: '700px',
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); broadcast(); } }}
              placeholder="Continue the conversation..."
              disabled={isBroadcasting}
              rows={1}
              style={{
                flex: 1,
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 300,
                borderRadius: '20px',
                resize: 'none',
                outline: 'none',
                fontFamily: 'Inter, sans-serif',
                background: 'rgba(10,10,10,0.6)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
              }}
            />
            <button
              onClick={broadcast}
              disabled={!input.trim() || isBroadcasting}
              style={{
                padding: '10px 20px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: !input.trim() || isBroadcasting ? 'default' : 'pointer',
                background: input.trim() && !isBroadcasting ? '#fff' : 'rgba(255,255,255,0.04)',
                color: input.trim() && !isBroadcasting ? '#000' : '#333',
                border: 'none',
                transition: 'all 0.3s',
              }}
            >
              {isBroadcasting ? 'Sending...' : 'Broadcast'}
            </button>
          </div>
        </div>

        {/* Focus hint */}
        <div style={{
          position: 'absolute',
          bottom: '6px', left: '50%', transform: 'translateX(-50%)',
          fontSize: '9px', color: '#222',
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          zIndex: 25,
          pointerEvents: 'none',
          transition: 'opacity 0.5s',
          opacity: focusMode ? 0 : 0.5,
        }}>
          Double-click slab to focus {'\u00B7'} Arrows to navigate {'\u00B7'} Esc to exit
        </div>
      </div>

      {/* Blink animation */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
