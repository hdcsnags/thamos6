import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Trash2, Save } from 'lucide-react';

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

const PROVIDER_MODELS: Record<string, { label: string; models: string[] }> = {
  openai: { label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'] },
  anthropic: { label: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'] },
  google: { label: 'Google', models: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
};

interface Props {
  agents: Agent[];
  onClose: () => void;
  onSave: () => void;
  userId: string;
}

export default function AgentConfigModal({ agents, onClose, onSave, userId }: Props) {
  const [editingAgent, setEditingAgent] = useState<Partial<Agent> | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!editingAgent?.name || !editingAgent?.provider || !editingAgent?.model) return;
    setSaving(true);

    try {
      if (editingAgent.id) {
        await supabase.from('ai_agents').update({
          name: editingAgent.name,
          provider: editingAgent.provider,
          model: editingAgent.model,
          system_prompt: editingAgent.system_prompt || '',
          temperature: editingAgent.temperature ?? 0.7,
          max_tokens: editingAgent.max_tokens ?? 4096,
        }).eq('id', editingAgent.id);
      } else {
        await supabase.from('ai_agents').insert({
          user_id: userId,
          name: editingAgent.name,
          provider: editingAgent.provider,
          model: editingAgent.model,
          system_prompt: editingAgent.system_prompt || '',
          temperature: editingAgent.temperature ?? 0.7,
          max_tokens: editingAgent.max_tokens ?? 4096,
          is_default: false,
        });
      }
      setEditingAgent(null);
      onSave();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('ai_agents').delete().eq('id', id);
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Agent Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-6 space-y-4">
          {agents.map(agent => (
            <div key={agent.id} className="p-4 bg-gray-700/50 border border-gray-600/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-white font-medium">{agent.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{agent.provider} / {agent.model}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingAgent(agent)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(agent.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 truncate">{agent.system_prompt || 'No system prompt'}</p>
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <span>Temp: {agent.temperature}</span>
                <span>Max tokens: {agent.max_tokens}</span>
              </div>
            </div>
          ))}

          {editingAgent ? (
            <div className="p-4 bg-gray-900/50 border border-cyan-500/30 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editingAgent.name || ''}
                    onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Provider</label>
                  <select
                    value={editingAgent.provider || 'openai'}
                    onChange={(e) => {
                      const provider = e.target.value as 'openai' | 'anthropic' | 'google';
                      setEditingAgent({ ...editingAgent, provider, model: PROVIDER_MODELS[provider].models[0] });
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500"
                  >
                    {Object.entries(PROVIDER_MODELS).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Model</label>
                <select
                  value={editingAgent.model || ''}
                  onChange={(e) => setEditingAgent({ ...editingAgent, model: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500"
                >
                  {PROVIDER_MODELS[editingAgent.provider || 'openai'].models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">System Prompt</label>
                <textarea
                  value={editingAgent.system_prompt || ''}
                  onChange={(e) => setEditingAgent({ ...editingAgent, system_prompt: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Temperature ({editingAgent.temperature ?? 0.7})</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={editingAgent.temperature ?? 0.7}
                    onChange={(e) => setEditingAgent({ ...editingAgent, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Max Tokens</label>
                  <input
                    type="number"
                    value={editingAgent.max_tokens ?? 4096}
                    onChange={(e) => setEditingAgent({ ...editingAgent, max_tokens: parseInt(e.target.value) || 4096 })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingAgent(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !editingAgent.name}
                  className="px-4 py-2 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingAgent({ provider: 'openai', model: 'gpt-4o', temperature: 0.7, max_tokens: 4096 })}
              className="w-full p-3 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add New Agent
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
