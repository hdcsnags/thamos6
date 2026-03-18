import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDesktop } from '../../contexts/DesktopContext';
import { supabase } from '../../lib/supabase';
import { useGitHub, type ContextFile } from '../../contexts/GitHubContext';
import { commitFile, fetchFileMeta } from '../../lib/github';
import { createArtifactFile } from '../editor/editorStore';
import CircuitMode from '../workshop/CircuitMode';

type WorkshopMode = 'single' | 'circuit';

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
  { name: 'Claude', provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514', system_prompt: 'You are Claude, a cybersecurity-focused AI assistant operating within ThamOS Maestro. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 8192, is_default: true },
  { name: 'GPT', provider: 'openai' as const, model: 'gpt-4.1', system_prompt: 'You are GPT, a cybersecurity-focused AI assistant operating within ThamOS Maestro. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 8192, is_default: false },
  { name: 'Gemini', provider: 'google' as const, model: 'gemini-2.5-pro', system_prompt: 'You are Gemini, a cybersecurity-focused AI assistant operating within ThamOS Maestro. Be concise, technical, and helpful.', temperature: 0.7, max_tokens: 8192, is_default: false },
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

function CodeBlock({
  code,
  lang,
  contextFiles,
  onCommit,
  onOpenInEditor,
  onDownload,
  onCopy,
}: {
  code: string;
  lang: string;
  contextFiles: ContextFile[];
  onCommit: (code: string, file: ContextFile) => void;
  onOpenInEditor: (code: string, lang: string) => void;
  onDownload: (code: string, lang: string) => void;
  onCopy: (code: string) => void;
}) {
  const [targetPath, setTargetPath] = useState('');
  const [showSelect, setShowSelect] = useState(false);
  const [copied, setCopied] = useState(false);

  const matchedFile = contextFiles.find(f => {
    const ext = f.path.split('.').pop() || '';
    const langMap: Record<string, string[]> = {
      typescript: ['ts', 'tsx'], javascript: ['js', 'jsx'],
      python: ['py'], ruby: ['rb'], rust: ['rs'], go: ['go'],
      java: ['java'], sql: ['sql'], bash: ['sh', 'bash'],
      yaml: ['yml', 'yaml'], json: ['json'], css: ['css'],
      scss: ['scss'], html: ['html'], markdown: ['md'],
    };
    const exts = langMap[lang.toLowerCase()] || [];
    return exts.includes(ext);
  });

  const canCommit = contextFiles.length > 0;
  const selectedFile = contextFiles.find(f => f.path === targetPath) || matchedFile;

  const handleCopy = () => {
    onCopy(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const btnStyle = (color: string, active = true): React.CSSProperties => ({
    color: active ? color : '#3a3f55',
    fontSize: '0.6rem',
    border: `1px solid ${active ? color + '30' : '#1a1f35'}`,
    borderRadius: '3px',
    padding: '1px 6px',
    backgroundColor: active ? color + '08' : 'transparent',
    cursor: active ? 'pointer' : 'default',
  });

  return (
    <div style={{ backgroundColor: '#0a0e1a', border: '1px solid #1a1f35', borderRadius: '6px', margin: '6px 0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '1px solid #1a1f3540' }}>
        <span style={{ color: '#3a3f55', fontSize: '0.65rem' }}>{lang || 'code'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button onClick={handleCopy} style={btnStyle('#8a8fa8')}>
            {copied ? 'COPIED' : 'COPY'}
          </button>
          <button onClick={() => onDownload(code, lang)} style={btnStyle('#00d9ff')}>
            DOWNLOAD
          </button>
          <button onClick={() => onOpenInEditor(code, lang)} style={btnStyle('#fbbf24')}>
            OPEN IN EDITOR
          </button>
          {canCommit && (
            <>
              {contextFiles.length > 1 && (
                <button
                  onClick={() => setShowSelect(!showSelect)}
                  style={{ color: '#3a3f55', fontSize: '0.6rem', border: '1px solid #1a1f35', borderRadius: '3px', padding: '1px 6px', backgroundColor: 'transparent', cursor: 'pointer' }}
                >
                  {selectedFile ? selectedFile.path.split('/').pop() : 'SELECT'}
                </button>
              )}
              <button
                onClick={() => selectedFile && onCommit(code, selectedFile)}
                disabled={!selectedFile}
                style={btnStyle('#00ff9d', !!selectedFile)}
              >
                COMMIT{selectedFile ? ` > ${selectedFile.path.split('/').pop()}` : ''}
              </button>
            </>
          )}
        </div>
      </div>
      {showSelect && contextFiles.length > 1 && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid #1a1f3540', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {contextFiles.map(f => (
            <button
              key={f.path}
              onClick={() => { setTargetPath(f.path); setShowSelect(false); }}
              style={{
                color: targetPath === f.path ? '#00ff9d' : '#8a8fa8',
                fontSize: '0.6rem',
                border: `1px solid ${targetPath === f.path ? '#00ff9d30' : '#1a1f35'}`,
                borderRadius: '3px',
                padding: '1px 6px',
                backgroundColor: 'transparent',
                cursor: 'pointer',
              }}
            >
              {f.path}
            </button>
          ))}
        </div>
      )}
      <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#00ff9d', margin: 0, padding: '8px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{code}</pre>
    </div>
  );
}

function renderMarkdown(
  text: string,
  contextFiles: ContextFile[],
  onCommit: (code: string, file: ContextFile) => void,
  onOpenInEditor: (code: string, lang: string) => void,
  onDownload: (code: string, lang: string) => void,
  onCopy: (code: string) => void
): React.ReactNode {
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
        const capturedCode = codeBuffer.join('\n');
        const capturedLang = codeLang;
        parts.push(
          <CodeBlock key={key++} code={capturedCode} lang={capturedLang} contextFiles={contextFiles} onCommit={onCommit} onOpenInEditor={onOpenInEditor} onDownload={onDownload} onCopy={onCopy} />
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
    const capturedCode = codeBuffer.join('\n');
    const capturedLang = codeLang;
    parts.push(
      <CodeBlock key={key++} code={capturedCode} lang={capturedLang} contextFiles={contextFiles} onCommit={onCommit} />
    );
  }

  return parts;
}

export function DesktopWorkshop() {
  const { user } = useAuth();
  const desktop = useDesktop();
  const { contextFiles, unpinFile, activeProject, ghToken } = useGitHub();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mode, setMode] = useState<WorkshopMode>('single');
  const [leadAgentId, setLeadAgentId] = useState<string | null>(null);
  const [commitStatus, setCommitStatus] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
  const [attachedImages, setAttachedImages] = useState<{ data: string; name: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const buildSystemPrompt = useCallback((basePrompt: string): string => {
    if (!activeProject && contextFiles.length === 0) return basePrompt;
    const lines = [basePrompt, ''];
    if (activeProject) {
      lines.push(`## Active Project`);
      lines.push(`Repo: ${activeProject.repoFullName}`);
      lines.push(`Branch: ${activeProject.branch}`);
      lines.push('');
    }
    if (contextFiles.length > 0) {
      lines.push(`## Pinned Files (${contextFiles.length})`);
      for (const f of contextFiles) {
        lines.push(`### ${f.path}`);
        lines.push('```');
        lines.push(f.content.length > 6000 ? f.content.slice(0, 6000) + '\n... (truncated)' : f.content);
        lines.push('```');
        lines.push('');
      }
      lines.push('When proposing changes to these files, use code blocks with the same file extension so commits can be targeted correctly.');
    }
    return lines.join('\n');
  }, [activeProject, contextFiles]);

  const handleCommit = useCallback(async (code: string, file: ContextFile) => {
    if (!ghToken) {
      setCommitStatus({ status: 'error', message: 'No GitHub token available. Connect GitHub first.' });
      setTimeout(() => setCommitStatus(null), 4000);
      return;
    }
    setCommitStatus(null);
    try {
      const meta = await fetchFileMeta(ghToken, file.owner, file.repo, file.path);
      const commitMsg = `Update ${file.path.split('/').pop()} via ThamOS Maestro`;
      await commitFile(ghToken, file.owner, file.repo, file.path, code, meta.sha, commitMsg, file.branch);
      setCommitStatus({ status: 'success', message: `Committed to ${file.path}` });
      setTimeout(() => setCommitStatus(null), 4000);
    } catch (err) {
      setCommitStatus({ status: 'error', message: err instanceof Error ? err.message : 'Commit failed' });
      setTimeout(() => setCommitStatus(null), 6000);
    }
  }, [ghToken]);

  const LANG_EXT: Record<string, string> = {
    typescript: 'ts', tsx: 'tsx', javascript: 'js', jsx: 'jsx',
    python: 'py', ruby: 'rb', rust: 'rs', go: 'go',
    java: 'java', sql: 'sql', bash: 'sh', shell: 'sh',
    yaml: 'yml', json: 'json', css: 'css', scss: 'scss',
    html: 'html', xml: 'xml', markdown: 'md', c: 'c', cpp: 'cpp',
  };

  const handleOpenInEditor = useCallback((code: string, lang: string) => {
    const ext = LANG_EXT[lang.toLowerCase()] || lang.toLowerCase() || 'txt';
    const filename = `artifact.${ext}`;
    const file = createArtifactFile(filename, code);
    desktop.openWindow({
      appId: 'editor',
      title: `Editor - ${filename}`,
      data: { initialFile: file },
    });
  }, [desktop]);

  const handleDownloadArtifact = useCallback((code: string, lang: string) => {
    const ext = LANG_EXT[lang.toLowerCase()] || lang.toLowerCase() || 'txt';
    const filename = `artifact.${ext}`;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleCopyCode = useCallback(async (code: string) => {
    await navigator.clipboard.writeText(code);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const data = reader.result as string;
          setAttachedImages(prev => [...prev, { data, name: file.name || 'screenshot.png' }]);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        setAttachedImages(prev => [...prev, { data, name: file.name }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, []);

  const removeImage = useCallback((idx: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const sendMessage = async () => {
    if ((!input.trim() && attachedImages.length === 0) || !selectedAgent || !selectedConversation || isSending) return;

    setIsSending(true);
    setError(null);
    const textContent = input.trim();
    const images = [...attachedImages];
    setInput('');
    setAttachedImages([]);

    let content = textContent;
    if (images.length > 0) {
      content = textContent + (textContent ? '\n\n' : '') + images.map(img => `[Attached image: ${img.name}]`).join('\n');
    }

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
          system_prompt: buildSystemPrompt(selectedAgent.system_prompt),
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
          <div className="text-sm">Sign in to access Maestro</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {mode === 'single' && sidebarOpen && (
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
                    {a.name}
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
            {mode === 'single' && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-xs px-2 py-1 rounded transition-all"
                style={{ color: P.text, border: `1px solid ${P.border}` }}
              >
                {sidebarOpen ? '<<' : '>>'}
              </button>
            )}
            <div className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
              <button
                onClick={() => setMode('single')}
                className="px-2.5 py-1 text-xs transition-all"
                style={{
                  backgroundColor: mode === 'single' ? `${agentColor}15` : 'transparent',
                  color: mode === 'single' ? agentColor : P.dim,
                  fontSize: '0.65rem',
                }}
              >
                SINGLE
              </button>
              <button
                onClick={() => setMode('circuit')}
                className="px-2.5 py-1 text-xs transition-all"
                style={{
                  backgroundColor: mode === 'circuit' ? '#fbbf2415' : 'transparent',
                  color: mode === 'circuit' ? '#fbbf24' : P.dim,
                  borderLeft: `1px solid ${P.border}`,
                  fontSize: '0.65rem',
                }}
              >
                CIRCUIT
              </button>
            </div>
            {mode === 'single' && selectedAgent && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agentColor, boxShadow: `0 0 6px ${agentColor}60` }} />
                <span className="text-xs font-medium" style={{ color: agentColor }}>{selectedAgent.name}</span>
                <span className="text-xs" style={{ color: P.dim }}>{selectedAgent.model}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeProject && (
              <span className="text-xs" style={{ color: P.dim, fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ color: '#3a3f55' }}>repo:</span> {activeProject.repoFullName}
              </span>
            )}
            {mode === 'single' && selectedConversation && (
              <span className="text-xs" style={{ color: P.dim }}>
                {selectedConversation.total_tokens || 0} tokens
              </span>
            )}
          </div>
        </div>

        {mode === 'circuit' ? (
          <CircuitMode
            agents={agents}
            leadAgentId={leadAgentId || agents[0]?.id || null}
            onSetLead={setLeadAgentId}
          />
        ) : (
        <>

        {contextFiles.length > 0 && (
          <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: `${P.surface}` }}>
            <span className="text-xs" style={{ color: P.dim, fontFamily: 'JetBrains Mono, monospace' }}>context:</span>
            {contextFiles.map(f => (
              <div key={f.path} className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ backgroundColor: `${agentColor}08`, border: `1px solid ${agentColor}20` }}>
                <span className="text-xs" style={{ color: agentColor, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem' }}>
                  {f.path.split('/').pop()}
                </span>
                <button
                  onClick={() => unpinFile(f.path)}
                  className="ml-1 transition-opacity hover:opacity-100 opacity-50"
                  style={{ color: P.dim, fontSize: '0.6rem', lineHeight: 1 }}
                  title="Unpin file"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {commitStatus && (
          <div className="px-4 py-1.5" style={{
            borderBottom: `1px solid ${commitStatus.status === 'success' ? '#00ff9d30' : 'rgba(255,0,128,0.2)'}`,
            backgroundColor: commitStatus.status === 'success' ? '#00ff9d08' : 'rgba(255,0,128,0.08)',
          }}>
            <span className="text-xs" style={{ color: commitStatus.status === 'success' ? '#00ff9d' : '#ff0080', fontFamily: 'JetBrains Mono, monospace' }}>
              [{commitStatus.status.toUpperCase()}] {commitStatus.message}
            </span>
          </div>
        )}

        {!selectedConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${agentColor}10`, border: `1px solid ${agentColor}25` }}>
              <span className="text-2xl" style={{ color: agentColor }}>&#9670;</span>
            </div>
            <h2 className="text-base font-medium mb-2" style={{ color: P.textLight }}>Maestro</h2>
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
                      {msg.role === 'assistant' ? renderMarkdown(msg.content, contextFiles, handleCommit, handleOpenInEditor, handleDownloadArtifact, handleCopyCode) : msg.content}
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
              {attachedImages.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {attachedImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={img.data}
                        alt={img.name}
                        className="rounded"
                        style={{ height: '48px', width: '48px', objectFit: 'cover', border: `1px solid ${P.border}` }}
                      />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: P.surface, border: `1px solid ${P.border}`, color: P.text, fontSize: '8px', lineHeight: 1 }}
                      >
                        x
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 px-1 rounded-b" style={{ backgroundColor: 'rgba(0,0,0,0.7)', fontSize: '7px', color: P.dim, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {img.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-2 text-xs rounded transition-colors flex-shrink-0"
                  style={{ color: P.dim, border: `1px solid ${P.border}`, backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = P.surfaceLight; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  title="Attach image (or paste screenshot)"
                >
                  IMG
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  onPaste={handlePaste}
                  placeholder={`Message ${selectedAgent?.name || 'agent'}... (paste images here)`}
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
                  disabled={(!input.trim() && attachedImages.length === 0) || isSending}
                  className="px-4 py-2 text-xs font-medium rounded transition-all flex-shrink-0"
                  style={{
                    backgroundColor: (input.trim() || attachedImages.length > 0) && !isSending ? `${agentColor}20` : P.surfaceLight,
                    border: `1px solid ${(input.trim() || attachedImages.length > 0) && !isSending ? `${agentColor}40` : P.border}`,
                    color: (input.trim() || attachedImages.length > 0) && !isSending ? agentColor : P.dim,
                    cursor: (input.trim() || attachedImages.length > 0) && !isSending ? 'pointer' : 'default',
                  }}
                >
                  SEND
                </button>
              </div>
            </div>
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
