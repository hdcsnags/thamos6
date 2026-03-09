/*
  # Create Extension Vault table

  1. New Tables
    - `extension_vault`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - owner of the vault entry
      - `extension_id` (text, not null) - Chrome Web Store extension ID
      - `extension_name` (text) - display name of the extension
      - `added_at` (timestamptz) - when the extension was added to the vault
      - `last_scanned_at` (timestamptz) - when the extension was last re-scanned
      - `baseline_analysis_id` (uuid, references extension_analyses) - first scan when vaulted
      - `latest_analysis_id` (uuid, references extension_analyses) - most recent scan
      - `notes` (text) - optional user notes about this vault entry

  2. Security
    - Enable RLS on `extension_vault` table
    - Add policies scoped to authenticated users via auth.uid() = user_id

  3. Indexes
    - Unique constraint on (user_id, extension_id) to prevent duplicate vault entries per user
    - Index on user_id for fast lookups

  4. Notes
    - The vault is per-user; each user tracks their own set of extensions
    - The edge function uses service_role_key so vault delta logic bypasses RLS
*/

CREATE TABLE IF NOT EXISTS extension_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  extension_id text NOT NULL,
  extension_name text DEFAULT '',
  added_at timestamptz DEFAULT now(),
  last_scanned_at timestamptz,
  baseline_analysis_id uuid REFERENCES extension_analyses(id),
  latest_analysis_id uuid REFERENCES extension_analyses(id),
  notes text DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_user_extension
  ON extension_vault (user_id, extension_id);

CREATE INDEX IF NOT EXISTS idx_vault_user_id
  ON extension_vault (user_id);

ALTER TABLE extension_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vault entries"
  ON extension_vault FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vault entries"
  ON extension_vault FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vault entries"
  ON extension_vault FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own vault entries"
  ON extension_vault FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
