/*
  # Add Theme System Support

  1. Changes
    - Add `theme` column to `profiles` table to store user's selected theme
    - Create `themes` table to store theme definitions and custom themes
    - Add RLS policies for theme access
    
  2. Security
    - Enable RLS on themes table
    - Users can read all active themes
    - Users can create/update/delete their own custom themes
    - Default themes are read-only (created by system)
*/

-- Add theme preference to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'theme'
  ) THEN
    ALTER TABLE profiles ADD COLUMN theme text DEFAULT 'dark';
  END IF;
END $$;

-- Create themes table if it doesn't exist
CREATE TABLE IF NOT EXISTS themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_name text NOT NULL,
  description text,
  is_system boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  config jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(name, created_by)
);

-- Enable RLS
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;

-- Policies for themes table
CREATE POLICY "Anyone can view active themes"
  ON themes FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can create their own themes"
  ON themes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    is_system = false
  );

CREATE POLICY "Users can update their own themes"
  ON themes FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by AND is_system = false)
  WITH CHECK (auth.uid() = created_by AND is_system = false);

CREATE POLICY "Users can delete their own themes"
  ON themes FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by AND is_system = false);

-- Insert default system themes
INSERT INTO themes (name, display_name, description, is_system, config) VALUES
  ('dark', 'Dark Mode', 'Classic dark theme with cyan accents', true, '{
    "primary": "#06b6d4",
    "background": "#0f172a",
    "surface": "#1e293b",
    "text": "#f1f5f9"
  }'::jsonb),
  ('light', 'Light Mode', 'Clean light theme', true, '{
    "primary": "#0891b2",
    "background": "#ffffff",
    "surface": "#f8fafc",
    "text": "#0f172a"
  }'::jsonb),
  ('midnight', 'Midnight', 'Deep black theme for OLED displays', true, '{
    "primary": "#22d3ee",
    "background": "#000000",
    "surface": "#0a0a0a",
    "text": "#e2e8f0"
  }'::jsonb),
  ('sunset', 'Sunset', 'Warm orange and pink theme', true, '{
    "primary": "#f97316",
    "background": "#1a1412",
    "surface": "#2d1f1a",
    "text": "#fef3c7"
  }'::jsonb),
  ('matrix', 'Matrix', 'Green terminal-style theme', true, '{
    "primary": "#10b981",
    "background": "#000000",
    "surface": "#001a00",
    "text": "#4ade80"
  }'::jsonb),
  ('cyberpunk', 'Cyberpunk', 'Neon pink and blue theme', true, '{
    "primary": "#ec4899",
    "background": "#0f0920",
    "surface": "#1a0f2e",
    "text": "#fbbf24"
  }'::jsonb)
ON CONFLICT (name, created_by) DO NOTHING;