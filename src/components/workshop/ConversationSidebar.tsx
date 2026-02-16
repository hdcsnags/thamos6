import { Plus, Trash2, MessageSquare } from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
}

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  hasAgent: boolean;
}

export default function ConversationSidebar({ conversations, selectedId, onSelect, onDelete, onNew, hasAgent }: Props) {
  return (
    <div className="w-60 bg-gray-800/80 border-r border-gray-700/50 flex flex-col flex-shrink-0">
      <div className="p-3 border-b border-gray-700/50">
        <button
          onClick={onNew}
          disabled={!hasAgent}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-xs">
            No conversations yet
          </div>
        ) : (
          conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={`w-full p-3 text-left border-b border-gray-700/30 hover:bg-gray-700/50 transition-colors group ${
                selectedId === conv.id ? 'bg-gray-700/50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <p className="text-sm text-white truncate">{conv.title}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {conv.message_count || 0} messages
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                  className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
