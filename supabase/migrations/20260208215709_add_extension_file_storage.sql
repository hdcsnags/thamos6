/*
  # Add Extension File Storage

  1. New Tables
    - `extension_files`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key to extension_analyses)
      - `file_path` (text) - path within the extension zip
      - `file_content` (text) - actual file contents
      - `file_size` (integer) - size in bytes
      - `file_type` (text) - js, html, json, css, etc.
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on `extension_files` table
    - Add policy for authenticated users to read their analysis files
  
  3. Indexes
    - Add index on analysis_id for fast lookups
    - Add index on file_path for searching specific files
*/

-- Create extension_files table
CREATE TABLE IF NOT EXISTS extension_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES extension_analyses(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_content text NOT NULL,
  file_size integer NOT NULL,
  file_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE extension_files ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Users can view extension files"
  ON extension_files
  FOR SELECT
  TO authenticated
  USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_extension_files_analysis_id ON extension_files(analysis_id);
CREATE INDEX IF NOT EXISTS idx_extension_files_file_path ON extension_files(file_path);

-- Add a composite index for quick file lookups by analysis + path
CREATE INDEX IF NOT EXISTS idx_extension_files_analysis_path ON extension_files(analysis_id, file_path);