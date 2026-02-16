/*
  # Create AI Workshop Tables

  1. New Tables
    - `ai_agents` - Stores user-configurable AI agent profiles
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - Display name for the agent
      - `provider` (text) - AI provider: openai, anthropic, google
      - `model` (text) - Model identifier
      - `system_prompt` (text) - Custom system prompt
      - `temperature` (numeric) - Generation temperature
      - `max_tokens` (integer) - Max response tokens
      - `is_default` (boolean) - Whether this is the default agent
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `ai_conversations` - Stores chat conversation metadata
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `agent_id` (uuid, references ai_agents)
      - `title` (text) - Conversation title
      - `message_count` (integer) - Number of messages
      - `total_tokens` (integer) - Total tokens used
      - `last_message_at` (timestamptz)
      - `created_at` (timestamptz)

    - `ai_messages` - Stores individual chat messages
      - `id` (uuid, primary key)
      - `conversation_id` (uuid, references ai_conversations)
      - `role` (text) - user, assistant, or system
      - `content` (text) - Message content
      - `tokens_used` (integer) - Tokens for this message
      - `model_used` (text) - Model that generated this message
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all three tables
    - Users can only access their own agents, conversations, and messages
    - Separate SELECT, INSERT, UPDATE, DELETE policies

  3. Indexes
    - ai_conversations: user_id, agent_id, last_message_at
    - ai_messages: conversation_id, created_at
    - ai_agents: user_id
*/

-- AI Agents table
CREATE TABLE IF NOT EXISTS ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'openai',
  model text NOT NULL DEFAULT 'gpt-4o',
  system_prompt text NOT NULL DEFAULT 'You are a helpful AI assistant.',
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 4096,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agents"
  ON ai_agents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own agents"
  ON ai_agents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agents"
  ON ai_agents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own agents"
  ON ai_agents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_agents_user_id ON ai_agents(user_id);

-- AI Conversations table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New Conversation',
  message_count integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON ai_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON ai_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON ai_conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON ai_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_agent_id ON ai_conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_last_message ON ai_conversations(last_message_at DESC);

-- AI Messages table
CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL DEFAULT '',
  tokens_used integer NOT NULL DEFAULT 0,
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON ai_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE ai_conversations.id = ai_messages.conversation_id
      AND ai_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in own conversations"
  ON ai_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE ai_conversations.id = ai_messages.conversation_id
      AND ai_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own messages"
  ON ai_messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE ai_conversations.id = ai_messages.conversation_id
      AND ai_conversations.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created_at ON ai_messages(created_at ASC);
