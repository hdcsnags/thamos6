import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

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

interface Conversation {
  id: string;
  title: string;
  agent_id: string;
  last_message_at: string;
  message_count: number;
  total_tokens: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  tokens_used: number;
  model_used?: string;
}

const DEFAULT_AGENTS = [
  { name: 'ThamOS-X', provider: 'anthropic' as const, model: 'claude-3-5-sonnet-20241022', system_prompt: 'You are ThamOS-X, a cybersecurity-focused AI assistant. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 4096, is_default: true },
  { name: 'ThamOS-Y', provider: 'openai' as const, model: 'gpt-4o', system_prompt: 'You are ThamOS-Y, a cybersecurity-focused AI assistant. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 4096, is_default: false },
  { name: 'ThamOS-Z', provider: 'google' as const, model: 'gemini-pro', system_prompt: 'You are ThamOS-Z, a cybersecurity-focused AI assistant. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 4096, is_default: false },
];

const AGENT_COLORS: Record<string, string> = {
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

function renderMarkdown(text: string): React.ReactNode {
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
        parts.push(
          <div key={key++} style={{ backgroundColor: '#0a0e1a', border: '1px solid #1a1f35', borderRadius: '6px', padding: '8px 12px', margin: '6px 0', overflowX: 'auto' }}>
            {codeLang && <div style={{ color: '#3a3f55', fontSize: '0.65rem', marginBottom: '4px' }}>{codeLang}</div>}
            <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#00ff9d', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{codeBuffer.join('\n')}</pre>
          </div>
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
    parts.push(
      <div key={key++} style={{ backgroundColor: '#0a0e1a', border: '1px solid #1a1f35', borderRadius: '6px', padding: '8px 12px', margin: '6px 0' }}>
        <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#00ff9d', margin: 0, whiteSpace: 'pre-wrap' }}>{codeBuffer.join('\n')}</pre>
      </div>
    );
  }

  return parts;
}

export function DesktopWorkshop() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const loadAgents = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('ai_agents')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      setAgents(data);
      if (!selectedAgent) setSelectedAgent(data.find((a: Agent) => a.is_default) || data[0]);
    } else if (data && data.length === 0) {
      const inserts = DEFAULT_AGENTS.map(a => ({ ...a, user_id: user.id }));
      await supabase.from('ai_agents').insert(inserts);
      const { data: newData } = await supabase
        .from('ai_agents')
        .select('*')
        .order('is_default', { ascending: false });
      if (newData) {
        setAgents(newData);
        setSelectedAgent(newData[0]);
      }
    }
  }, [user, selectedAgent]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('ai_conversations')
      .select('*')
      .order('last_message_at', { ascending: false });
    if (data) setConversations(data);
  }, [user]);

  useEffect(() => {
    if (user) {
      loadAgents();
      loadConversations();
    }
  }, [user, loadAgents, loadConversations]);

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const createNewConversation = async () => {
    if (!selectedAgent || !user) return;
    const { data } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id, agent_id: selectedAgent.id, title: 'New Conversation' })
      .select()
      .single();
    if (data) {
      setSelectedConversation(data);
      setMessages([]);
      loadConversations();
    }
  };

  const selectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    loadMessages(conv.id);
  };

  const deleteConversation = async (id: string) => {
    await supabase.from('ai_conversations').delete().eq('id', id);
    if (selectedConversation?.id === id) {
      setSelectedConversation(null);
      setMessages([]);
    }
    loadConversations();
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedAgent || !selectedConversation || isSending) return;

    setIsSending(true);
    setError(null);
    const content = input.trim();
    setInput('');

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      tokens_used: 0,
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      await supabase.from('ai_messages').insert({
        conversation_id: selectedConversation.id,
        role: 'user',
        content,
      });

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: selectedAgent.provider,
          model: selectedAgent.model,
          messages: [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content }],
          system_prompt: selectedAgent.system_prompt,
          temperature: selectedAgent.temperature,
          max_tokens: selectedAgent.max_tokens,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${response.status})`);
      }

      const data = await response.json();
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        created_at: new Date().toISOString(),
        tokens_used: data.tokens_used || 0,
        model_used: data.model,
      };
      setMessages(prev => [...prev, assistantMsg]);

      await supabase.from('ai_messages').insert({
        conversation_id: selectedConversation.id,
        role: 'assistant',
        content: data.content,
        tokens_used: data.tokens_used || 0,
        model_used: data.model,
      });

      await supabase
        .from('ai_conversations')
        .update({
          message_count: messages.length + 2,
          total_tokens: (selectedConversation.total_tokens || 0) + (data.tokens_used || 0),
          last_message_at: new Date().toISOString(),
          title: messages.length === 0 ? content.substring(0, 60) : selectedConversation.title,
        })
        .eq('id', selectedConversation.id);

      loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const agentColor = selectedAgent ? AGENT_COLORS[selectedAgent.provider] || '#00d9ff' : '#00d9ff';

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: P.void, color: P.text }}>
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-50">&#9632;</div>
          <div className="text-sm">Sign in to access AI Workshop</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {sidebarOpen && (
        <div className="w-56 flex flex-col flex-shrink-0" style={{ backgroundColor: P.surface, borderRight: `1px solid ${P.border}` }}>
          <div className="p-3" style={{ borderBottom: `1px solid ${P.border}` }}>
            <div className="flex items-center gap-2 mb-3">
              {agents.map(a => {
                const c = AGENT_COLORS[a.provider] || '#00d9ff';
                const isActive = selectedAgent?.id === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgent(a)}
                    className="flex-1 py-1.5 text-xs font-medium rounded transition-all"
                    style={{
                      backgroundColor: isActive ? `${c}15` : 'transparent',
                      border: `1px solid ${isActive ? `${c}40` : P.border}`,
                      color: isActive ? c : P.text,
                    }}
                    title={a.name}
                  >
                    {a.name.replace('ThamOS-', '')}
                  </button>
                );
              })}
            </div>
            <button
              onClick={createNewConversation}
              disabled={!selectedAgent}
              className="w-full py-2 text-xs font-medium rounded transition-all"
              style={{
                backgroundColor: `${agentColor}15`,
                border: `1px solid ${agentColor}30`,
                color: agentColor,
                opacity: selectedAgent ? 1 : 0.4,
              }}
            >
              + NEW CHAT
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-xs" style={{ color: P.dim }}>
                No conversations
              </div>
            ) : (
              conversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className="w-full p-3 text-left transition-all group"
                  style={{
                    borderBottom: `1px solid ${P.border}`,
                    backgroundColor: selectedConversation?.id === conv.id ? `${agentColor}08` : 'transparent',
                    borderLeft: selectedConversation?.id === conv.id ? `2px solid ${agentColor}` : '2px solid transparent',
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: P.textLight }}>{conv.title}</p>
                      <p className="text-xs mt-1" style={{ color: P.dim }}>
                        {conv.message_count || 0} msgs
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      style={{ color: P.dim }}
                    >
                      <span className="text-xs">x</span>
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-xs px-2 py-1 rounded transition-all"
              style={{ color: P.text, border: `1px solid ${P.border}` }}
            >
              {sidebarOpen ? '<<' : '>>'}
            </button>
            {selectedAgent && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agentColor, boxShadow: `0 0 6px ${agentColor}60` }} />
                <span className="text-xs font-medium" style={{ color: agentColor }}>{selectedAgent.name}</span>
                <span className="text-xs" style={{ color: P.dim }}>{selectedAgent.model}</span>
              </div>
            )}
          </div>
          {selectedConversation && (
            <span className="text-xs" style={{ color: P.dim }}>
              {selectedConversation.total_tokens || 0} tokens
            </span>
          )}
        </div>

        {!selectedConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${agentColor}10`, border: `1px solid ${agentColor}25` }}>
              <span className="text-2xl" style={{ color: agentColor }}>&#9670;</span>
            </div>
            <h2 className="text-base font-medium mb-2" style={{ color: P.textLight }}>AI Workshop</h2>
            <p className="text-xs text-center max-w-sm mb-6" style={{ color: P.text }}>
              Interface with Claude, GPT, and Gemini through ThamOS agents. Configure API keys in Settings.
            </p>
            <button
              onClick={createNewConversation}
              disabled={!selectedAgent}
              className="px-6 py-2 text-xs font-medium rounded transition-all"
              style={{
                backgroundColor: `${agentColor}20`,
                border: `1px solid ${agentColor}40`,
                color: agentColor,
              }}
            >
              START NEW SESSION
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${agentColor}15`, border: `1px solid ${agentColor}30` }}>
                      <span className="text-xs" style={{ color: agentColor }}>A</span>
                    </div>
                  )}
                  <div
                    className="max-w-[80%] rounded-lg px-4 py-3"
                    style={{
                      backgroundColor: msg.role === 'user' ? `${agentColor}10` : P.surface,
                      border: `1px solid ${msg.role === 'user' ? `${agentColor}25` : P.border}`,
                    }}
                  >
                    <div className="text-xs leading-relaxed break-words" style={{ fontFamily: 'JetBrains Mono, monospace', color: P.textLight }}>
                      {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                    </div>
                    {msg.tokens_used > 0 && (
                      <div className="mt-2 text-xs" style={{ color: P.dim }}>
                        {msg.tokens_used} tokens{msg.model_used ? ` | ${msg.model_used}` : ''}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}>
                      <span className="text-xs" style={{ color: P.text }}>U</span>
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: `${agentColor}15`, border: `1px solid ${agentColor}30` }}>
                    <span className="text-xs animate-pulse" style={{ color: agentColor }}>A</span>
                  </div>
                  <div className="rounded-lg px-4 py-3" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: agentColor, animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: agentColor, animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: agentColor, animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs" style={{ color: P.dim }}>Processing...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: 'rgba(255,0,128,0.08)', borderTop: '1px solid rgba(255,0,128,0.2)' }}>
                <span className="text-xs" style={{ color: '#ff0080' }}>[ERROR] {error}</span>
              </div>
            )}

            <div className="p-3" style={{ borderTop: `1px solid ${P.border}`, backgroundColor: P.surface }}>
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={`Message ${selectedAgent?.name || 'agent'}...`}
                  disabled={isSending}
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
                  onClick={sendMessage}
                  disabled={!input.trim() || isSending}
                  className="px-4 py-2 text-xs font-medium rounded transition-all flex-shrink-0"
                  style={{
                    backgroundColor: input.trim() && !isSending ? `${agentColor}20` : P.surfaceLight,
                    border: `1px solid ${input.trim() && !isSending ? `${agentColor}40` : P.border}`,
                    color: input.trim() && !isSending ? agentColor : P.dim,
                    cursor: input.trim() && !isSending ? 'pointer' : 'default',
                  }}
                >
                  SEND
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
