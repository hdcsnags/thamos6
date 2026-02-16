import { Bot, User, Loader2 } from 'lucide-react';
import type { Message } from '../../pages/AIWorkshop';

interface Props {
  messages: Message[];
  isSending: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export default function ChatMessages({ messages, isSending, messagesEndRef }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {msg.role === 'assistant' && (
            <div className="w-7 h-7 rounded-full bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-cyan-400" />
            </div>
          )}
          <div
            className={`max-w-[75%] rounded-lg px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-cyan-600/20 border border-cyan-500/30 text-white'
                : 'bg-gray-800 border border-gray-700/50 text-gray-200'
            }`}
          >
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed break-words">
              {msg.content}
            </pre>
            {msg.tokens_used > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                {msg.tokens_used} tokens{msg.model_used ? ` - ${msg.model_used}` : ''}
              </div>
            )}
          </div>
          {msg.role === 'user' && (
            <div className="w-7 h-7 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <User className="w-4 h-4 text-gray-300" />
            </div>
          )}
        </div>
      ))}
      {isSending && (
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center">
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="bg-gray-800 border border-gray-700/50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span className="text-sm text-gray-400">Thinking...</span>
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
