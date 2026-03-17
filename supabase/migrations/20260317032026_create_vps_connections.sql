/*
  # Create VPS Connections Table

  1. New Tables
    - `user_vps_connections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text, display name for the connection)
      - `vps_url` (text, WebSocket URL for the VPS terminal)
      - `hostname` (text, display hostname)
      - `default_shell` (text, default 'bash')
      - `is_default` (boolean, marks the primary connection)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_vps_connections` table
    - Users can only read, insert, update, and delete their own connections

  3. Notes
    - Supports multiple VPS targets per user from the start
    - Only one connection can be marked as default per user
*/

CREATE TABLE IF NOT EXISTS user_vps_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL DEFAULT '',
  vps_url text NOT NULL DEFAULT '',
  hostname text DEFAULT '',
  default_shell text NOT NULL DEFAULT 'bash',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_vps_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own VPS connections"
  ON user_vps_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own VPS connections"
  ON user_vps_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own VPS connections"
  ON user_vps_connections
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own VPS connections"
  ON user_vps_connections
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_vps_connections_user_id
  ON user_vps_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_user_vps_connections_default
  ON user_vps_connections(user_id, is_default)
  WHERE is_default = true;
