import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AgentConfigModal from '../components/workshop/AgentConfigModal';
import ConversationSidebar from '../components/workshop/ConversationSidebar';
import ChatMessages from '../components/workshop/ChatMessages';
import ChatInput from '../components/workshop/ChatInput';
import {
  Bot,
  Settings,
  FileCode,
  Sparkles,
  MessageSquare,
  AlertTriangle
} from 'lucide-react';

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

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  tokens_used: number;
  model_used?: string;
}

const DEFAULT_AGENTS = [
  { name: 'Claude', provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514', system_prompt: 'You are Claude, a helpful AI assistant operating within Maestro. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 8192, is_default: true },
  { name: 'GPT', provider: 'openai' as const, model: 'gpt-4.1', system_prompt: 'You are GPT, a helpful AI assistant operating within Maestro. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 8192, is_default: false },
  { name: 'Gemini', provider: 'google' as const, model: 'gemini-2.5-pro', system_prompt: 'You are Gemini, a helpful AI assistant operating within Maestro. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 8192, is_default: false },
];

export default function AIWorkshop() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const loadAgents = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('ai_agents')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      // Migrate old ThamOS-named agents to new names/models
      const MIGRATION_MAP: Record<string, { name: string; model: string }> = {
        'ThamOS-X': { name: 'Claude', model: 'claude-sonnet-4-20250514' },
        'ThamOS-Y': { name: 'GPT', model: 'gpt-4.1' },
        'ThamOS-Z': { name: 'Gemini', model: 'gemini-2.5-pro' },
        'GPT-4o': { name: 'GPT', model: 'gpt-4.1' },
        'Claude 3.5 Sonnet': { name: 'Claude', model: 'claude-sonnet-4-20250514' },
        'Gemini Pro': { name: 'Gemini', model: 'gemini-2.5-pro' },
      };
      let needsReload = false;
      for (const agent of data) {
        const migration = MIGRATION_MAP[agent.name];
        if (migration) {
          await supabase.from('ai_agents').update({
            name: migration.name,
            model: migration.model,
          }).eq('id', agent.id);
          needsReload = true;
        }
      }
      if (needsReload) {
        const { data: refreshed } = await supabase
          .from('ai_agents')
          .select('*')
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false });
        if (refreshed) {
          setAgents(refreshed);
          if (!selectedAgent) setSelectedAgent(refreshed.find(a => a.is_default) || refreshed[0]);
          return;
        }
      }
      setAgents(data);
      if (!selectedAgent) setSelectedAgent(data.find(a => a.is_default) || data[0]);
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

  const sendMessage = async (input: string) => {
    if (!input.trim() || !selectedAgent || !selectedConversation || isSending) return;

    setIsSending(true);
    setError(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
      tokens_used: 0,
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      await supabase.from('ai_messages').insert({
        conversation_id: selectedConversation.id,
        role: 'user',
        content: input.trim(),
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
          messages: [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: input.trim() }],
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
          title: messages.length === 0 ? input.trim().substring(0, 60) : selectedConversation.title,
        })
        .eq('id', selectedConversation.id);

      loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Bot className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Sign in to use Maestro</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-900 rounded-lg overflow-hidden border border-gray-700/50">
      <ConversationSidebar
        conversations={conversations}
        selectedId={selectedConversation?.id || null}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onNew={createNewConversation}
        hasAgent={!!selectedAgent}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 bg-gray-800/50">
          <div className="flex items-center gap-3">
            <select
              value={selectedAgent?.id || ''}
              onChange={(e) => setSelectedAgent(agents.find(a => a.id === e.target.value) || null)}
              className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.model})
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowAgentConfig(true)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title="Configure Agents"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {selectedConversation && (
              <span>{selectedConversation.total_tokens || 0} tokens used</span>
            )}
          </div>
        </div>

        {!selectedConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Sparkles className="w-16 h-16 text-cyan-500 mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Maestro</h2>
            <p className="text-gray-400 max-w-md mb-6">
              Chat with Claude, GPT, and Gemini using your own API keys. Configure keys in Settings.
            </p>
            <button
              onClick={createNewConversation}
              disabled={!selectedAgent}
              className="px-6 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors"
            >
              Start New Chat
            </button>
          </div>
        ) : (
          <>
            <ChatMessages
              messages={messages}
              isSending={isSending}
              messagesEndRef={messagesEndRef}
            />
            {error && (
              <div className="px-4 py-2 bg-red-900/30 border-t border-red-800/50 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}
            <ChatInput onSend={sendMessage} disabled={isSending} />
          </>
        )}
      </div>

      {showAgentConfig && (
        <AgentConfigModal
          agents={agents}
          onClose={() => setShowAgentConfig(false)}
          onSave={() => { loadAgents(); setShowAgentConfig(false); }}
          userId={user.id}
        />
      )}
    </div>
  );
}
