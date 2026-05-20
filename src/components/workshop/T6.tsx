import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { T6Orb, type T6OrbState } from './T6Orb';

// ─── Types ────────────────────────────────────────────────────────────────────

type T6Mode = 'single' | 'council';
type T6Phase = 'idle' | 'thinking' | 'broadcasting' | 'deliberating' | 'synthesizing' | 'done' | 'error';

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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  tokens_used: number;
  model_used?: string;
}

interface Conversation {
  id: string;
  title: string;
  agent_id: string;
  last_message_at: string;
  message_count: number;
  total_tokens: number;
}

interface CouncilResponse {
  id: string;
  agent_id: string;
  agent_name: string;
  provider: string;
  model: string;
  content: string;
  tokens_used: number;
  error?: string;
}

interface DeliberationResult {
  source_id: string;
  agent_name: string;
  objection?: { target_voice: string; target_agent_name?: string; point: string; rationale: string };
  agreement?: { target_voice: string; target_agent_name?: string; point: string; why_i_missed_it: string };
  self_critique?: { weakness: string; rationale: string };
  parse_failed: boolean;
  skipped?: boolean;
  error?: string;
  tokens_used: number;
}

interface SynthesisResult {
  content: string;
  consensus?: string;
  trade_offs?: Array<{ axis: string; side_a: { agent: string; position: string }; side_b: { agent: string; position: string } }>;
  acknowledged_weaknesses?: Array<{ agent: string; weakness: string }>;
  unresolved_tensions?: string[];
  recommendation?: string;
}

// ─── Security Personas ────────────────────────────────────────────────────────

const PERSONAS: Record<string, { name: string; icon: string; color: string; one_liner: string; voice_preamble: string; deliberation_signature: string }> = {
  none: {
    name: 'Default',
    icon: '◈',
    color: '#8a8fa8',
    one_liner: 'General cybersecurity analyst',
    voice_preamble: '',
    deliberation_signature: '',
  },
  'red-teamer': {
    name: 'Red Teamer',
    icon: '⚔',
    color: '#f43f5e',
    one_liner: 'Adversarial mindset, attack surface focus',
    voice_preamble: `You are analyzing this with an adversarial mindset. Assume malicious intent is possible. Look for attack vectors, exploitation paths, and ways this could be weaponized or abused. If a threat exists, find it. If a defense is proposed, find its gaps. If something looks benign, consider how an attacker would leverage it anyway.

Your instinct: everything is an attack surface until proven otherwise. Do not soften threat assessments out of politeness or uncertainty — a missed threat is more dangerous than a false positive in SOC operations.`,
    deliberation_signature: 'Prioritize the most dangerous interpretation. Challenge defensive optimism. Agreements should acknowledge what an adversary would exploit; objections should call out underestimated attack paths.',
  },
  'defender': {
    name: 'Defender',
    icon: '🛡',
    color: '#3b82f6',
    one_liner: 'Blue team, MITRE ATT&CK, detection engineering',
    voice_preamble: `You are analyzing this from a defensive security perspective. Map observations to MITRE ATT&CK tactics and techniques. Identify what detection rules, controls, or mitigations apply. Think about what telemetry a SOC would have — what does Sentinel/Defender/EDR actually log here, and how would you write a KQL query to detect it?

Your instinct: every threat has indicators. Every attack has telemetry. Your job is to translate threat observations into actionable detection and response steps that a SOC analyst can execute right now.`,
    deliberation_signature: 'Challenge claims that lack concrete detection paths. If a threat is identified, specify what it maps to in MITRE ATT&CK and how it would be detected in practice.',
  },
  'skeptic': {
    name: 'Skeptic',
    icon: '⚖',
    color: '#fbbf24',
    one_liner: 'False positive hunter, demands evidence',
    voice_preamble: `You critically evaluate whether the threat is real. Question every assumption. Consider benign explanations — legitimate admin tools, misconfiguration, authorized pen testing, false correlation. Demand concrete, observable evidence before escalating.

Your instinct: the worst outcome in SOC operations is burning analyst time on a false positive. Alert fatigue kills real detection. Only escalate when the evidence is specific, observable, and non-trivial to explain benignly.`,
    deliberation_signature: 'Demand specificity. Vague threat claims require objections. Challenge extraordinary threat assessments that lack extraordinary evidence. Identify where the analysis is inference vs. observed fact.',
  },
  'forensics': {
    name: 'Forensics',
    icon: '🔬',
    color: '#00d9ff',
    one_liner: 'Evidence chains, attribution, IOC correlation',
    voice_preamble: `You analyze through the lens of digital forensics. Focus on artifact provenance, IOC correlation, timeline reconstruction, and attribution. Every claim must be tied to a specific observable artifact, log entry, or indicator — not inference.

Your instinct: facts before conclusions. Build the evidence chain first. Correlation across IOCs (IPs, domains, hashes, email headers, file paths) is your primary tool. Attribution requires convergence of multiple independent artifact chains, not a single indicator.`,
    deliberation_signature: 'Focus on what the evidence actually shows vs. what is inferred. Challenge attribution claims without artifact chains. Agreements should be grounded in specific observables.',
  },
};

// ─── Design Tokens ───────────────────────────────────────────────────────────

const C = {
  bg: '#060610',
  surface: '#0a0e1a',
  surfaceAlt: '#0d1220',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  cyan: '#00d9ff',
  green: '#00ff9d',
  amber: '#fbbf24',
  rose: '#f43f5e',
  blue: '#3b82f6',
};

const AGENT_COLOR: Record<string, string> = {
  anthropic: C.green,
  openai: '#ff6b35',
  google: C.cyan,
  openrouter: '#9370DB',
};

const DEFAULT_AGENTS = [
  { name: 'Claude', provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514', system_prompt: 'You are Claude, a cybersecurity analyst operating within ThamOS T6. Be precise, technical, and actionable.', temperature: 0.7, max_tokens: 8192, is_default: true },
  { name: 'GPT', provider: 'openai' as const, model: 'gpt-4.1', system_prompt: 'You are GPT, a cybersecurity analyst operating within ThamOS T6. Be precise, technical, and actionable.', temperature: 0.7, max_tokens: 8192, is_default: false },
  { name: 'Gemini', provider: 'google' as const, model: 'gemini-2.5-pro', system_prompt: 'You are Gemini, a cybersecurity analyst operating within ThamOS T6. Be precise, technical, and actionable.', temperature: 0.7, max_tokens: 8192, is_default: false },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function phaseToOrbState(phase: T6Phase): T6OrbState {
  const map: Record<T6Phase, T6OrbState> = {
    idle: 'idle', thinking: 'thinking', broadcasting: 'broadcasting',
    deliberating: 'deliberating', synthesizing: 'synthesizing',
    done: 'done', error: 'error',
  };
  return map[phase];
}

// Post-synthesis: orb reflects analysis health, not loading phase.
// conflict = ≥2 unresolved tensions, or tension + ≥2 acknowledged weaknesses.
// tense    = any unresolved tension or acknowledged weakness.
// done     = clean consensus.
function synthesisToOrbState(s: SynthesisResult): T6OrbState {
  const tensions = s.unresolved_tensions?.length ?? 0;
  const weaknesses = s.acknowledged_weaknesses?.length ?? 0;
  if (tensions >= 2 || (tensions >= 1 && weaknesses >= 2)) return 'conflict';
  if (tensions >= 1 || weaknesses >= 1) return 'tense';
  return 'done';
}

function renderMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const lines = text.split('\n');
  let inCode = false, codeBuf: string[] = [], codeLang = '', key = 0;

  const renderInline = (line: string): React.ReactNode => {
    const res: React.ReactNode[] = [];
    let remaining = line, idx = 0;
    const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
    let m;
    while ((m = regex.exec(remaining)) !== null) {
      if (m.index > idx) res.push(remaining.slice(idx, m.index));
      const tok = m[0];
      if (tok.startsWith('`')) res.push(<span key={`${key++}-c`} style={{ background: '#1a1f35', padding: '1px 4px', borderRadius: 3, color: C.green, fontSize: '0.7rem' }}>{tok.slice(1, -1)}</span>);
      else if (tok.startsWith('**')) res.push(<strong key={`${key++}-b`} style={{ color: C.textLight, fontWeight: 600 }}>{tok.slice(2, -2)}</strong>);
      idx = m.index + tok.length;
    }
    if (idx < remaining.length) res.push(remaining.slice(idx));
    return res;
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        const code = codeBuf.join('\n'), lang = codeLang;
        parts.push(
          <div key={key++} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, margin: '6px 0', overflow: 'hidden' }}>
            <div style={{ padding: '3px 10px', borderBottom: `1px solid ${C.border}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.dim, fontSize: '0.6rem' }}>{lang || 'code'}</span>
              <button onClick={() => navigator.clipboard.writeText(code)} style={{ color: C.dim, fontSize: '0.55rem', border: `1px solid ${C.border}`, borderRadius: 3, padding: '1px 5px', background: 'transparent', cursor: 'pointer' }}>COPY</button>
            </div>
            <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', color: C.green, margin: 0, padding: '8px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{code}</pre>
          </div>
        );
        codeBuf = []; codeLang = ''; inCode = false;
      } else { inCode = true; codeLang = line.slice(3).trim(); }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (line.startsWith('### ')) parts.push(<div key={key++} style={{ color: C.textLight, fontWeight: 600, fontSize: '0.75rem', margin: '8px 0 3px' }}>{renderInline(line.slice(4))}</div>);
    else if (line.startsWith('## ')) parts.push(<div key={key++} style={{ color: C.textLight, fontWeight: 600, fontSize: '0.8rem', margin: '10px 0 4px' }}>{renderInline(line.slice(3))}</div>);
    else if (line.startsWith('# ')) parts.push(<div key={key++} style={{ color: C.textLight, fontWeight: 700, fontSize: '0.85rem', margin: '12px 0 6px' }}>{renderInline(line.slice(2))}</div>);
    else if (line.startsWith('- ') || line.startsWith('* ')) parts.push(<div key={key++} style={{ paddingLeft: 12 }}><span style={{ color: C.dim }}>–</span> {renderInline(line.slice(2))}</div>);
    else if (/^\d+\.\s/.test(line)) { const e = line.indexOf('. '); parts.push(<div key={key++} style={{ paddingLeft: 12 }}><span style={{ color: C.dim }}>{line.slice(0, e + 1)}</span> {renderInline(line.slice(e + 2))}</div>); }
    else if (line.trim() === '') parts.push(<div key={key++} style={{ height: 5 }} />);
    else parts.push(<div key={key++}>{renderInline(line)}</div>);
  }
  return parts;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function PersonaBadge({ persona, onClick }: { persona: string; onClick: () => void }) {
  const p = PERSONAS[persona] || PERSONAS.none;
  return (
    <button
      onClick={onClick}
      title={p.one_liner}
      style={{
        fontSize: '0.55rem', padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
        color: p.color, border: `1px solid ${p.color}40`, background: `${p.color}10`,
        fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em',
      }}
    >
      {p.icon} {p.name.toUpperCase()}
    </button>
  );
}

function DeliberationCard({ result }: { result: DeliberationResult }) {
  const [open, setOpen] = useState(false);
  if (result.skipped || result.parse_failed || (!result.objection && !result.agreement && !result.self_critique)) return null;

  return (
    <div style={{ marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '5px 10px', background: '#0d1220', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: C.text, fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em' }}
      >
        <span style={{ color: '#5a8fe0' }}>DELIBERATION · {result.agent_name.toUpperCase()}</span>
        <span style={{ color: C.dim }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '8px 10px', background: '#080b16', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.68rem', color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>
          {result.objection && (
            <div style={{ borderLeft: `2px solid ${C.rose}`, paddingLeft: 8 }}>
              <span style={{ color: C.rose, fontSize: '0.6rem' }}>✗ OBJECTS TO {(result.objection.target_agent_name || result.objection.target_voice).toUpperCase()}</span>
              <div style={{ marginTop: 3, color: C.textLight }}>{result.objection.point}</div>
              <div style={{ marginTop: 2, color: C.text }}>{result.objection.rationale}</div>
            </div>
          )}
          {result.agreement && (
            <div style={{ borderLeft: `2px solid ${C.green}`, paddingLeft: 8 }}>
              <span style={{ color: C.green, fontSize: '0.6rem' }}>✓ AGREES WITH {(result.agreement.target_agent_name || result.agreement.target_voice).toUpperCase()}</span>
              <div style={{ marginTop: 3, color: C.textLight }}>{result.agreement.point}</div>
              <div style={{ marginTop: 2, color: C.text }}>What I missed: {result.agreement.why_i_missed_it}</div>
            </div>
          )}
          {result.self_critique && (
            <div style={{ borderLeft: `2px solid ${C.amber}`, paddingLeft: 8 }}>
              <span style={{ color: C.amber, fontSize: '0.6rem' }}>~ SELF-CRITIQUE</span>
              <div style={{ marginTop: 3, color: C.textLight }}>{result.self_critique.weakness}</div>
              <div style={{ marginTop: 2, color: C.text }}>{result.self_critique.rationale}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SynthesisPanel({ synthesis }: { synthesis: SynthesisResult }) {
  const hasStructure = synthesis.consensus || (synthesis.trade_offs?.length ?? 0) > 0 || (synthesis.unresolved_tensions?.length ?? 0) > 0;

  return (
    <div style={{ border: `1px solid ${C.green}30`, borderRadius: 8, overflow: 'hidden', background: '#060f0a' }}>
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.green}20`, background: `${C.green}08`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
        <span style={{ color: C.green, fontSize: '0.65rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em' }}>T6 SYNTHESIS</span>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {hasStructure ? (
          <>
            {synthesis.consensus && (
              <div>
                <div style={{ color: C.textLight, fontSize: '0.6rem', letterSpacing: '0.08em', marginBottom: 4, fontFamily: 'JetBrains Mono, monospace' }}>CONSENSUS</div>
                <div style={{ color: C.text, fontSize: '0.72rem', lineHeight: 1.6 }}>{renderMarkdown(synthesis.consensus)}</div>
              </div>
            )}
            {synthesis.trade_offs && synthesis.trade_offs.length > 0 && (
              <div>
                <div style={{ color: C.amber, fontSize: '0.6rem', letterSpacing: '0.08em', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>TRADE-OFFS</div>
                {synthesis.trade_offs.map((t, i) => (
                  <div key={i} style={{ marginBottom: 8, border: `1px solid ${C.amber}20`, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ padding: '4px 10px', background: `${C.amber}08`, color: C.amber, fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace' }}>{t.axis}</div>
                    <div style={{ padding: '6px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ color: C.dim, fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', marginBottom: 2 }}>{t.side_a.agent.toUpperCase()}</div>
                        <div style={{ color: C.text, fontSize: '0.68rem' }}>{t.side_a.position}</div>
                      </div>
                      <div>
                        <div style={{ color: C.dim, fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', marginBottom: 2 }}>{t.side_b.agent.toUpperCase()}</div>
                        <div style={{ color: C.text, fontSize: '0.68rem' }}>{t.side_b.position}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {synthesis.acknowledged_weaknesses && synthesis.acknowledged_weaknesses.length > 0 && (
              <div>
                <div style={{ color: C.amber, fontSize: '0.6rem', letterSpacing: '0.08em', marginBottom: 4, fontFamily: 'JetBrains Mono, monospace' }}>ACKNOWLEDGED WEAKNESSES</div>
                {synthesis.acknowledged_weaknesses.map((w, i) => (
                  <div key={i} style={{ paddingLeft: 8, borderLeft: `2px solid ${C.amber}40`, marginBottom: 4 }}>
                    <span style={{ color: C.amber, fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace' }}>{w.agent.toUpperCase()}</span>
                    <div style={{ color: C.text, fontSize: '0.68rem', marginTop: 2 }}>{w.weakness}</div>
                  </div>
                ))}
              </div>
            )}
            {synthesis.unresolved_tensions && synthesis.unresolved_tensions.length > 0 && (
              <div style={{ border: `1px solid ${C.rose}30`, borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ padding: '5px 10px', background: `${C.rose}08`, color: C.rose, fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>UNRESOLVED · YOUR CALL</div>
                <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {synthesis.unresolved_tensions.map((t, i) => (
                    <div key={i} style={{ color: C.textLight, fontSize: '0.68rem', paddingLeft: 8, borderLeft: `2px solid ${C.rose}40` }}>{t}</div>
                  ))}
                </div>
              </div>
            )}
            {synthesis.recommendation && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                <div style={{ color: C.green, fontSize: '0.6rem', letterSpacing: '0.08em', marginBottom: 4, fontFamily: 'JetBrains Mono, monospace' }}>RECOMMENDATION</div>
                <div style={{ color: C.textLight, fontSize: '0.72rem', lineHeight: 1.7 }}>{renderMarkdown(synthesis.recommendation)}</div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: C.textLight, fontSize: '0.72rem', lineHeight: 1.7 }}>{renderMarkdown(synthesis.content)}</div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function T6() {
  const { user } = useAuth();

  // Agent roster
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeAgentIds, setActiveAgentIds] = useState<Set<string>>(new Set());
  const [agentPersonas, setAgentPersonas] = useState<Record<string, string>>({}); // agentId → persona key

  // Mode & phase
  const [mode, setMode] = useState<T6Mode>('single');
  const [phase, setPhase] = useState<T6Phase>('idle');

  // Single-agent chat
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Council state
  const [councilPrompt, setCouncilPrompt] = useState('');
  const [councilResponses, setCouncilResponses] = useState<CouncilResponse[]>([]);
  const [deliberations, setDeliberations] = useState<DeliberationResult[]>([]);
  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(null);

  // UI state
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [personaPickerFor, setPersonaPickerFor] = useState<string | null>(null); // agentId
  const [error, setError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const accentColor = useMemo(() => {
    if (mode === 'council') return C.cyan;
    return selectedAgent ? (AGENT_COLOR[selectedAgent.provider] ?? C.cyan) : C.cyan;
  }, [mode, selectedAgent]);

  // Semantic orb: post-synthesis, reflect analysis health instead of loading phase.
  const orbState = useMemo((): T6OrbState => {
    if (mode === 'council' && synthesis && phase === 'done') return synthesisToOrbState(synthesis);
    return phaseToOrbState(phase);
  }, [mode, synthesis, phase]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, councilResponses]);

  // Keyboard carousel navigation (← →) — skip when focused in input/textarea
  useEffect(() => {
    if (mode !== 'council' || councilResponses.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') setCurrentSlide(s => Math.max(0, s - 1));
      if (e.key === 'ArrowRight') setCurrentSlide(s => Math.min(councilResponses.length - 1, s + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, councilResponses.length]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Load agents
  const loadAgents = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('ai_agents').select('*').order('is_default', { ascending: false });
    if (data && data.length > 0) {
      setAgents(data);
      if (!selectedAgent) setSelectedAgent(data.find((a: Agent) => a.is_default) || data[0]);
      if (activeAgentIds.size === 0) {
        setActiveAgentIds(new Set(data.map((a: Agent) => a.id)));
      }
    } else if (data && data.length === 0) {
      const inserts = DEFAULT_AGENTS.map(a => ({ ...a, user_id: user.id }));
      await supabase.from('ai_agents').insert(inserts);
      const { data: fresh } = await supabase.from('ai_agents').select('*').order('is_default', { ascending: false });
      if (fresh) {
        setAgents(fresh);
        setSelectedAgent(fresh[0]);
        setActiveAgentIds(new Set(fresh.map((a: Agent) => a.id)));
      }
    }
  }, [user]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('ai_conversations').select('*').order('last_message_at', { ascending: false });
    if (data) setConversations(data);
  }, [user]);

  useEffect(() => { if (user) { loadAgents(); loadConversations(); } }, [user]);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    };
    if (session?.access_token) hdrs['Authorization'] = `Bearer ${session.access_token}`;
    return hdrs;
  };

  // ── Single-agent send ──────────────────────────────────────────────────────

  const createConversation = async () => {
    if (!selectedAgent || !user) return;
    const { data } = await supabase.from('ai_conversations')
      .insert({ user_id: user.id, agent_id: selectedAgent.id, title: 'New Session' })
      .select().single();
    if (data) { setSelectedConv(data); setMessages([]); loadConversations(); }
  };

  const loadMessages = async (convId: string) => {
    const { data } = await supabase.from('ai_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const buildSystemPrompt = (agent: Agent): string => {
    const persona = PERSONAS[agentPersonas[agent.id] || 'none'];
    if (!persona || !persona.voice_preamble) return agent.system_prompt;
    return `${persona.voice_preamble}\n\n${agent.system_prompt}`;
  };

  const sendSingle = async () => {
    if (!input.trim() || !selectedAgent || phase !== 'idle' || !user) return;

    // Auto-create a conversation on first send — no explicit "Start Session" needed.
    let convId: string;
    let convTitle: string;
    if (selectedConv) {
      convId = selectedConv.id;
      convTitle = selectedConv.title;
    } else {
      const { data } = await supabase.from('ai_conversations')
        .insert({ user_id: user.id, agent_id: selectedAgent.id, title: 'New Session' })
        .select().single();
      if (!data) { setError('Failed to start session'); return; }
      setSelectedConv(data);
      loadConversations();
      convId = data.id;
      convTitle = data.title;
    }

    setPhase('thinking');
    setError(null);
    const text = input.trim();
    setInput('');

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, created_at: new Date().toISOString(), tokens_used: 0 };
    setMessages(prev => [...prev, userMsg]);

    try {
      await supabase.from('ai_messages').insert({ conversation_id: convId, role: 'user', content: text });
      const hdrs = await getAuthHeaders();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          provider: selectedAgent.provider, model: selectedAgent.model,
          messages: [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: text }],
          system_prompt: buildSystemPrompt(selectedAgent),
          temperature: selectedAgent.temperature, max_tokens: selectedAgent.max_tokens,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const d = await res.json();
      const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: d.content, created_at: new Date().toISOString(), tokens_used: d.tokens_used || 0, model_used: d.model };
      setMessages(prev => [...prev, assistantMsg]);
      await supabase.from('ai_messages').insert({ conversation_id: convId, role: 'assistant', content: d.content, tokens_used: d.tokens_used || 0, model_used: d.model });
      await supabase.from('ai_conversations').update({ message_count: messages.length + 2, last_message_at: new Date().toISOString(), title: messages.length === 0 ? text.substring(0, 60) : convTitle }).eq('id', convId);
      loadConversations();
      setPhase('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
      setPhase('error');
      setTimeout(() => setPhase('idle'), 3000);
    }
  };

  // ── Council broadcast ──────────────────────────────────────────────────────

  const broadcastToCouncil = async () => {
    const prompt = input.trim();
    if (!prompt || phase !== 'idle') return;

    const council = agents.filter(a => activeAgentIds.has(a.id));
    if (council.length < 2) { setError('Enable at least 2 agents for Council mode.'); return; }

    setPhase('broadcasting');
    setCouncilPrompt(prompt);
    setCouncilResponses([]);
    setDeliberations([]);
    setSynthesis(null);
    setError(null);
    setCurrentSlide(0);
    setInput('');

    const hdrs = await getAuthHeaders();

    const dispatches = council.map(async (agent): Promise<CouncilResponse> => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            provider: agent.provider, model: agent.model,
            messages: [{ role: 'user', content: prompt }],
            system_prompt: buildSystemPrompt(agent),
            temperature: agent.temperature, max_tokens: agent.max_tokens,
          }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
        const d = await res.json();
        return { id: crypto.randomUUID(), agent_id: agent.id, agent_name: agent.name, provider: agent.provider, model: agent.model, content: d.content, tokens_used: d.tokens_used || 0 };
      } catch (err) {
        return { id: crypto.randomUUID(), agent_id: agent.id, agent_name: agent.name, provider: agent.provider, model: agent.model, content: '', tokens_used: 0, error: err instanceof Error ? err.message : 'Failed' };
      }
    });

    const results = await Promise.all(dispatches);
    setCouncilResponses(results);
    setPhase('done');
  };

  const runDeliberation = async () => {
    const successful = councilResponses.filter(r => !r.error && r.content);
    if (successful.length < 2) { setError('Deliberation requires at least 2 successful council responses.'); return; }

    setPhase('deliberating');
    setDeliberations([]);
    setSynthesis(null);
    setError(null);

    try {
      const hdrs = await getAuthHeaders();
      const personasPayload: Record<string, string> = {};
      for (const r of successful) {
        const agent = agents.find(a => a.id === r.agent_id);
        if (agent) {
          const personaKey = agentPersonas[agent.id] || 'none';
          const persona = PERSONAS[personaKey];
          if (persona?.deliberation_signature) personasPayload[r.agent_name] = persona.deliberation_signature;
        }
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/t6-deliberate`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          prompt: councilPrompt,
          responses: successful.map(r => ({ id: r.id, agent_name: r.agent_name, provider: r.provider, model: r.model, content: r.content })),
          personas: personasPayload,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const d = await res.json();
      setDeliberations(d.deliberations ?? []);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deliberation failed');
      setPhase('error');
      setTimeout(() => setPhase('done'), 3000);
    }
  };

  const runSynthesis = async () => {
    const successful = councilResponses.filter(r => !r.error && r.content);
    if (successful.length === 0) return;

    setPhase('synthesizing');
    setSynthesis(null);
    setError(null);

    try {
      const hdrs = await getAuthHeaders();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/t6-synthesize`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          prompt: councilPrompt,
          responses: successful.map(r => ({ agent_name: r.agent_name, content: r.content })),
          deliberations: deliberations.length > 0 ? deliberations : undefined,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const d = await res.json();
      setSynthesis(d);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthesis failed');
      setPhase('error');
      setTimeout(() => setPhase('done'), 3000);
    }
  };

  const handleSend = () => {
    if (mode === 'single') sendSingle();
    else broadcastToCouncil();
  };

  const canDeliberate = mode === 'council' && phase === 'done' && councilResponses.filter(r => !r.error).length >= 2 && deliberations.length === 0;
  const canSynthesize = mode === 'council' && phase === 'done' && councilResponses.filter(r => !r.error).length > 0 && synthesis === null;
  const isBusy = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  if (!user) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: 'JetBrains Mono, monospace', color: C.text }}>
        <div style={{ textAlign: 'center' }}>
          <T6Orb state="idle" size={60} />
          <div style={{ marginTop: 12, fontSize: '0.75rem' }}>Sign in to access T6</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', background: C.bg, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: C.textLight }}>

      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, background: C.surface }}>
          {/* Mode toggle */}
          <div style={{ padding: '10px 10px 6px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['single', 'council'] as T6Mode[]).map(m => (
                <button key={m} onClick={() => { setMode(m); setPhase('idle'); }}
                  style={{ flex: 1, padding: '5px 0', fontSize: '0.6rem', letterSpacing: '0.08em', borderRadius: 4, cursor: 'pointer', border: `1px solid ${mode === m ? accentColor + '60' : C.border}`, background: mode === m ? `${accentColor}12` : 'transparent', color: mode === m ? accentColor : C.text }}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Agent list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {agents.map(a => {
                const color = AGENT_COLOR[a.provider] ?? C.cyan;
                const isSelected = mode === 'single' && selectedAgent?.id === a.id;
                const isActive = activeAgentIds.has(a.id);
                const personaKey = agentPersonas[a.id] || 'none';

                return (
                  <div key={a.id} style={{ border: `1px solid ${isSelected ? color + '50' : C.border}`, borderRadius: 5, background: isSelected ? `${color}08` : 'transparent', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', gap: 6 }}>
                      {mode === 'council' && (
                        <button onClick={() => setActiveAgentIds(prev => { const s = new Set(prev); s.has(a.id) ? s.delete(a.id) : s.add(a.id); return s; })}
                          style={{ width: 14, height: 14, borderRadius: 2, border: `1px solid ${isActive ? color : C.dim}`, background: isActive ? `${color}30` : 'transparent', cursor: 'pointer', flexShrink: 0 }} />
                      )}
                      <button onClick={() => { setSelectedAgent(a); if (mode === 'single' && selectedConv?.agent_id !== a.id) { setSelectedConv(null); setMessages([]); } }}
                        style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: isSelected ? color : C.textLight, fontSize: '0.68rem', padding: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}` }} />
                          {a.name}
                        </div>
                        <div style={{ color: C.dim, fontSize: '0.55rem', marginTop: 1 }}>{a.model.split('-').slice(0, 2).join('-')}</div>
                      </button>
                    </div>
                    {/* Persona badge */}
                    <div style={{ padding: '3px 8px', borderTop: `1px solid ${C.border}30` }}>
                      {personaPickerFor === a.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {Object.entries(PERSONAS).map(([key, p]) => (
                            <button key={key} onClick={() => { setAgentPersonas(prev => ({ ...prev, [a.id]: key })); setPersonaPickerFor(null); }}
                              style={{ fontSize: '0.55rem', padding: '2px 6px', textAlign: 'left', borderRadius: 3, cursor: 'pointer', color: p.color, border: `1px solid ${personaKey === key ? p.color + '60' : C.border}`, background: personaKey === key ? `${p.color}15` : 'transparent' }}>
                              {p.icon} {p.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <PersonaBadge persona={personaKey} onClick={() => setPersonaPickerFor(personaPickerFor === a.id ? null : a.id)} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conversation list (single mode only) */}
          {mode === 'single' && (
            <>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
                <button onClick={createConversation} disabled={!selectedAgent}
                  style={{ width: '100%', padding: '5px 0', fontSize: '0.6rem', letterSpacing: '0.06em', borderRadius: 4, cursor: selectedAgent ? 'pointer' : 'default', border: `1px solid ${accentColor}30`, background: `${accentColor}10`, color: accentColor, opacity: selectedAgent ? 1 : 0.4 }}>
                  + NEW SESSION
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {conversations.length === 0
                  ? <div style={{ padding: '16px 12px', color: C.dim, fontSize: '0.62rem', textAlign: 'center' }}>No sessions yet</div>
                  : conversations.map(conv => (
                    <button key={conv.id} onClick={() => { setSelectedConv(conv); loadMessages(conv.id); }}
                      style={{ width: '100%', padding: '8px 10px', textAlign: 'left', background: selectedConv?.id === conv.id ? `${accentColor}08` : 'transparent', cursor: 'pointer', color: C.textLight, border: 'none', borderBottom: `1px solid ${C.border}`, borderLeft: `2px solid ${selectedConv?.id === conv.id ? accentColor : 'transparent'}` }}>
                      <div style={{ fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
                      <div style={{ color: C.dim, fontSize: '0.58rem', marginTop: 2 }}>{conv.message_count || 0} msgs</div>
                    </button>
                  ))
                }
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Main panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setSidebarOpen(o => !o)} style={{ fontSize: '0.6rem', padding: '3px 7px', border: `1px solid ${C.border}`, borderRadius: 3, background: 'transparent', color: C.text, cursor: 'pointer' }}>
              {sidebarOpen ? '◁' : '▷'}
            </button>
            <T6Orb state={orbState} size={36} />
            <div>
              <div style={{ color: C.textLight, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em' }}>Thamos</div>
              <div style={{ color: C.dim, fontSize: '0.55rem' }}>{mode === 'council' ? `Council · ${activeAgentIds.size} agents` : selectedAgent?.name ?? 'No agent'}</div>
            </div>
          </div>
          {mode === 'council' && phase === 'done' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {canDeliberate && (
                <button onClick={runDeliberation}
                  style={{ fontSize: '0.6rem', padding: '4px 12px', border: `1px solid ${C.amber}40`, borderRadius: 4, background: `${C.amber}10`, color: C.amber, cursor: 'pointer', letterSpacing: '0.06em' }}>
                  DELIBERATE
                </button>
              )}
              {canSynthesize && (
                <button onClick={runSynthesis}
                  style={{ fontSize: '0.6rem', padding: '4px 12px', border: `1px solid ${C.green}40`, borderRadius: 4, background: `${C.green}10`, color: C.green, cursor: 'pointer', letterSpacing: '0.06em' }}>
                  SYNTHESIZE
                </button>
              )}
              <button onClick={() => { setPhase('idle'); setCouncilResponses([]); setDeliberations([]); setSynthesis(null); setCouncilPrompt(''); }}
                style={{ fontSize: '0.6rem', padding: '4px 10px', border: `1px solid ${C.border}`, borderRadius: 4, background: 'transparent', color: C.dim, cursor: 'pointer' }}>
                NEW
              </button>
            </div>
          )}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {mode === 'single' ? (
            // ── Single chat view ──
            !selectedConv ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <T6Orb state="idle" size={90} />
                <div style={{ textAlign: 'center', color: C.text, fontSize: '0.72rem' }}>
                  {selectedAgent ? `Ready to talk with ${selectedAgent.name}` : 'Select an agent to begin'}
                </div>
                <button onClick={createConversation} disabled={!selectedAgent}
                  style={{ padding: '6px 20px', fontSize: '0.65rem', letterSpacing: '0.08em', borderRadius: 5, border: `1px solid ${accentColor}40`, background: `${accentColor}12`, color: accentColor, cursor: selectedAgent ? 'pointer' : 'default', opacity: selectedAgent ? 1 : 0.5 }}>
                  START SESSION
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', gap: 10, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'assistant' && (
                      <div style={{ width: 22, height: 22, borderRadius: 4, background: `${accentColor}15`, border: `1px solid ${accentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span style={{ color: accentColor, fontSize: '0.6rem' }}>A</span>
                      </div>
                    )}
                    <div style={{ maxWidth: '80%', borderRadius: 8, padding: '10px 14px', background: msg.role === 'user' ? `${accentColor}10` : C.surface, border: `1px solid ${msg.role === 'user' ? accentColor + '28' : C.border}` }}>
                      <div style={{ fontSize: '0.71rem', lineHeight: 1.65, color: C.textLight }}>
                        {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                      </div>
                      {msg.tokens_used > 0 && <div style={{ marginTop: 6, color: C.dim, fontSize: '0.58rem' }}>{msg.tokens_used} tokens{msg.model_used ? ` · ${msg.model_used}` : ''}</div>}
                    </div>
                    {msg.role === 'user' && (
                      <div style={{ width: 22, height: 22, borderRadius: 4, background: C.surfaceAlt, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span style={{ color: C.dim, fontSize: '0.6rem' }}>U</span>
                      </div>
                    )}
                  </div>
                ))}
                {phase === 'thinking' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 4, background: `${accentColor}15`, border: `1px solid ${accentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: accentColor, fontSize: '0.6rem' }} className="animate-pulse">A</span>
                    </div>
                    <div style={{ borderRadius: 8, padding: '10px 14px', background: C.surface, border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {[0, 150, 300].map(d => <div key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: accentColor }} className="animate-pulse" />)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )
          ) : (
            // ── Council view ──
            councilResponses.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <T6Orb state={phaseToOrbState(phase)} size={100} />
                <div style={{ textAlign: 'center', color: C.text, fontSize: '0.72rem', maxWidth: 320 }}>
                  {isBusy ? 'Broadcasting to council...' : 'Broadcast your question to all active council agents simultaneously.'}
                </div>
                {!isBusy && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {agents.filter(a => activeAgentIds.has(a.id)).map(a => (
                      <div key={a.id} style={{ width: 8, height: 8, borderRadius: '50%', background: AGENT_COLOR[a.provider] ?? C.cyan, boxShadow: `0 0 6px ${AGENT_COLOR[a.provider] ?? C.cyan}` }} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Council prompt echo */}
                <div style={{ padding: '8px 12px', borderRadius: 6, background: `${accentColor}08`, border: `1px solid ${accentColor}20`, color: C.textLight, fontSize: '0.72rem' }}>
                  <span style={{ color: C.dim, fontSize: '0.6rem' }}>COUNCIL PROMPT · </span>
                  {councilPrompt}
                </div>

                {/* Carousel nav strip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
                    disabled={currentSlide === 0}
                    style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: currentSlide === 0 ? C.dim : C.textLight, cursor: currentSlide === 0 ? 'default' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'color 0.15s' }}
                  >←</button>

                  {/* Dot indicators */}
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                    {councilResponses.map((r, i) => {
                      const dotColor = r.error ? C.rose : (AGENT_COLOR[r.provider] ?? C.cyan);
                      const active = i === currentSlide;
                      return (
                        <button key={r.id} onClick={() => setCurrentSlide(i)} title={r.agent_name}
                          style={{ height: 6, width: active ? 22 : 6, borderRadius: 3, border: 'none', background: active ? dotColor : C.dim, cursor: 'pointer', transition: 'all 0.2s', padding: 0, flexShrink: 0 }} />
                      );
                    })}
                  </div>

                  <span style={{ color: C.dim, fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
                    {currentSlide + 1} / {councilResponses.length}
                  </span>
                  <span style={{ color: C.dim, fontSize: '0.55rem', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0, marginLeft: 4 }}>← → keys</span>

                  <button
                    onClick={() => setCurrentSlide(s => Math.min(councilResponses.length - 1, s + 1))}
                    disabled={currentSlide === councilResponses.length - 1}
                    style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: currentSlide === councilResponses.length - 1 ? C.dim : C.textLight, cursor: currentSlide === councilResponses.length - 1 ? 'default' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'color 0.15s' }}
                  >→</button>
                </div>

                {/* Current slide */}
                {(() => {
                  const r = councilResponses[currentSlide];
                  if (!r) return null;
                  const color = r.error ? C.rose : (AGENT_COLOR[r.provider] ?? C.cyan);
                  const delib = deliberations.find(d => d.source_id === r.id);
                  const agentForCard = agents.find(a => a.id === r.agent_id);
                  const personaKey = agentForCard ? (agentPersonas[agentForCard.id] || 'none') : 'none';
                  const persona = PERSONAS[personaKey] || PERSONAS.none;
                  return (
                    <div style={{ border: `1px solid ${color}30`, borderRadius: 8, overflow: 'hidden', background: C.surface }}>
                      {/* Header */}
                      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${color}20`, background: `${color}08`, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
                        <span style={{ color, fontSize: '0.68rem', letterSpacing: '0.08em', fontWeight: 600 }}>{r.agent_name.toUpperCase()}</span>
                        <span style={{ color: C.dim, fontSize: '0.58rem' }}>{r.model}</span>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.tokens_used > 0 && <span style={{ color: C.dim, fontSize: '0.57rem' }}>{r.tokens_used} tk</span>}
                          {personaKey !== 'none' && (
                            <span style={{ fontSize: '0.55rem', padding: '1px 6px', borderRadius: 3, color: persona.color, border: `1px solid ${persona.color}30`, background: `${persona.color}10` }}>
                              {persona.icon} {persona.name.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Content — full width, generous padding */}
                      <div style={{ padding: '16px 18px', fontSize: '0.72rem', lineHeight: 1.75, color: r.error ? C.rose : C.textLight }}>
                        {r.error ? `Error: ${r.error}` : renderMarkdown(r.content)}
                      </div>
                      {delib && <DeliberationCard result={delib} />}
                    </div>
                  );
                })()}

                {/* Synthesis — pinned below carousel */}
                {synthesis && <SynthesisPanel synthesis={synthesis} />}

                {/* Loading states */}
                {phase === 'deliberating' && (
                  <div style={{ textAlign: 'center', padding: 16, color: C.amber, fontSize: '0.65rem' }}>
                    <T6Orb state="deliberating" size={36} />
                    <div style={{ marginTop: 8 }}>Each analyst reading the others' work...</div>
                  </div>
                )}
                {phase === 'synthesizing' && (
                  <div style={{ textAlign: 'center', padding: 16, color: C.green, fontSize: '0.65rem' }}>
                    <T6Orb state="synthesizing" size={36} />
                    <div style={{ marginTop: 8 }}>Synthesizing perspectives...</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )
          )}
        </div>

        {/* Error bar */}
        {error && (
          <div style={{ padding: '6px 14px', background: `${C.rose}08`, borderTop: `1px solid ${C.rose}30` }}>
            <span style={{ color: C.rose, fontSize: '0.65rem' }}>[ERROR] {error}</span>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.surface }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={mode === 'council' ? 'Broadcast to council... (Enter to send)' : `Message ${selectedAgent?.name ?? 'agent'}...`}
              disabled={isBusy}
              rows={1}
              style={{ flex: 1, padding: '8px 12px', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace', background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textLight, resize: 'none', outline: 'none' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isBusy}
              style={{ padding: '8px 16px', fontSize: '0.65rem', letterSpacing: '0.08em', borderRadius: 6, border: `1px solid ${input.trim() && !isBusy ? accentColor + '50' : C.border}`, background: input.trim() && !isBusy ? `${accentColor}15` : 'transparent', color: input.trim() && !isBusy ? accentColor : C.dim, cursor: input.trim() && !isBusy ? 'pointer' : 'default', transition: 'all 0.2s', flexShrink: 0 }}>
              {mode === 'council' ? 'BROADCAST' : 'SEND'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
