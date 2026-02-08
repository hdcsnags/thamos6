/*
  # Add Mission Control Theme Support

  1. Changes
    - Extend `ui_theme` column check constraint to include 'mission-control'
    - Values: 'terminal', 'tactical', or 'mission-control'
    - Preserves existing user preferences

  2. Notes
    - Mission Control is the new "SOC operator" theme
    - Provides multi-panel dashboard with live monitoring
    - Default remains 'tactical' for existing users
*/

DO $$
BEGIN
  -- Drop the existing constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'profiles' AND constraint_name LIKE '%profiles_ui_theme_check%'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_ui_theme_check;
  END IF;

  -- Add new constraint that includes 'mission-control'
  ALTER TABLE profiles ADD CONSTRAINT profiles_ui_theme_check
    CHECK (ui_theme IN ('terminal', 'tactical', 'mission-control'));
END $$;
