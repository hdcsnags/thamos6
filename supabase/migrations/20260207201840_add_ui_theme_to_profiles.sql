/*
  # Add UI Theme Preference to Profiles

  1. Changes
    - Add `ui_theme` column to `profiles` table
      - Type: text
      - Default: 'tactical'
      - Values: 'terminal' or 'tactical'
      - Allows users to choose between terminal and tactical UI modes
  
  2. Notes
    - Existing `theme` column handles light/dark mode
    - New `ui_theme` column handles UI mode (terminal vs tactical)
    - Default is 'tactical' to preserve existing user experience
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'ui_theme'
  ) THEN
    ALTER TABLE profiles ADD COLUMN ui_theme text DEFAULT 'tactical' CHECK (ui_theme IN ('terminal', 'tactical'));
  END IF;
END $$;
